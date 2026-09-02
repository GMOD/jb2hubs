use crate::bed::BedRecord;
use crate::codon::*;

use std::cmp::{max, min};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Feature {
    Gene,
    Transcript,
    Exon,
    Cds,
    StartCodon,
    StopCodon,
}

impl Feature {
    pub fn name(self) -> &'static str {
        match self {
            Feature::Gene => "gene",
            Feature::Transcript => "transcript",
            Feature::Exon => "exon",
            Feature::Cds => "CDS",
            Feature::StartCodon => "start_codon",
            Feature::StopCodon => "stop_codon",
        }
    }
}

/// One GFF row, 24 bytes and no heap allocation. Everything the row prints is
/// either here or derivable from the record `owner` points at, so the attribute
/// column is formatted once at write time instead of being carried through the
/// sort. `exon` is the raw index `write_codon` passes, which is not always an
/// exon ordinal -- see `attributes`.
#[derive(Debug, Clone, Copy)]
pub struct Line {
    pub chrom: u32,
    pub start: u32,
    pub end: u32,
    pub owner: u32,
    pub seq: u32,
    pub feature: Feature,
    pub phase: u8,
    pub exon: i16,
}

pub fn phase_of(frame: u32) -> u8 {
    match frame {
        0 => b'0',
        1 => b'2',
        2 => b'1',
        _ => b'.',
    }
}

/// The `(exon_id, exon_number)` pair `build_gff_line` used to format inline.
/// Minus-strand ids are a wrapping `u16` subtraction because `write_codon`'s
/// second call passes a base count rather than an exon index, and the release
/// binary has always wrapped there.
pub fn exon_numbering(record: &BedRecord, exon: i16) -> (u16, i16) {
    if record.strand == "+" {
        ((exon + 1) as u16, exon + 1)
    } else {
        let exon_id = record.exon_count.wrapping_sub(exon as u16);
        (exon_id, exon_id as i16)
    }
}

/// What every row of one BED record shares: the record itself, its index (which
/// is how a row finds it again at write time) and its chrom rank.
#[derive(Clone, Copy)]
pub struct RowContext<'a> {
    pub record: &'a BedRecord,
    pub owner: u32,
    pub chrom: u32,
}

pub fn build_gff_line(
    ctx: RowContext<'_>,
    feature: Feature,
    exon_start: u32,
    exon_end: u32,
    frame: u32,
    exon: i16,
    result: &mut Vec<Line>,
) {
    assert!(ctx.record.tx_start < ctx.record.tx_end);

    result.push(Line {
        chrom: ctx.chrom,
        start: exon_start + 1,
        end: exon_end,
        owner: ctx.owner,
        seq: 0,
        feature,
        phase: phase_of(frame),
        exon,
    });
}

pub fn write_features(
    ctx: RowContext<'_>,
    i: usize,
    cds_start: u32,
    cds_end: u32,
    frame: u32,
    result: &mut Vec<Line>,
) {
    let exon_start = ctx.record.exon_start[i];
    let exon_end = ctx.record.exon_end[i];

    if ctx.record.cds_start < exon_end && exon_start < ctx.record.cds_end {
        let start = max(exon_start, cds_start);
        let end = min(exon_end, cds_end);

        if start < end {
            build_gff_line(ctx, Feature::Cds, start, end, frame, i as i16, result);
        }
    }
}

pub fn write_codon(ctx: RowContext<'_>, feature: Feature, codon: Codon, result: &mut Vec<Line>) {
    build_gff_line(
        ctx,
        feature,
        codon.start,
        codon.end,
        0,
        codon.index as i16,
        result,
    );

    if codon.start2 < codon.end2 {
        build_gff_line(
            ctx,
            feature,
            codon.start,
            codon.end,
            codon.start2,
            (codon.end - codon.start) as i16,
            result,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::writer::attributes;

    fn record() -> BedRecord {
        BedRecord {
            chrom: "chr1".to_string(),
            tx_start: 1000,
            tx_end: 5000,
            name: "ENST1".to_string(),
            strand: "+".to_string(),
            cds_start: 1200,
            cds_end: 4800,
            exon_count: 1,
            exon_start: vec![1000],
            exon_end: vec![5000],
        }
    }

    // The transcript feature must carry Name=<transcript id>, so consumers don't
    // fall back to gene_id and label every transcript with the parent gene.
    #[test]
    fn transcript_name_is_transcript_id() {
        let r = record();
        let ctx = RowContext {
            record: &r,
            owner: 0,
            chrom: 0,
        };
        let mut result = Vec::new();
        build_gff_line(
            ctx,
            Feature::Transcript,
            r.tx_start,
            r.tx_end,
            3,
            -1,
            &mut result,
        );

        let mut attr = Vec::new();
        attributes(&mut attr, result[0], &r, "GENEA");
        assert_eq!(
            String::from_utf8(attr).unwrap(),
            "ID=ENST1;Parent=GENEA;Name=ENST1;gene_id=GENEA;transcript_id=ENST1"
        );
    }

    #[test]
    fn exon_attributes_number_from_the_strand() {
        let mut r = record();
        r.exon_count = 3;
        let mut result = Vec::new();
        build_gff_line(
            RowContext {
                record: &r,
                owner: 0,
                chrom: 0,
            },
            Feature::Exon,
            1000,
            2000,
            3,
            0,
            &mut result,
        );
        r.strand = "-".to_string();
        build_gff_line(
            RowContext {
                record: &r,
                owner: 0,
                chrom: 0,
            },
            Feature::Exon,
            1000,
            2000,
            3,
            0,
            &mut result,
        );

        let mut plus = Vec::new();
        attributes(&mut plus, result[0], &record(), "GENEA");
        assert!(String::from_utf8(plus).unwrap().ends_with("exon_number=1"));

        let mut minus = Vec::new();
        attributes(&mut minus, result[1], &r, "GENEA");
        let minus = String::from_utf8(minus).unwrap();
        assert!(minus.starts_with("ID=exon:ENST1.3;"), "{minus}");
        assert!(minus.ends_with("exon_number=3"), "{minus}");
    }
}
