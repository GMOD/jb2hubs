import { useState } from 'react'

import { fetchProteinStl } from '../lib/proteinStl.ts'
import Modal from './Modal.tsx'
import { collapsedLoc } from './geneStructure.ts'
import { MAX_ALIGN_ROWS, MAX_PANEL_ROWS } from './proteinMsa.ts'

import type { Transcript } from './geneStructure.ts'
import type { ReactNode } from 'react'

// Copy text and say so inline. A rejected write (insecure context, denied
// permission) reports the failure rather than a false confirmation.
function useCopy() {
  const [message, setMessage] = useState<string>()
  const copy = (text: string, ok: string) => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setMessage(ok)
      },
      () => {
        setMessage('Copy failed — clipboard access was blocked')
      },
    )
  }
  return { copy, message }
}

// Save generated STL bytes via a throwaway object URL. The revoke waits a tick:
// Firefox starts the download asynchronously and drops it if the URL is already
// gone.
function triggerDownload(bytes: Uint8Array<ArrayBuffer>, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'model/stl' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

export function SessionDetailsDialog({
  onClose,
  transcript,
  session,
  collapse,
  flip,
  uniprotId,
}: {
  onClose: () => void
  transcript: Transcript
  session: object
  collapse: boolean
  flip: boolean
  uniprotId: string | undefined
}) {
  const { copy, message } = useCopy()
  const [stlBusy, setStlBusy] = useState(false)
  const [stlError, setStlError] = useState<string>()
  const loc = collapsedLoc(transcript, { collapse, flip })
  const sessionJson = JSON.stringify(session, null, 2)

  function downloadStl(accession: string) {
    setStlBusy(true)
    setStlError(undefined)
    fetchProteinStl(accession)
      .then(bytes => {
        triggerDownload(bytes, `${transcript.geneName}-${accession}.stl`)
      })
      .catch((e: unknown) => {
        setStlError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        setStlBusy(false)
      })
  }

  return (
    <Modal
      title="Session details"
      onClose={onClose}
    >
      <p>The locstring that collapses the introns:</p>
      <pre className="msv-code">{loc}</pre>

      <div className="msv-dialog-actions">
        <button
          className="ui-btn-secondary"
          onClick={() => {
            copy(window.location.href, 'Page link copied')
          }}
        >
          Copy page link
        </button>
        <button
          className="ui-btn-secondary"
          onClick={() => {
            copy(sessionJson, 'Session JSON copied')
          }}
        >
          Copy session JSON
        </button>
        {uniprotId && (
          <button
            className="ui-btn-secondary"
            disabled={stlBusy}
            title="A solid tube swept along the protein backbone, ready to slice"
            onClick={() => {
              downloadStl(uniprotId)
            }}
          >
            {stlBusy ? 'Preparing STL…' : '3D print (STL)'}
          </button>
        )}
      </div>
      {message && <p className="ui-hint">{message}</p>}
      {stlError && (
        <p className="ui-error">Couldn&rsquo;t build STL: {stlError}</p>
      )}

      <pre className="msv-code msv-code-scroll">{sessionJson}</pre>
    </Modal>
  )
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="How the protein browser works"
      onClose={onClose}
    >
      <p>
        The example genes ship with their ortholog panel and alignment already
        built. Any other gene resolves live, from the same sources:
      </p>
      <dl className="ui-help">
        <dt>Gene</dt>
        <dd>
          <Link href="https://www.ncbi.nlm.nih.gov/datasets/">
            NCBI Datasets
          </Link>{' '}
          for the GeneID and Swiss-Prot accession; coding exons from the E-utils{' '}
          <code>gene_table</code>, picking the isoform that matches the UniProt
          canonical protein.
        </dd>

        <dt>Orthologs</dt>
        <dd>
          Up to {MAX_PANEL_ROWS} species, one representative protein each (MANE
          Select, else longest) with its NCBI CDD domains — that is the cartoon.
          Model organisms come first, then outward through NCBI&rsquo;s ortholog
          report. Fly, worm, yeast and plant reference genes go to{' '}
          <Link href="https://pantherdb.org">PANTHER</Link>, which NCBI&rsquo;s
          ortholog sets do not cover.
        </dd>

        <dt>Alignment</dt>
        <dd>
          <Link href="https://www.ebi.ac.uk/jdispatcher/msa/clustalo">
            EBI Clustal Omega
          </Link>{' '}
          with a guide tree and the CDD domains overlaid, or the hosted
          100-vertebrate alignment — instant, but no domains. Clustal Omega gets
          the first {MAX_ALIGN_ROWS} rows rather than all {MAX_PANEL_ROWS}: on a
          long protein the whole panel takes minutes, and residue alignments get
          harder to read as they get broader, which the cartoon does not.
        </dd>

        <dt>Genome</dt>
        <dd>
          JBrowse has no <code>collapseIntrons</code>; the exon ranges go in as
          a space-separated <code>loc</code>, so the coding exons render back to
          back.
        </dd>

        <dt>Structure</dt>
        <dd>
          The <Link href="https://alphafold.ebi.ac.uk">AlphaFold</Link> model by
          UniProt accession. All three views share one transcript model, so
          hovering a residue lights up its codon everywhere.
        </dd>
      </dl>
    </Modal>
  )
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  )
}
