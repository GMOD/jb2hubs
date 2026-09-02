//! # bed2gff
//! A Rust BED-to-gff translator.
//!
//! ## Usage
//!
//! ```shell
//! bed2gff -b input.bed -i isoforms.txt -o output.gff
//! ```
//!
//! Where:
//! - `input.bed` is the input BED file you want to convert.
//! - `isoforms.txt` is a file that contains information about isoforms.
//! - `output.gff` is the output gff file where the conversion results will be
//!   stored.
//!
//! ## Output
//!
//! `bed2gff` produces gff files compliant with the GFF3 standard.
//! The resulting GFF file contains detailed annotations of genomic
//! features, including genes, transcripts, exons, coding
//! sequences (CDS), start codons, and stop codons.

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;

use clap::{self, Parser};
use flate2::write::GzEncoder;
use flate2::Compression;
use log::Level;
use rayon::prelude::*;

use bed2gff::*;

fn main() {
    let args = Cli::parse();
    args.check().unwrap_or_else(|e| {
        log::error!("{}", e);
        std::process::exit(1);
    });

    simple_logger::init_with_level(Level::Info).unwrap();

    rayon::ThreadPoolBuilder::new()
        .num_threads(args.threads)
        .build_global()
        .unwrap();

    let imap = if args.no_gene {
        HashMap::new()
    } else {
        let isf = reader(&args.isoforms.unwrap())
            .unwrap_or_else(|e| panic!("Error reading isoforms file: {e}"));
        get_isoforms(&isf)
    };

    let bed = bed_reader(&args.bed);
    let (chroms, chrom_ids) = intern_chroms(&bed);
    let record_chroms: Vec<u32> = bed.iter().map(|r| chrom_ids[r.chrom.as_str()]).collect();
    let genes_of_records = resolve_genes(&bed, &imap);
    let gene_entries = gene_entries(&bed, &record_chroms, &imap);

    let mut blocks: Vec<Line> = gene_entries
        .iter()
        .enumerate()
        .map(|(i, entry)| Line {
            chrom: entry.chrom,
            start: entry.start + 1,
            end: entry.end,
            owner: i as u32,
            seq: 0,
            feature: Feature::Gene,
            phase: b'.',
            exon: -1,
        })
        .collect();

    // Rows are emitted straight into one buffer rather than collected in
    // parallel: measured on criGriChoV1 xenoRefGene (7.8M rows), a rayon
    // collect was slower at every thread count and cost twice the memory,
    // because the emit is bandwidth-bound and the unindexed collect stages
    // every row a second time.
    blocks.reserve(bed.iter().map(|r| 5 + 2 * r.exon_count as usize).sum());
    for (i, record) in bed.iter().enumerate() {
        to_gff_into(record, i as u32, record_chroms[i], &mut blocks);
    }

    // `seq` makes the sort a total order over rows that share a start, so the
    // file is byte-reproducible. Comparing the chrom name per comparison is what
    // this replaces; the rank packed above the start does it in one integer
    // compare.
    for (i, line) in blocks.iter_mut().enumerate() {
        line.seq = i as u32;
    }
    blocks.par_sort_unstable_by_key(|line| {
        (((line.chrom as u64) << 32) | line.start as u64, line.seq)
    });

    let file = File::create(&args.output).unwrap();
    if args.gz {
        let mut out = GzEncoder::new(file, Compression::default());
        emit(
            &mut out,
            &blocks,
            &chroms,
            &bed,
            &genes_of_records,
            &gene_entries,
        );
        out.finish().unwrap();
    } else {
        let mut out = file;
        emit(
            &mut out,
            &blocks,
            &chroms,
            &bed,
            &genes_of_records,
            &gene_entries,
        );
        out.flush().unwrap();
    }

    // The output is on disk; tearing down millions of rows and their records
    // afterwards is pure cost.
    std::process::exit(0);
}

fn emit(
    out: &mut dyn Write,
    blocks: &[Line],
    chroms: &[&str],
    bed: &[BedRecord],
    genes_of_records: &[&str],
    gene_entries: &[GeneEntry<'_>],
) {
    comments(out).unwrap();
    write_lines(out, blocks, chroms, bed, genes_of_records, gene_entries).unwrap();
}

/// The gene each record belongs to, resolved once instead of per output row.
fn resolve_genes<'a>(bed: &'a [BedRecord], isoforms: &'a HashMap<String, String>) -> Vec<&'a str> {
    bed.iter()
        .map(|record| {
            if isoforms.is_empty() {
                return record.name.as_str();
            }
            match isoforms.get(&record.name) {
                Some(gene) => gene.as_str(),
                None => {
                    log::error!("Gene {} not found in isoforms file.", record.name);
                    std::process::exit(1)
                }
            }
        })
        .collect()
}

fn to_gff_into(bedline: &BedRecord, owner: u32, chrom: u32, result: &mut Vec<Line>) {
    let ctx = RowContext {
        record: bedline,
        owner,
        chrom,
    };

    let frames = bedline.get_frames();
    let fcodon = first_codon(bedline, &frames)
        .unwrap_or_else(|| panic!("No start codon found for {}.", bedline.name));
    let lcodon = last_codon(bedline, &frames)
        .unwrap_or_else(|| panic!("No stop codon found for {}.", bedline.name));

    let cds_end: u32 = if bedline.strand == "+" && codon_complete(&lcodon) {
        move_pos(bedline, lcodon.end, -3)
    } else {
        bedline.cds_end
    };

    let cds_start = if bedline.strand == "-" && codon_complete(&fcodon) {
        move_pos(bedline, fcodon.start, 3)
    } else {
        bedline.cds_start
    };

    build_gff_line(
        ctx,
        Feature::Transcript,
        bedline.tx_start,
        bedline.tx_end,
        3,
        -1,
        result,
    );

    for (i, &frame) in frames.iter().enumerate() {
        build_gff_line(
            ctx,
            Feature::Exon,
            bedline.exon_start[i],
            bedline.exon_end[i],
            3,
            i as i16,
            result,
        );
        if cds_start < cds_end {
            write_features(ctx, i, cds_start, cds_end, frame as u32, result);
        }
    }

    let (start, stop) = if bedline.strand == "-" {
        (lcodon, fcodon)
    } else {
        (fcodon, lcodon)
    };
    if codon_complete(&start) {
        write_codon(ctx, Feature::StartCodon, start, result);
    }
    if codon_complete(&stop) {
        write_codon(ctx, Feature::StopCodon, stop, result);
    }
}

fn move_pos(record: &BedRecord, pos: u32, dist: i32) -> u32 {
    let mut pos = pos;
    assert!(record.tx_start <= pos && pos <= record.tx_end);

    let mut exon_index = record
        .exon_start
        .iter()
        .zip(record.exon_end.iter())
        .position(|(start, end)| pos >= *start && pos <= *end)
        .unwrap_or_else(|| panic!("Position {pos} not in exons.")) as i16;

    let mut steps = dist.abs();
    let direction = if dist >= 0 { 1 } else { -1 };

    while steps > 0 {
        let (exon_start, exon_end) = (
            record.exon_start[exon_index as usize],
            record.exon_end[exon_index as usize],
        );

        if pos >= exon_start && pos <= exon_end {
            pos += direction as u32;
            steps -= 1;
        } else if direction >= 0 {
            exon_index += 1;
            if (exon_index as usize) < record.exon_count as usize {
                pos = record.exon_start[exon_index as usize];
            }
        } else {
            exon_index -= 1;
            if exon_index >= 0 {
                pos = record.exon_end[exon_index as usize] - 1;
                steps -= 1;
            }
        }
    }
    if steps > 0 {
        panic!("can't move {pos} by {dist}");
    }
    pos
}
