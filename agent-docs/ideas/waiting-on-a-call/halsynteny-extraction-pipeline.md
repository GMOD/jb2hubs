---
name: halsynteny-extraction-pipeline
description:
  Source pairwise synteny from a Cactus/HAL alignment as a third static
  converter. Design only; nothing built.
---

# halSynteny extraction as a static pipeline stage

This design sources pairwise synteny tracks from a Cactus/HAL multiple alignment
with `halSynteny` and adds them to the static-generation pipeline.
`agent-docs/ideas/waiting-on-a-call/synteny-alignment-strategy.md` places
halSynteny as drill-down tier 2; this doc covers how to build it.

## A third converter

`genark2jbrowse/` and `ucsc2jbrowse/` are batch converters: each downloads a
data source, emits JBrowse configs and track data, and uploads them to S3 with
`uploadAll.sh`, and the Astro site reads the generated JSON
(`synteny_pairs.json`, `syntenyTracks.json`, `ortholog_index.json`). The only
dynamic parts are two small Lambdas (config-merger, ortholog-assembler).

A new `hal2jbrowse/` beside them would follow the same pattern: its `make.sh`
runs `halSynteny` over a chosen pair set, converts the output to the repo's PIF
track format, and writes config entries. Its **output is fully static**, PIF
files on S3 plus entries in the synteny catalog. The runtime browse path stays
as it is; `planMultiSynteny` and the pairwise launcher see more catalog edges.

halSynteny is a C++/HDF5 binary, and the HAL is large enough that random access
needs the file on local disk or EBS instead of streamed from S3. This stage
therefore runs on **one big instance as a one-off or periodic batch** instead of
the regular `make.sh` box. The files it writes are as static as the other
converters', and it reruns only when the HAL changes, which is rare.

## Why halSynteny, over salvaging the UCSC chains

- **It adds edges to the catalog graph, and the graph's shape limits
  multi-row.** `planMultiSynteny` orders an ortholog set into a chain where each
  _adjacent_ pair has a track, and a star-shaped catalog caps the chain at 3
  rows. A HAL yields _any_ pair, so we choose the graph's shape: extracting
  **tree-adjacent** pairs (each species against its nearest neighbor in the
  alignment's tree) makes the catalog path-shaped, and long chains follow with
  no further work. The competing answer needs no new data: the multi-way star
  track (`hubtools/src/multiwayStarTrack.ts`, `features.multiwayStar`) draws one
  lane per mate against the reference, so a reference-centred view has no chain
  length cap at all.
- **It emits GCF-native tracks.** UCSC chains name their genomes by UCSC db or
  GCA, so the pair index has to resolve those names to accessions and keep the
  names alongside (`agent-docs/reference/SYNTENY_PAIR_NAMES.md`). halSynteny
  output uses the HAL's genome and sequence names, so the builder sets
  `queryAssembly`/`targetAssembly` to GCF accessions. The only mapping it needs
  is a finite **HAL-genome-name → GCF accession** table, one row per genome,
  plus `refNameAliases`/chromAlias for chr↔NC\_ within each assembly, which
  GenArk already ships.

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

Every stage from PAF down exists. The **new code is three small pure-JS pieces**
that unit tests can cover:

- **`psl2paf`** converts PSL to PAF. PSL gives `blockSizes`, `qStarts`,
  `tStarts`, strand and the q/t sizes, which translate directly into a PAF
  `cigar` (`=`/`M` runs plus `I`/`D` gaps between blocks) with absolute
  coordinates. It translates formats and aligns nothing.
- **`halGenomeToAccession`** is the HAL-genome-name → GCF-accession map, a
  curated table with one row per HAL genome. It names `queryAssembly`/
  `targetAssembly` and the output files. The stage skips (and logs) a HAL genome
  with no hosted GenArk assembly, so it never writes a track that cannot launch.
- **catalog-append** writes `"GCF_A,GCF_B" -> trackId` into the synteny pairs
  index. It folds into `scripts/extractSyntenyTracks.ts` if the stage writes the
  track configs into the per-assembly hub configs that script already scans.

## trackId convention

The trackId follows the existing chain catalog, so `pickDefaultTrack`
(`lib/syntenyCatalog.ts`) and the launchers need no changes:
`${GCF_target}_to_${GCF_query}_halSynteny`. `pickDefaultTrack` already prefers
the `<target>_to_` form and the plain (non-`chainBridge`) variant, so a
halSynteny track coexists with any chain track for the same pair and is picked
deterministically.

## Coordinates and names

- **Sequence names.** halSynteny writes each genome's sequence names as the HAL
  has them. A HAL built from GenArk FASTA uses the assembly's native refNames,
  which bind directly. One built from UCSC-style FASTA (`chr1`) relies on the
  GenArk chromAlias bigBed (already ingested) through `refNameAliases`, so a
  `chr1` block navigates an `NC_000001.11` assembly. Check which naming each HAL
  uses before bulk extraction.
- **Strand.** PSL `strand` is query-relative (`+`/`-`, occasionally `++`/`+-`
  for translated alignments), while PIF and PAF expect the target forward with a
  query strand flag, so `psl2paf` flips the query coordinates when the strand is
  `-`.
- **Identity.** `make-pif`'s `de:f:` tag sets the synteny view's
  opacity/color-by-identity, so populate it from PSL
  `matches`/(`matches+misMatches`) instead of leaving the default.

## Pair selection

Each pair costs a pass of HAL random access, so all 447² pairs is infeasible,
and the views need only two slices:

- **Reference-anchored** (`human vs each`, ~446 pairs), which gives the ortholog
  drill-down a pairwise "Synteny" link for any mammal-vs-human result.
- **Tree-adjacent** (each genome against its nearest tree neighbor, ~446 pairs),
  which gives `planMultiSynteny` its long chains through a path-shaped graph.

That is ~900 pairs in total, a bounded one-off batch. Both slices come from the
HAL's tree (`halStats --tree`), so a script generates the pair list and nobody
maintains it by hand.

## Block size and the ortholog window

halSynteny's default blocks suit whole-genome ribbons, and at a ~300 kb ortholog
neighborhood window a default run can merge into a single block. Two
mitigations:

- Lower `--minBlockSize` for the extraction so neighborhood-scale structure
  stays visible.
- For base-level detail in a window, region-scoped
  `hal2maf --refGenome --refSequence --start --length` → per-pair PAF would
  work, but it runs per request, which breaks the static model. Defer it unless
  a use case needs base-level mismatches inside the gene window; coarse blocks
  are enough for the synteny-context ribbons the ortholog page uses now.

## Smallest first

Prove the whole loop on ~5 model mammals (human, mouse, rat, dog, cow): extract
the ~4–5 tree-path pairs, run `psl2paf → make-pif`, append to
`synteny_pairs.json`, and confirm `planMultiSynteny` yields a real 5-row chain
in the launched view. That run checks extraction, naming, chromAlias binding,
the catalog and the launcher before scaling to the full pair set. The pure-JS
pieces (`psl2paf`, the mapping table, catalog-append) can be written and
unit-tested before a HAL is on any box.

## Open decisions

- **Which HAL.** Zoonomia's 447-way (mammals, already run per the strategy doc)
  is the first target; confirm hosting, access and its genome→assembly naming.
  Non-mammal clades need their own HAL or fall to the minimap2 long tail.
- **Where the batch runs.** A one-off big EC2/Batch instance with the HAL on
  EBS, writing PIFs to the same S3 layout as the other converters; Lambda is
  out.
- **Refresh cadence.** The HAL is static, so rerun only on a new HAL release or
  when the hosted-assembly set changes enough to add or remove launchable pairs.
- **Where `psl2paf` goes.** `hubtools/` (shared, beside `chainTracks.ts`), so a
  future `hal2jbrowse/make.sh` and ad-hoc use can both call it.
