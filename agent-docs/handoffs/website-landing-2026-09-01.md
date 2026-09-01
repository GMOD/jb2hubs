# Landing the staging pages: where things stand after 2026-09-01

Written at the end of a long session that reviewed `website/` end to end, fixed
what the review found, and then reorganized the gene-first pages. Everything
below is on `main` unless it says otherwise. Numbers are measured, not
estimated, and each says where it came from.

## The flags are still `staging`, and that is the one decision left

`synteny`, `multiSynteny`, `proteinBrowser` and `pangenome` all still track
`PUBLIC_STAGING` in `website/src/config/features.ts`. Nothing in this session
flipped one. What changed is that flipping each is now a one-line edit with
nothing structural behind it. Per flag, what a flip needs first:

- **`synteny`** — nothing. The page is 0.94 MB of island props instead of 10.6
  MB, hg38/mm39/hs1 have the gene box, and the launch works on `latest` (a spec
  session; only `colorBy`/`drawCurves`/`autoDiagonalize`/`cigarMode` are dropped
  there, and the page says so on production).
- **`pangenome`** — nothing for the non-graph parts. The hosted graph is now
  behind its own `pangenomeGraph` flag, which stays closed until a released host
  boots the graphgenomeviewer plugin (core v5). PangyPlot is the production
  graph action.
- **`multiSynteny`** — nothing technical (the assembler URL is a constant now,
  compression is configured pending `sam deploy`). But see the page organization
  section: the figure now lives on `/gene`, so this flag gates a _section_, not
  a page.
- **`proteinBrowser`** — regenerate and upload `configs-minimal/hg38.json` and
  `hg19.json` (the `alphamissense` pattern is in `createMinimalConfig.ts`, the
  committed minimal configs predate it), then run
  `pnpm check-protein-launches --host latest` over the full example set. TP53
  and SOD1 pass on `latest` as of this session; the other six were not run.

## Two things outside `website/` need a human to start them

- **The PIF corpus regenerates on the next `run.sh`.** `lib/chainpif.sh` runs
  the repo-pinned `@jbrowse/cli` 5.0.0-beta.1 and stamps every PIF and every
  liftOver dir's `.checked` with `jbrowse --version`; a missing or different
  stamp is stale. Every existing file was written by the global 4.2.1, so the
  first run rebuilds 4,064 UCSC PIFs (928 GB, chains cached in
  `/mnt/sdb/cdiesh/chains`) plus 738 GenArk, and `rclone -c` re-sends all of it.
  Measured on hg38ToMm39: 33 s, 141.5 MB against 132.2 MB, 121,175 coarse row
  pairs beside 80,845 fine. It is the intended way the coarse tier reaches the
  files, and it is a run to start on purpose, not stumble into.
- **`sam deploy`** for `aws/ortholog-assembler` (compression, input validation,
  `X-Assembler-Cache`) and `aws/config-merger` (in-memory config cache).

## Leads already chased, so they are not chased again

- **v4.3.0 does not read URL hash parameters.** The protein browser carried its
  session in `#config=…&session=encoded-…` on purpose (a hash never reaches
  CloudFront, whose request-line limit is 8,192 bytes). On `latest` that lands
  on "Select a view to launch" with nothing in the console, which is why the
  dropped workspace layout and the UUID gene labels had never been _seen_ there.
  `HOST_READS_HASH_PARAMS` (`config/jbrowse.ts`) picks `#` or `?`, and a `?`
  launch drops an inline alignment over `QUERY_URL_BUDGET` (8,000 bytes) and
  says so on the card. Measured with the site's own TP53 session: both views
  open on both hosts, structure aligned as an exact match, `useWorkspaces`
  untouched. The eight example genes are 0.9–6.0 KB without an alignment (DMD
  largest).
- **A `spec-` session is the wrong probe for this page.** The LaunchView
  handlers (what `spec-` goes through) take different keys from the MST snapshot
  the site encodes — the ProteinView spec wants a top-level `url`/`pdbId`, the
  v4.3.0 LGV spec wants top-level `assembly`. Probing with `spec-` reports the
  site's session broken on every host. Use the site's own `encoded-` URL.
- **`minimal.json` cannot feed the config merger.** It carries none of the
  liftOver `SyntenyTrack`s (hg38: 239 in `config.json`, 0 in `minimal.json`),
  and every stacked launch names one. The merger caches full configs instead;
  the safe pruning shape is in `agent-docs/todo/slowness-synteny.md`.
- **The 29 s API Gateway limit against the 120 s Lambda timeout** is a real risk
  for a cold BRCA1/TTN-class neighborhood, not yet measured. CloudWatch
  durations are the instrument; the `README` in the assembler names it.
- **`pnpm check-format` over the whole tree reports ~770 files**, all of them
  `genark2jbrowse/taxon_images/*.json` and other pipeline outputs from a
  concurrent GenArk session. Not website files. Check only the files you
  touched.

## What the review found, in the order it mattered

The full ranked list is the artifact from the session; the shape of it:

- **Production had three problems worse than any staging page.** `/taxonomy/1`
  was 77 MB of server-rendered HTML with 151 pages over 1 MB (now 415 KB under a
  500-node budget); `DataTable` downloaded the 4.2 MB bacteria file for a
  one-species page that already had its row; the 7.5 MB search index could
  download twice because the page and the header used separate caches.
- **The tree did not build.** `unavailableTracks.astro` imports two symlinks
  `make.sh` deletes mid-run. Tolerated now.
- **CI lint was red for three runs** on a ShellCheck warning in
  `ucsc2jbrowse/make.sh`, which meant the plugin-url gate had not run.
- **Each staging page had one load-bearing fix** (synteny's catalog size and
  taxon ids; the gene-order assembler URL living only in `.env.staging`; the
  pangenome graph having no gate of its own; the protein browser's host
  contract) and a tail of UX and race fixes. All landed.

## Page organization: what landed

The question was whether `/orthologs` and `/conserved-gene-order` should be one
page. They should, and the reasoning is in `GENE_PAGE_CONSOLIDATION.md` (read
its 2026-08-27 amendment: a hub, not an absorber). The shape now on `main`:

- **`/gene?gene=<symbol>&ref=<taxid>`** is the hub (`pages/gene.astro`,
  `components/GenePage.tsx`, helpers in `geneHub.ts`): one form, an identity
  header from fields the ortholog search already fetched, the ortholog species
  table, the conserved-gene-order figure (rendered only under
  `features.multiSynteny`), and launch cards into the protein browser and the
  synteny browser, each gated on its own flag. The gene is resolved once and
  shared. `scope=`, `anchors=` and `flank=` carry over from the old pages.
- **`/orthologs` and `/conserved-gene-order` are redirect stubs** that keep the
  query string (`location.replace('/gene' + location.search)`, with a meta
  refresh to `/gene` as the fallback and a canonical of `/gene`). Every
  published deep link keeps working because all three pages always spoke
  `?gene=&ref=`.
- **`/synteny` and `/protein-browser` stay pages.** Synteny takes two
  assemblies, not a gene; the protein browser is a workflow with a minutes-long
  EBI job in it. Both are reached from the gene page with the gene already
  resolved.
- **`/pangenomes` is one landing page** with `#hprc` and `#mouse` sections and
  `/pangenomes/explorer?dataset=hprc`; `/pangenomes/hprc` and
  `/pangenomes/mouse` are redirect stubs to the anchors. There is one dataset
  with loci (`PANGENOME_DATASETS`), and the explorer says so rather than
  inventing mouse loci.
- **The nav** is Search, Genes, then Synteny, Protein browser and Pangenomes as
  their flags open. `Header.astro`'s dropdown is gone (earlier in the session),
  so this is five plain links at most.
- **The sitemap** excludes the four redirect stubs unconditionally
  (`REDIRECT_STUBS` in `astro.config.mjs`) and the staging-only prefixes on
  production.

What `GENE_PAGE_CONSOLIDATION.md` proposed and is still open: extending the
assembler to serve identity and the ortholog table (today the table is still
three browser-direct NCBI calls per visitor while the figure is Lambda-served),
prerendering `/gene/<symbol>` for human protein-coding genes, and moving the
100-way alignment data out of `jbrowse.org/demos/`.

## If you pick this up

- Flip `synteny` and `pangenome` first; nothing depends on them.
- Deploy the two Lambdas, regenerate the minimal configs, then run the full
  protein example set on `latest` and flip `proteinBrowser`.
- Flip `multiSynteny` whenever the figure is wanted on production; it is a
  section of a live page now.
- Start the PIF regeneration as its own run and watch the upload.
- Everything from this session is committed. The only uncommitted files in the
  tree at handoff were another session's GenArk pipeline outputs.
