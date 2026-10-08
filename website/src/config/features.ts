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
  synteny: true,
  // The /gene hub's ortholog species table (NCBI-backed; /orthologs until
  // 2026-09-01, which now redirects there). Live in production.
  orthologs: true,
  // The /gene hub's conserved-gene-order section: tree-ordered ortholog
  // neighborhood showing microsynteny across species (/conserved-gene-order
  // until 2026-09-01, which now redirects). Gates a section, not a page.
  multiSynteny: true,
  // The /protein-browser view: gene -> ortholog domain-architecture cartoon,
  // connected JBrowse session (collapsed-intron genome + AlphaFold 3D), and an
  // on-demand cross-species alignment (EBI Clustal Omega) overlaid with CDD
  // domains — all synthesized live.
  proteinBrowser: true,
  // The /pangenomes/* section: one page per graph, drawable at any gene or
  // region. Every graph launch loads the graphgenomeviewer plugin, which boots
  // on `main`, the build `JBROWSE_BASE` targets, and error-pages v4.3.0.
  pangenome: true,
  // The conserved-gene-order section's launch into the reference's multi-way
  // synteny star. Waits on core v5: only config-staging.json carries the star,
  // since a display type a released host lacks is fatal once the track opens.
  multiwayStar: staging,
  // Desktop launches: "Open in Desktop 5" beside the synteny launch, and the
  // gene-order figure's opt-in switch. The jbrowse:// handler landed after
  // v4.2.1, so an older install does nothing when one is clicked, which is why
  // the label names the version and the switch is off by default.
  desktopLinks: true,
}
