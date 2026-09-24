# Some NCBI GFFs are an older annotation release than NCBI publishes

NCBI re-annotates at the same accession (`GCF_…-RS_2025_07_03` becomes
`-RS_2026_07_03`), and `genark2jbrowse/downloadNcbiGff.sh` fetches a GFF only
when it is absent. `FETCH_UPDATES=1` revalidates every file with `wget -N`, but
nothing sets it routinely, so a hub keeps the release it was first built with.

Measured 2026-09-24 on a 1-in-15 sample of the GenArk `bgz/` GFFs (2,976 files),
comparing each file's `#!annotation-source` header with the
`annotation_info.name` in the hub's `ncbi.json`:

- 1,789 agree.
- 1,015 have no `#!annotation-*` header at all (1,008 of them "Annotation
  submitted by NCBI RefSeq").
- 56 hold an older `RS_` release than `ncbi.json` names: the GFF is stale. About
  840 of the 44,648 if the sample holds.
- 54 are the reverse: `ncbi.json` is older, and its 90-day refresh in
  `buildNcbiQueue.ts` catches up on its own.

The `-ncbiGff`/`-ncbiRefSeqGff` track's metadata reads the GFF header
(`hubtools/src/ncbiGffAnnotation.ts`), so the track names the release it holds.
The accession page reads `ncbi.json` instead, so for the stale 2% it names a
release the track does not serve.

## Done looks like

- `downloadNcbiGff.sh` re-fetches a GFF whose header names a different release
  from `ncbi.json`. The comparison is local, so the steady state costs no
  requests, and only the mismatches are downloaded, not the 44k a blanket
  `FETCH_UPDATES` would revalidate.
- The re-fetch goes through the same sort, bgzip, `.codes.tsv` and text-index
  gates as a new GFF. Those are mtime-gated on the GFF already.
- The accession page and the track agree on the release.
