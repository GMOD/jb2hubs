# jb2hubs

Turns public genome resources into ready-to-open
[JBrowse 2](https://jbrowse.org/jb2/) sessions at <https://genomes.jbrowse.org>.

- **In:** UCSC goldenPath, the ~50,000 UCSC
  [GenArk](https://hgdownload.soe.ucsc.edu/hubs/) hubs, NCBI annotation,
  Wikidata
- **Out:** one JBrowse 2 config per assembly at a permanent url, and a site to
  find and launch them

## What it adds

- Genetic codes per sequence, so mitochondria and plastids translate correctly
- Circular sequences drawn as rings
- NCBI RefSeq and GENCODE gene tracks on UCSC assemblies
- Gene-symbol search on GCA hubs, which have no NCBI annotation
- ENCODE composites, itemRgb color keys and RepeatMasker classes drawn as UCSC
  draws them
- liftOver chains as synteny tracks
- Protein browser, pangenome, gene and ortholog pages
- Configs that keep booting on old JBrowse releases

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
