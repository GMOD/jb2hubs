// OMIA's cattle variants as a GFF3 track on ARS-UCD1.2, for the bovine graph's
// launches. OMIA's variant table (https://omia.org/download/) places each
// variant with a g. description on the assembly its paper used. ARS-UCD1.3
// keeps 1.2's chromosome sequences (the RefSeq accessions stay at version .1),
// so both place; an ARS-UCD2.0 or UMD3.1 row would need a liftover and stays
// out, and so does a row with no position.

import { gffAttributes } from './pangenomeKnownAlleles.ts'

export const OMIA_CATTLE_CSV =
  'https://omia.org/download/csv/variants/?search_type=advanced&gb_species_id=9913&query_type=and&result_type=variant'

const PLACED_ASSEMBLIES = new Set(['ARS-UCD1.2', 'ARS-UCD1.3'])

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      rows.push([...row, field.replace(/\r$/, '')])
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field || row.length > 0) {
    rows.push([...row, field])
  }
  return rows
}

// The bases a g. description names, 0-based half-open: every position in it,
// which covers g.123A>G, g.123_456del and OMIA's compound
// g.[2429327_2429336del;2429109_2429320dupins]. Undefined for an uncertain
// bound (g.(?_123)) or an insertion quoted from another sequence.
export function hgvsSpan(g: string) {
  const at = g.indexOf('g.')
  const description = at === -1 ? '' : g.slice(at + 2)
  if (!description || /[?:]/.test(description)) {
    return undefined
  }
  const positions = [...description.matchAll(/(?:^|[_[;])(\d+)/g)].map(m =>
    Number(m[1]),
  )
  return positions.length > 0
    ? { start: Math.min(...positions) - 1, end: Math.max(...positions) }
    : undefined
}

const omiaUrl = (phene: string) => {
  const m = /OMIA (\d{6})-(\d+)/.exec(phene)
  return m ? `https://omia.org/OMIA${m[1]}/${m[2]}/` : undefined
}

export function omiaGff3(csv: string) {
  const [header, ...rows] = parseCsv(csv)
  const column = (name: string) => {
    const i = header!.indexOf(name)
    if (i === -1) {
      throw new Error(`OMIA's variant table has no "${name}" column`)
    }
    return (row: string[]) => (row[i] ?? '').trim()
  }
  const id = column('OMIA Variant ID')
  const phene = column('OMIA Phene-Species ID(s)')
  const breeds = column('Breed(s)')
  const phenotype = column('Variant Phenotype')
  const gene = column('Gene')
  const type = column('Variant Type')
  const effect = column('Variant Effect')
  const assembly = column('Reference Sequence')
  const chr = column('Chr.')
  const g = column('g. or m.')
  const c = column('c. or n.')
  const p = column('p.')
  const pubmed = column('PubMed ID(s)')

  const skipped = { assembly: 0, position: 0 }
  const features = rows.flatMap(row => {
    if (!PLACED_ASSEMBLIES.has(assembly(row))) {
      skipped.assembly++
      return []
    }
    const span = hgvsSpan(g(row))
    if (!span || !/^(\d+|X|Y)$/.test(chr(row))) {
      skipped.position++
      return []
    }
    const url = omiaUrl(phene(row))
    const pmids = pubmed(row)
      .split(/[\s,;]+/)
      .filter(Boolean)
    return [
      {
        chrom: `chr${chr(row)}`,
        ...span,
        attributes: gffAttributes([
          ['ID', `omia-variant-${id(row)}`],
          ['Name', `${gene(row)} ${phenotype(row)}`.trim()],
          ['Note', [type(row), effect(row)].filter(Boolean).join(', ')],
          ['breeds', breeds(row)],
          ['hgvs', [g(row), c(row), p(row)].filter(Boolean)],
          ...(url
            ? [['omia', `${phene(row)} ${url}`] as [string, string]]
            : []),
          ...(pmids.length > 0
            ? [
                [
                  'pubmed',
                  pmids.map(
                    pmid =>
                      `PMID ${pmid} https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                  ),
                ] as [string, string[]],
              ]
            : []),
        ]),
      },
    ]
  })
  features.sort((a, b) =>
    a.chrom === b.chrom ? a.start - b.start : a.chrom < b.chrom ? -1 : 1,
  )
  const lines = features.map(f =>
    [
      f.chrom,
      'OMIA',
      'sequence_alteration',
      f.start + 1,
      f.end,
      '.',
      '.',
      '.',
      f.attributes,
    ].join('\t'),
  )
  return {
    gff3: `##gff-version 3\n# OMIA (omia.org), cattle variants placed on ARS-UCD1.2. Please cite OMIA.\n${lines.join('\n')}\n`,
    placed: features.length,
    skipped,
  }
}
