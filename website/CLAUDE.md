# website

- **`.astro` frontmatter is not typechecked**: put type-sensitive code in a
  `.ts`/`.tsx` module the page imports (`agent-docs/reference/TOOLCHAIN.md`).
- **Launch hosted jbrowse-web instead of rendering a `@jbrowse` component on a
  page.** `@jbrowse/core` is a devDependency for the jexl tests, and rendering
  it brings back the MUI and mobx version split TOOLCHAIN.md records.
- **Point `JBROWSE_BASE` (`src/config/jbrowse.ts`) at a release only after
  `pnpm check-pangenome-launches --host latest` passes**: the graph plugin boots
  only on `main` and error-pages every released host.
