// trackDb `group` -> the human-readable category JBrowse shows in the track
// selector. A Map rather than an object literal because the lookup key is an
// arbitrary group name off a hub, so the miss is the normal case and has to stay
// in the type.
const categoryMap = new Map([
  ['map', 'Mapping and Sequencing'],
  ['pub', 'Literature'],
  ['genes', 'Genes and Gene Predictions'],
  ['phenDis', 'Phenotypes, Variants, and Literature'],
  ['rep', 'Repeats'],
  ['varRep', 'Variation and Repeats'],
  ['rna', 'mRNA and EST'],
  ['neandertal', 'Neandertal Assembly and Analysis'],
  ['denisova', 'Denisova Assembly and Analysis'],
  ['expression', 'Expression'],
  ['compGeno', 'Comparative Genomics'],
  ['regulation', 'Regulation'],
  ['singleCell', 'Single cell'],
  ['hprc', 'Human Pangenome'],
])

// Unknown groups pass through as-is: a hub is free to invent one.
export function categoryLabel(group: string) {
  return categoryMap.get(group) ?? group
}
