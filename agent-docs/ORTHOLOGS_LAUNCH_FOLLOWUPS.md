# Ortholog browser launch — follow-ups

`/orthologs` went live on production 2026-07-22: `features.orthologs` is now a
literal `true` in `website/src/config/features.ts` rather than tracking
`PUBLIC_STAGING`. Everything below is what we knowingly left behind.

## Staging-gated follow-up views leave a dead end

`multiSynteny` and `proteinMsa` are still staging-only, so a production search
renders the ortholog table and nothing after it — the "conserved gene order" and
"protein alignment" links (`OrthologSearch.tsx`, gated on those two flags) are
hidden, and `conserved-gene-order.astro` / `protein-alignment.astro` redirect to
`/`. Those two views are the payoff for running a search, so decide whether they
should ship alongside orthologs or stay held back.

Note the per-row **Synteny** and **Launch multi-species synteny view** links in
`OrthologResultsTable.tsx` are deliberately *not* gated: they build JBrowse
`specUrl`s directly (`jbrowseLinks.ts`) instead of routing through the gated
`/synteny` page, so they work in production as-is.

`conserved-gene-order.astro` links back to `/orthologs`, which is now always
reachable — no longer a link into a redirect.

## NCBI access is browser-direct and unkeyed

`website/src/components/ncbiFetch.ts` reads `NCBI_API_KEY` from `process.env`,
which is always undefined in the client bundle. `OrthologSearch` is a
`client:load` island, so every visitor runs the unkeyed path (350 ms minimum gap,
429/5xx backoff) from their own IP. Fine for individuals; users sharing an
institutional NAT will collide and lean on the retry backoff.

The file's own header comment describes the intended fix — a server-side
assembler that holds the rate budget once and caches — but there is no
`website/src/pages/api` route, so this page doesn't use it. Worth revisiting if
real traffic produces 429s.

## Smaller

- The example chip is hard-coded to BRCA1 / taxon 9606 and forces the reference
  species select to human. Fine as an example; would need rethinking if we add
  several chips across species.
- `runSearch` syncs `?gene=&ref=` with `history.replaceState`, so searches are
  shareable but don't create back-button history entries. Intentional — a search
  isn't really navigation — but `pushState` is the alternative if users expect
  back to undo a search.
