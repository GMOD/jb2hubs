# The synteny surface, reviewed end to end

Written 2026-09-19 from a brainstorm about the ortholog page's language and the
synteny view's density. Nothing here is decided. Each section says what is
actually in the code today, what was measured, and what the change would cost —
several turned out to be the opposite of what the brainstorm assumed, and those
are the valuable ones.

Two repos: this one, and `jbrowse-components` at the paths named. A change in
the second reaches our launches only when v5 publishes, which is the standing
constraint on half of what follows.

## The word "synteny" is doing work it cannot do

Synteny is a conclusion. What we draw is a whole-genome **alignment** — UCSC
chains, converted to PIF — and whether two genes are syntenic is what a reader
decides after looking at it. The gene page is the one place where the gap
matters, because that page is already making claims about orthology, so a
"Synteny" link next to an ortholog row reads as a second claim rather than as a
button that opens a picture.

The fix is not a global rename. `LinearSyntenyView`, `SyntenyTrack` and
`/synteny` are established names with a decade of links behind them, and the
colloquial usage is universal in the field. **Name the artifact, not the
inference**, and only where a reader could mistake one for the other.

The page already knows the right words in its tooltips and not in its labels:

| file:line                                        | says                                                                          | should say                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `OrthologResultsTable.tsx:208`                   | `With synteny ({n})`                                                          | `With alignment ({n})`                                      |
| `OrthologResultsTable.tsx:198` (its own `title`) | "Only the species we host a whole-genome alignment against the reference for" | already right                                               |
| `OrthologResultsTable.tsx:84`                    | `Synteny` (row link)                                                          | `Compare`                                                   |
| `OrthologResultsTable.tsx:82` (its `title`)      | "Open pairwise synteny: reference vs …"                                       | "Open the reference and … side by side, both centered on …" |
| `GenePage.tsx:548`                               | card title `Synteny`                                                          | `Compare genomes`                                           |
| `MultiSyntenyPicker.tsx:108`                     | `Launch multi-species synteny view`                                           | `Open these genomes side by side`                           |
| `OrthologHelpDialog.tsx:47`                      | "**Synteny** appears only where we host a whole-genome alignment…"            | keep the sentence, retitle the term                         |

`/synteny`, `/synteny/info`, the nav item and `SyntenySelector` are a different
audience — someone who came looking for alignment tracks — and "Synteny browser"
is the name that audience searches for. Leave them.

**`With synteny` is also a lie about mechanism, not only about biology.** It is
plain component state (`OrthologResultsTable.tsx:107`), filters to rows in the
`links` map, and additionally forces every clade group open (`:168-170`). It
touches no URL and changes no launch. A reader who checks it and shares the page
sends someone an unfiltered table. If it is worth a label it is worth
`useUrlState`, like `gene`/`ref`/`scope` beside it.

## Three auto-selections the reader never made

The brainstorm called the multilevel stack arbitrary. It is worse than
arbitrary: there are three independent defaults, and two of them are live before
the reader opens any picker.

- **The suggested species set.** `MultiSyntenyPicker.tsx:61` —
  `const selected = chosen ?? suggested` — so the launch link is armed with
  `suggestedSelection()`'s greedy chain (`multiSyntenyPicker.ts:121`) until a
  checkbox is touched. Cap is `MAX_PICKED_GENOMES = 12`, i.e. a 13-panel stack.
- **The branch-point drill-down.** `DEFAULT_SUBTREE_GENOMES = 7`
  (`multiSyntenyDrilldown.ts:139`). One click on a dot in the gene-order figure
  opens seven genome browsers, seven merged configs and seven rounds of
  hgdownload sidecar fetches. The "Open all N →" escape hatch exists; the escape
  hatch from seven to two does not.
- **The default alignment track** on `/synteny`, `pickDefaultTrack`
  (`lib/syntenyCatalog.ts:76`).

Removing the default outright is the wrong shape, because a page whose primary
button is disabled until you configure it converts worse than one that guesses.
What actually goes wrong here is the **cost asymmetry**: two panels is a cheap,
legible picture; thirteen is a 3 kB URL, thirteen configs and a view no one can
read. So the defensible default is the smallest useful stack — the reference
plus its nearest neighbour — with the chain offered rather than pre-selected.
`planMultiSynteny` already ranks candidates, so "nearest" costs nothing to
compute; `DEFAULT_SUBTREE_GENOMES` becomes 2 or 3 and the dot's tooltip names
what it will open.

That also removes the worst of the URL problem below, for free.

## A shorter launch URL, and what the shortening cannot be

`specUrl` (`jbrowseLinks.ts:15`) is the only encoder:
`?config=<encodeURIComponent(mergeUrl)>&session=spec-<encodeURIComponent(JSON)>`.
Measured shapes: a two-panel row link is ~580 characters, the seven-genome
branch point ~1,750, the 13-panel cap ~2,900–3,100, and `desktopUrl` roughly
doubles whichever one it wraps.

Four things are true about the options, and three of the obvious ones are dead
ends:

- **`session=encoded-` is the only compressed prefix jbrowse-web accepts**
  (`sessionLoaderHelpers.ts:168`, codec `toUrlSafeB64` in
  `packages/core/src/util/sessionSharing.ts:44`). It carries a **whole session
  snapshot**, not a spec — every view, widget and layout — so for a hand-built
  three-key spec it inflates more than deflate saves. There is no compressed
  `spec-`.
- **The share service works but cannot be built against.** `share.jbrowse.org`
  takes an unauthenticated CORS POST, but every call mints a new id and
  password, so a regenerated site orphans its own links. Fine for a "copy link"
  button, useless for generated hrefs.
- **A config-declared `defaultSession` is the shortest possible URL and cannot
  carry a locus** — `extendSession`+`loc` applies only to the first
  `LinearGenomeView` of the default session (`SessionLoader.ts:730`), which a
  `LinearSyntenyView` is not.
- **The config half is the cheap win nobody took.** `?config=` resolves against
  **jbrowse.org**, so a site-relative path costs a handful of characters, while
  the merge API's absolute URL costs 91 encoded characters before any hubIds.
  That is 16% of a two-panel link spent on an API Gateway hostname.

So two things are worth doing and one is worth deciding:

1. **Put the merge endpoint behind a short path on the jbrowse.org bucket** — a
   redirect or a CloudFront behaviour at `/merge?hubIds=…` — and `?config=`
   becomes relative. Costs nothing at the reader's end and shortens every launch
   the site emits.
2. **Shorten our own bar, which is what the brainstorm asked for.** The gene
   page's URL is already short and stateful (`useUrlState`). What is long is the
   thing we hand to jbrowse-web. A `/launch/synteny?g=hg38,mm39&loc=…` route on
   genomes.jbrowse.org that expands to the full spec client-side gives a
   readable, pasteable, _reproducible_ link that survives a regeneration, with
   no service and no upstream change. It is one Astro page plus the builder we
   already have.
3. Upstream, a `spec-` variant that accepts the deflated payload would fix this
   for everyone. Worth proposing; it is a small patch next to
   `SESSION_QUERY_PREFIXES`.

## Gene labels should not differ between rows

They differ because nothing links them. The slot is a single five-way enum,
`showLabels: 'auto' | 'nameAndDescription' | 'name' | 'description' | 'none'`
(`plugins/canvas/src/LinearBasicDisplay/baseConfigSchema.ts:69`, default
`'auto'`), written by `setShowLabels` (`baseModel.ts:1131`) — and it writes a
**config slot**, so two rows showing the same `trackId` would already agree.
Synteny rows are different assemblies and therefore different trackIds, so they
never do.

The sync machinery exists and deliberately does not cover this.
`installLinkedViewSync` replays a whitelist of **view** actions across rows, and
the synteny view subscribes to two of them:

```ts
// plugins/linear-comparative-view/src/LinearSyntenyView/model.ts:1618
installLinkedViewSync(self, ['horizontalScroll', 'zoomTo'])
```

`setShowLabels` is an action on a display several levels below a view, so it is
unreachable by that middleware as written. There is no `applyToAllTracks`, and
`applyDisplaySettings` (`BaseTrackModel.ts:342`) explicitly refuses to
broadcast.

The natural implementation is an autorun beside `comparativeViewWidthAutorun`
(`model.ts:1600-1667`), mirroring the anchor row's `showLabelsMode` onto the
other rows' gene displays. Two cautions, both already documented in-tree: the
self-write trap that `installSyntenyFollow.ts:801-811` describes, and the fact
that a mirrored write is a **persisted config write**
(`BaseTrackModel.ts:402-421`), so linking rows quietly rewrites every mirrored
track's saved settings. That second one argues for volatile override state
rather than mirroring the slot.

Smaller and probably better first move: the setting a reader most wants
consistent is `'auto'`'s **density gate**, not the mode. Rows differ mostly
because `maxLabelFeatureDensity` resolves differently per row at the same zoom.
A view-level "same label policy on every row" checkbox that pins the mode
explicitly would remove the inconsistency without touching the density logic.

## The scalebar already knows the chromosome; it just usually hides it

`showAssemblyNameInSubviewScalebar` returns true for synteny rows
(`LinearSyntenyView/model.ts:599`), and the label builder does exactly what the
brainstorm asked for:

```ts
// plugins/linear-genome-view/src/LinearGenomeView/util.ts:476
const name = withPrefix ? `${prefix}:${run.refName}` : run.refName
```

The catch is the condition on the line above: `withPrefix` requires the row to
be un-reversed, the label sticky, **and** `layout.transform < captionSpanPx`.
Miss any of those and the assembly becomes a standalone caption chip
(`:510-513`) while chromosomes keep bare labels — which is the common case and
the thing that reads wrong. A flipped row can never take the combined form at
all, because `[rev]` forces the caption out.

So this is not "add the chromosome", it is "stop splitting them". Worth checking
what `captionSpanPx` is actually measuring before changing it; the split exists
to avoid a collision, and the combined label is the wider one.

Separately, the SVG export prints only `view.assemblyNames.join(', ')`
(`SVGRowHeader.tsx:59`) and calls the label builder with no prefix at all
(`ScalebarRefNameLabels.tsx:82`), so an exported figure never carries the
chromosome. That is the version that ends up in papers.

## `assemblyName` where a reader wants a species

Confirmed in both places the brainstorm suspected, and a third.

Upstream, the launch dialog labels every panel with the raw adapter-declared
name: `PanelList.tsx:249` `label={row.assemblyName}`, `:166`
`` `${assemblyName} (your selection)` ``, and the multi-way menus the same
(`MultiWaySyntenyDisplay/menus.ts:79,111,238`). No `displayName` lookup exists
anywhere in that path. For a GenArk-backed row that prints `GCF_036323735.1`.

On our side, `GenePage.tsx:549` writes the launch card's own subtitle as
`` `a pairwise alignment view against ${assembly.ucscDb ?? assembly.accession}` ``
while the same object already carries `scientificName` and `commonName`. That
one is ours and costs a line.

Two related sloppinesses worth fixing in the same pass:
`lib/syntenyCatalog.ts:160` and `SyntenySelector.tsx:54` both define
`displayName` as `commonName ?? id`, so an assembly without a common name
"displays" as an accession; and `syntenyTracks.json`'s track names mix the
conventions inside one string —
`"GCA_000152225.2 (Cape rock hyrax …) to Human (hg38) liftOver"` — because the
pipeline builds one half from the raw name and the other from a display name.

## colorBy is nine modes wide and one of them is the default nobody chose

`COLOR_MODES` (`packages/synteny-core/src/colorModes.ts:21`) offers `Default`,
`Strand`, `Distinct color per track`, `Query`, `Target`, `Reference`,
`Identity`, `Mapping quality`, `dN/dS`, **plus one radio per column the adapter
declares**. Two of the structural modes self-gate (`track` needs more than one
track, `reference` needs more than one level); none of the value modes gate on
whether the data can answer them, and `Identity` needs a CIGAR with `=`/`X` or a
`de` tag, which a liftOver PIF does not carry.

The default is the unset field, which paints red matches with colored indels.

For our launches the useful set is small and we already know which: the two
drill-downs that pass `colorBy` at all pass `'query'`
(`multiSyntenyDrilldown.ts:104`, `SyntenySelector.tsx:220`), because on a
multi-panel stack "which chromosome of the next genome is this" is the question.
The row-level `orthoSyntenyUrl` passes none, so a two-panel ortholog comparison
opens on the red default.

Two things fall out:

- **Pass `colorBy: 'query'` on the two-panel launch too**, or decide that red is
  right for a single pair. Right now the two paths differ for no reason anyone
  recorded.
- **`dnds` and `mappingQual` cannot apply to a liftOver PIF**, and `identity`
  only applies where the CIGAR has `=`/`X`. Upstream gating them on data
  presence is the difference between a nine-item menu and a four-item one, and
  it is the same shape as the existing `hasCigarData` gate that already hides
  the CIGAR row.

## The view has three menus, and they are the real "too overwhelming"

Counted from `LinearSyntenyView`: the header hamburger (`model.ts:1509`, 7
groups including a submenu holding _every row's entire LGV menu_), the app
menubar (`model.ts:1565`, 3 items, one of which duplicates), and the Tune
settings menu (`syntenySettingsMenuItems.ts:30`, 8 items). Beside them on the
same bar sit the track selector, view options, scroll-zoom toggle, follow
toggle, colorBy selector and the search boxes. A band right-click adds a fourth
menu; a rubber-band drag adds a fifth.

The doc comment on the hamburger claims "SIX ROWS WHATEVER THE STACK HOLDS"; it
is seven groups, one of which is unbounded in the number of rows.

Nothing here is individually wrong, and that is the point — every item was added
for a reason and none of them is the one to delete. The lever is **which
question the reader is answering**. Our launches arrive with a purpose already
declared (compare these two genomes at this gene), so the honest simplification
is upstream-optional: a launch key that opens the view in a reduced-affordance
state, with the row-menus submenu and the value colorBy modes collapsed until
asked for. That is a real proposal to make to jbrowse-components rather than
something to patch from here.

## Narrowing the next row: the codebase argues against it, and is right except in one case

The machinery to compute the connected set exists twice over.
`OffscreenMateData.mateRefNameDict` with per-contig `counts` and `alignedBp`
(`LinearSyntenyRPC/collectOffscreenMates.ts:15`) answers "which contigs on the
other side, and how much aligns to each"; `culledRibbonMateData`
(`culledRibbonMates.ts:42`) answers it for the on-screen half; and
`diagonalizeRegions.ts:223` already computes `orderedNames`, which _is_ "row 2's
chromosomes with alignments to row 1's displayed chromosomes".

What does not exist is anything that narrows a row to that set.
`diagonalizeRegions` deliberately keeps the rest (`:236-239`), and
`showOffscreenMateContig` deliberately only adds (`stateModelFactory.ts:512`).
There is a stated policy behind that, repeated in two files:

> A locstring forces `navToLocString`, which REPLACES the moved panel's
> `displayedRegions` with the one contig it landed on, so a panel showing a
> whole genome is narrowed by its first move. The synteny fetch keeps a block
> only when both ends are in view, so that narrowing drops the ribbons the move
> was meant to line up. — `matePanelNavigation.ts:168-174`

That warning is about narrowing to **one** contig. The brainstorm's case is the
exact complement: narrow to **the set that is connected**, which is by
construction the set whose ribbons survive. Those are opposite operations and
the policy does not forbid the second one.

The pieces to build it are all present: aggregate the mate dictionary across the
band into a refName set, then `view.showRegions(subset)`
(`LinearGenomeView/model.ts:3052`) wrapped in the existing `showRegionsWithUndo`
(`showRegionsWithUndo.ts:33`) so a reader can back out. It belongs next to
"Re-order chromosomes" in the Rows submenu, as "Keep only connected
chromosomes".

One thing we can do from **this** repo today with no upstream change:
`views[i].displayedRegionNames` is already a launch key
(`LinearSyntenyView/afterAttach.ts:39-67`, globs allowed), and `specUrl` passes
unknown keys through. A multi-panel ortholog launch knows, from the pair
catalog, which chromosome each panel's gene sits on. Naming it per panel would
open the stack already narrowed instead of opening thirteen whole genomes and
asking the reader to find the gene. That is probably the single highest-value
item in this document.

## Opacity, and the one data-driven knob nobody turns on

Everything that affects ribbon opacity, with defaults:

| knob                     | default                | surfaced                           |
| ------------------------ | ---------------------- | ---------------------------------- |
| `alpha`                  | `0.2` (`consts.ts:7`)  | settings slider, cubic 0–1         |
| `opacityByIdentity`      | `false`                | settings checkbox, "Identity fade" |
| `fadeThinAlignmentsMode` | `'auto'`               | **no menu** — snapshot only        |
| tile fade `min(perpW,1)` | always on in `matches` | none, no floor                     |
| `WIDTH_FADE_FLOOR`       | `0.15`                 | constant                           |
| marker alpha             | fixed byte 64          | none                               |
| `minAlignmentLength`     | `0`                    | settings slider                    |

`opacityByIdentity` is the only data-driven one, it floors at 30%
(`syntenyColors.ts:169`), it applies to base and tile kinds but **not** to indel
quads, and it needs an identity the adapter can produce. For a liftOver PIF that
means the `de` tag — which the coarse tier drops and the fine tier carries. A
launch that turned it on would fade weak alignments out of the way, which is
much closer to "show people what they want to see" than another opacity slider.
Worth testing on a real ortholog window before proposing it as a default.

`minAlignmentLength` at 0 is the other one. A 200 kb ortholog window against a
fragmented chain set draws every 50 bp scrap; a floor of a few hundred bp would
remove most of the clutter the brainstorm is reacting to, and unlike the CIGAR
knobs it is a **view property that the released host also ignores**, so it costs
nothing to start passing.

## CIGAR: the sub-pixel hypothesis is wrong, and the real finding is yesterday's default

This is the one that inverted. Measured 2026-09-19 against
`hg38ToMm39.over.pif.gz` on the bucket, fine tier, two real windows pulled by
tabix range query, run through a faithful port of `visitCigarRenderedSegments`.

**Sub-pixel operations are not drawn.** `MIN_INDEL_PX = 1`
(`packages/cigar-utils/src/cigarRenderedSegments.ts:19`) merges any indel
narrower than a pixel into the surrounding match before a quad exists, and
sub-pixel match runs coalesce the same way. At the 200 bp/px launch scale the
HOXA window's **7,649 raw CIGAR operations become 693 drawn segments, 58 of them
indels**. There is no haze of hairlines to remove.

**What `cigarMode: 'matches'` costs is exactly the deletion fraction.** The mode
drops the full-span trapezoid and draws one tile per match segment, so the
ribbon paints only the bp that align:

| window       | match fraction of span | ink vs `off` |
| ------------ | ---------------------- | ------------ |
| HOXA cluster | 71.2%                  | 0.77×        |
| BRCA1        | 24.0%                  | 0.24×        |

The ratio _is_ the match fraction, to two decimals, at every scale in both
windows. `5864913626e` moved the launch default from `'off'` to `'matches'` on
2026-09-18 so indels would "show as gaps rather than being dropped" — which it
does, and in a fragmented human–mouse chain that means three quarters of the
ribbon is now holes. Whether that is better is a judgement, but it should be a
judgement made on the fragmented case, not the dense one.

An interactive comparison drawn on the real geometry, all three modes at any
scale: <https://claude.ai/artifact/9evhTGBB6VmY1rUKtkNHc4>

**Two genuine defects found on the way**, both narrow:

- A surviving indel is expanded to a 1 px footprint (`perpCoverage`'s `expand`,
  `syntenyTypes.slang:337`) and painted at **full alpha**, because
  `thinWidthFade` returns 1.0 for any `isCigarKind` (`:122-129`) — against a
  ribbon body at alpha 0.2 and in an opaque indel color. The comment justifying
  `MIN_INDEL_PX`'s 2→1 drop says the fill "fades sub-pixel indels by their true
  MSAA coverage"; the shader excludes exactly those kinds from that fade. One of
  the two is wrong.
- The gap is reachable because `bucketBpPerPx` keys the fetch on
  `floor(log2(bpPerPx))`, so geometry is reused across a 2× range. 7% of HOXA's
  indel quads fall under 1 px after a zoom-out inside their own bucket.
- Tiles in `matches` mode fade by `min(perpW, 1)` with **no floor**, by design,
  so overlapping tiles composite back to the untiled alpha. Where tiles sit end
  to end the floor is simply absent: 30% of BRCA1's tiles are sub-pixel at 400
  bp/px.

So if the goal is a simpler picture at ortholog scale, the levers are
`minAlignmentLength` and `opacityByIdentity`, not a CIGAR threshold that already
exists.

## Circos needs nothing built upstream

`plugins/circular-view` registers **`ChordSyntenyDisplay`** on `SyntenyTrack`
(`ChordSyntenyDisplay/index.ts:13`), it takes `assembly: ['hg38','mm39']` so
both ends are on the circle, and its adapter contract is plain `CoreGetFeatures`
— `PairwiseIndexedPAFAdapter` feeds it unchanged, as the shipped tutorial does
(`website/docs/tutorials/circular_synteny.md:97`). It is launchable through the
same `session=spec-` door as an LGV (`LaunchCircularView`), so `specUrl` builds
the link with no change to either repo. Nothing in jb2hubs references it today.

The one real cost is data, not code: a chord never reads a CIGAR and the circle
draws every row it is handed, so pointing it at a full liftOver PIF (tens of
thousands of short chains) draws a hairball. The tutorial's own recipe is a
filtered, CIGAR-stripped derivative — `awk '$11>=100000 {NF=12}'` then
`make-pif --no-coarse`. That is a new per-pair derived file in the pipeline,
gated like every other one, and it is the decision to make before the UI
question.

Where it would earn its place: the accession and gene pages currently answer
"where is this gene in that genome" and cannot answer "how is this whole genome
arranged against that one". A circle is the standard picture for the second
question and we have the data for it.

## If only a few of these happen

Ordered by value over cost, and the first three need no upstream release:

1. **`displayedRegionNames` per panel on multi-panel launches.** Opens the stack
   narrowed to the chromosomes the genes are on instead of thirteen whole
   genomes. Launch key already exists; we already know the chromosomes.
2. **The vocabulary pass on the gene page**, plus making `With alignment` a
   `useUrlState` value so a shared link carries it.
3. **Shrink the defaults**: `DEFAULT_SUBTREE_GENOMES` to 2–3, and stop arming
   `MultiSyntenyPicker`'s launch with a 12-genome chain the reader never picked.
   Fixes the URL length complaint as a side effect.
4. **Decide `cigarMode` on the fragmented case**, using the artifact above, and
   pass `minAlignmentLength` while you are in there.
5. `?config=` relative via a short path on the bucket; `/launch/synteny` for a
   readable link of our own.
6. Upstream: `displayName` in the launch dialog, the scalebar's split label, the
   `thinWidthFade`/`MIN_INDEL_PX` comment mismatch, "Keep only connected
   chromosomes", gating the value colorBy modes on data.
