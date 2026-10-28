---
name: pangenome-pages
description:
  'How the /pangenomes pages, the graph config in the bucket, the lane-width
  rule and the haplotype panels work, and what was removed from them.'
---

# The pangenome pages

The rules are in the repo `CLAUDE.md`. The data side (routes, how many
haplotypes have each segment, the sidecar's measurements) is in
`agent-docs/reference/PANGENOME_PORTAL.md`, and open work is in
`agent-docs/ideas/collections/pangenome-followups.md`.

## The pangenome graph config is ours, and it is stored in the bucket

`website/pangenome-config/hprc-grch38.json` is the config every HPRC graph
launch opens (`graphBrowser.configUrl` in
`website/src/components/pangenomeDataset.ts`), and its three siblings serve the
other graphs. `upload.sh` beside them publishes each to
`s3://jbrowse.org/pangenome/<name>/config.json` with an `upload_if_changed`
stamp. jbrowse-web fetches `?config=` from the visitor's browser, and only the
bucket sends CORS headers; genomes.jbrowse.org sends none. **Run
`website/pangenome-config/upload.sh` before deploying a change that touches
one**, because a launch naming a config the bucket lacks fails to fetch. The
data stays under `jbrowse.org/demos/`, built in jbrowse-components. ADR
`agent-docs/architecture-decision-records/0006-pangenome-configs-stay-in-this-repo.md`
records why the configs are kept in this repo.

The plugin url is the plugin store's `latest/` entry point
(`jbrowse.org/plugins/jbrowse-plugin-graphgenomeviewer/latest/…esm.js`), where
jbrowse-plugin-list rehosts the release its `GraphGenomeView` entry pins. The
plugin links an unreleased `@jbrowse/render-core`, so a pinned release stops
booting as `main` moves, and keeping it booting means bumping that pin. The
plugin shows an error page on every released host (`createSvgIcon`, measured
2026-08-26 on `latest` = v4.3.0). Every launch on the site targets `main`, where
the plugin boots, so `JBROWSE_BASE` cannot point at a release the plugin fails
on.

`pnpm check-pangenome-launches` boots every launch of every dataset on `main`,
including one whole-chromosome tier launch each (the shortest chromosome), and
reads back which tier the graph track cut. Run it after touching `pangenome*` or
a config, with `--dataset` to narrow it. The JBrowse docs' pangenome tutorials
(`website/docs/tutorials/pangenome_hprc.md` and its `pangenome_*` siblings in
jbrowse-components) describe these pages, so a visible change here is owed
there.

### One graph, one route, and almost no prose

`/pangenomes/<id>` (`hprc`, `mouse`, `bovine`, `arabidopsis`) is a page per
graph, rendered by `website/src/pages/pangenomes/[dataset].astro` from the
dataset. `/pangenomes` lists them and has nothing else. A graph's page is one
sentence, a line of links, the **Gene or region** box with the dataset's loci as
a row of examples under it (`PangenomeRegionBox.tsx`, `pangenomeExamples.ts`),
and the file table, folded. A bare visit opens the first example, so the page
starts with an answer. The page has no whole-chromosome links: their coarse-tier
plots read as meaningless (2026-10-12).

The box is the page's only client JavaScript, and the page has no style rule of
its own. Its whole design is the site's table rules, the shared query row
(`GeneCombobox` and `.ui-form` from `ui.css`, the controls /gene and
/protein-browser use, so the box suggests a gene symbol as it is typed),
`ui.css`'s lane map (`.ui-lanes`, `.ui-track`, `.ui-mark`), and the browser's
defaults. The 2026-09-16 review found the previous page a wall of prose and
buttons.

The box replaced a loci table (b9b1299) of 22 rows of five launches on HPRC (136
links, 2,629 px) that read as a list of hard regions. A reader names a gene or a
region, or clicks an example, and the answer is that one window: what it opens
as (`regionLaunches` in `pangenomeLinks.ts`, each launch with a line saying what
it draws) and, where the dataset publishes a structural-state sidecar, which
forms the haplotypes have there. The HPRC page is 974 px before a question. The
table had three things the box lacks: the variation class column, the gene hub
link, and launches that work without JavaScript.

**The answer is a map, and JBrowse is one button.** `PangenomeMap.tsx` draws the
window in the /protein-browser's shape:

- **On screen:** a one-line headline (`headline` in `pangenomePanels.ts`), a
  ruler, the window's protein-coding genes (mygene's interval query,
  `genesInWindow`), then one row per structural form with its share of the
  placed haplotypes, and a "rarer forms" row so the shares add up.
- **One button:** "Open in JBrowse" opens the first launch; clicking a row
  focuses its form, and the button then opens that form's representative as a
  haplotype lane.
- **The rest is in "More about this window":** the counting sentence, the forms
  table with counts and an example haplotype, and every launch with what it
  draws.
- **Why:** until 2026-10-14 an iframe of jbrowse-web drew the chosen launch in
  the page. Colin found it overwhelming and asked for a simplified glyph "sort
  of like how protein browser is", with JBrowse only on request. Three reviews
  of the first glyph found it drew losses the data does not support, which the
  rules below fix.

**HPRC's map reads the graph's walks.** `pangenomeWalkForms.ts` runs
graph-walks' `formsCut` and `structuralForms` over the walk file the focused
row's graph already cuts, and converts the forms to the sidecar's shape, so the
panel, headline and map read either. The other graphs have no walk file and keep
the sidecar.

- **Why:** walks give exact lengths. graph-walks' gate (its
  `docs/structural-forms.md`) sized every member at the forms check's loci,
  where the sidecar sized 5,528 of 6,931, and per site 50 bp–1 kb changes agree
  with the assemblies 78.8% against the sidecar's 69.9% at the examples. At HBA
  the walks give four forms (416 reference, 30 −α3.7, 6 triplication, 7 +10 kb),
  where the sidecar gave 17 forms of small insertions. They hold deletions the
  sidecar drops (the 1000 Genomes check below).
- **A worker reads them** (`pangenomeWalkForms.worker.ts`, one per question),
  since the read is CPU-bound and an `AbortSignal` stops it only between awaits.
  In node, for `check-pangenome-launches`, the read runs in place.
- **Abridged walks expand all or nothing, under 8 M steps** (`partial: false`).
  Measured 2026-10-21 in Node on a laptop: MHC class II 11.0 M steps (13–22 s of
  CPU), LPA 6.3 M (6–9 s), KIR 6.0 M (8 s), AMY1 4.0 M (3.6 s); the other
  examples have none and read in 0.3–2 s. Expanding part of a window is worse
  than none: at 4 M steps MHC kept 191 haplotypes net-only.
- **The page reads the sidecar for a window past the budget**
  (`WalkFormsTooLarge`) or past 12 s (`WalkFormsTooSlow`, a slow machine), and
  its sentence names the source ("the graph's" or "the callset's 462
  haplotypes"). MHC class II falls back in about 3 s, the plain cut that counts
  its steps. Do not show the sidecar first and swap: the focused row and the
  launch links come from the reading.
- **20 of 19,369 gene windows pass the budget** (2026-10-21), HLA-DRB1 among
  them, and each falls back in 0.2–3.2 s. A walk-file `dp` tag would remove the
  budget but does not pay for its rebuild on its own:
  `agent-docs/ideas/waiting-on-a-number/hprc-walk-dp-tag.md`.
- **graph-walks' `markTag` names every change**, from either source: "del
  18.4kb", "ins 22kb", "repl 32.7kb->58.7kb", "shift 94.2kb", "net +78kb", "dup
  94.1kb", "inv 37.6kb". A lane is its largest change plus " +N" and the
  reference's form "ref". A replacement whose smaller side is under 5% of its
  larger stays a replacement and reads "del 6.46kb->94bp" (Colin, 2026-10-21). A
  sidecar mark is converted to a graph-walks Mark first, and a diffuse one reads
  as net.
- **The headline counts shift-only forms beside the reference's own**
  (`onlyShifts`): AMY1 reads "GRCh38's structure: 3%, and its length with a
  stretch aligned elsewhere: 42%", the H3r structure Bolognini 2024 finds
  commonest.
- **A tandem duplication is a mark of its own** (`duplication`), drawn over the
  copied stretch in Set1 blue `#377eb8`. AMY1's extra gene copies read "dup
  94.1kb".

Where the map reads the sidecar, it draws only what the sidecar supports:

- **One change split over a snarl's records is one change**
  (`mergeSplitEvents`). vcfwave anchors C4's extra 26 kb module at a dozen
  bases, and each anchor's carriers were a form of their own. Only records
  within the change's own size (1 kb at least) of each other merge: CFHR has a
  +330 bp at one base on 112 haplotypes and at another 21 kb away on 2, and one
  span over both drew the first as net (1,311 such cases genome-wide). Merging
  splits a multi-state record into one row per size, so `sites` and
  `nonReferenceMajority` count the records.
- **A pure deletion and a pure insertion of one size are a shift, not a loss**
  (`pairShifts`, within 10% and 1 kb or more, no further apart than twice that
  size, and never with a replacement, since one paired with a 1.1 Mb parent's
  residual drew a solid band across the window). 77 GSTM1 haplotypes carry both
  and keep the gene, and C4's module swaps are shifts too. Drawn apart, GSTM1's
  pairs made its null share read 84% instead of 68%.
- **A size change replaces its site's bases unless one side is under 50 bp**
  (`changeKind`). A site spans its record's REF. A state is an insertion where
  that REF is under 50 bp, a deletion where it leaves under 50 bp to the state's
  two-figure rounding, and otherwise a replacement. C4's 26 kb gain replaces
  32.7 kb with 58.7 kb (wave record, 2026-10-21). Over every example's drawn
  forms, 31 HPRC states replace, 63 of cattle's and 70 of Arabidopsis's, whose
  callsets keep whole bubble alleles. The map draws a replacement as a pale band
  over the site, named "32.7 kb replaced by 58.7 kb" to three figures, since the
  new length comes from a two-figure size change.
- **A restored parent's change is net** (`diffuse`), and so is a replacement
  much wider than its change. A restored parent's sizes are what its children
  leave unexplained: LPA's KIV-2 parent reads +78 kb beside the 11 kb child row
  its forms also carry, so naming it "30.7 kb replaced by 109 kb" left out that
  11 kb of the 120 kb they gain. The map names such a change "78 kb longer in 31
  kb", and SMN's restored 1.6 Mb parent, whose 240 kb a solid bar over SMN1 drew
  as gene loss on 14% of haplotypes, "240 kb shorter in 1.6 Mb". Format v3 of
  the HPRC sidecar marks restored rows; cattle and Arabidopsis restore none.
- **The map draws a deletion its own length centred in its site, then clamps
  it**, since the sidecar records how much a form loses but not which bases. The
  map puts an edge bar on a mark that runs past the window.
- **A site a form is not aligned through, or bypasses, is a dashed gap** in the
  bar over that site alone.
- **A form that only bypasses sites is "another route", not GRCh38's
  structure**: a restored parent calls it with a residual under its floor, so
  the length is the reference's but the path is not. AMY1 has two such forms, of
  171 and 26 haplotypes. The headline's GRCh38 share counts only forms with no
  mark at all, over every form, drawn or not.
- **A form told apart only by changes under 1% has no lane**
  (`structuralPanel`), so the map, the table, the sentence and the launches
  agree; its haplotypes are in the "other forms" row. At SMN that is the
  commonest form, 97 of 366.
- **Shares are of the placed haplotypes.** Hovering a change shows its carriers
  over every form, as a share of the haplotypes aligned at its site, and the
  fold lists the commonest ten. `aligned` is counted over the folded forms,
  since a rare no call folded into a sized majority is a carrier too: counted
  from the raw row, chr3:90,699,772 read 101%. HPRC is a panel chosen for
  diversity, so the page never calls a share a population frequency.
- **Colours are the matrix's `svType` preset**: deletion `#e41a1c`, insertion
  `#800080`, inversion `#ff7f00`. A replacement is the pale red or purple of its
  net change.
- **A window with no panel draws no map**: no sidecar, past
  `MAX_DETAIL_WINDOW_BP`, or nothing informative.

**The map's changes match the assemblies outside complex loci, for 1 kb changes
and 50 bp ones alike** (measured 2026-10-21 with
`website/pangenome-config/checkForms/`). For each window the check runs the
page's own `structuralForms` (`printForms.ts`) and compares every form member's
claimed net change across the window with the change in that member's assembly,
which the graph never saw:

- **HPRC** (`bamTruth.py`) projects the window's edges through HPRC's winnowmap
  alignment of each haplotype assembly to GRCh38_no_alt. 406 of 462 haplotypes
  have one; HG002, HG005 and the other release 1 and NA18xxx samples do not.
- **Arabidopsis and mouse** (`flankTruth.py`) map the 2 kb of reference outside
  each edge onto each assembly with minimap2 and measures the contig between the
  two hits, so nothing inside the window has to align.
- **An edge counts only where it aligns to one position in the assembly**;
  otherwise the check moves it out 5 to 100 kb and sums the sidecar over the
  wider span. Measured through one record, FCGR's 82 kb tandem duplication read
  as no change.
- **`scoreForms.py` counts a claim within 10% or 500 bp as agreeing.** That
  tolerance swallows every change under 500 bp, so the table splits members by
  the larger of claim and assembly change, and scores 50 bp–1 kb within 50 bp.

| Windows                       | ≥ 1 kb, within 10% | 50 bp–1 kb, within 50 bp | Any, 10% or 500 bp |
| ----------------------------- | ------------------ | ------------------------ | ------------------ |
| HPRC, 19 examples             | 2,113 of 2,120     | 302 of 785               | 5,521 of 5,528     |
| HPRC, 40 random 50 kb         | 325 of 325         | 2,045 of 2,663           | 12,860 of 12,860   |
| Arabidopsis, 6 examples       | 83 of 84           | 11 of 40                 | 132 of 133         |
| Arabidopsis, 298 random 50 kb | 3,735 of 4,121     | 1,092 of 2,185           | 6,921 of 7,201     |
| Mouse, 7 examples             | 50 of 58           | 18 of 24                 | 95 of 103          |
| Mouse, 200 random 50 kb       | 781 of 878         | 545 of 1,142             | 3,293 of 3,380     |

- **The claim has to span what the truth measured.** The truth tools widen a
  window to every row its rows reach, so a 415 kb restored parent at chr19:21.88
  Mb put a 9.5 kb insertion 220 kb outside the window into the measured span.
  Summing the claim over the window's own rows read as 0 of 192 there, and as an
  unexplained 2.8 kb deletion at GSTT1; `scoreForms.py` now adds each member's
  sizes at the rows beyond the window.
- **The 50 bp–1 kb column does not judge the map.** Most of its misses are a
  window the map calls unchanged where the assembly differs by 50 bp–1 kb, and a
  50 kb window gathers that much from indels under 50 bp, which the sidecar
  leaves out by design. The per-site check below judges them.
- **Indels under 50 bp hide no kilobase change.** Summed per haplotype over
  every 10–49 bp record in each 50 kb tile genome-wide, none reaches 1 kb; the
  largest is 600 bp.
- **Only members whose window edges anchor uniquely are scored**: 68 of 462
  haplotypes at AMY1, 82 at LPA, 141 at MHC.
- **Complex loci hold up where they can be scored**: MHC 141/141, C4 403/403,
  LPA 82/82, FCGR 331/331, CYP2D6 405/405, AMY1 68/68, GSTT1 316/316, KIR
  322/324, Arabidopsis RPP5 19/19 and RPP1 10/10. HPRC's 7 remaining misses are
  at CFHR, MNS, PGA and KIR.
- **Mouse's misses are at H2-D and Ly49.** H2-D is 14 of 17: two wild-derived
  strains' large insertions are short by a third. Ly49, the NK receptor cluster,
  is 3 of 8 scored, and its flanks align to paralogs (one strain read +698 kb),
  so the check cannot judge it. Every strain, C57BL/6J's T2T assembly included,
  reads ~1 kb longer than mm39 at chr1:153.7 Mb, which points at mm39 itself.
- **Arabidopsis misses sit in repeats**: 98.5% of members agree where the
  window's own edges anchor, and 75% where the flanks had to move 50 kb, mostly
  in pericentromeres.
- **Loosely claimed members are scored apart.** The claims of members of a form
  with an unsized site match 91% (HPRC) and 44% (Arabidopsis), and those of rare
  carriers, whose state `structuralForms` folds into the majority, 67–76%.
- **The check measures sizes only.** Minigraph and SyRI placed the same
  Arabidopsis insertion up to 1 kb apart in a repeat, and the sidecar records no
  deletion's bases, so where the map draws a mark is its own estimate.

**Per site the map agrees with the assemblies within 50 bp or 10% in ordinary
regions.** `printSites.ts` pads each informative site by 500 bp, grows the span
over any site its edge cuts, and writes what each form claims there; the truth
tools measure those spans, and `scoreSites.py` scores two claims per member: the
form's, which a reader sees, and the member's own sidecar states.

| Sites                 | ≥ 1 kb         | 50 bp–1 kb       |
| --------------------- | -------------- | ---------------- |
| HPRC, random windows  | 128 of 128     | 6,402 of 6,918   |
| HPRC, 19 examples     | 4,279 of 4,647 | 5,091 of 7,302   |
| Arabidopsis, random   | 5,401 of 5,802 | 10,648 of 12,229 |
| Arabidopsis, examples | 146 of 163     | 167 of 199       |
| Mouse, random         | 1,013 of 1,146 | 4,442 of 4,930   |
| Mouse, examples       | 117 of 160     | 281 of 321       |

- **Folding haplotypes into forms costs at most 3 points**: at every site the
  form's claim agrees nearly as often as the member's own sidecar state, so the
  map's errors are the callset's, not the grouping's.
- **Most misses are the callset's**: a 50 bp–1 kb change in the assembly the
  sidecar records as none (HPRC examples 1,030, Arabidopsis random 907), or two
  sizes more than 50 bp apart.
- **Complex loci are measurable only in part per site.** At HPRC's examples
  40,769 member-sites have no unique edges at all, and 56,659 more anchor only
  after widening, where the member's own sum agrees 18%; sites under a restored
  parent that holds them agree 39%, since the parent's change may lie anywhere.

To rerun on the build box, with the sidecar downloaded:

```sh
cd website/pangenome-config/checkForms
node printForms.ts hprc.sv-states.v3.tsv.gz hprc.windows.tsv > hprc.forms.jsonl
python3 bamTruth.py hprc.forms.jsonl @haplotypes.txt \
  'https://s3-us-west-2.amazonaws.com/human-pangenomics/working/HPRC/{sample}/assemblies/release2/alignments/winnowmap/GRCh38_no_alt/{sample}.GRCh38_no_alt.hap{hap}.sorted.bam' \
  bai hprc.truth.tsv 8
python3 scoreForms.py hprc.forms.jsonl hprc.sv-states.v3.tsv.gz hprc.truth.tsv
node printSites.ts hprc.sv-states.v3.tsv.gz hprc.windows.tsv > hprc.sites.jsonl
python3 bamTruth.py hprc.sites.jsonl @haplotypes.txt '<the same url>' bai \
  hprc.sites.truth.tsv 8
python3 scoreSites.py hprc.sites.jsonl hprc.sv-states.v3.tsv.gz hprc.sites.truth.tsv
```

`bamTruth.py` reads about 3 MB of each BAM per window from S3, about an hour for
462 haplotypes and 59 windows at 8 at a time. Arabidopsis's `flankTruth.py`
takes a minute against `~/1001g/graph/<name>.pansn.fa`.

**The examples' shares match published population frequencies.**
`checkForms/popFreq.py` counts the HPRC haplotypes carrying each well-studied
allele by 1000 Genomes superpopulation, from the sidecar the page reads
(measured 2026-10-21). HPRC has 58 European haplotypes, so a European share has
a 95% interval about ±12 points wide.

| Allele                     | HPRC AFR / AMR / EAS / EUR / SAS | Published                                                | Source                             |
| -------------------------- | -------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| UGT2B17 120 kb deletion    | .27 / .42 / .84 / .31 / .65      | .24 / .34 / .83 / .37 / .60                              | Sudmant 2015, 1000 Genomes phase 3 |
| GSTM1 18 kb deletion       | .55 / .66 / .72 / .83 / .67      | .50 / .69 / .75 / .72 / .57                              | Sudmant 2015                       |
| GSTT1 absent               | .52 / .57 / .64 / .45 / .50      | .55 / .48 / .67 / .40 / .43                              | Sudmant 2015                       |
| CFHR3–CFHR1 85 kb deletion | .59 / .15 / .02 / .14 / .44      | Nigeria .55, Mexico .02, China .06, UK .18, Pakistan .15 | Holmes 2013 PLoS One               |
| RHD 70 kb deletion         | .12 / .22 / .05 / .43 / .24      | YRI .19, JPT .05, CHB .09, CEU .43                       | Perry 2012 Hum Genet               |
| HP Hp1 (1.7 kb deletion)   | .61 / .53 / .24 / .31 / .19      | Ghana .51, Mexico .51, Japan .27, Europe .41             | Soejima 2020 Sci Rep               |
| HBA −α3.7 (3,805 bp)       | .16 / .02 / .01 / .00 / .06      | .17 / .03 / .02 / .01 / .06                              | gnomAD-SV v4, its 5.5 kb record    |
| CYP2D6\*5 deletion         | .05 / .05 / .06 / .02 / .03      | .06 / .03 / .05 / .03 / .04                              | CPIC frequency table, 2024         |
| FLNA–EMD inversion         | .96 / .44 / .26 / .16 / .51      | .98 / – / .27 / .18 / GIH .48                            | Giner-Delgado 2019 Nat Commun      |
| C4: 1 / 2 / 3 genes, EUR   | .16 / .79 / .05                  | .17 / .69 / .14                                          | Blanchong 2000 J Exp Med           |

- **Each allele ranks the populations as the sources do**: UGT2B17's deletion is
  on 84% of East Asian haplotypes, and the CFHR3–CFHR1 deletion on 2%.
- **Three shares fall outside HPRC's 95% interval around the published value**:
  HP Hp1 in Africans (.61 against Ghana's .51), CFHR3–CFHR1 in South Asians (.44
  against gnomAD-SV's .32) and GSTT2B's 37 kb deletion in Africans (.33 against
  Zhao 2009's YRI .47 by PCR). Each compares a 1000 Genomes superpopulation with
  one country or another cohort.
- **GRCh38's HP is the Hp2 allele**, so Hp1 is the deletion (UniProt P00738, and
  the MANE transcript's repeated exons 3–4).
- **The extra CYP2D6-like copy is on 38% of East Asian haplotypes and 3%
  elsewhere**, as \*36+\*10 is, but no source tabulates that tandem: CPIC folds
  it into \*10, which is 43% in East Asians.
- **C4 needs a sum per haplotype.** The sidecar splits a module swap over a 33
  kb deletion row and a 26 kb insertion row, so the deletion row alone reads 45%
  European one-gene haplotypes against a published 17%.

**The sidecar's deletion genotypes agree with 1000 Genomes' short-read calls for
the same people.** `checkForms/kgConcordance.py` matches each PASS deletion of 1
kb or more in the 1KGP high-coverage SV callset (Byrska-Bishop 2022,
`1KGP_3202.gatksv_svtools_novelins.freeze_V3.wAF.vcf.gz`) to a sidecar row
overlapping it by half with a deletion state within 20% of its length, and
compares the 222 samples both sets hold (measured 2026-10-21):

| 1KGP deletions             | Matched        | Genotypes agree |
| -------------------------- | -------------- | --------------- |
| 1–10 kb, breakpoints       | 8,569 of 9,405 | 98.8% of 1.86 M |
| 10–100 kb, breakpoints     | 1,054 of 1,200 | 99.7% of 228 k  |
| ≥ 100 kb, breakpoints      | 75 of 104      | 99.8% of 16 k   |
| Any size, read depth alone | 334 of 1,221   | 97% of 67 k     |

- **84.9% of non-reference genotypes agree.** The commonest disagreements are a
  1KGP heterozygote the sidecar calls absent (8,988) or homozygous (6,587).
- **Where the two disagree, the sample's assemblies match the sidecar 3 times
  in 4.** `bamTruth.py` measured 300 random disagreements in each sample's two
  assemblies and could score 182: the sidecar was right in 133, 1KGP in 40,
  neither in 9. In 300 agreeing carriers, the control, the measurement matched
  256 of 257.
- **The sidecar is right in every zygosity dispute**: 74 of 74 where 1KGP calls
  a heterozygote the sidecar calls homozygous, 27 of 27 the other way.
- **The sidecar's misses are not the graph's.** Where 1KGP sees a carrier the
  sidecar calls absent, 1KGP was right in 37 of 55, and the assemblies hold the
  deletion in 46. At the 14 of those 46 checked, the walk file (graph-walks'
  `formsCut`) has a departure of about the deletion's length in every haplotype
  whose assembly has it, so the graph holds the deletion and the sidecar's
  derivation from the callset loses it. 15 of the 46 are at rows where the
  deletion state has fewer than 5 carriers.
- **A read-depth-only call names its breakpoints by bin**, so most fail the 50%
  overlap; many sit in segmental duplications such as PRAMEF at chr1:12.8 Mb.
- **A deletion at a restored parent's row is matched there**: RHD's 70 kb
  deletion is one.
- **To rerun:** stream the callset's deletions for `both.samples` (the HPRC
  samples in it) with
  `bcftools view -r <chrom> -S both.samples --force-samples -i 'INFO/SVTYPE="DEL" && INFO/SVLEN<=-1000 && FILTER="PASS"'`,
  one chromosome per job, with `pipefail` set: a remote read that fails partway
  still writes the rows before it. Then `kgDisputes.py` samples the pairs,
  `kgAdjudicate.py` measures them on ada with `bamTruth.py`'s url template (10
  minutes at 16 jobs), and `kgVerdicts.py` scores them.

**The page headlines these alleles.** At UGT2B17, CFHR, RHD, HP, GSTM1, GSTT1,
FLNA, CYP2D6 and HBA, the headline or the first lane names the allele above at
the share above, from walk forms. GSTT1 headlined a 55 kb insertion in 5% until
the headline counted a change sized twice once (54.2 kb on most carriers, 54.6
kb on the rest); it reads 46%. On the sidecar, HBA drew no lane for −α3.7 (17
forms of 50–580 bp insertions took the panel) and AMY1 read "GRCh38's structure:
none"; walk forms gave HBA its four forms and AMY1 its 42% at GRCh38's length.

**A focused row draws its change as Bandage does** (`PangenomeGraph.tsx`).
Clicking a row cuts the graph around that form's largest placed change, with 2
kb of flank (`changeWindow`), from every haplotype, and draws it with
bandage-core's stress layout: the reference straight, a deletion as an arch, an
allele as a lens, node width by how many haplotypes pass through, the focused
form's haplotype highlighted.

- **The cut reads the walk file** (`walksUrl`, `gfa-to-tabix --walks`), the file
  the Haplotypes launch's lane track reads. `pangenomeWalkCut.ts` cuts it with
  graph-walks' `cutRegion` with `contained: true` (graph-walks 4, walk format
  5), and bandage-core's `loadGraph` builds the graph from its tables. Only HPRC
  publishes a walk file, so only HPRC draws a graph.
- **An abridged walk loads on demand** (gfa-to-tabix ADR 0004). In a satellite
  chunk the walk file keeps only a summary row for the costliest paths, which
  the cut draws as two steps where the walk leaves and rejoins GRCh38. The
  worker reads the focused haplotype's walk in full, and lists the rest under
  the figure as blocks such as `HG00133#1: 12 k steps, 170 kb off reference`
  that read theirs on a click. LPA's KIV-2 window abridges 291 of 465 walks;
  expanding one adds ~700 nodes and its cut and layout take 5–9 s in Node
  (measured 2026-10-21 on ada).
- **The tables never become GFA text.** Writing them as GFA and parsing it back
  drew the same SVG, byte for byte, and cost a third of a second at HLA's 7 k
  nodes (19 MB of text) and 2 s at LPA (measured 2026-10-20 on ada).
- **A node limit bounds the cut.** `NODE_LIMIT` (30,000) stops a cut the page
  could not lay out, and graph-walks' byte budget stops the read.
  `WALK_BUDGETS`' 4 M step budget refused LPA's KIV-2 window (4.6 M steps). Past
  either limit the figure reads "This stretch of the graph is too large to
  draw."
- **Not the whole window:** measured 2026-10-14, a whole window holds
  1,300–11,000 nodes, and drawn at 900×140 it is a barcode of SNP bubbles.
  `foldVariants`, which would collapse them, refuses a graph with walks.
- **The figure has 400 px of height room.** A ring or loop (LPA, KIR, FCGR, HP's
  insertions) is about as tall as it is wide, and at 200 px it drew across a
  fifth of the width. bandage-core shrinks the frame to a flat cut's drawing but
  never below 160 px, so a flat cut such as HLA's still draws a thin line in a
  900×194 frame; only a bandage-core option could trim that.
- **One change reads:** GSTM1, C4's HERV and HP's 1.7 kb deletion each draw as
  one clear bubble. A cut past `MAX_GRAPH_BP` (40 kb) draws nothing, and a net
  change has no place to cut, so CFH's 85 kb deletion and SMN's parents have no
  graph.
- **The cut keeps each walk within the window.** A contained cut splits a walk
  where it steps onto the reference outside the window ± 1 kb and draws the rest
  as a gap. AMY1's 4 kb window holds 182 nodes (9,928 uncontained; the gbz-base
  cut the page used before 2026-10-19 held 1,845, because it keeps 1 kb of each
  other copy a haplotype jumps into). KIR's windows hold 4,772–14,448. An
  insertion that leaves the window and comes back stays whole, so GSTT1's 54 kb
  insertion and LPA's 78 kb one draw as loops (2,314 and 22,357 nodes).
- **Timing:** measured 2026-10-19 from node on ada over every example's
  focused-row windows (42), a cold cut takes 0.1–1.4 s, 2.2 s at LPA, and the
  layout takes under 1.4 s except at KIR (3.2 s) and LPA (6.1 s).
- **Where HLA's first click goes**, measured 2026-10-20 from a browser on ada
  against production (2.3–3.6 s to drawn): the walk file's index, header and
  rows load one after another (0.6, 0.2 and 0.8 s), the cut takes about 1 s and
  the layout under 0.7 s. The cut reads two whole 64 kb chunks of 438 haplotypes
  for an 18 kb window, inside graph-walks. Its per-chunk node-limit check
  (`surelyKept`) costs 7–20% of the cut, and the page keeps it, because it stops
  an oversized cut early.
- **The layout runs in a worker** (`pangenomeGraphLayout.worker.ts`), from the
  cut to the SVG's data url. Handing bandage-core a worker-backed `LayoutEngine`
  would leave most of LPA's work on the main thread: loading its graph takes 0.7
  s, the steps around the engine 0.2 s, and the graph and layout it would post
  back clone to hundreds of MB.
- **The worker keeps its cuts per window**, so another row's highlight redraws
  in about 0.13 s. `pangenomeGraphLayout.ts` terminates it when the 30 s
  deadline passes or a row of another window is clicked while it is busy.
- **Main-thread blocking**, measured 2026-10-19 in a dev-server page on ada
  during a `run.sh`, from click to drawn. Before, the page cut without
  `contained` and laid out on the main thread; after, the worker lays out the
  contained cut.

  | Example | Drawn before | Longest task before | Drawn after | Longest task after |
  | ------- | ------------ | ------------------- | ----------- | ------------------ |
  | C4      | 0.4 s        | 284 ms              | 0.5 s       | none               |
  | GSTM1   | 1.0 s        | 844 ms              | 1.1 s       | none               |
  | AMY1    | 4.3 s        | 3,629 ms            | 0.3 s       | none               |
  | KIR     | 3.2 s        | 1,448 ms            | 2.7 s       | none               |
  | LPA     | 5.8 s        | 5,465 ms            | 6.1 s       | 84 ms              |
  | GSTT1   | 1.2 s        | 547 ms              | 0.9 s       | none               |

- **Stress, not FMMM:** FMMM is 434 KB of wasm and draws a tangle at this size.
- **The licence:** bandage-core is GPL-3.0-or-later. `PangenomeGraph.tsx` and
  its layout worker are the only modules that load it: the worker imports it,
  and `PangenomeGraph.tsx` starts the worker on the first click. Each carries an
  SPDX header, the page names the library and the source, and the root `LICENSE`
  says the deployed site is distributed under GPL terms while each file keeps
  its own licence.
- **The walk file sends `Access-Control-Allow-Origin: *`** (checked 2026-10-19).

**The matrix is ordered to match the map.** On HPRC, `regionAnswer` hands the
launches every placed haplotype grouped by structural form, commonest first
(`MatrixRows` in `pangenomeLinks.ts`), and the matrix takes it as `rows.sort`,
so each form is one block of rows, commonest first, as the map draws them. A
phased row is `<sample> HP<n>` from 0, and sidecar `#1` is `HP0`: at CFHR the
sidecar's 138-member deletion form and the VCF's 138 carriers of the 84,685 bp
deletion are the same set in `wave` and `pgbi`, and the other mapping matches
nothing (checked 2026-10-09).

**A haplotype the sidecar calls nowhere in the window draws no row**
(`rows.kept`, set only when there is such a haplotype). On chrX that is each
male's first haplotype. `wave.vcf.gz` writes it as a no call (`.|1`), while
`pgbi.vcf.gz` wrote a male's one X as both alleles (116 samples, no heterozygous
call among 133,632 at FLNA), so his X drew twice there. Those haplotypes have no
lane either, and the page's sentence counts them.

**The matrix reads the release's normalized callset, `wave.vcf.gz`, one allele
per record.** `website/pangenome-config/buildHprcSvCallset.sh` splits it
(`bcftools norm -m -any`), keeps the alleles that change the length by 50 bp or
more or that vcfwave flags as an inversion, drops CHM13, writes vcfwave's `INV`
flag as `SVTYPE=INV`, and publishes the result beside the sidecar. The script
changes nothing else in a record. vcfwave realigns each bubble allele to the
reference, so a deletion spans the bases it removes and an insertion sits at one
base. The display draws an insertion at that base, colors cells by its `svType`
preset, and draws a variant lane of marks above the rows, with labels off
because a record's ID is its graph path. `pgbi.vcf.gz`, PanGenie's input, holds
whole bubble alleles instead, so a 6 kb REF against a 40 kb ALT draws an
insertion as a block over reference the haplotype keeps. Measured on wave
(2026-10-09):

- **HP's 1.7 kb deletion is there**, in 190 haplotypes, with no top-level
  filter.
- **vcfwave leaves an allele past its realignment length whole.** CFHR's 85 kb
  region has, besides the deletion, a same-length 84,685 bp REF to ALT record in
  129 haplotypes, which draws as a full-width bar.
- **One event can be several ALT alleles**, split by flanking sequence: GSTM1's
  18 kb deletion is alleles of AC 150 and 241 in one record. Under the default
  colors, by allele index, they interleave inside one block; `svType` paints
  both red.
- **`svType` classes a record, not a haplotype's allele**, and the release
  merges every allele starting at a position into one record. C4's 33 kb module
  record held the deletion and the insertion, so all 130 haplotypes with either
  drew "Other / mixed". After the split, each record is one allele, and each
  haplotype's class is that of the allele it has. The FLNA inversion has a class
  only through `SVTYPE=INV`, because the preset reads SVTYPE and ignores
  vcfwave's flag.
- **"(no value)" is the display's name for a record without a class**, not a VCF
  value. Format v1 kept any allele whose REF or ALT reached 50 bp, and 190,441
  of its 1,650,445 records changed the length by less than 50 bp (48,095 not at
  all). Format v2 keeps a length change of 50 bp or more, or an inversion, so
  every record is a deletion, an insertion or an inversion.
- **A window's records are 1.9 to 16 MB** (MHC class II the largest), under the
  20 MB `fetchSizeLimit`. `wave` has a CHM13 column, which sorts below the
  panel.

Cattle keeps its breed rows. Its callset is `vg deconstruct` run here over the
published minigraph graphs, with whole bubble alleles like `pgbi`, and nobody
has normalized it.

Naming 462 rows puts a launch at ~12 KB, and CloudFront answers 414 past about 8
KB, so `specUrl` moves a long url's params into the hash, which jbrowse-web
`main` reads the same way.

On 2026-10-09 these examples read cleanly on the split callset: GSTM1 (its 18 kb
deletion on 68% of haplotypes, one red block), HP (the 1.7 kb deletion), C4A /
C4B (the 6.4 kb deletion at C4B and the 33 kb module deletion as red blocks, the
module's insertion alleles their own rows), CFH / CFHR (the 138 who delete in
red) and FLNA (the inversion, one block). MHC is too dense to read in the
matrix, and KIR draws an almost empty matrix.

- **A curated locus is one window of at most `MAX_DETAIL_WINDOW_BP`**, and a
  test holds every HPRC window to the limit. Two non-human examples are wider on
  purpose, cattle `defb` and Arabidopsis `knob`, and `pangenomeExamples.test.ts`
  lists them by id.
- **`regionAnswer` (`pangenomeAnswer.ts`) computes the whole answer**: the
  window, its title, the forms and the launches. The box renders it and
  `check-pangenome-launches` calls it, so the check boots what the page offers.
- **A haplotype with no call at any site in the window is in no form and gets no
  lane**, on any chromosome, and the answer's sentence counts them ("116
  haplotypes are not aligned at any of them and have no lane").
  `structuralForms` returns them as `unplaced`. On chrX they are the 116 male
  haplotypes without one; at defb they are 390 and at nphp1 5. A deletion
  spanning a whole window does not count as unplaced: it reads `_` under the
  restored parent that sizes it, and keeps its lane.
- **A lane is labelled with its form.** `describeForm` (`pangenomePanels.ts`)
  reads the form's key against each site's size changes in the sidecar: "as the
  reference", "85 kb deletion", "inversion". The label lists up to two size
  changes and counts the rest with the largest named ("39 size changes, largest
  a 19 kb deletion" at MHC class II), because a list of sizes is unreadable. A
  deletion spanning nested sites is a size at its restored parent's row:
  UGT2B17's 229 haplotypes read "120 kb deletion" and RHD's 86 "70 kb deletion".
  "Not aligned at N sites" marks a `.` in a form with calls elsewhere, and "a
  rarer change at N sites" marks a state under `MIN_CARRIERS` at a site where
  most haplotypes have no call. Over the 22 examples on 2026-10-08, 6 lanes say
  "not aligned" (two each at mhc-hla, smn and nphp1) and 2 say "rarer" (smn,
  defb).
- **A lane whose form is a deletion spanning the window draws nothing, which is
  correct.** The graph has no walk for the haplotype there, so the track opens
  no row for it: 4 of SMN's 8 lanes, each a 190 to 250 kb deletion in a 1.6 Mb
  snarl around the 60 kb window. `structuralPanel` lists the lanes of a form
  that bypasses every site it does not delete and whose deletion is at least the
  window's length (`lanesMayDrawEmpty`), and `check-pangenome-launches` accepts
  a missing row only for those, as a note. A shorter deletion leaves a flank, so
  the check requires a row for UGT2B17's 120 kb in 150 kb, RHD's 70 kb in 85 kb
  and AMY1's 94 kb in 150 kb.
- **Only a sidecar reading excuses an empty lane.** A walk reading has no
  bypassed sites, so on HPRC the check fails any lane that draws nothing. SMN,
  the one walk-read case, is `unlisted` and gets no launch, so no checked launch
  meets this (2026-10-27). Write a walk criterion against a real lane if one
  appears.
- **An example is its locus's window as a locstring**, and the box recognises
  the text to title the answer and to drop the graph launch for a
  `graphCollapsed` locus.
- **Every dataset has the box.** Without a sidecar the box resolves the window
  against `graphBrowser.chromosomes` and offers the launches alone. Gene symbols
  go through mygene.info, whose coordinates matched all four references on
  2026-10-08 (cattle checked on BTNL2, RHOBTB2 and DEFB4A against bosTau9).
- **The url holds the question as `?region=`.** A window past
  `MAX_DETAIL_WINDOW_BP` (150 kb) gets the graph, plus the bubble lanes where
  the dataset has no callset, since a callset has no coarse tier.
- **The repo commits no panel.** `check-pangenome-launches` asks the live
  sidecar for each example's window the way the box does and boots what
  `regionLaunches` returns, so the check opens the urls the page offers. The
  unit tests use a fixed haplotype list.

### One rule decides how wide a window is drawn

`lanes()` in `website/src/components/pangenomeLinks.ts` picks the segment-level
lanes under `MAX_DETAIL_WINDOW_BP` (150 kb) and the coarse bubble tier above it.
A graph launch (`graphRegionUrl`) is one linear view: a compact gene row, the
segments track opened as its `LinearGraphDisplay` at 420 px, the callset's
haplotype matrix where the window can draw it (`drawsCallset`), then those
lanes. The graph comes first because lanes above it put the graph 732 px down a
900 px window, and 1,415 px down under Arabidopsis's SyRI rows.

- **The narrow lane is the bubbles.** The allele inventory, an AlignmentsTrack
  of one row per allele, showed nothing about which haplotypes have an allele
  and confused readers; the matrix shows exactly that. Mouse and Arabidopsis
  publish no callset, so their narrow lane is the bubbles alone.
- **The graph picks its tier by zoom**, past the adapter's
  `coarse.aboveBpPerPx`. The segments lane and the graph are one track, and a
  view shows a track once, so a graph launch has no segments lane and no tier
  lane. The graph's handover depends on the view's width: at 1000 px HPRC's
  graph stays fine to ~1 Mb, while a lane switched at 150 kb would already be
  coarse.
- **Every rGFA track in the four configs is a `GraphTrack`**, which opens as the
  graph, its first display, so a lane over one names `LinearBasicDisplay`. The
  plugin defines a GraphTrack's displays, not the config, so
  `pangenomeLinks.test.ts` checks every launch against the displays the plugin
  registers on it.
- **A chromosome is the widest region and takes the coarse branch**, so the
  whole-chromosome launch and the region launch are one builder.
- **A region has no upper bound.** A coarse cut has no bp cap, so the launch
  does not cap a window at the view's `maxRegionBp`.
- **The callset gets no coarse tier**, so `regionLaunches` offers no variants
  launch past `MAX_DETAIL_WINDOW_BP`, and the graph launch includes no matrix
  there. A VCF has no coarse tier, so wiring cannot change this.

### Every dataset's examples are curated

Mouse, cattle and Arabidopsis each offer seven named loci, in
`pangenomeMouseLoci.ts`, `pangenomeBovineLoci.ts` and
`pangenomeArabidopsisLoci.ts`, beside HPRC's 19 in `pangenomeLoci.ts`. A
catalogue derived by ranking each graph's coarse tier by segments per bubble
(9f4a5aa removed it) found real places and labelled them "Gm10439 +10",
"LOC790886" and "AT4G05215 +19". It never found a single-event locus (Nnt, Mx1,
POLLED, RPM1), each one allele in a quiet window with a segment count of 3 to 9.

Each curated window was measured on 2026-10-08 with ranged `tabix` reads of the
dataset's published `.bubbles.bed.gz`, `.alleles.bed.gz` and
`.tier10000.segs.bed.gz`, plus `.vcf.gz` for cattle and `syri_regions.bed.gz`
for Arabidopsis. Gene coordinates came from the UCSC REST API's `ncbiRefSeq`
track (mm39, bosTau9) and mygene.info species 3702 (TAIR10). No bubble crosses a
window's edge, the rule AMY1's comment states for HPRC. Each locus has its
measured sizes as comments, and each file lists the loci measured and declined
at the top.

Three traps when re-measuring a window against the published files:

- **The bubble and tier files name sequences in PanSN** (`mm39#0#chr4`,
  `bosTau9#0#chr6`, `TAIR10#1#Chr4`), and the allele files and the VCF use the
  bare name. A bare-name query against the bubble index returns nothing, which
  looks like a flat graph.
- **`tabix` on a url writes the `.tbi` into the working directory.** Run it from
  a scratch directory.
- **The mouse and Arabidopsis graphs record no per-haplotype membership.** The
  allele file's `firstSeenIn` is the first assembly, in build order, to add the
  node, so it can rule a strain out and never rules one in. Cattle's VCF records
  which breed has what, and so does Arabidopsis's sidecar, from each accession
  mapped back onto the graph.

**Known alleles: what each does, and the paper that says so.** Each dataset
lists its named alleles beside its loci (`HUMAN_KNOWN_ALLELES`,
`MOUSE_KNOWN_ALLELES`, …, typed in `pangenomeKnownAlleles.ts`). The list feeds
three places:

- **The page** names each allele in a window under 150 kb, with what it does,
  what the reference carries, its carriers counted live from the forms, and its
  papers.
- **The map, headline and change table** call a change by the allele's drawn
  name ("Celtic polled" for "ins 209bp", "Hp1" for HP's 1.7 kb deletion).
  `drawnChangeOf` matches a mark within 1 kb of the allele, in the same
  direction, within 10% of the size.
- **Every launch over an allele** opens a "Known alleles" track under the genes,
  a session track over `pangenome-config/<graph>/known-alleles.gff3`. Run
  `node generatePangenomeKnownAlleles.ts` after editing a list (a test fails on
  a stale file), then `upload.sh`.

The rules for adding one, after the first set (2026-10-23):

- **Cite a paper whose abstract or text states the claim**, checked on PubMed,
  and say no more than it does. A first reading of KIT's spotting allele had the
  insertion as the derived one; Jivanji et al.'s text puts the deletion on
  Herefords.
- **Read the span and the carriers off the sidecar**, and say which allele the
  reference carries. At HP, nonagouti, ASIP and KIT the reference carries the
  derived allele, so the map draws the ancestral one as a change, and `drawn`
  names that change: at HP the 1.7 kb deletion is Hp1.
- **Leave `drawn` empty where the map draws the allele in pieces.** GSTM1's 18
  kb deletion sits beside an 18 kb insertion of a copy on about 80 haplotypes.

**Catalogs open under the known alleles** (`pangenomeCatalogs.ts`), in launches
under 150 kb:

- **HPRC: the GWAS Catalog**, the copy the hg38 config mirrors beside itself
  (`gwasCatalog.bed.gz`, CSI), with UCSC's column names so a feature's details
  name its trait, paper and p-value.
- **Cattle: OMIA's variants**, which `generatePangenomeOmia.ts` writes from
  OMIA's current table into
  `pangenome-config/bovine-arsucd12/ omia-variants.gff3`. It places ARS-UCD1.2
  and 1.3 rows, whose chromosome sequences match (RefSeq version .1); 2.0 and
  UMD3.1 rows would need a liftover. 219 of 309 placed on 2026-10-23, and the
  script refuses under 150. OMIA states no license and asks to be cited, so the
  script writes only positions, genes, phenotypes, OMIA ids and PubMed ids,
  under a header line citing OMIA.
- **Mouse and Arabidopsis have none.** MGI places spontaneous alleles only to
  their gene, and AraGWAS's 859k SNP associations say nothing about structure.

Declined for want of a source or a single drawn change: C4 and AMY1 (copy number
over several forms), LPA, Ly49H (the −33 kb site ends inside Klra8 and no paper
places it), FLC (which intron-1 insertion is the Ler-type one), and the
Arabidopsis knob (no bubble).

The windows below were measured the same way and are not offered; any of them
can swap in. The columns are the bubble index's rows in the window, allele rows
of 1 kb or more, the largest allele row, and the segments in the largest
coarse-tier bubble (blank where none reaches the tier's 10 kb floor):

| dataset     | id      | window                       | bubbles | ≥1 kb | largest     | top bubble |
| ----------- | ------- | ---------------------------- | ------- | ----- | ----------- | ---------- |
| mouse       | `rd1`   | chr5:108,520,000-108,590,000 | 19      | 1     | 8,647 ins   |            |
| mouse       | `mup20` | chr4:61,860,000-61,990,000   | 4       | 12    | 81,139 del  | 30 seg     |
| mouse       | `raet1` | chr10:21,955,000-22,093,000  | 28      | 13    | 73,095 ins  | 25 seg     |
| mouse       | `h2-ea` | chr17:34,500,500-34,620,000  | 30      | 4     | 7,833 del   |            |
| mouse       | `amy2`  | chr3:113,098,000-113,335,000 | 2       | 18    | 127,314 del | 121 seg    |
| cattle      | `lyz`   | chr5:44,205,000-44,345,000   | 11      | 9     | 69,315 del  | 32 seg     |
| cattle      | `ulbp`  | chr9:84,665,000-84,795,000   | 6       | 4     | 109,893 del | 25 seg     |
| Arabidopsis | `rps5`  | Chr1:4,135,000-4,157,000     | 10      | 5     | 6,065 ins   | 8 seg      |
| Arabidopsis | `maf`   | Chr5:25,970,000-26,010,000   | 7       | 10    | 15,980 ins  | 41 seg     |
| Arabidopsis | `aop`   | Chr4:1,335,000-1,365,000     | 7       | 9     | 22,087 ins  | 46 seg     |
| Arabidopsis | `acd6`  | Chr4:8,280,000-8,313,000     | 13      | 10    | 5,902 ins   | 47 seg     |
| Arabidopsis | `rps4`  | Chr5:18,295,000-18,340,000   | 8       | 9     | 13,774 del  | 73 seg     |

Mouse `amy2` is one 225 kb bubble (113,101,029-113,326,354), so it would be a
third coarse-tier example. Cattle `polled` is the smallest event offered: one
202 bp record in a 1.9 kb window.

**A locus window has to keep its event above the graph's fold.**
`LinearGraphDisplay` folds every variant narrower than 10 px into the reference,
so a 60 kb window on an 1,800 px view folds at 325 bp. `polled` shipped that way
and drew its 202 bp insertion as one straight 60 kb segment (2026-10-21). Size a
single-event window at most 50 times its event's length.

### What a launch must show, from the 2026-10-08 audit

An audit opened all 202 links the four pages then offered on `main`, at 1400 by
900, and timed each until its screenshot stopped changing. Medians to drawn were
variants 1.7 s, graph 2.5 s, bubbles 2.5 s, a whole chromosome 3.2 s, haplotype
lanes 4.7 s and BandageJS 5.3 s; the slowest link that drew took 7.0 s. The
problems were in what the links showed, and each finding below is a rule in
`pangenomeLinks.ts` or a flag on a locus:

- **`callsetBlank` on a locus drops its variants launch**, for the example and
  for a typed window that overlaps it, the way `graphCollapsed` drops the graph.
  The matrix was a flat grey block at AMY1, MNS, PRSS, UGT2B17 and NPHP1, whose
  records of 50 bp or more are absent or too small to draw at the window's zoom.
  At SMN the callset had no record at all and the track never left "Loading…";
  after three minutes the browser crashed. A window nobody curated can still
  land on such a hole.
- **SRGAP2, DEFB (8p23.1) and SMN1 / SMN2 are not HPRC examples.** Every launch
  of SRGAP2 and DEFB showed nothing: a 5-node and a 7-node graph, a blank or
  hung matrix, and no panel or one lane. The callset has no record between
  chr8:7,546,668 and 8,096,808. SMN's one launch drew 4 of 8 lanes, the
  commonest labelled "a rarer change at 1 site", over 24 forms.
- **A dropped example stays in `PANGENOME_LOCI` as `unlisted`.** A typed window
  reads `graphCollapsed` and `callsetBlank` off the loci, so deleting a locus
  gives a typed window back the launch that hangs. HPRC offers 19 examples.
- **The BandageJS link names `maxNodes=40000`.** MHC class II (33,010 nodes) and
  KIR (23,021) stopped on BandageJS's "over the 20,000 this page draws by
  default" question, and draw in 14 s and 7 s once past it. LPA is 19,465.
- **A window over 10 Mb opens no gene lane** (`MAX_GENE_LANE_BP`). The lane was
  a "Too many features" banner on 58 of 78 whole-chromosome launches, and the
  graph labels its own genes at that zoom.
- **Arabidopsis's knob offers no graph launch** (`graphCollapsed`). The graph
  has no bubble for the inversion and drew a straight line; the Bubbles launch
  shows the inversion in SyRI's rows. The flag applies to a wide window only
  when the locus covers all of it, so Chr4 still opens as a graph.
- **The variants launch opens two UCSC tracks under the matrix, not four.** The
  insertion and deletion tracks were mostly 1 bp records and their labels, and
  pushed the inversion and duplication tracks off a 900 px window.

Arabidopsis RPP5 (1,207 nodes) and RPP1 (1,130) and cattle DEFB (1,114) draw as
dense knots; the audit left them as they are.

Screenshotting launches in parallel needs one browser per worker, since a
background tab does not paint. A display's `isLoading` shows whether a track is
still fetching.

### Removed from the pangenome pages

The page was 15,286 px rendered, and ~10,000 px of that was a static 232-row
HPRC sample table plus two mouse-strain tables. `/hubs/HPRC` is a searchable
version of the first, and the accession pages cover the other two. All three are
links now, and HPRC renders through `[dataset].astro` like the others.

None of these is worth rebuilding as it was:

- **The per-locus MSA panel** (`generatePangenomeMsa.ts`, `PangenomeMsaSection`,
  `MsaPanel`) reconstructed 465 haplotypes over one 800 bp window per locus. It
  was 8.1 MB of the 8.4 MB committed under `public/pangenome/`, HPRC-only, and
  its first paint on the headline locus was 465 rows of dashes, because the
  window picker ranked by indel-weighted variation and landed inside a `GAA`
  expansion that one haplotype has.
- **The pangene copy-number matrix** (`generatePangenomePangene.ts`,
  `PangeneMatrix`) drew 100 haplotypes from lh3's `human100` graph under charts
  computed over HPRC's 232 samples. It mixed two cohorts at one locus, and only
  the caption said so.
- **`/pangenomes/explorer`**, a card grid of loci with class filters and a
  per-locus dashboard of four bar charts over the callset, with the per-locus
  `*.vcfsummary.json` summaries, the `notes[]` caveats, the per-locus
  `significance` sentences and the PangyPlot fallback (`externalGraphBrowser`).

### A locus's haplotypes are lanes, and the callset picks which

The Haplotypes launch (`haplotypeLanesForRegion`) opens the
`hprc_v2_1_walk_lanes` track (`WalkTabixSyntenyAdapter` over the walk files at
`walksUri`), one lane per haplotype walk, narrowed to the window's panel. The
panel is one haplotype per structural **form** in the window, commonest first:
every form where there are at most 10, and the commonest 8 otherwise. The spec
holds the panel as `rows.kept` and `rows.sort`, so one track in the config
serves every window. The walk files take 5 requests a window where a gbz-base
track took 23 to 57.

**The forms come from a genome-wide sidecar, not from a per-locus read of the
callset**, so the box can answer the same question for a window nobody curated.
`website/pangenome-config/buildHprcSvStates.sh` publishes one tabix-indexed file
of every structural record in the callset, 19 MB for the genome. Each row holds
where the record is, what each state does to the reference's structure, and one
character per haplotype. `structuralForms` (`pangenomeSvStates.ts`) groups a
window's haplotypes out of a ranged read of it, a few KB and about 300 ms. The
box on the page (`PangenomeRegionBox.tsx`) runs it and `structuralPanel`
(`pangenomePanels.ts`) in the reader's browser for an example, a locstring or a
gene symbol, over a window of up to 150 kb, and `check-pangenome-launches` runs
the same two functions over each example before booting it. An example and the
same window typed in the box therefore get the same answer, because both go
through the same two functions. `agent-docs/reference/PANGENOME_PORTAL.md`
records why the panel uses 10 and 8, why it skips the callset's `LV=0` records,
and the measurements behind each sidecar rule.

The sidecar's rows since format `v2`:

- **The removed parents are rows.** The build reads each from the release's 24
  GB `raw.vcf.gz` by a ranged query over its children and keeps its allele
  lengths: 426 snarls, 422 rows. A parent called in fewer than `MIN_CARRIERS`
  haplotypes gets no row, which drops defb's 5.2 Mb one.
- **A restored row states what its children do not.** Its allele sums every
  child's, so each haplotype's size change has the changes at the rows directly
  under it taken out, and what remains under 1 kb (`RESTORED_STRUCTURAL_BP`) is
  the reference's structure.
- **`_` is a no call under a snarl that calls the haplotype, `.` one that no
  snarl above calls.** `_` has no size of its own; the parent's row has it.
- **A rare state folds into its site's majority, except a call into a no-call
  majority**, which stays apart as `~` and reads "a rarer change".
- **The object name includes the format** (`…sv-states.v2.tsv.gz`), and the
  build copies to the bucket and never syncs, so the file deployed pages read
  stays. Bump `FORMAT` in the script and `svStatesUrl` together whenever a row's
  meaning changes, and upload before deploying the reader.

Cattle has a sidecar in the same format, from
`website/pangenome-config/buildBovineSvStates.sh`
(`…/bovine-arsucd12/sv-states/bovine-arsucd12-minigraph.sv-states.v2.tsv.gz`,
2.6 MB, 153,334 rows, built 2026-10-20):

- **Each assembly is one haplotype**, named by its code (`ANG`, `YAK`), because
  `vg deconstruct` writes one haploid column per assembly. The packer reads it
  with `--haploid`.
- **The build keeps only top-level records.** `vg deconstruct -a` writes every
  nested snarl beside its parent; none of the 11,441 nested records lacks one,
  so nothing is restored and every no call is `.`.
- **An inversion is an ALT whose traversal walks a node backwards**
  (`invertedAlleles`, `--traversals`), since minigraph writes no INV flag: 196
  rows.
- **A form needs 1% of the haplotypes, at least one** (`minCarriersFor`): HPRC's
  462 give 5, cattle's 11 give 1. With HPRC's 5, a yak-only deletion would fold
  into the majority.
- **A focused row opens no lanes and cuts no graph**: cattle has no lane track
  and no walk file, so "Open in JBrowse" stays on the first launch.

Arabidopsis has a sidecar in the same format, from
`website/pangenome-config/buildArabidopsisSvStates.sh`
(`…/arabidopsis-tair10/sv-states/arabidopsis-tair10-minigraph.sv-states.v2.tsv.gz`,
689 KB, 32,796 rows over 26 accessions, built 2026-10-20):

- **The graph records no paths, so the build maps each accession back onto it**
  with `minigraph -cxasm --call`, and minigraph's own `mgutils.js merge` and
  `mgutils-es6.js merge2vcf -r0` turn the 27 call files into one VCF: one row
  per bubble, one haploid column per accession, TAIR10's column dropped. The 27
  calls took 80 minutes on ada, two at a time with 6 threads each.
- **The alleles are symbolic**, so the packer reads each allele's length from
  `ALEN` (`--symbolic`) and its walk from `AWALK` (`--traversals`): 102
  inversion rows.
- **Bubbles do not nest**, so every row is kept. 9 overlap the row before, and
  each starts at that row's end segment.
- **Col-0.6909, TAIR10's own accession, is the reference's structure at 32,603
  rows**, which is the check that the columns line up.
- **A focused row opens no lanes and cuts no graph**, as on cattle: the SyRI
  lanes are not a per-haplotype lane track, and there is no walk file.

Mouse has a sidecar in the same format, from
`website/pangenome-config/buildMouseSvStates.sh`
(`mouse-mm39-minigraph.sv-states.v2.tsv.gz`, 7.4 MB, 433,036 rows over 18
strains, built 2026-10-21):

- **Each strain's chromosome is called against that chromosome's graph**, the
  files `build_mouse_pangenome.sh` built the graph from: 379 calls took 4 h 52 m
  and 34 CPU hours on ada, eight at a time with 2 threads each.
- **The build shifts each chromosome's segment ids by its rank times
  10,000,000**, as the published rGFA numbers them, so a row's id names segments
  of `mouse-mm39-minigraph.rgfa.gz`.
- **C57BL_6J_T2T, mm39's own strain, is the reference's structure at 98% of
  autosomal rows**, the check that the columns line up. Its assembly has no
  chrX, so the build writes its chrX calls as no calls.
- `minigraphSvStates.sh` holds the merge and packing steps the mouse and
  Arabidopsis builds share.

A lane draws its haplotype's gene models when the config has a track declared
for that haplotype's assembly alone, which is the rule `MultiWaySyntenyDisplay`
applies; there is no spec key for it. So every HPRC release 2 haplotype is an
assembly in `hprc-grch38.json`, and each of the 462 that CAT annotates has a
gene track (HG002's two have none). Two scripts keep it that way:

- **`website/generatePangenomeHaplotypes.ts`** writes the haplotype half of the
  config and each assembly's `chrom.sizes`, read off the release 2 assembly's
  `.fai`. Measured with all 465 assemblies on 2026-09-17, the haplotypes add
  ~0.1 s at boot and 19 KB gzipped, and nothing per launch beyond the lanes it
  opens, because jbrowse-web loads an assembly only when something reads it.
- **`website/pangenome-config/buildHprcGenes.sh`**, on the build box, reduces
  each CAT annotation to one transcript per named gene as BED12
  (`generatePangenomeGeneModels.ts`) and publishes it under
  `jbrowse.org/pangenome/hprc-grch38/genes/`, ~2 MB a haplotype (the sizes are
  in PANGENOME_PORTAL.md). It keeps what it has built.

Then `upload.sh` publishes the config. `pangenomePanels.test.ts` fails if a
haplotype the lane track maps has no gene track, other than HG002's.

Two things keep the lanes drawing, and when either breaks the lanes disappear
with no error:

- **A haplotype the track maps to an assembly must be that assembly's alias.**
  The launch filters by PanSN prefix (`HG00099#1`) and the adapter names a
  mapped lane after the assembly (`HG00099.1`); only an alias lets the display
  match the two as one lane. Without it the CFHR panel drew 6 of 8.
  `pangenomeLinks.test.ts` pins it against the config.
- **`pnpm check-pangenome-launches` reads the lanes back**, lane by lane, rather
  than the display type, which passed on 2026-09-17 while every lane on every
  host errored. That fault was in the graph plugin, which read
  `@jbrowse/synteny-core` from a host global the RPC worker serves as UI stubs,
  and a stub stringifies to `''` (fixed in the plugin, `5d05a20`). The check's
  `--local` pauses only the urls it substitutes: puppeteer's request
  interception stalls every request the worker makes, so under it no track data
  loads and a lane check can only fail. The check also fails a lane whose
  haplotype has a gene track and reads "no annotation" or never fetches its
  genes, which is how an unpublished `hprc-grch38.json` shows up without
  `--local`.
