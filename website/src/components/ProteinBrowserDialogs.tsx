import { useState } from 'react'

import { fetchProteinStl } from '../lib/proteinStl.ts'
import { collapsedLoc } from './geneStructure.ts'

import type { Transcript } from './geneStructure.ts'
import type { ReactNode } from 'react'

// Native <dialog> so Escape, the backdrop and focus trapping come from the
// platform; the callback ref opens it on mount, since the element only exists
// while the caller renders it.
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <dialog
      className="msv-dialog"
      ref={el => {
        // showModal() throws if the dialog is already open, which a StrictMode
        // ref re-attach would do.
        if (el && !el.open) {
          el.showModal()
        }
      }}
      onClose={() => {
        onClose()
      }}
    >
      <h2>{title}</h2>
      {children}
      <form method="dialog">
        <button className="msv-advanced-btn">Close</button>
      </form>
    </dialog>
  )
}

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
      <p>
        The locstring below is what collapses the introns: one region per merged
        coding exon, so the exons render back to back.
      </p>
      <pre className="msv-code">{loc}</pre>

      <div className="msv-dialog-actions">
        <button
          className="msv-advanced-btn"
          onClick={() => {
            copy(window.location.href, 'Page link copied')
          }}
        >
          Copy page link
        </button>
        <button
          className="msv-advanced-btn"
          onClick={() => {
            copy(sessionJson, 'Session JSON copied')
          }}
        >
          Copy session JSON
        </button>
        {uniprotId && (
          <button
            className="msv-advanced-btn"
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
      {message && <p className="msv-hint">{message}</p>}
      {stlError && <p className="msv-error">Couldn&rsquo;t build STL: {stlError}</p>}

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
        Nothing is precomputed per gene — everything below is synthesized in your
        browser from public data the moment you ask for it.
      </p>

      <h3>Finding the gene</h3>
      <p>
        The symbol and reference organism go to{' '}
        <a
          href="https://www.ncbi.nlm.nih.gov/datasets/"
          target="_blank"
          rel="noreferrer"
        >
          NCBI Datasets
        </a>
        , which returns the GeneID, the assemblies the gene is placed on and its
        Swiss-Prot accession. The coding exon structure is parsed out of the
        E-utils <code>gene_table</code> flat file, preferring a curated RefSeq
        transcript and, among those, the isoform whose length matches the UniProt
        canonical protein — so the 3D structure lines up with the exons.
      </p>

      <h3>The orthologs</h3>
      <p>
        One ortholog per species, with a representative protein each (MANE Select
        where flagged, else the longest isoform), plus the NCBI CDD conserved
        domains for every one. That is the domain cartoon, and it needs no
        alignment, so it appears in seconds.
      </p>
      <p>
        NCBI&rsquo;s ortholog sets cover vertebrates and insects. For a fly,
        worm, yeast or plant reference gene they return nothing usable, so those
        go to{' '}
        <a
          href="https://pantherdb.org"
          target="_blank"
          rel="noreferrer"
        >
          PANTHER
        </a>{' '}
        instead, whose 144 reference proteomes span every species offered here.
      </p>

      <h3>The alignment</h3>
      <p>
        Residue-level alignment comes from{' '}
        <a
          href="https://www.ebi.ac.uk/jdispatcher/msa/clustalo"
          target="_blank"
          rel="noreferrer"
        >
          EBI Clustal Omega
        </a>{' '}
        with a guide tree, overlaid with the same CDD domains. Human genes can
        instead use the hosted <strong>100-vertebrate</strong> alignment, which
        is one indexed read rather than an alignment job — far more species,
        instantly, but no domain overlay.
      </p>

      <h3>The collapsed genome view</h3>
      <p>
        There is no <code>collapseIntrons</code> option in JBrowse. The trick is
        to hand the Linear Genome View a <code>loc</code> made of the exon
        ranges, space-separated, so each renders back-to-back and the introns
        disappear. Alignment and structure stay in step because all three views
        share one transcript model, so a residue maps to its codon and back —
        hover or select in any view and the others light up.
      </p>

      <h3>The structure</h3>
      <p>
        The{' '}
        <a
          href="https://alphafold.ebi.ac.uk"
          target="_blank"
          rel="noreferrer"
        >
          AlphaFold
        </a>{' '}
        model is fetched by UniProt accession, and the session connects it to the
        genome view through the same transcript. Session details also builds a
        3D-printable STL of the backbone in the browser.
      </p>
    </Modal>
  )
}
