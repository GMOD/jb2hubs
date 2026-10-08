---
name: staging-flags-waiting-on-v5
description:
  multiwayStar is the one flag still staging-only in features.ts, and it waits
  on core v5.
---

# The flag still on staging

`synteny`, `multiSynteny`, `proteinBrowser`, `desktopLinks` and `pangenome` went
to production on 2026-10-08. `website/src/config/features.ts` holds one more,
which waits on a release, not a decision:

- **`multiwayStar`**: only `config-staging.json` carries the multi-way synteny
  star, since a display type a released host lacks is fatal once the track
  opens.

`pangenome` did not wait: its launches target `main`, where the
graphgenomeviewer plugin boots. A staging-only route has to be kept out of the
production sitemap again when one is next added; `website/astro.config.mjs`
dropped its `STAGING_ONLY` list with the last entry.

`aws/config-merger`'s in-memory config cache was written on 2026-09-01 and no
later commit touches that directory. Stacked gene-order launches work without
it; check that a `sam deploy` shipped it if merges are slow.
