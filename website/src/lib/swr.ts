// SWR options for the live NCBI/EBI-backed fetches the gene-first pages make.
// Their failures are overwhelmingly "no such gene" or a rate limit, neither of
// which a silent five-attempt replay improves — it just spends someone else's
// quota and makes the error line flicker. Static JSON assets keep the default.
export const LIVE_QUERY = { shouldRetryOnError: false }
