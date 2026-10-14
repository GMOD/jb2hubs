---
name: gene-page-served-by-the-lambda
description:
  Serve /gene's identity and ortholog table from the ortholog assembler, as the
  figure already is, then prerender human protein-coding genes from its cached
  JSON.
---

# The gene page served by the Lambda

Background: `agent-docs/reference/GENE_PAGE.md`.

## Identity and table from the assembler

The figure takes one cached request, but every visitor's browser still makes
throttled NCBI calls for the identity and the ortholog table, and the page asks
the Lambda for the figure only after the identity resolves. Extend
`aws/ortholog-assembler` to serve the identity and the table as well. The Lambda
would run the two calls in `geneHub.ts`, `resolveGeneIdentity` and
`fetchOrthologSet`, behind a client modelled on `neighborhoodClient.ts`. Bump
the cache prefix with the change, as `neighborhood/v4` was.

## Prerender human protein-coding genes

`getStaticPaths` would add about 20k pages, beside the `?gene=&ref=` fallback
for every other gene and species. Those genes would get real urls, a real
`<title>` and description, and search-engine presence. With the Lambda's cached
JSON baked in at build time, their first paint would show the page, with no
spinner. The built tree was 128,963 files at `eae67744f68`, so the addition is
small. Do this after the step above, so the same cached JSON serves the build
and the live page.
