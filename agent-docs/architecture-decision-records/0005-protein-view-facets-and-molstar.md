# ADR 0005 — Facets are workspace panels, and Mol* stays

- **Status:** Accepted
- **Date:** 2026-10-11
- **Affected:** `website/src/components/proteinSession.ts`,
  `jbrowse-plugin-protein3d/src/ProteinView/*`

## Context

The protein browser wants to show more than one structure of a gene: several
species, two isoforms, or several PDB entries with different ligands. Two
designs were reviewed against the plugin's code: small multiples inside one
ProteinView, or one ProteinView per facet tiled by jbrowse-web's workspace tree.
At the same time Mol* was questioned as over-complicated for the page's goals.

## Decision

- **No small multiples inside the ProteinView.** One view is one Mol*
  `PluginContext` (`model.ts:227`), created once per mount and read by about 30
  call sites across seven files: the loader, both loci channels, the single
  hover and click subscription, superposition, framing and colour. Mol* renders
  one canvas per context, so one canvas per structure means one context per
  structure, with no camera sync in Mol* and TM-align superposition lost across
  canvases.
- **Species and isoforms superpose in one view** through `structures[]`, each
  entry mapped to its own transcript. Cross-species hover between tiled views
  has no path except the MSA column, which the plugin refuses by design.
- **Several entries of one protein tile through the workspace**, one ProteinView
  each, same feature and colour scheme. The layout tree nests branches
  (`app-core/src/WorkspaceLayout/model.ts:95-110`). The one missing link,
  structure → other ProteinView hover, is a small plugin change in
  `connectedHover.ts`.
- _*Mol* stays._* Every alternative (3Dmol.js, NGL) has a weaker entity and
  sequence model, which is where the plugin's recorded bugs lived: nucleic
  chains, fused partners unmapped through SIFTS, NMR ensembles, `label_seq_id`.
  The plugin takes Mol* through a 25-export facade and a 3.8 MB chunk loaded
  once. MolViewSpec is not adopted: `loadMVS` replaces the state tree
  (`replaceExisting: true`), so it cannot coexist with imperative loads.

## Consequences

- The page may emit several ProteinViews; view ids must be unique per structure,
  not per gene.
- Declared per-residue colour comes as a plugin colour scheme reading each
  structure's snapshot, not from MVS.
- Revisit if the plugin ever rebuilds its loading layer; MVS would then be the
  declarative state to build on.
