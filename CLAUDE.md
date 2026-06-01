# jb2hubs

Monorepo that converts UCSC GenArk and UCSC browser hubs into JBrowse 2 configs,
and serves them via a static website.

## Packages

- `website/` — Astro + React static site (pages: search, recently-updated,
  accession, taxonomy, hubs, synteny, etc.)
- `genark2jbrowse/` — scripts + TS that process GenArk hubs into JBrowse configs
- `ucsc2jbrowse/` — scripts + TS that convert UCSC track hubs into JBrowse
  configs
- `hubtools/` — shared TS library used by the converter packages

## Key website internals

- `src/components/SearchPage.tsx` — client-side search over
  `public/searchIndex.json`
- `src/pages/recently-updated.astro` — server-rendered table with category
  dropdown filter
- `src/hooks/useSearchIndex.ts` — SWR fetch of the search index;
  `IndexEntry = [accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus]`
  (ncbiStatus: 0=none, 1=reference genome, 2=suppressed, 3=both)
- `src/recentlyUpdated.json` — build-time generated data for recently-updated
  page
