import Modal from './Modal.tsx'

import type { ReactNode } from 'react'

// Explains what the ortholog search actually does — the question the reference
// species field keeps raising.
export default function OrthologHelpDialog({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <Modal
      title="How this search works"
      onClose={onClose}
    >
      <p>
        A gene symbol on its own is ambiguous — dozens of species have a gene
        called <em>BRCA1</em>. The reference species picks which one you mean:
        we resolve the symbol there to an NCBI GeneID, ask{' '}
        <Link href="https://www.ncbi.nlm.nih.gov/datasets/">NCBI Datasets</Link>{' '}
        for its orthologs, and keep the ones whose genome we host.
      </p>
      <dl className="ui-help">
        <dt>Reference species</dt>
        <dd>
          Any species name or NCBI taxon id — the suggestions are just model
          organisms. A numeric GeneID in the gene box (e.g. <code>672</code>)
          skips this, since the id already names one gene in one organism.
        </dd>

        <dt>Limit to</dt>
        <dd>
          Asks NCBI for that clade only — a smaller, faster answer than every
          species, not a filter applied afterwards.
        </dd>

        <dt>Coverage</dt>
        <dd>
          NCBI computes orthologs for eukaryotes only, so a bacterial or
          archaeal gene returns nothing whatever the reference.
        </dd>

        <dt>Result links</dt>
        <dd>
          <strong>JBrowse</strong> opens that assembly at the ortholog with the
          RefSeq gene track showing. <strong>Synteny</strong> appears only where
          we host a whole-genome alignment to the reference, and opens both
          genomes side by side.
        </dd>

        <dt>Reading the table</dt>
        <dd>
          Grouped by clade in NCBI&rsquo;s taxonomy, the reference&rsquo;s own
          clade first; model organisms lead each group. &ldquo;N of M&rdquo; is
          how many of NCBI&rsquo;s orthologs we have a genome for.
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
