# jbrowse-ortholog-assembler

Serverless filler + durable cache behind the multi-way synteny view
(`/synteny-multi`). Given a gene, it assembles that gene's cross-species
ortholog neighborhood from NCBI (orthologs + protein-coding neighbor anchors +
induced taxonomy tree) and caches the result JSON to S3, so NCBI is hit only on
a cache miss and every later request is fast.

The assembler logic is **imported verbatim** from
`website/src/components/neighborhood.ts` (esbuild bundles it), so the Lambda and
the browser dev fallback run identical code — there is no duplicated assembler.

## Endpoint

```
GET /ortholog-set?gene=BRCA1&ref=9606[&flank=150000&maxAnchors=11]
-> { query, anchors[], species[]  (tree-ordered, coords+strand), tree }
```

Responses carry `X-Cache: HIT|MISS` and `Cache-Control: public, max-age=86400`.

## Deploy

```bash
pnpm install
./deploy.sh                                      # build (esbuild) -> sam build -> sam deploy
./deploy.sh --parameter-overrides NcbiApiKey=KEY # with an NCBI key (3->10 req/s, recommended)
```

`deploy.sh` is self-contained (no `samconfig.toml` / `--guided` needed): stack
`jbrowse-ortholog-assembler`, region `us-east-2`. Note the
`OrthologAssemblerApiUrl` output and set it as `PUBLIC_ORTHOLOG_API` in the
website env (already wired in `website/.env.staging`).

## Wire the website to it

Set the base URL in the website build env so the explorer uses the cached
endpoint instead of assembling client-side:

```
PUBLIC_ORTHOLOG_API=https://xxxx.execute-api.us-east-1.amazonaws.com/prod
```

Unset, the view falls back to in-browser assembly (fine for dev, but hits NCBI
per user — the reason this Lambda exists).

## Optional: fully static repeat hits

The cache bucket (`jbrowse-ortholog-cache-<account>`) can be fronted by
CloudFront so repeat requests are served as pure static objects, bypassing the
Lambda entirely. Not required — API Gateway already honors `Cache-Control`.
