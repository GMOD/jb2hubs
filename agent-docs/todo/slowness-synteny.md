---
name: slowness-synteny
description:
  Conserved gene order's chain of serial requests, measured and mostly cut; the
  ortholog Lambda logs decide what is left.
metadata:
  category: measure
  area: synteny
  first_move: 'Read the ortholog Lambda logs in late October.'
  order: 2
---

# Conserved gene order's serial requests, measured and mostly cut

Clicking into the multi-way synteny view had the "waterfall of loading bars"
that led to next.js. Measured on the staging API on 2026-09-01, the request
chain was:

HTML → React bundle (`client:only`, nothing before it) → `GET /ortholog-set`
(hit: 0.6–1.7 s for a 1.37 MB uncompressed body; cold miss: 15 serialized NCBI
calls in the Lambda) → render 80 of 873 rows → click a gene →
`/ortholog_index.json` (806 KB) + `/synteny_pairs.json` → `window.open` →
JBrowse → merge API fetches N full configs → N × chrom.sizes/chromAlias from
hgdownload.

131d3d4 removed most of that chain: the assembler url is a constant, the body
goes out compressed, the page renders before the bundle, drill-downs are links,
and a branch point opens 7 genomes. The 29 s limit and the merge size are left.

## The 29 s API Gateway limit

A 120 s Lambda sits behind a 29 s API Gateway limit, so a slow cold miss is a
504 the client retries once. Measure in CloudWatch before moving either limit.
On 2026-09-24, with the gene-order figure still staging-only, 23 invocations
ran, none over 29 s, with cold assemblies at 10–13 s on the v4 cache.
`multiSynteny` has served production since 8e42721 (2026-10-08), so the
late-October logs record real traffic. The ortholog-assembler log group keeps 30
days (`aws/ortholog-assembler/template.yaml:88`).

The config merger's per-instance config cache (131d3d4) handles the other half
of a stacked launch. The merger's log group keeps only 7 days
(`aws/config-merger/template.yaml:58`), so read it in the same sitting, and if
merges are slow, check that a `sam deploy` shipped the cache.

## A call: should the merge prune what it ships?

The merge ships full configs, and `minimal.json` cannot replace them for UCSC
dbs, because it has none of the liftOver `SyntenyTrack`s (hg38: 239 in
`config.json`, 0 in `minimal.json`) and every stacked launch names one. A
server-side prune would keep minimal's track rules plus the synteny tracks whose
two assemblies are both in the request. The prune changes what every merge
caller receives, so it needs a decision before anyone writes it.
