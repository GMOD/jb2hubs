use std::cmp::{max, min};

#[derive(Debug, PartialEq)]
pub struct BedRecord {
    pub chrom: String,
    pub tx_start: u32,
    pub tx_end: u32,
    pub name: String,
    pub strand: String,
    pub cds_start: u32,
    pub cds_end: u32,
    pub exon_count: u16,
    pub exon_start: Vec<u32>,
    pub exon_end: Vec<u32>,
}

fn field(s: &str) -> Result<u32, &'static str> {
    s.parse::<u32>().map_err(|_| "Cannot parse field")
}

impl BedRecord {
    pub fn parse(line: &str) -> Result<BedRecord, &'static str> {
        let mut fields = [""; 12];
        let mut count = 0;
        for f in line.split('\t') {
            if count < 12 {
                fields[count] = f;
            }
            count += 1;
        }
        if count < 12 {
            return Err("Bed line has less than 12 fields and cannot be parsed into a BedRecord");
        }

        let tx_start = field(fields[1])?;
        let tx_end = field(fields[2])?;
        let cds_start = field(fields[6])?;
        let cds_end = field(fields[7])?;
        let exon_count = field(fields[9])? as u16;

        let mut exon_start = Vec::with_capacity(exon_count as usize);
        for num in fields[11].split(',').filter(|n| !n.is_empty()) {
            exon_start.push(tx_start + field(num)?);
        }

        let mut exon_end = Vec::with_capacity(exon_count as usize);
        for num in fields[10].split(',').filter(|n| !n.is_empty()) {
            exon_end.push(field(num)?);
        }

        if exon_start.len() != exon_end.len() {
            return Err("Exon start and end vectors have different lengths");
        }

        for (end, &start) in exon_end.iter_mut().zip(exon_start.iter()) {
            *end += start;
        }

        Ok(BedRecord {
            chrom: fields[0].to_string(),
            tx_start,
            tx_end,
            name: fields[3].to_string(),
            strand: fields[5].to_string(),
            cds_start,
            cds_end,
            exon_count,
            exon_start,
            exon_end,
        })
    }

    pub fn get_frames(&self) -> Vec<i16> {
        let mut exon_frames: Vec<i16> = vec![0; self.exon_count as usize];
        let mut cds: u32 = 0;

        let plus = self.strand == "+";
        for i in 0..(self.exon_count as usize) {
            let exon = if plus {
                i
            } else {
                self.exon_count as usize - 1 - i
            };

            let cds_exon_start = max(self.exon_start[exon], self.cds_start);
            let cds_exon_end = min(self.exon_end[exon], self.cds_end);

            if cds_exon_start < cds_exon_end {
                exon_frames[exon] = (cds % 3) as i16;
                cds += cds_exon_end - cds_exon_start;
            } else {
                exon_frames[exon] = -1;
            }
        }

        exon_frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_record() {
        let line =
            "chr15\t81000922\t81005788\tENST00000267984\t0\t+\t81002271\t81003360\t0\t1\t4866,\t0,";
        let record = BedRecord::parse(line).unwrap();

        assert_eq!(record.chrom, "chr15");
        assert_eq!(record.tx_start, 81000922);
        assert_eq!(record.tx_end, 81005788);
        assert_eq!(record.name, "ENST00000267984");
        assert_eq!(record.strand, "+");
        assert_eq!(record.cds_start, 81002271);
        assert_eq!(record.cds_end, 81003360);
        assert_eq!(record.exon_count, 1);
        assert_eq!(record.exon_start, vec![81000922]);
        assert_eq!(record.exon_end, vec![81005788]);
    }

    #[test]
    fn get_exon_frames() {
        let line = "chr11\t13934505\t13958243\tENST00000674667\t1000\t-\t13934505\t13958243\t0,0,200\t9\t224,217,228,198,149,142,115,157,49,\t0,1305,2811,5576,10085,14837,18016,19498,23689,";
        let record = BedRecord::parse(line).unwrap();

        assert_eq!(record.get_frames(), vec![1, 0, 0, 0, 1, 0, 2, 1, 0]);
    }

    #[test]
    fn invalid_record() {
        let line =
            "chr15\t81000922\t81005788\tENST00000267984\t0\t+\t81002271\t81003360\t0\t1\t4866,";
        let record = BedRecord::parse(line);

        assert_eq!(
            record,
            Err("Bed line has less than 12 fields and cannot be parsed into a BedRecord")
        );
    }

    #[test]
    fn empty_record() {
        let line = "";
        let record = BedRecord::parse(line);

        assert_eq!(
            record,
            Err("Bed line has less than 12 fields and cannot be parsed into a BedRecord")
        );
    }

    // Exons are stored absolute, so a start list shorter than the size list must
    // be refused before the offsets are applied rather than indexing past it.
    #[test]
    fn mismatched_exon_lists() {
        let line = "chr1\t0\t100\tA\t0\t+\t0\t100\t0\t2\t10,20,\t0,";
        assert_eq!(
            BedRecord::parse(line),
            Err("Exon start and end vectors have different lengths")
        );
    }
}
