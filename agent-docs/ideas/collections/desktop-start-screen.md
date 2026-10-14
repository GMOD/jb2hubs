---
name: desktop-start-screen
description:
  Desktop opens any launch the site builds, but its start screen still lists
  only genomes. A content catalog, the ortholog call, and three small wins.
---

# Desktop's start screen

Every launch on the site can open in JBrowse Desktop 5: `OpenInDesktop.tsx`
wraps the web url in a `jbrowse://` link, and `loadSessionSpec` is now defined
in jbrowse-components' shared `packages/app-core/src/SessionSpec/`. Desktop's
start screen reads only `categories.json` (genome lists, built by
`genark2jbrowse/src/generateCategoriesJson.ts`), so a Desktop user cannot find
that content from it.

## A content catalog

Generalize `categories.json` so it also lists pangenome datasets, synteny pairs
and the variable loci as launchable entries. Adding a content type to the site
then means adding an index entry, with no change to Desktop's code. The indexes
exist already and only Astro pages read them: `generateSyntenyPairIndex.ts`,
`generateOrthologIndex.ts`, `generateRecentlyUpdated.ts`,
`generateSearchIndex.ts`, and the pangenome dataset in `pangenomeDataset.ts`. A
schema the emitter validates against keeps Desktop's `Entry` type and this
repo's output from drifting.

## Orthologs need a call

The ortholog table on `/gene` is a live query against NCBI Datasets, filtered to
hosted genomes, and Desktop cannot ship an Astro page. Either Desktop calls the
same API against a published ortholog index (duplicates the search UI), or it
embeds the web search in a webview and takes the launch back through
`jbrowse://`.

## Small wins

- **Links the list JSON already carries.** `processedHubJson/*.json` entries
  have `igvBrowserLink`, `ncbiBrowserLink`, `ucscBrowserLink`, `ucscDataLink`
  and `pairedAccession`; Desktop's `getColumnDefinitions.tsx` and
  `GenomeNameCell.tsx` read only `jbrowseConfig`. Each link could become a menu
  item with no new requests.
- **Taxon thumbnails.** Processed entries have no image url (each hub stores its
  image in `image.json`). Fold the url in, then add a thumbnail column.
- **In-app "More info".** Desktop's "More info" opens
  `genomes.jbrowse.org/accession/<acc>/`; a panel fed by the accession JSON
  would keep the reader in the app.
