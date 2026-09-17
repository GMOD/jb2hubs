# A way into a pangenome graph for a gene not in the table

Written 2026-09-17, and possibly a "no". The 2026-09-16 review removed the
region box from `/pangenomes/<id>` as redundant with the locus table, and the
page has been better for it. What that leaves: a reader with a gene outside the
20 rows reaches the graph only through a whole chromosome and then the track
menu.

The smallest version is one input that takes a region or a symbol and opens
`graphRegionUrl` on it, resolving the symbol through the index the gene hub
already uses. The HPRC tutorial still describes a form of this, so either this
comes back or the tutorial's description goes.

Keep the haplotypes launch off it: a panel exists only where
`generatePangenomePanels.ts` computed one, and computing one needs a bcftools
read of the callset, which a static page cannot make.
