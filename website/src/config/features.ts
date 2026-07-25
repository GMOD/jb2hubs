// Build-time feature flags. Staging builds run `astro build --mode staging`,
// which loads `.env.staging` (PUBLIC_STAGING=true), so in-progress features can
// ship to staging.genomes.jbrowse.org without appearing on production
// (genomes.jbrowse.org). Production builds leave PUBLIC_STAGING unset.
// Astro types `import.meta.env` as always present, but it only exists under Vite —
// the node test runner imports these modules directly, where it is undefined, so
// every test that transitively pulls in a feature flag would crash on it.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const staging = import.meta.env?.PUBLIC_STAGING === 'true'

export const features = {
  // Exposed so non-feature build differences (e.g. which hosted JBrowse build
  // launch links target — see config/jbrowse.ts) can key off the same signal.
  staging,
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
