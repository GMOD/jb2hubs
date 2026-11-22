---
name: pangenome-page-trim
description:
  The 2026-11-21 trim of /pangenomes/<id> is on main and not deployed. Left: the
  production deploy, the jbrowse-components tutorials that describe the old
  page, and the review items not taken.
---

# /pangenomes trim, state on 2026-11-21

**Landed** as `947ccf0e13c0` on main (Colin: "if you are confident just do
whatever you think is best"). What changed and why is in
`agent-docs/reference/PANGENOME_PAGES.md`, "The answer is a map, and JBrowse is
one button". The review behind it, with before and after renders of the page, is
the artifact https://claude.ai/artifact/Aev9kW2KoXYAV6ZZk6bWcq.

**Not deployed.** The deploy waits for another project's `run.sh` on ada (the
walks8 drawcheck gate, a jbrowse-components test runner) to finish. Ada's main
also held an unpushed homepage commit on 2026-11-21, which a `run.sh` would push
and deploy with this; `agent-docs/handoffs/conserved-gene-order-review.md` has
that state.

**Owed once it is deployed**, in jbrowse-components (`website/docs/tutorials/`):

- `pangenome_hprc.md`, "Launching tracks from the HPRC page": rows are no longer
  "commonest first" (the reference's row leads), and the paragraph on **More
  about this window** describes a fold that is gone. The other launches are
  links beside **Open in JBrowse**.
- `pangenome_hprc_repeats.md` (two places) and `pangenome_hprc_haplotypes.md`
  send the reader to **Graph** or **Haplotypes** "under **More about this
  window**". **Graph** is now the **Open in JBrowse** button; **Haplotypes** is
  a link beside it.
- The figure `pangenome/genomes_hprc_loci` is a screenshot of the production
  HPRC page. Its selectors (`.ui-lanes`, `.ui-actions a.ui-btn`) still match.

**From the review, not taken:**

- `check-pangenome-launches` fails `fly/chrM: whole-chromosome tier graph`: it
  boots the shortest chromosome expecting the coarse tier, and fly's shortest is
  the 19.5 kb chrM, which cuts fine. Not caused by the trim; the other 138
  launches pass.
- The build and check scripts' findings (an asset gate that passes with no
  network, urls it never probes, five minigraph build scripts that are one) are
  listed in the artifact and were read, not re-verified.
- Rice and tomato genes carry RefSeq LOC ids, so sd1, DEP1 and GW5 are never
  named on their maps; gene labels still overlap in four maps (HBA, CATHL, RPP5,
  RPP1).
- `regionLaunches` still takes six arguments, the dataset table still repeats
  each UCSC reference's urls, and the tag vocabulary (`changeName`,
  `STATE_TAGS`) is still reached only from tests.
- `checkForms/printForms.ts:43` filters `end >= start` where tabix reads
  `end > start`.
