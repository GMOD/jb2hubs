// What UniProt reports at one residue: the Proteins API's variation query,
// about a second for one position where a whole gene is 2–14 MB. Curator
// notes carry the biology ("Hb S; at heterozygosity confers resistance to
// malaria"); the rest are ClinVar classes.

import { fetchJsonOr404 } from '../lib/fetchJson.ts'

const PROTEINS_API = 'https://www.ebi.ac.uk/proteins/api'
export type VariantClass =
  | 'pathogenic'
  | 'uncertain'
  | 'benign'
  | 'unclassified'

// UniProt's curator note on a substitution, with every alternate sharing it:
// TP53 R248Q and R248W are one note, "Li-Fraumeni syndrome; germline …".
export interface VariantNote {
  alts: string[]
  text: string
}

export interface ResidueVariants {
  position: number
  wildType?: string
  substitutions: { alt: string; class: VariantClass }[]
  // worst class first, then the most-cited
  notes: VariantNote[]
}

const CLASS_ORDER: VariantClass[] = [
  'pathogenic',
  'uncertain',
  'benign',
  'unclassified',
]

const CLASS_LABEL: Record<VariantClass, string> = {
  pathogenic: 'pathogenic',
  uncertain: 'uncertain significance',
  benign: 'benign',
  unclassified: 'no clinical class',
}

// Every record's ClinVar class for one substitution, read together, so records
// that disagree make it uncertain however the API splits them. `\b` keeps
// "Conflicting interpretations of pathogenicity" out of pathogenic.
function variantClass(significances: string[]): VariantClass {
  const has = (re: RegExp) => significances.some(t => re.test(t))
  const pathogenic = has(/pathogenic\b/i)
  const benign = has(/benign/i)
  return pathogenic && benign
    ? 'uncertain'
    : pathogenic
      ? 'pathogenic'
      : benign
        ? 'benign'
        : has(/uncertain|conflicting/i)
          ? 'uncertain'
          : 'unclassified'
}

interface ProteinsApiVariant {
  begin?: string
  end?: string
  wildType?: string
  alternativeSequence?: string
  consequenceType?: string
  clinicalSignificances?: { type: string }[]
  descriptions?: { value: string; sources?: string[] }[]
  evidences?: unknown[]
  association?: { name?: string }[]
}

const SUBSTITUTIONS = new Set(['missense', 'stop gained'])

// UniProt names a disease by acronym in a note ("SKCA; Hb S; …") and spells it
// out in the same records' associations ("Sickle cell disease (SKCA)"). Of
// several spellings the shortest reads best: "Colorectal cancer" over
// "Carcinoma of colon".
function diseaseAcronyms(features: ProteinsApiVariant[]) {
  const names = new Map<string, string>()
  for (const a of features.flatMap(f => f.association ?? [])) {
    const m = /^(.+) \(([A-Z][A-Z0-9-]+)\)$/.exec(a.name ?? '')
    const known = m && names.get(m[2]!)
    if (m && (!known || m[1]!.length < known.length)) {
      names.set(m[2]!, m[1]!)
    }
  }
  return names
}

const NOTE_LENGTH = 220

// The drug abbreviations UniProt's resistance notes use and spell out in the
// same or a sibling entry's comments (M. tuberculosis embB: "ethambutol [...
// EMB]"), from 1,010 resistance notes across 338 reviewed entries, 2026-10-11.
// Expanded only in a clause about resistance: outside one, PAS is periodic
// acid-Schiff and PI a pea germplasm accession.
const DRUG_ABBREVIATIONS: Record<string, string> = {
  EMB: 'ethambutol',
  PAS: 'para-aminosalicylic acid',
  GCV: 'ganciclovir',
  INH: 'isoniazid',
  ETH: 'ethionamide',
  PFA: 'foscarnet',
}

function spelledOut(clause: string, acronyms: Map<string, string>) {
  const disease = acronyms.get(clause)
  if (disease) {
    return disease
  }
  return /resist|suscep|sensitiv/i.test(clause)
    ? clause.replace(/\b[A-Z]{3}\b/g, abbr => DRUG_ABBREVIATIONS[abbr] ?? abbr)
    : clause
}

// A note is clauses: a disease acronym, the strains it was isolated from, then
// what the substitution does. The strain list goes and the acronym is spelled
// out. A list of other cancers it was "also found in" moves last, since BRAF
// V600E's would otherwise push "constitutive and elevated kinase activity" to
// the edge of the budget; clauses past the budget go, keeping the first.
function curatorNote(text: string, acronyms: Map<string, string>) {
  const kept = text
    .split(/;\s*/)
    .filter(c => c && !/\bstrains?\b/i.test(c))
    .map(c => spelledOut(c, acronyms))
  const elsewhere = (c: string) => /^also (found|seen|observed) in\b/i.test(c)
  const clauses = [
    ...kept.filter(c => !elsewhere(c)),
    ...kept.filter(elsewhere),
  ]
  let note = clauses[0] ?? ''
  for (const c of clauses.slice(1)) {
    if (note.length + c.length + 2 > NOTE_LENGTH) {
      return `${note}; …`
    }
    note = `${note}; ${c}`
  }
  return note
}

// The API answers a position query with the neighbouring positions too, so
// the filter on begin and end is needed.
export function parseResidueVariants(
  json: { features?: ProteinsApiVariant[] },
  position: number,
): ResidueVariants {
  const features = json.features ?? []
  const records = features.filter(
    f =>
      f.begin === String(position) &&
      f.end === String(position) &&
      SUBSTITUTIONS.has(f.consequenceType ?? '') &&
      f.alternativeSequence,
  )
  const acronyms = diseaseAcronyms(features)
  const byAlt = new Map<
    string,
    { significances: string[]; evidence: number; note?: string }
  >()
  for (const f of records) {
    const alt = f.alternativeSequence!
    const seen = byAlt.get(alt) ?? { significances: [], evidence: 0 }
    seen.significances.push(...(f.clinicalSignificances ?? []).map(c => c.type))
    seen.evidence += f.evidences?.length ?? 0
    const curated = f.descriptions?.find(d => d.sources?.includes('UniProt'))
    if (curated && !seen.note) {
      seen.note = curatorNote(curated.value, acronyms)
    }
    byAlt.set(alt, seen)
  }
  const rank = (c: VariantClass) => CLASS_ORDER.indexOf(c)
  const substitutions = [...byAlt]
    .map(([alt, s]) => ({ alt, class: variantClass(s.significances) }))
    .sort((a, b) => rank(a.class) - rank(b.class) || a.alt.localeCompare(b.alt))
  const notes = new Map<
    string,
    { alts: string[]; worst: number; evidence: number }
  >()
  for (const { alt, class: cls } of substitutions) {
    const { note, evidence } = byAlt.get(alt)!
    if (!note) {
      continue
    }
    const group = notes.get(note) ?? { alts: [], worst: rank(cls), evidence: 0 }
    group.alts.push(alt)
    group.evidence += evidence
    notes.set(note, group)
  }
  return {
    position,
    wildType: records[0]?.wildType,
    substitutions,
    notes: [...notes]
      .sort(([, a], [, b]) => a.worst - b.worst || b.evidence - a.evidence)
      .map(([text, { alts }]) => ({ alts, text })),
  }
}

// A whole gene's variants are 2-14 MB; one position is about a second. A
// protein UniProt holds no variation for is a 404.
export async function fetchResidueVariants(
  uniprotId: string,
  position: number,
): Promise<ResidueVariants | undefined> {
  const json = await fetchJsonOr404<{ features?: ProteinsApiVariant[] }>(
    `${PROTEINS_API}/variation/${encodeURIComponent(uniprotId)}?format=json&location=${position}`,
    'UniProt',
    uniprotId,
  )
  return json && parseResidueVariants(json, position)
}

const SHOWN_NOTES = 2

const altName = (alt: string) => (alt === '*' ? 'stop' : alt)

// The variants as lines: where, the best-attested curator notes, and the
// substitutions no shown note covers, by class.
export function residueVariantLines(v: ResidueVariants) {
  const at = `residue ${v.position}${v.wildType ? ` (${v.wildType})` : ''}`
  if (v.substitutions.length === 0) {
    return { at, notes: [] }
  }
  const notes = v.notes.slice(0, SHOWN_NOTES)
  const noted = new Set(notes.flatMap(n => n.alts))
  const parts = CLASS_ORDER.flatMap(cls => {
    const alts = v.substitutions
      .filter(s => s.class === cls && !noted.has(s.alt))
      .map(s => altName(s.alt))
    return alts.length ? [`${CLASS_LABEL[cls]} → ${alts.join(', ')}`] : []
  })
  return {
    at,
    notes: notes.map(n => `${n.alts.map(altName).join(', ')} — ${n.text}`),
    rest: parts.length
      ? `${notes.length ? 'Also ' : ''}${parts.join('; ')}.`
      : undefined,
  }
}
