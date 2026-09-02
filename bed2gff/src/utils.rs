use crate::bed::BedRecord;
use crate::writer::GeneEntry;

use rayon::prelude::*;

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, Read};
use std::path::PathBuf;

pub fn bed_reader(file: &PathBuf) -> Vec<BedRecord> {
    let bed = reader(file).unwrap();
    parallel_parse(&bed).unwrap()
}

pub fn get_isoforms(file: &str) -> HashMap<String, String> {
    let pairs = parallel_hash_rev(file);

    if pairs.is_empty() {
        eprintln!("Fail: BED file could not be converted. Please check your isoforms file.");
        std::process::exit(1);
    }
    pairs
}

pub fn reader(file: &PathBuf) -> io::Result<String> {
    let mut file = File::open(file)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

pub fn parallel_hash_rev(s: &str) -> HashMap<String, String> {
    s.par_lines()
        .filter_map(|line| {
            let mut words = line.split_whitespace();
            let gene = words.next()?;
            let transcript = words.next()?;
            Some((transcript.to_owned(), gene.to_owned()))
        })
        .collect()
}

pub fn parallel_parse(s: &str) -> Result<Vec<BedRecord>, &'static str> {
    s.par_lines().map(BedRecord::parse).collect()
}

/// Distinct chrom names in the order the output is sorted by, so a row carries
/// a rank rather than a name and the sort compares integers instead of running
/// `natord` over a string on every comparison. Natural order alone is not a
/// total order -- it calls "chr1" and "chr01" equal -- so distinct names that
/// tie fall back to byte order, which keeps each chrom's rows contiguous.
pub fn intern_chroms(records: &[BedRecord]) -> (Vec<&str>, HashMap<&str, u32>) {
    let unique: HashSet<&str> = records.iter().map(|r| r.chrom.as_str()).collect();
    let mut names: Vec<&str> = unique.into_iter().collect();
    names.sort_unstable_by(|a, b| natord::compare(a, b).then_with(|| a.cmp(b)));

    let ids = names
        .iter()
        .enumerate()
        .map(|(rank, &name)| (name, rank as u32))
        .collect();
    (names, ids)
}

/// The gene rows: one per (gene, chrom) the isoforms file maps a transcript to,
/// spanning every transcript of that gene on that chrom. Records are visited in
/// BED order and only the first occurrence of a transcript name counts, so the
/// strand a gene inherits from its first transcript is reproducible rather than
/// whichever one a hash map happened to yield first.
pub fn gene_entries<'a>(
    records: &'a [BedRecord],
    chrom_ids: &[u32],
    isoforms: &'a HashMap<String, String>,
) -> Vec<GeneEntry<'a>> {
    let mut entries: Vec<GeneEntry<'a>> = Vec::new();
    let mut index: HashMap<(&str, u32), usize> = HashMap::new();
    let mut seen: HashSet<&str> = HashSet::with_capacity(records.len());

    for (i, record) in records.iter().enumerate() {
        if !seen.insert(record.name.as_str()) {
            continue;
        }
        let Some(gene) = isoforms.get(&record.name) else {
            continue;
        };

        let chrom = chrom_ids[i];
        match index.entry((gene.as_str(), chrom)) {
            std::collections::hash_map::Entry::Occupied(slot) => {
                let entry = &mut entries[*slot.get()];
                entry.start = entry.start.min(record.tx_start);
                entry.end = entry.end.max(record.tx_end);
            }
            std::collections::hash_map::Entry::Vacant(slot) => {
                slot.insert(entries.len());
                entries.push(GeneEntry {
                    gene: gene.as_str(),
                    chrom,
                    start: record.tx_start,
                    end: record.tx_end,
                    strand: record.strand.as_str(),
                });
            }
        }
    }

    entries.sort_unstable_by_key(|e| (e.chrom, e.start, e.gene));
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bed(lines: &[&str]) -> Vec<BedRecord> {
        lines.iter().map(|l| BedRecord::parse(l).unwrap()).collect()
    }

    #[test]
    fn chroms_rank_naturally_and_stay_distinct() {
        let records = bed(&[
            "chr10\t0\t10\tA\t0\t+\t0\t10\t0\t1\t10,\t0,",
            "chr2\t0\t10\tB\t0\t+\t0\t10\t0\t1\t10,\t0,",
            "chr02\t0\t10\tC\t0\t+\t0\t10\t0\t1\t10,\t0,",
        ]);
        let (names, ids) = intern_chroms(&records);

        assert_eq!(names, vec!["chr02", "chr2", "chr10"]);
        assert_eq!(ids["chr02"], 0);
        assert_eq!(ids["chr10"], 2);
    }

    // A gene spans its transcripts, and only on the chrom they share: two
    // transcripts of one gene on different chroms are two gene rows.
    #[test]
    fn genes_span_their_transcripts_per_chrom() {
        let records = bed(&[
            "chr1\t100\t200\tT1\t0\t+\t100\t200\t0\t1\t100,\t0,",
            "chr1\t150\t400\tT2\t0\t-\t150\t400\t0\t1\t250,\t0,",
            "chr2\t900\t950\tT3\t0\t+\t900\t950\t0\t1\t50,\t0,",
        ]);
        let (_, ids) = intern_chroms(&records);
        let chrom_ids: Vec<u32> = records.iter().map(|r| ids[r.chrom.as_str()]).collect();

        let isoforms = ["T1", "T2", "T3"]
            .iter()
            .map(|t| (t.to_string(), "G".to_string()))
            .collect();
        let entries = gene_entries(&records, &chrom_ids, &isoforms);

        assert_eq!(entries.len(), 2);
        assert_eq!((entries[0].start, entries[0].end), (100, 400));
        assert_eq!(entries[0].strand, "+");
        assert_eq!((entries[1].start, entries[1].end), (900, 950));
    }

    // A repeated transcript name contributes once, from its first row, which is
    // what makes the gene span independent of hash iteration order.
    #[test]
    fn repeated_transcript_names_count_once() {
        let records = bed(&[
            "chr1\t100\t200\tT1\t0\t+\t100\t200\t0\t1\t100,\t0,",
            "chr1\t100\t9000\tT1\t0\t+\t100\t9000\t0\t1\t8900,\t0,",
        ]);
        let (_, ids) = intern_chroms(&records);
        let chrom_ids: Vec<u32> = records.iter().map(|r| ids[r.chrom.as_str()]).collect();
        let isoforms = [("T1".to_string(), "G".to_string())].into_iter().collect();

        let entries = gene_entries(&records, &chrom_ids, &isoforms);
        assert_eq!((entries[0].start, entries[0].end), (100, 200));
    }
}
