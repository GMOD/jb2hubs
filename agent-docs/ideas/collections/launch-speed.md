---
name: launch-speed
description:
  What a JBrowse launch from the site still costs and the ranked ways to cut
  it: minimal.json for gene launches, CloudFront and a pruned merge, a pinned
  JBROWSE_BASE, deferred plugins, client-side PIF placement, pangenome forms
  per gene window, a gene index over all hosted assemblies.
---

# Launch speed

Left from the 2026-11-02 review of the gene, ortholog, synteny and pangenome
pages; what it found broken is fixed and shipped. The merger's gzip and cache
headers (`7077a9a51f7a`), the description sidecar pages (`f012cd6cbcd7`) and the
trix re-index are live.

## The numbers

- Merge API, hg38+mm39: 526 KB gzipped (2.72 MB raw), 0.56 s warm at 1024 MB;
  935 tracks, 4 plugins. hg38+hg19+hs1+mm10 answers at 894 KB gzipped. A
  regenerated config can be up to 2 h stale in a synteny launch.
- hg38 `config.json`: 1.52 MB; `minimal.json` 60 KB with 24 tracks.
- Plugins: removing `plugins` from a copy of hg38's config moved first paint
  from 1248 to 892 ms (jbrowse-components
  `agent-docs/reference/COLD_LOAD_PROFILE.md`). Every UCSC config names Hubs,
  Protein3d and MsaView; the default session uses none.
- Track count is not the boot cost: `jbrowse.tracks` is frozen and a track
  becomes a node only when read (jbc ADR-031/032).
- Whole-genome indexes read before the first block: hg38ToMm39 PIF 820 KB, HPRC
  walks 1.33 MB, sv-states 700 KB, callset 710 KB.
- Protein browser: TP53 23 s with `msaAlgorithm: 'browser'`
  (`proteinSession.ts`) against 7 s prebuilt. Split it between NCBI fetches and
  alignment before precomputing anything.
- Not rerun since the 2026-11-03 trix re-index: the every-coding-gene search
  probe on the four references.

## Easy wins, each waiting on a call or a measurement

- **`minimal.json` for gene, protein and single-genome ortholog launches.** It
  picks the same gene track as the full config over all 239 dbs and holds
  `clinvarMain`/`alphaMissense`; the track selector drops to 24 tracks, and
  staging loses BLAT (no staging sibling). Measure boot with both under one spec
  session first. `/ucsc/launch` and synteny launches keep `config.json`, since
  `minimal.json` has none of the liftOver `SyntenyTrack`s (hg38: 239).
- **CloudFront in front of the merger, and a pruned merge.** Published links
  carry `0hifvzakej`, so CloudFront needs a new hostname. A prune would keep
  minimal's track rules plus the synteny tracks whose two assemblies are both in
  the request; it changes what every merge caller receives, so it is a call.
  Build pruned per-pair configs as files rather than pruning in the merger.
- **Pin `JBROWSE_BASE` to a release outside pangenome.** `main` redeploys almost
  daily, so returning users are always cold (0.36–0.47 s warm against 1.0–1.1 s
  cold upstream). Colin's call; run the three `check-*-launches` first.
- **Deferred plugins, upstream.** Dropping MsaView/Protein3d from plain launches
  saves ~350 ms but loses the protein-view menu everywhere. The fix belongs in
  jbrowse-components (`createPluginManager.ts`, `loadPlugins.ts`): load a plugin
  after the session is ready unless the session names its types.

## Ambitious directions, after a sceptic pass

- **Pangenome forms per gene window.** ~19k HPRC windows, 5–10 CPU-hours, ~50 MB
  gzipped. Offline there is no step budget, so MHC class II gets the walks' 29
  forms instead of the sidecar's 120, which would supersede
  `ideas/waiting-on-a-number/hprc-walk-dp-tag.md`. Store raw marks and run
  `markTag` at read time; follow the sidecar naming and upload rules; no layouts
  (GPL rule).
- **Gene → hosted-assembly index over all 52k assemblies**, streamed from the
  xenoRefGene trix indexes after `genark2jbrowse/xenoSymbolIndex.sh`. Gene
  search and gene-centred launches would reach the 7,885 GCA hubs NCBI's
  orthologs miss, and synteny rows could be placed without NCBI. Label rows as
  aligned RefSeq, not orthologs.
- **Client-side PIF placement** for panels NCBI cannot place: one tabix range
  read of our PIF (the bucket sends CORS) instead of `followSynteny` at launch
  (10–14 s against 3.4 s). The same read feeds a pairwise ribbon glyph, the next
  lightweight view after `PangenomeMap`.
- Lambda-served gene pages: `ideas/ready/gene-page-served-by-the-lambda.md`.

Set aside: lazy track shards (little beyond stripping the html), url sessions
(shorter links, one more round trip), snapshot-first paint (jbrowse-web already
paints a boot shell at ~67 ms), a general query API (two of three endpoints
exist), all-pairs ortholog synteny (quadratic; a per-genome file from NCBI's
`gene_orthologs` is the variant).
