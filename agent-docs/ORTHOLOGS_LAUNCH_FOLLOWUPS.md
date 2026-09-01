# Ortholog browser launch — follow-ups

`/orthologs` went live on production 2026-07-22: `features.orthologs` is now a
literal `true` in `website/src/config/features.ts` rather than tracking
`PUBLIC_STAGING`. Everything below is what we knowingly left behind.

## Staging-gated follow-up views leave a dead end

`multiSynteny` and `proteinBrowser` are still staging-only, so a production
search renders the ortholog table and nothing after it — the "conserved gene
order" and "protein browser" links (`OrthologSearch.tsx`, gated on those two
flags) are hidden, and `conserved-gene-order.astro` / `protein-browser.astro`
redirect to `/`. Those two views are the payoff for running a search, so decide
whether they should ship alongside orthologs or stay held back.

Note the per-row **Synteny** and **Launch multi-species synteny view** links in
`OrthologResultsTable.tsx` are deliberately _not_ gated: they build JBrowse
`specUrl`s directly (`jbrowseLinks.ts`) instead of routing through the gated
`/synteny` page, so they work in production as-is.

They also never appeared on a default search until 2026-08-26, which is worth
knowing before trusting a "this feature works" claim about them — see
`SYNTENY_PAIR_NAMES.md`.

`conserved-gene-order.astro` links back to `/orthologs`, which is now always
reachable — no longer a link into a redirect.

## NCBI access is browser-direct and unkeyed

`website/src/components/ncbiFetch.ts` reads `NCBI_API_KEY` from `process.env`,
which is always undefined in the client bundle. `OrthologSearch` is a
`client:load` island, so every visitor runs the unkeyed path (350 ms minimum
gap, 429/5xx backoff) from their own IP. Fine for individuals; users sharing an
institutional NAT will collide and lean on the retry backoff.

The file's own header comment describes the intended fix — a server-side
assembler that holds the rate budget once and caches — but there is no
`website/src/pages/api` route, so this page doesn't use it. Worth revisiting if
real traffic produces 429s.

Revisited 2026-08-27 in `GENE_PAGE_CONSOLIDATION.md`: the filler now exists
(`aws/ortholog-assembler/`) and serves `/conserved-gene-order` only, so what
leaving `/orthologs` on the browser-direct path costs is measured there.

## Grouping costs one taxonomy request per search

The clade groups come from NCBI's `taxonomy/filtered_subtree` over the result
taxa — one POST, ~55 KB gzipped and ~1.5 s for a 549-species answer, issued
_after_ the rows are already on screen (`SearchResults` in
`OrthologSearch.tsx`). Until it lands the table is one flat group, which renders
identically minus the headings, and a failure is silent for the same reason:
nothing the reader asked for is missing.

The alternative was baking a taxon → clade map into `ortholog_index.json` at
build time. That is 41,517 distinct taxa to classify, so it means a ~4-minute
NCBI dependency inside `pnpm generate` and a new way for CI to fail, to save a
request that overlaps with reading the first group. Revisit only if the runtime
call becomes a rate-limit problem — and note the index no longer holds per-taxon
data at all (it is an accession list plus a `ucscDb` map, `ortholog-index/2`),
so this now means adding a third key rather than extending an existing row.

`CLADE_LADDER` in `orthologClades.ts` is a hand-picked list of ~28 taxon ids,
most-specific first, and each broad "other" entry only mops up what its narrower
siblings above did not take. Adding a clade is one line; the tests pin the
fall-through, so a new entry inserted in the wrong place fails rather than
silently emptying its neighbour.

## Smaller

- `runSearch` syncs `?gene=&ref=&scope=` with `history.replaceState`, so
  searches are shareable but don't create back-button history entries.
  Intentional — a search isn't really navigation — but `pushState` is the
  alternative if users expect back to undo a search.
- The clade sections open the reference's own clade and collapse the rest. There
  is no "expand all"; with 549 rows across 18 groups it would mostly be a way to
  make the page long again, but it is the obvious next control if people ask.
- Sorting is fixed (model organisms first, then alphabetical, within a clade).
  Sortable columns are the other obvious next control.
