---
title: Synteny browser, conserved gene order and the protein browser
date: '2026-10-08'
description: >-
  Three pages leave staging: a synteny browser for any two aligned assemblies, a
  conserved gene order figure on the gene page, and a protein browser that links
  a gene's exons, its 3D structure and an ortholog alignment.
---

Three pages that have been on the staging site for a while are now live.

## Synteny browser

The [synteny browser](/synteny) opens a JBrowse 2 linear synteny view of the
alignment between two assemblies. Pick the first assembly and the second list
narrows to the ones aligned to it. Add a gene and each panel opens on that gene
and its ortholog; leave it out and you get the whole genome, colored by
chromosome. [About synteny tracks](/synteny/info) lists where the alignments
come from.

## Conserved gene order

The [gene page](/gene/?gene=TP53&ref=9606) now draws the neighborhood of a gene
across species under its ortholog table: one row per species in taxonomic order,
each gene an arrow, with ribbons joining orthologs. A block that has moved,
flipped or lost a gene shows up as crossing or missing ribbons.

Everything on the figure is a launch. A gene opens a two-genome synteny view of
that gene against the reference where an alignment exists, and the single genome
otherwise. A branch point of the tree opens the species under it as one stacked
synteny view, nearest the reference first.

## Protein browser

The [protein browser](/protein-browser) takes a gene symbol and opens one
JBrowse session with three linked views of the same transcript: the gene with
its introns collapsed, the protein's 3D structure from AlphaFold or the PDB, and
an alignment of its orthologs or of a Pfam domain family. Select a residue in
any one and the other two follow, so a variant can be read as a codon, a
position in the fold and a column of the alignment at once. The page also maps
domains and binding interfaces along the protein, and each can start the session
focused on it.

## Opening these in JBrowse Desktop

The synteny browser has an **Open in Desktop 5** link beside its launch, and the
gene order figure has an **open in JBrowse Desktop** switch that sends every
launch on it to the desktop app. Both need JBrowse Desktop 5.0, which registers
the `jbrowse://` links these use; an older Desktop does nothing when one is
clicked. Protein browser sessions open in JBrowse Web only for now.
