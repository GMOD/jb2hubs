---
name: website-review-leftovers
description:
  'What the 2026-09-23 website review left open: haplotype lanes the pangenome
  graph does not place.'
metadata:
  category: measure
  area: pangenome
  first_move:
    'Build per-haplotype placement intervals from the GBZ on the build box.'
  order: 3
---

# What the 2026-09-23 website review left open

A review of the website raised about 95 findings across six areas: protein
browser, gene and ortholog pages, synteny, pangenome, search and tables, and the
launch pages with their infrastructure. Two rounds of fixes landed on 2026-09-24
and closed nearly all of them. This file holds what neither round closed:
product decisions the code cannot make, and follow-ups the fixes turned up.
Delete an entry when it lands, and the file when it is empty.

## Decisions

- **Haplotype lanes the graph does not place.** `pnpm check-pangenome-launches`
  lists `defb` and `nphp1` as known unplaced rather than failing them. The fix
  is per-haplotype placement intervals from the build box, still owed now that
  `features.pangenome` is on production. The measurement in
  `agent-docs/reference/PANGENOME_PORTAL.md` says a placed representative is not
  enough: 210 of defb's 395 and all 5 of nphp1's have no walk.
