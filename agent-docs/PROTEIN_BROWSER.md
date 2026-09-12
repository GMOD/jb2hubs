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

## A structure is asked for, not assumed

`AF-<accession>-F1-model_v6.cif` is derivable for most proteins and wrong for
two kinds: the version moves (`_v4` already 404s), and a protein past
AlphaFold's length cap has no F1. Human dystrophin (P11532, 3,685 aa) has
fourteen isoform models and no canonical one, so the DMD chip named a 404 and
its card said "opens the AlphaFold structure". Titin has nothing.

`structureSources.ts` asks two APIs, both `access-control-allow-origin: *`,
measured 2026-09-01:

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
  fetches the SIFTS UniProt mapping itself.

The card offers the AlphaFold model first and the six best-covering PDB entries
after it. A PDB entry covers a fragment; the pairwise alignment in the plugin is
what makes that fragment land on the right codons, which is the same mechanism
the isoform mismatch relies on.

## Superposition comes almost free

NCBI's ortholog report (`returned_content=COMPLETE`) carries
`swiss_prot_accessions` per gene — mouse Trp53 → P02340, zebrafish tp53 → P79734
— and a PANTHER row's accession already IS UniProt. `ProteinMsaRow` carries it
as `uniprot`, the cartoon offers a "3D" toggle on any row that has one, and the
card resolves each marked accession through the AlphaFold API and appends it to
the ProteinView's `structures[]`. The plugin superposes (TM-align) whenever more
than one structure is loaded, reactively — Figure 1D of the paper, from the
cartoon. The precomputed `proteinExamples.json` had to be regenerated to carry
the field; a chip built before that shows no toggles.

## Other launch options, and where each is decided

- **Domain → `initialSelection`.** Clicking a CDD domain on the query row opens
  the session with that residue range lit in all three views. The range is in
  the row's protein coordinates and the plugin wants structure residues, so it
  is exact when the model was folded from the transcript's own translation and
  that is the row's protein; a different isoform shifts it and a PDB entry
  numbers its observed chain. The card says which, beside the chip.
- **Variant tracks.** `pickVariantTracks` in `genomeTarget.ts` opens
  `<db>-clinvarMain` and `<db>-alphaMissense` where the config has them (hg38
  and hg19 today), which is the pairing the paper's BRAF V600 case study is
  built on. A checkbox on the card turns them off.
- **Isoform.** Every coding transcript the gene_table lists, representative
  first. Switching fetches that NP record and rebuilds the session; the launch
  link is disabled while it does. Hidden when the 100-way alignment is the
  source, because that alignment fixes the transcript.

## The session has to agree with the host it lands on

Production launches go to `latest` (v4.3.0 as of 2026-09-01) and staging to
`main`, decided by `JBROWSE_BASE` in `website/src/config/jbrowse.ts`, and the
session `proteinSession.ts` emits is not the same on both. Two facts about the
hosts decide what it may carry:

- **The workspace layout tree is `main`-only.** The side-by-side tiling
  (`useWorkspaces: true` plus a `layout` of LayoutBranch/LayoutPanel/LayoutTab)
  is read by `main`'s WorkspaceLayout. v4.3.0 has no `layout` field — its
  workspace is `dockviewLayout` — so MST drops the tree in silence, and its
  `MultipleViews` autorun persists the session's `useWorkspaces` into
  localStorage: one launch flipped the reader's preference for every later
  session on that host. `HOST_HAS_WORKSPACE_LAYOUT` gates both fields, and the
  production session is the same three views stacked in one column. Delete the
  constant once a released `latest` restores the tree.
- **A GFF gene track is readable on `main` only.** `latest` labels the
  full-resolution NCBI GFF3 with UUIDs (see `onGeneTrackHost`, and the
  measurement beside it), so a session whose picked gene track is
  `-ncbiGff`/`-ncbiRefSeqGff` — every GenArk-hosted genome, whose only gene
  track that is — is routed to the gene-track host the way every `/orthologs`
  launch already is (`isNcbiGffTrack` in `genomeTarget.ts`). That host has the
  layout tree, so those sessions are tiled on production too. UCSC-hosted
  genomes pick a bigBed track (`ncbiRefSeqSelect` first) and stay on `latest`.

`ProteinBrowser`'s "ClinVar + AlphaMissense" depends on a file this repo
generates rather than on the hosts: `genomeTarget.ts` reads a UCSC assembly's
track ids off `/ucsc/<db>/minimal.json`, so a track absent from
`ucsc2jbrowse/src/createMinimalConfig.ts`'s `MINIMAL_TRACK_PATTERNS` is one the
launch cannot open however the full config names it. `alphamissense` was missing
until 2026-09-01, which is why the checkbox opened ClinVar alone. The pattern is
in the list now; `configs-minimal/hg38.json` and `hg19.json` carry the track
only after the pipeline regenerates and re-uploads them.

### The hash is the third host difference, and it hid the other two

Until 2026-09-01 the launch URL always carried the session in the hash
(`#config=…&session=encoded-…`), for a good reason: a hash never leaves the
browser, so there is no request line for CloudFront to refuse at 8,192 bytes.
v4.3.0 does not read the hash at all. It lands on "Select a view to launch" with
nothing in the console, which is also why neither the dropped layout nor the
UUID gene labels had ever been _seen_ on `latest` — no launch had reached the
point of showing them. The same session in the query string hydrates on both
hosts: measured with TP53, both views open, the structure aligns as an exact
match, and `useWorkspaces` stays `false`.

`HOST_READS_HASH_PARAMS` (`config/jbrowse.ts`) picks `#` or `?`. A `?` launch
inherits the request-line limit, so `buildSessionUrl` enforces
`QUERY_URL_BUDGET` (8,000 bytes) and drops the inline alignment when the URL is
over it, returning `alignmentOmitted: true` for the card to explain. The eight
example genes are 0.9–6.0 KB without an alignment (DMD is the largest), so the
genome and structure views always fit; a live 60-row EBI alignment does not, and
on the current release it stays on the page rather than in the session.

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

Three things carry this, all under the launch card:

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

**A focus** (`Focus` in `proteinFeatures.ts`): a region of the map, a CDD domain
off the ortholog cartoon, or a residue typed into the box. The card turns it
into the plugin's `initialSelection` for an AlphaFold model (0-based, structure
residues — exact only when the model is the canonical entry folded from the
launched translation, which the card checks) or `initialResidues` for a PDB
entry (inclusive author numbering, which is the UniProt numbering for nearly
every entry and what a paper cites either way). A focused partner also changes
the structure: the first PDB entry the two were seen in together opens instead
of the monomer, with the partner's chain loaded — the protein3d plugin loads
every polymer entity, maps the transcript onto the one whose sequence explains
it, and offers the rest in its chain picker.

**An alignment chosen by the question.** A focused domain, or a residue inside
one, offers the Pfam family's **seed** first: the curated few dozen sequences
the family's HMM was built from, spanning its whole taxonomic reach,
hand-aligned, and the domain alone. InterPro serves it per family
(`wwwapi/entry/pfam/<PF>/?annotation=alignment:seed`, gzipped Stockholm, 4–15
KB, 0.1–14 s) and the tree Pfam distributes for it is hosted beside the msafam
demo (`jbrowse.org/demos/pfam/trees/<PF>.tree`), leaves named exactly as the
rows. The ortholog sources stay where they were, relabelled by what they answer:
the 100-way and the live panel are how conserved each residue of _this_ protein
is across species; UniRef is the protein's own cluster; phmmer is a search.

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

The query row is the aligned segment alone, named Pfam-style (`TP53/99-289`),
and the session's MsaView is linked through the codons of that segment alone:
`sliceCds` (`geneStructure.ts`) cuts the transcript's CDS to residues
`start..end` with the phases recomputed, and that is the view's
`connectedFeature`. The row's first residue is the feature's first codon, so the
msaview plugin's mapping holds exactly, and residues outside the segment map to
nothing — which is right, the alignment does not have them. The first draft
carried the whole translation as the row, flanks as columns of gaps in every
other row, and NOTCH1 is why it did not survive: 67 EGF seed rows of 50 columns
became 67 rows of 2,600, 174 KB, and the 50 KB the msaview plugin's data model
will keep in a snapshot held 16 of them. The segment is 4.9 KB and keeps all 67,
tree included.

Where the query protein is itself a seed member — P53_HUMAN is in PF00870 — its
row is replaced rather than duplicated and the tree leaf renamed, matched on the
`#=GS AC` accession; elsewhere the query is grafted as a sister of its anchor at
zero length, which is the honest placement for a row aligned through that
anchor. A seed that will not fit is thinned to the rows the query aligns best
to, anchor first, and loses its tree with them (its leaves would no longer
match). The page says both things beside the alignment.

What "fit" means is the host's (`fitPlacement` in `proteinAlignments.ts`). A
launch on `main` carries the session in the hash and the limit is the msaview
plugin's 50 KB snapshot field: 45,000 characters, which BRAF's kinase domain
exceeds — PF07714 at 111 rows × 481 columns, 87 rows kept. A launch on `latest`
carries it in the query string, where CloudFront's 8,192-byte request line is
the limit, so the seed is cut to the room the url has once the genome and
structure views are paid for: whole with its tree, else whole without the tree,
else thinned by quarters — measured against the deflated, base64'd payload
rather than a character count, because a protein alignment deflates to ~70% and
a Newick tree hardly at all. NOTCH1 is why: its EGF seed is 4.9 KB of FASTA and
2.8 KB of tree, which a character budget let through and `buildSessionUrl` then
dropped whole at the door. TP53's own seed is 27 rows on `latest` against 38 on
`main`, and BRAF's 15 against 87. A thinned seed is still the family where a
dropped one is nothing.

The embedded viewer is react-msaview 6.2, which marks columns but not a row's
residues, so a residue focus reaches it as `highlightColumns` computed off the
query row; the session's MsaView takes the `highlights` themselves.

### Quieter sessions

`quiet` (`SessionOptions`) drops the genome view's overview bar and gridlines
(`hideHeaderOverview`, `showGridlines: false`), and the card hides the protein
view's pairwise panel (`showAlignment: false`) when the structure is the
translation's own fold — an identity alignment is a wall of matches with nothing
to read, while the same panel on a crystal or another isoform is what says which
residues are missing. The card's checkbox is on by default. Neither is a
different session; both are fewer things on screen.

### The chips carry a focus and a sentence

Four human chips (`geneExamples.ts`) preset a focus and a one-line story the
card shows: TP53 on R248, BRAF on V600, HBB on Glu7 (E6V in the literature,
which counts without the initiator), NOTCH1 on one of its thirty-six EGF
repeats. A preset resolves once the map has what it names — a residue at once, a
family when InterPro answers, a partner when PDBe does — and a reader who clears
it does not get it back (`focusChoice === null`). HBB and BRAF are new: HBB was
dropped from the cartoon-chosen list because its cartoon is one flat bar, and
the map is what makes it worth a chip again — the globin seed and the α/β
interface, which Glu7 is not in.

## Verification

`pnpm check-protein-launches` (`scripts/checkProteinLaunches.ts`) resolves the
example genes with the page's own code, boots each session on a hosted build,
waits for the plugin's `protein-view-ready`, and fails when the structure never
aligns onto the transcript (`pairwiseAlignment` absent) or when a model whose
sequence equals the translation does not report `exactMatch`. Both bugs above
would have failed it. It also reads the reader's `useWorkspaces` localStorage
key back after each launch, which is what catches the preference rewrite above
on `--host latest`. For a chip with a preset focus it boots the focused launch
too — the seed alignment linked through the sliced transcript, the complex where
the focus is a partner — and reads the MsaView back: no error, the row count the
page placed, and a transcript mapping to the genome view. It needs a browser and
live answers from six services, so it is run by hand — before promoting
`features.proteinBrowser`, and after touching the resolution or session code.
Its modules run with `features.staging` false, so it exercises the production
session on whichever host it is pointed at; the staging shape (the layout tree
itself) is pinned by `proteinSession.test.ts`. The alignment loaders live in
`proteinAlignments.ts` rather than beside the React that shows them so the
checker can import them under `--experimental-strip-types`, which does not read
JSX.

Run 2026-09-12 on `main`: all four focused chips boot, default and focused, the
seed MsaView linked — TP53 with 28 rows, HBB 49, BRAF 15, NOTCH1 all 68 (its
tree left out) — the production budget, since the checker runs the production
shape; the same launches from the staging page carry 38, 74, 88 and 68. The
first run that day failed every launch, and the cause was the checker, not the
sessions: puppeteer's default viewport is 800×600, the structure view sits below
the fold, and `main` never reported `protein-view-ready` there, while the same
url at 1400×1000 was ready and exactly aligned in 6 s. The browser is launched
at 1400×1400 now. Worth remembering the shape of it: a negative from the checker
is a claim about the harness as much as about the session, and the debug script
that settled it polled the model every five seconds instead of reading it once.

## Still open

- The 3D-Beacons payload for a well-studied protein is large: TP53 is 344 KB
  unfiltered and 326 KB with `?provider=pdbe` (lowercase; `PDBe` 404s), which
  the fetch now passes. It is fetched once per gene, after the card renders, and
  only when the reader has a Swiss-Prot accession to ask about.
- Superposition toggles appear only on rows with a Swiss-Prot accession, which
  NCBI's report supplies for 4–25 of 60 rows on the human examples (every
  PANTHER row has one). UniProt's ID-mapping job (`RefSeq_Protein` →
  `UniProtKB`) would cover the rest, but it is asynchronous and slow: a
  three-accession job was still `RUNNING` 30 s after submission on 2026-09-01,
  which rules it out for a click and makes it a panel-assembly cost if ever
  adopted. Not done.
- Foldseek is in the plugin already (`services/foldseekApi.ts`); the page does
  not expose it. Structure-based neighbours would be a third alignment source
  where sequence orthology fails (the PANTHER-only taxa), but it is an async job
  like EBI and belongs behind a button if at all.
- The map reads InterPro and PDBe by Swiss-Prot accession, so a gene with no
  reviewed entry has no map; a TrEMBL accession would work for InterPro (not
  tried) and the UniProt search in `geneStructure.ts` asks for reviewed only.
- A thinned seed loses its tree because pruning a Newick to the kept leaves is
  not written. `@gmod/newick` is in the tree as react-msaview's dependency but
  not the website's; a small parser would do it.
- `initialResidues` on a PDB entry trusts author numbering to be UniProt
  numbering. Nearly always true; SIFTS (`pdbe/api/mappings/uniprot/<pdb>`) is
  what would make it exact, and the protein3d plugin already fetches it for its
  feature tracks.
- The interface payload is read whole (half a megabyte on TP53 or HBB) to keep
  twelve partners. PDBe has no per-partner endpoint; if this ever matters,
  `graph-api/uniprot/summary_stats` may say whether there is anything to read
  before reading it.
- The paper's resource hub (GMOD/proteinbrowser) does not link here. Once the
  page is production, it should.
