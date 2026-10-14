---
name: gene-page-served-by-the-lambda
description:
  Serve /gene's identity and ortholog table from the ortholog assembler as the
  figure already is, then prerender human protein-coding genes from its cached
  JSON.
---

# The gene page served by the Lambda

Background: `agent-docs/reference/GENE_PAGE.md`.

## Identity and table from the assembler

The figure is one cached request; the identity and the ortholog table still cost
every visitor's browser throttled NCBI calls, and the figure waits on the
identity before it asks the Lambda. Extend `aws/ortholog-assembler` to serve
both. `geneHub.ts` is the seam: `resolveGeneIdentity` and `fetchOrthologSet` are
the two calls a client in the shape of `neighborhoodClient.ts` would front. Bump
the cache prefix with the change, as `neighborhood/v4` was.

## Prerender human protein-coding genes

About 20k pages through `getStaticPaths`, alongside the `?gene=&ref=` fallback
for every other gene and species. Those genes get real urls, a real `<title>`
and description, search-engine presence, and, with the Lambda's cached JSON
baked in at build time, a first paint instead of a spinner. The built tree was
128,963 files at `eae67744f68`, so the addition is unremarkable. Worth doing
only after the step above: the same cached JSON serves the build and the live
page.
