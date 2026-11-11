// Which residues two isoforms of a gene share, read off the genome: a residue
// of one is a residue of the other where both translate the same three bases
// as one codon. Paralogous mutually exclusive exons spell alike and share no
// codon (PKM's exons 9 and 10, FGFR2's IIIb and IIIc), which an alignment of
// the two proteins cannot tell.

import type { Transcript } from './geneStructure.ts'

type Coding = Pick<Transcript, 'cds' | 'strand'>

function codons({ cds, strand }: Coding) {
  const ascending = cds
    .toSorted((a, b) => a.start - b.start)
    .flatMap(c =>
      Array.from({ length: c.end - c.start }, (_, i) => c.start + i),
    )
  const bases = strand === 1 ? ascending : ascending.toReversed()
  return Array.from({ length: Math.floor(bases.length / 3) }, (_, residue) =>
    bases.slice(3 * residue, 3 * residue + 3).join(','),
  )
}

// 0-based residue of `from` -> 0-based residue of `to`
export function sharedCodons(from: Coding, to: Coding) {
  const onTo = new Map(codons(to).map((codon, residue) => [codon, residue]))
  return new Map(
    codons(from).flatMap((codon, residue): [number, number][] => {
      const other = onTo.get(codon)
      return other === undefined ? [] : [[residue, other]]
    }),
  )
}
