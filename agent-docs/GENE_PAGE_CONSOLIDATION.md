# Gene pages: consolidating the gene-first views

Written 2026-08-27. A design note: everything in the order of work is a proposal
except step 4, which is done and marked so. Every count in it was measured
against the tree at `eae67744f68`.

The site has five "offerings" beyond assembly browsing, four of them
staging-only. Three of the four take the same input and differ only in how they
render it. This proposes a gene entity page that resolves a gene once and gives
the three somewhere to hang, and argues that the thing which decides whether
that works — request latency — has already been solved once here and applied to
only one of the three.

**Read the amendment below before the order of work.** The first draft proposed
absorbing all three views into that page and dropping `/synteny`; the decision
went the other way, and the shape is a hub with the deep tools keeping their own
pages.

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

**Tabs hide half the argument.** The case for the whole feature is that one gene
resolves into a species table and a gene-order picture together, with the deep
tools one click on from there. Someone landing on TP53 should scroll that, not
discover it behind a control.

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

## Amended 2026-08-27: a hub, not an absorber

The first draft of this note proposed folding all three views into one page and
dropping `/synteny` into the accession page. Colin decided otherwise on both
counts: **the synteny launcher stays its own page**, and **the protein browser
probably should too.** The amendment is an improvement, and the reason is worth
stating rather than just recording.

A tool is not a view. `/protein-browser` and `/synteny` each have a workflow of
their own — pick a gene, read the cartoon, launch a connected session, and in
the protein browser's case optionally start an EBI job that runs for minutes.
Neither degrades gracefully into a section of a summary page, and a page whose
sections take minutes to settle is not a summary page any more.

What was actually broken is narrower than "there are too many pages": three
separate search forms, three gene resolutions with no shared cache, and a nav
dropdown of five items with no stated relationship. None of that requires
absorbing the tools.

So the shape is a **hub**, in the way that NCBI Gene links out to BLAST rather
than embedding it:

- `/gene/<symbol>` — identity header, ortholog species table, gene-order
  picture, and launch cards into the deep tools.
- `/protein-browser`, `/synteny` — still pages, still in the nav, but reached
  with the gene already resolved so neither asks for it a second time.
- The shared layer is gene **resolution** and the `?gene=&ref=` contract, not
  rendering.

One thing gets no better under the hub and should be named: a dropdown of five
items is still a dropdown of five items unless the nav states the hierarchy. The
gene page has to read as the entry point and the tools as things reached from
it, or this trades a consolidation problem for an information-architecture one.

## Proposed order of work

1. **Extend the ortholog-assembler** to serve identity and the protein panel
   alongside the neighborhood. Keep the `PREFIX = 'neighborhood/v3'` discipline
   — a cache key that is versioned on assembler behaviour, so a resolver fix
   invalidates rather than serving a wrong answer forever (the v3 bump exists
   because human `TTN` had been resolving to TTR).
2. **Build `/gene/[symbol]`** as the hub: identity, ortholog table, gene-order
   picture, launch cards. `OrthologResultsTable` and `MultiSyntenyView` survive
   nearly unchanged — they are presentational.

   Build every data layer as a `*Client.ts` in the shape of
   `neighborhoodClient.ts`
   (`const viaApi = API ? await tryApi(…) : undefined; return viaApi ?? assembleLocally(…)`)
   **from the first commit**. That is what lets step 2 run against the
   browser-side assemblers and step 1 light up per layer with no call site to
   retrofit — and it is why the two steps can be taken in either order. Judge
   the result on staging, where the neighborhood layer is already Lambda-served;
   on a cold local tree that section is 15 serialized calls and you will be
   looking at a spinner rather than a page.

3. ~~Fold `/synteny` into the accession page.~~ Declined — see the amendment
   above. `/synteny` keeps its page and its nav entry.
4. ~~Delete `website/src/orthologs/ncbiOrthologs.ts`.~~ **Done 2026-08-27**, and
   it was not the pure duplicate this note first called it: its `searchGenes`
   returned `{geneId, symbol}` where `geneSearch.ts`'s returned symbols alone,
   and `SyntenySelector` needs the id to resolve the second species. The
   unification therefore moved the id into `geneSearch.ts` rather than deleting
   a copy — which also took the synteny typeahead off NCBI's throttled budget,
   since mygene answers in one unthrottled call where E-utils took two throttled
   ones. `dedupeHits` handles the wrinkle that surfaced: mygene returns a record
   per source, so an Ensembl-only duplicate arrives with no `entrezgene`.

Leave the EBI Clustal Omega alignment where it is — on demand, behind a button.
A broad panel's job runs for minutes, which is not page-load material at any
level of caching, and it is the clearest single argument for the protein browser
keeping a page of its own.

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
true of `main` only. Keeping it on its own page makes that cheap to live with —
the gene page's launch card for it stays staging-gated and lights up on release,
rather than a whole section of the hub shipping dark.

`/conserved-gene-order` has **no** external blocker. It renders SVG the site
draws itself from NCBI data, and it is already served by the Lambda. It is the
one staging view that could ship tomorrow, which makes it the natural second
section.

## Built 2026-09-01: the hub landed, as `/gene?gene=&ref=`

Step 2 of the order of work shipped, in the hub shape the amendment decided on,
and step 1 (the assembler serving identity and the table) did not — the ortholog
and identity layers still resolve in the browser.

What landed:

- **`/gene`** (`website/src/pages/gene.astro`, `components/GenePage.tsx`): one
  form (gene box, free-text reference species, example chips, the `/orthologs`
  help dialog), then an identity header, the ortholog species table, the
  conserved-gene-order figure, and launch cards. The URL is the query —
  `?gene=&ref=` plus `scope=` for the table and `anchors=`/`flank=` for the
  figure, all through `useUrlState`, so every deep link the two old pages
  accepted resolves here unchanged.
- **One resolution.** `components/geneHub.ts`'s `resolveGeneIdentity` (taxon →
  GeneID → esummary) is one SWR key, and every section is keyed on its answer:
  the table on `geneId`, the figure on NCBI's spelling of the symbol plus the
  gene's own taxon. The identity header is the esummary fields the ortholog
  search used to fetch and throw away, plus NCBI Gene, Ensembl (a symbol search
  — the identity carries no Ensembl id) and taxonomy links.
- **Sections fail on their own.** Each has its own SWR state and error line; a
  Lambda 504 on the figure leaves the table standing and vice versa.
- **The figure is gated on `features.multiSynteny`** and renders nothing when
  off, so production shows the identity, the table and the cards.
- **Launch cards**: `/protein-browser?gene=<symbol>&ref=<taxid>` behind
  `features.proteinBrowser`, and
  `/synteny?assembly=<ucscDb or accession>&gene=<geneId>:<symbol>` behind
  `features.synteny`, the assembly being the reference row's genome from the
  ortholog table (so the card appears once that table has an answer).
- **`/orthologs` and `/conserved-gene-order` are redirect stubs**: an inline
  `location.replace('/gene' + location.search)`, a meta refresh to `/gene`
  without JavaScript, canonical `/gene`. `OrthologSearch.tsx` and
  `MultiSyntenyExplorer.tsx` are deleted; `OrthologResultsTable` and
  `MultiSyntenyView` survived unchanged, as predicted. The file-scoped
  `react/set-state-in-effect` override went with the shell it excused — the hub
  reads the URL through `useUrlState` and needs no effect.

Verified in a staging dev server with puppeteer: `TP53`/human (652 rows, 830
figure paths), `Trp53`/mouse (the identity reports mouse, and the synteny card
names `mm39`), `/orthologs?…&scope=primates` and
`/conserved-gene-order?…&anchors=7` both landing on `/gene` with their query
intact, zero console errors.

What remains of the order of work:

- **Step 1**, extending `aws/ortholog-assembler` to serve identity and the
  ortholog table. `geneHub.ts` is the seam: `resolveGeneIdentity` and
  `fetchOrthologSet` are the two calls a `*Client.ts` in the shape of
  `neighborhoodClient.ts` would front. Until then the table costs the visitor's
  browser 3 serialized NCBI calls (taxon, symbol, esummary) plus the ortholog
  report, and the figure waits on the first three before it asks the Lambda.
- **Prerendering** human protein-coding genes with `getStaticPaths` — needs step
  1's cached JSON to be worth doing.
- **The nav** still has to state the hierarchy (hub first, tools reached from
  it); `Header.astro` and the home page are the lead's.
