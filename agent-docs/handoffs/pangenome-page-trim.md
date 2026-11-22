---
name: pangenome-page-trim
description:
  The 2026-11-21 review and trim of /pangenomes/<id> is on main and not
  deployed. Left: the production deploy, the jbrowse-components tutorials that
  describe the old page, and the review items not taken.
---

# /pangenomes trim, state on 2026-11-21

**On main, not deployed.** Three commits:

- `947ccf0e13c0`: the trim (reference row first, forms merged into rows, "N not
  aligned here", no headline, bars, fold or caption) and the lookup and graph
  fixes.
- `c53ca7d3b650`: gene names take room on their row, unnamed genes read dark on
  light, and `check-pangenome-launches` boots a chromosome the page calls wide.
- `7e4ad334b8e7`: the page opens with its graph drawn, where the cut is under
  5,000 nodes (Colin: "we should just draw it by default without row click").

What changed and why is in `agent-docs/reference/PANGENOME_PAGES.md`, "The
answer is a map, and JBrowse is one button" and "A row's change is drawn as
Bandage does". The review, with before and after renders, is the artifact
https://claude.ai/artifact/Aev9kW2KoXYAV6ZZk6bWcq; its renders predate the
default graph.

Checked on the last commit, on ada: typecheck, lint, format and all 898 website
tests; a dev-server sweep of the 59 examples with no console errors;
`check-pangenome-launches --dataset fly` (21 of 21). The full launch check ran
on the first commit only (138 of 139, the one failure being the check's own,
fixed in the second).

## Next

- **Deploy** with the normal `./run.sh` on ada. On 2026-11-21 it waited all
  afternoon on another project's `run.sh` (the walks8 drawcheck gate). Ada's
  main also held an unpushed "Plain links" commit (`9e45f56666cd`: the home
  page, the explore config, hub categories and `syntenyAccessions.json`), which
  a run pushes and deploys with this.
- **Then the tutorials**, in jbrowse-components. The branch
  `pangenome-page-trim-docs` (worktree `~/src/jbc-pangenome-trim-docs`) rewrites
  the four passages in `pangenome_hprc.md`, `pangenome_hprc_repeats.md` and
  `pangenome_hprc_haplotypes.md` that describe the old page. Regenerate the
  figure `pangenome/genomes_hprc_loci`, a screenshot of the production HPRC
  page, which now includes a graph only where the example draws one (HLA / MHC,
  its window, does not). Its selectors (`.ui-lanes`, `.ui-actions a.ui-btn`)
  still match.
- **Ada leftovers:** the worktree `~/src/jb2hubs-pangenome-trim`, its branch and
  the ref `pangenome-trim-sync` can go, with `/tmp/pt-*`.

## A Bandage plot for the graphs without walks

Decided 2026-11-22: no interim plot. Every species is rebuilt with
Minigraph-Cactus for a format 8 walk file, then drawn as HPRC is
(`agent-docs/todo/walks-and-genes-for-every-pangenome.md`).

## Open on the default graph

- HPRC opens on CFH / CFHR, whose commonest drawable row is a 164 bp → 2.29 kb
  change 1% carry; the allele the card is about, an 85 kb deletion, is too wide
  to cut. HP or GSTM1 would open on the allele's own graph.
- The 5,000 node limit was set from one afternoon's timings in a desktop browser
  against the dev server (1 to 10 s under it). Production was not measured.
- The graph worker and the walk file now load on every HPRC visit.

## From the review, not taken

- The trim removed the "panel chosen for diversity, not a population sample"
  caveat and the carriers table, the keyboard's way to a change's carrier count.
- The build and check scripts' findings were read, not re-verified, except one:
  `checkPangenomeAssets.mjs` counts any fetch error as transient, so a run with
  no network passes and prints "every url resolves".
- `regionLaunches` still takes six arguments, the dataset table still repeats
  each UCSC reference's urls, and the tag vocabulary (`changeName`,
  `STATE_TAGS`) is still reached only from tests.
- `checkForms/printForms.ts:43` filters `end >= start` where tabix reads
  `end > start`.
