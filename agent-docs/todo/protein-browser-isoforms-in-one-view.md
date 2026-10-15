---
name: protein-browser-isoforms-in-one-view
description:
  Open the canonical and the launched isoform's models superposed, with the
  private exon lit through a canonical → codon → launched residue map.
metadata:
  category: ready
  area: protein-browser
  first_move:
    "Make fetchGeneStructure return every isoform CDS and the entry's refseq[]
    map, not only the picked transcript."
  order: 1
---

# Protein browser: isoforms in one view

Background: `agent-docs/reference/PROTEIN_BROWSER.md` and
`agent-docs/architecture-decision-records/0005-protein-view-facets-and-molstar.md`,
which settled that isoforms superpose in one ProteinView.

## Isoforms superposed (page, medium, no plugin work)

Each `structures[]` entry has a separate `feature` and translation, so the
canonical model and the isoform model open superposed, each mapped to its own
transcript. Superposition alone does not show the mutually exclusive exon (both
models are entity 1 of separate files); a shared selection from the codon map
below lights it (PKM1 vs PKM2). Emit the union of both CDS sets as the genome
view's loc, or the private exon falls outside it.

## Codon identity, built as its first half

`translationRanges` maps residues through p2s_mapper's shared stretches, a rule
that places 335 of 89,927 shared residues wrongly (0.4%), all on paralogous
mutually exclusive exons (PKM, FGFR2). No launch reaches such an exon today:
MANE and the UniProt canonical are the same isoform for both, no chip names an
affected gene, and the launched isoforms that do differ (KMT2A, daf-16, rat
Bdnf, a 100-way row) differ by indels the rule handles. Superposed isoforms are
where the misplaced residues would show, so the map runs canonical residue →
genomic codon → launched residue, a third path beside the alignment, which
stays. It needs:

- `GeneStructure` to keep every isoform's CDS and the entry's `refseq[]` map;
  today `fetchGeneStructure` (`geneStructure.ts`) returns only
  `picked.transcript`.
- A check that the canonical's RefSeq NP spells UniProt's canonical (sequence
  conflicts exist); otherwise the alignment stays.

Run `pnpm check-protein-launches` after; the change touches what it guards.
