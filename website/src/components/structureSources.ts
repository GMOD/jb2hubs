// Which 3D structures exist for a protein, asked rather than assumed.
//
// AlphaFold DB's file names look derivable — AF-<accession>-F1-model_v6.cif —
// and for most proteins they are. But the model version moves (v4 already
// 404s), and a protein past AlphaFold's length cap has no F1 at all: human
// dystrophin (P11532, 3,685 aa) exists only as fourteen isoform models, so a url
// built from the accession 404s while the page says "the AlphaFold structure".
// The prediction API answers with what is actually there, per model: url,
// version, sequence and confidence.
//
// 3D-Beacons aggregates the experimental side — every PDBe entry mapped to the
// accession, with the UniProt range it covers and its resolution — in one
// CORS-enabled call, which is what lets the page offer a crystal structure
// beside the prediction without a PDB search of its own. The protein3d plugin
// takes the entry id and fetches the SIFTS residue mapping itself.

export interface AlphaFoldModel {
  entity: string // AF-P04637-F1
  accession: string // uniprot accession, with an isoform suffix on isoform models
  url: string // mmCIF
  pdbUrl: string
  version: number
  plddt: number // mean per-residue confidence, 0-100
  paeImageUrl: string
  sequence: string
}

interface PredictionEntry {
  modelEntityId?: string
  uniprotAccession?: string
  cifUrl?: string
  pdbUrl?: string
  latestVersion?: number
  globalMetricValue?: number
  paeImageUrl?: string
  sequence?: string
}

export function parseAlphaFoldModels(json: unknown): AlphaFoldModel[] {
  const entries = Array.isArray(json) ? (json as PredictionEntry[]) : []
  return entries.flatMap(e =>
    e.modelEntityId && e.uniprotAccession && e.cifUrl && e.sequence
      ? [
          {
            entity: e.modelEntityId,
            accession: e.uniprotAccession,
            url: e.cifUrl,
            pdbUrl: e.pdbUrl ?? e.cifUrl.replace(/\.cif$/, '.pdb'),
            version: e.latestVersion ?? 0,
            plddt: e.globalMetricValue ?? 0,
            paeImageUrl: e.paeImageUrl ?? '',
            sequence: e.sequence,
          },
        ]
      : [],
  )
}

// Every model AlphaFold DB has for an accession. Best-effort: an unreachable
// API reads as "no model", which costs the structure and nothing else. A 404
// is the API's own way of saying so for an accession it has never folded.
export async function fetchAlphaFoldModels(
  uniprotId: string,
): Promise<AlphaFoldModel[]> {
  const res = await fetch(
    `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(uniprotId)}`,
  ).catch(() => undefined)
  return res?.ok ? parseAlphaFoldModels(await res.json()) : []
}

// The model to open for a transcript: the one folded from exactly this
// translation if there is one (an identity mapping, every residue lands), else
// the canonical entry, else the longest isoform model. A canonical entry is the
// one whose accession carries no isoform suffix.
export function pickAlphaFoldModel(
  models: AlphaFoldModel[],
  proteinSequence?: string,
) {
  const exact = proteinSequence
    ? models.find(m => m.sequence === proteinSequence)
    : undefined
  return (
    exact ??
    models.find(m => !m.accession.includes('-')) ??
    [...models].sort((a, b) => b.sequence.length - a.sequence.length)[0]
  )
}

export interface ExperimentalStructure {
  pdbId: string
  method: string
  resolution?: number
  // 1-based inclusive UniProt residues the entry covers
  start: number
  end: number
  coverage: number // fraction of the UniProt sequence
}

interface BeaconsSummary {
  structures?: {
    summary?: {
      model_identifier?: string
      model_category?: string
      provider?: string
      experimental_method?: string | null
      resolution?: number | null
      uniprot_start?: number
      uniprot_end?: number
      coverage?: number
    }
  }[]
}

// PDBe entries only, best-covering first and sharpest within a tie. Predicted
// entries (AlphaFold, SWISS-MODEL, AlphaFill) are left out because the
// prediction the page opens comes from AlphaFold's own API above; and 3D-Beacons
// files SASBDB's small-angle-scattering fits under "experimentally determined"
// too, with numeric ids and near-full coverage — dystrophin's best "structure"
// by coverage was SASBDB 436 — which are not entries the plugin can map.
export function parseExperimentalStructures(
  json: unknown,
): ExperimentalStructure[] {
  const entries = (json as BeaconsSummary | null)?.structures ?? []
  return entries
    .flatMap(({ summary: s }) =>
      s?.model_identifier &&
      s.provider === 'PDBe' &&
      s.model_category === 'EXPERIMENTALLY DETERMINED' &&
      s.uniprot_start !== undefined &&
      s.uniprot_end !== undefined &&
      s.coverage !== undefined
        ? [
            {
              pdbId: s.model_identifier.toLowerCase(),
              method: s.experimental_method ?? 'experimental',
              resolution: s.resolution ?? undefined,
              start: s.uniprot_start,
              end: s.uniprot_end,
              coverage: s.coverage,
            },
          ]
        : [],
    )
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        (a.resolution ?? Infinity) - (b.resolution ?? Infinity),
    )
}

export async function fetchExperimentalStructures(
  uniprotId: string,
): Promise<ExperimentalStructure[]> {
  const res = await fetch(
    `https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/api/uniprot/summary/${encodeURIComponent(uniprotId)}.json?provider=pdbe`,
  ).catch(() => undefined)
  return res?.ok ? parseExperimentalStructures(await res.json()) : []
}
