# Vendored bed2gff

This is our fork of `bed2gff`, brought into the monorepo so the gene-track build
no longer depends on a binary installed in `$HOME`. **This repo is now the
maintained home of the fork** — edit the Rust source here directly.

Originally imported from:

- https://github.com/cmdcolin/bed2gff @ 6f5f547b40a6873235fb076a935a2ceb68c97e39
- Original project: https://github.com/alejandrogzi/bed2gff3 (MIT, see LICENSE)

We no longer track or sync with those repos; the source here is authoritative.

## Build

```
cargo build --release        # from this directory
# or, from the repo root:
pnpm build:bed2gff
```

The release binary lands at `bed2gff/target/release/bed2gff`, which
`ucsc2jbrowse/createGeneTracksForGoldenPath.sh` resolves automatically. The
`target/` directory is gitignored.

## What the fork changed

Beyond the `last_codon` underflow fix (`src/codon.rs`), the converter was
rewritten around a 24-byte row. Every output line used to be a
`(String, String, u32, u32, String, String, String)` — five heap allocations per
line, carried through the sort — so a run held ~20M live allocations and the
`natord` chrom comparison ran on every one of the sort's comparisons. A row now
stores a chrom *rank*, the index of the BED record it came from, and the phase;
the attribute column is formatted once at write time, and the sort is a single
integer compare. Measured single-threaded, output on tmpfs:

| input                                 | before          | after         |
| ------------------------------------- | --------------- | ------------- |
| hg38 xenoRefGene (4.1M rows)          | 5.5 s / 2608 MB | 0.8 s / 207 MB |
| criGriChoV1 xenoRefGene (7.8M rows)   | 13.2 s / 4986 MB | 1.7 s / 435 MB |

Two of those wins are not about the row layout, and are worth not undoing:

- **The rows are emitted sequentially**, into one reserved buffer. A rayon
  collect was slower at *every* thread count (1.6 s vs 1.0 s at `-t8`) and cost
  twice the memory: the emit is bandwidth-bound, and an unindexed parallel
  collect stages every row into per-thread vectors before merging them.
- **`main` ends in `process::exit`**, after the writer is flushed and a gzip
  stream is finished explicitly. Dropping millions of rows and their records
  once the file is on disk was ~2.5 s of the old run.

`get_frames` is computed once per record and passed to `first_codon` /
`last_codon`, which used to recompute it; that is why both take an
`exon_frames` slice.

### The output is now byte-reproducible, and gene rows can differ from old runs

The old sort compared `(chrom, start)` only, so rows sharing a start came out in
whatever order pdqsort left them, and gene rows entered the sort in hash-map
order. Two runs over the same BED produced different files. Each row now carries
its emission index as a final tiebreaker, and gene rows are built by walking the
BED in order rather than by iterating a `HashMap`, so a run is reproducible and
a parent sorts ahead of its children.

That makes one real output change: a gene whose transcripts sit on **both**
strands used to inherit the strand of whichever transcript the hash map yielded
first, and now inherits its first transcript's in BED order. Checked over 10
UCSC gene tables (~25M rows, hg38/mm39/danRer11/galGal6/dm6/ce11/sacCer3/
criGriChoV1), that is the *only* difference: every other row is identical, and
each differing row pairs with one identical in all eight other columns. The old
counts differ between two baseline runs of the same input, which is the
nondeterminism this removes.

`bed2gff/src` is in `DERIVATION_SOURCES`, so touching it moves `DERIVATION_HASH`
and re-derives every gene track. That is correct here — the output genuinely
changes for those rows — so do not advance `.derivation_hash` by hand past this.

### Running the tests

`cargo test` — 14 tests, not run by CI (no workflow builds Rust).
