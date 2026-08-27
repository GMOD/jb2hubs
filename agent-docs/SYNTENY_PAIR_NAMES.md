# A synteny pair is named twice, and only one of the names is an accession

`website/public/synteny_pairs.json` answers "do we host a whole-genome alignment
between these two assemblies, and what is its trackId". Every consumer holds
**RefSeq accessions** — they come from NCBI's ortholog reports — while the
catalog it is built from (`src/syntenyTracks.json`, extracted from the hosted
configs by `scripts/extractSyntenyTracks.ts`) names assemblies however their
config does. For a UCSC-native genome that is the browser db: `hg38`, not
`GCF_000001405.40`.

`generateSyntenyPairIndex.ts` used to require **both** halves to start with
`GCF_`, which silently dropped every track naming a UCSC db. That is 586 of the
3,094 tracks for human alone, and it made the ortholog browser's headline
synteny feature dead on its most common search: with the reference left on its
Human default, `syntenyLink` matched nothing, so no row got a **Synteny** link
and `planMultiSynteny` returned null every time. Measured 2026-08-26 — 0 of 549
BRCA1 rows before, 39 after.

Nothing could have caught this from the outside. The links simply were not
rendered, which reads as "no alignment exists for these species" — the same
thing the page shows when that is true.

## What the file holds now

`"<accession1>,<accession2>": [trackId, name1, name2]`, the names in the same
order as the key. Membership and the UCSC db come from
`public/ortholog_index.json` — written just before it in `pnpm generate`, which
is what keeps the two agreeing: a pair only helps if both halves are rows the
ortholog table can show. The names themselves are the track's own
`assemblyNames`; the ortholog index only resolves those to accessions, which
since `ortholog-index/2` is all it holds — an accession list and a `ucscDb` map.

Two rules the generator enforces, both silent if broken:

- **Same-genome pairs are skipped.** 18 tracks compare a genome with itself
  under another name — UCSC `dm6` against the GenArk build of the same assembly,
  or two versions of Arabidopsis. Clients match on the version-stripped base, so
  those would answer "is A syntenic with A" and offer a row a synteny link to
  itself.
- **Both liftOver directions are kept**, as two keys. `syntenyLink` prefers the
  forward one and flips the names for a reverse hit, so the names always come
  back oriented to the argument order.

## Why the names have to travel with the trackId

A launch URL is a merged config plus panel assembly names. `mergeConfig`
resolves a non-`GC[AF]` hub id to `/ucsc/<id>/config.json`, so the human half of
a comparison must be merged and named as `hg38` — asking for `GCF_000001405.40`
fetches the GenArk hub, which does not contain the track (and whose sequence
404s anyway, which is why `accessionToJbrowseUrl` has always routed these to
`/ucsc`). Verified 2026-08-26: `?hubIds=GCF_049354715.1,hg38` returns a config
with both assemblies and `GCF_049354715.1_to_hg38_liftOver` among its 610
tracks.

**11 assemblies appear in the catalog under both names** (dm6, canFam3, danRer7,
galGal5, sacCer3, susScr3, bosTau6, xenTro3, felCat5, melGal1, triMan1). A
`LinearSyntenyView` opens one panel per genome, so such a genome can only be one
of them, and a stack whose two flanking links disagree has to give one of them
up. `resolveStackNames` in `syntenyPairIndex.ts` is the single copy of that
rule: names are fixed left to right, and a level whose link contradicts a
settled name keeps its slot but loses its track — which is exactly what a level
with no alignment already did, so the failure mode is one missing ribbon rather
than a panel nothing binds to.
