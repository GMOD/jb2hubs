# jb2hubs

Turns public genome resources into ready-to-open
[JBrowse 2](https://jbrowse.org/jb2/) sessions.

## What it does

- **Creates JBrowse configs** from the UCSC main genome browser assemblies and
  the ~50,000 UCSC [GenArk](https://hgdownload.soe.ucsc.edu/hubs/) hubs, one per
  assembly at a permanent url, for use on <https://genomes.jbrowse.org> or in
  JBrowse Desktop.
- **Builds genomes.jbrowse.org**, a static site for searching assemblies by
  name, accession or taxonomy and launching them, plus a protein browser,
  pangenome pages, and gene and ortholog pages.
- **Genetic codes.** We read the `transl_table` on each CDS in a GenArk
  assembly's NCBI GFF, and for UCSC assemblies we ask NCBI taxonomy for the
  species' mitochondrial code. The config records the code per sequence, so
  JBrowse translates mitochondrial and plastid genes with the right one.
- **Circular sequences.** We list the sequences the NCBI GFF marks
  `Is_circular=true`, so the circular view draws mitochondria, plasmids and
  bacterial chromosomes as rings.
- **More gene tracks on UCSC assemblies.** We match each NCBI-derived UCSC
  assembly to its RefSeq annotation and add that GFF as a track, plus GENCODE on
  hg38, hg19 and mm39.
- **Gene search on unannotated hubs.** GCA hubs have no NCBI annotation, so we
  join UCSC's xenoRefGene alignments to NCBI's RefSeq → symbol table and index
  the symbols.
- **UCSC tracks look as they do on UCSC.** ENCODE composites become one overlaid
  multi-wiggle track in UCSC's colors, itemRgb tracks get a color legend, and
  RepeatMasker can split into one row per repeat class.
- **Synteny.** We convert UCSC's liftOver chains into JBrowse synteny tracks
  between assemblies.
- **Old JBrowse versions keep working.** Desktop installs and published links
  keep naming a config's url, so before each upload `run.sh` boots a sample of
  the regenerated configs in every JBrowse release we support.

## Quick start

```bash
pnpm install
pnpm build:bed2gff   # once
./run.sh --dry-run   # build, no upload
./run.sh             # build, upload, deploy
```

## Docs

- [DEVELOPERS.md](DEVELOPERS.md): setup and running each pipeline
- [docs/architecture.md](docs/architecture.md): data flow and repo layout
- [docs/generated-files.md](docs/generated-files.md): what not to hand-edit
- [docs/checks.md](docs/checks.md): lint, tests, pre-ship gates
- [CLAUDE.md](CLAUDE.md): invariants to read before changing a pipeline
- [agent-docs/reference/](agent-docs/reference/): design notes per feature

## Credits

Thanks to the UCSC Genome Browser team for their generous data sharing policy.
Written with the aid of AI tools including Claude and avante.nvim.
