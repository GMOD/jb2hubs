// Build-time feature flags. Staging builds run `astro build --mode staging`,
// which loads `.env.staging` (PUBLIC_STAGING=true), so in-progress features can
// ship to staging.genomes.jbrowse.org without appearing on production
// (genomes.jbrowse.org). Production builds leave PUBLIC_STAGING unset.
// Astro types `import.meta.env` as always present, but it only exists under Vite —
// the node test runner imports these modules directly, where it is undefined, so
// every test that transitively pulls in a feature flag would crash on it. Hence
// the widened return type: it says what is actually true at runtime, and going
// through a function keeps that from being narrowed straight back away.
function importMetaEnv(): ImportMetaEnv | undefined {
  return import.meta.env
}

const staging = importMetaEnv()?.PUBLIC_STAGING === 'true'

export const features = {
  // Exposed so non-feature build differences (e.g. which hosted JBrowse build
  // launch links target — see config/jbrowse.ts) can key off the same signal.
  staging,
  // The /synteny comparison browser, including its cross-species ortholog gene
  // picker (which is additionally gated on ortholog data being present).
  synteny: staging,
  // The /gene hub's ortholog species table (NCBI-backed; /orthologs until
  // 2026-09-01, which now redirects there). Live in production.
  orthologs: true,
  // The /gene hub's conserved-gene-order section: tree-ordered ortholog
  // neighborhood showing microsynteny across species (/conserved-gene-order
  // until 2026-09-01, which now redirects). Gates a section, not a page.
  multiSynteny: staging,
  // The /protein-browser view: gene -> ortholog domain-architecture cartoon,
  // connected JBrowse session (collapsed-intron genome + AlphaFold 3D), and an
  // on-demand cross-species alignment (EBI Clustal Omega) overlaid with CDD
  // domains — all synthesized live.
  proteinBrowser: staging,
  // The /pangenomes/* section: the HPRC portal, the mouse strain listing and
  // the explorer (curated divergence loci + JBrowse / react-msaview launches).
  // Everything on those pages runs on the released `latest` except the graph
  // launches, which have their own flag below.
  pangenome: staging,
  // The in-browser GraphGenomeView launches on /pangenomes/*. Waits on core v5:
  // the graphgenomeviewer plugin error-pages every released host (`latest` is
  // v4.3.0), so the dataset declares no `graphBrowser` on production and the
  // pages fall back to the external PangyPlot link. Independent of `pangenome`
  // so the section can go live without the graph.
  pangenomeGraph: staging,
  // "Open in Desktop" beside a launch link. Staged until JBrowse Desktop 5.0
  // ships: the jbrowse:// handler landed after v4.2.1, so on every install in
  // the wild today the link silently does nothing.
  desktopLinks: staging,
}
