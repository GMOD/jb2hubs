# jb2hubs

A portal that turns public genome resources into ready-to-open
[JBrowse 2](https://jbrowse.org/jb2/) sessions.

- **In:** the UCSC goldenPath databases, the ~50,000 UCSC
  [GenArk](https://hgdownload.soe.ucsc.edu/hubs/) assembly hubs, NCBI annotation
  and metadata, Wikidata and Wikipedia
- **Out:** a JBrowse 2 config per assembly at a permanent url, and a static site
  for finding an assembly and launching it
- **Live:** <https://genomes.jbrowse.org> (staging:
  <https://staging.genomes.jbrowse.org>)

## Beyond a straight conversion

### Sequence and translation

- **Per-sequence genetic codes.** The GenArk pipeline reads each sequence's
  `transl_table` from its NCBI GFF, so a mitochondrion or plastid translates
  with its own code. The UCSC pipeline looks up `chrM`'s code by taxon in NCBI
  taxonomy, since UCSC's genePred-derived GFFs carry no `transl_table`.
- **Circular sequences.** The GenArk pipeline lists every sequence the NCBI GFF
  marks `Is_circular=true` (mitochondria, plastids, plasmids, bacterial
  chromosomes) in the assembly's `circularRefNames`, so the circular view closes
  it into a ring.
- **Mirrored sidecars.** UCSC assemblies serve `chrom.sizes`, `chromAlias` and
  `cytoBand` beside their config, so one slow upstream file can't fail the
  assembly
  ([ADR 0003](agent-docs/architecture-decision-records/0003-mirror-assembly-sidecars.md)).

### Annotation

- **NCBI RefSeq GFF tracks on UCSC assemblies**, matched to each NCBI-derived db
  automatically, plus GENCODE on hg38, hg19 and mm39.
- **RefSeq link-table attributes** (gene symbol, product, description) merged
  into the UCSC gene GFFs.
- **Gene-symbol search on GCA hubs**, which have no NCBI annotation: the
  pipeline joins each hub's xenoRefGene to NCBI's RefSeq → symbol table and
  builds a text index from it.
- **BED12 blocks that aren't exons** (UniProt features, DGV variants, tandem
  duplicates) stay plain features instead of becoming transcripts.

### UCSC tracks as UCSC draws them

- **ENCODE multiWig composites** become one overlaid multi-wiggle track, in
  UCSC's colors. Legacy composites whose files live in a golden-path table,
  hg19's only regulation signal, resolve too
  ([ENCODE_TRACKS](agent-docs/reference/ENCODE_TRACKS.md)).
- **itemRgb color keys.** A bigBed that paints itemRgb gets a legend naming its
  colors, from trackDb, UCSC's palette or a sample of the file.
- **RepeatMasker split by class**, one row per repeat class.
- **Multiple alignments** get their species tree sidebar, found beside the MAF
  even though trackDb doesn't name it. Mouse-strain MAF rows open the aligned
  strain's own genome
  ([MAF_CROSS_VIEW_NAVIGATION](agent-docs/reference/MAF_CROSS_VIEW_NAVIGATION.md)).
- **UCSC `hgTracks` links** in feature details launch JBrowse on our config for
  that db instead of a dead relative url.

### Comparative genomics

- **liftOver chains as synteny tracks** (PIF), for UCSC and GenArk alike, plus
  multi-way star tracks over several genomes.
- **Pangenome pages** that draw each structural form of a locus, with a Bandage
  view of the graph around a change
  ([PANGENOME_PAGES](agent-docs/reference/PANGENOME_PAGES.md)).
- **Protein browser**: gene symbol → collapsed-intron genome view, 3D structure
  and ortholog alignment on one transcript model
  ([PROTEIN_BROWSER](agent-docs/reference/PROTEIN_BROWSER.md)).
- **Gene, ortholog and conserved-gene-order pages** built on NCBI's ortholog
  data ([GENE_PAGE](agent-docs/reference/GENE_PAGE.md)).

### Configs that keep working

- **Every regenerated config boots on every JBrowse release we support**, back
  to the oldest in `scripts/checkConfigCompat.mjs`, because Desktop installs and
  published links keep naming the same url
  ([ADR 0002](agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md)).
- **Dead upstream urls are found and dropped**, on a request budget that keeps
  load on hgdownload low
  ([TRACK_URL_CHECKS](agent-docs/reference/TRACK_URL_CHECKS.md)).
- **Taxon images and species descriptions** from Wikidata and Wikipedia on the
  accession and taxonomy pages.

## Quick start

```bash
pnpm install
pnpm build:bed2gff        # one-time; the UCSC gene-track pipeline needs the binary

./run.sh --dry-run        # build everything locally, no upload or deploy
./run.sh                  # full incremental build + upload + deploy
```

## Docs

- [DEVELOPERS.md](DEVELOPERS.md): prerequisites, flags, env vars and running
  each pipeline on its own
- [docs/architecture.md](docs/architecture.md): data flow and repository layout
- [docs/generated-files.md](docs/generated-files.md): what is generated and what
  to edit instead
- [docs/checks.md](docs/checks.md): lint, tests and the pre-ship config gates
- [CLAUDE.md](CLAUDE.md): the invariants and traps to read before changing a
  pipeline
- [agent-docs/reference/](agent-docs/reference/): design records behind each
  feature

## Credits

Huge thanks to the UCSC Genome Browser team for their generous data sharing
policy and for the resources this portal is built on.

This repo was written with the aid of AI tools including Claude and avante.nvim.
