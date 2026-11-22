---
name: pangenome-page-trim
description:
  The 2026-11-21 trim of /pangenomes/<id> is on main and not deployed. Left: the
  production deploy, the jbrowse-components tutorials that describe the old
  page, and the review items not taken.
---

# /pangenomes trim, state on 2026-11-21

**Landed** as `947ccf0e13c0` and `c53ca7d3b650` on main (Colin: "if you are
confident just do whatever you think is best"). What changed and why is in
`agent-docs/reference/PANGENOME_PAGES.md`, "The answer is a map, and JBrowse is
one button". The review behind it, with before and after renders of the page, is
the artifact https://claude.ai/artifact/Aev9kW2KoXYAV6ZZk6bWcq.

**Not deployed.** The deploy waits for another project's `run.sh` on ada (the
walks8 drawcheck gate, a jbrowse-components test runner) to finish. Ada's main
also held an unpushed homepage commit on 2026-11-21, which a `run.sh` would push
and deploy with this; `agent-docs/handoffs/conserved-gene-order-review.md` has
that state.

**Owed once it is deployed**, in jbrowse-components:

- Land the branch `pangenome-page-trim-docs` (`d7a31228cd`, worktree
  `~/src/jbc-pangenome-trim-docs`), which rewrites the four passages in
  `pangenome_hprc.md`, `pangenome_hprc_repeats.md` and
  `pangenome_hprc_haplotypes.md` that describe the old page ("commonest first",
  "under **More about this window**").
- Regenerate the figure `pangenome/genomes_hprc_loci`, a screenshot of the
  production HPRC page. Its selectors (`.ui-lanes`, `.ui-actions a.ui-btn`)
  still match.

**From the review, not taken:**

- The build and check scripts' findings (an asset gate that passes with no
  network, urls it never probes, five minigraph build scripts that are one) are
  listed in the artifact and were read, not re-verified.
- Rice and tomato genes carry RefSeq LOC ids, so sd1, DEP1 and GW5 are never
  named on their maps.
- `regionLaunches` still takes six arguments, the dataset table still repeats
  each UCSC reference's urls, and the tag vocabulary (`changeName`,
  `STATE_TAGS`) is still reached only from tests.
- `checkForms/printForms.ts:43` filters `end >= start` where tabix reads
  `end > start`.
