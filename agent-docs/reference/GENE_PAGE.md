---
name: gene-page
description:
  What /gene, /orthologs and /conserved-gene-order are (one shared query form,
  an ortholog preview, the full table and the gene-order figure on their own
  pages, launch cards), the NCBI throttle that shaped them, and which layers the
  Lambda serves. Read before adding a gene-first view.
---

# The gene page

`/gene` (`website/src/pages/gene.astro`, `components/GenePage.tsx`) is the hub
for every gene-first view. Why it links out to `/protein-browser` and `/synteny`
instead of absorbing them, and the test a new section has to pass, are in
`agent-docs/architecture-decision-records/0007-gene-page-is-a-hub.md`; why the
ortholog table and the gene-order figure left it again is in
`agent-docs/architecture-decision-records/0008-gene-tools-get-their-own-pages.md`.
Open work is in `agent-docs/ideas/ready/gene-page-served-by-the-lambda.md`.

## What the page holds

- **One form**, `GeneQueryForm.tsx`, shared with `/orthologs` and
  `/conserved-gene-order`: gene box, free-text reference species, example chips.
  The url is the query, `?gene=&ref=`, through `useUrlState`.
- **One resolution.** `useGeneQuery` wraps `resolveGeneIdentity` in
  `components/geneHub.ts` (taxon, then the gene report) as one SWR key, and
  every section is keyed on its answer.
- **A summary card**, a labelled facts grid in the shape of NCBI's summary box
  (Organism, Location, Also known as, See also), with NCBI Gene, Ensembl (a
  symbol search, since the identity has no Ensembl id) and taxonomy links.
- **The ortholog section opens on a preview of eight rows**, model organisms
  first (`previewOrthologs`: `COMMON_TAX_RANK` members, filled from the
  reference's own clade and then the rest), with Species, Location and Links
  only, fetched by `useOrthologs` with the default scope. "All N species" links
  to `/orthologs`. A "By clade" line of chips and an "N of M orthologs" sentence
  sat under the preview until 2026-10-15; both went as clutter. A preview is the
  default because the full table made human TP53's page 4,868 px tall, Primates
  alone filling three screens; with the preview it is 1,715 px with every
  section visible (2026-10-11).
- **Launch cards**: Gene order (`/conserved-gene-order/?gene=&ref=`, behind
  `features.multiSynteny`), `/protein-browser/?gene=&ref=` behind
  `features.proteinBrowser`, and `/synteny` behind `features.synteny`, naming
  the reference row's genome from the ortholog table (so that card appears once
  the table has an answer).
- **Sections fail on their own.** Each has its own SWR state and error line.

All four flags are on in production.

## The orthologs page

`/orthologs` (`OrthologsPage.tsx`) takes `?gene=&ref=` plus `scope=`, the clade
NCBI is asked about, and draws the grouped table (`OrthologResultsTable.tsx`)
with its filter, download, tick boxes and launch bar. `OrthologSection.tsx`
draws both this table and `/gene`'s preview; passing `onScope` is what selects
the table and the "Limit to" control.

## The gene-order page

`/conserved-gene-order` (`GeneOrderPage.tsx`) takes the same `?gene=&ref=`, plus
`anchors=`/`flank=`/`layout=` for the figure, with those options in view.

- **The figure** (`GeneOrderSection.tsx`) starts at 15 species
  (`INITIAL_SPECIES`), up to 80. It opens in ordinal mode (`layout=bp` switches)
  and always mirrors a row whose locus runs opposite the reference's with no
  mark, since most such rows differ only in which strand the assembly stores.
- **A gene glyph spans its coding exons when NCBI's span is an outlier.** NCBI's
  gene range runs from its first transcript to its last, so a far-off UTR exon
  drew human OR51B5's 939 bp ORF as 165 kb. `longOutliers` in `neighborhood.ts`
  picks orthologs over twice their anchor's median span (25 of HBB's 190, 989 of
  TP53's 6,121) and `codingExtent.ts` maps their CDS onto the genome from one
  Datasets `product_report` POST per 1,000 genes. Asking for every ortholog
  would add about ten calls to TP53's build.
- **The 447-way Cactus button went on 2026-10-15.** It opened a human-only
  base-level alignment unrelated to the genes drawn. The synteny-lanes launch,
  which opens the figure's own species, is a link under the figure.

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

The cache key is versioned on assembler behaviour (`PREFIX = 'neighborhood/v5'`
in `src/index.ts`), so a resolver fix invalidates old entries instead of leaving
wrong answers cached. v3 existed because human `TTN` had resolved to TTR; v4
keeps the symbol's case, so fly `Dl` (Delta) and `dl` (dorsal) no longer share
an entry; v5 draws outlier glyphs over their coding exons.

The identity and the ortholog table still resolve in the visitor's browser. For
a species `knownTaxon` names, that is the Datasets symbol lookup and the
ortholog report, throttled as above, and the figure waits on the identity before
it asks the Lambda.

## The site is static

`astro.config.mjs` sets no `output`, and `website/deploy.sh` unpacks a tarball
and swaps a symlink, so there is no server to add SSR to. A gene page for an
arbitrary gene is therefore a query parameter, not `/gene/<symbol>`.
