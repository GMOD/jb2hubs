// The widest window drawn at segment level, and the widest the callset opens
// on. Past it a graph is one unreadable thread, and the 464-haplotype callset
// (~200 bytes/bp of VCF text over these loci) is behind "too much data". The
// HPRC tutorial's cuts run 70–130 kb. Every human window fits; a wider one
// draws from the coarse tier.
export const MAX_DETAIL_WINDOW_BP = 150_000

export const isWide = (region: { start: number; end: number }) =>
  region.end - region.start > MAX_DETAIL_WINDOW_BP
