---
name: ortholog-page-polish
description:
  'Gene/ortholog page rough edges: no column sorting, unkeyed browser-direct
  NCBI, unused GO/OMIM payload, a figure that ignores the table scope.'
---

# Gene/ortholog page rough edges

Every item here is undecided, and each is a gap in the page we know about.

**Table affordances.** The columns cannot be sorted. Within a clade, rows list
model organisms first and then the rest alphabetically, so a column sort has to
say whether it reorders within groups or flattens them.

**NCBI is browser-direct and unkeyed.** `ncbiFetch.ts` reads `NCBI_API_KEY` from
`process.env`, which is undefined in the client bundle, so every visitor runs
the unkeyed path (350 ms minimum gap, 429/5xx backoff) from their own IP.
Visitors behind one institutional NAT share that budget.
`aws/ortholog-assembler/` holds a rate budget server-side for gene order only;
what leaving the table on the browser path costs is measured in
`agent-docs/reference/GENE_PAGE.md`. Revisit the choice if real traffic produces
429s.

**Unused payload.** The ortholog response includes GO terms and OMIM ids that
the page never displays. The header's Ensembl and UniProt links use the query
gene's ids; the rows' ids are still unused.

**The figure ignores the table's clade scope.** "Limit to Birds" narrows the
table, while the gene-order figure keeps sampling the whole tree around the
reference (`trimNeighborhood`, `GeneOrderSection.tsx:73`). Filtering the figure
needs the lineages of its species, because its tree is chain-collapsed and can
lack the taxon id of the clade itself.

**The table and the figure do not share their results.** The neighborhood the
figure draws has a row for nearly every table species, so the table could show a
per-row "k of N neighbours conserved" column (and sort by it), a link that
scrolls to the figure row, or a small gene-order strip.

**Ribbons stop at a gap.** A ribbon joins an anchor only between consecutive
rows (`multiSyntenyLayout.ts:500`), so one row missing a gene breaks that gene's
trace down the figure.
