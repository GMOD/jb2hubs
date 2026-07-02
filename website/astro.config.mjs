import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://genomes.jbrowse.org',
  // Astro's default HTML minifier strips whitespace-only text nodes between
  // elements, so `<strong>a</strong>\n<strong>b</strong>` renders as "ab" and
  // authoring needs ugly {' '} spacers. Turning it off keeps normal HTML
  // whitespace (the browser collapses runs to one space); the size cost is
  // negligible for a static docs site.
  compressHTML: false,
  integrations: [
    react({
      // React Compiler auto-memoizes components, so manual useMemo/useCallback
      // are unnecessary; it bails out per-component on any Rules-of-React
      // violation rather than failing the build.
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
    sitemap(),
  ],
})
