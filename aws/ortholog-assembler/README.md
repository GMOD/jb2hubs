# jbrowse-ortholog-assembler

Serverless filler + durable cache behind the conserved gene order view
(`/conserved-gene-order`). Given a gene, it assembles that gene's cross-species
ortholog neighborhood from NCBI (orthologs + protein-coding neighbor anchors +
induced taxonomy tree) and caches the result JSON to S3, so NCBI is hit only on
a cache miss and every later request is fast.

The assembler logic is **imported verbatim** from
`website/src/components/neighborhood.ts` (esbuild bundles it), and so is the
vocabulary of `flank` / `maxAnchors` values the form offers, so the Lambda
refuses exactly what the form cannot ask for. There is no browser-side assembler
any more: `website/src/components/neighborhoodClient.ts` names this API as a
constant and never assembles locally, because that was 15 serialized NCBI calls
per visitor.

## Endpoint

```
GET /ortholog-set?gene=672&ref=9606[&flank=150000&maxAnchors=11]    (a GeneID, or a symbol: gene=BRCA1)
-> { query, anchors[], species[]  (tree-ordered, coords+strand), tree }
```

Responses carry `X-Assembler-Cache: HIT|MISS` (not `X-Cache`, which API
Gateway's edge overwrites with its own) and
`Cache-Control: public, max-age=86400`. A request outside the form's vocabulary
— `ref` not a positive integer, `flank` or `maxAnchors` not one of the offered
values — is a 400 with a `message`, and so is a gene NCBI does not know (502).
The client shows that message verbatim.

## Known risk: the 29 s integration limit

A REST API Gateway integration times out at **29 s**, and the function's own
timeout is 120 s. A cold miss is ~15 serialized NCBI calls at 350 ms minimum
(110 ms with a key), so it normally finishes in 10–20 s, but a slow NCBI puts a
miss past 29 s: the caller gets a 504 while the Lambda keeps assembling and
writes the cache. The client retries once after 5 s for exactly that case.
Measure how often it happens in CloudWatch (function duration against the 29 s
line) before changing either timeout.

## Deploy

```bash
pnpm install
./deploy.sh                                      # build (esbuild) -> sam build -> sam deploy
./deploy.sh --parameter-overrides NcbiApiKey=KEY # with an NCBI key (3->10 req/s, recommended)
```

`deploy.sh` is self-contained (no `samconfig.toml` / `--guided` needed): stack
`jbrowse-ortholog-assembler`, region `us-east-2`. The `OrthologAssemblerApiUrl`
output is what `ORTHOLOG_API` in `website/src/components/neighborhoodClient.ts`
names; if the stack is ever recreated under a new id, update that constant.

`sam deploy` keeps the stack's `NcbiApiKey` when none is passed (it sends
`UsePreviousValue`), so a plain `./deploy.sh` does not drop the key. Check with
`aws lambda get-function-configuration` rather than trusting that.

Deployed 2026-09-24, the first deploy since 2026-06-28: input validation, the
renamed `x-assembler-cache` header, response compression, and cache prefix
`neighborhood/v4`. v4 keys keep the symbol's case, so fly `Dl` (Delta) and `dl`
(dorsal) no longer share an entry, and start empty, which drops v3 answers
cached while a Datasets failure sent the resolver to esearch's single guess.

Two things that deploy found, both silent until then:

- **The bundle needs a real `require`.** esbuild bundles the AWS SDK's CommonJS
  into an ESM file, and its `require("node:https")` throws "Dynamic require is
  not supported" at load, so every request was a 502 until the build gained the
  `createRequire` banner. `node -e 'import("./dist/index.mjs")'` after
  `pnpm build` reproduces it locally.
- **`MinimumCompressionSize` needs a new stage deployment.** CloudFormation set
  it on the API, but SAM makes a new deployment only when the routes change, so
  the stage kept serving the June snapshot uncompressed.
  `aws apigateway create-deployment --rest-api-id qkeuv38wf2 --stage-name prod`
  applied it: TP53's 1.15 MB neighborhood is 151 KB gzipped. Any later API-level
  setting needs the same step.

## Optional: fully static repeat hits

The cache bucket (`jbrowse-ortholog-cache-<account>`) can be fronted by
CloudFront so repeat requests are served as pure static objects, bypassing the
Lambda entirely. Not required — API Gateway already honors `Cache-Control`.
