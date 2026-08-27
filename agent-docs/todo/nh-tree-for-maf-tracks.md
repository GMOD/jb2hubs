# MAF tracks have no phylogenetic tree except on hg38

Neither builder emits `nhLocation` — not `createTrackConfiguration.ts` (hub
side) nor `buildBigMafTrack.ts` (golden-path side). hg38's three trees are
hand-written in `ucscMixins/hg38.json`, so every other assembly's MAF track has
no tree sidebar and no way to get one.

UCSC ships the `.nh` next to the alignment under a predictable name, so this is
derivable in both builders rather than a per-assembly mixin.

Sample wiring is step one for MAF row → genome navigation
([../MAF_CROSS_VIEW_NAVIGATION.md](../MAF_CROSS_VIEW_NAVIGATION.md)).

Re-checked 2026-08-08; the rest of the old MAF item was already done by then.
`getTrackModifications.ts` drops the 4 chainNet `.net.bb` tracks UCSC mistypes
as `bigMaf`, and both builders already emit `samples` (via
`mafSamplesFromSpeciesOrder`) and resolve `data.frames` into
`annotationAdapter`.
