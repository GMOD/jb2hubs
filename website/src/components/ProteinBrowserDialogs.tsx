import ExternalLink from './ExternalLink.tsx'
import Modal from './Modal.tsx'
import { MAX_ALIGN_ROWS, MAX_PANEL_ROWS } from './proteinMsa.ts'

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
          <ExternalLink href="https://www.ncbi.nlm.nih.gov/datasets/">
            NCBI Datasets
          </ExternalLink>{' '}
          for the GeneID and Swiss-Prot accession; coding exons for every
          isoform from the E-utils <code>gene_table</code>, opening on the MANE
          Select (or RefSeq Select) transcript and its own translation. Any
          other isoform is a pick away on the card.
        </dd>

        <dt>Orthologs</dt>
        <dd>
          Up to {MAX_PANEL_ROWS} species, one representative protein each (MANE
          Select, else longest) with its NCBI CDD domains — that is the cartoon.
          Model organisms come first, then outward through NCBI&rsquo;s ortholog
          report. Fly, worm, yeast and plant reference genes go to{' '}
          <ExternalLink href="https://pantherdb.org">PANTHER</ExternalLink>,
          which NCBI&rsquo;s ortholog sets do not cover.
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
          codon. For conservation of this protein across its orthologs:{' '}
          <ExternalLink href="https://www.ebi.ac.uk/jdispatcher/msa/clustalo">
            EBI Clustal Omega
          </ExternalLink>{' '}
          over the panel with the CDD domains overlaid, or the hosted
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
          codons. Mark other species in the cartoon and their AlphaFold models
          are superposed on the query&rsquo;s (TM-align, in the plugin).
        </dd>
      </dl>
    </Modal>
  )
}
