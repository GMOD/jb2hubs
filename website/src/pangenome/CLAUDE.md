# Pangenome pages

Read `agent-docs/reference/PANGENOME_PAGES.md` before adding to a page: the loci
table and the embedded jbrowse-web were taken out on purpose. The data side is
`PANGENOME_PORTAL.md` beside it.

- **Run `pnpm check-pangenome-launches` after touching `pangenome*` or a graph
  config.** It boots every launch and reads the lanes back, and no CI job does.
- **Import the GPL `@jbrowse/bandage-core` only from
  `pangenomeGraphLayout.worker.ts`**, which only `PangenomeGraph.tsx` starts,
  and keep it out of `hubtools`.
- **Cite a paper that states each known allele's claim**, and read its span and
  carriers off the sidecar.
- **Carry a visible change to the pangenome tutorials** in jbrowse-components
  (`website/docs/tutorials/pangenome_*.md`).
