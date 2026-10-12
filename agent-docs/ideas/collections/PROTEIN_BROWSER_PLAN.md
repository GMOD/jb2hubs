---
name: protein-browser-plan
description:
  'The 2026-10-11 plan for /protein-browser: guard the silent isoform bugs,
  split the feature module, then make the page tell a story the genome link
  alone can (edit consequence, isoforms, complexes). Mol* stays; facets are
  workspace panels.'
---

# Protein browser: plan

Written 2026-10-11 from a code review of the page, a design review of faceting
against the protein3d and jbrowse-components code, an assessment of Mol*, and an
executive review of the first draft. The settled background is
`agent-docs/reference/PROTEIN_BROWSER.md`; the two verdicts this plan rests on
are
`agent-docs/architecture-decision-records/0005-protein-view-facets-and-molstar.md`;
the committed fixes are
`agent-docs/todo/protein-browser-isoform-focus-fixes.md`. The plugin's
grammar-of-graphics note is
`~/src/jb2plugins/jbrowse-plugin-protein3d/docs/secret-sauce.md`.

**Goal.** A single protein view tells little. The page's one asset is that a
residue is a codon, so the test for every item below is whether it uses that
link: what an edit does to the protein, what differs between isoforms, which
chain of a complex is which gene.

**Rules every item inherits**

- Nothing per-gene is hand-written. A chip names a gene, a focus and at most an
  edit; every sentence is computed.
- No new control on the default page. New facts go in the "More about residue N"
  fold or on a tooltip; new state rides in the url.
- The arithmetic runs on the launched transcript (`launched` in
  `ProteinLaunchCard.tsx`), never `structure.transcript`: the 100-way path pins
  the UCSC knownCanonical model, whose CDS comes from the sidecar and not the
  gene table.

## 1. Guard first (page, small) — done 2026-10-11

Landed: no selection where `translationRanges` gives up, with the focus chip
saying so; the protein view id names its structure; the headline waits on the
contacts; `pickEntry` uses one UniProt entry for the isoform rule and the
structure; `alphamissense` only where it paints. `check-protein-launches`
booted all 16 launches after.

## 2. Simplify (page, medium) — done 2026-10-11

- [ ] Split `proteinFeatures.ts` (1,600 lines, seven services) by service plus a
      `focus.ts`. One `fetchJsonOr404(url, label)` replaces nine copies of the
      fetch boilerplate; `parseInterfaceRegions` and `parseLigandSites` share
      one contact-accumulation loop; `bareAccession` is defined twice.
- [ ] Pull `useResidueFacts(uniprotId, residue, regions)` out of `GeneResults`
      (`ProteinBrowser.tsx:400`, twelve SWR hooks), returning
      `{headline, clauses, conserved, variantLines}`.
- [ ] Lift the structure-choice rule (`ProteinLaunchCard.tsx:109-123`) and
      `colorsFor` into pure functions in `proteinSession.ts` with table tests.
      The rule is untested today.
- Run `pnpm check-protein-launches` after 1 and 2; both touch what it guards.

## 3. Isoform mapping by codon identity (page, medium)

`translationRanges` aligns the canonical to the launched translation and
misplaces 335 residues on paralogous exons (PKM, FGFR2). Codon identity is exact
where it applies: canonical residue → genomic codon → launched residue. It is a
third path beside the alignment, not a replacement, and needs:

- `GeneStructure` to keep every isoform's CDS and the entry's `refseq[]` map;
  today only `picked.transcript` leaves `fetchGeneStructure`
  (`geneStructure.ts:679-703`).
- A check that the canonical's RefSeq NP spells UniProt's canonical (sequence
  conflicts exist); otherwise the alignment stays.
- The 100-way path's transcript comes from the sidecar's `.cds`
  (`hundredWay.ts`), so that side has to be read as blocks too.

Needed by item 5 for the shared lit exon. Ships after item 2.

## 4. Edit consequence (page, small to medium, no plugin work) — done 2026-10-11

The CRISPR story. For a focused residue, from the launched transcript's CDS:
which exon, whether a stop or frameshift there is subject to nonsense-mediated
decay (50–55 nt before the last exon junction) or yields a truncated protein,
and which residues an exon skip deletes in frame. Light what is **lost**: the
plugin frames the selection, so the removed domain is what the camera lands on,
and in the genome view the lost run is one band either way. Surface that passes
the busy rule: no control; the fold gains one computed line ("a stop here
escapes NMD and removes 213–393, the tetramerisation domain"); the map shades
the lost residues; the edit rides in the url (`edit=stop|skip`) so chips and
links carry it. Chips: CFTR F508del (NBD1, 5UAK) and TP53 R213* stand. DMD exon
51 does not until a structure covering residues around 2,400 is found:
dystrophin has fourteen C-terminal isoform models and no F1, and a chip with no
3D is the 2026-09-01 DMD failure again. Owed to the tutorials once visible.

## 5. Isoforms in one view (page, medium, no plugin work)

Each `structures[]` entry carries its own `feature` and translation, so the
canonical model and the isoform model open superposed, each mapped to its own
transcript. Superposition alone does not show the mutually exclusive exon (both
models are entity 1 of separate files); the shared selection from item 3's codon
map is what lights it (PKM1 vs PKM2). Emit the union of both CDS sets as the
genome view's loc, or the private exon falls outside it. Needs item 1's id fix.

## 6. Entries side by side (page small, plugin small)

The one facet type where overlay fails: several PDB entries of one protein with
different ligands or conformations (BRAF 1UWH against an active-state entry).
Tile ProteinViews through the workspace tree, which already nests branches: same
`feature`, same `connectedViewId`, same `colorScheme`, `showAlignment` and
`showProteinTracks` off per cell, two cells beside the genome column at 1400 px.
Each cell draws its own identical legend; hide the key when `showAlignment` is
off, or ask the plugin to. Genome and MSA hovers already reach every tiled view;
structure → other ProteinView does not. Plugin change:
`connectedHoverTranscriptPos` (`src/ProteinView/connectedHover.ts`, 69 lines)
reads MsaViews' `connectedHoverHighlights` by `connectedViewId`; add
ProteinViews' `hoverGenomeHighlights` as a second source, about 20 lines and a
test.

## 7. Any residue opens the structure that shows it (page, small) — done 2026-10-11

The three human chips hand-pick 3KMD, 1UWH and 2HBS. The residue-facts pipeline
already knows which entries show the residue touching DNA, a partner or a drug
(`pdbIds` on the touching region, most-covering first). Open `pdbIds[0]` of the
touching region with the most residues by default for any focused residue in any
species, so every residue is a chip.

## 8. One colour scale across map, 3D and legend (plugin small to medium)

The map colours domains by InterPro accession, the structure by chain or pLDDT,
the MSA by identity: three scales for one protein. Plugin change: a scheme
reading `residueColors: [{start, end, color}]` off each structure's snapshot.
`variantEffectColorTheme.ts` already registers per-residue values by model id
before a recolour, so this is a source, not a mechanism. First source: InterPro
domains in the map's palette. Then the MSA's conservation and any genome track
(secret-sauce ideas 1 and 2).

## 9. Two-gene complexes (plugin medium to large)

HBB and HBA1 both linked on 2HBS, TP53 and MDM2 on 1YCR, each chain hovering to
its own gene, both genes as one collapsed-exon genome view. The structure model
binds one transcript (`structureModel.ts:161`) and a hover must match
`mappedEntity`, so the partner's chain maps to nothing. Loading the entry twice
with different features fails: a pointer picks one Mol* model, the second copy
never hears a hover. Plugin feature: a per-transcript sub-model inside Structure
(feature, sequence, mapper, alignment, selection, variant effects). Build only
as the paper's demo; the single-transcript complex already works.

## Not doing

- Docking, AlphaFold predicted complexes, AlphaFill: the page has no room to say
  a confident prediction is biologically wrong.
- In-view small multiples, species facets, replacing Mol*: ADR 0005.
- MolViewSpec, for now. `loadMVS` always loads with `replaceExisting: true`
  (`molstar/lib/extensions/mvs/load.js:144`), so an MVS state wipes the
  structures the plugin loaded imperatively; adopting it is a rewrite of the
  plugin's loading, superposition, hover and colour layers, not a colour
  feature. A separate, large investigation if the plugin ever rebuilds that
  layer.

## Order

1, 2, 4 and 7 landed 2026-10-11 (`agent-docs/reference/PROTEIN_BROWSER.md`,
"What an edit does" and "Any residue opens the entry that shows it"). Next: 3
→ 5 → ask the plugin for 6's hover and 8's colour (both small) → 6 and 8 → 9
only for the paper.
