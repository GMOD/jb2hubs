# halSynteny extraction as a static pipeline stage

Decision-oriented notes for sourcing pairwise synteny tracks from a Cactus/HAL
multiple alignment (`halSynteny`) and folding them into the existing
static-generation pipeline. Sibling to `SYNTENY_ALIGNMENT_STRATEGY.md`, which
frames halSynteny as drill-down tier 2; this doc is how it actually _builds_.

## Where this fits: a third converter, not a service

The pipeline is **generate-then-serve-static**: `genark2jbrowse/` and
`ucsc2jbrowse/` are batch converters that download a data source, emit JBrowse
configs + track data, and `uploadAll.sh` them to S3; the Astro site reads the
generated JSON blobs (`synteny_pairs.json`, `syntenyTracks.json`,
`ortholog_index.json`). The only dynamic pieces are two small Lambdas
(config-merger, ortholog-assembler).

halSynteny extraction is **the same shape as those converters**: a new
`hal2jbrowse/` (parallel to `genark2jbrowse/`, `ucsc2jbrowse/`) whose `make.sh`
runs `halSynteny` over a chosen pair set, converts the output to the repo's PIF
track format, and writes config entries. Its **output is fully static** — PIF
files on S3 + entries in the synteny catalog. Nothing about the runtime browse
path changes; `planMultiSynteny` and the pairwise launcher just see more catalog
edges.

The one wrinkle vs the other converters: halSynteny is a C++/HDF5 binary and the
HAL is large (random access wants the file on local/EBS, not streamed from S3),
so this stage runs on **one big instance as a one-off / periodic batch** rather
than the regular `make.sh` box. But that's a property of _where the generator
runs_, not of the pipeline model — the artifacts it produces are as static as
everything else, and it reruns only when the HAL changes (rarely).

## Why halSynteny specifically (vs salvaging the UCSC chains)

Two reasons that matter after the `planMultiSynteny` work:

- **It densifies the catalog graph, which is what caps multi-row.**
  `planMultiSynteny` orders an ortholog set into a chain where each _adjacent_
  pair has a track; a star-shaped catalog caps it at 3 rows. A HAL yields _any_
  pair, so we choose the graph shape — extract **tree-adjacent** pairs (each
  species vs its nearest neighbor in the alignment's tree) and the catalog
  becomes path-shaped, so long chains fall out for free.

- **It emits GCF-native tracks, sidestepping the identity blocker.** The
  deferred UCSC-chain bridge died because `syntenyTracks.json` is keyed in
  UCSC-db/GCA space and won't bind GCF-loaded GenArk assemblies (see
  `SYNTENY_ALIGNMENT_STRATEGY.md`, "Attempted 2026-06"). halSynteny output is in
  the HAL's own genome+sequence space, so we set
  `queryAssembly`/`targetAssembly` to GCF accessions when building the track —
  no GCA↔GCF↔UCSC-db identity layer needed. The only mapping required is a
  finite **HAL-genome-name → GCF accession** table (one row per genome), plus
  `refNameAliases`/chromAlias for chr↔NC_ within each assembly, which GenArk
  already ships.

## Pipeline stages

```
447.hal  (on EBS, big instance)
  │  halSynteny --queryGenome A --targetGenome B \
  │             [--minBlockSize N] [--queryChromosome chr] 447.hal A_vs_B.psl
  ▼
A_vs_B.psl
  │  psl2paf  (new, small — PSL block arrays map directly to PAF cigar)
  ▼
A_vs_B.paf  (qName/qStart/qEnd strand tName/tStart/tEnd + cigar from blocks)
  │  make-pif  (existing repo tool: bgzip + index, writes de:f: identity tag)
  ▼
GCF_A_to_GCF_B_halSynteny.pif.gz (+ .tbi/.gzi)
  │  createTrackConfiguration  (existing hubtools)
  ▼
SyntenyTrack { adapter: PairwiseIndexedPAFAdapter, assemblyNames:[GCF_A,GCF_B] }
  │  scripts/extractSyntenyTracks.ts  (catalog scan)
  ▼
synteny_pairs.json:  "GCF_A,GCF_B" -> "GCF_A_to_GCF_B_halSynteny"
```

Everything from PAF down already exists. The **new code is three small, pure-JS,
testable pieces**:

- **`psl2paf`** — PSL → PAF. PSL gives `blockSizes`, `qStarts`, `tStarts`,
  strand, and q/t sizes; that's a direct walk into a PAF `cigar` (`=`/`M` runs
  plus `I`/`D` gaps between blocks) with absolute coordinates. No alignment,
  just format translation.
- **`halGenomeToAccession`** — the HAL-genome-name → GCF-accession map (curated
  table; finite, one row per HAL genome). Used to name `queryAssembly`/
  `targetAssembly` and the output files. A HAL genome with no hosted GenArk
  assembly is skipped (logged), so it never produces an unlaunchable track.
- **catalog-append** — write `"GCF_A,GCF_B" -> trackId` into the synteny pairs
  index. Folds into `scripts/extractSyntenyTracks.ts` if the track configs are
  emitted into the per-assembly hub configs it already scans.

## trackId convention

Keep it consistent with the existing chain catalog so `pickDefaultTrack`
(`lib/syntenyCatalog.ts`) and the launchers need no changes:
`${GCF_target}_to_${GCF_query}_halSynteny`. `pickDefaultTrack` already prefers
the `<target>_to_` form and the plain (non-`chainBridge`) variant, so a
halSynteny track coexists with any chain track for the same pair and is picked
deterministically.

## Coordinate / naming details

- **Sequence names.** halSynteny emits each genome's own sequence names from the
  HAL. If the HAL was built from GenArk FASTA, these are the assembly's native
  refNames and bind directly. If built from UCSC-style FASTA (`chr1`), rely on
  the GenArk chromAlias bigBed (already ingested) via `refNameAliases` so a
  `chr1` block navigates an `NC_000001.11` assembly. Verify per-HAL which naming
  it uses before bulk extraction.
- **Strand.** PSL `strand` is query-relative (`+`/`-`, occasionally `++`/`+-`
  for translated); PIF/PAF want target-forward with a query strand flag.
  `psl2paf` normalizes (flip query coords when `-`).
- **Identity.** `make-pif`'s `de:f:` tag drives the synteny view's
  opacity/color-by-identity; populate it from PSL
  `matches`/(`matches+misMatches`) rather than leaving it default.

## Pair selection (what to actually extract)

Cost is per-pair × HAL random access; all 447² pairs is infeasible, but you
don't want them. Extract two slices and union:

- **Reference-anchored** (`human vs each`, ~446 pairs) — powers the ortholog
  drill-down's pairwise "Synteny" link for any mammal-vs-human result.
- **Tree-adjacent** (each genome vs its nearest tree neighbor, ~446 pairs) —
  powers `planMultiSynteny` long chains (path-shaped graph).

~900 pairs total, a bounded one-off batch. Both slices are derivable from the
HAL's tree (`halStats --tree`), so the pair list is itself generated, not
hand-maintained.

## Coarseness vs the ortholog window

halSynteny blocks are tuned for whole-genome ribbons; at a ~300 kb ortholog
neighborhood window a default run can collapse to one block. Mitigations:

- Lower `--minBlockSize` for the extraction so neighborhood-scale structure
  survives.
- For genuine base-level detail in a window, the alternative is region-scoped
  `hal2maf --refGenome --refSequence --start --length` → per-pair PAF, but that
  is a _dynamic_ path (per-request) and breaks the static model — defer unless a
  use case demands base-level mismatches inside the gene window. For
  synteny-context ribbons (the current ortholog use case) coarse blocks are
  fine.

## Smallest-first

Prove the whole loop on ~5 model mammals (human, mouse, rat, dog, cow): extract
the ~4–5 tree-path pairs, run `psl2paf → make-pif`, append to
`synteny_pairs.json`, and confirm `planMultiSynteny` yields a real 5-row chain
in the launched view. This validates extraction + naming + chromAlias binding +
catalog + launcher before scaling to the full pair set. Pure-JS pieces
(`psl2paf`, the mapping table, catalog-append) can be written and unit-tested
ahead of having a HAL on a box.

## Open decisions

- **Which HAL.** Zoonomia 447-way (mammals, already run per the strategy doc) is
  the obvious first target; confirm hosting/access and its genome→assembly
  naming. Non-mammal clades need their own HAL or fall to the minimap2 long
  tail.
- **Where the batch runs.** A one-off big EC2/Batch instance with the HAL on
  EBS; output PIFs to the same S3 layout as the other converters. Not Lambda.
- **Refresh cadence.** The HAL is static; rerun only on a new HAL release or
  when the hosted-assembly set changes enough to add/remove launchable pairs.
- **psl2paf home.** `hubtools/` (shared, alongside `chainTracks.ts`) so both a
  future `hal2jbrowse/make.sh` and ad-hoc use can call it.
