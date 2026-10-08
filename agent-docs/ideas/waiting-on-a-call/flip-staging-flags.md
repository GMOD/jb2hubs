---
name: flip-staging-flags
description:
  multiSynteny and proteinBrowser are still staging-only in features.ts and wait
  only on a decision; what each flip needs first.
---

# Flipping the staging flags that do not wait on core v5

`website/src/config/features.ts` holds six flags on `staging`. `pangenome`,
`multiwayStar` and `desktopLinks` wait on a release and say so beside the flag.
`synteny` went to production on 2026-10-08. The two below wait only on a
decision, and each flip is a one-line edit plus its prefix in `STAGING_ONLY`
(`website/astro.config.mjs`).

- **`multiSynteny`**: nothing technical owed. The flag gates the
  conserved-gene-order section of `/gene`, a page already live. The 29 s API
  Gateway question in `agent-docs/todo/slowness-synteny.md` gets real traffic
  only after the flip. `aws/config-merger`'s in-memory config cache was written
  on 2026-09-01 and no later commit touches that directory, so check that a
  `sam deploy` shipped it first.
- **`proteinBrowser`**: run `pnpm check-protein-launches --host latest` over the
  full example set first. `agent-docs/todo/proteinbrowser.md` follows the flip.
