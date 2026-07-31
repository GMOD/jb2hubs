# MAF row → other genome navigation on the portal

Feasibility survey, 2026-07-30. Plugin-side design lives in
`~/src/jbrowse-components/agent-docs/guides/MAF_CROSS_VIEW_NAVIGATION.md`; this
note is the portal half — which tracks can support it and what `hubtools` has to
emit.

The idea: a MAF row carries the aligned species' own `chr`/`start`/`strand`, so
if that species is a genome this portal hosts, the row is a one-click jump into
its own view. The portal is the natural home for it because it already has the
genomes loaded.

**The plugin side is built.** A sample entry now takes an optional
`assemblyName`, and rows that have one get "Open &lt;species&gt; chr:start-end in
new view" in the drag-selection right-click menu. Nothing here has to change for
tracks that don't set it. What's left is portal-side: emit the field.

## Which tracks qualify

| track | sample ids look like | resolvable to a portal assembly |
| --- | --- | --- |
| `hubs/mouseStrains/<strain>` (×16) | `mm10 SPRET_EiJ PWK_PhJ … rn6` | 17/17 exact |
| `hg38-cactus241wayBM` | `Acinonyx_jubatus` | 207/217 by scientific name |
| `hg38-cactus447way` | `Genus_species` | 261/445 |
| `hg38-multiz470way` | `HLnomLeu4`, `HLmacFas6` | 0/319 — Hiller lab ids |

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

## Portal-side work

`hubtools/src/createTrackConfiguration.ts` emits the sample list, with
`assemblyName` filled in from `speciesOrder`. For mouseStrains that's a lookup
against directory names — no taxonomy involved. Precomputed and shipped in the
config, exactly like `synteny_pairs.json` precomputes assembly pairs.

## Three unrelated bugs found while measuring

- `createTrackConfiguration.ts:29` wires `data.summary` → `summaryAdapter` but
  ignores `data.frames`, even though UCSC ships `maf/BALB_cJ.bigMafFrames.bb`
  right next to it. CDS frames, codon view, and codon conservation are all dark
  in the portal for want of ~5 lines.
- The same function never sets `samples` or `nhLocation`, so mouseStrains MAF
  rows come only from data discovery and the tree sidebar is empty —
  `speciesOrder` is sitting in the metadata unused. This is also the wiring
  navigation needs, so fixing it is step one either way.
- `galGal6-net*` (×3) and `mm39-netGCF_003668045.3` are `.net.bb` chainNet files
  typed as `MafTrack`/`BigMafAdapter`, with `/gbdb/` paths that aren't fetchable
  and `samples: [{id: '2'}]` from a mis-parse of `speciesLabels`. Those tracks
  can never load.

## Suggested order

Fix the `samples`/`nhLocation`/`frames` wiring first — it lights up the portal's
existing MAF tracks (tree sidebar, codon view) and produces the sample list that
navigation hangs off. Then add `assemblyName` to the mouseStrains sample
entries and the plugin-side menu item.
