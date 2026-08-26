use crate::bed::BedRecord;
use std::cmp::{max, min};

#[derive(Debug, Clone)]
pub struct Codon {
    pub start: u32,
    pub end: u32,
    pub index: u32,
    pub start2: u32,
    pub end2: u32,
}

impl Codon {
    pub fn new() -> Codon {
        Codon {
            start: 0,
            end: 0,
            index: 0,
            start2: 0,
            end2: 0,
        }
    }
}

pub fn first_codon(record: &BedRecord) -> Option<Codon> {
    let exon_frames = record.get_frames();
    record
        .exon_start
        .iter()
        .zip(record.exon_end.iter())
        .enumerate()
        .find_map(|(mut index, (&start, &end))| {
            let frame = exon_frames.get(index)?;
            let mut codon = Codon::new();

            if *frame < 0 {
                return Some(codon);
            }

            let cds_start = max(start, record.cds_start);
            let cds_end = min(end, record.cds_end);

            let frame = if record.strand == "+" {
                *frame
            } else {
                (*frame + (cds_end - cds_start) as i16) % 3
            };

            if frame == 0 {
                codon.start = cds_start;
                codon.end = cds_start + 3;
                codon.index = index as u32;
                let diff = cds_end - cds_start;

                if diff >= 3 {
                    Some(codon)
                } else {
                    index += 1;
                    if index >= exon_frames.len() {
                        Some(codon)
                    } else {
                        let need = 3 - diff;
                        if diff < need {
                            Some(codon)
                        } else {
                            codon.start2 = cds_start;
                            codon.end2 = cds_start + need;
                            Some(codon)
                        }
                    }
                }
            } else {
                Some(Codon::new())
            }
        })
}

pub fn last_codon(record: &BedRecord) -> Option<Codon> {
    let exon_frames = record.get_frames();
    record
        .exon_start
        .iter()
        .zip(record.exon_end.iter())
        .enumerate()
        .rev() // Reverse the iterator to start from the last exon
        .find_map(|(mut index, (&start, &end))| {
            let mut codon = Codon::new();
            let frame = exon_frames.get(index)?;
            let cds_start = max(start, record.cds_start);
            let cds_end = min(end, record.cds_end);

            let frame = if record.strand == "+" {
                (*frame + (cds_end - cds_start) as i16) % 3
            } else {
                *frame
            };

            if frame == 0 {
                // saturating, because `cds_end - 3` underflows for a CDS that
                // ends within 3bp of the contig start -- criGriChoV1
                // xenoRefGene NM_207404 is cdsStart=0, cdsEnd=1 -- and in
                // release mode that wraps to ~4.29e9 rather than panicking.
                // The same wrap then makes codon_complete below compute
                // exactly 3, so the codon passed the completeness gate and one
                // GFF line reading `4294967295 .. 1` reached the file. tabix
                // refuses to index it, so the 80MB gff.gz shipped with no .csi
                // beside it.
                codon.start = max(cds_start, cds_end.saturating_sub(3)); // last 3 bases of the CDS
                codon.end = cds_end;
                codon.index = index as u32;
                let diff = cds_end - cds_start;

                if diff >= 3 {
                    Some(codon)
                } else {
                    index += 1;
                    if index >= exon_frames.len() {
                        Some(codon)
                    } else {
                        let need = 3 - diff;
                        if diff < need {
                            Some(codon)
                        } else {
                            codon.start2 = cds_start;
                            codon.end2 = cds_start + need;
                            Some(codon)
                        }
                    }
                }
            } else {
                Some(Codon::new())
            }
        })
}

// Checked, not bare subtraction. This is the gate deciding whether a codon is
// written at all, so an underflow here does not merely produce a wrong number --
// it wraps to a value that passes, and an unindexable record reaches the gff. An
// inverted interval is not a complete codon under any reading.
pub fn codon_complete(codon: &Codon) -> bool {
    match (
        codon.end.checked_sub(codon.start),
        codon.end2.checked_sub(codon.start2),
    ) {
        (Some(len), Some(len2)) => len + len2 == 3,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bed::BedRecord;

    // criGriChoV1 xenoRefGene NM_207404, verbatim: a minus-strand alignment
    // truncated at the start of scaffold NW_003684908v1, leaving a 1bp CDS
    // (cdsStart=0, cdsEnd=1). One base cannot hold a codon, so nothing should
    // be emitted -- but `cds_end - 3` used to wrap to u32::MAX - 1, and the
    // same wrap made codon_complete compute exactly 3, so a
    // `start_codon 4294967295 .. 1` line reached the gff and tabix refused to
    // index the whole 80MB file.
    #[test]
    fn truncated_cds_at_contig_start_emits_no_codon() {
        let line = "NW_003684908v1\t0\t88\tNM_207404\t0\t-\t0\t1\t0\t1\t88,\t0,";
        let record = BedRecord::parse(line).unwrap();

        let codon = last_codon(&record).unwrap();

        assert!(
            codon.start <= codon.end,
            "codon interval inverted: {} .. {}",
            codon.start,
            codon.end
        );
        assert!(!codon_complete(&codon));
    }

    // The wrap is only fatal because it lands on 3. Pin the gate itself, so a
    // future underflow anywhere upstream is refused rather than laundered.
    #[test]
    fn codon_complete_rejects_inverted_intervals() {
        let inverted = Codon {
            start: u32::MAX - 1,
            end: 1,
            index: 0,
            start2: 0,
            end2: 0,
        };
        assert!(!codon_complete(&inverted));

        let inverted2 = Codon {
            start: 0,
            end: 3,
            index: 0,
            start2: 10,
            end2: 4,
        };
        assert!(!codon_complete(&inverted2));
    }

    // The fix must not cost an ordinary codon: a plain single-exon minus-strand
    // CDS with room to spare still yields the last three coding bases.
    #[test]
    fn ordinary_cds_still_yields_its_last_codon() {
        let line = "chr1\t1000\t5000\tNM_1\t0\t-\t1200\t4800\t0\t1\t4000,\t0,";
        let record = BedRecord::parse(line).unwrap();

        let codon = last_codon(&record).unwrap();

        assert_eq!((codon.start, codon.end), (4797, 4800));
        assert!(codon_complete(&codon));
    }
}
