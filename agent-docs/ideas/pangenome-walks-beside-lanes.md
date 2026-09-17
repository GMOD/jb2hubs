# The graph's walks beside a locus's haplotype lanes

Written 2026-09-17, when the `haplotypes` launch landed. The launch draws each
panel haplotype as a lane in its own contig's coordinates; what it does not draw
is the graph those walks take.

**The pane.** The same launch can add a `GraphGenomeView` with
`loadedTrackId: 'hprc_v2_1_gbz_lanes'`, `subgraphHaplotypes` set to the panel,
`layoutMode: 'samplerows'` and `connectedViewId` on the linear view: one row per
panel haplotype, its **Walk** dropdown naming them. It is the paper figure
(`paper-hprc-workspace.ts` in jbrowse-components builds it off the rGFA
segments).

Measured on hosted `main` on 2026-09-17, it is cheaper than the 8–15 s this
first estimated and less legible than it sounds. The cut restricted to a panel
drew 3–4 s after page load at cfhr, lpa and c4 (2,000–7,500 nodes), with the
lanes alongside adding nothing measurable. mhc-hla's cut is 31,118 nodes, past
the view's 20,000 `maxGraphNodes`, and draws in 12 s with the page stalled when
the limit is raised. `samplerows` is not one row per haplotype: a non-reference
node goes to the sample of the first walk that visits it, so cfhr's eight drew
seven rows, a deletion draws on no carrier's row, and rows are per sample, so
`HG00235#1` and `#2` share one. Force layout reads better and costs 0.6–0.8 s
more. The Walk dropdown also repeats labels where a walk comes back in pieces
(30 entries at lpa), which only the plugin can fix. So: force layout, no link
for mhc-hla, and possibly folded into `haplotypes` rather than a fourth link,
since it costs so little.

**Mouse and bovine.** Bovine has a callset, so `generatePangenomePanels.ts`
would run over it with `phased` off, but neither graph has a `.gbz.db`, so there
is no lane track for a panel to open. Nothing to do until one is built.
