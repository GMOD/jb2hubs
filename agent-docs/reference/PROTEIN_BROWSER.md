---
name: protein-browser
description:
  'The /protein-browser landing page: the two residue-to-codon mapping bugs,
  which structure APIs are asked and why, how launches are verified.'
---

# The protein browser as a landing page

Written 2026-09-01, after reviewing `/protein-browser` against the paper it
demonstrates ("Proteins in the Genome Browser", Diesh et al., J. Mol. Biol.
2026, `~/proteins.pdf`) and against the two plugins it launches
(`jbrowse-plugin-protein3d`, `jbrowse-plugin-msaview`). The page is meant to
become the landing page for that work: type a gene, get a connected genome +
alignment + structure session with no setup. This note records what was wrong,
what the session now carries, and which decisions are load-bearing.

## Two mapping bugs the unit tests could not see

The paper's central claim is the residue ↔ codon mapping. Two defects broke it
on two of the eight example chips, and every unit test passed throughout —
because the tests assert the session we emit, and both faults were in what the
plugin then did with it.

**The isoform pick never matched.** `pickCanonical` compared the gene_table's
per-transcript length to the UniProt canonical length, but gene_table's coding
intervals include the stop codon, so a 393-residue protein was listed as 394.
Measured live on 2026-09-01: TP53, EGFR, NOTCH1, BRCA2, PAX6 and DMD all had
zero transcripts at the UniProt length and one or more at UniProt+1. Every gene
fell through to "longest curated", which for PAX6 is a 504-residue isoform while
the AlphaFold model is the 422-residue canonical.

**The ProteinView was handed the wrong sequence.** The plugin's
`userProvidedTranscriptSequence` is the translation of the connected
transcript's CDS; it pairwise-aligns that against the structure's residues so a
structure of a different isoform still lands on the right codons. The page
passed the UniProt canonical — the structure's own sequence — so the alignment
was an identity and the g2p mapper indexed the CDS with a protein of the wrong
length. Wherever the picked transcript was not the canonical isoform, hovering a
residue lit the wrong codon, silently. The 100-way arm was correct by accident:
it passes the knownCanonical row's translation with the knownCanonical CDS.

Both fixed in `geneStructure.ts`: `parseGeneTableBlocks` keeps the protein
accession its header already matched (and discarded), `fetchSelectTranscripts`
asks `product_report` which transcript is MANE Select / RefSeq Select,
`orderIsoforms` puts it first, and `fetchProteinSequence` fetches that NP record
as the translation. `aaLength` now excludes the stop codon. The structure's own
sequence is no longer fetched from UniProt at all — the AlphaFold API returns it
per model.

Note what MANE-first means for PAX6: the MANE Select is the 436-residue isoform
b, the UniProt canonical is the 422-residue isoform a. Asking AlphaFold's API
rather than assuming `-F1` turns out to matter here too: it has an isoform model
`AF-P26367-2-F1` folded from exactly the 436-residue translation, so
`pickAlphaFoldModel` takes that and the mapping is an identity (verified by
`check-protein-launches`, which asserts `exactMatch` for it). Where no such
model exists the plugin aligns what it can and says so; the isoform picker on
the card is how a reader gets the canonical isoform instead.

## The exon table names the assembly it is on

NCBI places a gene on every assembly it annotates, and the `gene_table` exon
coordinates are on one of them, which need not come first: zebrafish tp53 is
placed on GRCz12ab and GRCz12tu, 386 kb apart on their chromosome 5s, and its
table is GRCz12ab's. Until 2026-09-24 the page opened the first hosted
placement, so a tp53 session on GRCz12tu lit every codon on the wrong bases and
nothing failed. `geneTableReference` reads the sequence off the table's header
(human and mouse write
`Reference GRCh38.p14 Primary Assembly NC_000017.11 … from:`; yeast, fly, worm
and plant start at the accession), and `tablePlacement` opens the placement on
that sequence. A table on a sequence no placement names is refused, since no
assembly would put its coordinates on the right bases.

## A structure is asked for, not assumed

`AF-<accession>-F1-model_v6.cif` is derivable for most proteins and wrong for
two kinds: the version moves (`_v4` already 404s), and a protein past
AlphaFold's length cap has no F1. Human dystrophin (P11532, 3,685 aa) has
fourteen isoform models and no canonical one, so the DMD chip named a 404 and
its card said "opens the AlphaFold structure". Titin has nothing.

p2s_mapper (since 1.4.0 the page keeps no copy) asks the AlphaFold API and
3D-Beacons, both `access-control-allow-origin: *`, measured 2026-09-01:

- **AlphaFold prediction API** (`/api/prediction/<acc>`) — every model for the
  accession with url, version, sequence and mean pLDDT. `pickAlphaFoldModel`
  takes the model folded from exactly the transcript's translation (identity
  mapping) if there is one, else the canonical, else the longest isoform. The
  API answers node's default user-agent with 403; browsers are fine, and the
  launch checker sets a UA.
- **3D-Beacons** (`/pdbe-kb/3dbeacons/api/uniprot/summary/<acc>.json`) — every
  experimental entry with the UniProt range it covers and its resolution. TP53
  returns 348 structures: 322 PDBe, 20 PED, 4 SWISS-MODEL, 1 AlphaFold, 1
  AlphaFill. **Filter on `provider === 'PDBe'`**, not on
  `model_category === 'EXPERIMENTALLY DETERMINED'`: SASBDB's small-angle
  scattering fits are filed as experimentally determined too, with numeric ids
  and near-total coverage — dystrophin's best "structure" by coverage was
  SASBDB 436. The plugin takes the PDB id (`pdbId` shorthand → RCSB mmCIF) and
  fetches the SIFTS UniProt mapping itself. `fetchExperimentalStructures` reads
  the summary **unfiltered** and retries once: the `?provider=pdbe` form
  answered BRAF, HBB and BRCA2 with a 404 about one time in three on 2026-10-09,
  which reads as no entries, so an unlucky load offered BRCA2 no structure at
  all. The unfiltered form answered all fifteen asks.

The card offers the AlphaFold model first and the six best-covering PDB entries
after it, plus any entry a chip or a link names wherever it ranks. The session
names the model by `uniprotId`, not by its file: the plugin asks the same API
and picks the model folded from the launched translation, as the card does, so a
saved link survives the next model version where a `_v6` url would 404 as `_v4`
does now. An AlphaFold model opens coloured by its own pLDDT (the ProteinView's
`plddt-confidence` scheme), so a residue AlphaFold could not place reads as
such: BRAF V600 is at 49. A PDB entry covers a fragment; the pairwise alignment
in the plugin is what makes that fragment land on the right codons, which is the
same mechanism the isoform mismatch relies on.

## Superposition went with the ortholog cartoon

Until 2026-10-09 the page drew a domain cartoon of up to 60 orthologs (NCBI's
ortholog report and CDD, PANTHER for fly, worm, yeast and plant), aligned them
at EBI with Clustal Omega, and let a row with a Swiss-Prot accession be marked
for superposition on the query's structure. All of it was cut as the page's
busiest and slowest part: the InterPro map shows the query's domains, and the
100-way or UniRef carries conservation. `buildSessionUrl` still takes
`superposed` structures, and the plugin superposes (TM-align) whenever more than
one is loaded, so a future page can offer it from elsewhere.

## Other launch options, and where each is decided

- **Variant tracks.** `pickVariantTracks` in `genomeTarget.ts` opens
  `<db>-clinvarMain` and `<db>-alphaMissense` where the config has them (hg38
  and hg19 today), which is the pairing the paper's BRAF V600 case study is
  built on. They are always on; the reader can close them in JBrowse.
- **Isoform.** Every coding transcript the gene_table lists, representative
  first. Switching fetches that NP record and rebuilds the session; the launch
  link is disabled while it does. The Pfam seed and the 100-way fix the
  transcript, because the msaview plugin maps the query row's residues to codons
  by position: the translation a seed row was cut from, or the 100-way's
  knownCanonical model. So picking another isoform switches the alignment to
  NCBI's ortholog set or UniRef, which the plugin builds from the launched
  translation.
- **Which isoform leads.** MANE Select exists for human alone and RefSeq Select
  for few others: zebrafish tp53, zebra finch FOXP2 and fly Dscam1 carry neither
  (2026-10-09). Without a flag, the isoform the gene's UniProt entry describes
  leads (`leadWithEntry`), its canonical first, and only then the longest
  curated one, which was the whole rule before and opened Dscam1's 2,034-residue
  isoform against UniProt's 2,016.

## The session is built for `main`

Every launch on the site goes to `main` (`JBROWSE_BASE` in
`website/src/config/jbrowse.ts`), and the session `proteinSession.ts` emits
assumes what `main` has: it rides in the url hash
(`#config=…&session=encoded-…`, never sent to a server, so no request line
limits it), it carries the workspace layout tree that tiles the structure beside
the genome and alignment views, and it opens the full-resolution NCBI GFF3 gene
track where that is the only one. Until 2026-09-12 the page also served the
released v4.3.0, which reads no hash, has no layout tree, persists a session's
`useWorkspaces` into the reader's localStorage, and labels the GFF3 with UUIDs;
three host flags, a gene-track host route and an 8 KB query-string budget with a
seed-thinning fit behind it worked around that, and all of it is gone. A seed is
still placed against a budget, 250,000 FASTA characters (`SEED_BUDGET`), which
no family on the example chips reaches. Point `JBROWSE_BASE` at `latest` once
v5.0.0 publishes.

The ClinVar and AlphaMissense tracks depend on a file this repo generates rather
than on the host: `genomeTarget.ts` reads a UCSC assembly's track ids off
`/ucsc/<db>/minimal.json`, so a track absent from
`ucsc2jbrowse/src/createMinimalConfig.ts`'s `MINIMAL_TRACK_PATTERNS` is one the
launch cannot open however the full config names it. `alphamissense` was missing
until 2026-09-01, which is why a launch opened ClinVar alone. The pattern is in
the list now; `configs-minimal/hg38.json` and `hg19.json` carry the track only
after the pipeline regenerates and re-uploads them.

## The session opens on something, and the page is where that is chosen

Added 2026-09-11. Until then a launch opened on everything: the whole gene, the
whole structure, a hundred-row alignment from column one, with the reader left
to find the residue they came for in three views of it. The complaint that a
JBrowse session is busy is mostly this. The views are as complex as they are,
but a session that opens with one range lit in all three, and an alignment
scoped to the question the reader asked, reads as an answer rather than as a
workspace. The `molstar-harness-proto` case studies were the model here — each
one a sentence, two panels, and one mechanism — and so was William Pearson's
advice about searching: a narrow database chosen on purpose beats all of them.

Three things carry this:

**A protein map** (`ProteinMap.tsx`, data in `proteinFeatures.ts`): the query
protein end to end, from two services that answer by UniProt accession with
cross-origin headers. InterPro's `entry/all/protein/uniprot/<acc>` gives every
member-database match integrated into InterPro entries; the map keeps the
entries typed `domain`, `repeat` and the site types, drops `family` and
`homologous_superfamily` (they span the protein and say nothing about where to
look), and keeps only the Pfam accession under each, because that is the member
with a seed alignment. An unintegrated Pfam match stands on its own; an
unintegrated CDD or SMART one does not. PDBe-KB's
`graph-api/uniprot/interface_residues/<acc>` gives every residue seen touching
another molecule in any PDB entry, grouped by partner, with the entries it was
seen in. Measured 2026-09-11: InterPro answers TP53 in 13 KB and NOTCH1's 117
regions in two pages; the interface list is 496 KB for TP53 (56 partners, 12
kept) and 504 KB for HBB, 9.5 KB for zebrafish tp53 — so it is read when the
reader asks, or when a chip's preset names a partner. Both sets of coordinates
are on the UniProt canonical sequence.

**A focus** (`Focus` in `proteinFeatures.ts`): a region of the map, or a residue
typed into the box. The card sends it as the plugin's
`initialTranscriptResidues`, 1-based residues of the launched translation, and
the plugin carries those onto whichever structure opens through its own pairwise
alignment. One numbering therefore serves an AlphaFold model, a PDB fragment,
and haemoglobin's crystals, whose chains count from the mature protein (Glu7 of
the translation is residue 6 in 2HHB and 1A00). An interface focus sends its
contact runs, the ones the map draws (`residueRuns`, which bridges gaps of up to
two residues), not one span from its first contact to its last: TP53's 165
homo-oligomer contacts make 15 runs of 201 residues between 17 and 356 (PDBe,
2026-09-25), where the span would be 340, and 6XRE lights all 201.

The map's regions and a typed residue are numbered on the canonical, which
`GeneStructure.canonical` holds as UniProt serves it. Not the canonical
AlphaFold model alone, which a gene may lack, and never the translation: MANE
and the canonical differ for KMT2A (3972 and 3969 residues), PLEC and TTN, and
reading one as the other sent KMT2A's WDR5 interface with 34 of 37 residues
wrong. Where the canonical is not the launched translation, `translationRanges`
carries the ranges across, and the card says so.

`translationRanges` aligns the two end to end (p2s_mapper's
`sharedIsoformResidues` since 2026-10-10, which the protein3d plugin's 1D view
now applies too) and carries a residue only inside a stretch the two share
letter for letter: a stretch of ten or more, or of three or more bounded on both
sides by a gap or a sequence end, the shape a short shared exon takes (VEGFA's
six-residue exon 8a, which binds NRP1). A lone substitution between two such
stretches carries too, as one codon UniProt and RefSeq read differently.
Measured 2026-09-25 against codon identity on the genome, over every isoform of
TP53, PKM, CDKN2A, FGFR2, TPM1, BRAF, EGFR, SCN8A, MAPT, BIN1, VEGFA, TPM3 and
CD44 (89,927 residues truly shared): this rule places 335 residues wrongly and
misses 28; every identical residue, 1,885 and 28; long stretches alone, 328
and 64. The local alignment the first version used placed 2,982 wrongly and
missed 30 on the first seven genes, one EGFR isoform's far end among them. What
the rule still places wrongly are paralogous mutually exclusive exons (PKM's 9
and 10 share an 8-residue stretch, FGFR2's IIIb and IIIc another) and the
residues where such an exon meets a shared one; what it misses are single
residues at exon junctions, where the gap fits either side. On CDKN2A, p16's
residues carried onto ARF, read in another frame, went from 85 to 1.

One caption still reads "approximate": a pair too long to align (TTN). Before a
launch the card can also say a PDB entry misses the focus altogether, from the
UniProt span 3D-Beacons lists for it.

Until 2026-09-25 the card sent `initialSelection` (0-based structure positions,
exact only for the canonical AlphaFold model folded from the launched
translation) or `initialResidues` in the entry's author numbering, which it
worked out from PDBe's SIFTS mapping before enabling the link. The plugin
resolves both through the same alignment now, so the SIFTS read, its retry and
its "reading how the entry numbers its chains" wait are gone.

A focused partner also changes the structure: the first PDB entry the two were
seen in together opens instead of the monomer, with the partner's chain loaded —
the protein3d plugin loads every polymer entity, maps the transcript onto the
one whose sequence explains it, and offers the rest in its chain picker. The
launch link waits for the PDBe list that names the partner's complex, as it does
for an isoform's translation.

**An alignment chosen by the question.** A focused domain, or a residue inside
one, opens the Pfam family's **seed**: the curated few dozen sequences the
family's HMM was built from, spanning its whole taxonomic reach, hand-aligned,
and the domain alone. InterPro serves it per family
(`wwwapi/entry/pfam/<PF>/?annotation=alignment:seed`, gzipped Stockholm, 4–15
KB, 0.1–14 s) and the tree Pfam distributes for it is hosted beside the msafam
demo (`jbrowse.org/demos/pfam/trees/<PF>.tree`), leaves named exactly as the
rows. With no focused domain the session carries this protein's orthologs
(`loadOrthologs`): the 100-way, one indexed read, for a human gene with a row in
it; else NCBI's ortholog set, one curated gene per species, where NCBI lists at
least three (vertebrates and insects), asked first because the plugin fails
inside the session with fewer; else the UniRef50 cluster across UniProt's
reference proteomes. The last two are built by the plugin in the browser on
open, from the launched translation. PANTHER, which covers plants, fungi and
worms, is not offered: whether it has the gene is known only by asking it for
the orthologs, and a failure lands inside the session. The page picks; there is
no control. Until 2026-10-09 it offered five sources by radio button, phmmer and
the EBI Clustal Omega panel among them, and drew the chosen one in an embedded
react-msaview.

### Putting the query into a seed

The seed does not contain the query, so `pfamSeed.ts` puts it in. Every seed row
is a domain segment. The translation is aligned locally against each row's
ungapped segment (Smith-Waterman, BLOSUM62, gap open 11 extend 1 — a few million
cells, 15–670 ms on the four focused chips) and projected through the
best-scoring row onto the seed's columns: a residue aligned to a row residue
takes that residue's column, a residue the row lacks opens a column every other
row gaps. The search is windowed to the InterPro fragment ± 40 residues, so a
titin-sized query does not cost a full matrix per row, and a miss is reported
rather than guessed.

A miss needs a bar, because Smith-Waterman returns its best positive cell
whether or not the domain is there, and one W–W pair scores 11. Since 2026-09-24
the best hit has to reach an E-value of 1e-3 under BLAST's gapped statistics for
BLOSUM62 at these gap costs (λ 0.267, K 0.041), taking the window against every
seed row as the search space, and has to span half its anchor row. On the four
focused chips' families the real placements score 96 to 1,042 at E 7.5e-8 or
less; shuffled translations, and SOD1, which has none of these domains, reach
1.2e-2 at best, and a shuffled globin 2.9e-4. Under the bar `placeQuery` throws
rather than linking a few chance residues to the genome as the domain, and the
session falls back to the orthologs, with the launch button's tooltip saying
which seed was refused and why: the refusal is the same on every retry. Only a
refusal falls back (`SeedRefused`, also thrown for a family with no seed). A
timeout or a server error shows with a retry instead, because SWR caches
whatever the load returns: until 2026-10-10 an InterPro blip on NOTCH1's EGF
focus launched the 100-way for good, with nothing said.

The query row is the aligned segment alone, named Pfam-style (`TP53/99-289`),
and the session's MsaView says where in the translation it starts: its
`querySeqOffset` is the residues before the row's first, and its
`connectedFeature` is the whole transcript. The msaview plugin counts the row's
residues from that offset, so the mapping holds exactly, and residues outside
the segment map to nothing — which is right, the alignment does not have them.
Until 2026-10-08 the page cut the transcript's CDS to the segment's codons
instead (`sliceCds`, phases recomputed), which the offset makes unnecessary; the
plugin's `test/sessionSnapshot.test.ts` pins the offset's behaviour. The first
draft carried the whole translation as the row, flanks as columns of gaps in
every other row, and NOTCH1 is why it did not survive: 67 EGF seed rows of 50
columns became 67 rows of 2,600, 174 KB against the segment's 4.9 KB.

Where the query protein is itself a seed member — P53_HUMAN is in PF00870 — its
row is replaced rather than duplicated and the tree leaf renamed, matched on the
`#=GS AC` accession; elsewhere the query is grafted as a sister of its anchor at
zero length, which is the honest placement for a row aligned through that
anchor. A seed that will not fit is thinned to the rows the query aligns best
to, anchor first, and its tree is pruned to them (`pruneNewick`: a dropped leaf
takes its edge, a node left with one child collapses into it with the lengths
summed). The launch button's tooltip says both.

What "fit" means is `SEED_BUDGET`, 250,000 characters of FASTA. Until 2026-10-08
it was 45,000, on the belief that the msaview plugin drops a snapshot field over
50,000 characters, and BRAF's kinase domain (PF07714, 111 rows × 481 columns)
kept 87 rows. The plugin leaves such a field out of a session it writes, not out
of one it reads: a 120,000-character alignment in a session link loads whole and
is kept in IndexedDB (the plugin's `test/sessionSnapshot.test.ts`). What a
larger seed costs is that a link shared again from inside JBrowse reopens it
only in the browser that built it. A thinned seed is still the family where a
dropped one is nothing.

The session's MsaView takes `highlights`: a residue focus inside the segment,
marked and labelled on the query row. `markFocus` places it from the focus as
carried onto the translation, the same selection the genome and structure get,
because the segment counts on the translation and the focus on the canonical.
Until 2026-10-10 the mark read the canonical number: on PAX6, whose MANE isoform
has 14 residues more ahead of the paired domain, residue 100 lit in the genome
and structure and the seed marked another residue 14 away. The mark is added at
launch rather than baked into the placed seed, so a new residue no longer
re-reads the seed and its tree.

### Quieter sessions

The genome view opens without its overview bar and gridlines
(`hideHeaderOverview`, `showGridlines: false`), reading a minus-strand gene
5′→3′, and the card hides the protein view's pairwise panel
(`showAlignment: false`) when the structure is the translation's own fold — an
identity alignment is a wall of matches with nothing to read, while the same
panel on a crystal or another isoform is what says which residues are missing.
Both are always on. Neither is a different session; both are fewer things on
screen.

### The card says less than it decides

The rule is the molstar-harness one: a row appears only where there is a choice,
and a caption only where the launch differs from what the row reads. Expect
"busy" to be the first review comment on any new control or caption, and default
to leaving it out: the page shed a three-line lede, a boxed story, a form of
four rows, a row of checkboxes, three captions and a how-to paragraph one pass
at a time, and on 2026-10-09 the ortholog cartoon, the embedded alignment, the
alignment choice, the Options and More info folds and the session-details
dialog. What the page holds:

- The gene, its transcript only where there is no isoform select to name it,
  then the assembly and strand. Exon count and CDS length went, since they are
  information rather than decisions.
- **Isoform** where the gene has more than one, **Structure** when there is a
  UniProt entry, and **Opens on**: the focus chip, or, while nothing is focused,
  the residue box, the one way to type a focus (the map is the other). The
  chip's caption appears only in the approximate and missing cases; lit on load
  in all three views is the expected case and goes unsaid.
- The launch button, whose tooltip names the alignment the session carries and
  any caveat about it, and under it an alignment that failed to load.
- The map, with nothing under it. Domains always, one block where InterPro has
  several entries for one place (`collapseRedundant`: EGFR's kinase was three
  lanes; every Pfam-bearing entry stays, since a chip may name it). Sites,
  partners and ligands are lanes whose name loads them, since sites are already
  in the InterPro answer and the other two are half-megabyte PDBe reads, and the
  first block that appears takes keyboard focus from the name that went. A block
  under 5% of the protein carries no label, because at that width a label is an
  ellipsis (NOTCH1's thirty-six EGF repeats were a row of "EG"); the title has
  the name. Hover darkens a block and selection rings it from inside, because
  lanes sit 3 px apart and an outline bled into the neighbours.
- A link to the gene page.

### The chips carry a focus, and the structure that shows it

The four human chips (`geneExamples.ts`) preset a focus, and the chip's tooltip
says what it is: TP53 on R248, BRAF on V600, HBB on Glu7 (E6V in the literature,
which counts without the initiator), NOTCH1 on one of its thirty-six EGF
repeats. The three residue chips also name a PDB entry, because the AlphaFold
monomer cannot show what the residue does: 3KMD has TP53's core on the DNA R248
reaches into, 1UWH has V600 against the glycine-rich loop with real confidence
(the model's pLDDT there is 49), and 2HBS has sickle haemoglobin's Val6 in the
fibre contact between tetramers. A species with no curated chips shows none: a
human chip's residue preset would light the wrong residue elsewhere. The six
chips picked for what the ortholog cartoon showed (BRCA2, DMD, EGFR, COL1A1,
PAX6, SOD1) went with it on 2026-10-09. A preset resolves once the map has what
it names — a residue at once, a family when InterPro answers, a partner or a
ligand when PDBe does — and a reader who clears it does not get it back
(`focusChoice === null`). The focus is in the page url too (`residue=248`,
`pfam=PF00008&at=1000`, `partner=P69905`, `ligand=ZN`, written on every change),
so a focused page is a link. A residue carries its label as `label=`, since a
chip's label is the only place some numberings appear (HBB's `E6V (Glu7)`,
rpoB's `S450L (Ser456)`), and a linked residue past the protein's end is dropped
rather than launched.

The rest of what the reader sets rides in the page url beside the focus:
`isoform=` and `structure=` (`alphafold`, `none` or a PDB id), so the address
bar reopens the same launch. An `align=` or `superpose=` from an older link is
ignored. Each applies to the page the link opens and is ignored where it is no
longer on offer, and a new submission, a chip included, starts the url over.

## Verification

`pnpm check-protein-launches` (`scripts/checkProteinLaunches.ts`) resolves the
example genes with the page's own code, boots each session on a hosted build,
waits for the plugin's `protein-view-ready`, and fails when the structure never
aligns onto the transcript (`pairwiseAlignment` absent) or when a model whose
sequence equals the translation does not report `exactMatch`. Both bugs above
would have failed it. For a chip with a preset focus it boots the focused launch
too — the seed alignment linked through `querySeqOffset`, the complex where the
focus is a partner — and reads the MsaView back: no error, the row count the
page placed, and a transcript mapping to the genome view. It needs a browser and
live answers from six services, so it is run by hand — before promoting
`features.proteinBrowser`, and after touching the resolution or session code.
Its modules run with `features.staging` false, which changes only which config
sibling a launch names. Its default genes are the chips plus BRCA2, which no
chip names but which is past AlphaFold's length cap, so the PDB fallback stays
under test. The alignment loaders live in `proteinAlignments.ts` rather than
beside the React that loads them so the checker can import them under
`--experimental-strip-types`, which does not read JSX.

Run 2026-09-12 on `main`, after the site dropped v4.3.0 as a target: all four
focused chips boot, default and focused, tiled, the seed MsaView linked — TP53
with 38 rows, HBB 74, BRAF 88 with its tree pruned to them, NOTCH1 all 68. The
first run that day failed every launch, and the cause was the checker, not the
sessions: puppeteer's default viewport is 800×600, the structure view sits below
the fold, and `main` never reported `protein-view-ready` there, while the same
url at 1400×1000 was ready and exactly aligned in 6 s. The browser is launched
at 1400×1400 now. Worth remembering the shape of it: a negative from the checker
is a claim about the harness as much as about the session, and the debug script
that settled it polled the model every five seconds instead of reading it once.

## A share link was measured and not taken

Measured 2026-09-12, while the released v4.3.0 was still a target and the
query-string budget was live: jbrowse-web's `?session=share-<id>&password=<pw>`
route (AES-encrypted session POSTed to `share.jbrowse.org/api/v1/share`,
cross-origin, `encodeSessionParam('short', …)` in `@jbrowse/core`) carried the
whole BRAF kinase seed session — 24,794 bytes inline — in 1.9 s and booted it on
`latest` with the MsaView at 88 rows and linked. It was not adopted because
targeting `main` alone made the hash do the same with no POST, no external
service and no stored copy of the session. If a release ever stops reading the
hash again, this is the route.

### Ligand sites

PDBe-KB's `graph-api/uniprot/ligand_sites/<acc>` lists every small molecule seen
touching the protein, by residue, with the entries: 100 ligands and 413 KB for
TP53 (2026-10-09). `parseLigandSites` drops what PDBe flags as solvent and the
common crystallisation additives it does not (glycerol, sulfate, acetate, MES,
PEGs, halides, cacodylate's arsenic), drops ligands touching fewer than three
residues (NAD reaches TP53's Lys382 only through the sirtuin it is crystallised
with), and groups ligands whose residues mostly coincide into one site: TP53's
Y220C pocket holds forty-odd compounds crystallised once each and is one row,
beside the zinc of the DNA-binding domain in hundreds of entries. Six sites at
most, best-attested first, each named by its most-observed ligand's component id
(`ZN`, `EXQ +41`) with the rest on the lane's title. Focusing a site opens the
entry it is best seen in, as a partner does.

AlphaFill's transplanted cofactors (`alphafill.eu/v1/aff/<acc>/json`, CORS open)
would put the zinc back on a model with no crystal, but its models are AlphaFold
v4 (2023-11-29) against the v6 the page loads; it is not used. Nor are AlphaFold
DB's predicted complexes: HBB's top one is a β–β homodimer at ipTM 0.89, which
is not the α2β2 haemoglobin is, and the page has no room to say a confident
prediction can be biologically wrong.

## Any species

Added 2026-10-09. The species box is free text, resolved as `/gene` resolves one
(`knownTaxon`, else NCBI Taxonomy through `resolveRefTaxon`), and a link's `ref`
is honoured whatever the taxon. Until then any taxon outside the menu was
rewritten to human, so `/gene`'s link for zebra finch FOXP2 opened human FOXP2.
Measured by a review the same day, the chain then works wherever NCBI annotates
the gene on a RefSeq (GCF) assembly the site hosts: zebra finch FOXP2, a rice
MADS-box gene, influenza haemagglutinin and P. aeruginosa lasR each resolve to a
hosted genome.

UniProt is asked once by GeneID (`xref:geneid-<id>`), and `pickUniProt` takes a
reviewed entry, else one describing a curated `NP_` protein, else a
reference-proteome entry, else any describing a RefSeq protein. Zebra finch
FOXP2 has five TrEMBL entries and no reviewed one; the pick is Q6QBA5, the
curated NP_001041728's, which has an AlphaFold model and InterPro hits. Before,
only reviewed entries were asked for, so such a gene opened with no structure
and no map, and the card said "No reviewed UniProt entry".

Out of reach: the 8,223 GenBank-only (GCA) hubs, which have no NCBI gene records
and only xenoRefGene and AUGUSTUS tracks; a bacterial species named at species
level (Datasets answers S. aureus 1280 with `ABOVE_SPECIES_TAXON`, since gene
records sit under strain taxa).

## Bacteria, fungi and viruses

Added 2026-10-08. The species menu's second group (`MICROBE_SPECIES` in
`orthologSearchUtils.ts`) offers E. coli K-12, B. subtilis, M. tuberculosis,
fission yeast, C. albicans, SARS-CoV-2 and HIV-1, each with chips in
`geneExamples.ts`. `MICROBE_SPECIES` is kept apart from `COMMON_SPECIES`, which
the ortholog pages rank and report missing species by.

Three things had to change for a prokaryotic or viral gene to open at all:

- **No transcript, so no gene_table.** NCBI answers "no table for this gene
  because it has no annotated transcribed products". `parseProductTranscripts`
  reads the coding model off `product_report` instead: each protein with its
  genomic intervals, named by the protein accession since no mRNA exists. The
  blocks have to spell the protein (its residues, with or without a stop codon),
  which keeps a ribosomal frameshift (NCBI lists SARS-CoV-2 ORF1ab's slipped
  base 13468 in both blocks) and a mature peptide (HIV-1 matrix, cut from Gag
  with no stop of its own), and drops a partial gene.
- **No Swiss-Prot accession on the gene record, and a symbol search that
  misses.** NCBI files E. coli's genes under the MG1655 substrain (511145) and
  Swiss-Prot its proteins under K-12 (83333); fission yeast is the species
  (4896) against the strain (284812). `uniProtForProtein` asks UniProt for the
  entry cross-referencing the RefSeq protein, which names it whatever the taxon,
  and p2s_mapper 1.2.1 widens the symbol search to a taxon's descendants on a
  miss.
- **A hosted Pfam tree and the live seed drift both ways.** PF00521 (GyrA) had
  68 seed rows against a 71-leaf tree that lacked four of them, and PF00154
  (RecA) two of thirteen (2026-10-08): the MsaView drew the stale leaves blank
  and had nowhere to hang the unnamed rows. `placeQuery` now leaves out the seed
  rows the tree does not name (`untreed`, which the launch button's tooltip
  reports) and prunes the tree to what stays. Pruning alone, the first attempt,
  returned no tree for every such family, because `pruneNewick` refuses a tree
  missing a kept row. An anchor the tree lacks still leaves the tree out and
  keeps every row. Regenerating the hosted trees would bring the rows back.

A human mitochondrial gene takes the product path too, since it has no table
either: MT-CO1 opens, and the page refuses MT-ND1, whose stop codon is completed
by polyadenylation, because its blocks do not spell its protein. p2s_mapper
1.2.2 recognises the `YP_` and `AP_` proteins those genomes and the viral ones
carry, which 1.2.1 never looked up; `WP_` stays out, since one such sequence is
every strain's copy.

Two numbering notes the chips carry. M. tuberculosis rpoB's S450L is Ser456 on
UniProt's P9WGY9, which starts six codons before the RefSeq protein the
literature counts from, so the chip's focus is 456 and its label says both.
AlphaFold DB now serves models for the SARS-CoV-2 and HIV-1 reference proteins
under ids of the form `AF-0000000365840314`, so a viral chip opens a predicted
model by default and its PDB entries from the structure menu.

Not offered: phage lambda (NCBI's records type cI as `OTHER` with no product),
and HIV-1 `pol`, which has no placed locus.

## Still open

- The 3D-Beacons payload for a well-studied protein is large: TP53 is 344 KB
  unfiltered and 326 KB with `?provider=pdbe` (lowercase; `PDBe` 404s), which
  the fetch no longer passes, since the filtered form flakes (see "A structure
  is asked for"). It is fetched once per gene, after the card renders, and only
  when the gene has a UniProt accession.
- Foldseek is in the plugin already (`services/foldseekApi.ts`); the page does
  not expose it. Structure-based neighbours would be a third alignment source
  where sequence orthology fails (the PANTHER-only taxa), but it is an async job
  like EBI and belongs behind a button if at all.
- A residue focus opens the AlphaFold model unless a chip names an entry. A rule
  that opens the entry where the residue touches a partner or a ligand would
  generalise the chips, but needs PDBe's lists before the launch, which are read
  only on request; DNA contacts are in neither list.
- Colouring the structure by ClinVar or AlphaMissense, so variant clusters show
  without hovering, needs plugin work: protein3d has no colour theme from
  per-residue values (2026-10-09).
- A residue focus is the same residue on every host, but a site focus is not in
  the url: it has no name a link could carry.
- The interface payload is read whole (half a megabyte on TP53 or HBB) to keep
  twelve partners. PDBe has no per-partner endpoint; if this ever matters,
  `graph-api/uniprot/summary_stats` may say whether there is anything to read
  before reading it.
- The paper's resource hub (GMOD/proteinbrowser) does not link here. Once the
  page is production, it should.
