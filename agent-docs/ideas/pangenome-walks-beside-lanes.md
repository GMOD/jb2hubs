# The graph's walks beside a locus's haplotype lanes

Written 2026-09-17, when the `haplotypes` launch landed. The launch draws each
panel haplotype as a lane in its own contig's coordinates; what it does not draw
is the graph those walks take.

**The pane.** The same launch can add a `GraphGenomeView` with
`loadedTrackId: 'hprc_v2_1_gbz_lanes'`, `subgraphHaplotypes` set to the panel,
`layoutMode: 'samplerows'` and `connectedViewId` on the linear view: one row per
panel haplotype, its **Walk** dropdown naming them. It is the paper figure
(`paper-hprc-workspace.ts` in jbrowse-components builds it off the rGFA
segments). The GBZ cut is 8–15 s at these windows on top of the lanes' own read,
so it belongs on a second link (`walks`) rather than folded into `haplotypes`,
which should stay the fast one. Not built, not measured past that estimate.

**Gene models on the lanes.** The tutorial's demo draws each lane's CAT genes
from per-haplotype GFF3 slices cut for CFH alone; ours says "no annotation" on
every lane. A catalogue-wide version needs the full CAT GFF3 per haplotype,
bgzipped, tabix-indexed and hosted, one for each haplotype any panel names (on
the order of 80 across the 15 panels), plus an assembly block and alias each.
Real work on the build box.

**Mouse and bovine.** Bovine has a callset, so `generatePangenomePanels.ts`
would run over it with `phased` off, but neither graph has a `.gbz.db`, so there
is no lane track for a panel to open. Nothing to do until one is built.
