# ADR 0008 — The ortholog table and the gene-order figure get their own pages

- **Status:** Accepted
- **Date:** 2026-10-15
- **Amends:**
  `agent-docs/architecture-decision-records/0007-gene-page-is-a-hub.md`
- **Affected:** `website/src/pages/gene.astro`,
  `website/src/pages/orthologs/index.astro`,
  `website/src/pages/conserved-gene-order.astro`,
  `website/src/components/GeneQueryForm.tsx`,
  `website/src/hooks/useOrthologs.ts`

## Context

Under ADR 0007 we folded `/orthologs` and `/conserved-gene-order` into `/gene`
as sections, and kept `/protein-browser` and `/synteny` apart because each has
its own workflow and a summary whose sections take minutes to settle stops
working as a summary. By 2026-10-15 both sections met those conditions:

- The gene-order figure had layout, gene-count and window options, gene,
  branch-point and lane launches into JBrowse, and a 10–20 s first build per
  gene. It was the tallest and slowest section.
- The full ortholog table had a filter, clade groups, tick boxes with a launch
  bar, a download and the clade scope control, and "Show all" swapped it in for
  the preview with no url of its own and no Back.

The page read as overwhelming.

## Decision

- **`/orthologs` and `/conserved-gene-order` are pages again**, on the same
  `?gene=&ref=` (plus `scope=` and the figure's options), so the old deep links
  land on them.
- **`/gene` keeps the gene card and an eight-row ortholog preview.** The
  preview's "All N species" links to `/orthologs`; the gene card launches Gene
  order beside Protein browser and Synteny. `/gene` no longer asks the Lambda
  for anything.
- **The pages share the form and the fetches**: `GeneQueryForm.tsx` with
  `useGeneQuery`, `useOrthologs`, `GeneIdentityLine.tsx` and `styles/gene.css`,
  so the split adds no second copy.

## Consequences

- We still apply ADR 0007's test to what `/gene` admits. A view that passes it
  and has its own workflow gets a page and a launch, not a section.
- `/gene` keeps the preview because, without it, the page is a card and four
  buttons, and "which of our genomes have this gene" is the question most
  readers bring.
- `/gene` shows no gene order until the reader asks for it. Add a small preview
  only if the button alone turns out to hide the feature.
