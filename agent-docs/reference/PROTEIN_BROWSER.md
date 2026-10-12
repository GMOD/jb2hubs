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

p2s_mapper (since 1.4.0 the page keeps no copy) asks the AlphaFold API and RCSB,
both `access-control-allow-origin: *`:

- **AlphaFold prediction API** (`/api/prediction/<acc>`) — every model for the
  accession with url, version, sequence and mean pLDDT. `pickAlphaFoldModel`
  takes the model folded from exactly the transcript's translation (identity
  mapping) if there is one, else the canonical, else the longest isoform. The
  API answers node's default user-agent with 403; browsers are fine, and the
  launch checker sets a UA.
- **RCSB** (p2s_mapper 2.0.0, 2026-10-11) — `fetchExperimentalStructures` asks
  `sequence-coordinates.rcsb.org/graphql` for every PDB entity aligned to the
  accession with the UniProt range it covers, then `data.rcsb.org/graphql` for
  those entries' method, resolution and chains, in batches of 1000. RCSB's own
  computed models (`AF_…`) are left out. The plugin takes the PDB id (`pdbId`
  shorthand → RCSB mmCIF) and reads the entry's UniProt alignment from the same
  data API. Until then the list came from 3D-Beacons, whose `?provider=pdbe`
  form 404'd BRAF, HBB and BRCA2 about one time in three (2026-10-09) and whose
  unfiltered form listed no structure at all for BRCA1 on 2026-10-11 when RCSB
  and PDBe both had 33; PDBe's best_structures timed out on HBB the same day.
  TP53's two RCSB calls take about 1.3 s.

By default the card opens the entry a chip or a `structure=` link names, else
the complex a focused partner or ligand was seen in, else the AlphaFold model,
else the best-covering PDB entry; a new focus drops the chip's or link's entry.
Advanced offers the model, the six best-covering PDB entries and the complex as
a **Structure** select. The session names the model by `uniprotId`, not by its
file: the plugin asks the same API and picks the model folded from the launched
translation, as the card does, so a saved link survives the next model version
where a `_v6` url would 404 as `_v4` does now. An AlphaFold model opens coloured
by its own pLDDT (the ProteinView's `plddt-confidence` scheme), so a residue
AlphaFold could not place reads as such: BRAF V600 is at 49. Advanced's
**Colour** row also offers protein3d's `alphamissense` and `clinvar` schemes for
a human protein (`STRUCTURE_COLORS`). A PDB entry covers a fragment; the
pairwise alignment in the plugin is what makes that fragment land on the right
codons, which is the same mechanism the isoform mismatch relies on.

## Superposition went with the ortholog cartoon

Until 2026-10-09 the page drew a domain cartoon of up to 60 orthologs (NCBI's
ortholog report and CDD, PANTHER for fly, worm, yeast and plant), aligned them
at EBI with Clustal Omega, and let a row with a Swiss-Prot accession be marked
for superposition on the query's structure. All of it was cut as the page's
busiest and slowest part: the InterPro map shows the query's domains, and the
100-way or UniRef carries conservation. The plugin superposes (TM-align)
whenever a ProteinView holds more than one structure, so a future page can offer
it by adding entries after the primary in `proteinView`.

## Other launch options, and where each is decided

- **Variant tracks.** `pickVariantTracks` in `genomeTarget.ts` opens
  `<db>-clinvarMain` and `<db>-alphaMissense` where the config has them (hg38
  and hg19 today), which is the pairing the paper's BRAF V600 case study is
  built on. They are always on; the reader can close them in JBrowse.
- **Isoform.** The session opens the representative transcript, or the one the
  Pfam seed or the 100-way pins: the msaview plugin maps the query row's
  residues to codons by position, so those alignments fix the transcript their
  row translates. The isoform picker went on 2026-10-11, since those two
  alignments pinned the transcript half the time; JBrowse's gene track shows the
  other isoforms.
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
UniProt span RCSB lists for it.

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
dialog. On 2026-10-11 the lede, the help dialog, the isoform select, the focus
caveats and InterPro's sites went, and everything else past the first look moved
behind an **Advanced** switch. What the page holds by default:

- A gene box, a Search button and the example chips. The species is the link's
  `ref=`, human otherwise.
- The gene, linked to its gene page, and its organism when it is not human.
  Assembly and strand, exon count and CDS length went, since they are
  information rather than decisions.
- The launch button, whose tooltip names the alignment the session carries and
  any caveat about it, then the focus as a chip (`on R248 ×`) once there is one,
  and under them an alignment that failed to load. The map is the way to focus.
- The map, with a residue focus marked on its ruler. Domains always, one block
  where InterPro has several entries for one place (`collapseRedundant`: EGFR's
  kinase was three lanes; every Pfam-bearing entry stays, since a chip may name
  it). InterPro's sites are not drawn. A chip or link naming a partner or ligand
  draws that row alone; every row is in Advanced, where a lane's name loads
  them, since they are half-megabyte PDBe reads, and the first block that
  appears takes keyboard focus from the name that went. A block under 5% of the
  protein carries no label, because at that width a label is an ellipsis
  (NOTCH1's thirty-six EGF repeats were a row of "EG"); the title has the name.
  Hover darkens a block and selection rings it from inside, because lanes sit 3
  px apart and an outline bled into the neighbours.

Advanced is a checkbox at the end of the form row, kept in localStorage
(`jb2hubs:proteinAdvanced`), not the url: it is the reader's habit, and a shared
link opens simple whatever the sender had on. It adds the species box, the
transcript and UniProt accession beside the gene, one block on the card with
**Structure**, **Colour** and the residue box, Open in Desktop, and the Partners
and Ligands lanes. A structure picked there still rides in the url, so a link
reproduces the launch without opening the block.

### The chips carry a focus, and the structure that shows it

The four human chips (`geneExamples.ts`) preset a focus, and the chip's tooltip
says what it is: TP53 on R248, BRAF on V600, HBB on Glu7 (E6V in the literature,
which counts without the initiator), NOTCH1 on EGF12, the repeat Delta and
Jagged bind. The three residue chips also name a PDB entry, because the
AlphaFold monomer cannot show what the residue does: 3KMD has TP53's core on the
DNA R248 reaches into, 1UWH has V600 against the glycine-rich loop with real
confidence (the model's pLDDT there is 49), and 2HBS has sickle haemoglobin's
Val6 in the fibre contact between tetramers. A human chip's residue preset would
light the wrong residue elsewhere, so `geneExamples.ts` gives each species'
chips their own.

The page opens on a showcase row across species (`showcaseExamples`): TP53, HBB
and NOTCH1, then rpoB · M. tuberculosis, S · SARS-CoV-2, let-60 · C. elegans,
CSN2 · cattle and PHYB · Arabidopsis, each one of its species' own chips. A chip
switches the species and stays in the row; a second row, "More in <species>:",
holds the species on screen's other chips. Advanced changes neither. Colin said
on 2026-10-12 that choosing a species before seeing a showcase example was odd,
and that "TB" did not read as tuberculosis.

On 2026-10-11 three research passes brought the non-human chips with a residue
to 56 of 97, each checked against the canonical sequence and against what the
page's sources say there. A chip whose sources say nothing at the residue stays
unfocused (rat Bdnf, cattle LEP, comK, Nef, Vpr), and so does one whose story is
not a residue (pig IGF2's intronic QTL, chicken SHH's limb enhancer).

- **Chips name the famous allele where one exists**, in the papers' numbering
  beside UniProt's: cattle CSN2 "P67H, the A1/A2 switch (residue 82)", MSTN
  "Piedmontese double-muscling variant C313Y", let-60 "Multivulva allele G13E
  (n1046)", E. coli ftsZ "Temperature-sensitive allele G105S (ftsZ84)".
- **Otherwise the orthologue of a human hotspot, or a curated site**: every p53
  on its R248, Spo0A's phosphorylated D56, PHYB's bilin cysteine C357.
- **SARS-CoV-2 Spike opens on N501Y**, in the ACE2-binding motif. D614G, the
  chip before, had nothing to show: its story is a contact between protomers,
  and Spike's partner list is 22 MB.
- **`pnpm check-protein-launches --ref <taxon>` boots all of them**: 172
  launches over 20 taxa, each lighting the residue its label names. A residue
  inside a domain fragment that does not align into its Pfam seed fails there
  (E. coli ftsZ D212, the pick before G105S).
- **Fission yeast had no map at all.** UniProt cross-references S. pombe to
  PomBase rather than NCBI, so `fetchUniProtCandidates` falls back to the
  reviewed entry for the symbol in the taxon (cdc25 P06652, cdc13 P10815).

The six chips picked for what the ortholog cartoon showed (BRCA2, DMD, EGFR,
COL1A1, PAX6, SOD1) went with it on 2026-10-09. A preset resolves once the map
has what it names — a residue at once, a family when InterPro answers, a partner
or a ligand when PDBe does — and a reader who clears it does not get it back
(`focusChoice === null`). The focus is in the page url too (`residue=248`,
`pfam=PF00008&at=1000`, `partner=P69905`, `ligand=ZN`, written on every change),
so a focused page is a link. A residue carries its label as `label=`, since a
chip's label is the only place some numberings appear (HBB's
`Sickle variant E6V (residue 7)`, rpoB's
`Rifampicin-resistance variant S450L (residue 456)`), and a linked residue past
the protein's end is dropped rather than launched.

The rest of what the reader sets rides in the page url beside the focus:
`structure=` (`alphafold`, `none` or a PDB id), so the address bar reopens the
same launch. The colour is not in it: a scheme is a way of reading, like
Advanced itself. An `isoform=`, `color=`, `align=` or `superpose=` from an older
link is ignored. Each applies to the page the link opens and is ignored where it
is no longer on offer, and a new submission, a chip included, starts the url
over.

### One line under a focused residue, the rest behind a fold

A focused residue gets one line under the map, and the rest of what is known
sits behind "More about residue 7", a closed `<details>`. Colin called the facts
written out in full "a wall of text" on 2026-10-11. `residueHeadline` picks the
line:

- UniProt's note on the substitution the chip names, in the chip's numbering:
  HBB's "E6V — Sickle cell disease; Hb S; at heterozygosity confers resistance
  to malaria", rpoB's "S450L, S450Q, S450W — rifampicin-resistant". A
  mutagenesis result the chip names stands in for a note where the Proteins API
  has none, as for nearly every model organism: let-60's "G13E — In n1046;
  multivulva phenotype".
- Else the best-cited note. A note keeps its first clause and the variant's
  short name ("Hb S"), then what the substitution does before any list of other
  cancers, drops "somatic mutation", and gains the residue's DNA or RNA contact:
  TP53's "R248Q, R248W — Li-Fraumeni syndrome; germline mutation and in sporadic
  cancers · contacts DNA".
- Else, in order: what the residue binds, a drug before the cofactors (yeast
  actin "Binds latrunculin A, ATP, ADP and 1 more"); an experiment ("T273A —
  Prevents phosphorylation and results in strong nuclear localization"); a DNA
  or RNA contact; a curated site ("The active site: Phosphocysteine
  intermediate"); then partners, region, domain and chain. A residue conserved
  in half its homologues gains that: "Contacts DNA · conserved across homologues
  (R 64%)".
- For a focused domain `domainHeadline` names which copy it is and what the
  session opens beside: NOTCH1's "EGF-like domain 12 of 36 (452–488) — opens
  beside 67 members of Pfam's PF00008 seed".

`useResidueFacts` holds a residue's line until everything it draws from has
answered (the variants, the conservation profile, PDBe's entry count and lists,
the partners' species), and `GeneResults` holds a domain's until its seed loads,
so neither changes a second after the page draws. The fold lists
`residueContextClauses` one per line, the conservation line and UniProt's
variants. Beside the Open button `ProteinLaunchCard` writes what the session
opens at ("Opens at Sickle variant E6V (residue 7) · Clear"), and `residueFlag`
names the residue on the ruler. Every focused chip was read back on 2026-10-11.

- **Where it sits** (`residueContextClauses`): the InterPro domain, the partners
  PDBe-KB has seen it touch, and the ligands it binds.
  - In a protein kinase domain, `kinaseLandmarks` finds the glycine-rich loop,
    the catalytic loop and the activation segment by their motifs, so BRAF V600
    reads "in its activation segment (DFG594–APE621), which switches the kinase
    on". EGFR L858 and KIT D816 land in theirs, and ABL1 Y253 in the
    glycine-rich loop beside the imatinib it binds.
  - Partners are split by species, from one UniProt `accessions` call
    (`fetchOrigins`). Without the split, HBB's residue 7 listed S. aureus IsdH
    and IsdB as its contacts. With it, `residueContextText` writes that the
    residue is outside the interfaces with itself and the α chain, which is the
    chip's story. PDBe-KB has 350 entries of the β–β and α–β interfaces, and
    residue 7 is in neither.
  - A virus's or pathogen's partner is still named, after the protein's own:
    TP53 R248 "also touches Simian virus 40 Large T antigen".
  - `residueContextText` reports an antibody contact as an epitope and leaves
    antibodies out of the partners (`isAntibody`). PDBe files one under a pseudo
    accession (`IG-heavy chain`), and sending that to UniProt made the species
    call fail with a 400 for EGFR, ERBB2, KRAS and Spike, so `partnerAccessions`
    keeps to UniProt's accession format.
  - A ligand is named only when it touches the residue itself. A site pools
    ligands with overlapping contacts, and naming the whole site credited Spike
    614 with linoleic acid and biliverdin. Haem, glycan and metal ions get the
    names biologists use (`LIGAND_NAMES`).
  - `fetchLigandSynonyms` reads RCSB's synonyms for a ligand PDBe gives a
    systematic name (one GraphQL GET, about 0.1 s): ERG11 Tyr132's 1YN is
    itraconazole. A ligand with no word among its synonyms stays a count unless
    `LIGAND_NAMES` names it, each entry with its citation: TP53 Arg248's QNN is
    methylene quinuclidinone, APR-246's active form, bound to a cysteine
    (Degtjarik et al. 2021, Nat Commun 12:7057; Zhang et al. 2018, Cell Death
    Dis 9:439).
  - `GeneResults` reads the partner and ligand lists as soon as a residue is
    focused, about half a megabyte each on TP53 or HBB, but only for a protein
    in at most 1,000 PDB entries (`EAGER_PDB_ENTRIES`, from PDBe's 100-byte
    `summary_stats`). Spike's 2,268 entries make its partner list 22 MB and 51
    s, so the D614G page leaves contacts out until the reader asks for the lanes
    in Advanced.
  - `fetchCuratedSpans` adds what UniProt's curators mark besides domains, about
    29 KB for TP53: active sites, modified residues, lipidation and mutagenesis
    at the residue; the chain of a precursor the residue is in, when the protein
    is cut into several (Spike D614G "is in Spike protein S1 (14–685)"), and the
    narrowest named region or motif under 100 residues (Spike E484's
    "Receptor-binding motif; binding to human ACE2", TP53 R248's "Interaction
    with the 53BP2 SH3 domain"). With Spike's contacts behind the entry-count
    gate, the chain is the only fact the D614G page shows.
- **How conserved it is** (`conservationText`): PDBe-KB's
  `api/v2/uniprot/sequence_conservation/<acc>/<n>`, under 1 KB and half a
  second. Its amino-acid probabilities are the emission probabilities of
  3DPatch's profile HMM over the protein's homologues (Jakubec, Vondrášek & Finn
  2018), so `conservationText` writes them as shares: TP53 R248 "Conserved
  across homologues: R 62%", BRAF V600 "Variable … L 21%, I 11%, V 11%", BRAF's
  DFG aspartate D 92%. A column whose likeliest residue is under 15% has too few
  homologues to read (Spike 614), and `conservationText` returns nothing. The
  same API's per-residue `llm_annotations` timed out at 60 s on every probe.
- **What is reported there** (`parseResidueVariants`): the Proteins API's
  `variation/<acc>?location=<n>`, about a second.
  - UniProt's curators write the biology into a note: "Hb S; at heterozygosity
    confers resistance to malaria", "rifampicin-resistant". The two best-cited
    are shown, with their disease acronyms expanded from the same records'
    associations, strain lists dropped and an "also found in" list of other
    cancers moved last, so BRAF V600E's note reaches "constitutive and elevated
    kinase activity". Alternates sharing a note share a line.
  - In a clause about resistance, `spelledOut` expands the drug abbreviations
    UniProt defines in its own comments (`DRUG_ABBREVIATIONS`: INH, EMB, PAS,
    GCV, ETH, PFA), from a scan of 1,010 resistance notes in 338 reviewed
    entries. Outside such a clause PAS means periodic acid-Schiff, and PI and JI
    name pea germplasm accessions.
  - The rest are ClinVar classes. A substitution's records are classified
    together, so pathogenic beside benign is uncertain however the API splits
    them.
  - The API also aggregates gnomAD, COSMIC and Ensembl, so a substitution's
    "pathogenic" may come from a source other than ClinVar.
  - The API drops requests from a `HeadlessChrome` user agent (they time out at
    10 s), so a puppeteer check of this line has to set an ordinary one.

## What an edit does, from the transcript's own exons

Added 2026-10-11, the story only the genome link can tell. For a focused residue
`editConsequence.ts` reads the launched transcript's coding exons and writes two
lines into the fold, each with an "Open on them" link:

- **A stop** (a nonsense variant, a CRISPR frameshift) is placed by the 50–55 nt
  rule: more than 55 nt before the last junction between coding exons the
  transcript is a likely target for nonsense-mediated decay; inside 50 nt, or in
  the last coding exon, it escapes and a protein of N−1 residues is made,
  missing the residues from N and the domains they reach into; 50–54 nt is
  called borderline. Only coding exons are known here, so a junction in the 3′
  UTR is not seen.
- **Skipping the residue's exon** deletes its residues in frame when its coding
  length is a multiple of three, else shifts the frame from the first residue of
  the exon. The first and last coding exons are not offered.

The link sets `edit=stop|skip` on the residue focus (`Focus`, `ExampleFocus`,
the url), the session opens on the residues **lost** as
`initialTranscriptResidues`, the Open button says so ("Opens on the 181 residues
a stop at R213 removes"), and the map shades them on its ruler. Lost residues
count on the launched translation, so they need no isoform mapping; the domain
names and the shade count on the canonical and are given only when the
translation is the canonical. Lighting what is lost rather than what survives is
deliberate: the plugin frames the selection, so the camera lands on the removed
domain, where the surviving fold would frame everything and say nothing. No chip
carries an edit yet; DMD exon 51 was rejected because no structure the page
would open covers residues near 2,400.

## Any residue opens the entry that shows it

Added 2026-10-11. The three human chips named 3KMD, 1UWH and 2HBS by hand;
`entryShowing` (`residueFacts.ts`) generalises them: for a focused residue the
card opens the entry its nucleic-acid contact, else its best-attested ligand
site, else its largest protein interface was seen in, antibodies aside, from the
lists the sentence under the map already reads. `chooseStructure`
(`proteinSession.ts`) holds the whole precedence as a tested function: the
chip's or link's pick, the focused complex, the residue's entry, the model, the
best-covering entry. A residue PDBe has seen nothing touch opens the model, and
a protein past `EAGER_PDB_ENTRIES` never reads the lists unasked, so Spike opens
the model too. The Open button waits for the entry count and the two lists
unless a chip named the structure.

## The feature module, split

`proteinFeatures.ts` was 1,600 lines across seven services until 2026-10-11. It
is now a barrel over `proteinRegions.ts` (the shared type), `interpro.ts`,
`pdbeContacts.ts`, `residueVariants.ts`, `residueFacts.ts` and `focus.ts`;
`fetchJsonOr404` in `lib/fetchJson.ts` is the one fetch for a service whose 404
means "nothing here". `useResidueFacts.ts` holds the residue sentence's seven
reads, so `GeneResults` reads as a map, a card and a fold.

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

- The entry list for a well-studied protein is two RCSB calls, about 130 KB and
  60 KB for TP53 (see "A structure is asked for"). It is fetched once per gene,
  after the card renders, and only when the gene has a UniProt accession.
- Foldseek is in the plugin already (`services/foldseekApi.ts`); the page does
  not expose it. Structure-based neighbours would be a third alignment source
  where sequence orthology fails (the PANTHER-only taxa), but it is an async job
  like EBI and belongs behind a button if at all.
- A residue focus opens the AlphaFold model unless a chip names an entry. A rule
  that opens the entry where the residue touches a partner or a ligand would
  generalise the chips. A residue focus now reads PDBe's lists for the sentence
  under the map, so the rule has its data; DNA contacts are in the partner list
  as `DNA`.
- A residue focus is the same residue on every host, but a site focus is not in
  the url: it has no name a link could carry.
- The interface payload is read whole (half a megabyte on TP53 or HBB) to keep
  twelve partners. PDBe has no per-partner endpoint; if this ever matters,
  `graph-api/uniprot/summary_stats` may say whether there is anything to read
  before reading it.
- The paper's resource hub (GMOD/proteinbrowser) does not link here. Once the
  page is production, it should.
