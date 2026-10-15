# ADR 0008 — The gene-order figure has its own page

- **Status:** Accepted
- **Date:** 2026-10-15
- **Amends:**
  `agent-docs/architecture-decision-records/0007-gene-page-is-a-hub.md`
- **Affected:** `website/src/pages/conserved-gene-order.astro`,
  `website/src/pages/gene.astro`, `website/src/components/GeneOrderPage.tsx`,
  `website/src/components/GeneQueryForm.tsx`

## Context

Under ADR 0007 we folded `/conserved-gene-order` into `/gene` as a section, and
kept `/protein-browser` and `/synteny` apart because each has its own workflow
and a summary whose sections take minutes to settle stops working as a summary.
By 2026-10-15 the figure met both conditions. It had layout, gene-count and
window options, gene, branch-point and lane launches into JBrowse, and a 10–20 s
first build per gene. It was the tallest and slowest section, and the page read
as overwhelming.

## Decision

- **`/conserved-gene-order` is the figure's page again**, with its options in
  view. It takes the same `?gene=&ref=`, so the old deep links land on it.
- **`/gene` launches it from the gene card** (Gene order), beside Protein
  browser and Synteny, and no longer asks the Lambda for anything.
- **Both pages share `GeneQueryForm.tsx`** (form and resolution), so the split
  adds no second copy of the gene box.

## Consequences

- We still apply ADR 0007's test to what `/gene` admits. A view that passes it
  and has its own workflow gets a page and a launch card, not a section.
- `/gene` shows no gene order until the reader asks for it. Add a small preview
  only if the button alone turns out to hide the feature.
