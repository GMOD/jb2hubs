import ExternalLink from './ExternalLink.tsx'
import Modal from './Modal.tsx'

// Explains /gene's preview or /orthologs' full table, whichever page opened it.
export default function OrthologHelpDialog({
  page,
  onClose,
}: {
  page: 'gene' | 'orthologs'
  onClose: () => void
}) {
  return (
    <Modal
      title="How this page works"
      onClose={onClose}
    >
      <p>
        The reference species picks which gene a symbol means. We resolve it
        there to an NCBI GeneID, ask{' '}
        <ExternalLink href="https://www.ncbi.nlm.nih.gov/datasets/">
          NCBI Datasets
        </ExternalLink>{' '}
        for its orthologs, and keep the ones whose genome we host.
      </p>
      <dl className="ui-help">
        <dt>Reference species</dt>
        <dd>
          Any species name or NCBI taxon id. A numeric GeneID in the gene box
          (e.g. <code>672</code>) skips it.
        </dd>

        {page === 'gene' ? (
          <>
            <dt>Orthologs</dt>
            <dd>
              A few rows, model organisms first. &ldquo;All N species&rdquo;
              opens the full list.
            </dd>
          </>
        ) : (
          <>
            <dt>Clades</dt>
            <dd>
              Rows group by NCBI&rsquo;s taxonomy, the reference&rsquo;s own
              clade first and open. Tick rows to open several genomes together.
            </dd>

            <dt>Limit to</dt>
            <dd>
              Asks NCBI for that clade only, a smaller and faster answer than
              every species.
            </dd>

            <dt>Span</dt>
            <dd>
              The gene&rsquo;s length on its genome. A &times; badge marks one
              more than three times longer or shorter than the
              reference&rsquo;s.
            </dd>
          </>
        )}

        <dt>Links</dt>
        <dd>
          <strong>JBrowse</strong> opens the assembly at the ortholog.{' '}
          <strong>Synteny</strong>, where we host an alignment to the reference,
          opens both genomes side by side. <strong>Protein</strong> opens the
          protein browser.
        </dd>

        <dt>Coverage</dt>
        <dd>NCBI computes orthologs for eukaryotes only.</dd>
      </dl>
    </Modal>
  )
}
