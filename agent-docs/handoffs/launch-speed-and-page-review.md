---
name: launch-speed-and-page-review
description:
  A 2026-11-02 review of the gene, ortholog, synteny and pangenome pages and of
  what a JBrowse launch costs. Two commits landed and are not deployed; the rest
  is the ranked list of confirmed bugs, launch speedups and ambitious
  directions, each with the file to start at.
---

# Launch speed and the gene, ortholog, synteny and pangenome pages

Seven read-only reviews (four per page family, one on launch cost, one on the
jbrowse-components side, one unanchored architecture pass) plus a sceptic over
the proposals. Findings below were confirmed by tracing unless marked
"suspected".

## Landed, and whether it shipped

- `7077a9a51f7a`: the config merger gzips its answer, sends
  `Cache-Control: public, max-age=3600` and `Vary: Accept-Encoding`, and runs at
  1024 MB. Deployed 2026-11-11: hg38+mm39 is 526 KB gzipped (2.88 MB before),
  0.56 s warm, and hg38+hg19+hs1+mm10, over Lambda's 6 MB limit before, answers
  200 at 894 KB. A regenerated config can now be up to 2 h stale in a synteny
  launch.
- `dd7bce8c65da` and `b07709dfb22e`..`5faf8b1bc3c9` shipped with a website
  deploy before 2026-11-11 (the live page sends the preconnect).
- `0d96f8dbaae5`..`5820f24317d0`: trix pairs upload no-cache; the pangenome
  lookup reads a record by its values; NCBI GFF tracks are indexed by
  `Name, gene_synonym, locus_tag, old_locus_tag` under CLI 5.0.0-beta.20, and
  every index is stamped (`agent-docs/reference/DERIVED_FILE_INTEGRITY.md`, "A
  trix index is stamped"). **The next `run.sh` re-indexes every assembly.**
  Deploy the website before that run, so the reader for both record shapes is
  live when the new indexes land. After it, drop the `gene-<text>` search in
  `indexedGeneRegion` (`pangenomeGeneIndex.ts`) and rerun the every-coding-gene
  probe on the four references.

## Measured launch costs

- Merge API, hg38+mm39: 2.72 MB uncompressed, first byte 7.3–7.6 s cold and 1.1
  s warm at 128 MB; 935 tracks, 4 plugins. A hg38+hg19+hs1+mm10 stack is 6.32 MB
  raw, over Lambda's 6 MB response limit until gzip deploys.
- hg38 `config.json`: 2.33 MB, of which 1.23 MB is inlined `metadata.ucsc.html`;
  72 KB gzipped without `metadata` against 426 KB with. `minimal.json` is 60 KB
  with 24 tracks.
- Plugins: removing `plugins` from a copy of hg38's config moved first paint
  from 1248 to 892 ms (jbrowse-components
  `agent-docs/reference/COLD_LOAD_PROFILE.md`). Every UCSC config names Hubs,
  Protein3d and MsaView; the default session uses none.
- Track count is not the boot cost: `jbrowse.tracks` is frozen and a track
  becomes a node only when read (jbc ADR-031/032).
- Protein browser: TP53 23 s with `msaAlgorithm: 'browser'`
  (`proteinSession.ts:60`) against 7 s prebuilt (`PROTEIN_BROWSER.md`). Not
  split between NCBI fetches and alignment; measure that before precomputing.
- Whole-genome indexes read before the first block: hg38ToMm39 PIF 820 KB, HPRC
  walks 1.33 MB, sv-states 700 KB, callset 710 KB.

## Easy wins left, each needing a call or a measurement

- Built on branch `ucsc-html-link`, not shipped: the trackDb html moves out of
  `metadata.ucsc.html` into a page per track that the config links
  (`UCSC_PIPELINE.md`, "Track descriptions are sidecar pages"). Every UCSC
  config regenerates at the next run.
- `minimal.json` for gene, protein and single-genome ortholog launches. It picks
  the same gene track as the full config over all 239 dbs and holds
  `clinvarMain`/`alphaMissense`; the track selector drops to 24 tracks, and
  staging loses BLAT (no staging sibling). Measure boot with both under one spec
  session first. `/ucsc/launch` and synteny launches must keep `config.json`.
- CloudFront in front of the merger needs a new hostname, since published links
  carry `0hifvzakej`. The prune decision in `todo/slowness-synteny.md` is the
  same question; build pruned per-pair configs as files rather than pruning in
  the merger.
- Pin `JBROWSE_BASE` to v5.0.0-beta.20 outside pangenome: main redeploys almost
  daily, so returning users are always cold (0.36–0.47 s warm against 1.0–1.1 s
  cold upstream). Colin's call; run the three `check-*-launches` first.
- Dropping MsaView/Protein3d from plain launches saves ~350 ms but loses the
  protein-view menu everywhere. The upstream fix is deferred plugins in
  jbrowse-components (`createPluginManager.ts`, `loadPlugins.ts`): load after
  the session is ready unless it names the plugin's types.

## Confirmed bugs

All eleven are closed. Nine were fixed on 2026-11-11, one commit each, and ship
with the next website deploy; two had been fixed already.

- Gene-order star launch: a reference with no `STAR_PANELS` entry opens up to
  twelve lanes, one per species of its star, spread over the rings of kinship
  around the reference (`speciesPanel`, `geneOrderStar.ts`). `GENE_PAGE.md`
  describes the launch. Booting mouse Trp53 turned up a twelfth bug, also fixed:
  a star track of one lane throws `NoCommonAssemblyError`, which hg38 met too
  where NCBI placed a gene in only one of chicken and zebrafish.
- `exampleFor`: a locus lists the names it opens by (`PangenomeLocus.names`).
  CFH and RHCE, which their example windows only clip, go to the gene lookup.
- `/synteny` swap: `pairGenes` takes the ortholog from the pair's other taxon, a
  gene of neither taxon anchors no panel and the note says so, and changing the
  row a swapped gene sits on clears the gene.
- `otherVersion` coordinates: the gene card and the preview draw the table's
  "NCBI:" note (`OtherVersionNote`).
- Ortholog TSV: an `ncbi_assembly` column after `assembly`.
- Tick limit: the reference's place is held from the start (`canTickAnother`),
  so a search whose reference never gets a row launches eleven.
- Reference clade: the table and the preview pin `identity.refTaxId`, and the
  lineage request names it.
- Lineage timeout: an error with a Retry above the table (`within`,
  `lib/delay.ts`), no longer a cached null. The preview shows no message.
- Bandage figure: `keepPreviousData`, with a "Redrawing" caption.
- `extractSyntenyTracks` dropping an unparsable config: fixed by `87af9d498f23`
  (an unreadable config fails the run) and `637663bed643` (a scan with no
  synteny track refuses to write).
- Wrong message for a second assembly that is no partner: fixed by
  `e1e6fcde3946`.

## Launcher refactors

- One `LinearSyntenyView` builder through `placePanels`. Today /synteny follows
  but highlights nothing, `pairwiseOrthologUrl` (`orthologLaunches.ts`)
  highlights but never follows, and `buildMultiSyntenyUrl` drops query
  colouring. It also gives an unplaced reference panel `followSynteny` instead
  of the whole genome, and one flip rule (`strandFlips` anchors on `rows[0]`,
  `:378`).
- Make the `/synteny` examples gene-centred (`lib/syntenyExamples.ts`): two of
  three open the whole-genome hairball. With no gene, open at `defaultPos` with
  follow, or a dotplot (`ideas/collections/synteny-launcher.md`).
- One star launcher: keep `geneOrderStarUrl`'s session tracks and NCBI-first
  lanes, pass it the ticked rows, and drop `starUrl`, `hasStarLane` and the
  staging-config dependency (`multiSyntenyDrilldown.ts:53`,
  `OrthologLaunchBar.tsx:61`).
- Pangenome graph launch inlines a second `VariantTrack` over the VCF the graph
  config already has (`pangenomeLinks.ts:59`, `:254`); move its settings to the
  config track and name it by id (~2 KB a url). `rows.kept` repeats `rows.sort`
  (~9 KB on chrX); test dropping it with `check-pangenome-launches`.
- `/synteny`'s primary button ignores the Desktop preference
  (`SyntenySelector.tsx:373`); use `LaunchLink`.
- Ship a compact `[trackId, a, b]` synteny asset (~42 KB gzipped) instead of
  `syntenyTracks.json` (79 KB gzipped, 71 duplicate ids, names unread).

## Simplifications

- `GeneQueryForm.tsx:95`: drop the second species resolution (`refPending`,
  `refError`, the request ref, async submit) and control the species input,
  which also feeds the combobox the typed species (`:170`) and removes the
  `key={refText}` remount (`:189`).
- Shared helpers: one gene-track rule (`accessionToJbrowseUrl` and
  `buildMultiSyntenyUrl`, `orthologLaunches.ts`), `geneHighlight` returning a
  string (`:256`), rename one of the two `geneWindow`s (`geneSearch.ts:178`),
  `wholeSequence` as `placeRegion` (`pangenomeRegion.ts:60`), `regionLaunches`
  taking the `Reading` (`pangenomeLinks.ts:416`).
- Move build-only code out of page modules: `pangenomeSvStates.ts` lines
  ~22–310, `pangenomeGeneModels.ts`, `pangenomeLocusGenes.ts`,
  `pangenomeOmia.ts`; the gene-order figure logic out of `geneHub.ts:171`; its
  page-scoped CSS out of `conserved-gene-order.astro:17`.
- `/gene` and the protein browser still suggest symbols through mygene.info
  (`taxonSymbols`, `geneSearch.ts`); the pangenome pages read the reference's
  own trix and GFF since `b07709dfb22e`.
- `PangenomeRegionBox.tsx:435` replaces every failure with a new `Error`; keep
  the original and format at render.
- Dead paths: `syntenyCandidates`/`planFromSelection` once the launch bar plans
  from ticked rows, the pre-names `PairEntry` handling
  (`syntenyPairIndex.ts:58`).
- Stale comments: `ucscDefaultTracks.ts` says hg38's config is 30 MB (2.76),
  `genomeTarget.ts` says minimal is 7 KB (60).
- Re-measure `callsetBlank` (`pangenomeLoci.ts:21`) on `sv.v4`; the flags were
  taken on pgbi.

## Ambitious directions, after the sceptic

- **Pangenome forms per gene window** (strongest agreement). ~19k HPRC windows,
  5–10 CPU-hours, ~50 MB gzipped; offline there is no step budget, so MHC class
  II gets the walks' 29 forms instead of the sidecar's 120, which supersedes
  `ideas/waiting-on-a-number/hprc-walk-dp-tag.md`. Store raw marks and run
  `markTag` at read time; follow the sidecar naming and upload rules; no layouts
  (GPL rule).
- **Gene → hosted-assembly index over all 52k assemblies**, streamed from the
  xenoRefGene trix indexes after `genark2jbrowse/xenoSymbolIndex.sh`. Lets gene
  search and gene-centred launches reach the 7,885 GCA hubs NCBI's orthologs
  miss, and places synteny rows without NCBI. Label rows as aligned RefSeq, not
  orthologs.
- **Lambda-served gene pages**, as
  `ideas/ready/gene-page-served-by-the-lambda.md`, with the cache filled by a
  batch run ahead of readers; prerender ~1k human genes as a Search Console
  pilot before ~20k. Key on GeneID. The "every gene, every view" version was
  rejected: NCBI's rate limit makes 160k genes days of wall time, jb2export
  draws no plugin view, tens of GB do not fit the tar deploy, and it reverses
  ADR 0008.
- **Client-side PIF placement** for panels NCBI cannot place: one tabix range
  read of our PIF (the bucket sends CORS) instead of `followSynteny` at launch
  (10–14 s against 3.4 s). The same read feeds a pairwise ribbon glyph, the next
  lightweight view after `PangenomeMap`.
- **Upstream deferred plugins** (above).

Considered and set aside: lazy track shards (little beyond stripping the html),
url sessions (shorter links, one more round trip), snapshot-first paint
(perceived speed only; jbrowse-web already paints a boot shell at ~67 ms), a
general query API (two of three endpoints exist), all-pairs ortholog synteny
(quadratic; a per-genome file from NCBI's `gene_orthologs` is the variant).
