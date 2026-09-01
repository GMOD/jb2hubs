import fs from 'node:fs'

import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

// This file is loaded by node before Astro applies --mode, so import.meta.env
// (what src/config/features.ts reads) is not available here. Read the same
// .env.<mode> file Astro will, keyed on the --mode the CLI was given, so the
// flag has one source: PUBLIC_STAGING in .env.staging.
const modeFlag = process.argv.indexOf('--mode')
const mode = modeFlag === -1 ? 'production' : process.argv[modeFlag + 1]
const envFile = new URL(`./.env.${mode}`, import.meta.url)
const staging =
  fs.existsSync(envFile) &&
  /^PUBLIC_STAGING=true$/m.test(fs.readFileSync(envFile, 'utf-8'))

// Routes whose page redirects home unless the matching flag in
// src/config/features.ts is on. Every one of those flags is `staging` today;
// a flag promoted to production has to come off this list at the same time,
// or its pages stay out of the sitemap while being live.
const STAGING_ONLY = [
  '/conserved-gene-order/',
  '/protein-browser/',
  '/pangenomes/',
  '/synteny/',
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
  integrations: [
    react({
      // React Compiler auto-memoizes components, so manual useMemo/useCallback
      // are unnecessary; it bails out per-component on any Rules-of-React
      // violation rather than failing the build.
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
    sitemap({
      filter: page =>
        staging ||
        !STAGING_ONLY.some(prefix => new URL(page).pathname.startsWith(prefix)),
    }),
  ],
})
