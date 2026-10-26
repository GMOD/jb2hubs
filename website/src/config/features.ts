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
  // The /pangenomes/* section: one page per graph, drawable at any gene or
  // region. Every graph launch loads the graphgenomeviewer plugin, which boots
  // on `main`, the build `JBROWSE_BASE` targets, and error-pages v4.3.0.
  pangenome: true,
}
