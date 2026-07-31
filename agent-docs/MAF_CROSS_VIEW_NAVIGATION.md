# MAF row → other genome navigation on the portal

Feasibility survey, 2026-07-30. Plugin-side design lives in
`~/src/jbrowse-components/agent-docs/guides/MAF_CROSS_VIEW_NAVIGATION.md`; this
note is the portal half — which tracks can support it and what `hubtools` has to
emit.

The idea: a MAF row carries the aligned species' own `chr`/`start`/`strand`, so
if that species is a genome this portal hosts, the row is a one-click jump into
its own view. The portal is the natural home for it because it already has the
genomes loaded.

**Built and shipped for mouseStrains.** A sample entry takes an optional
`assemblyName` + `assemblyConfigUrl`; rows that have them get "Open
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
until someone has the Hiller assembly table.

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
- `assemblyName`/`assemblyConfigUrl` per sample, from the resolver
  `genark2jbrowse/src/processMouseStrainsHub.ts` passes in: strains →
  `https://jbrowse.org/hubs/genark/mouseStrains/<strain>/config.json`, mm10/rn6
  → `https://jbrowse.org/ucsc/<db>/config.json`. Absolute, because the MAF
  display fetches these itself rather than jbrowse-web resolving them against
  the config it loaded.

Configs regenerated (`processMouseStrainsHub.ts` then
`createMouseStrainsChainTracks.ts` — the second re-adds the synteny tracks the
first overwrites).

### Verified in a real browser

Loaded the regenerated AKR_J config in a local jbrowse-web build: 18 rows in
`speciesOrder` order, the right-click menu offers per-species jumps, and
clicking `Open SPRET_EiJ chr1:3129040-3129126` loaded the SPRET_EiJ assembly and
opened a second LGV there.

One rough edge, pre-existing and not from this change: the Hubs plugin these
configs load (`@cmdcolin/jbrowse-plugin-hubs`) reacts to a newly added session
assembly by opening `conn_<name>` against
`https://jbrowse.org/ucsc/<name>/config.json`. A GenArk strain has no `/ucsc/`
path, so the user gets a red 404 snackbar even though the navigation worked.
Worth teaching that plugin the GenArk layout (or scoping the auto-connect).

## Bugs found while measuring

- ~~`createTrackConfiguration.ts` ignored `data.frames`~~ — fixed, see above.
- ~~The same function never set `samples`~~ — fixed. `nhLocation` was in the
  same finding but is **not** available here: mouseStrains' trackDb ships no
  species tree, so the tree sidebar stays empty for it. The hg38 cactus/multiz
  tracks DO have trees on hgdownload
  (`goldenPath/hg38/cactus241way/hg38.cactus241way.nh`,
  `multiz470way/hg38.470way.nh`, `cactus447way/hg38.447way.nh.txt`) — wiring
  those in `ucsc2jbrowse/src/mergeBigFileTracks.ts` would light up the sidebar
  for the three biggest alignments, independent of navigation. Note the file
  names aren't uniform, so it needs a probe rather than a template.
- `galGal6-net*` (×3) and `mm39-netGCF_003668045.3` are `.net.bb` chainNet files
  typed as `MafTrack`/`BigMafAdapter`, with `/gbdb/` paths that aren't fetchable
  and `samples: [{id: '2'}]` from a mis-parse of `speciesLabels`. Those tracks
  can never load.

## What's left

- Wire the hgdownload `.nh` trees for the hg38 cactus/multiz tracks (sidebar, no
  navigation involved).
- Fix or drop the four mistyped chainNet `MafTrack`s.
- Navigation for the hg38 alignments stays blocked on assembly provenance:
  Zoonomia's accession list for cactus241/447way, the Hiller assembly table for
  multiz470way. The plugin fields are ready — only the mapping is missing.
