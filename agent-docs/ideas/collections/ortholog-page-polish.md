---
name: ortholog-page-polish
description:
  'Gene/ortholog page rough edges: clade scoping drops the reference, no column
  sorting, unused GO/OMIM payload, a figure that ignores the table scope, no
  launch for species without synteny.'
---

# Gene/ortholog page rough edges

None of these is decided; they are what the page knowingly does not do.

**Clade scoping loses the reference.** Scoping to a clade the reference is not
in (human TP53 → Birds) drops the ref row and every synteny link, because
`taxon_filter` excludes the reference's own report. The page now says so and
names the way back. The alternative is injecting the reference taxon into the
request, which muddies the "N of M in birds" count — a real trade, not an
oversight.

**Table affordances.** No column sorting: the rows are grouped by clade, so a
sort has to say whether it reorders within groups or flattens them.

**NCBI is browser-direct and unkeyed.** Pre-existing, not introduced here.

**Unused payload.** The ortholog response carries GO terms and OMIM ids that
nothing displays. The header's Ensembl and UniProt links read the query gene's
own ids; the rows' are still unused.

**The figure ignores the table's clade scope.** "Limit to Birds" narrows the
table, while the gene-order figure keeps sampling the whole tree around the
reference (`trimNeighborhood`). Filtering it needs the figure's species'
lineages: its tree is chain-collapsed, so a clade's own taxon id can be gone
from it.

**No launch for species without synteny.** The multi-species launch is a synteny
stack, so it holds only genomes the catalog links. A stack of plain
LinearGenomeViews, one per picked row at its ortholog, would open any set of
species side by side, merged through the same API.

**The table and the figure do not share their answer.** The neighborhood the
figure draws has a row for nearly every table species, so the table could carry
a per-row "k of N neighbours conserved" column (and sort by it), a link that
scrolls to the figure row, or a small gene-order strip.

**Ribbons stop at a gap.** A ribbon joins an anchor only between adjacent rows,
so one row missing a gene breaks that gene's trace down the figure.

See also [ORTHOLOGS_LAUNCH_FOLLOWUPS.md](ORTHOLOGS_LAUNCH_FOLLOWUPS.md).
