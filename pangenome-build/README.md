# pangenome-build — genome-wide implicit pangenome (impg)

Builds a genome-wide [implicit pangenome](https://github.com/pangenome/impg) for
a panel of assemblies (default: the mouse strains). impg stores the all-vs-all
alignments rather than a graph, so once indexed, **any reference region can be
projected onto every other assembly instantly** — far lighter than
minigraph-cactus (no graph construction, no high-RAM toolchain). The one-time
cost is the all-vs-all `wfmash` alignment, which parallelizes across threads.

This produces website-ready data without a graph: per curated locus, the
homologous sequence across all strains is projected and aligned into an MSA that
the pangenome explorer renders with react-msaview (a static FASTA — no served
JBrowse track needed).

## Run it (on a compute host, e.g. `ssh ada`)

```sh
./setup-env.sh                 # one-time: conda/mamba env with all tools (bioconda)
conda activate pangenome-build
./run.sh                       # download → align → index → per-locus MSAs
./run.sh --graph               # also build genome-wide GFA graphs (heavier)
```

Then copy the results into the site:

```sh
cp build/msa/*.fa  <repo>/website/public/pangenome/msa/
```

## What each piece does

- **`mouse-strains.tsv`** — the panel: `accession <TAB> sample-name`. The sample
  name becomes the PanSN prefix (`sample#hap#contig`). GRCm39 is listed first as
  the projection reference (curated loci use GRCm39 coordinates).
- **`mouse-loci.tsv`** — curated divergence loci:
  `id <TAB> gene <TAB> flank_kb <TAB> description`. `run.sh` resolves each gene
  to GRCm39 coordinates via NCBI `datasets`, so no chromosome-name mapping is
  needed.
- **`build.sh`** — downloads each assembly (`datasets`), renames contigs to
  PanSN, concatenates, runs `wfmash` all-vs-all, and `impg index`.
- **`query.sh`** — projects one region (`impg query -d <merge>`), extracts the
  homologous sequence per strain, and aligns with `abpoa` → `build/msa/<id>.fa`.
- **`run.sh`** — orchestrates the whole thing; `--graph` adds `impg partition` +
  `impg graph --gfa-engine pggb` for genome-wide GFA graphs.

## impg CLI reference used

Matches the upstream [impg README](https://github.com/pangenome/impg) (verify
flags against your installed version — impg's CLI changes across releases):

```sh
impg index -a panel.paf -i panel.impg
impg query -i panel.impg -r SAMPLE#1#ACC:START-END -d 10000 -o bed   # BED projections
impg partition -i panel.impg -w 1000000 -d 100000 -o fasta --separate-files
impg graph --sequence-files part.fa -g part.gfa --gfa-engine pggb
```

## Serving it to the website

- **MSA (done by this pipeline):** static FASTA in `public/pangenome/msa/` →
  react-msaview. Zero infra.
- **Variant charts + JBrowse track (with `--graph`):** `vg deconstruct` the GFA
  → a `vcf.gz`, host it, register the track in the served `mm39` config
  (`ucsc2jbrowse/ucscExtensions/mm39.json` → regenerate → upload), and feed
  `generatePangenomeData` the VCF for the explorer's per-locus summaries.
- **On-demand region projection (genome-wide):** wrap `impg query` in a small
  service mirroring `aws/ortholog-assembler` (Lambda/container + S3 cache) so
  the browser can project arbitrary regions live.

## Notes

- No published mouse pangenome graph/VCF exists yet (the 2025 mouse pangenome
  paper released only ENA assemblies + an Ensembl annotation browser), which is
  why this builds one from the strain assemblies directly.
- `wfmash` params (`WFMASH_PARAMS`) are tuned for same-species strains
  (`-s 10000 -p 95`); loosen `-p` for cross-species panels.
- The t-complex locus (megabase-scale chr17 inversions) is left out of the MSA
  loop by default — it reads better in a browser than a single alignment.
