// A RefSeq or UniProt accession without its version: NP_000537.3 → NP_000537.
export const bareAccession = (acc: string) => acc.replace(/\.\d+$/, '')
