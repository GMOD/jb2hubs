---
name: staging-flags-waiting-on-v5
description:
  pangenome and multiwayStar are the flags still staging-only in features.ts,
  and both wait on core v5.
---

# The flags still on staging

`synteny`, `multiSynteny`, `proteinBrowser` and `desktopLinks` went to
production on 2026-10-08. `website/src/config/features.ts` holds two more, and
both wait on a release, not a decision:

- **`pangenome`**: the graphgenomeviewer plugin every graph launch loads
  error-pages each released host. Its prefix is the last entry in `STAGING_ONLY`
  (`website/astro.config.mjs`) and comes off with the flip.
- **`multiwayStar`**: only `config-staging.json` carries the multi-way synteny
  star, since a display type a released host lacks is fatal once the track
  opens.

`aws/config-merger`'s in-memory config cache was written on 2026-09-01 and no
later commit touches that directory. Stacked gene-order launches work without
it; check that a `sam deploy` shipped it if merges are slow.
