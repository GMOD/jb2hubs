import { Suspense, lazy, useState, useSyncExternalStore } from 'react'

import { errorText } from './ErrorMessage.tsx'
import {
  HUNDRED_WAY_MSA,
  HUNDRED_WAY_TREE,
  fetchHundredWayAlignment,
  fetchHundredWayTranscript,
} from './hundredWay.ts'
import {
  fetchPfamSeed,
  fetchPfamTree,
  placeQuery,
  queryLabel,
  rowResidueColumns,
} from './pfamSeed.ts'
import { alignProteinPanel } from './proteinMsa.ts'

import type { GeneStructure } from './geneStructure.ts'
import type { Focus, ProteinRegion } from './proteinFeatures.ts'
import type { ProteinAlignment, ProteinPanel } from './proteinMsa.ts'
import type { MsaHighlight, MsaSource } from './proteinSession.ts'

// react-msaview pulls in @jbrowse/core + MUI + mobx and renders to canvas, so it
// only runs client-side; lazy-loading keeps it off the first paint and out of
// the cartoon/genome path until there is an alignment to draw.
const MSAViewer = lazy(() =>
  import('react-msaview').then(m => ({ default: m.MSAViewer })),
)

// Which alignment the page shows and the session carries. The first three are
// alignments this page holds; the last two are requests the msaview plugin
// resolves when the session opens, so the page has nothing to draw for them.
//
// They answer different questions, and the page offers them by question rather
// than by database: `pfam` is what a domain looks like across life (the
// family's curated seed, a few dozen representatives), `hundredWay` and `live`
// are how conserved each residue of THIS protein is across species (orthologs),
// `uniref` is the protein's own cluster, `phmmer` is a search.
export type AlignSource = 'pfam' | 'live' | 'hundredWay' | 'uniref' | 'phmmer'

export interface LoadedAlignment {
  // what the launched session carries
  source: MsaSource
  // what the embedded viewer renders: for the indexed source this is the block
  // read out of the hosted file, which the session names rather than carries.
  // Absent for a source built on open.
  fasta?: string
  rowCount?: number
  // what the launch card says the session opens with
  carries: string
  // for the 100-way, the knownCanonical model the alignment was built from —
  // swapped into the session so genome, alignment and structure share codons;
  // for the seed, the translation the query row was cut from, pinned
  structureOverrides?: Pick<GeneStructure, 'proteinSequence' | 'transcript'>
  // a caveat about the alignment itself, shown beside it
  note?: string
}

// How far either side of a domain's InterPro coordinates the local alignment
// looks for it in the translation. The coordinates are on the canonical
// sequence and the translation may be another isoform; forty residues absorbs
// the usual exon's worth of drift, and a miss is reported, not guessed.
const SEED_WINDOW = 40

// What the msaview plugin's snapshot will carry: its data model drops any field
// over 50,000 characters, silently, and the alignment is one field.
const SEED_FASTA_BUDGET = 45_000

// The Pfam seed of the domain a focus sits in, with the launched translation's
// own domain segment placed in it as the linked row. Three reads, no job: the
// seed and its tree in parallel, then milliseconds of alignment here.
export async function loadPfam(
  structure: GeneStructure,
  domain: ProteinRegion,
  focus: Focus | undefined,
): Promise<LoadedAlignment> {
  const { proteinSequence, symbol, uniprotId } = structure
  if (!proteinSequence || !domain.pfam) {
    throw new Error('No translation to place in the seed alignment')
  }
  const [seed, tree] = await Promise.all([
    fetchPfamSeed(domain.pfam),
    fetchPfamTree(domain.pfam),
  ])
  const placed = placeQuery(proteinSequence, seed, {
    queryName: queryLabel(symbol),
    uniprotId,
    window: {
      start: domain.start - 1 - SEED_WINDOW,
      end: domain.end + SEED_WINDOW,
    },
    newick: tree,
    maxChars: SEED_FASTA_BUDGET,
  })
  // A focused residue inside the segment is marked on the query row, in the
  // row's own coordinates.
  const highlights: MsaHighlight[] =
    focus?.kind === 'residue' &&
    focus.position >= placed.domain.start &&
    focus.position <= placed.domain.end
      ? [
          {
            row: placed.queryName,
            start: focus.position - placed.domain.start + 1,
            end: focus.position - placed.domain.start + 1,
            label: focus.label ?? `residue ${focus.position}`,
          },
        ]
      : []
  const rowCount = placed.kept + 1
  const family = `${domain.pfam} ${seed.id ?? domain.name}`
  const anchorNote = placed.replaced
    ? `${symbol} is itself a seed member (${placed.anchor.name}); its row is the linked one.`
    : `${symbol} residues ${placed.domain.start}–${placed.domain.end} placed through ${placed.anchor.name} at ${Math.round(placed.anchor.identity * 100)}% identity.`
  const thinNote =
    placed.kept < placed.total
      ? ` ${placed.kept} of the seed's ${placed.total} rows, those nearest ${symbol}, fit in a launch; the tree is left out with the rest.`
      : ''
  return {
    source: {
      kind: 'inline',
      msa: {
        fasta: placed.fasta,
        newick: placed.newick,
        querySeqName: placed.queryName,
        residueRange: placed.domain,
        highlights,
      },
    },
    fasta: placed.fasta,
    rowCount,
    carries: `the ${family} seed alignment (${rowCount} rows)`,
    structureOverrides: {
      proteinSequence,
      transcript: structure.transcript,
    },
    note: anchorNote + thinNote,
  }
}

// The hosted 100-way for one gene: the alignment block, and the transcript it
// was built from so the session's connectedFeature shares its codon ordinals.
// The aligned hg38 row is the knownCanonical translation, so it is the protein
// whose residues the alignment's columns count.
export async function loadHundredWay(symbol: string): Promise<LoadedAlignment> {
  const [msa, transcript] = await Promise.all([
    fetchHundredWayAlignment(symbol),
    fetchHundredWayTranscript(symbol),
  ])
  if (!msa || !transcript) {
    throw new Error(`No 100-way alignment row for ${symbol}`)
  }
  return {
    source: {
      kind: 'indexed',
      msa: {
        msaUri: HUNDRED_WAY_MSA,
        treeUri: HUNDRED_WAY_TREE,
        msaName: symbol,
        querySeqName: msa.querySeqName,
      },
    },
    fasta: msa.fasta,
    rowCount: msa.rowCount,
    carries: `a ${msa.rowCount}-row alignment`,
    structureOverrides: { proteinSequence: msa.querySequence, transcript },
  }
}

// The live panel aligned at EBI, with the CDD domains as a per-row overlay.
// The signal is what stops the EBI polling when the reader has moved on to
// another gene — the job can otherwise run to its three-minute deadline.
export async function loadLive(
  panel: ProteinPanel,
  precomputed: ProteinAlignment | undefined,
  onProgress: (s: string) => void,
  signal: AbortSignal,
): Promise<LoadedAlignment> {
  const aligned =
    precomputed ?? (await alignProteinPanel(panel, { onProgress, signal }))
  const queryRow =
    panel.rows.find(r => r.taxId === panel.query.refTaxonId) ?? panel.rows[0]!
  const rowCount = (aligned.fasta.match(/^>/gm) ?? []).length
  return {
    source: {
      kind: 'inline',
      msa: {
        fasta: aligned.fasta,
        newick: aligned.newick,
        gff: aligned.gff,
        querySeqName: queryRow.label,
      },
    },
    fasta: aligned.fasta,
    rowCount,
    carries: `a ${rowCount}-row alignment`,
  }
}

// Rows the built sources ask for. UniRef is a lookup, so a hundred rows cost
// only the in-browser alignment; phmmer's count is what EBI reports back.
const BUILT_ROWS = 100

// A request the msaview plugin resolves on open, so the page has nothing to
// fetch: the query's UniRef50 cluster across UniProtKB aligned in the browser
// (no job anywhere), or a phmmer search at EBI whose queue decides the wait.
// Both are given the gene's UniProt accession first and its symbol second, so
// the lookup goes by accession where the gene has one.
export function loadBuilt(
  source: 'uniref' | 'phmmer',
  structure: GeneStructure,
): LoadedAlignment {
  const candidates = [
    ...(structure.uniprotId ? [structure.uniprotId] : []),
    structure.symbol,
  ]
  return source === 'uniref'
    ? {
        source: {
          kind: 'built',
          msa: {
            orthologParams: {
              taxId: structure.taxId,
              geneCandidates: candidates,
              source: 'uniref',
              msaAlgorithm: 'browser',
              maxSpecies: BUILT_ROWS,
            },
          },
        },
        carries: 'the UniRef cluster, aligned on open',
      }
    : {
        source: {
          kind: 'built',
          msa: {
            blastParams: {
              searchProgram: 'phmmer',
              blastDatabase: 'rp15',
              maxHits: BUILT_ROWS,
            },
          },
        },
        carries: 'a phmmer search across the tree of life, run on open',
      }
}

// What each source is, for the reader choosing one: the question it answers,
// then what it costs.
interface SourceContext {
  panelRows: number
  precomputed: boolean
  family?: ProteinRegion
}

const SOURCE_LABELS: Record<
  AlignSource,
  {
    title: (ctx: SourceContext) => string
    note: (ctx: SourceContext) => string
  }
> = {
  pfam: {
    title: ({ family }) => `${family?.name ?? 'Domain'} family`,
    note: ({ family }) =>
      `the ${family?.pfam ?? 'Pfam'} seed: curated representatives across life, the domain alone; three reads, no job`,
  },
  hundredWay: {
    title: () => '100 vertebrates',
    note: () => 'orthologs, whole protein; instant, no domains',
  },
  live: {
    title: ({ panelRows }) => `${panelRows} species`,
    note: ({ precomputed }) =>
      `orthologs with their domains${precomputed ? ', precomputed' : ', built at EBI'}`,
  },
  uniref: {
    title: () => 'UniRef cluster',
    note: () =>
      'all of UniProtKB within 50% identity; built in JBrowse on open, no job',
  },
  phmmer: {
    title: () => 'phmmer search',
    note: () =>
      'remote homologs across the tree of life; an EBI job on open, minutes',
  },
}

// The alignment, folded away under the launch card. `open` is controlled
// because the viewer may only mount once the disclosure is: react-msaview sizes
// its canvas from the container it first mounts into, and a closed <details> is
// display: none.
export default function ProteinAlignmentSection({
  gene,
  alignment,
  error,
  aligning,
  status,
  source,
  sources,
  onSource,
  panelRows,
  precomputed,
  family,
  wantLive,
  onBuildLive,
  onRetry,
}: {
  gene: string
  alignment: LoadedAlignment | undefined
  error: unknown
  aligning: boolean
  status: string
  source: AlignSource
  // every source this gene can offer, in the order to list them
  sources: AlignSource[]
  onSource: (s: AlignSource) => void
  // rows the live job would align, which is fewer than the panel draws: the
  // cartoon takes every species the source has, and the alignment takes the
  // first MAX_ALIGN_ROWS of the panel's model-organism-first order
  panelRows: number
  precomputed: boolean
  // the domain whose Pfam seed the `pfam` source opens, when there is one
  family?: ProteinRegion
  wantLive: boolean
  onBuildLive: () => void
  // re-runs the failed fetch: the SWR key does not change on a retry
  onRetry: () => void
}) {
  const [open, setOpen] = useState(false)
  const ctx = { panelRows, precomputed, family }
  // Offering to build only means something on the live arm, and only while it
  // has not already been asked for: `wantLive` is not in the SWR key, so a
  // second click refetches nothing. After a failure the retry beside the error
  // is what re-runs it, on either arm.
  const canBuild = source === 'live' && panelRows > 0 && !wantLive
  return (
    <details
      className="ui-disclosure"
      open={open}
      onToggle={e => {
        setOpen(e.currentTarget.open)
      }}
    >
      <summary>
        Residue alignment{' '}
        <span className="ui-caption">
          {alignment?.rowCount
            ? `${SOURCE_LABELS[source].title(ctx)} · ${alignment.rowCount} rows`
            : SOURCE_LABELS[source].title(ctx)}
        </span>
      </summary>

      {sources.length > 1 && (
        <AlignmentSourceChoice
          source={source}
          sources={sources}
          ctx={ctx}
          onChange={onSource}
        />
      )}
      {alignment?.note && <p className="ui-caption">{alignment.note}</p>}
      {!aligning && error ? (
        <p className="ui-error">
          {errorText(error)}{' '}
          <button
            className="ui-linkbtn"
            onClick={() => {
              onRetry()
            }}
          >
            Try again
          </button>
        </p>
      ) : null}

      {open && alignment?.fasta ? (
        <AlignmentPanel
          alignment={alignment}
          fasta={alignment.fasta}
          gene={gene}
        />
      ) : alignment?.source.kind === 'built' ? (
        <p className="ui-hint">
          This alignment is built inside JBrowse when the session opens, from
          the launched transcript's own translation, so there is nothing to show
          here yet.{' '}
          {'orthologParams' in alignment.source.msa
            ? 'The UniRef lookup and the alignment take a few seconds and run in the browser.'
            : 'phmmer runs at EBI, and the wait is its queue: seconds on a good day, many minutes on a bad one.'}
        </p>
      ) : aligning ? (
        <p className="ui-hint">{status || 'Aligning…'}</p>
      ) : alignment || !canBuild ? null : (
        <div className="msv-advanced">
          <button
            className="ui-btn-secondary"
            onClick={() => {
              onBuildLive()
            }}
          >
            Build cross-species alignment
          </button>
          <span className="ui-caption">
            {precomputed
              ? 'precomputed'
              : `EBI Clustal Omega on ${panelRows} proteins`}
          </span>
        </div>
      )}
    </details>
  )
}

// The embedded viewer. An alignment is the one thing on this page that cannot
// live inside the article's measure — it is a hundred rows of a wide matrix, and
// at 60rem you read a sliver of it — so inline it breaks out to the window width
// (see .msv-align in the page styles), and Expand hands it the whole viewport.
//
// MSAViewer builds its MST model once, from the props it first mounts with, so
// changing the height means a new instance: `key` makes the remount deliberate.
// Both alignments are already strings in memory, so nothing is re-fetched.
function AlignmentPanel({
  alignment,
  fasta,
  gene,
}: {
  alignment: LoadedAlignment
  fasta: string
  gene: string
}) {
  const [expanded, setExpanded] = useState(false)
  const height = useViewportHeight(expanded)
  const { source } = alignment

  const viewer = (
    <Suspense fallback={<p className="ui-hint">Loading alignment viewer…</p>}>
      <MSAViewer
        key={expanded ? 'expanded' : 'inline'}
        msa={fasta}
        {...(source.kind === 'inline'
          ? {
              ...(source.msa.newick ? { tree: source.msa.newick } : {}),
              ...(source.msa.gff ? { gff: source.msa.gff } : {}),
              // the embedded viewer (react-msaview 6.2) marks columns, not a
              // row's residues; the session's MsaView takes the highlights
              ...(source.msa.highlights?.length
                ? {
                    highlightColumns: source.msa.highlights.flatMap(h =>
                      h.row
                        ? rowResidueColumns(fasta, h.row, h.start, h.end)
                        : [],
                    ),
                  }
                : {}),
            }
          : source.kind === 'indexed'
            ? {
                treeFilehandle: {
                  uri: source.msa.treeUri,
                  locationType: 'UriLocation',
                },
              }
            : {})}
        colorScheme="clustalx_protein_dynamic"
        treeAreaWidth={200}
        height={height}
      />
    </Suspense>
  )

  const toolbar = (
    <div className="msv-align-bar">
      <span className="msv-align-title">
        {gene} · {alignment.rowCount} rows
      </span>
      <button
        className="ui-btn-secondary"
        onClick={() => {
          setExpanded(!expanded)
        }}
      >
        {expanded ? 'Close' : 'Expand ⤢'}
      </button>
    </div>
  )

  return expanded ? (
    <dialog
      className="msv-align-dialog"
      ref={el => {
        // showModal() throws if the dialog is already open, which a StrictMode
        // ref re-attach would do
        if (el && !el.open) {
          el.showModal()
        }
      }}
      onClose={() => {
        setExpanded(false)
      }}
    >
      {toolbar}
      {viewer}
    </dialog>
  ) : (
    <div className="msv-align">
      {toolbar}
      {viewer}
    </div>
  )
}

// Pixel height for the viewer, which takes a number rather than a CSS length.
// Expanded fills the viewport bar the dialog's own chrome; inline is a fixed
// panel. The window is the external store here, so a rotated phone or a dragged
// window resizes the canvas without an effect.
const INLINE_HEIGHT = 520

function subscribeResize(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
  }
}

function useViewportHeight(expanded: boolean) {
  const viewport = useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 900,
  )
  return expanded ? Math.max(360, viewport - 120) : INLINE_HEIGHT
}

// The choice between the alignment sources, rendered only where there is a
// choice to make. Each option says what it costs and what it gives up.
function AlignmentSourceChoice({
  source,
  sources,
  ctx,
  onChange,
}: {
  source: AlignSource
  sources: AlignSource[]
  ctx: SourceContext
  onChange: (s: AlignSource) => void
}) {
  return (
    <div className="msv-source">
      <span className="msv-source-label">Alignment</span>
      {sources.map(s => (
        <label
          key={s}
          className="msv-source-option"
        >
          <input
            type="radio"
            name="align-source"
            checked={source === s}
            onChange={() => {
              onChange(s)
            }}
          />
          {SOURCE_LABELS[s].title(ctx)}{' '}
          <span className="ui-caption">{SOURCE_LABELS[s].note(ctx)}</span>
        </label>
      ))}
    </div>
  )
}
