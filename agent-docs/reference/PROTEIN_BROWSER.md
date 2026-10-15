---
name: protein-browser
description:
  'The /protein-browser landing page: the two residue-to-codon mapping bugs,
  which structure APIs are asked and why, how launches are verified.'
---

# The protein browser as a landing page

`/protein-browser` is the landing page for "Proteins in the Genome Browser"
(Diesh et al., J. Mol. Biol. 2026, `~/proteins.pdf`) and the two plugins it
launches (`jbrowse-plugin-protein3d`, `jbrowse-plugin-msaview`). A reader types
a gene and gets a connected genome, alignment and structure session with no
setup. The page has been on production since 2026-10-08
(`features.proteinBrowser`). Open items are in
`agent-docs/ideas/collections/protein-browser-plan.md`.

## Two mapping bugs the unit tests could not see

The paper's central claim is the residue ↔ codon mapping. Two defects broke it
on two of the eight example chips while every unit test passed, because the
tests assert the session we emit and both faults were in what the plugin then
did with it.

**The isoform pick never matched.** `pickCanonical` compared the gene_table's
per-transcript length to the UniProt canonical length, but gene_table's coding
intervals include the stop codon, so a 393-residue protein was listed as 394. A
live measurement on 2026-09-01 found zero transcripts at the UniProt length and
one or more at UniProt+1 for TP53, EGFR, NOTCH1, BRCA2, PAX6 and DMD. Every gene
fell through to "longest curated", which for PAX6 is a 504-residue isoform while
the AlphaFold model is the 422-residue canonical.

**The ProteinView was handed the wrong sequence.** The plugin's
`userProvidedTranscriptSequence` is the translation of the connected
transcript's CDS. The plugin pairwise-aligns it against the structure's
residues, so that a structure of a different isoform still maps onto the right
codons. The page passed the UniProt canonical, which is the structure's own
sequence, so the alignment was an identity and the g2p mapper indexed the CDS
with a protein of the wrong length. Wherever the picked transcript was not the
canonical isoform, hovering a residue lit the wrong codon and raised no error.

`geneStructure.ts` fixes both:

- `parseGeneTableBlocks` keeps the protein accession its header already matched,
  which it used to discard.
- `fetchProductReport` asks `product_report`, and `selectTags` reads which
  transcript is MANE Select or RefSeq Select. `orderIsoforms` puts that
  transcript first, and `fetchProteinSequence` fetches its NP record as the
  translation.
- `aaLength` excludes the stop codon.
- The page no longer fetches the structure's sequence from UniProt, because the
  AlphaFold API returns it per model.

For PAX6, MANE-first picks the 436-residue isoform b, while the UniProt
canonical is the 422-residue isoform a. Asking AlphaFold's API instead of
assuming `-F1` matters here too: the API lists an isoform model `AF-P26367-2-F1`
folded from exactly the 436-residue translation, so `pickAlphaFoldModel` takes
it and the mapping is an identity (`check-protein-launches` asserts `exactMatch`
for it). Where no such model exists, the plugin aligns what it can and says so.

## The exon table names the assembly it is on

NCBI places a gene on every assembly it annotates, and the `gene_table` exon
coordinates are on one of them, which need not be the first. Zebrafish tp53 is
placed on GRCz12ab and GRCz12tu, 386 kb apart on their chromosome 5s, and its
table is GRCz12ab's. Until 2026-09-24 the page opened the first hosted
placement, so a tp53 session on GRCz12tu lit every codon on the wrong bases with
no error. `geneTableReference` reads the sequence accession off the table's
header (human and mouse write
`Reference GRCh38.p14 Primary Assembly NC_000017.11 … from:`; yeast, fly, worm
and plant headers start at the accession), and `tablePlacement` opens the
placement on that sequence. The page refuses a table on a sequence that no
placement names, because no assembly would put its coordinates on the right
bases.

## A structure is asked for, not assumed

A url built as `AF-<accession>-F1-model_v6.cif` works for most proteins and
fails in two cases: when the version changes (`_v4` already 404s), and for a
protein past AlphaFold's length cap, which has no F1. Human dystrophin (P11532,
3,685 aa) has fourteen isoform models and no canonical one, so the DMD chip
named a url that 404'd while its card said "opens the AlphaFold structure".
Titin has no model at all.

The page imports the lookup from p2s_mapper and has kept no copy since 1.4.0.
p2s_mapper asks two services, both of which send
`access-control-allow-origin: *`:

- **AlphaFold prediction API** (`/api/prediction/<acc>`). The API lists every
  model for the accession with its url, version, sequence and mean pLDDT.
  `pickAlphaFoldModel` takes the model folded from exactly the transcript's
  translation (an identity mapping) if there is one, else the canonical, else
  the longest isoform. The API answers node's default user agent with 403; a
  browser gets an answer, and the launch checker sets a user agent.
- **RCSB** (p2s_mapper 2.0.0, 2026-10-11). `fetchExperimentalStructures` asks
  `sequence-coordinates.rcsb.org/graphql` for every PDB entity aligned to the
  accession, with the UniProt range it covers, then asks `data.rcsb.org/graphql`
  for those entries' method, resolution and chains, in batches of 1000. It
  leaves out RCSB's own computed models (`AF_…`). The plugin takes the PDB id
  (`pdbId` shorthand → RCSB mmCIF) and reads the entry's UniProt alignment from
  the same data API. Before 2.0.0 the list came from 3D-Beacons. Its
  `?provider=pdbe` form 404'd BRAF, HBB and BRCA2 about one time in three
  (2026-10-09), and its unfiltered form listed no structure for BRCA1 on
  2026-10-11, when RCSB and PDBe both had 33. PDBe's best_structures timed out
  on HBB the same day. TP53's two RCSB calls take about 1.3 s.

By default the card opens the entry a chip or a `structure=` link names, else
the complex a focused partner or ligand was seen in, else the AlphaFold model,
else the best-covering PDB entry. A new focus drops the chip's or link's entry.
Advanced offers the model, the six best-covering PDB entries and the complex as
a **Structure** select.

The session names the AlphaFold model by `uniprotId` instead of by its file url.
The plugin asks the same API and picks the model folded from the launched
translation, as the card does, so a saved link still opens after the next model
version, where a `_v6` url would 404 as `_v4` does now. An AlphaFold model opens
coloured by its pLDDT (the ProteinView's `plddt-confidence` scheme), so a
residue AlphaFold could not place shows as low confidence: BRAF V600 is at 49.
Advanced's **Colour** row also offers protein3d's `alphamissense` and `clinvar`
schemes for a human protein (`STRUCTURE_COLORS`).

A PDB entry covers a fragment of the protein. The plugin's pairwise alignment
maps that fragment onto the right codons, by the same mechanism that handles an
isoform mismatch.

## Superposition

The page has offered no superposition since 2026-10-09, when the ortholog
cartoon and its EBI Clustal Omega job were removed as the page's busiest and
slowest part. The InterPro map shows the query's domains, and the NCBI or UniRef
alignment shows conservation. The plugin superposes structures (TM-align)
whenever a ProteinView holds more than one, so the page can offer superposition
again by adding entries after the primary in `proteinView`.

## Other launch options, and where each is decided

- **Variant tracks.** `pickVariantTracks` in `genomeTarget.ts` opens
  `<db>-clinvarMain` and `<db>-alphaMissense` where the config has them (hg38
  and hg19 today), the pairing the paper's BRAF V600 case study uses. They are
  always on, and the reader can close them in JBrowse.
- **Isoform.** The session opens the representative transcript, or the one the
  Pfam seed pins. The msaview plugin maps the query row's residues to codons by
  position, so a seed fixes which transcript its row translates. The page has no
  isoform picker; JBrowse's gene track shows the other isoforms.
- **Which isoform leads.** MANE Select exists for human alone, and RefSeq Select
  for few other species: zebrafish tp53, zebra finch FOXP2 and fly Dscam1 have
  neither (2026-10-09). Without a flag, the isoform the gene's UniProt entry
  describes leads (`leadWithEntry`), its canonical first, and the longest
  curated isoform comes after. Longest-curated was once the whole rule, and it
  opened Dscam1's 2,034-residue isoform against UniProt's 2,016.

## The session is built for `main`

Every launch on the site goes to `main` (`JBROWSE_BASE` in
`website/src/config/jbrowse.ts`), and the session `proteinSession.ts` emits
relies on three things `main` has:

- The session is in the url hash (`#config=…&session=encoded-…`). The browser
  never sends the hash to a server, so no request-line limit applies.
- The session includes the workspace layout tree that tiles the structure beside
  the genome and alignment views.
- The session opens the full-resolution NCBI GFF3 gene track where that is the
  only gene track.

The released v4.3.0 reads no hash, has no layout tree, persists a session's
`useWorkspaces` into the reader's localStorage, and labels the GFF3 with UUIDs,
which is why the page stopped targeting it on 2026-09-12. The page still places
a seed against a budget of 250,000 FASTA characters (`SEED_BUDGET`), which no
family on the example chips reaches. Point `JBROWSE_BASE` at `latest` once
v5.0.0 publishes.

The ClinVar and AlphaMissense tracks depend on a file this repo generates.
`genomeTarget.ts` reads a UCSC assembly's track ids off
`/ucsc/<db>/minimal.json`, so the launch cannot open a track missing from
`ucsc2jbrowse/src/createMinimalConfig.ts`'s `MINIMAL_TRACK_PATTERNS`, whatever
the full config lists. A launch that opens ClinVar alone means `alphamissense`
dropped out of that list.

## The page chooses what a session opens on

A launch that opens on everything (the whole gene, the whole structure, a
hundred-row alignment from column one) leaves the reader to find the residue
they came for in three views, and that accounts for most of the complaint that a
JBrowse session is busy. A session that opens with one range lit in all three
views, and an alignment scoped to the reader's question, reads as an answer to
that question. The `molstar-harness-proto` case studies were the model here
(each one a sentence, two panels and one mechanism), and so was William
Pearson's advice about searching: a narrow database chosen on purpose beats all
of them.

The page does this with three parts: a protein map, a focus, and an alignment
chosen by the question.

**A protein map** (`ProteinMap.tsx`, data in `proteinFeatures.ts`) draws the
query protein end to end, from two services that answer by UniProt accession
with cross-origin headers.

- InterPro's `entry/all/protein/uniprot/<acc>` returns every member-database
  match integrated into InterPro entries. The map keeps the entries typed
  `domain` and `repeat`. It drops `family` and `homologous_superfamily`, which
  span the protein and give no position to look at, and the site types, which
  mark a few residues the map has no lane for. Under each entry it keeps the
  Pfam accession alone, because Pfam is the member with a seed alignment. The
  map shows an unintegrated Pfam match on its own and drops an unintegrated CDD
  or SMART match.
- PDBe-KB's `graph-api/uniprot/interface_residues/<acc>` returns every residue
  seen touching another molecule in any PDB entry, grouped by partner, with the
  entries it was seen in.

On 2026-09-11 InterPro answered TP53 in 13 KB and NOTCH1's 117 regions in two
pages. The interface list was 496 KB for TP53 (56 partners, 12 kept), 504 KB for
HBB and 9.5 KB for zebrafish tp53, so the page reads it when the reader asks, or
when a chip's preset names a partner. Both services number their coordinates on
the UniProt canonical sequence.

**A focus** (`Focus` in `proteinFeatures.ts`) is a region of the map, or a
residue typed into the box. The card sends it as the plugin's
`initialTranscriptResidues`, 1-based residues of the launched translation, and
the plugin maps those onto whichever structure opens through its pairwise
alignment. One numbering therefore serves an AlphaFold model, a PDB fragment and
haemoglobin's crystals, whose chains count from the mature protein (Glu7 of the
translation is residue 6 in 2HHB and 1A00). An interface focus sends the contact
runs the map draws (`residueRuns`, which bridges gaps of up to two residues),
instead of one span from its first contact to its last. TP53's 165 homo-oligomer
contacts make 15 runs totalling 201 residues between 17 and 356 (PDBe,
2026-09-25), where the span would be 340, and 6XRE lights all 201.

The map's regions and a typed residue are numbered on the UniProt canonical.
`GeneStructure.canonical` holds the canonical as UniProt serves it, because a
gene may lack a canonical AlphaFold model to read it from. The translation is
never taken for the canonical: MANE and the canonical differ for KMT2A (3972 and
3969 residues), PLEC and TTN, and reading one as the other placed 34 of the 37
residues of KMT2A's WDR5 interface wrong. Where the canonical is not the
launched translation, `translationRanges` maps the ranges across, and the card
says so.

`translationRanges` aligns the two sequences end to end (p2s_mapper's
`sharedIsoformResidues` since 2026-10-10, which the protein3d plugin's 1D view
also applies). It maps a residue only inside a stretch the two share letter for
letter: a stretch of ten or more, or of three or more bounded on both sides by a
gap or a sequence end, which is how a short shared exon appears in the alignment
(VEGFA's six-residue exon 8a, which binds NRP1). A lone substitution between two
such stretches maps too, as one codon UniProt and RefSeq read differently.

A measurement on 2026-09-25 compared rules against codon identity on the genome,
over every isoform of TP53, PKM, CDKN2A, FGFR2, TPM1, BRAF, EGFR, SCN8A, MAPT,
BIN1, VEGFA, TPM3 and CD44 (89,927 residues truly shared):

| Rule                                         | Placed wrongly | Missed |
| -------------------------------------------- | -------------- | ------ |
| Shared stretches, as above                   | 335            | 28     |
| Every identical residue                      | 1,885          | 28     |
| Long stretches alone                         | 328            | 64     |
| Local alignment (first version, seven genes) | 2,982          | 30     |

The local alignment's errors included one EGFR isoform's far end. The rule still
misplaces residues of paralogous mutually exclusive exons (PKM's exons 9 and 10
share an 8-residue stretch, and so do FGFR2's IIIb and IIIc) and the residues
where such an exon meets a shared one. It misses single residues at exon
junctions, where the gap fits either side. On CDKN2A the rule cut the p16
residues mapped onto ARF, which is read in another frame, from 85 to 1.

The card still captions one case "approximate": a pair too long to align (TTN).
Before a launch the card can also report that a PDB entry misses the focus
altogether, from the UniProt span RCSB lists for the entry.

The card sends neither `initialSelection` (0-based structure positions, exact
only for the canonical AlphaFold model folded from the launched translation) nor
`initialResidues` in the entry's author numbering, which needed a PDBe SIFTS
read before the link could enable. Each was exact for only some structures.

A focused partner also changes the structure. The first PDB entry the two
proteins were seen in together opens instead of the monomer, with the partner's
chain loaded. The protein3d plugin loads every polymer entity, maps the
transcript onto the one whose sequence matches it, and offers the rest in its
chain picker. The launch link waits for the PDBe list that names the partner's
complex, as it waits for an isoform's translation.

**An alignment chosen by the question.** A focused domain, or a residue inside
one, opens the Pfam family's **seed**: the curated few dozen sequences the
family's HMM was built from, spanning its whole taxonomic range, hand-aligned,
covering the domain alone. InterPro serves the seed per family
(`wwwapi/entry/pfam/<PF>/?annotation=alignment:seed`, gzipped Stockholm, 4–15
KB, 0.1–14 s), and the tree Pfam distributes for it is hosted beside the msafam
demo (`jbrowse.org/demos/pfam/trees/<PF>.tree`), with leaves named exactly as
the rows.

With no focused domain the session opens this protein's orthologs
(`loadOrthologs`), from the first source that applies:

- NCBI's ortholog set, one curated gene per species, where NCBI lists at least
  three (vertebrates and insects). The page asks NCBI for the count before the
  launch, because the plugin fails inside the session with fewer;
- else the UniRef50 cluster across UniProt's reference proteomes.

The plugin builds both in the browser on open, from the launched translation,
the same way for every species. The page does not offer PANTHER, which covers
plants, fungi and worms, because it could learn whether PANTHER has the gene
only by asking it for the orthologs, and a failure would show inside the
session. The page picks the alignment, with no control for the reader.

A human gene took UCSC's 100-way alignment first until 2026-10-14, when it was
dropped because no other species has one and the page should behave the same
everywhere. It opened TP53 in 7 s against 23 s for NCBI's set (hosted main, a
loaded laptop), but NCBI's set carries NCBI's conserved-domain overlay and
species names as row labels, which the 100-way lacked, and the 100-way's human
row was UCSC's knownCanonical, which needed a refusal rule wherever it was not
the gene's own transcript (HBB's was a 90-residue fragment).

### Putting the query into a seed

A Pfam seed does not contain the query, so `pfamSeed.ts` adds it. Every seed row
is a domain segment. `pfamSeed.ts` aligns the translation locally against each
row's ungapped segment (Smith-Waterman, BLOSUM62, gap open 11, extend 1; a few
million cells, 15–670 ms on the four focused chips) and projects it through the
best-scoring row onto the seed's columns. A query residue aligned to a row
residue takes that residue's column, and a residue the row lacks opens a column
that every other row gaps. The search is windowed to the InterPro fragment ± 40
residues, so a titin-sized query does not cost a full matrix per row, and a miss
is reported instead of guessed. InterPro counts on the canonical, so
`seedWindow` first maps the fragment onto the launched translation, which may be
an isoform with residues ahead of the domain that the canonical lacks.

Smith-Waterman returns its best positive cell whether or not the domain is
there, and one W–W pair scores 11, so `pfamSeed.ts` needs a threshold for a
miss. Since 2026-09-24 the best hit has to reach an E-value of 1e-3 under
BLAST's gapped statistics for BLOSUM62 at these gap costs (λ 0.267, K 0.041),
taking the window against every seed row as the search space, and it has to span
half its anchor row. On the four focused chips' families the real placements
score 96 to 1,042 at E 7.5e-8 or less; shuffled translations, and SOD1, which
has none of these domains, reach 1.2e-2 at best, and a shuffled globin reaches
2.9e-4.

Under the threshold `placeQuery` throws instead of linking a few chance residues
to the genome as the domain. The session falls back to the orthologs, and the
launch button's tooltip says which seed was refused and why, since a retry gets
the same refusal. Only a refusal falls back (`SeedRefused`, also thrown for a
family with no seed). A timeout or a server error shows with a retry instead,
because SWR caches whatever the load returns: until 2026-10-10 a transient
InterPro error on NOTCH1's EGF focus launched the orthologs on every later try,
with no message.

The query row is the aligned segment alone, named Pfam-style (`TP53/99-289`),
and the session's MsaView records where in the translation it starts: its
`querySeqOffset` is the number of residues before the row's first, and its
`connectedFeature` is the whole transcript. The msaview plugin counts the row's
residues from that offset, so the mapping is exact, and residues outside the
segment map to nothing, because the alignment does not contain them. The
plugin's `test/sessionSnapshot.test.ts` pins the offset's behaviour. Before
2026-10-08 the page cut the transcript's CDS to the segment's codons instead
(`sliceCds`, phases recomputed), which the offset makes unnecessary. The first
draft put the whole translation in the row, with the flanks as columns of gaps
in every other row. NOTCH1 ruled that out: its 67 EGF seed rows of 50 columns
became 67 rows of 2,600, 174 KB against the segment's 4.9 KB.

Where the query protein is itself a seed member (P53_HUMAN is in PF00870),
`pfamSeed.ts` replaces its row instead of duplicating it and renames the tree
leaf, matching on the `#=GS AC` accession. Otherwise it grafts the query as a
sister of its anchor at zero length, since the row was aligned through that
anchor. A seed that will not fit is thinned to the rows the query aligns best
to, anchor first, and its tree is pruned to them (`pruneNewick`: a dropped leaf
takes its edge, and a node left with one child merges into it with the lengths
summed). The launch button's tooltip reports both.

`SEED_BUDGET`, 250,000 characters of FASTA, sets what fits. Until 2026-10-08 it
was 45,000, on the belief that the msaview plugin drops a snapshot field over
50,000 characters, and BRAF's kinase domain (PF07714, 111 rows × 481 columns)
kept 87 rows. The plugin leaves such a field out of a session it writes, and
keeps it in a session it reads: a 120,000-character alignment in a session link
loads whole and is stored in IndexedDB (the plugin's
`test/sessionSnapshot.test.ts`). The cost of a larger seed is that a link shared
again from inside JBrowse reopens the alignment only in the browser that built
it. A thinned seed still shows the family, where a dropped seed would show
nothing.

The session's MsaView takes `highlights`, which mark and label a residue focus
inside the segment on the query row. `markFocus` places the mark from the focus
as mapped onto the translation, the same selection the genome and structure get,
because the segment counts on the translation and the focus on the canonical.
Until 2026-10-10 the mark used the canonical number: on PAX6, whose MANE isoform
has 14 more residues ahead of the paired domain, residue 100 lit in the genome
and structure while the seed marked a residue 14 away. The page adds the mark at
launch instead of baking it into the placed seed, so a new residue does not
re-read the seed and its tree.

### Quieter sessions

The genome view opens without its overview bar and gridlines
(`hideHeaderOverview`, `showGridlines: false`) and reads a minus-strand gene
5′→3′. The card hides the protein view's pairwise panel (`showAlignment: false`)
when the structure is the translation's own fold, because an identity alignment
is a row of matches with nothing to read; the same panel on a crystal or another
isoform shows which residues are missing. The reader cannot turn either setting
off, and each only removes things from the screen.

### What the card shows by default

The rule comes from molstar-harness: a row appears only where there is a choice,
and a caption only where the launch differs from what the row says. Expect
"busy" to be the first review comment on any new control or caption, and default
to leaving it out; everything past the first look sits behind an **Advanced**
switch. By default the page shows:

- A gene box, a Search button and the example chips. The species is the link's
  `ref=`, human otherwise.
- The gene, linked to its gene page, and its organism when it is not human.
  Assembly and strand, exon count and CDS length were removed, because they
  offer no choice.
- The launch button, whose tooltip names the alignment the session opens and any
  caveat about it; the focus as a chip (`on R248 ×`) once there is one; and
  under them, an alignment that failed to load. The map is the way to set a
  focus.
- The map, with a residue focus marked on its ruler:
  - It always draws domains, as one block where InterPro has several entries for
    one place (`collapseRedundant`: EGFR's kinase was three lanes). Every
    Pfam-bearing entry stays, since a chip may name it.
  - It draws no InterPro sites.
  - A chip or link naming a partner or ligand draws that row alone. Advanced has
    every row, and loads a lane's rows when the reader clicks its name, because
    each lane is a half-megabyte PDBe read; the first block that appears takes
    keyboard focus from the name, which disappears.
  - A block under 5% of the protein has no label, because at that width a label
    is an ellipsis (NOTCH1's thirty-six EGF repeats were a row of "EG"); its
    title has the name.
  - Hover darkens a block and selection rings it from inside, because lanes sit
    3 px apart and an outline overlapped the neighbours.

Advanced is a checkbox at the end of the form row, stored in localStorage
(`jb2hubs:proteinAdvanced`) instead of the url because it is the reader's habit:
a shared link opens simple whatever the sender had on. Advanced adds the species
box, the transcript and UniProt accession beside the gene, one block on the card
with **Structure**, **Colour** and the residue box, Open in Desktop, and the
Partners and Ligands lanes. A structure picked there is still written to the
url, so a link reproduces the launch without opening the block.

### Chip presets: a focus and a structure

The four human chips (`geneExamples.ts`) preset a focus, and each chip's tooltip
names it: TP53 on R248, BRAF on V600, HBB on Glu7 (E6V in the literature, which
counts without the initiator), and NOTCH1 on EGF12, the repeat Delta and Jagged
bind. The three residue chips also name a PDB entry, because the AlphaFold
monomer cannot show what the residue does:

- 3KMD has TP53's core on the DNA that R248 reaches into.
- 1UWH resolves V600 against the glycine-rich loop, where the model's pLDDT
  is 49.
- 2HBS has sickle haemoglobin's Val6 in the fibre contact between tetramers.

A human chip's residue preset would light the wrong residue in another species,
so `geneExamples.ts` defines separate chips per species.

The page opens on a showcase row across species (`showcaseExamples`): TP53, HBB
and NOTCH1, then rpoB · M. tuberculosis, S · SARS-CoV-2, let-60 · C. elegans,
CSN2 · cattle and PHYB · Arabidopsis, each one of its species' chips. A chip
switches the species and stays in the row. A second row, "More in <species>:",
holds the other chips of the species on screen. Advanced changes neither row.
Colin said on 2026-10-12 that choosing a species before seeing a showcase
example was odd, and that "TB" did not read as tuberculosis.

On 2026-10-11 three research passes brought the non-human chips with a residue
focus to 56 of 97, each checked against the canonical sequence and against what
the page's sources report at that residue. A chip whose sources report nothing
at the residue stays unfocused (rat Bdnf, cattle LEP, comK, Nef, Vpr), as does
one whose story is not about a residue (pig IGF2's intronic QTL, chicken SHH's
limb enhancer).

- **Chips name the famous allele where one exists**, in the papers' numbering
  beside UniProt's: cattle CSN2 "P67H, the A1/A2 switch (residue 82)", MSTN
  "Piedmontese double-muscling variant C313Y", let-60 "Multivulva allele G13E
  (n1046)", E. coli ftsZ "Temperature-sensitive allele G105S (ftsZ84)".
- **Otherwise the orthologue of a human hotspot, or a curated site**: every p53
  on its R248, Spo0A's phosphorylated D56, PHYB's bilin cysteine C357.
- **SARS-CoV-2 Spike opens on N501Y**, in the ACE2-binding motif. D614G, the
  earlier chip, had nothing to show, because its story is a contact between
  protomers and Spike's partner list is 22 MB.
- **`pnpm check-protein-launches --ref <taxon>` boots all of them**: 172
  launches over 20 taxa, each lighting the residue its label names. A residue
  inside a domain fragment that does not align into its Pfam seed fails there
  (E. coli ftsZ D212, the pick before G105S).
- **Fission yeast needs a fallback.** UniProt cross-references S. pombe to
  PomBase instead of NCBI, so `fetchUniProtCandidates` falls back to the
  reviewed entry for the symbol in the taxon (cdc25 P06652, cdc13 P10815).
  Without the fallback the page drew no map.

The six chips picked for what the ortholog cartoon showed (BRCA2, DMD, EGFR,
COL1A1, PAX6, SOD1) were removed with it on 2026-10-09.

A preset resolves once the map has what it names: a residue at once, a family
when InterPro answers, a partner or a ligand when PDBe does. A reader who clears
a preset does not get it back (`focusChoice === null`). The page url holds the
focus too (`residue=248`, `pfam=PF00008&at=1000`, `partner=P69905`, `ligand=ZN`,
written on every change), so a focused page is a link. A residue keeps its label
as `label=`, since a chip's label is the only place some numberings appear
(HBB's `Sickle variant E6V (residue 7)`, rpoB's
`Rifampicin-resistance variant S450L (residue 456)`). The page drops a linked
residue past the protein's end instead of launching it.

The page url also holds `structure=` (`alphafold`, `none` or a PDB id), so the
address bar reopens the same launch. The url leaves out the colour scheme,
because a scheme is a way of reading, like Advanced itself. The page ignores an
`isoform=`, `color=`, `align=` or `superpose=` from an older link. Each
parameter applies to the page the link opens and is ignored where it is no
longer on offer, and a new submission, a chip included, starts the url over.

### One line under a focused residue, the rest behind a fold

A focused residue gets one line under the map, and the rest of what is known
sits behind "More about residue 7", a closed `<details>`. Colin called the facts
written out in full "a wall of text" on 2026-10-11. `residueHeadline` picks the
line from the first of these that applies:

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

`useResidueFacts` holds back a residue's line until every source it draws on has
answered (the variants, the conservation profile, PDBe's entry count and lists,
the partners' species), and `GeneResults` holds back a domain's line until its
seed loads, so neither line changes a second after the page draws. The fold
lists `residueContextClauses` one per line, the conservation line and UniProt's
variants. Beside the Open button `ProteinLaunchCard` writes what the session
opens at ("Opens at Sickle variant E6V (residue 7) · Clear"), and `residueFlag`
names the residue on the ruler. We read every focused chip back on 2026-10-11.

- **Where it sits** (`residueContextClauses`): the InterPro domain, the partners
  PDBe-KB has seen it touch, and the ligands it binds.
  - In a protein kinase domain, `kinaseLandmarks` finds the glycine-rich loop,
    the catalytic loop and the activation segment by their motifs, so BRAF V600
    reads "in its activation segment (DFG594–APE621), which switches the kinase
    on". EGFR L858 and KIT D816 fall in theirs, and ABL1 Y253 in the
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
    is cut into several (Spike D614G "is in Spike protein S1 (14–685)"); and the
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
  homologues to read (Spike 614), and `conservationText` returns nothing for it.
  The same API's per-residue `llm_annotations` timed out at 60 s on every probe.
- **What is reported there** (`parseResidueVariants`): the Proteins API's
  `variation/<acc>?location=<n>`, about a second.
  - UniProt's curators write the biology into a note: "Hb S; at heterozygosity
    confers resistance to malaria", "rifampicin-resistant". The fold shows the
    two best-cited notes, with their disease acronyms expanded from the same
    records' associations, strain lists dropped and an "also found in" list of
    other cancers moved last, so BRAF V600E's note reaches "constitutive and
    elevated kinase activity". Alternates sharing a note share a line.
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

## What an edit does to the launched transcript

For a focused residue `editConsequence.ts` reads the launched transcript's
coding exons and writes two lines into the fold, each with an "Open on them"
link:

- **A stop** (a nonsense variant) escapes nonsense-mediated decay by aenmd's
  rules (kostkalab/aenmd, `R/nmd_escape_rules.R`, from Lindeboom et al. 2016 and
  2019), checked in this order: in the last coding exon; within 50 nt of the
  last junction; within the first 150 nt of the coding sequence, where ribosomes
  reinitiate (HBB codon 7); in an exon of 407 nt or more. Otherwise the
  transcript is a likely target. Where it escapes, the cell makes a protein of
  N−1 residues, missing the residues from N and the domains they reach into.
  Like aenmd, the rules count coding exons only, so they ignore a junction in
  the 3′ UTR (ARC has two); none of 18 common disease genes has one.
- **Skipping the residue's exon** deletes its residues in frame when its coding
  length is a multiple of three, else shifts the frame from the first residue of
  the exon. An in-frame exon that starts inside a codon fuses the two split
  codons into one, so the line says the span is fused into one residue. The
  first and last coding exons are not offered.

The link sets `edit=stop|skip` on the residue focus (`Focus`, `ExampleFocus`,
the url). The session opens on the residues **lost** as
`initialTranscriptResidues`, the Open button says so ("Opens on the 181 residues
a stop at R213 removes"), and the map shades them on its ruler. Lost residues
count on the launched translation and go to the session unmapped. The page maps
them onto the canonical with `translationRanges` for the sentence, the domain
names and the shade, and leaves the range out where none of them maps.

The page lights what is lost instead of what survives because the plugin frames
the selection: the camera lands on the removed domain, where the surviving fold
would fill the frame and single out nothing. No chip presets an edit yet. DMD
exon 51 was rejected because no structure the page would open covers residues
near 2,400.

## Any residue opens the entry that shows it

`entryShowing` (`residueFacts.ts`) generalises the three entries the human chips
name by hand (3KMD, 1UWH, 2HBS). For a focused residue the card opens the entry
in which the residue's nucleic-acid contact was seen, else its best-attested
ligand site, else its largest protein interface, leaving antibodies aside. It
reads the lists the line under the map already reads. `chooseStructure`
(`proteinSession.ts`) holds the whole precedence as a tested function: the
chip's or link's pick, the focused complex, the residue's entry, the model, the
best-covering entry. A residue PDBe has seen nothing touch opens the model, and
a protein past `EAGER_PDB_ENTRIES` never reads the lists unasked, so Spike opens
the model too. The Open button waits for the entry count and the two lists
unless a chip named the structure.

## The feature modules

`proteinFeatures.ts` is a barrel over `proteinRegions.ts` (the shared type),
`interpro.ts`, `pdbeContacts.ts`, `residueVariants.ts`, `residueFacts.ts` and
`focus.ts`. `fetchJsonOr404` in `lib/fetchJson.ts` is the one fetch for a
service whose 404 means "nothing here". `useResidueFacts.ts` holds the residue
line's seven reads, so `GeneResults` reads as a map, a card and a fold.

## Verification

`pnpm check-protein-launches` (`scripts/checkProteinLaunches.ts`) resolves the
example genes with the page's own code, boots each session on a hosted build,
waits for the plugin's `protein-view-ready`, and fails when the structure never
aligns onto the transcript (`pairwiseAlignment` absent) or when a model whose
sequence equals the translation does not report `exactMatch`. Both bugs above
would have failed it. For a chip with a preset focus it boots the focused launch
too (the seed alignment linked through `querySeqOffset`, the complex where the
focus is a partner) and reads the MsaView back: no error, the row count the page
placed, and a transcript mapping to the genome view.

The checker needs a browser and live answers from six services, so it is run by
hand, after touching the resolution or session code. Its modules run with
`features.staging` false, which changes only which config sibling a launch
names. Its default genes are the chips plus BRCA2, which no chip names but which
is past AlphaFold's length cap, so the PDB fallback stays under test. The
alignment loaders are defined in `proteinAlignments.ts`, and the structure,
colour and selection a launch carries in `proteinLaunch.ts`'s `launchPlan`,
apart from the React that uses them, so the checker can import them under
`--experimental-strip-types`, which does not read JSX.

The checker launches its browser at 1400×1400. At puppeteer's default 800×600
the structure view sits below the fold and `main` never reports
`protein-view-ready`, so on 2026-09-12 every launch failed with nothing wrong in
the sessions. A failure from the checker is therefore a claim about the harness
as much as about the session; a debug script that polls the model every few
seconds tells the two apart.

## Ligand sites

PDBe-KB's `graph-api/uniprot/ligand_sites/<acc>` lists every small molecule seen
touching the protein, by residue, with the entries: 100 ligands and 413 KB for
TP53 (2026-10-09). `parseLigandSites`:

- drops what PDBe flags as solvent, and the common crystallisation additives it
  does not flag (glycerol, sulfate, acetate, MES, PEGs, halides, cacodylate's
  arsenic);
- drops ligands touching fewer than three residues (NAD reaches TP53's Lys382
  only through the sirtuin it is crystallised with);
- groups ligands whose residues mostly coincide into one site. TP53's Y220C
  pocket holds forty-odd compounds crystallised once each and is one row, beside
  the zinc of the DNA-binding domain in hundreds of entries.

The lane shows six sites at most, best-attested first, each named by its
most-observed ligand's component id (`ZN`, `EXQ +41`) with the rest on the
lane's title. A focused site opens the entry it is best seen in, as a focused
partner does.

AlphaFill's transplanted cofactors (`alphafill.eu/v1/aff/<acc>/json`, CORS open)
would put the zinc back on a model with no crystal, but its models are AlphaFold
v4 (2023-11-29) against the v6 the page loads, so the page does not use it. The
page does not use AlphaFold DB's predicted complexes either: HBB's top one is a
β–β homodimer at ipTM 0.89, not the α2β2 tetramer haemoglobin is, and the page
has no room to explain that a confident prediction can be biologically wrong.

## Any species

The species box is free text, resolved as `/gene` resolves one (`knownTaxon`,
else NCBI Taxonomy through `resolveRefTaxon`), and the page honours a link's
`ref` whatever the taxon. The lookup chain works wherever NCBI annotates the
gene on a RefSeq (GCF) assembly the site hosts: zebra finch FOXP2, a rice
MADS-box gene, influenza haemagglutinin and P. aeruginosa lasR each resolve to a
hosted genome.

The page asks UniProt once by GeneID (`xref:geneid-<id>`), and `pickUniProt`
takes a reviewed entry, else one describing a curated `NP_` protein, else a
reference-proteome entry, else any describing a RefSeq protein. Zebra finch
FOXP2 has five TrEMBL entries and no reviewed one; the pick is Q6QBA5, the entry
for the curated NP_001041728, which has an AlphaFold model and InterPro hits.
When the page asked for reviewed entries alone, such a gene opened with no
structure and no map, and the card said "No reviewed UniProt entry".

Two cases stay out of reach. The 8,223 GenBank-only (GCA) hubs have no NCBI gene
records and only xenoRefGene and AUGUSTUS tracks. A bacterial species named at
species level fails too: Datasets answers S. aureus 1280 with
`ABOVE_SPECIES_TAXON`, since gene records sit under strain taxa.

## Bacteria, fungi and viruses

The species menu's second group (`MICROBE_SPECIES` in `orthologSearchUtils.ts`)
offers E. coli K-12, B. subtilis, M. tuberculosis, fission yeast, C. albicans,
SARS-CoV-2 and HIV-1, each with chips in `geneExamples.ts`. `MICROBE_SPECIES` is
kept apart from `COMMON_SPECIES`, which the ortholog pages rank and report
missing species by.

Three things had to change for a prokaryotic or viral gene to open at all:

- **No transcript, so no gene_table.** NCBI answers "no table for this gene
  because it has no annotated transcribed products". `parseProductTranscripts`
  reads the coding model off `product_report` instead: each protein with its
  genomic intervals, named by the protein accession since no mRNA exists.
  `parseProductTranscripts` requires the blocks to spell the protein (its
  residues, with or without a stop codon), so it keeps a ribosomal frameshift
  (NCBI lists SARS-CoV-2 ORF1ab's slipped base 13468 in both blocks) and a
  mature peptide (HIV-1 matrix, cut from Gag with no stop of its own), and drops
  a partial gene.
- **No Swiss-Prot accession on the gene record, and a symbol search that
  misses.** NCBI files E. coli's genes under the MG1655 substrain (511145) and
  Swiss-Prot files its proteins under K-12 (83333); fission yeast is the species
  (4896) against the strain (284812). `uniProtForProtein` asks UniProt for the
  entry cross-referencing the RefSeq protein, which finds it whatever the taxon,
  and p2s_mapper 1.2.1 widens the symbol search to a taxon's descendants on a
  miss.
- **A hosted Pfam tree and the live seed fall out of step in both directions.**
  PF00521 (GyrA) had 68 seed rows against a 71-leaf tree that lacked four of
  them, and PF00154 (RecA) two of thirteen (2026-10-08). The MsaView drew the
  stale leaves blank and had nowhere to place the unnamed rows. `placeQuery` now
  leaves out the seed rows the tree does not name (`untreed`, which the launch
  button's tooltip reports) and prunes the tree to the rows that stay. Pruning
  alone, the first attempt, returned no tree for every such family, because
  `pruneNewick` refuses a tree missing a kept row. When the tree lacks the
  anchor row, the session still opens without the tree and keeps every row.
  Regenerating the hosted trees would bring the rows back.

A human mitochondrial gene takes the product path too, since it has no table
either. MT-CO1 opens, and the page refuses MT-ND1, whose stop codon is completed
by polyadenylation, because its blocks do not spell its protein. p2s_mapper
1.2.2 recognises the `YP_` and `AP_` proteins of those genomes and the viral
ones, which 1.2.1 never looked up. `WP_` stays out, since one such sequence
stands for every strain's copy.

Two numbering notes apply to the chips. M. tuberculosis rpoB's S450L is Ser456
on UniProt's P9WGY9, which starts six codons before the RefSeq protein the
literature counts from, so the chip's focus is 456 and its label gives both.
AlphaFold DB now serves models for the SARS-CoV-2 and HIV-1 reference proteins
under ids of the form `AF-0000000365840314`, so a viral chip opens a predicted
model by default and its PDB entries from the structure menu.

The page offers neither phage lambda (NCBI's records type cI as `OTHER` with no
product) nor HIV-1 `pol`, which has no placed locus.
