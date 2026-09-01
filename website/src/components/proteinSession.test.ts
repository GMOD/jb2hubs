import assert from 'node:assert'
import { test } from 'node:test'

import { buildSessionUrl } from './proteinSession.ts'

import type { GeneStructure } from './geneStructure.ts'

const transcript = {
  refName: 'NC_000077.7',
  strand: 1 as const,
  name: 'NM_000001.1',
  geneName: 'Test',
  cds: [
    { start: 100, end: 200, phase: 0 },
    { start: 1000, end: 1080, phase: 1 },
  ],
}

// A stand-in for a resolved hosted config: names the gene track the session
// should open, and renames NCBI's accession to what that config calls the
// sequence — the rename buildSessionUrl has to apply everywhere at once.
const target = {
  configUrl: '/hubs/genark/GCF/000/001/635/GCF_000001635.27/config.json',
  assemblyName: 'GCF_000001635.27',
  geneTrackId: 'GCF_000001635.27-ncbiRefSeqSelect',
  variantTrackIds: ['GCF_000001635.27-clinvarMain'],
  canonicalRefName: (refName: string) =>
    refName === 'NC_000077.7' ? 'chr11' : refName,
}

const structure: GeneStructure = {
  symbol: 'Test',
  geneId: '1',
  taxId: 10090,
  assemblyAccession: 'GCF_000001635.27',
  target,
  uniprotId: 'P02340',
  proteinSequence: 'MEEP',
  transcript,
  isoforms: [{ transcript, protein: 'NP_000001.1', aaLength: 60 }],
  alphafold: [],
}

const alphafold = {
  url: 'https://alphafold.ebi.ac.uk/files/AF-P02340-F1-model_v6.cif',
}

interface SessionView {
  id: string
  type: string
  init?: { assembly?: string; loc?: string; tracks?: string[] }
  connectedFeature?: { refName: string }
  structures?: {
    url?: string
    pdbId?: string
    connectedViewId?: string
    userProvidedTranscriptSequence?: string
    feature?: { refName: string }
    initialSelection?: { start: number; end: number }
  }[]
}

function viewsOf(session: object) {
  return (session as unknown as { views: SessionView[] }).views
}

test('buildSessionUrl: opens the target config with its gene and variant tracks', () => {
  const { session, url } = buildSessionUrl({ structure, primary: alphafold })
  assert.match(
    url,
    /#config=%2Fhubs%2Fgenark%2FGCF%2F000%2F001%2F635%2FGCF_000001635\.27%2Fconfig\.json/,
  )
  assert.match(url, /session=encoded-/)
  const views = viewsOf(session)
  const lgv = views[0]!
  const protein = views.find(v => v.type === 'ProteinView')!
  assert.equal(lgv.type, 'LinearGenomeView')
  assert.equal(lgv.init?.assembly, 'GCF_000001635.27')
  // without the gene track the collapsed exons render over an empty view
  assert.deepEqual(lgv.init?.tracks, [
    'GCF_000001635.27-ncbiRefSeqSelect',
    'GCF_000001635.27-clinvarMain',
  ])
  // structure links back to the genome view, with the transcript's translation
  assert.equal(protein.structures?.[0]?.connectedViewId, lgv.id)
  assert.equal(protein.structures?.[0]?.url, alphafold.url)
  assert.equal(protein.structures?.[0]?.userProvidedTranscriptSequence, 'MEEP')
})

test('buildSessionUrl: variant tracks can be left out', () => {
  const { session } = buildSessionUrl({ structure, variantTracks: false })
  assert.deepEqual(viewsOf(session)[0]!.init?.tracks, [
    'GCF_000001635.27-ncbiRefSeqSelect',
  ])
})

// Displayed-region matching is exact and does not alias-resolve, so the loc and
// the connectedFeature must BOTH carry the config's own name for the sequence.
// One of the two left on NCBI's accession is the silent-no-highlight failure.
test('buildSessionUrl: renames the sequence everywhere the session names it', () => {
  const views = viewsOf(
    buildSessionUrl({ structure, primary: alphafold }).session,
  )
  const lgv = views[0]!
  const protein = views.find(v => v.type === 'ProteinView')!
  assert.equal(lgv.init?.loc, 'chr11:61-240 chr11:961-1120')
  assert.equal(protein.structures?.[0]?.feature?.refName, 'chr11')
})

test('buildSessionUrl: no structure source, or no translation, means no 3D view', () => {
  assert.equal(
    viewsOf(buildSessionUrl({ structure }).session).some(
      v => v.type === 'ProteinView',
    ),
    false,
  )
  assert.equal(
    viewsOf(
      buildSessionUrl({
        structure: { ...structure, proteinSequence: undefined },
        primary: alphafold,
      }).session,
    ).some(v => v.type === 'ProteinView'),
    false,
  )
})

test('buildSessionUrl: a PDB entry is named by id, superposed models by url, a domain by residues', () => {
  const { session } = buildSessionUrl({
    structure,
    primary: { pdbId: '1tup' },
    superposed: [{ url: 'https://example.org/AF-P04637-F1.cif' }],
    initialSelection: { start: 93, end: 292 },
  })
  const protein = viewsOf(session).find(v => v.type === 'ProteinView')!
  assert.equal(protein.structures?.length, 2)
  assert.equal(protein.structures?.[0]?.pdbId, '1tup')
  assert.equal(protein.structures?.[0]?.url, undefined)
  assert.deepEqual(protein.structures?.[0]?.initialSelection, {
    start: 93,
    end: 292,
  })
  // the superposed model is a plain structure: no feature, nothing connected
  assert.deepEqual(protein.structures?.[1], {
    url: 'https://example.org/AF-P04637-F1.cif',
  })
})

// The session-level `init: {direction, children}` layout stopped being read when
// the workspace became an MST tree; a session still emitting it stacks its views
// in one column instead of tiling them.
test('buildSessionUrl: emits the workspace layout tree, not the dropped init', () => {
  const { session } = buildSessionUrl({ structure, primary: alphafold })
  const s = session as unknown as {
    init?: unknown
    useWorkspaces?: boolean
    layout?: {
      direction: string
      children: { size: number; tabs: { viewIds: string[] }[] }[]
    }
  }
  assert.equal(s.init, undefined)
  assert.equal(s.useWorkspaces, true)
  assert.equal(s.layout?.direction, 'row')
  assert.deepEqual(
    s.layout?.children.map(c => c.tabs[0]!.viewIds),
    [['lgv-Test'], ['protein-Test']],
  )
  assert.deepEqual(
    s.layout?.children.map(c => c.size),
    [58, 42],
  )
})

test('buildSessionUrl: an indexed alignment is named, not carried', () => {
  const { session } = buildSessionUrl({
    structure,
    msa: {
      kind: 'indexed',
      msa: {
        msaUri: 'https://example.org/100way.fa.gz',
        treeUri: 'https://example.org/100way.nh',
        msaName: 'Test',
        querySeqName: 'hg38',
      },
    },
  })
  const msa = viewsOf(session).find(v => v.type === 'MsaView') as unknown as {
    init?: { msaIndexedLocation?: { uri: string }; msaName?: string }
    data?: unknown
  }
  assert.equal(
    msa.init?.msaIndexedLocation?.uri,
    'https://example.org/100way.fa.gz',
  )
  assert.equal(msa.init?.msaName, 'Test')
  // the alignment stays out of the URL, which is what keeps it small
  assert.equal(msa.data, undefined)
})

test('buildSessionUrl: an inline alignment rides in the session with its domains', () => {
  const { session } = buildSessionUrl({
    structure,
    msa: {
      kind: 'inline',
      msa: {
        fasta: '>mouse\nMEEP',
        newick: '(mouse);',
        gff: '##gff-version 3',
        querySeqName: 'mouse',
      },
    },
  })
  const msa = viewsOf(session).find(v => v.type === 'MsaView') as unknown as {
    data?: { msa: string; tree: string; gff?: string }
    init?: unknown
  }
  assert.equal(msa.data?.msa, '>mouse\nMEEP')
  assert.equal(msa.data?.gff, '##gff-version 3')
  assert.equal(msa.init, undefined)
})
