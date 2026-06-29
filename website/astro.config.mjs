import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://genomes.jbrowse.org',
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
