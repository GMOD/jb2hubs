import ExternalLink from './ExternalLink.tsx'
import Modal from './Modal.tsx'

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="How the protein browser works"
      onClose={onClose}
    >
      <dl className="ui-help">
        <dt>Gene</dt>
        <dd>
          <ExternalLink href="https://www.ncbi.nlm.nih.gov/datasets/">
            NCBI Datasets
          </ExternalLink>{' '}
          for the GeneID and Swiss-Prot accession; coding exons for every
          isoform from the E-utils <code>gene_table</code>, opening on the MANE
          Select (or RefSeq Select) transcript and its own translation. Any
          other isoform is a pick away on the card.
        </dd>

        <dt>Protein map</dt>
        <dd>
          The query protein end to end with its{' '}
          <ExternalLink href="https://www.ebi.ac.uk/interpro/">
            InterPro
          </ExternalLink>{' '}
          domains, and on request its sites and the residues{' '}
          <ExternalLink href="https://www.ebi.ac.uk/pdbe/pdbe-kb/">
            PDBe-KB
          </ExternalLink>{' '}
          has seen touching each binding partner in any PDB entry. Click any of
          them and the session opens on it, or type a residue into the
          card&rsquo;s Opens on box; a partner opens the complex the two were
          seen in rather than the monomer. Coordinates are on the UniProt
          canonical sequence, and the card says when the launched isoform makes
          them approximate.
        </dd>

        <dt>Alignment</dt>
        <dd>
          Offered by the question rather than the database. A focused domain
          offers its{' '}
          <ExternalLink href="https://www.ebi.ac.uk/interpro/entry/pfam/">
            Pfam
          </ExternalLink>{' '}
          family&rsquo;s <em>seed</em> alignment — the curated few dozen
          representatives the family was built from, spanning its whole reach,
          the domain alone — with the query&rsquo;s own domain segment aligned
          in as the linked row, so a residue in the seed still maps to its
          codon. Otherwise the session carries this protein&rsquo;s orthologs:
          the hosted 100-vertebrate alignment for a human gene with a row in it,
          else its{' '}
          <ExternalLink href="https://www.uniprot.org/help/uniref">
            UniRef50
          </ExternalLink>{' '}
          cluster, aligned inside JBrowse when the session opens.
        </dd>

        <dt>Genome</dt>
        <dd>
          JBrowse has no <code>collapseIntrons</code>; the exon ranges go in as
          a space-separated <code>loc</code>, so the coding exons render back to
          back.
        </dd>

        <dt>Structure</dt>
        <dd>
          The{' '}
          <ExternalLink href="https://alphafold.ebi.ac.uk">
            AlphaFold
          </ExternalLink>{' '}
          model whose sequence matches the transcript, asked of
          AlphaFold&rsquo;s API rather than assumed; or an experimental entry
          from the{' '}
          <ExternalLink href="https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/">
            3D-Beacons
          </ExternalLink>{' '}
          list, best coverage first. The 3D view aligns the structure&rsquo;s
          residues to the transcript&rsquo;s translation, so a structure of
          another isoform or a truncated crystal still lands on the right
          codons.
        </dd>
      </dl>
    </Modal>
  )
}
