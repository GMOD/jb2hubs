---
name: maf-cross-view-navigation
description:
  'Portal half of MAF row to other-genome navigation: which tracks support it
  and what hubtools emits. Shipped for mouseStrains.'
---

# MAF row → other genome navigation on the portal

jbrowse-components' `plugins/maf/src/LinearMafDisplay/openSampleInNewView.ts`
implements the plugin half. This note covers the portal half: which tracks can
support the jump and what `hubtools` emits. The track survey is from 2026-07-30.

A MAF row records the aligned species' `chr`/`start`/`strand`, so when that
species is a genome this portal hosts, one click on the row can open the
matching region in a view of that genome. The portal hosts the target genomes'
configs, so it can supply each one.

**The jump has shipped for mouseStrains.** A sample entry takes an optional
`assemblyName` + `assemblyConfigLocation`. A row that has them gets "Open
&lt;species&gt; chr:start-end in new view" in the drag-selection right-click
menu, and a click fetches that assembly from its hosted config and adds it as a
session assembly. Tracks that don't set the fields behave as before.

## Which tracks qualify

| track                              | sample ids look like           | resolvable to a portal assembly |
| ---------------------------------- | ------------------------------ | ------------------------------- |
| `hubs/mouseStrains/<strain>` (×16) | `mm10 SPRET_EiJ PWK_PhJ … rn6` | 17/17 exact                     |
| `hg38-cactus241wayBM`              | `Acinonyx_jubatus`             | 207/217 by scientific name      |
| `hg38-cactus447way`                | `Genus_species`                | 261/445                         |
| `hg38-multiz470way`                | `HLnomLeu4`, `HLmacFas6`       | 0/319 (Hiller lab ids)          |

**mouseStrains is the deployment target.** Its `speciesOrder` metadata (e.g.
`hubs/mouseStrains/AKR_J/config.json`) is `mm10 SPRET_EiJ … rn6`, every entry
but the hub's own strain. Fifteen of those are sibling directories under
`hubs/mouseStrains/`, and `mm10` and `rn6` are both in `ucsc2jbrowse/configs/`.
The alignment is the same cactus run over the same assemblies the hub serves, so
the refNames match too, and every row maps to exactly one assembly.

**Don't ship the name join on the hg38 cactus tracks.** `Acinonyx jubatus` has
three assemblies in `searchIndex.json` (GCA_001443585.1 / GCF_003709585.1 /
GCF_027475565.1). The alignment used one of them, and a link to another opens
wrong coordinates with no error, which is worse than no link. That mapping has
to come from Zoonomia's published accession list, not from names. 470way needs
the Hiller assembly table first
(`agent-docs/ideas/waiting-on-someone-else/maf-hg38-alignment-provenance.md`).

## What the portal emits

The bigMaf branch of `hubtools/src/createTrackConfiguration.ts` writes:

- `samples` from the trackDb's `speciesOrder`, with the **reference genome
  first**. UCSC omits the alignment's reference from `speciesOrder`, but the
  display draws it as a row (the MAF's first `s` line resolves like any other),
  so a `samples` list without it would drop the row that sample discovery used
  to produce, with no error. We checked the data: the bigMaf's source tokens are
  `AKR_J.chr1`, `WSB_EiJ.chr1` and so on, exactly the ids in `speciesOrder`.
- `framesAdapter` from `frames` (the `mafFrames.bb` UCSC ships next to the
  alignment), which turns on codon view and codon conservation. JBrowse main
  also reads the old key, `annotationAdapter`, which configs built before
  2026-10-22 still use. A JBrowse release older than the rename reads only
  `annotationAdapter` and draws no codons from a newly built config.
- `assemblyName`/`assemblyConfigLocation` per sample, from the resolver that
  `genark2jbrowse/src/processMouseStrainsHub.ts` passes in. A strain maps to
  `https://jbrowse.org/hubs/genark/mouseStrains/<strain>/config.json`, and mm10
  and rn6 map to `https://jbrowse.org/ucsc/<db>/config.json`. The location is a
  `UriLocation`, so a relative uri would resolve against the config being
  written; these uris are absolute because a strain's config sits in a sibling
  directory, not under the one being written.

To regenerate the configs, run `processMouseStrainsHub.ts` and then
`createMouseStrainsChainTracks.ts`, which re-adds the synteny tracks the first
script overwrites.

Opening a sample in a new view asks the assembly manager with `has()`, which
does not report an unknown name to the Hubs plugin. `get()` would report it, and
the plugin would then try to resolve the strain itself.

## Species trees and chainNet nets

`ucsc2jbrowse/src/buildBigMafTrack.ts` derives `nhLocation` for golden-path
alignments by having `resolveSpeciesTree.ts` list the hgdownload directory
(4f10965). No hub publishes a tree, so mouseStrains' sidebar stays empty.
`getTrackModifications.ts` drops a chainNet net that UCSC types `bigMaf`,
because a pairwise net never loads as a MAF.
