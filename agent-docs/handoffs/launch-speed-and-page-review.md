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

## Landed, not shipped

- `7077a9a51f7a`: the config merger gzips its answer, sends
  `Cache-Control: public, max-age=3600` and `Vary: Accept-Encoding`, and runs at
  1024 MB (`aws/config-merger/src/index.ts` `mergedResponse`, `template.yaml`).
  **Not deployed.** Deploy from the local machine with
  `aws/config-merger/deploy.sh`, then check
  `curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download} %{time_total}\n' '<merge url>?hubIds=hg38,mm39'`
  shows about 0.5 MB, and open one synteny example. Browser caching stacks on
  the instance cache, so a regenerated config can now be up to 2 h stale in a
  synteny launch.
- `dd7bce8c65da`: preconnect to jbrowse.org and dns-prefetch of the merge API
  (`website/src/layouts/Layout.astro`); the ortholog pairwise launch no longer
  navigates a reference panel the catalog names under another version
  (`orthoSyntenyUrl`); the pangenome map's mygene lookup has a 5 s deadline and
  names its failures `GenesUnreachable` (`pangenomeRegion.ts` `genesInWindow`).
  **Ships with the next website deploy.**

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

- Stop inlining `metadata.ucsc.html` and link UCSC's description page instead.
  About 6× fewer bytes on every UCSC launch; loses the html in the About dialog.
  Pipeline change, so every UCSC config regenerates.
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

- Gene-order star launch exists only for hg38: `STAR_PANELS`
  (`geneOrderStar.ts:13`) has one key, while `synteny_stars.json` has mm39, dm6,
  rheMac10, galGal6 and others. Build lanes from the star's mates when the
  reference has no entry. `GENE_PAGE.md` describes this launch wrongly.
- `exampleFor` (`pangenomeAnswer.ts:189`) splits labels into words: "a" opens
  Agouti, "CFH" the CFH/CFHR window, "I"/"class" open BoLA class I. Give
  `PangenomeLocus` an explicit gene list.
- `/synteny` swap with a gene (`SyntenySelector.tsx:210`, `geneSearch.ts:148`):
  hg38/mm39 at TP53 → swap → second assembly rn7 resolves the gene against the
  wrong taxa; `pairGenes` takes the first non-query report as the ortholog. Pick
  the ortholog by `tax_id`, and clear the gene when the searched row's assembly
  changes.
- Gene card shows `otherVersion` coordinates as hosted (`GenePage.tsx:155`);
  `OrthologPreview.tsx` too. Reuse `placedOnHosted` and the table's "NCBI:"
  note.
- Ortholog TSV pairs our accession with the other version's coordinates
  (`orthologSearchUtils.ts:579`); add an `ncbi_assembly` column.
- Tick limit: `tickable` (`OrthologResultsTable.tsx:294`) reserves the reference
  slot only once its row arrives, so 13 genomes can launch.
- No reference row pins no clade (`OrthologPreview.tsx:383`,
  `OrthologResultsTable.tsx:278`); pass `identity.refTaxId` down.
- Lineage timeout cached for good with no message (`OrthologSection.tsx:141`).
- `extractSyntenyTracks.ts:133` logs and drops a config that fails to parse; add
  the refuse-on-shrink gate.
- Wrong message when the second assembly is real but not a partner
  (`SyntenySelector.tsx:83`, `:340`).
- Bandage figure vanishes during a 5–9 s re-layout (`PangenomeGraph.tsx:410`);
  `keepPreviousData` on that call.

## Launcher refactors

- One `LinearSyntenyView` builder through `placePanels`. Today /synteny follows
  but highlights nothing, `pairwiseOrthologUrl` (`orthologSearchUtils.ts:346`)
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
- Shared helpers: one gene-track rule (`orthologSearchUtils.ts:252`, `:537`),
  `geneHighlight` returning a string (`:256`), rename one of the two
  `geneWindow`s (`geneSearch.ts:178`), `wholeSequence` as `placeRegion`
  (`pangenomeRegion.ts:60`), `regionLaunches` taking the `Reading`
  (`pangenomeLinks.ts:416`).
- Move build-only code out of page modules: `pangenomeSvStates.ts` lines
  ~22–310, `pangenomeGeneModels.ts`, `pangenomeLocusGenes.ts`,
  `pangenomeOmia.ts`; the gene-order figure logic out of `geneHub.ts:171`; its
  page-scoped CSS out of `conserved-gene-order.astro:17`.
- Retire mygene.info from the pangenome page; it does not generalize to the
  species we want, and its coordinates are not tied to the graph's build. Only
  HPRC sets `geneGffUrl` (`pangenomeDataset.ts:222`). Every reference already
  has its own hosted, tabix-indexed gene GFF and trix index on the right build:
  mm39 and bosTau9 `ncbiRefSeq.gff.gz` + `trix/<db>.ix`, Arabidopsis
  `GCF_000001735.4_TAIR10.1_genomic.gff.gz` + `trix/GCF_000001735.4.ix`. Read
  genes-in-window from the GFF and symbol → region from the trix, both found
  through the reference's config, so a new graph on any hosted assembly needs no
  gene source of its own. Check the trix carries aliases (HER2 → ERBB2) before
  dropping mygene's alias fallback. The /gene type-ahead (`geneSearch.ts:30`)
  uses mygene too; a separate question.
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
