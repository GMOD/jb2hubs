---
name: protein-browser-isoform-focus-fixes
description:
  'Five small fixes on /protein-browser: a TTN focus lands wrong with nothing
  said, two ProteinViews for one gene collide on id, the headline flickers, the
  UniProt entry can split, AlphaMissense is offered where it paints grey.'
metadata:
  category: ready
  area: protein-browser
  first_move:
    'Send no selection where translationRanges gives up, then suffix the session
    view ids by structure.'
  order: 1
---

# Protein browser: isoform and focus fixes

Found 2026-10-11 reviewing the page; the plan they come from is
`agent-docs/ideas/collections/PROTEIN_BROWSER_PLAN.md`.

- **A focus on a protein past ~6,300 residues lands wrong with nothing said.**
  `translationRanges` returns undefined over p2s_mapper's 40M-cell cap and
  `ProteinLaunchCard.tsx:147` falls back to raw canonical numbering. TTN's MANE
  and canonical differ by thousands of residues. Send no selection instead.
- **View ids collide.** `proteinSession.ts` mints `protein-<gene>`, `lgv-<gene>`
  and `msa-<gene>`, so two ProteinViews of one gene cannot share a session.
  Suffix by structure.
- **Headline flicker.** `ProteinBrowser.tsx:555` waits on the variants but not
  on the contacts; a residue with no UniProt note reads "lies in domain X" then
  "contacts DNA" a second later. Wait on `contactsReady && ligandsReady` when
  the eager read is on.
- **One UniProt entry.** `geneStructure.ts:642` can pick the isoform by one
  entry's RefSeq map and the structure from another when NCBI's Swiss-Prot
  accession is absent from the GeneID cross-references.
- **AlphaMissense where it paints.** The scheme is grey on an AlphaFold isoform
  model (PAX6 opens `AF-P26367-2-F1`). Offer it for the canonical model and PDB
  entries only.

Run `pnpm check-protein-launches` after; it guards the first two.
