---
name: website
description:
  'The symlink-swap deploy and why it replaced an in-place untar, plus the
  website internals worth knowing: search index, launch page, astro build log
  filter, taxonomy builder.'
---

# Website deploy and internals

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## The website deploy is a symlink swap, and the old one was a scheduled outage

`website/deploy.sh` (`pnpm run deploy`, `pnpm run deploy:staging`) unpacks the
build into `/var/www/releases/<target>/<utc-timestamp>/`, verifies it, and then
`mv -T`s the `/var/www/html` symlink onto it — one `rename(2)`, so a request is
served entirely by the old release or entirely by the new one.

What it replaced was a single npm-script line:

```
tar -czf - -C dist . | ssh myserver 'rm -rf /var/www/html/* && tar -xzf - -C /var/www/html'
```

That is not a bad failure mode, it is a **guaranteed** one. The tree is 5.4GB in
128,963 files, and unpacking it takes ~4 minutes — during which the webroot has
already been emptied, so genomes.jbrowse.org 404s for the whole window and
CloudFront caches those 404s past the end of it. That is what "the EC2 server is
showing 404" was on 2026-08-26 at 20:22–20:26 UTC; nothing had failed, a deploy
was simply in flight. A stream that _does_ die leaves the site broken with no
copy of it left anywhere.

Three properties are load-bearing:

- **Nothing is deleted until the new release serves traffic.** Old releases are
  pruned at the _start_ of the next deploy, not the end of this one, so peak
  disk is two releases (11GB of the 34GB free) rather than three.
  `KEEP_RELEASES=2` is therefore "current plus one rollback", and the prune
  keeps `keep - 1` because the incoming release does not exist yet — an
  off-by-one here silently costs 5.4GB per target.
- **Both guards must run before the swap.** A local failure is invisible to a
  pipeline (its exit status is the last command, so a truncated archive with a
  healthy `ssh` exits 0 — that is how the old line could have invalidated
  CloudFront over a half-uploaded site). So the remote unpack runs under
  pipefail, and the file count is compared against the local one before the
  symlink moves. Both were tested by injecting a truncated stream and a short
  archive: both abort with the previous release still serving.
- **`/var/www` is owned by `ubuntu`** and the webroots are symlinks. Without the
  first the swap cannot happen unprivileged; without the second `mv -T` refuses.
  The script migrates a real-directory webroot on its own, so a rebuilt server
  needs only the `chown`.

**tar+zstd, not rsync**, and the reason is `prebuild`: it runs `pnpm clean`, so
every one of the 129k files has a fresh mtime on every build. rsync's quick
check is size+mtime, so it would consider the entire tree changed and round-trip
per file — which is what "rsync was slow" was. Making rsync worthwhile means
`--checksum` (reading 5.4GB on both ends) plus `--link-dest` against the
previous release to hardlink what did not change; that is a real option if
deploys need to get faster, but it is a different trade, not a drop-in.

## CloudFront keys its cache on the query string

Both distributions (`E12EBG02P68TDO` production, `E3IPPUV528KQIX` staging; one
EC2 origin, staging picked by an `X-Site: staging` origin header) use the cache
policy `genomes-caching-optimized-querystrings`
(`1d7f303f-9966-41fa-9888-446fecbed7bc`): Managed-CachingOptimized with every
query string in the cache key, which also forwards the query to the origin.

A page here reads its question from the query (`/gene/?gene=`,
`/pangenomes/hprc/?region=`), and nginx answers a path without its trailing
slash with a 301 to the slash form. Until 2026-10-08 both distributions were on
Managed-CachingOptimized, whose key has no query, and each got the redirect
wrong its own way:

- **Production forwarded the query** (origin request policy Managed-AllViewer),
  so the 301 carried it, and CloudFront then served that one cached 301 to every
  query for a day. Measured: after `/pangenomes/hprc?region=chr1:1-2`, both
  `?region=ZZZ` and the bare path redirected to `?region=chr1:1-2`
  (`Hit from cloudfront`, age 476). Any reader's slash-less link set everyone's.
- **Staging forwarded nothing**, so its 301 dropped the query, which is what
  made the jbrowse-components figure generator time out on a staging url.

Do not move either back to a policy without the query in its key. The configs
from before the change are on ada as `~/cloudfront-<id>-before-*.json`.

## Key website internals

- `src/components/SearchPage.tsx` — client-side search over
  `public/searchIndex.json`, ranked by `rankEntries` (`searchScoring.ts`), which
  the header typeahead (`headerSearch.ts`) shares. `rankEntries` lowercases each
  entry's fields once per index, not once per keystroke. Every search box and
  table filter on the site splits a query with `src/lib/searchTerms.ts` and
  requires every term.
- `src/lib/searchIndex.ts` — the `IndexEntry` tuple, declared once for the
  generator that writes the index, the generators that read it back and the
  client:
  `[accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus, year, ucscRank, altAccession, aliases?]`,
  where `ncbiStatus` is a bitfield of `IS_REFERENCE` (1) and `IS_SUPPRESSED`
  (2). `aliases` is on UCSC rows only: for the 50 dbs whose organism UCSC spells
  as an abbreviated binomial (`D. melanogaster`), the common names GenArk gives
  the same organism, which search matches and no page shows — so `fly`, `yeast`
  and `worm` reach dm6, sacCer3 and ce11. `src/hooks/useSearchIndex.ts` fetches
  it through the same `loadJsonOnce` cache as the typeahead, so the two share
  one download.
- `src/pages/recently-updated/` — one server-rendered page per GenArk category
  (`[category].astro`) plus the all-categories `index.astro`, linked as tabs.
  The index page forwards the old `?category=` links to the category's page.
- `src/recentlyUpdated.json` — build-time generated data for recently-updated
  page, from `genark2jbrowse/hubFirstSeen.json` (below)
- `src/pages/ucsc/launch.astro` — turns a UCSC `hgTracks?db=…&position=…` query
  into a JBrowse launch on `/ucsc/<db>/config.json`, opening the
  defaultSession's tracks (read from `configs-minimal/`) plus any
  `<track>=pack`. A relative UCSC link resolves against the JBrowse app's own
  page and 404s, so hubtools' `ucscFormatDetails` (`ucscDetailLinks.ts`) points
  them here: the ones inside a data column (NCBI Orthologs' `url`), and those in
  trackDb `url`/`urls`, which it turns into details-panel links the way hgc does
  (kent's `replaceInUrl` and `printIdOrLinks`). A comma list stays unlinked,
  since jexl has no map. `enhanceConfigObject`'s `ucscDb` turns the trackDb
  links on and names `$D`: the db for a UCSC config, the accession for a GenArk
  one, which UCSC uses as the hub's db name. The NCBI GFF tracks have no
  trackDb, so `addNcbiGffLinks` (`ncbiGff.ts`) links their GeneID and transcript
  accessions from the file's own attributes. A `formatDetails` callback sees the
  feature as a plain object, so it reads `feature.url`: `get(feature,…)` throws
  there and replaces the whole panel with an error.
- `astroBuild.sh` — `astro build` with its per-route log collapsed into a
  counter. Astro logs one line per generated route at info level
  (`core/build/generate.js`, `logRenderTime`) and offers no knob short of
  `--silent`, which would also drop the vite warnings and the build summary.
  This site has one route per GenArk accession, so on 2026-09-09 those lines
  were **129,261 of run.sh's 130,796** — 98.8% of a full pipeline log, burying
  every line the pipeline itself wrote and making each `logs/run_*.log` ~50MB.
  Only the route lines match the filter; errors pass through, and a build that
  dies mid-generation still reports how far it got.
- `taxonomyBuilder/` — one `build_taxonomy.py` process for all 19 categories,
  not one each. It parses `nodes.dmp` + `names.dmp` (477MB, 2.6s) before it can
  build anything, and those cannot change between two categories of the same
  run, so the per-category loop spent ~50s re-reading the same two files:
  **52.9s → 4.7s**, with all 19 `.newick` files byte-identical. It still takes
  each category as its own `--input`/`--output` pair and still carries on past
  one it cannot build, so a bad input costs one tree rather than all 19. The
  `&& pnpm format` that used to follow it was vestigial — it ran _before_
  `pnpm generate`, and everything `generate` writes is either under `public/`
  (oxfmt-ignored) or gitignored.
