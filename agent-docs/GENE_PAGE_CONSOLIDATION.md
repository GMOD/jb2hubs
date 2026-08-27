# Gene pages: consolidating the gene-first views

Written 2026-08-27. A design note, not a record of work done — nothing below is
implemented. Every count in it was measured against the tree at `eae67744f68`.

The site has five "offerings" beyond assembly browsing, four of them
staging-only. Three of the four are the same tool wearing three shells. This
proposes collapsing them into one gene entity page, and argues that the thing
which decides whether that works — request latency — has already been solved
once here and applied to only one of the three.

## What is actually there

| Page                    | Input            | Output                                    | Production? | LOC   |
| ----------------------- | ---------------- | ----------------------------------------- | ----------- | ----- |
| `/orthologs`            | gene + ref taxon | species table, JBrowse + synteny launches | **yes**     | 2,319 |
| `/conserved-gene-order` | gene + ref taxon | tree-ordered neighborhood SVG             | staging     | 1,795 |
| `/protein-browser`      | gene + ref taxon | domain cartoon, JBrowse session, MSA      | staging     | 3,751 |
| `/synteny`              | two assemblies   | JBrowse synteny launch                    | staging     | 1,261 |
| `/pangenomes/*`         | —                | HPRC + mouse launchers                    | staging     | 4,012 |

Plus 1,953 lines of test beside the gene-first four.

`features.orthologs` is a literal `true`; everything else tracks
`PUBLIC_STAGING`. So the production Explore dropdown holds **two** items, Search
and Orthologs. The complexity is not shipped complexity — it is four unlaunched
products with no decision about which is the site's second thing. That makes
this a product decision first and a refactor second.

## Three of them take the same input

`/orthologs`, `/conserved-gene-order` and `/protein-browser` all take a gene
symbol and a reference species, and differ only in how they render the answer.
The tree already says so: `orthologSearchUtils.ts`'s `geneUrl` is documented as
"the `?gene=&ref=` link shape the gene-first pages … all read back on mount",
and the three cross-link to each other through it —
`OrthologSearch.tsx:459,466`, `ProteinBrowser.tsx:510,511`,
`MultiSyntenyExplorer.tsx:259`.

That is a tab bar implemented as three page loads. Each shell carries its own
gene box, its own reference-species picker, its own example chips, its own help
dialog, and its own gene resolution with no cache shared across the navigation.

## The cost of three shells is measurable, and it is not layout

`ncbiFetch.ts` serializes every NCBI call through one promise chain with a
minimum gap, and reads its API key from `process.env` — always undefined in the
client bundle. So in a visitor's browser the gap is `MIN_GAP_MS = 350` and calls
never overlap. Counting the calls each view issues for a default query:

| View                    | NCBI calls         | Floor at 350 ms serialized |
| ----------------------- | ------------------ | -------------------------- |
| `/orthologs`            | 3, +1 after render | ~1.4 s                     |
| `/protein-browser`      | 6                  | ~2.1 s                     |
| `/conserved-gene-order` | **15**             | **~5.3 s**                 |

The gene-order number is the interesting one, and it is structural rather than
sloppy: `assembleNeighborhood` fetches ortholog rows for the query gene and for
each of `maxAnchors - 1` neighbors, which is 10 further calls at the default
`maxAnchors = 11`. Wrapping them in `Promise.all` buys nothing, because
`ncbiFetch` serializes them anyway.

Walking all three pages today therefore costs ~24 NCBI calls and ~8.4 s of pure
throttle — and at least three of those calls request the _identical_ URL, since
`orthologSet.ts`'s `resolveGeneId` and `geneStructure.ts`'s `resolveGene` both
GET `DATASETS/gene/symbol/<symbol>/taxon/<taxId>`.

## The fix already exists, deployed, wired to one view

`aws/ortholog-assembler/` is a Lambda plus durable S3 cache that assembles a
gene's ortholog neighborhood server-side and serves it with
`Cache-Control: public, max-age=86400` and an `X-Cache: HIT|MISS` header. It
imports `website/src/components/neighborhood.ts` verbatim through esbuild, so
the Lambda and the browser fallback run the same assembler with no duplicate.
`website/.env.staging` sets `PUBLIC_ORTHOLOG_API` to its endpoint.

So `/conserved-gene-order`'s 15 calls collapse to **one** request on a cache
hit. The two views that did not get the Lambda still pay 9 calls between them,
per visitor, forever.

`ncbiFetch.ts`'s own header states the principle — "per-user browsers can't
share a rate budget, but one serverless filler can" — and
`ORTHOLOGS_LAUNCH_FOLLOWUPS.md` records that `/orthologs` does not use it. The
conclusion was reached, the machinery was built, and one of three consumers was
connected.

**This is the load-bearing step of everything below.** A gene page is mostly not
new code; it is extending a deployed, cache-versioned assembler to cover the
identity and protein layers as well, and pointing one page at it.

## Why a gene page rather than one page with three tabs

A merged page with tabs would remove the duplicate shells and stop there. Naming
the result a gene entity page is worth more, for three reasons.

**Tabs hide two thirds of the argument.** The case for the whole feature is that
one gene resolves into a species table, a gene-order picture and a domain
cartoon at once. Someone landing on TP53 should scroll them, not discover two of
them behind controls.

**Several things belong to no current view.** The gene's own identity —
description, aliases, map location, organism — is already fetched and, per the
comment at `OrthologSearch.tsx:35`, "mostly throwing away". A gene page has a
header to put it in; three view-shaped pages do not.

**It completes the entity set.** The site already routes `/accession/GCF_…` and
`/taxonomy/9606`. Adding `/gene/TP53` makes the whole thing legible as "browse
by assembly, by taxon, or by gene" instead of five tools in a dropdown.

## What a gene page must not become

NCBI Gene, Ensembl and GeneCards already exist and already win on curated
annotation. Function summaries, GeneRIFs, phenotypes, pathways, expression,
clinical variants and publications are not our data, and chasing them is the
failure mode this idea invites.

The one question no other gene page can answer is what this site is for: show me
this gene across the assemblies you host, each one click from a browser that
opens. So the test for admitting a section is:

> Would this section exist if we hosted one genome?

Yes means it is somebody else's job and we link out. No means it is ours.

| Section                                     | Ours?                                           |
| ------------------------------------------- | ----------------------------------------------- |
| Ortholog species table + launches           | yes — exists only because we host them          |
| Conserved gene order across the tree        | yes                                             |
| Domain architecture across orthologs        | yes                                             |
| Cross-species protein alignment             | yes                                             |
| Which of our assemblies annotate this gene  | yes — nobody else can answer it                 |
| Gene structure / transcripts                | only as what drives the collapsed-intron launch |
| Function, pathways, phenotype, publications | no — link to NCBI/Ensembl                       |

Write the test down before building. The first "why is there no expression
section" is how this becomes GeneCards.

## The URL shape is constrained by the deploy model

`astro.config.mjs` sets no `output`, so the site is static, and
`website/deploy.sh` unpacks a tarball and swaps a symlink — there is no server
to add SSR to, and adding one would replace the deploy model rather than extend
it. `/gene/[symbol]` for arbitrary genes therefore needs either `getStaticPaths`
over a bounded list or a query parameter.

Do both:

- **Prerender human protein-coding genes** (~20k) with `getStaticPaths`. The
  built tree is already 128,963 files, so the addition is unremarkable. Those
  genes get real URLs, a real `<title>` and description, search-engine presence,
  and — if the Lambda's cached JSON is baked in at build time — a first paint
  instead of a spinner.
- **Fall back to `/gene?symbol=&ref=`** for every other gene and species.
  Slower, because it resolves live, but complete.

The prerendered half is what makes the Lambda worth extending twice over: the
same cached JSON serves the build and the live page.

## Proposed order of work

1. **Extend the ortholog-assembler** to serve identity and the protein panel
   alongside the neighborhood. Keep the `PREFIX = 'neighborhood/v3'` discipline
   — a cache key that is versioned on assembler behaviour, so a resolver fix
   invalidates rather than serving a wrong answer forever (the v3 bump exists
   because human `TTN` had been resolving to TTR).
2. **Build `/gene/[symbol]`** with the three existing views as sections.
   `OrthologResultsTable`, `MultiSyntenyView` and `ProteinDomainCartoon` survive
   nearly unchanged — they are presentational. What dies is three shells, three
   forms, three URL syncs, and two of the three gene resolvers.
3. **Fold `/synteny` into the accession page.** It is the oldest of the set
   (2025-12-02) and the weakest, because being assembly-first it asks for two
   genomes before it can say anything. Its payload already arrives from two
   better-anchored places: the per-row Synteny links and "Launch multi-species
   synteny view" in `OrthologResultsTable.tsx`, and the "Compare with other
   genomes" section at `accession/[id].astro:327`. Keep `SyntenySelector` as a
   control there, keep `/synteny/info`, drop the standalone page and its nav
   entry.
4. **Delete `website/src/orthologs/ncbiOrthologs.ts`.** Its `searchGenes`
   duplicates `geneSearch.ts`'s (E-utils versus mygene.info) and its
   `orthologSymbol` duplicates `fetchOrthologSymbol`. `SyntenySelector` is its
   only consumer, so step 3 frees it.

Leave the EBI Clustal Omega alignment where it is — on demand, behind a button.
A broad panel's job runs for minutes, which is not page-load material at any
level of caching.

## What this does not touch

`/pangenomes/*` is a different product: collection-first, HPRC- and
mouse-specific, and not linked from the nav at all. It does not compete for the
gene-page slot and is blocked on `@jbrowse/core` v5 regardless (see the
pangenome section of `../CLAUDE.md`). Four pages for an unlinked staging feature
is worth its own look, but not as part of this.

## Two release blockers to plan around, not wait on

`/protein-browser` cannot ship to production whatever happens here.
`geneStructure.ts:31` records why: the view needs a JBrowse build that bundles
the msaview and protein3d plugins and reads params from the URL hash, which is
true of `main` only. On a merged gene page that section ships dark on production
and lights up on release, which is fine — but it must not drive the design.

`/conserved-gene-order` has **no** external blocker. It renders SVG the site
draws itself from NCBI data, and it is already served by the Lambda. It is the
one staging view that could ship tomorrow, which makes it the natural second
section.
