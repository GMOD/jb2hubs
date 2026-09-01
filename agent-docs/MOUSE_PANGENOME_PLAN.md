# Mouse (mm39) pangenome explorer — handoff plan

> **Status as of 2026-09-01.** Written against an earlier layout; read the rest
> with these corrections. There are two routes, both under
> `website/src/pages/pangenomes/` and gated on `features.pangenome`:
> `/pangenomes` (one landing page, `#hprc` and `#mouse` sections carrying the
> HPRC launchers, graph tables and sample table, and the mouse strain tables)
> and `/pangenomes/explorer?dataset=<id>`. `/pangenomes/hprc` and
> `/pangenomes/mouse` are meta-refresh redirects to the two anchors, kept for
> old links. There is no `/pangenome` route and no `hprc/index.astro`. The
> parameterisation §3 proposes is done: `PangenomeDataset`
> (`website/src/components/pangenomeDataset.ts`) carries the reference, VCF,
> synteny target, data prefix, optional hosted `graphBrowser` (itself gated on
> `features.pangenomeGraph`, since the GraphGenomeView plugin needs core v5) and
> external graph browser, and every builder in `pangenomeLinks.ts` and every
> component reads only that shape. `PANGENOME_DATASETS` in that file is the
> registry the explorer resolves `?dataset=` against, and it lists datasets with
> loci only — so a mouse dataset is a second `PangenomeDataset` entry (id
> `mouse`, matching the landing-page anchor) plus its precomputed data under its
> own `dataPrefix`, plus its manifest imported in `explorer.astro`'s `manifests`
> map; no new page. The locus shape is `pangenomeLoci.ts`'s `PangenomeLocus`:
> `variation` (a `VariationClass[]`: `cnv`, `pav`, `hyperdiversity`, `vntr`,
> `inversion`) and `significance`, not `kinds`/`story`, with optional
> `detailWindow`, `graphCollapsed` and `pangeneGenes`. Translate the table in §2
> into that shape.

For whoever owns the pangenome feature (`PangenomeExplorer`, `pangenomeLoci`,
`generatePangenomeData`, `pangenomeLinks`, `/pangenome` + `/hprc` pages). Goal:
a mm39 analog of the HPRC explorer — curated mouse divergence loci → per-locus
variant summaries from a mouse pangenome VCF → the same charts. This doc
supplies the mouse-specific content (loci, data source) and the parameterization
plan; it does **not** touch the (currently uncommitted) pangenome files — that's
the owner's to do, to avoid clobbering.

## 1. Data source (the gating input)

- **Preferred:** the 2025 mouse pangenome (minigraph-cactus, 17–18 inbred +
  wild-derived strains, GRCm39 backbone, `vg deconstruct` VCF). Paper: Cell
  Genomics `S2666-979X(25)00330-1` / bioRxiv `2025.05.13.653481` ("The mouse
  pangenome reveals the structural complexity of the murine protein-coding
  landscape"). **Action:** pull the VCF download URL from that paper's Data
  Availability (Zenodo/UCSC/GitHub) and confirm it's bgzipped + `.tbi`-indexed
  and remotely `tabix`-streamable. Its INFO fields should resemble HPRC's
  (`vg deconstruct` → `AF`, `AT`, etc.) so the existing pipeline mostly fits.
- **Robust fallback (tabix-ready today):** Mouse Genomes Project (MGP) REL-2021
  multi-strain VCFs vs **GRCm39**, ~50 strains, on EBI
  (`ftp.ebi.ac.uk/pub/databases/mousegenomes/`). Use the **SV** VCF for the
  structural/CNV/presence-absence stories. Caveat: MGP INFO differs from HPRC —
  no `LEN`/`TYPE`; derive size from `SVLEN` (or `|ALT|-|REF|`), type from
  `SVTYPE`, and **AF from the GT columns** (HPRC ships `AF`; MGP often doesn't).

## 2. Curated mm39 loci (the mouse analog of `PANGENOME_LOCI`)

Same shape as `pangenomeLoci.ts`
(`id, gene, fullName, chrom, start, end, kinds, story`). **Coordinates below are
approximate GRCm39 windows — verify each before committing** (resolve the gene
via NCBI Datasets the same way `resolveGeneId` does, or UCSC mm39). chrom uses
UCSC mm39 `chr` naming.

| id          | gene/region           | chrom | kinds                        | story                                                                                                                                                        |
| ----------- | --------------------- | ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `h2-mhc`    | H2 (MHC)              | chr17 | hypervariable, structural    | Mouse MHC — the HLA analog; haplotype-level divergence across strains (H2-K/D/Q/T, H2-A/E). The canonical pangenome case in mouse.                           |
| `t-complex` | t-haplotype           | chr17 | structural                   | Proximal chr17 inversions of the t-complex, a classic transmission-distorter system; large rearrangements invisible to a single reference.                   |
| `nnt`       | Nnt                   | chr13 | presence-absence             | C57BL/6J carries a multi-exon Nnt deletion (a famous strain-specific deletion altering glucose/insulin metabolism) — present in most strains, absent in B6J. |
| `r2d2`      | R2d2 / Cwc22          | chr2  | structural                   | A copy-number-variable responder to female meiotic drive; CNV swings wildly between strains.                                                                 |
| `skint`     | Skint cluster         | chr4  | structural, presence-absence | A rapidly-evolving T-cell-selection gene family with strain-variable gene content.                                                                           |
| `slfn`      | Schlafen (Slfn)       | chr11 | structural, presence-absence | Strain-divergent immune cluster with gene content + copy-number variation.                                                                                   |
| `raet1-h60` | Raet1 / H60           | chr10 | presence-absence             | NKG2D-ligand cluster with gene presence/absence between strains, shaping NK immunity (mouse analog of the human immune-CNV stories).                         |
| `defb`      | Beta-defensin cluster | chr8  | structural                   | Copy-number-variable antimicrobial-peptide cluster (mouse analog of human 8p23.1 DEFB).                                                                      |
| `hbb`       | Hbb (beta-globin)     | chr7  | structural                   | The Hbb-s/Hbb-d haplotypes differ in gene copy number/arrangement between strains — a textbook mouse structural haplotype.                                   |

Lead the page with `h2-mhc` (the strongest, most recognizable story), as the
HPRC page leads with `mhc-hla`.

## 3. Parameterization plan (reuse, don't duplicate)

The HPRC code hardcodes human specifics; generalize each by a `reference`
parameter rather than forking:

- **`generatePangenomeData.ts`** — take
  `{ reference, vcfUrl, outDir, loci, info }` where `info` adapts AF/size/type
  extraction per source (HPRC vs MGP). Emit to `public/pangenome-mouse/`.
- **`pangenomeLoci.ts`** — export `MOUSE_PANGENOME_LOCI` (above) alongside the
  human set, or key both under a `reference` map.
- **`PangenomeExplorer.tsx`** — accept props
  `{ reference, dataDir, loci, links }` instead of importing
  `PANGENOME_LOCI`/`hprc*` directly, so one component serves both.
- **`pangenomeLinks.ts`** — `hprcSyntenyUrl`/`hprcVcfLgvUrl` become
  reference-aware (mm39 UCSC config + the mouse VCF track); the mm39 LGV uses
  `jbrowse.org/ucsc/mm39/config.json`.
- **No new page**: add the dataset to `PANGENOME_DATASETS` and its manifest to
  `explorer.astro`; the explorer's dataset switch appears once two datasets have
  loci.

## 4. Notes

- mm39 has **no hosted multi-way multiz/Cactus MAF** in jb2hubs (only a single
  hamster net), so there's no "Open N-way alignment" button analog for mouse the
  way hg38 has cactus447way — scope the mouse page to the VCF-summary view.
- Reference-name handling: the mouse pangenome VCF is GRCm39; UCSC mm39 uses
  `chr`-prefixed names, NCBI/Ensembl use `1`,`2`,… — keep loci in UCSC `chr`
  naming to match the mm39 JBrowse config (as the human loci match hg38).
