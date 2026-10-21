---
name: pangenome-walk-forms
description:
  Move the HPRC map from the callset sidecar to forms read off the walk file
  (graph-walks' formsCut), which fixes the HBA and AMY1 examples; waits on
  graph-walks 4.1.0.
metadata:
  category: ready
  area: pangenomes
  first_move:
    'When graph-walks 4.1.0 is out, compute walk forms beside the sidecar''s in
    check-pangenome-launches and log the differences.'
  order: 3
---

# The HPRC map from walk forms

graph-walks' `formsCut` and `structuralForms`
(`~/src/graph-walks/docs/structural-forms.md`) group haplotypes by their exact
departures from GRCh38 in the walk file the page already cuts for its graph.
Each haplotype's summed departures match its assembly in 2,779 of 2,780 scored
cases, against 99% for the sidecar. The graph plugin session handed this
migration to jb2hubs on 2026-10-21 and asked that it wait for 4.1.0, whose
release waits on a validation gate.

- **Plan:** shadow first, with walk forms beside the sidecar's in
  `check-pangenome-launches`; then switch the HPRC map. Cattle needs a walk file
  built from its P lines (`--refs HER`), and Arabidopsis keeps the sidecar until
  its graph has paths.
- **Options HPRC passes:** `exclude: ['CHM13']`, since the default excludes no
  sample.
- **Loading state:** a cold `formsCut` takes 5–8 s at LPA and MHC, under 1 s at
  simple loci.
- **Labels change:** walk forms name exact lengths, so C4's "6.4 kb deletion"
  reads "6.46 kb replaced by 94 bp".

What the switch fixes, measured 2026-10-21 against graph-walks main (7b40bce)
over the published walk file:

| Example | Sidecar map                                                                                               | Walk forms                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| HBA     | 17 forms of 50–580 bp insertions; the −α3.7 deletion is in the headline only; GRCh38's structure "none" | 417 as the reference, 30 with the 3.8 kb −α3.7 deletion, 6 with its 3.8 kb triplication, 7 with 10 kb |
| AMY1    | GRCh38's structure "none"; 171 haplotypes "another route at 64 sites"                                     | 192 "94 kb shifted, same length" and 15 as the reference: 45% at GRCh38's length (H3r)             |

Done when the HBA, AMY1, GSTT1 and C4 examples read as the population check
in `agent-docs/reference/PANGENOME_PAGES.md` expects, and `popFreq.py`'s
events keep their shares.
