---
name: flip-staging-flags
description:
  synteny, multiSynteny and proteinBrowser are still staging-only in
  features.ts; what each flip needs first, as checked 2026-10-08.
---

# Flipping the staging flags that do not wait on core v5

`website/src/config/features.ts` holds seven flags on `staging`. `pangenome`,
`multiwayStar` and `desktopLinks` wait on a release and say so beside the flag.
The three below wait only on a decision, and each flip is a one-line edit.

- **`synteny`**: nothing owed. The launch works on `latest` as a spec session,
  minus `colorBy`, `drawCurves`, `autoDiagonalize` and `cigarMode`, and the page
  says so on production.
- **`multiSynteny`**: nothing technical owed. The flag gates the
  conserved-gene-order section of `/gene`, a page already live. The 29 s API
  Gateway question in `agent-docs/todo/slowness-synteny.md` gets real traffic
  only after the flip.
- **`proteinBrowser`**: run `pnpm check-protein-launches --host latest` over the
  full example set first. TP53 and SOD1 passed on 2026-09-01 and the other six
  were not run. The `alphamissense` tracks the page opens are in the committed
  `configs-minimal/hg38.json` and `hg19.json` as of 2026-10-08.
  `agent-docs/todo/proteinbrowser.md` follows the flip.

`aws/config-merger`'s in-memory config cache was written on 2026-09-01 and no
later commit touches that directory, so check that a `sam deploy` shipped it
before `multiSynteny` flips.
