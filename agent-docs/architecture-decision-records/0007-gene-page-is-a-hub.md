# ADR 0007 — The gene page is a hub, and admits only what hosting adds

- **Status:** Accepted; amended by
  `agent-docs/architecture-decision-records/0008-gene-tools-get-their-own-pages.md`,
  which moved the ortholog table and the gene-order figure back to their own
  pages
- **Date:** 2026-08-27
- **Affected:** `website/src/pages/gene.astro`,
  `website/src/components/GenePage.tsx`, `website/src/components/geneHub.ts`,
  `/protein-browser`, `/synteny`

## Context

`/orthologs`, `/conserved-gene-order` and `/protein-browser` all took a gene
symbol and a reference species and differed only in how they rendered the
answer. Each page carried its own gene box, species picker, example chips, help
dialog and gene resolution, with no cache shared across the navigation, and the
nav listed five tools with no stated relationship. The first draft of the design
folded all three views into one gene page and moved `/synteny` into the
accession page.

## Decision

- **The gene page links to the deep tools.** `/gene` resolves a gene once and
  holds the identity, the ortholog species table and the gene-order figure, with
  launch cards into the deep tools, the way NCBI Gene links out to BLAST rather
  than embedding it. `/protein-browser` and `/synteny` keep their own pages and
  nav entries and are reached with the gene already resolved. Each tool has its
  own workflow (pick, read, launch a connected session), and a summary page
  whose sections take minutes to settle no longer works as a summary.
- **The shared layer is resolution and the `?gene=&ref=` contract**, not
  rendering. `/orthologs` and `/conserved-gene-order` became redirects to
  `/gene` carrying their query.
- **A section is admitted only if it passes one test:**

  > Would this section exist if we hosted one genome?

  Yes means it is somebody else's job and the page links out. No means it is
  ours.

  | Section                                     | Ours?                                           |
  | ------------------------------------------- | ----------------------------------------------- |
  | Ortholog species table + launches           | yes — exists only because we host them          |
  | Conserved gene order across the tree        | yes                                             |
  | Domain architecture across orthologs        | yes                                             |
  | Cross-species protein alignment             | yes                                             |
  | Which of our assemblies annotate this gene  | yes — nobody else can answer it                 |
  | Gene structure / transcripts                | only as what drives the collapsed-intron launch |
  | Function, pathways, phenotype, publications | no — link to NCBI/Ensembl                       |

## Consequences

- NCBI Gene, Ensembl and GeneCards have better curated annotation. Answer a
  request for an expression section with the test, because granting the first
  such request starts turning this page into GeneCards.
- The nav has to state the hierarchy, or it stays a dropdown of five tools:
  `Header.astro` lists the two starting points (an assembly, a gene) before the
  tools they hand off to.
- Revisit if a deep tool's workflow shrinks to something that settles at page
  load; it could then become a section.
