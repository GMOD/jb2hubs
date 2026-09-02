use crate::bed::BedRecord;
use crate::lines::{exon_numbering, Feature, Line};

use std::io::{self, Write};

const SOURCE: &str = "bed2gff";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const GFF3: &str = "##gff-version 3";
const REPOSITORY: &str = "github.com/alejandrogzi/bed2gff";

const FLUSH_AT: usize = 1 << 20;

/// A gene row's own columns. Gene rows have no BED record behind them -- they
/// are the min/max span of every transcript the isoforms file assigns to the
/// gene -- so `Line::owner` indexes this instead.
pub struct GeneEntry<'a> {
    pub gene: &'a str,
    pub chrom: u32,
    pub start: u32,
    pub end: u32,
    pub strand: &'a str,
}

pub fn push_u32(out: &mut Vec<u8>, mut value: u32) {
    let mut digits = [0u8; 10];
    let mut i = digits.len();
    loop {
        i -= 1;
        digits[i] = b'0' + (value % 10) as u8;
        value /= 10;
        if value == 0 {
            break;
        }
    }
    out.extend_from_slice(&digits[i..]);
}

pub fn push_i16(out: &mut Vec<u8>, value: i16) {
    if value < 0 {
        out.push(b'-');
        push_u32(out, (value as i32).unsigned_abs());
    } else {
        push_u32(out, value as u32);
    }
}

pub fn attributes(out: &mut Vec<u8>, line: Line, record: &BedRecord, gene: &str) {
    let name = record.name.as_str();

    if line.feature == Feature::Transcript {
        // Name is the transcript id (not the gene). Without an explicit Name,
        // consumers like JBrowse fall back to gene_id and every transcript ends
        // up labeled with the parent gene's name.
        for part in [
            "ID=",
            name,
            ";Parent=",
            gene,
            ";Name=",
            name,
            ";gene_id=",
            gene,
            ";transcript_id=",
            name,
        ] {
            out.extend_from_slice(part.as_bytes());
        }
        return;
    }

    let (exon_id, exon_number) = exon_numbering(record, line.exon);

    out.extend_from_slice(b"ID=");
    out.extend_from_slice(line.feature.name().as_bytes());
    out.push(b':');
    out.extend_from_slice(name.as_bytes());
    out.push(b'.');
    push_u32(out, exon_id as u32);
    for part in [
        ";Parent=",
        name,
        ";gene_id=",
        gene,
        ";transcript_id=",
        name,
        ";exon_number=",
    ] {
        out.extend_from_slice(part.as_bytes());
    }
    push_i16(out, exon_number);
}

fn push_row(
    out: &mut Vec<u8>,
    chrom: &str,
    feature: &str,
    start: u32,
    end: u32,
    strand: &str,
    phase: u8,
) {
    out.extend_from_slice(chrom.as_bytes());
    out.push(b'\t');
    out.extend_from_slice(SOURCE.as_bytes());
    out.push(b'\t');
    out.extend_from_slice(feature.as_bytes());
    out.push(b'\t');
    push_u32(out, start);
    out.push(b'\t');
    push_u32(out, end);
    out.extend_from_slice(b"\t.\t");
    out.extend_from_slice(strand.as_bytes());
    out.push(b'\t');
    out.push(phase);
    out.push(b'\t');
}

pub fn comments(out: &mut dyn Write) -> io::Result<()> {
    writeln!(out, "{GFF3}")?;
    writeln!(out, "#provider: {SOURCE}")?;
    writeln!(out, "#version: {VERSION}")?;
    writeln!(out, "#contact: {REPOSITORY}")
}

pub fn write_lines(
    out: &mut dyn Write,
    lines: &[Line],
    chroms: &[&str],
    records: &[BedRecord],
    genes_of_records: &[&str],
    gene_entries: &[GeneEntry<'_>],
) -> io::Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(FLUSH_AT * 2);

    for &line in lines {
        let chrom = chroms[line.chrom as usize];

        if line.feature == Feature::Gene {
            let entry = &gene_entries[line.owner as usize];
            push_row(
                &mut buf,
                chrom,
                "gene",
                line.start,
                line.end,
                entry.strand,
                line.phase,
            );
            for part in ["ID=", entry.gene, ";gene_id=", entry.gene] {
                buf.extend_from_slice(part.as_bytes());
            }
        } else {
            let record = &records[line.owner as usize];
            push_row(
                &mut buf,
                chrom,
                line.feature.name(),
                line.start,
                line.end,
                &record.strand,
                line.phase,
            );
            attributes(
                &mut buf,
                line,
                record,
                genes_of_records[line.owner as usize],
            );
        }

        buf.push(b'\n');

        if buf.len() >= FLUSH_AT {
            out.write_all(&buf)?;
            buf.clear();
        }
    }

    out.write_all(&buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integers_round_trip() {
        for value in [0u32, 7, 10, 4294967295] {
            let mut out = Vec::new();
            push_u32(&mut out, value);
            assert_eq!(String::from_utf8(out).unwrap(), value.to_string());
        }
        for value in [0i16, -1, i16::MIN, i16::MAX] {
            let mut out = Vec::new();
            push_i16(&mut out, value);
            assert_eq!(String::from_utf8(out).unwrap(), value.to_string());
        }
    }
}
