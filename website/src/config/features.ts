// Build-time feature flags. Staging builds run `astro build --mode staging`,
// which loads `.env.staging` (PUBLIC_STAGING=true), so in-progress features can
// ship to staging.genomes.jbrowse.org without appearing on production
// (genomes.jbrowse.org). Production builds leave PUBLIC_STAGING unset.
const staging = import.meta.env.PUBLIC_STAGING === 'true'

export const features = {
  // The /synteny comparison browser, including its cross-species ortholog gene
  // picker (which is additionally gated on ortholog data being present).
  synteny: staging,
  // The /orthologs gene-first search page (NCBI-backed). Live in production.
  orthologs: true,
  // The /conserved-gene-order view: tree-ordered ortholog neighborhood showing
  // conserved gene order (microsynteny) across species.
  multiSynteny: staging,
  // The /protein-alignment view: ortholog protein MSA (EBI Clustal Omega) with
  // NCBI CDD conserved-domain overlay, rendered in react-msaview.
  proteinMsa: staging,
  // The /protein-browser view ("proteins in the genome browser"): gene ->
  // connected JBrowse session (collapsed-intron genome + AlphaFold 3D + on-demand
  // ortholog alignment), all synthesized live.
  proteinBrowser: staging,
  // The /pangenome HPRC pangenome explorer (curated divergence loci + JBrowse /
  // react-msaview launches).
  pangenome: staging,
}
