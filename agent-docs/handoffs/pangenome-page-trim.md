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

## The folded graph

Landed 2026-11-25 as `a16394381871`, not deployed: the page draws the whole
window folded at 1 kb and lights the cited allele's row
(`agent-docs/reference/PANGENOME_PAGES.md`).

- **The arc gets too much emphasis** (Colin, 2026-11-25): a lit thread is as
  wide as the log of its count, so the allele's arc is fat and nothing says how
  many haplotypes follow the reference. The fix is in bandage-core's next
  release, merged into its ship branch `owner-asks-c` at `44f10ca` and off by
  default; the gfa-to-tabix session says when it is on npm. Then, in
  `pangenomeGraphLayout.worker.ts`:
  - set `countLaneWidth: 'share'` and `nodeShares: true` in `SPEC`
  - light the reference row's haplotype beside the lit row's, in a second
    colour
  - re-sweep all 18 examples, HLA first (see below), and show Colin the
    renders: he has seen CFH's, not picked it
  The render he was shown is
  `~/src/walks8-evidence/sessions-20261125/thread-width-mock/built/cfhrWin.png`,
  and the record `~/src/gfa-to-tabix/agent-docs/todo/thread-width-and-share-label.md`.
- A deletion's arc has no share label yet.
- **Do not bump bandage-core past 14.6.0 without re-sweeping HLA.** The
  gfa-to-tabix session ran HLA's per-row window (chr6:32,484,416-32,514,438)
  through the unreleased fold-truth stack on 2026-11-25: it drew every node at
  one width, a 21.8 kb placeholder as a loop that dominates the drawing, and
  lost HLA-DRB5's outline. That blocks its release until a review settles it.
  The picture is
  `~/src/walks8-evidence/sessions-20261122/hostedaudit/after-graph/pairs-v10/hla/HLA-II-graph-release-vs-thin.png`.
- **HLA's cut is 97% placeholders.** Format 8 gives each off-reference run of an
  abridged walk a private node: 1,189,936 of the 1,222,487 nodes in
  chr6:32,510,000-32,600,000, where the graph holds 40,238 segments. The numbers
  are in `~/src/walks8-evidence/sessions-20261125/hla-cut/`; reader fixes are on
  graph-walks branch `reader-fixes`, and a cut-time floor and a format change
  are under review by the gfa-to-tabix session.
- The tutorials' figures of the HPRC page show the old graph.

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
