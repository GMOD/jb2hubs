---
name: website
description:
  'The symlink-swap deploy and why it replaced an in-place untar, plus the
  website internals worth knowing: search index, launch page, astro build log
  filter, taxonomy builder.'
---

# Website deploy and internals

## The website deploy is a symlink swap, and the old one was a scheduled outage

`website/deploy.sh` (`pnpm run deploy`, `pnpm run deploy:staging`) unpacks the
build into `/var/www/releases/<target>/<utc-timestamp>/`, verifies it, and then
`mv -T`s the `/var/www/html` symlink onto it. The move is one `rename(2)`, so
the old release or the new one serves each request entirely.

The swap replaced an `rm -rf` of the webroot followed by an untar over ssh. The
tree is 5.4GB in 128,963 files and takes ~4 minutes to unpack, so every deploy
404'd the site for that window, and CloudFront cached the 404s past the end of
it.

The deploy depends on three properties:

- **Nothing is deleted until the new release serves traffic.** The script prunes
  old releases at the _start_ of the next deploy, so peak disk is two releases
  (11GB of the 34GB free); pruning at the end of this one would make it three.
  `KEEP_RELEASES=2` therefore means "current plus one rollback", and the prune
  keeps `keep - 1` because the incoming release does not exist yet. An
  off-by-one here costs 5.4GB per target and reports no error.
- **Both guards must run before the swap.** A pipeline's exit status is that of
  its last command, so a truncated archive piped into a healthy `ssh` exits 0;
  the old deploy line could have invalidated CloudFront over a half-uploaded
  site that way. The remote unpack therefore runs under pipefail, and the script
  compares the remote file count against the local one before it moves the
  symlink. We tested both guards by injecting a truncated stream and a short
  archive, and each aborted with the previous release still serving.
- **`ubuntu` owns `/var/www`**, and the webroots are symlinks. Without the
  ownership the swap cannot happen unprivileged, and without the symlink `mv -T`
  refuses. The script migrates a real-directory webroot itself, so a rebuilt
  server needs only the `chown`.

**tar+zstd, not rsync**, because `prebuild` runs `pnpm clean`, which gives every
one of the 129k files a fresh mtime on every build. rsync's quick check compares
size and mtime, so rsync would treat the entire tree as changed and make a round
trip per file, which is why "rsync was slow". For rsync to pay off, the deploy
would need `--checksum` (reading 5.4GB on both ends) plus `--link-dest` against
the previous release to hardlink the unchanged files. That is a real option if
deploys need to get faster, but it is a different trade-off, not a drop-in
replacement.

## CloudFront keys its cache on the query string

The production and staging CloudFront distributions (`E12EBG02P68TDO` and
`E3IPPUV528KQIX`; one EC2 origin, with an `X-Site: staging` origin header
picking staging) use the cache policy `genomes-caching-optimized-querystrings`
(`1d7f303f-9966-41fa-9888-446fecbed7bc`). The policy is Managed-CachingOptimized
with every query string in the cache key, which also forwards the query to the
origin.

A page here reads its question from the query (`/gene/?gene=`,
`/pangenomes/hprc/?region=`), and nginx answers a path without its trailing
slash with a 301 to the slash form. Until 2026-10-08 both distributions used
Managed-CachingOptimized, whose key has no query, and each distribution got the
redirect wrong in a different way:

- **Production forwarded the query** (origin request policy Managed-AllViewer),
  so the 301 included it, and CloudFront then served that one cached 301 to
  every query for a day. After a request for `/pangenomes/hprc?region=chr1:1-2`,
  both `?region=ZZZ` and the bare path redirected to `?region=chr1:1-2`
  (`Hit from cloudfront`, age 476), so one reader's slash-less link set the
  redirect for everyone.
- **Staging forwarded nothing**, so its 301 dropped the query, and the
  jbrowse-components figure generator timed out on a staging url.

Do not move either distribution back to a policy without the query in its key.
The configs from before the change are on ada as
`~/cloudfront-<id>-before-*.json`.

## Key website internals

- `src/components/SearchPage.tsx` runs client-side search over
  `public/searchIndex.json`, ranked by `rankEntries` (`searchScoring.ts`), which
  the header typeahead (`headerSearch.ts`) also uses. `rankEntries` lowercases
  each entry's fields once per index load, not once per keystroke. Every search
  box and table filter on the site splits a query with `src/lib/searchTerms.ts`
  and requires every term.
- `src/lib/searchIndex.ts` declares the `IndexEntry` tuple once, for the
  generator that writes the index, the generators that read it back and the
  client:
  `[accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus, year, ucscRank, altAccession, aliases?]`,
  where `ncbiStatus` is a bitfield of `IS_REFERENCE` (1) and `IS_SUPPRESSED`
  (2). Only UCSC rows have `aliases`. For the 50 dbs whose organism UCSC spells
  as an abbreviated binomial (`D. melanogaster`), `aliases` lists the common
  names GenArk gives the same organism. Search matches them and no page shows
  them, so `fly`, `yeast` and `worm` find dm6, sacCer3 and ce11.
  `src/hooks/useSearchIndex.ts` fetches the index through the same
  `loadJsonOnce` cache as the typeahead, so the two share one download.
- `src/pages/recently-updated/` has one server-rendered page per GenArk category
  (`[category].astro`) plus the all-categories `index.astro`, linked as tabs.
  The index page forwards the old `?category=` links to the category's page.
- `src/recentlyUpdated.json` is build-time generated data for the
  recently-updated page, from `genark2jbrowse/hubFirstSeen.json`.
- `src/pages/ucsc/launch.astro` turns a UCSC `hgTracks?db=…&position=…` query
  into a JBrowse launch on `/ucsc/<db>/config.json`, opening the
  defaultSession's tracks (read from `configs-minimal/`) plus any
  `<track>=pack`.
  - A relative UCSC link resolves against the JBrowse app's page and 404s, so
    hubtools' `ucscFormatDetails` (`ucscDetailLinks.ts`) points such links at
    this page. That covers links inside a data column (NCBI Orthologs' `url`)
    and trackDb `url`/`urls`, which it turns into details-panel links the way
    hgc does (kent's `replaceInUrl` and `printIdOrLinks`). A comma list stays
    unlinked, since jexl has no map.
  - `enhanceConfigObject`'s `ucscDb` option turns the trackDb links on and sets
    `$D`: the db for a UCSC config, and for a GenArk config the accession, which
    UCSC uses as the hub's db name.
  - The NCBI GFF tracks have no trackDb, so `addNcbiGffLinks` (`ncbiGff.ts`)
    links their GeneID and transcript accessions from the attributes in the GFF
    file.
  - A `formatDetails` callback receives the feature as a plain object, so it
    reads `feature.url`. `get(feature,…)` throws there, and the details panel
    shows an error in place of its contents.
- `astroBuild.sh` runs `astro build` and replaces its per-route log lines with a
  counter. Astro logs one line per generated route at info level
  (`core/build/generate.js`, `logRenderTime`), and its only option to stop them
  is `--silent`, which would also drop the vite warnings and the build summary.
  This site has one route per GenArk accession, so on 2026-09-09 those lines
  were **129,261 of run.sh's 130,796**, 98.8% of a full pipeline log. They
  buried every line the pipeline itself wrote and made each `logs/run_*.log`
  ~50MB. The filter matches only the route lines, so errors pass through, and a
  build that dies mid-generation still reports how far it got.
- `taxonomyBuilder/` runs one `build_taxonomy.py` process for all 19 categories.
  The script parses `nodes.dmp` + `names.dmp` (477MB, 2.6s) before it can build
  anything, and those files cannot change between two categories of the same
  run, so the old per-category loop spent ~50s re-reading them. One process took
  the build from **52.9s to 4.7s**, with all 19 `.newick` files byte-identical.
  The script still takes each category as a separate `--input`/`--output` pair
  and continues past one it cannot build, so a bad input costs one tree, and the
  other 18 still build.
