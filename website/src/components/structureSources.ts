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
// The experimental side — which PDBe entries cover the accession — is
// p2s_mapper's `fetchExperimentalStructures`, and so is the SIFTS residue
// mapping the plugin needs for one.

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

// Every model AlphaFold DB has for an accession. A 404 is the API's own way of
// saying it has never folded the accession; a failure to answer throws, so a
// caller that remembers answers can tell the two apart.
export async function requestAlphaFoldModels(
  uniprotId: string,
): Promise<AlphaFoldModel[]> {
  const res = await fetch(
    `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(uniprotId)}`,
  )
  if (res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw new Error(`AlphaFold DB ${res.status} for ${uniprotId}`)
  }
  return parseAlphaFoldModels(await res.json())
}

// Best-effort: an unreachable API reads as "no model", which costs the
// structure and nothing else.
export function fetchAlphaFoldModels(uniprotId: string) {
  return requestAlphaFoldModels(uniprotId).catch((): AlphaFoldModel[] => [])
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
