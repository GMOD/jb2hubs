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

## Verification

`pnpm check-protein-launches` (`scripts/checkProteinLaunches.ts`) resolves the
example genes with the page's own code, boots each session on a hosted build,
waits for the plugin's `protein-view-ready`, and fails when the structure never
aligns onto the transcript (`pairwiseAlignment` absent) or when a model whose
sequence equals the translation does not report `exactMatch`. Both bugs above
would have failed it. It also reads the reader's `useWorkspaces` localStorage
key back after each launch, which is what catches the preference rewrite above
on `--host latest`. It needs a browser and live answers from four services, so
it is run by hand — before promoting `features.proteinBrowser`, and after
touching the resolution or session code. Its modules run with `features.staging`
false, so it exercises the production session on whichever host it is pointed
at; the staging shape (the layout tree itself) is pinned by
`proteinSession.test.ts`.

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
- The paper's resource hub (GMOD/proteinbrowser) does not link here. Once the
  page is production, it should.
