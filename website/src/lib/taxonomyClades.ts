// The clade filter offered on /search, in one place because two copies of it
// cannot be kept honest: generateTaxonomyFilter.ts writes taxonomyFilter.json
// keyed by `label`, and the dropdown looks its selection up by the same key, so
// a list that drifts produces an option matching nothing — with no error, just a
// filter that always returns zero genomes. The taxon ids were duplicated too,
// once as data in the generator and once as prose in each display string.
//
// Ordered specific to broad, which is the order the dropdown offers them in.

export interface CuratedClade {
  // Scientific name, and the key under which this clade's taxon ids are stored.
  label: string
  taxonId: number
  // English name, absent only where the scientific name already IS the English
  // word (Primates, Fungi, Bacteria, Archaea, Viruses) and a parenthetical would
  // just repeat it. Every other entry carries one: "Actinopterygii" on its own is
  // not a term a user searching for a fish genome would recognize.
  common?: string
}

// Chosen to be a drill-down ladder rather than a flat pick of ranks — vertebrate
// subgroups, vertebrates, the invertebrate phyla we host enough of, animals,
// plants, fungi, all eukaryotes, then the non-eukaryotic domains. Ranks are mixed
// on purpose (Primates is an order, Bacteria a domain): the useful cut is by the
// group a user names, not by a level of the taxonomy.
//
// The bar for an entry is that it meaningfully narrows the ~50K assemblies AND is
// not already covered by its neighbour. That is why there is no Insecta (500 of
// Arthropoda's 578, so it filters almost nothing extra), no Embryophyta (292 of
// Viridiplantae's 319), and no Ascomycota (1060 of Fungi's 1536). Counts as of
// 2026-08-05, from the hosted assemblies; re-measure before adding one.
export const CURATED_CLADES: CuratedClade[] = [
  { label: 'Primates', taxonId: 9443 },
  { label: 'Rodentia', taxonId: 9989, common: 'rodents' },
  { label: 'Mammalia', taxonId: 40674, common: 'mammals' },
  { label: 'Aves', taxonId: 8782, common: 'birds' },
  { label: 'Actinopterygii', taxonId: 7898, common: 'ray-finned fish' },
  { label: 'Vertebrata', taxonId: 7742, common: 'vertebrates' },
  { label: 'Arthropoda', taxonId: 6656, common: 'arthropods' },
  { label: 'Nematoda', taxonId: 6231, common: 'roundworms' },
  { label: 'Metazoa', taxonId: 33208, common: 'animals' },
  { label: 'Viridiplantae', taxonId: 33090, common: 'plants' },
  { label: 'Fungi', taxonId: 4751 },
  // The only way to ask for "not a bacterium or a virus". Without it the ~300
  // protists we host — apicomplexans, euglenozoans, amoebae — match no filter at
  // all, since they are outside animals, plants and fungi alike.
  { label: 'Eukaryota', taxonId: 2759, common: 'eukaryotes' },
  { label: 'Bacteria', taxonId: 2 },
  { label: 'Archaea', taxonId: 2157 },
  { label: 'Viruses', taxonId: 10239 },
]

// Dropdown text, e.g. "Mammalia (mammals) [txid:40674]". The taxon id is shown
// because the scientific names alone leave it ambiguous which rank is meant.
export function cladeDisplay({ label, common, taxonId }: CuratedClade) {
  return `${label}${common ? ` (${common})` : ''} [txid:${taxonId}]`
}
