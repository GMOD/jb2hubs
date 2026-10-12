// Where a focused residue sits and what it touches, as sentences: its InterPro
// domain and kinase landmark, the partners PDBe-KB has seen it touch split by
// species, the ligands it binds by a name a reader knows, UniProt's curated
// chains and regions, and PDBe-KB's conservation profile.

import { fetchJsonOr404 } from '../lib/fetchJson.ts'
import { regionContaining } from './focus.ts'
import { type ResidueVariants, spelledOut } from './residueVariants.ts'

import type { ProteinRegion } from './proteinRegions.ts'

const UNIPROT_REST = 'https://rest.uniprot.org/uniprotkb'

// Which species a partner is from, so a sentence can tell the protein's own
// partners from a pathogen's or a virus's: HBB's residue 7 touches S. aureus
// IsdH and IsdB, and neither haemoglobin chain.
export interface PartnerOrigin {
  species: string
  gene?: string
}

const NUCLEIC = new Set(['DNA', 'RNA'])

// The accessions whose species the sentence needs, or none when every partner
// is the protein itself or a nucleic acid.
// UniProt's accession format. PDBe files an antibody chain under a pseudo
// accession (`IG-heavy chain`), and one of those makes UniProt answer the
// whole accessions call with a 400.
const UNIPROT_ACCESSION =
  /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/

// An antibody or antibody fragment, as PDBe names one: a crystallisation
// chaperone, a therapeutic or a patient's, never the protein's own partner.
function isAntibody(r: ProteinRegion) {
  return (
    /^IG[HKL]?[- ]/.test(r.accession ?? '') ||
    (/^IG[HKL]? |immunoglobulin|\bfab\b|antibod|nanobod|\bfv\b|\b(heavy|light) chain\b|\bigg\b/i.test(
      r.name,
    ) &&
      !/binding protein/i.test(r.name))
  )
}

// The PDB entry that shows what a residue does: the one its nucleic-acid
// contact, else its best-attested ligand site, else its largest protein
// interface was seen in, antibodies aside. Undefined when PDBe has seen
// nothing touch it, and the AlphaFold model opens.
export function entryShowing(
  position: number,
  partners: ProteinRegion[] = [],
  ligands: ProteinRegion[] = [],
) {
  const touches = (r: ProteinRegion) =>
    !!r.residues?.includes(position) && !!r.pdbIds?.length
  const rank = (r: ProteinRegion) =>
    NUCLEIC.has(r.accession ?? '') ? 0 : r.kind === 'ligand' ? 1 : 2
  return [...partners.filter(r => !isAntibody(r)), ...ligands]
    .filter(touches)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (b.residues?.length ?? 0) - (a.residues?.length ?? 0),
    )[0]?.pdbIds?.[0]
}

export function partnerAccessions(
  uniprotId: string,
  partners: ProteinRegion[],
) {
  const others = partners
    .filter(r => !isAntibody(r))
    .map(r => r.accession ?? '')
    .filter(a => a !== uniprotId && UNIPROT_ACCESSION.test(a))
  return others.length ? [uniprotId, ...new Set(others)] : []
}

interface UniProtOriginResult {
  primaryAccession?: string
  organism?: { scientificName?: string }
  genes?: { geneName?: { value?: string } }[]
}

// "Staphylococcus aureus (strain MW2)" and "(strain NCTC 8325 / PS 47)" are
// one species to a reader.
export function parseOrigins(json: { results?: UniProtOriginResult[] }) {
  const origins = new Map<string, PartnerOrigin>()
  for (const r of json.results ?? []) {
    const species = r.organism?.scientificName?.replace(/\s*\(.*\)$/, '')
    if (r.primaryAccession && species) {
      origins.set(r.primaryAccession, {
        species,
        gene: r.genes?.[0]?.geneName?.value,
      })
    }
  }
  return origins
}

export async function fetchOrigins(accessions: string[]) {
  const res = await fetch(
    `${UNIPROT_REST}/accessions?accessions=${accessions.map(encodeURIComponent).join(',')}&fields=accession,organism_name,gene_primary&format=json`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`UniProt ${res.status} for partner species`)
  }
  return parseOrigins(await res.json())
}

const SHOWN_CONTACTS = 3
const SHOWN_SPECIES = 2
const SHOWN_MUTAGENS = 2

const RCSB_GRAPHQL = 'https://data.rcsb.org/graphql'

// A ligand a reader knows by name. PDBe's names are the chemical component
// dictionary's: RIFAMPICIN and SORANGICIN A read as words, a systematic name
// with locants and brackets does not, and the commonest cofactors read best
// as what biologists call them.
// What half the proteins in the PDB bind, which a residue's list puts last.
const COFACTORS = new Set(
  'HEM HEC HEA NAG ZN MG CA FE FE2 MN ATP ADP ANP AGS GTP GDP GNP FUC'.split(
    ' ',
  ),
)

const LIGAND_NAMES: Record<string, string> = {
  HEM: 'haem',
  HEC: 'haem',
  HEA: 'haem',
  NAG: 'a glycan',
  ZN: 'zinc',
  MG: 'magnesium',
  CA: 'calcium',
  FE: 'iron',
  FE2: 'iron',
  MN: 'manganese',
  ATP: 'ATP',
  ADP: 'ADP',
  ANP: 'an ATP analogue',
  AGS: 'an ATP analogue',
  GTP: 'GTP',
  GDP: 'GDP',
  GNP: 'a GTP analogue',
  FUC: 'fucose',
  // The plant phytochromes' bilin, which RCSB names only systematically;
  // Arabidopsis phyB's 4OUR holds it at Cys357 as its native chromophore
  // (Burgie et al. 2014, PNAS 111:10179, doi:10.1073/pnas.1403096111).
  O6E: 'phytochromobilin',
  // Methylene quinuclidinone (MQ) after its Michael addition to a cysteine,
  // which RCSB names only as 2-methylquinuclidin-3-one. MQ is what PRIMA-1
  // and APR-246 (eprenetapopt) convert to, and it reactivates mutant p53 by
  // binding the core domain's cysteines (Zhang et al. 2018, Cell Death Dis
  // 9:439, doi:10.1038/s41419-018-0463-7). All eleven PDB entries holding
  // QNN or QN8 are p53 core domains from Degtjarik et al. 2021, Nat Commun
  // 12:7057, doi:10.1038/s41467-021-27142-6.
  QNN: 'methylene quinuclidinone (APR-246’s active form)',
  QN8: 'methylene quinuclidinone (APR-246’s active form)',
}
// A short all-capital word is an abbreviation (ATP, NADH) and keeps its case;
// a longer one is a name in the dictionary's capitals (RIFAMPICIN).
const ABBREVIATION_LENGTH = 4

function readable(name: string) {
  const keepsCase = (w: string) =>
    w.length === 1 ||
    /^[IVX]+$/.test(w) ||
    /[a-z][A-Z]/.test(w) ||
    (w.length <= ABBREVIATION_LENGTH && w === w.toUpperCase() && w !== 'ION')
  return /^[A-Za-z][A-Za-z -]{2,24}$/.test(name)
    ? name
        .split(' ')
        .map(w => (keepsCase(w) ? w : w.toLowerCase()))
        .join(' ')
    : undefined
}

export function ligandName({ id, name }: { id: string; name: string }) {
  return LIGAND_NAMES[id] ?? readable(name)
}

const LOOKED_UP_LIGANDS = 10

// The ligands touching a residue that PDBe names only systematically, best
// attested first. A drug often has its common name among the component's
// synonyms: ERG11 Tyr132's 1YN is itraconazole.
export function unnamedLigands(position: number, sites: ProteinRegion[]) {
  return [
    ...new Set(
      sites.flatMap(s =>
        (s.ligands ?? [])
          .filter(l => l.residues.includes(position) && !ligandName(l))
          .map(l => l.id),
      ),
    ),
  ].slice(0, LOOKED_UP_LIGANDS)
}

interface RcsbChemComps {
  data?: {
    chem_comps?: ({
      chem_comp?: { id?: string }
      rcsb_chem_comp_synonyms?: { name?: string }[] | null
    } | null)[]
  }
}

// The first synonym that reads as a word, per component; one with none stays
// unnamed unless LIGAND_NAMES knows it, as it knows TP53 Arg248's QNN.
export function parseLigandSynonyms(json: RcsbChemComps) {
  const names = new Map<string, string>()
  for (const c of json.data?.chem_comps ?? []) {
    const id = c?.chem_comp?.id
    const name = (c?.rcsb_chem_comp_synonyms ?? [])
      .map(syn => readable(syn.name ?? ''))
      .find(Boolean)
    if (id && name) {
      names.set(id, name)
    }
  }
  return names
}

// RCSB's GraphQL answers a GET, so one request names every ligand without a
// CORS preflight, about 0.1 s.
export async function fetchLigandSynonyms(ids: string[]) {
  const query = `{chem_comps(comp_ids:${JSON.stringify(ids)}){chem_comp{id} rcsb_chem_comp_synonyms{name}}}`
  const res = await fetch(
    `${RCSB_GRAPHQL}?query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`RCSB ${res.status} for ligand names`)
  }
  return parseLigandSynonyms(await res.json())
}

// The landmarks every protein kinase domain carries, found by their motifs:
// the glycine-rich loop (GxGxxG) over the ATP, the catalytic loop (HRD, YRD in
// the AGC kinases), and the activation segment from DFG to APE (Nolen, Taylor
// & Ghosh 2004), whose conformation switches the kinase on. EGFR, ERBB2 and
// MET end theirs in ALE and ALK and BTK in PPE; RET's AIE and CK2's missing
// one are left unnamed rather than guessed. Checked 2026-10-11 against
// UniProt's own kinase domains for 29 kinases: BRAF DFG594–APE621, KIT
// DFG810–APE837, ABL1 DFG381–APE407, PKA YRD165, DFG185, APE207.
const KINASE_DOMAIN =
  /protein kinase|tyrosine-protein kinase|serine\/threonine-protein kinase/i

export interface KinaseLandmark {
  name: string
  start: number
  end: number
}

export function kinaseLandmarks(
  sequence: string,
  start: number,
  end: number,
): KinaseLandmark[] {
  const domain = sequence.slice(start - 1, end)
  const at = (offset: number) => start + offset
  const landmarks: KinaseLandmark[] = []
  const gly = /G.G..G/.exec(domain.slice(0, 40))
  if (gly) {
    landmarks.push({
      name: 'glycine-rich loop, which closes over the ATP',
      start: at(gly.index),
      end: at(gly.index + 5),
    })
  }
  const motif = (re: RegExp, from: number, to: number) => {
    const m = re.exec(domain.slice(from, to))
    return m ? from + m.index : undefined
  }
  for (const hrd of domain.matchAll(/[HY][RYCLFNG]D/g)) {
    const from = hrd.index + 3
    const dfg = motif(/D[FLYW]G/, from, from + 30)
    if (dfg === undefined) {
      continue
    }
    landmarks.push({
      name: `catalytic loop (${hrd[0]})`,
      start: at(hrd.index),
      end: at(hrd.index + 7),
    })
    const ape = motif(/[ASPV][PL]E/, dfg + 15, dfg + 45)
    if (ape !== undefined) {
      const triplet = (i: number) => domain.slice(i, i + 3)
      landmarks.push({
        name: `activation segment (${triplet(dfg)}${at(dfg)}–${triplet(ape)}${at(ape)}), which switches the kinase on`,
        start: at(dfg),
        end: at(ape + 2),
      })
    }
    break
  }
  return landmarks
}

function listed(names: string[], shown: number) {
  const head = names.slice(0, shown)
  const more = names.length - head.length
  const items = more > 0 ? [...head, `${more} more`] : head
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '')
}

// Where a residue sits: its domain, which of the protein's own partners PDBe-KB
// has seen it touch (or that it touches none of them), what other species'
// proteins touch it, and which ligands it binds. DNA and RNA lead, then the
// protein itself, since those are the contacts a reader can place. Sites whose
// ligands have no readable name are counted. Without `origins` every partner
// counts as the protein's own.
export type ContextClause = {
  kind:
    | 'domain'
    | 'chain'
    | 'region'
    | 'contacts'
    | 'foreign'
    | 'epitope'
    | 'binds'
    | 'sites'
    | 'site'
    | 'mutagen'
  text: string
  // mutagen only: what replaced the residue, for a headline
  mutagen?: {
    original: string
    alts: string[]
    effect: string
    position: number
  }
  // contacts only: DNA or RNA among them, which a headline adds
  nucleic?: string[]
}

export function residueContextText(
  ...args: Parameters<typeof residueContextClauses>
) {
  const clauses = residueContextClauses(...args)
  return clauses.length
    ? `Residue ${args[0]} ${clauses.map(c => c.text).join('; ')}.`
    : ''
}

// A clause as a line of its own: "Outside the protein's interfaces with …".
export function clauseLine({ text }: ContextClause) {
  const line = text.replace(/^is /, '')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

export function residueContextClauses(
  position: number,
  uniprotId: string,
  domains: ProteinRegion[],
  known: {
    partners?: ProteinRegion[]
    ligands?: ProteinRegion[]
    origins?: Map<string, PartnerOrigin>
    ligandSynonyms?: Map<string, string>
    sequence?: string
    curated?: CuratedSpan[]
  } = {},
): ContextClause[] {
  const { partners, ligands, origins, ligandSynonyms, sequence, curated } =
    known
  const touches = (r: ProteinRegion) => !!r.residues?.includes(position)
  const ownSpecies = origins?.get(uniprotId)?.species
  const foreignSpecies = (r: ProteinRegion) => {
    const species = origins?.get(r.accession ?? '')?.species
    return ownSpecies && species && species !== ownSpecies ? species : undefined
  }
  const rank = (r: ProteinRegion) =>
    NUCLEIC.has(r.accession ?? '') ? 0 : r.accession === uniprotId ? 1 : 2
  const proteins = (partners ?? []).filter(r => !isAntibody(r))
  const epitope = (partners ?? []).some(r => isAntibody(r) && touches(r))
  const own = proteins
    .filter(r => !foreignSpecies(r))
    .sort((a, b) => rank(a) - rank(b))
  const ownNames = (regions: ProteinRegion[]) => [
    ...new Set(regions.map(r => r.name)),
  ]
  const ownTouching = ownNames(own.filter(touches))

  const bySpecies = new Map<string, Set<string>>()
  for (const r of proteins.filter(touches)) {
    const species = foreignSpecies(r)
    if (species) {
      const name = origins?.get(r.accession ?? '')?.gene ?? r.name
      bySpecies.set(species, (bySpecies.get(species) ?? new Set()).add(name))
    }
  }
  const foreign = listed(
    [...bySpecies].map(
      ([species, names]) => `${species} ${listed([...names], SHOWN_CONTACTS)}`,
    ),
    SHOWN_SPECIES,
  )

  const domain = regionContaining(domains, position)
  const {
    chain,
    region,
    sites: marks,
    mutagens,
  } = curatedSpansAt(
    position,
    curated ?? [],
    sequence?.length ?? Math.max(0, ...(curated ?? []).map(s => s.end)),
  )
  const kinase = domains.find(
    r =>
      r.kind === 'domain' &&
      KINASE_DOMAIN.test(r.name) &&
      r.start <= position &&
      position <= r.end,
  )
  const landmark =
    kinase && sequence
      ? kinaseLandmarks(sequence, kinase.start, kinase.end).find(
          l => l.start <= position && position <= l.end,
        )
      : undefined
  const sites = (ligands ?? []).filter(touches)
  // a drug or a named ligand before the cofactors: yeast actin D157 binds
  // latrunculin, which a list led by ATP and ADP hid
  const touching = sites.flatMap(s =>
    (s.ligands ?? []).filter(l => l.residues.includes(position)),
  )
  const bound = [
    ...new Set(
      [
        ...touching.filter(l => !COFACTORS.has(l.id)),
        ...touching.filter(l => COFACTORS.has(l.id)),
      ].flatMap(l => ligandName(l) ?? ligandSynonyms?.get(l.id) ?? []),
    ),
  ]
  const clause = (kind: ContextClause['kind'], text: string | false) =>
    text ? [{ kind, text }] : []
  const nucleic = own
    .filter(r => touches(r) && NUCLEIC.has(r.accession ?? ''))
    .map(r => r.accession ?? '')
  return [
    ...clause(
      'domain',
      !!domain &&
        `lies in the ${domain.kind} “${domain.name}”${landmark ? `, in its ${landmark.name}` : ''}`,
    ),
    ...clause(
      'chain',
      !!chain && `is in ${chain.name} (${chain.start}–${chain.end})`,
    ),
    ...clause(
      'region',
      !!region &&
        `is in UniProt's “${region.name}” (${region.start}–${region.end})`,
    ),
    ...marks.flatMap(m => clause('site', siteText(m))),
    ...mutagens.slice(0, SHOWN_MUTAGENS).flatMap(m =>
      clause(
        'mutagen',
        `in experiments ${m.original}→${(m.alts ?? []).join('/')}: ${m.name}`,
      ).map(c => ({
        ...c,
        mutagen: {
          original: m.original ?? '',
          alts: m.alts ?? [],
          effect: m.name,
          position: m.start,
        },
      })),
    ),
    ...clause(
      'contacts',
      ownTouching.length > 0
        ? `contacts ${listed(ownTouching, SHOWN_CONTACTS)}`
        : own.length > 0 &&
            `is outside the protein's interfaces with ${listed(ownNames(own), SHOWN_CONTACTS)}`,
    ).map(c => (nucleic.length ? { ...c, nucleic } : c)),
    ...clause(
      'foreign',
      !!foreign &&
        (ownTouching.length > 0
          ? `also touches ${foreign}`
          : own.length > 0
            ? `touches only ${foreign}`
            : `touches ${foreign}`),
    ),
    ...clause('epitope', epitope && 'is in an antibody epitope'),
    ...(bound.length > 0
      ? clause('binds', `binds ${listed(bound, SHOWN_CONTACTS)}`)
      : clause(
          'sites',
          sites.length > 0 &&
            `is in ${sites.length} ligand site${sites.length > 1 ? 's' : ''}`,
        )),
  ]
}

const HEADLINE_LENGTH = 120

// What a substitution does, as UniProt's curators word it: BRAF V600E's
// "constitutive and elevated kinase activity", HBB E6V's "at heterozygosity
// confers resistance to malaria".
const FUNCTIONAL =
  /activit|resist|confer|bind|stabil|transform|abolish|impair|reduc|increas|decreas|enhanc|constitutiv|sensitiv|loss of|gain of|fold|aggregat/i
// A clause every somatic or germline record carries, which says nothing about
// this substitution in a headline.
const FILLER = /^(somatic|germline) mutation$/i

// A variant's own name in a note, "Hb S" beside "Sickle cell disease".
const VARIANT_NAME_LENGTH = 8

// A curator note cut for a headline: the note's first clause (the disease or
// what the variant is called) and the variant's short name, then what the
// substitution does, then the rest, to the length budget.
function headlineNote(text: string) {
  const [first = '', ...rest] = text
    .replace(/; …$/, '')
    .split('; ')
    .filter(c => !FILLER.test(c))
  const named = (c: string) => c.length <= VARIANT_NAME_LENGTH
  const ordered = [
    ...rest.filter(named),
    ...rest.filter(c => !named(c) && FUNCTIONAL.test(c)),
    ...rest.filter(c => !named(c) && !FUNCTIONAL.test(c)),
  ]
  let note = first
  for (const c of ordered) {
    if (note.length + c.length + 2 > HEADLINE_LENGTH) {
      return `${note}; …`
    }
    note = `${note}; ${c}`
  }
  return note
}

// The one fact a focused residue leads with. UniProt's note on the
// substitution the chip names comes first, in the chip's numbering (HBB's
// "E6V — Sickle cell disease; …", rpoB's "S450L, S450Q, S450W —
// rifampicin-resistant"), then the best-cited note, then what the residue
// binds or touches, then where it lies. A note gains the residue's DNA or
// RNA contact, since TP53 R248's disease is a residue that reaches into DNA.
export function residueHeadline(
  variants: ResidueVariants | undefined,
  clauses: ContextClause[],
  label?: string,
  conservation?: ResidueConservation,
  wildType = variants?.wildType,
) {
  const named = /\b([A-Z])(\d+)([A-Z*])?(?!\w)/.exec(label ?? '')
  const notes = variants?.notes ?? []
  const note =
    notes.find(n => named?.[3] && n.alts.includes(named[3])) ?? notes[0]
  const mutated = clauses.find(
    c => named?.[3] && c.mutagen?.alts.includes(named[3]),
  )?.mutagen
  const number = (position: number) => named?.[2] ?? String(position)
  if (!(variants && note) && mutated) {
    return `${mutated.original}${number(mutated.position)}${named?.[3]} — ${headlineNote(mutated.effect)}`
  }
  if (variants && note) {
    const at = `${named?.[1] ?? variants.wildType ?? ''}${named?.[2] ?? variants.position}`
    const nucleic = clauses.find(c => c.nucleic)?.nucleic
    const contact = nucleic ? ` · contacts ${nucleic.join(' and ')}` : ''
    return `${note.alts.map(a => `${at}${a}`).join(', ')} — ${headlineNote(note.text)}${contact}`
  }
  const experiment = clauses.find(c => c.mutagen)?.mutagen
  const lead = [
    clauses.find(c => c.kind === 'binds'),
    experiment && {
      kind: 'mutagen' as const,
      text: `${experiment.original}${number(experiment.position)}${experiment.alts.join('/')} — ${headlineNote(experiment.effect)}`,
    },
    clauses.find(c => c.nucleic),
    ...(
      ['site', 'contacts', 'region', 'foreign', 'domain', 'chain'] as const
    ).map(kind => clauses.find(c => c.kind === kind)),
  ].find(Boolean)
  const own = conservation?.profile.find(r => r.aa === wildType)
  const conserved =
    own && own.p >= CONSERVED_SHARE
      ? `conserved across homologues (${own.aa} ${Math.round(own.p * 100)}%)`
      : ''
  return lead
    ? `${clauseLine(lead)}${conserved ? ` · ${conserved}` : ''}`
    : conserved
      ? conserved.charAt(0).toUpperCase() + conserved.slice(1)
      : undefined
}

// The line a focused domain leads with: which of the protein's copies it is,
// and what its alignment holds. NOTCH1's chip opens one of thirty-six EGF
// repeats against the Pfam seed, and the seed is what the reader would not
// otherwise know to look at.
export function domainHeadline(
  region: ProteinRegion,
  regions: ProteinRegion[],
  seedRows?: number,
) {
  const copies = regions
    .filter(r => r.kind === region.kind && r.accession === region.accession)
    .sort((a, b) => a.start - b.start)
  const index = copies.findIndex(r => r.start === region.start)
  const which =
    copies.length > 1 && index >= 0
      ? `${region.name} ${index + 1} of ${copies.length}`
      : region.name
  const seed =
    seedRows && region.pfam
      ? ` — opens beside ${seedRows} members of Pfam's ${region.pfam} seed`
      : ''
  return `${which} (${region.start}–${region.end})${seed}`
}

// What UniProt's curators mark on the protein besides domains: the chains a
// precursor is cut into (SARS-CoV-2 Spike's S1 and S2) and named regions and
// motifs ("Receptor-binding motif; binding to human ACE2", "Interaction with
// the 53BP2 SH3 domain"). About 5 KB for TP53.
//
// Also what they mark at single residues, which is often a model organism's
// whole story: an active site (S. pombe cdc25's "Phosphocysteine
// intermediate"), a modification (B. subtilis Spo0A's 4-aspartylphosphate,
// DAF-16's AKT phosphothreonine, Wingless's palmitoleoyl serine), and what a
// mutation did in an experiment (let-60 G13E "In n1046; multivulva
// phenotype"). About 29 KB for TP53.
export interface CuratedSpan {
  kind: 'chain' | 'region' | 'site' | 'mutagen'
  // site only: UniProt's feature type, which words the clause
  type?: string
  name: string
  start: number
  end: number
  // mutagen only: the residue replaced and what replaced it
  original?: string
  alts?: string[]
}

interface UniProtFeature {
  type?: string
  description?: string
  location?: { start?: { value?: number }; end?: { value?: number } }
  alternativeSequence?: {
    originalSequence?: string
    alternativeSequences?: string[]
  }
}

const SITE_TYPES = new Set([
  'Active site',
  'Modified residue',
  'Lipidation',
  'Glycosylation',
  'Site',
])

// A mutagenesis note's first sentence, which says what the mutation did;
// the rest is conditions and backgrounds.
function firstSentence(text: string) {
  return (text.split(/\.\s/)[0] ?? text).replace(/\.$/, '')
}

export function parseCuratedSpans(json: { features?: UniProtFeature[] }) {
  return (json.features ?? []).flatMap((f): CuratedSpan[] => {
    const start = f.location?.start?.value
    const end = f.location?.end?.value
    const name = f.description ?? ''
    if (!start || !end || !name || name === 'Disordered') {
      return []
    }
    if (f.type === 'Mutagenesis') {
      const original = f.alternativeSequence?.originalSequence
      const alts = f.alternativeSequence?.alternativeSequences ?? []
      return start === end && original && alts.length
        ? [
            {
              kind: 'mutagen',
              name: spelledOut(firstSentence(name), new Map()),
              start,
              end,
              original,
              alts,
            },
          ]
        : []
    }
    if (SITE_TYPES.has(f.type ?? '')) {
      return [{ kind: 'site', type: f.type, name, start, end }]
    }
    const kind =
      f.type === 'Chain'
        ? 'chain'
        : f.type === 'Region' || f.type === 'Motif'
          ? 'region'
          : undefined
    return kind ? [{ kind, name, start, end }] : []
  })
}

export async function fetchCuratedSpans(uniprotId: string) {
  const res = await fetch(
    `${UNIPROT_REST}/${encodeURIComponent(uniprotId)}.json?fields=ft_chain,ft_region,ft_motif,ft_act_site,ft_mod_res,ft_lipid,ft_carbohyd,ft_site,ft_mutagen`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`UniProt ${res.status} for ${uniprotId}`)
  }
  return parseCuratedSpans(await res.json())
}

// A region wider than this is a mapping of where a partner binds, often a
// third of the protein (TP53's "Interaction with CCAR2" is 1–320), and says
// little about one residue.
const MAX_REGION_SPAN = 100

// The chain a residue is in, when the protein is cut into several and this
// one is not most of it, and the narrowest curated region holding it.
function curatedSpansAt(
  position: number,
  spans: CuratedSpan[],
  length: number,
) {
  const holding = spans.filter(s => s.start <= position && position <= s.end)
  const chains = spans.filter(s => s.kind === 'chain')
  const chain =
    chains.length > 1
      ? holding.find(
          s => s.kind === 'chain' && s.end - s.start + 1 < 0.9 * length,
        )
      : undefined
  const region = holding
    .filter(s => s.kind === 'region' && s.end - s.start < MAX_REGION_SPAN)
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
  // a cleavage site names the bond between two residues
  const sites = holding.filter(s => s.kind === 'site' && s.end - s.start <= 1)
  const mutagens = holding.filter(s => s.kind === 'mutagen')
  return { chain, region, sites, mutagens }
}

function siteText(site: CuratedSpan) {
  return site.type === 'Active site'
    ? `is the active site: ${site.name}`
    : site.type === 'Site'
      ? `is UniProt's site “${site.name}”`
      : `is modified: ${site.name}`
}

// --- conservation at a residue ------------------------------------------------

const PDBE_API = 'https://www.ebi.ac.uk/pdbe/api/v2'

// PDBe-KB's profile of the protein's homologues at one residue, from 3DPatch's
// profile HMM (Jakubec, Vondrášek & Finn 2018): each amino acid's emission
// probability at the column, which reads as its share among homologues.
export interface ResidueConservation {
  profile: { aa: string; p: number }[]
}

export function parseConservation(json: {
  data?: Record<string, number[] | undefined>
}): ResidueConservation {
  const profile = Object.entries(json.data ?? {})
    .filter(([k]) => k.startsWith('probability_'))
    .map(([k, v]) => ({ aa: k.slice('probability_'.length), p: v?.[0] ?? 0 }))
    .sort((a, b) => b.p - a.p)
  return { profile }
}

// Under 1 KB and half a second. A protein PDBe-KB has no profile for is a 404.
export async function fetchConservation(uniprotId: string, position: number) {
  const json = await fetchJsonOr404<Parameters<typeof parseConservation>[0]>(
    `${PDBE_API}/uniprot/sequence_conservation/${encodeURIComponent(uniprotId)}/${position}`,
    'PDBe',
    uniprotId,
  )
  return json && parseConservation(json)
}

// A column whose likeliest residue is under this share is near-uniform: the
// profile has too few homologues there to say anything (Spike 614's top is S
// at 12%).
const MIN_PROFILE_SIGNAL = 0.15
const CONSERVED_SHARE = 0.5
const SHOWN_RESIDUES = 3

// "Conserved across homologues: R 62%, K 9%, Q 4%." The residue's own amino
// acid is added when it is not among the likeliest.
export function conservationText(
  wildType: string | undefined,
  c: ResidueConservation,
) {
  const top = c.profile[0]
  if (!top || top.p < MIN_PROFILE_SIGNAL) {
    return ''
  }
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const shown = c.profile.slice(0, SHOWN_RESIDUES)
  const own = c.profile.find(r => r.aa === wildType)
  const listed = [...shown, ...(own && !shown.includes(own) ? [own] : [])].map(
    r => `${r.aa} ${pct(r.p)}`,
  )
  const share = own?.p ?? 0
  const verdict =
    share >= CONSERVED_SHARE
      ? 'Conserved across homologues'
      : share < 0.2
        ? 'Variable across homologues'
        : 'Across homologues'
  return `${verdict}: ${listed.join(', ')}.`
}
