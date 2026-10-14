---
name: maf-cross-view-navigation
description:
  'Portal half of MAF row to other-genome navigation: which tracks support it
  and what hubtools emits. Shipped for mouseStrains.'
---

# MAF row → other genome navigation on the portal

The plugin half lives in jbrowse-components'
`plugins/maf/src/LinearMafDisplay/openSampleInNewView.ts`; this note is the
portal half — which tracks can support it and what `hubtools` emits. The track
survey is from 2026-07-30.

The idea: a MAF row carries the aligned species' own `chr`/`start`/`strand`, so
if that species is a genome this portal hosts, the row is a one-click jump into
its own view. The portal is the natural home for it because it already has the
genomes loaded.

**Built and shipped for mouseStrains.** A sample entry takes an optional
`assemblyName` + `assemblyConfigLocation`; rows that have them get "Open
&lt;species&gt; chr:start-end in new view" in the drag-selection right-click
menu, and clicking fetches that assembly out of its own hosted config and adds
it as a session assembly. Nothing changes for tracks that don't set the fields.

## Which tracks qualify

| track                              | sample ids look like           | resolvable to a portal assembly |
| ---------------------------------- | ------------------------------ | ------------------------------- |
| `hubs/mouseStrains/<strain>` (×16) | `mm10 SPRET_EiJ PWK_PhJ … rn6` | 17/17 exact                     |
| `hg38-cactus241wayBM`              | `Acinonyx_jubatus`             | 207/217 by scientific name      |
| `hg38-cactus447way`                | `Genus_species`                | 261/445                         |
| `hg38-multiz470way`                | `HLnomLeu4`, `HLmacFas6`       | 0/319 — Hiller lab ids          |

**mouseStrains is the deployment target.** Its `speciesOrder` metadata (e.g.
`hubs/mouseStrains/AKR_J/config.json`) is `mm10 SPRET_EiJ … rn6` — every entry
but the hub's own strain. Fifteen of those are sibling directories under
`hubs/mouseStrains/`, and `mm10`/`rn6` are both in `ucsc2jbrowse/configs/`. Same
cactus alignment, same assemblies the hub serves, so refNames match too. Every
row is an unambiguous jump.

**Don't ship the name join on the hg38 cactus tracks.** `Acinonyx jubatus` has
three assemblies in `searchIndex.json` (GCA_001443585.1 / GCF_003709585.1 /
GCF_027475565.1). The alignment used one of them; landing on another gives
silently wrong coordinates — worse than no link. That mapping has to come from
Zoonomia's published accession list, not from names. 470way is a non-starter
until someone has the Hiller assembly table
(`agent-docs/ideas/waiting-on-someone-else/maf-hg38-alignment-provenance.md`).

## What the portal now emits

`hubtools/src/createTrackConfiguration.ts` bigMaf branch:

- `samples` from the trackDb's `speciesOrder`, **reference genome first** — UCSC
  omits the alignment's own reference from `speciesOrder`, but the display draws
  it as a row (the MAF's first `s` line resolves like any other), so listing
  `samples` without it would silently drop the row sample-discovery used to
  produce. Verified against the actual data: the bigMaf's source tokens are
  `AKR_J.chr1`, `WSB_EiJ.chr1`, … — the ids from `speciesOrder` exactly.
- `annotationAdapter` from `frames` (the `mafFrames.bb` UCSC ships next to the
  alignment), lighting up codon view and codon conservation.
- `assemblyName`/`assemblyConfigLocation` per sample, from the resolver
  `genark2jbrowse/src/processMouseStrainsHub.ts` passes in: strains →
  `https://jbrowse.org/hubs/genark/mouseStrains/<strain>/config.json`, mm10/rn6
  → `https://jbrowse.org/ucsc/<db>/config.json`. A `UriLocation`, so relative
  uris would resolve against the config being written; these are absolute anyway
  because a strain's config sits in a sibling directory, not under it.

Configs regenerated (`processMouseStrainsHub.ts` then
`createMouseStrainsChainTracks.ts` — the second re-adds the synteny tracks the
first overwrites).

Opening a sample in a new view asks the assembly manager with `has()`, which
does not report an unknown name to the Hubs plugin; `get()` would, and the
plugin would try to resolve the strain itself.

## Species trees and chainNet nets

`ucsc2jbrowse/src/buildBigMafTrack.ts` derives `nhLocation` for golden-path
alignments, through `resolveSpeciesTree.ts` listing the hgdownload directory
(4f10965). No hub publishes a tree, so mouseStrains' sidebar stays empty. A
chainNet net that UCSC types `bigMaf` is dropped in `getTrackModifications.ts`,
since it is a pairwise net and never loads as a MAF.
