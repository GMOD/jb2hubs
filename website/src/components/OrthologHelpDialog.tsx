import ExternalLink from './ExternalLink.tsx'
import Modal from './Modal.tsx'

// Explains the gene page: the ortholog search and the gene-order figure.
export default function OrthologHelpDialog({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <Modal
      title="How this page works"
      onClose={onClose}
    >
      <p>
        A gene symbol on its own is ambiguous — dozens of species have a gene
        called <em>BRCA1</em>. The reference species picks which one you mean:
        we resolve the symbol there to an NCBI GeneID, ask{' '}
        <ExternalLink href="https://www.ncbi.nlm.nih.gov/datasets/">
          NCBI Datasets
        </ExternalLink>{' '}
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
          <strong>JBrowse</strong> opens that assembly around the ortholog,
          highlighted, with the RefSeq gene track showing.{' '}
          <strong>Synteny</strong> appears only where we host a whole-genome
          alignment to the reference, and opens both genomes side by side.{' '}
          <strong>Protein</strong> opens the ortholog in the protein browser.
        </dd>

        <dt>Span</dt>
        <dd>
          The gene&rsquo;s length on its genome. A &times; badge marks one more
          than three times longer or shorter than the reference&rsquo;s: an
          expanded intron, a fragmented annotation, or a different gene model.
        </dd>

        <dt>Reading the table</dt>
        <dd>
          Grouped by clade in NCBI&rsquo;s taxonomy, the reference&rsquo;s own
          clade first; model organisms lead each group. &ldquo;N of M&rdquo; is
          how many of NCBI&rsquo;s orthologs we have a genome for.
        </dd>

        <dt>Conserved gene order</dt>
        <dd>
          Each row is a species, ordered by NCBI&rsquo;s taxonomy with the tree
          at left. Each colour is one gene, and ribbons join the same gene in
          adjacent rows, so a crossing is a local rearrangement. &#8644; marks a
          row drawn mirrored because its locus runs opposite the reference; (+n)
          counts neighbours elsewhere in that genome, not drawn.
        </dd>
        <dd>
          The figure starts with the reference&rsquo;s closest relatives, the
          model organisms and a sample of farther clades. It draws either scaled
          in bp or with genes in order, whichever you choose. Hover a gene to
          trace it, click a gene to open it in JBrowse, or click a branch point
          to open that clade as a stacked synteny view.
        </dd>
      </dl>
    </Modal>
  )
}
