---
name: ortholog-page-polish
description:
  'Gene/ortholog page rough edges: no column sorting, unkeyed browser-direct
  NCBI, unused GO/OMIM payload, a figure that ignores the table scope.'
---

# Gene/ortholog page rough edges

None of these is decided; they are what the page knowingly does not do.

**Table affordances.** No column sorting: rows sort model organisms first, then
alphabetically, within a clade, so a sort has to say whether it reorders within
groups or flattens them.

**NCBI is browser-direct and unkeyed.** `ncbiFetch.ts` reads `NCBI_API_KEY` from
`process.env`, which is undefined in the client bundle, so every visitor runs
the unkeyed path (350 ms minimum gap, 429/5xx backoff) from their own IP.
Visitors behind one institutional NAT share that budget.
`aws/ortholog-assembler/` holds a rate budget server-side for gene order only;
what leaving the table on the browser path costs is measured in
`agent-docs/reference/GENE_PAGE.md`. Revisit if real traffic produces 429s.

**Unused payload.** The ortholog response carries GO terms and OMIM ids that
nothing displays. The header's Ensembl and UniProt links read the query gene's
own ids; the rows' are still unused.

**The figure ignores the table's clade scope.** "Limit to Birds" narrows the
table, while the gene-order figure keeps sampling the whole tree around the
reference (`trimNeighborhood`, `GeneOrderSection.tsx:73`). Filtering it needs
the figure's species' lineages: its tree is chain-collapsed, so a clade's own
taxon id can be gone from it.

**The table and the figure do not share their answer.** The neighborhood the
figure draws has a row for nearly every table species, so the table could carry
a per-row "k of N neighbours conserved" column (and sort by it), a link that
scrolls to the figure row, or a small gene-order strip.

**Ribbons stop at a gap.** A ribbon joins an anchor only between consecutive
rows (`multiSyntenyLayout.ts:500`), so one row missing a gene breaks that gene's
trace down the figure.
