---
name: gene-page
description:
  What /gene is (one resolution, an ortholog preview, the gene-order figure,
  launch cards), the NCBI throttle that shaped it, and which layers the Lambda
  serves. Read before adding a gene-first view.
---

# The gene page

`/gene` (`website/src/pages/gene.astro`, `components/GenePage.tsx`) is the hub
for every gene-first view. Why it links out to `/protein-browser` and `/synteny`
instead of absorbing them, and the test a new section has to pass, are in
`agent-docs/architecture-decision-records/0007-gene-page-is-a-hub.md`. Open work
is in `agent-docs/ideas/ready/gene-page-served-by-the-lambda.md`.

## What the page holds

- **One form**: gene box, free-text reference species, example chips, the
  ortholog help dialog. The url is the query: `?gene=&ref=`, plus `scope=` for
  the table and `anchors=`/`flank=` for the figure, all through `useUrlState`.
- **One resolution.** `resolveGeneIdentity` in `components/geneHub.ts` (taxon,
  then the gene report) is one SWR key, and every section is keyed on its
  answer: the table on `geneId`, the figure on NCBI's spelling of the symbol
  plus the gene's own taxon.
- **A summary card**, a labelled facts grid in the shape of NCBI's summary box
  (Organism, Location, Also known as, See also), with NCBI Gene, Ensembl (a
  symbol search, since the identity has no Ensembl id) and taxonomy links.
- **The ortholog section opens on a preview of eight rows**, model organisms
  first (`previewOrthologs`: `COMMON_TAX_RANK` members, filled from the
  reference's own clade and then the rest), with Species, Location and Links
  only. "Show all N species" mounts the grouped table, toolbar and all; a "By
  clade" line mounts it with that clade open and scrolled into view (`openClade`
  on `OrthologResultsTable`). The "Limit to" scope control is in the full table
  and shows on the preview only when a deep link has a non-default scope. A
  preview is the default because the full table made human TP53's page 4,868 px
  tall, Primates alone filling three screens; with the preview it is 1,715 px
  with every section visible (2026-10-11).
- **The conserved-gene-order figure** (`GeneOrderSection.tsx`, gated on
  `features.multiSynteny`) starts at 15 species (`INITIAL_SPECIES`), up to 80.
- **Launch cards**: `/protein-browser/?gene=&ref=` behind
  `features.proteinBrowser`, and `/synteny` behind `features.synteny`, naming
  the reference row's genome from the ortholog table (so the card appears once
  the table has an answer).
- **Sections fail on their own.** Each has its own SWR state and error line; a
  Lambda 504 on the figure leaves the table standing and vice versa.

All four flags are on in production. `/orthologs` and `/conserved-gene-order`
are redirect stubs (`RedirectToGene.astro`: `location.replace` keeping the
query, a meta refresh without JavaScript, canonical `/gene/`), so every deep
link the two old pages accepted resolves here unchanged.

## NCBI calls are serialized in the browser

`ncbiFetch.ts` serializes every NCBI call through one promise chain with a
minimum gap, and reads its API key from `process.env`, which is always undefined
in the client bundle. So in a visitor's browser `MIN_GAP_MS` is 350 (110 with a
key) and calls never overlap, so wrapping them in `Promise.all` makes nothing
faster. Counted at `eae67744f68` (2026-08-27), when the three views were
separate pages:

| View                    | NCBI calls         | Floor at 350 ms serialized |
| ----------------------- | ------------------ | -------------------------- |
| `/orthologs`            | 3, +1 after render | ~1.4 s                     |
| `/protein-browser`      | 6                  | ~2.1 s                     |
| `/conserved-gene-order` | **15**             | **~5.3 s**                 |

The gene-order count follows from the assembler: `assembleNeighborhood` fetches
ortholog rows for the query gene and for each of `maxAnchors - 1` neighbours, 10
further calls at the default 11.

## The Lambda serves the figure, and only the figure

`aws/ortholog-assembler/` assembles a gene's ortholog neighbourhood server-side,
caches it in S3 and serves it with `Cache-Control: public, max-age=86400`. It
bundles `website/src/components/neighborhood.ts` through esbuild, so the Lambda
and the page share one assembler. `neighborhoodClient.ts` names the endpoint
(`ORTHOLOG_API`, the `/ortholog-set` route) and has no in-browser fallback: on a
cache hit the figure's 15 calls are one request.

The cache key is versioned on assembler behaviour (`PREFIX = 'neighborhood/v4'`
in `src/index.ts`), so a resolver fix invalidates old entries instead of leaving
wrong answers cached. v3 existed because human `TTN` had resolved to TTR; v4
keeps the symbol's case, so fly `Dl` (Delta) and `dl` (dorsal) no longer share
an entry.

The identity and the ortholog table still resolve in the visitor's browser. For
a species `knownTaxon` names, that is the Datasets symbol lookup and the
ortholog report, throttled as above, and the figure waits on the identity before
it asks the Lambda.

## The site is static

`astro.config.mjs` sets no `output`, and `website/deploy.sh` unpacks a tarball
and swaps a symlink, so there is no server to add SSR to. A gene page for an
arbitrary gene is therefore a query parameter, not `/gene/<symbol>`.
