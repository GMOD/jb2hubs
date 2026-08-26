// Explains what the ortholog search actually does — the question the reference
// species field keeps raising. Native <dialog> so Escape, the backdrop and focus
// trapping come from the platform; the callback ref opens it on mount, since the
// element only exists while `open` is true.
export default function OrthologHelpDialog({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <dialog
      className="orthologs-dialog"
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
      <h2>How this search works</h2>

      <p>
        A gene symbol on its own is ambiguous — dozens of species have a gene
        called <em>BRCA1</em>. The <strong>reference species</strong> picks
        which one you mean: we look the symbol up in that organism to get an
        NCBI GeneID, ask{' '}
        <a
          href="https://www.ncbi.nlm.nih.gov/datasets/"
          target="_blank"
          rel="noreferrer"
        >
          NCBI Datasets
        </a>{' '}
        for that gene&rsquo;s orthologs, then keep the ones whose genome we
        host.
      </p>

      <h3>Reference species</h3>
      <p>
        Any species name or NCBI taxon id works — the suggestions are just
        common model organisms. Entering a numeric <strong>NCBI GeneID</strong>{' '}
        in the gene box (e.g. <code>672</code>) skips this step, since the id
        already identifies one gene in one organism; the reference then follows
        the gene rather than whatever the box says.
      </p>

      <h3>Limit to</h3>
      <p>
        A well-studied gene has hundreds of orthologs. Picking a clade asks NCBI
        for that clade only, which is a smaller and faster answer than every
        species — not a filter applied afterwards, so the &ldquo;N of M&rdquo;
        count below is counted within it.
      </p>

      <h3>What has orthologs</h3>
      <p>
        NCBI computes orthologs for eukaryotes — vertebrates, insects, plants
        and some fungi. Bacteria and archaea have no ortholog sets there, so a
        bacterial gene returns no matches no matter which reference you choose.
        A eukaryotic gene can also come back empty if NCBI has no ortholog calls
        for it yet.
      </p>

      <h3>The result links</h3>
      <p>
        <strong>JBrowse</strong> opens that assembly at the ortholog&rsquo;s
        coordinates with the NCBI RefSeq gene track showing.{' '}
        <strong>Synteny</strong> appears only when we host a whole-genome
        alignment between that assembly and the reference, and opens both
        genomes side by side around the gene.
      </p>
      <h3>Reading the results</h3>
      <p>
        Rows are grouped by clade — primates, rodents, birds — in NCBI&rsquo;s
        own taxonomy, with the reference&rsquo;s own clade open first and the
        rest one click away. Within a group, model organisms come first and
        everything else is alphabetical. The filter box matches either species
        name, the ortholog&rsquo;s own symbol or the accession, and{' '}
        <strong>With synteny</strong> narrows to the species we host an
        alignment against the reference for. The count reads &ldquo;N of
        M&rdquo; because M is every ortholog NCBI knows and N is how many we
        have a genome for.
      </p>

      <form method="dialog">
        <button>Close</button>
      </form>
    </dialog>
  )
}
