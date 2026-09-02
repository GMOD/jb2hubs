# The NCBI GFF track's info dialog does not say how old the annotation is

A reader who opens `hg38-ncbiRefSeqGff` or a GenArk `-ncbiGff` track gets no
provenance for it: not which annotation release it is, who produced it, or when
we fetched it. The accession page already shows all three
(`website/src/pages/accession/[id].astro`, around the `annotationInfo` block),
so the gap is only in the config the browser reads.

The parsing half is done. `hubtools/src/parseAssemblyEntry.ts` reads
`hubs/<hubPath>/ncbi.json` and already emits `annotationInfo` (NCBI's
`annotation_info`, carrying `name`, `provider`, `release_date`) and
`ncbiDownloadedAt`. Nothing new has to be fetched or parsed — the values just
never reach a track's `metadata`.

## Prior art, and why it does not transplant as written

Implemented on `feat/ncbi-track-date`, tip `08007be4b85` (2026-06-02): a
`stampNcbiGffMetadata` in `enhanceConfig` writing `annotationName`,
`annotationProvider`, `annotationReleaseDate` and `dataRetrieved` onto the
track, plus four tests. The branch and its worktree were deleted 2026-09-02
after 405 commits of drift; the tip is tagged `archive/ncbi-track-date` if the
diff is wanted. Reimplementing beats cherry-picking it — `enhanceConfig.ts`
moved +253/-32 underneath it and the 3-way conflicts in both files. Three things
about the old shape are wrong for today's tree:

- It read the sibling `ncbi.json` itself, by rewriting `config.json` out of the
  config's own path. Configs are now assembled in memory in one pass
  (`enhanceConfigObject`, `genark2jbrowse/src/buildConfig.ts`), so the values
  should be passed in by the caller that already has them, not re-read from disk
  inside enhance.
- It matched `trackId.endsWith('-ncbiGff')`, which is GenArk only. UCSC's
  equivalent is `<db>-ncbiRefSeqGff`, on the 75 assemblies
  `deriveNcbiAccessions.ts` detects. Both want it.
- Its `dataRetrieved` recomputed a date from `downloaded_at`; `ncbiDownloadedAt`
  is already derived.

## What makes it not a quick win

A change to `hubtools/src/enhanceConfig.ts` moves `PIPELINE_HASH`, which marks
all ~238 UCSC assemblies stale and rewrites the GenArk configs corpus-wide, with
the re-upload behind that. Worth batching with a regeneration that is happening
anyway rather than starting one for this.

No old-host risk, though: this is `metadata`, which every supported release
ignores harmlessly — unlike a `displays[]` entry, it cannot fail a track's MST
union. So it is a production change, not a staging one.

## Done looks like

The track info dialog on both an `-ncbiRefSeqGff` and an `-ncbiGff` track names
the annotation, its provider, its release date and our retrieval date; and
`hubtools/src/enhanceConfig.test.ts` pins that a hub with no `ncbi.json` gets a
track with no such metadata and an otherwise intact config.
