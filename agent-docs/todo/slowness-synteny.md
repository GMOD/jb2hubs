# Conserved gene order: the waterfall, measured and mostly drained

Clicking into the multi-way synteny view had the "waterfall of loading bars"
that led to next.js. Measured on the staging API on 2026-09-01, the request
chain was:

HTML → React bundle (`client:only`, nothing before it) → `GET /ortholog-set`
(hit: 0.6–1.7 s for a 1.37 MB uncompressed body; cold miss: 15 serialized NCBI
calls in the Lambda) → render 80 of 873 rows → click a gene →
`/ortholog_index.json` (806 KB) + `/synteny_pairs.json` → `window.open` →
JBrowse → merge API fetches N full configs → N × chrom.sizes/chromAlias from
hgdownload.

What changed the same day, and what is left:

- **Production had no assembler url.** `PUBLIC_ORTHOLOG_API` was set only in the
  gitignored-except-staging `.env.staging`, so a production build would have run
  the 15-call browser assembler per visitor. The url is now a constant in
  `neighborhoodClient.ts` and the browser assembler is gone from the client
  path; the Lambda still imports `assembleNeighborhood`.
- **The body goes out compressed** once `MinimumCompressionSize: 1024` is
  deployed (`aws/ortholog-assembler/template.yaml`, needs a `sam deploy`).
- **The page renders before the bundle.** `client:load` instead of
  `client:only`: the form and example chips are in the HTML, and the state is
  the URL (`useUrlState`), which is SSR-safe by design. The fetch waits for
  hydration so a deep link does not spend a request on the default gene.
- **Drill-downs are links.** The 806 KB index and the pair catalog are
  prefetched once the neighborhood lands, and genes and branch points render as
  `<a href target="_blank">` — no `window.open` after an `await`, so popup
  blockers leave them alone and the first click no longer pays the download.
- **A branch point opens 7 genomes, not 15**, with an explicit "open all N"
  after it. The config merger caches fetched configs per Lambda instance.
- **Hover touches no React state** and the layout is memoized.

Still open:

- **The merge still ships full configs.** The plan was `minimal.json` for UCSC
  dbs, but `minimal.json` carries none of the liftOver `SyntenyTrack`s (hg38:
  239 in `config.json`, 0 in `minimal.json`), and every stacked launch names
  one, so it would have opened panels with no synteny track. A server-side prune
  — minimal's track rules plus the synteny tracks whose two assemblies are both
  in the request — is the shape of the fix, and it changes what every merge
  caller receives, so it is a decision rather than a patch.
- **N × chrom.sizes/chromAlias from hgdownload** per launch is the GenArk
  sidecar trade recorded in `../../CLAUDE.md`; nothing here changes it.
- **The 29 s API Gateway limit** against a 120 s Lambda: a slow cold miss is a
  504 the client retries once. Measure in CloudWatch before moving either.
