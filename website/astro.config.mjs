import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

// Pages that only forward elsewhere, so they never belong in the sitemap:
// stubs kept for old links, and /ucsc/launch/, which turns a UCSC hgTracks
// query into a JBrowse launch.
const REDIRECT_STUBS = [
  '/orthologs/',
  '/conserved-gene-order/',
  '/ucsc/launch/',
]

// https://astro.build/config
export default defineConfig({
  site: 'https://genomes.jbrowse.org',
  // Astro's default HTML minifier strips whitespace-only text nodes between
  // elements, so `<strong>a</strong>\n<strong>b</strong>` renders as "ab" and
  // authoring needs ugly {' '} spacers. Turning it off keeps normal HTML
  // whitespace (the browser collapses runs to one space); the size cost is
  // negligible for a static docs site.
  compressHTML: false,
  build: {
    // Astro's default ('auto') inlines any stylesheet under 4kB into every page
    // that uses it. This site has 129k pages sharing one shell, so a 6.7kB
    // inline <style> -- which is what 'auto' produced, over its own threshold,
    // beside a <link> to _astro/*.css that was already there -- costs 0.87GB of
    // dist and is re-downloaded per page instead of being cached once.
    inlineStylesheets: 'never',
  },
  integrations: [
    react({
      // Oxc's React Compiler (oxc-transform-react) auto-memoizes components,
      // so manual useMemo/useCallback are unnecessary; it bails out
      // per-component on any Rules-of-React violation rather than failing the
      // build.
      compiler: true,
    }),
    sitemap({
      filter: page => !REDIRECT_STUBS.includes(new URL(page).pathname),
    }),
  ],
})
