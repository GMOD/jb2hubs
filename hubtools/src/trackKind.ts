// Variant databases UCSC serves as bigBed or bed files, which JBrowse draws as
// FeatureTracks. The faceted track table's kind column shows a track's type
// unless `metadata.kind` says otherwise, so these would list as "Feature".
// Only feature tracks are marked: the gnomAD coverage and constraint signals
// under the same supertrack already list correctly as quantitative, and the
// other variant-ish tracks (gene-disease panels, scores, papers) read
// correctly as features.
const variantDatabase = /^(?:clinvar|dbSnp\d|gnomadVariants|dbVar|dgvPlus)/

/**
 * `{ kind }` for a feature track whose trackDb lineage names a variant
 * database.
 */
export function kindMetadata(type: unknown, lineage: (string | undefined)[]) {
  return type === 'FeatureTrack' &&
    lineage.some(name => name !== undefined && variantDatabase.test(name))
    ? { kind: 'Variants' }
    : {}
}
