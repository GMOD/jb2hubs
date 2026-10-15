---
name: protein-browser-plan
description:
  'What /protein-browser could show next beyond one structure: PDB entries side
  by side, one colour scale across map, 3D and legend, two-gene complexes,
  Foldseek neighbours, and the paper hub linking here.'
---

# Protein browser: what could come next

The settled background is `agent-docs/reference/PROTEIN_BROWSER.md`, the two
verdicts these items rest on are
`agent-docs/architecture-decision-records/0005-protein-view-facets-and-molstar.md`,
and the committed next step, isoforms in one view, is
`agent-docs/todo/protein-browser-isoforms-in-one-view.md`. The plugin's
grammar-of-graphics note is
`~/src/jb2plugins/jbrowse-plugin-protein3d/docs/secret-sauce.md`.

**Goal.** The page's distinctive feature is that each residue maps to a codon,
so the test for every item below is whether it uses that mapping: what an edit
does to the protein, what differs between isoforms, which chain of a complex is
which gene.

**Rules for every item**

- Nothing per-gene is hand-written. A chip names a gene, a focus and at most an
  edit; every sentence is computed.
- No new control on the default page. New facts go in the "More about residue N"
  fold or on a tooltip; new state goes in the url.
- The arithmetic runs on the launched transcript (`launched` in
  `ProteinLaunchCard.tsx`), never `structure.transcript`: a Pfam seed pins the
  translation its query row was cut from.

## Entries side by side (page small, waits on a small plugin change)

Overlay cannot show several PDB entries of one protein with different ligands or
conformations (BRAF 1UWH against an active-state entry). Tile ProteinViews
through the workspace tree, which already nests branches: same `feature`, same
`connectedViewId`, same `colorScheme`, `showAlignment` and `showProteinTracks`
off per cell, two cells beside the genome column at 1400 px. Each cell draws the
same legend; hide the key when `showAlignment` is off, or ask the plugin to.
Genome and MSA hovers already reach every tiled view; structure → other
ProteinView does not. Plugin change: `connectedHoverTranscriptPos`
(`src/ProteinView/connectedHover.ts`, 69 lines) reads MsaViews'
`connectedHoverHighlights` by `connectedViewId`; add ProteinViews'
`hoverGenomeHighlights` as a second source, about 20 lines and a test.

## One colour scale across map, 3D and legend (waits on the plugin, small to medium)

The map colours domains by InterPro accession, the structure by chain or pLDDT,
the MSA by identity: three scales for one protein. Plugin change: a scheme
reading `residueColors: [{start, end, color}]` off each structure's snapshot.
`variantEffectColorTheme.ts` already registers per-residue values by model id
before a recolour, so the plugin needs only a new source. First source: InterPro
domains in the map's palette. Then the MSA's conservation and any genome track
(secret-sauce ideas 1 and 2).

## Two-gene complexes (plugin medium to large)

HBB and HBA1 both linked on 2HBS, TP53 and MDM2 on 1YCR, each chain hovering to
its own gene, both genes as one collapsed-exon genome view. The structure model
binds one transcript (`structureModel.ts:161`) and a hover must match
`mappedEntity`, so the partner's chain maps to nothing. Loading the entry twice
with different features fails: a pointer picks one Mol\* model, the second copy
never receives a hover. Plugin feature: a per-transcript sub-model inside
Structure (feature, sequence, mapper, alignment, selection, variant effects).
Build only as the paper's demo; the single-transcript complex already works.

## Foldseek neighbours

The plugin already includes Foldseek (`services/foldseekApi.ts`), and the page
does not expose it. Structure-based neighbours would be another alignment source
where sequence orthology fails (the PANTHER-only taxa), but Foldseek runs as an
async job and would need a button, if offered at all.

## The paper's hub links here

The paper's resource hub (GMOD/proteinbrowser) does not link to
`/protein-browser`. The page has been on production since 2026-10-08, so the hub
can link it now.

## Order

Do the todo first, then ask the plugin for the side-by-side hover and the colour
scheme (both small), then build those two; complexes only for the paper.
