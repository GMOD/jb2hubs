# Protein browser

`/protein-browser` is `ProteinBrowser.tsx` and the `protein*`, `geneStructure`,
`pfamSeed` and `focus` modules beside it. Its design record, including two
residue↔codon bugs that shipped with every unit test green, is
`agent-docs/reference/PROTEIN_BROWSER.md`.

- **Send the picked isoform's own translation (its NP record) as
  `userProvidedTranscriptSequence`**, never the UniProt canonical or the
  structure's sequence. The protein3d plugin aligns it against the structure;
  handed the structure's sequence, the alignment is an identity and the CDS is
  mis-indexed with no error.
- **Ask AlphaFold's prediction API which models exist** rather than building an
  `AF-<acc>-F1-model_v6.cif` url, which 404s past AlphaFold's length cap (DMD,
  BRCA2, TTN) and on every version bump.
- **Run `pnpm check-protein-launches` by hand before changing
  `geneStructure.ts`, `proteinSession.ts`, `proteinLaunch.ts` or
  `pfamSeed.ts`.** It is the only check that reads the launched views back, and
  it needs a browser and six live services.
