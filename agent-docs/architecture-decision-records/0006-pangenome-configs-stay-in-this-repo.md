# ADR 0006 — The pangenome configs stay in this repo

- **Status:** Accepted
- **Date:** 2026-09-09
- **Affected:** `website/pangenome-config/*.json`,
  `website/pangenome-config/upload.sh`, `scripts/checkPangenomeAssets.mjs`

## Context

The graph data for /pangenomes is built in jbrowse-components and hosted under
`jbrowse.org/demos/`. The configs that name it could live there too, beside the
data, or here, beside the pages that launch them. On 2026-09-09 the configs had
drifted: this repo pinned HPRC v2.0 while the tutorials had moved to v2.1, and
moving the configs next to the data looked like the fix.

## Decision

The four pangenome configs live in `website/pangenome-config/` and are published
to `s3://jbrowse.org/pangenome/<name>/config.json` by `upload.sh`. A check, not
a move, guards against drift.

- **This repo is the only consumer.** A url census over jbrowse-components'
  `website/docs/tutorials/pangenome_hprc*.md` names `demos/hprc/<prefix>` and
  `demos/hprc/README.txt`, never
  `jbrowse.org/pangenome/hprc-grch38/config.json`: the tutorials build their
  sessions from the data. A config there would have no reader.
- **The publishing machinery is here.** `upload.sh` loops every `*.json`, stamps
  each with `upload_if_changed`, and invalidates `/pangenome/*` once.
- **Where a file lives does not cause drift; nothing checking it does.**
  `pnpm check-pangenome-assets` resolves every adapter url in the configs,
  reports a newer upstream version as STALE, and asserts each config is served
  at the url the site links, byte-for-byte as committed. It joins the idiom of
  `check-plugin-urls`, `check-sidecar-urls` and `check-config-compat`: about 20
  HEAD requests against our own bucket, so it needs no budget.

## Consequences

- **The served copy is the only copy a launch sees.** A launch reads `?config=`
  from the reader's browser, and genomes.jbrowse.org sends no CORS headers, so a
  config only in git fails before it starts. On 2026-09-09 every url inside
  `bovine-arsucd12.json` resolved while the config itself was 404 in the bucket,
  and `hprc-grch38.json` was live and stale; the byte comparison (b7d8cd7c290)
  is the check that would have caught both.
- **A config change needs `upload.sh` before the website deploy**, which the
  repo `CLAUDE.md` states as a rule. `run.sh` now gates the configs
  (`gate_pangenome_configs`) and publishes them on every run, staging included,
  so a committed config no longer waits on a hand step.
- **A config goes stale from a push upstream**, which push-triggered CI here
  cannot see; `check-pangenome-assets` is what notices.
