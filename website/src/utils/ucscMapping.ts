// One entry of list.json's ucscGenomes, as much of it as the pages read.
export interface UcscGenomeEntry {
  description: string
  organism: string
  scientificName: string
  sourceName?: string
  taxId: number
}

export interface MappableAssembly {
  accession: string
  ncbiAssemblyName?: string
  pairedAccession?: string
  taxonId: number
}

interface UcscClaim {
  db: string
  assemblyName?: string
}

const ACCESSION = /GC[AF]_\d+\.\d+/g

export function ucscAccessions(genome: UcscGenomeEntry) {
  const text = `${genome.sourceName ?? ''} ${genome.description}`
  return [...new Set([...text.matchAll(ACCESSION)].map(m => m[0]))]
}

// "Aug. 2011 (SGSC Sscrofa10.2/susScr3)" -> "SGSC Sscrofa10.2". A
// GenArk-backed entry puts its accession after the slash instead of the db.
export function ucscAssemblyName(description: string) {
  const inner = /\(([^()]*)\)\s*$/.exec(description)?.[1] ?? ''
  const slash = inner.lastIndexOf('/')
  return slash > 0 ? inner.slice(0, slash).trim() : undefined
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// UCSC prefixes the submitter ("SGSC Sscrofa10.2", "ICGSC Felis_catus 6.2"),
// so the NCBI name has to equal some trailing run of the UCSC name's words. A
// patch release (GRCh38.p14) keeps its major assembly's coordinates, so the
// patch suffix goes. A name with no digit or no letter ("Broad", "1.0") says
// nothing about which assembly it is and never agrees.
export function assemblyNamesAgree(ucscName: string, ncbiName: string) {
  const target = normalize(ncbiName.replace(/\.p\d+$/i, ''))
  if (!/[a-z]/.test(target) || !/\d/.test(target)) {
    return false
  }
  const words = ucscName.split(/\s+/)
  return words.some((_, i) => normalize(words.slice(i).join('')) === target)
}

function only<T>(items: T[]) {
  return items.length === 1 ? items[0] : undefined
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  map.set(key, [...(map.get(key) ?? []), value])
}

// Which UCSC browser db an assembly accession is. A wrong answer launches a
// different genome under the accession's name, so an ambiguous or unconfirmed
// match maps to nothing and the accession page keeps its GenArk config.
//
// An accession a UCSC entry names (in sourceName, or after the slash of a
// GenArk-backed description) decides it, unless two entries name it — gorGor3
// and gorGor4 both claim GCA_000151905.1 — and then the assembly name has to
// pick one. Otherwise the assembly name decides, among the entries for the same
// taxon: galGal6, susScr11 and canFam6 name no accession at all, and no entry
// names a patch release such as GRCh38.p14.
//
// A shared accession base is not evidence. GRC keeps one base across major
// versions, so GCF_000001635.26 is GRCm38 (mm10) and .27 is GRCm39 (mm39), and
// NCBI bumps a base's version for a new assembly as readily as for a patch.
export function mapAccessionsToUcsc(
  genomes: Record<string, UcscGenomeEntry>,
  assemblies: Iterable<MappableAssembly>,
) {
  const byAccession = new Map<string, UcscClaim[]>()
  const byTaxon = new Map<number, UcscClaim[]>()
  for (const [db, genome] of Object.entries(genomes)) {
    const claim = { db, assemblyName: ucscAssemblyName(genome.description) }
    for (const accession of ucscAccessions(genome)) {
      push(byAccession, accession, claim)
    }
    push(byTaxon, genome.taxId, claim)
  }

  const mapping = new Map<string, string>()
  for (const assembly of assemblies) {
    const { accession, pairedAccession, ncbiAssemblyName: name } = assembly
    const agrees = ({ assemblyName }: UcscClaim) =>
      !!name && !!assemblyName && assemblyNamesAgree(assemblyName, name)
    const named = [
      ...new Set(
        [accession, pairedAccession].flatMap(a =>
          a ? (byAccession.get(a) ?? []) : [],
        ),
      ),
    ]
    const claim =
      named.length > 0
        ? only(named.length > 1 ? named.filter(agrees) : named)
        : only((byTaxon.get(assembly.taxonId) ?? []).filter(agrees))
    if (claim) {
      mapping.set(accession, claim.db)
    }
  }
  return mapping
}
