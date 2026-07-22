---
title: Ortholog browser
date: '2026-07-22'
---

The [ortholog browser](/orthologs) is now live. Search for a gene in a reference
species and you get a table of its orthologs across other species, each with the
assembly and exact genomic coordinates, plus a link that opens that locus
directly in JBrowse 2.

Ortholog relationships are fetched live from the
[NCBI Datasets](https://www.ncbi.nlm.nih.gov/datasets/) API, so results reflect
NCBI's current annotation rather than a snapshot baked into the site. Only
orthologs whose genome we host are listed, so every row is something you can
actually open.

Where the reference assembly and an ortholog's assembly have an alignment
available, the row also gets a **Synteny** link that launches a two-genome
synteny view centered on the gene pair. If several orthologs share alignments
back to the reference, a single **Launch multi-species synteny view** link opens
them together in one multi-row view.

Searches are shareable — the gene and reference species end up in the URL, so
`/orthologs?gene=BRCA1&ref=9606` sends someone straight to the same table.
