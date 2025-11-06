# Minimal Config Generation

This system creates minimal versions of UCSC JBrowse configs that include only
essential tracks.

## What tracks are included?

The minimal configs include only the following track categories:

- **NCBI RefSeq** - All RefSeq gene tracks (ncbiRefSeq, ncbiRefSeqCurated,
  ncbiRefSeqPredicted, etc.)
- **GENCODE** - All GENCODE gene annotation tracks (gencodeComp, gencodeBasic,
  gencodeLncRNA, etc.)
- **RepeatMasker** - Repeat element annotations (rmsk, rmskJoined\*)
- **ClinVar** - Clinical variant data (clinvar*, dbSnp*ClinVar)
- **Gaps** - Assembly gaps (gap, allGaps, gapOverlap)

All other tracks (comparative genomics, conservation, expression data, etc.) are
excluded from minimal configs.

## Usage

### Generate minimal configs for all assemblies

```bash
./createMinimalConfigs.sh
```

This will process all assembly directories in `$UCSC_RESULTS_DIR` (or
`~/ucscResults` by default). For each assembly folder containing a `config.json`
file, it creates:

1. A `minimal.json` file in that assembly's directory
2. A copy in `configs-minimal/<assembly>.json`

### Specify custom results directory

```bash
./createMinimalConfigs.sh /path/to/ucscResults
```

## Output

The script will:

1. Process each assembly directory containing a config.json file
2. Create minimal.json in each assembly directory
3. Copy all minimal configs to configs-minimal/
4. Print statistics showing how many tracks were included vs excluded
5. Display a summary with totals

Example output:

```
hg38: 24 tracks included, 632 tracks excluded
mm10: 12 tracks included, 445 tracks excluded

--- Summary ---
Total assemblies processed: 222
Total tracks included: 853
Total tracks excluded: 11457

Done! Minimal configs created:
  - In each assembly directory as minimal.json
  - In configs-minimal/ as <assembly>.json
```

## Adding or removing track categories

To modify which tracks are included in minimal configs, edit the
`MINIMAL_TRACK_PATTERNS` array in `src/createMinimalConfig.ts`:

```typescript
const MINIMAL_TRACK_PATTERNS = [
  'ncbirefseq', // NCBI RefSeq tracks
  'gencode', // GENCODE tracks
  'rmsk', // RepeatMasker tracks
  'clinvar', // ClinVar tracks
  'gap', // Gap tracks
]
```

The patterns are matched case-insensitively against track IDs. Add or remove
patterns as needed.

## Files

- `src/createMinimalConfig.ts` - Core TypeScript script that filters tracks
- `createMinimalConfigs.sh` - Shell script wrapper for easy execution
- `MINIMAL_CONFIGS.md` - This documentation file
