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

**16 assemblies appear in the catalog under both names**, a UCSC db and the
GenArk accession of the same assembly: dm6, danRer11, sacCer3, triMan1, canFam4,
canFam6, galGal6, susScr11, bosTau8, bosTau9, xenTro10, felCat9, equCab3,
panTro6, rheMac10 and neoSch1 (counted 2026-09-24). A `LinearSyntenyView` opens
one panel per genome, so such a genome can only be one of them, and a stack
whose two flanking links disagree has to give one of them up.
`resolveStackNames` in `syntenyPairIndex.ts` is the single copy of that rule:
names are fixed left to right, and a level whose link contradicts a settled name
keeps its slot but loses its track — which is exactly what a level with no
alignment already did, so the failure mode is one missing ribbon rather than a
panel nothing binds to.

An earlier count here named 11 such assemblies, and seven of them — danRer7,
galGal5, susScr3, bosTau6, xenTro3, felCat5 and melGal1 — were a different
assembly that happens to share the accession's base. NCBI keeps one base across
major versions: GCF_000002315.6 is GRCg6a (galGal6), not Gallus_gallus-5.0, and
GCF_000001635.26 is GRCm38 (mm10), not mm39. `buildUcscMapping` fell back to the
newest UCSC db claiming the base, so accession pages launched those genomes and
this index keyed their tracks under the wrong accession. The mapping now needs
an accession the UCSC entry names or an assembly name that agrees
(`website/src/utils/ucscMapping.ts`).

A shared base still reaches the client, which matches on it, so the generator
indexes a UCSC db's tracks only while its accession is the newest hosted version
of its base. mm10's and canFam3's stay out: a lookup of mouse or dog means
GRCm39 or Dog10K_Boxer_Tasha, and a panel of the older assembly would land on
the wrong coordinates.
