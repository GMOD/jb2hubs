# Desktop ↔ genomes.jbrowse.org integration

Notes on keeping JBrowse Desktop's "Available genomes" experience in sync with
the growing content on genomes.jbrowse.org (this repo). Written 2026-07-02.

## The worry

The website is accumulating rich, launchable content that isn't a plain genome
list: the pangenome explorer, ortholog search, synteny drill-downs, variable
human loci. Desktop's start-screen "Available genomes" dialog only knows about
genome lists, so every new content type risks being website-only.

## Why it's structural, not cosmetic

Every rich launch on the website goes through `specUrl()` in
`website/src/components/jbrowseLinks.ts`:

```
jbrowse.org/code/jb2/main/?config=<hostedConfig>&session=spec-<json>
```

The `spec-` session is what carries the interesting payload — multiple views, a
`LinearSyntenyView`, inline `sessionTracks` (e.g. the HPRC VCF straight off S3),
and a merged multi-hub config from the merge lambda. Builders that all funnel
through it:

- `specUrl`, `syntenyViewUrl`, `mergeConfig` — `jbrowseLinks.ts`
- `graphBrowserUrl`, `graphVcfLgvUrl`, `referenceLgvUrl` — `pangenomeLinks.ts`
- ortholog result launches — `GenePage.tsx` (formerly `GenePage.tsx`)

The plain genome list is the _only_ launch that uses just a hosted config with
no spec.

On the jbrowse-components side:

- The `spec-` expander, `loadSessionSpec.ts`, lives in
  `products/jbrowse-web/src/` — it is **web-only**. Desktop has no equivalent.
- Desktop's `LaunchCallback`
  (`products/jbrowse-desktop/src/components/StartScreen/types.ts`) is
  `(sel: { shortName, jbrowseConfig }[]) => void` — it can open a hosted config
  URL and nothing else. No views, no `sessionTracks`, no merge.

So desktop cannot launch pangenomes/orthologs/synteny because its launch
primitive only understands "one hosted config," while everything new the website
builds is spec-session-shaped. Desktop is on the wrong side of a web-only fork.
Adding tabs to the dialog would not help until this is fixed.

## What actually fixes it (dependency order)

### 1. Give desktop a spec-session launcher (keystone)

Lift `loadSessionSpec` out of `products/jbrowse-web/src` into a shared location
both products import, and widen `LaunchCallback` from `{ jbrowseConfig }` to the
same `{ config, views, sessionTracks }` spec object that `specUrl` encodes.
Desktop expands the spec into a local session instead of opening a URL.

Nothing else below works without this. Once done, desktop can launch anything
the website can express as a spec — present and future.

### 2. Make the spec builders a shared package, not website-private

`specUrl`, `syntenyViewUrl`, `graphBrowserUrl`, `mergeConfig` currently live
inside this repo "so the encoding lives once" — but that's once _per website_.
Move them to a shared lib so desktop consumes the identical **spec object** and
simply skips the URL-encoding/`window.open` step, handing the object to its
local session.

This is what stops future features from silently bypassing desktop: a new page
and desktop both build from the same builder, so they can't drift.

### 3. Publish the content indexes desktop can't see

The website already generates content indexes that only Astro pages consume:

- `generatePangenomeData.ts`, `generatePangenomeMsa.ts`,
  `generatePangenomePangene.ts`
- `generateSyntenyPairIndex.ts`, `generateSyntenyAccessions.ts`
- `generateOrthologIndex.ts`
- `generateRecentlyUpdated.ts` → `recentlyUpdated.json`
- `generateSearchIndex.ts` → `public/searchIndex.json`

Desktop's start screen only knows `categories.json` (a list of _genome lists_,
built by `genark2jbrowse/src/generateCategoriesJson.ts`). Generalize that
manifest: alongside genome categories, enumerate pangenome datasets, synteny
pairs, and variable loci as launchable resources. The dialog then becomes a
**content catalog** rather than a genome list, and adding a website content type
= adding an index entry, not a desktop code change.

### 4. Orthologs needs an explicit decision

Orthologs is not a static list — `GenePage.tsx` is a live query against the NCBI
Datasets API filtered to hosted genomes. Desktop can't ship an Astro page. Two
honest options:

- **Replicate the behavior**: desktop calls the same NCBI API plus a published
  ortholog index, and builds the result launch via the shared spec builder (#2).
  Clean, but duplicates the search UI.
- **Embed the web search** in a desktop webview and let it hand results back
  through the spec launcher (#1).

Leaning toward publishing the ortholog index and reusing the builder, but this
is the one that warrants a real call.

## Smaller, independent wins (no spec work needed)

These improve integration today without the keystone above:

- **Surface data the list JSON already carries.** `processedHubJson/*.json`
  entries include `igvBrowserLink`, `ncbiBrowserLink`, `ucscBrowserLink`,
  `ucscDataLink`, `pairedAccession`, `ncbiGff`, `jbrowseLink` — desktop's
  `getColumnDefinitions.tsx` / `GenomeNameCell.tsx` use only `jbrowseConfig`.
  Add these as name-cell menu items with zero new network calls.
- **Taxon thumbnails.** The site's signature visual is the species image, but
  processed list entries have no `imageUrl` (images live per-accession in
  `image.json`). Fold the thumbnail URL into the processed entries, then add a
  thumbnail column to the desktop table.
- **In-app "More info".** Today desktop's per-row "More info" is a
  `window.open('https://genomes.jbrowse.org/accession/<acc>/')`. An in-app
  detail panel fed by the accession JSON (stats/BUSCO/synteny/paired) is
  tighter.

## Cross-repo drift note

`useGenomesData.ts` in desktop carries a `taxId`→`taxonId` shim with a comment
"can be dropped once jb2hubs redeployed." The desktop `Entry` type and the emit
shape here are two independent copies. A shared published type (or a JSON schema
this repo validates its output against) would kill this class of bug and is a
prerequisite for the manifest generalization in #3.
