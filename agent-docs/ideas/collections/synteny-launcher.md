---
name: synteny-launcher
description:
  Unbuilt synteny launches and gene-page synteny polish: a whole-genome entry
  point, add-a-panel stacks, a multi-way mode, a current-builds toggle, catalog
  pages, label wording, smaller default stacks, shorter urls.
---

# Synteny launches, unbuilt

Every item here is undecided. The costs they quote are in
`agent-docs/reference/SYNTENY_LAUNCH_MEASUREMENTS.md`; changes that need
jbrowse-components first are in
`agent-docs/ideas/waiting-on-someone-else/synteny-upstream-asks.md`.

## On /synteny

- **A whole-genome entry point.** The whole-genome ribbon launch is a hairball
  (711 × 61 regions). Three launches over the same merged config and liftOver
  track read well, and none needs a derived file:
  - a `DotplotView` with `views: [{assembly, displayedRegionNames}, …]` and
    `minAlignmentLength: 100000`, the classic human–mouse figure;
  - a `CircularView` with `assembly: [a, b]`, per-assembly
    `displayedRegionNames`, `minAlignmentLength: 1000000` and `autoDiagonalize`;
  - ribbons narrowed to the main chromosomes, `minAlignmentLength: 100000`, no
    gene tracks.

  Every form needs the chromosome list from the sidecar (`chrom.sizes` above a
  length, or the `chr` names in `chromAlias`). No code in `website/src` launches
  a dotplot or circular view yet.

- **An "add an assembly" control.** A six-panel stack boots in 3.5 s from the
  same `syntenyViewUrl`, so the control is a url change: each added panel needs
  a chain to its neighbour (hg38 has 302 partners), and `planMultiSynteny`
  already plans such chains.
- **A one-versus-many mode.** 207 anchors have three or more liftOver mates (163
  UCSC dbs, 44 GenArk hubs); hg38 has 180 mates across 102 species, mm39 76
  across 47. The star track is in every such `config-staging.json`, with a lane
  picker and a drill-down back to a pairwise stack. In the mode the user picks
  the anchor, the lanes (the featured list by default) and optionally a gene,
  and the page launches with `rows: { kept, domain }`. `features.multiwayStar`
  gates it.
- **A "current builds" toggle** in place of the UCSC/GenArk sources toggle. 106
  of the 654 listed assemblies are UCSC builds a newer db of the same organism
  supersedes, and 932 of the 1,614 pairs touch one.
- **One page per assembly** listing its partners. `/synteny/info` is two counts;
  per-assembly pages would make the catalog searchable and give the accession
  page a target.

## On the gene page

- **Name the alignment, not the inference.** Synteny is what a reader concludes
  from the alignment we draw, and beside an ortholog row the word reads as a
  second claim. `/synteny`, its nav item and `SyntenySelector` keep the name,
  which is what that audience searches for.

  | where                          | says                                      | could say                                                   |
  | ------------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
  | `OrthologResultsTable.tsx:345` | `With synteny ({n})`                      | `With alignment ({n})`                                      |
  | `OrthologResultsTable.tsx:78`  | `Synteny` (row link)                      | `Compare`                                                   |
  | `OrthologResultsTable.tsx:76`  | "Open pairwise synteny: reference vs …"   | "Open the reference and … side by side, both centered on …" |
  | `GenePage.tsx:475`             | card title `Synteny`                      | `Compare genomes`                                           |
  | `GenePage.tsx:473`             | "…against ${ucscDb ?? accession}"         | the species' `scientificName` or `commonName`               |
  | `OrthologLaunchBar.tsx:97`     | `Synteny stack (n)`                       | `Alignment stack (n)`                                       |
  | `OrthologHelpDialog.tsx:59`    | "**Synteny** appears only where we host…" | keep the sentence, retitle the term                         |

- **"With synteny" is component state** (`OrthologResultsTable.tsx:252`), so a
  shared link drops the filter. `useUrlState` would keep it in the url, as it
  keeps `gene`, `ref` and `scope`.
- **Pass `minAlignmentLength`, and try `opacityByIdentity`.**
  `SyntenyViewOptions` (`jbrowseLinks.ts:96`) has neither. A floor of a few
  hundred bp removes most of the scrap a fragmented chain set draws in a 200 kb
  window, and an old host ignores the key. `opacityByIdentity` needs the fine
  tier's `de` tag; test it on a real ortholog window first.

## Shorter launch urls

- **A relative `?config=`.** `MERGE_API` (`jbrowseLinks.ts:8`) is an absolute
  API Gateway url, 91 encoded characters per link. A short path on the
  jbrowse.org bucket (a CloudFront behaviour or redirect at `/merge?hubIds=…`)
  makes it relative.
- **A `/launch/synteny?g=hg38,mm39&loc=…` page** that expands to the spec
  client-side would give a readable link that survives a regeneration, from one
  Astro page and the builder we have.

## Catalog names

- `syntenyCatalog.ts:193` sets `displayName` to `commonName ?? id`, so an
  assembly without a common name displays as an accession.
- `src/syntenyTracks.json` track names mix conventions in one string
  (`"GCA_000001905.1 (African savanna elephant (2009 genbank)) to goat (…) liftOver"`):
  the pipeline builds one half from the raw name and the other from a display
  name.
