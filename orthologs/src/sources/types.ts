// Shared shapes for the ortholog-table build. Each source normalizes its raw
// data into a Contribution; buildOrthologTable merges contributions and emits
// the source-agnostic TSVs the website reads.

// What the build needs to cover, derived from the synteny tracks.
export interface Wanted {
  // Cross-species "<loTax>_<hiTax>" keys (taxA != taxB).
  pairs: Set<string>
  // Same-species taxon ids (taxA == taxB).
  sameTaxa: Set<number>
}

// One source's normalized output.
export interface Contribution {
  // "<loTax>_<hiTax>" -> set of "loSym<TAB>hiSym" rows (canonical orientation).
  pairRows: Map<string, Set<string>>
  // taxon id -> (symbol -> "synonym1|synonym2|..." ; empty string when none).
  taxonGenes: Map<number, Map<string, string>>
}

export interface OrthologSource {
  name: string
  gather(wanted: Wanted): Promise<Contribution>
}
