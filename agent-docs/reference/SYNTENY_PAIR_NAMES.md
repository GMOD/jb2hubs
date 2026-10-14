---
name: synteny-pair-names
description:
  Why a synteny pair lists assembly names as well as accessions, and the bug
  that hid every UCSC-named alignment until it did.
---

# A synteny pair is named twice, and only one of the names is an accession

`website/public/synteny_pairs.json` answers "do we host a whole-genome alignment
between these two assemblies, and what is its trackId". Every consumer holds
**RefSeq accessions**, which come from NCBI's ortholog reports. The catalog the
index is built from (`src/syntenyTracks.json`, which
`scripts/extractSyntenyTracks.ts` extracts from the hosted configs) names each
assembly the way its config does, and for a UCSC-native genome that is the
browser db: `hg38`, not `GCF_000001405.40`.

An index that keeps only pairs whose halves both start with `GCF_` drops every
track that names a UCSC db: 586 of the 3,094 tracks for human alone. With the
reference left on its Human default, `syntenyLink` then matches nothing, so no
ortholog row gets a **Synteny** link and `planMultiSynteny` returns null every
time. On 2026-08-26 BRCA1 had 0 of 549 rows linked under that rule and 39 after
the fix. No outside check catches the loss, because a page with the links
missing looks the same as a page for species with no alignment.

## What the file holds

`"<accession1>,<accession2>": [trackId, name1, name2]`, with the names in the
same order as the key. Membership and the UCSC db come from
`public/ortholog_index.json`, which `pnpm generate` writes just before this
file, and that order keeps the two in agreement: a pair helps only if the
ortholog table can show both halves as rows. The names are the track's
`assemblyNames`. Since `ortholog-index/2` the ortholog index holds only an
accession list and a `ucscDb` map, which the generator uses to resolve those
names to accessions.

The generator enforces two rules, and a break in either raises no error:

- **Same-genome pairs are skipped.** 18 tracks compare a genome with itself
  under another name, such as UCSC `dm6` against the GenArk build of the same
  assembly, or two versions of Arabidopsis. Clients match on the
  version-stripped base, so those pairs would answer "is A syntenic with A" and
  give a row a synteny link to itself.
- **Both liftOver directions are kept**, as two keys. `syntenyLink` prefers the
  forward one and flips the names for a reverse hit, so the names always come
  back in the order of the arguments.

## Why the names have to travel with the trackId

A launch URL is a merged config plus panel assembly names. `mergeConfig`
resolves a hub id that is not `GC[AF]` to `/ucsc/<id>/config.json`, so the human
half of a comparison must be merged and named as `hg38`. A request for
`GCF_000001405.40` fetches the GenArk hub, which lacks the track and whose
sequence 404s, which is why `accessionToJbrowseUrl` has always routed these to
`/ucsc`. On 2026-08-26 `?hubIds=GCF_049354715.1,hg38` returned a config with
both assemblies and `GCF_049354715.1_to_hg38_liftOver` among its 610 tracks.

**16 assemblies appear in the catalog under both names**, a UCSC db and the
GenArk accession of the same assembly: dm6, danRer11, sacCer3, triMan1, canFam4,
canFam6, galGal6, susScr11, bosTau8, bosTau9, xenTro10, felCat9, equCab3,
panTro6, rheMac10 and neoSch1 (counted 2026-09-24). A `LinearSyntenyView` opens
one panel per genome, so such a genome can fill only one panel, and when a
stack's two flanking links disagree on its name one link has to go.
`resolveStackNames` in `syntenyPairIndex.ts` holds the only copy of that rule.
It fixes names left to right, and a level whose link contradicts a settled name
keeps its slot but loses its track, as a level with no alignment does, so the
result is one missing ribbon instead of a panel with no track bound to it.

Two accessions with one base can be different assemblies, because NCBI keeps one
base across major versions: GCF_000002315.6 is GRCg6a (galGal6), not
Gallus_gallus-5.0, and GCF_000001635.26 is GRCm38 (mm10), not mm39.
`buildUcscMapping` (`website/src/utils/ucscMapping.ts`) therefore requires an
accession the UCSC entry names, or an assembly name that agrees. Falling back to
the newest UCSC db that claims the base mis-keyed seven genomes: danRer7,
galGal5, susScr3, bosTau6, xenTro3, felCat5 and melGal1.

The client still matches on the shared base, so the generator indexes a UCSC
db's tracks only while its accession is the newest hosted version of its base.
mm10's and canFam3's tracks stay out: a lookup of mouse or dog means GRCm39 or
Dog10K_Boxer_Tasha, and a panel of the older assembly would open on the wrong
coordinates.
