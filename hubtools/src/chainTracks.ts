// Shared helpers for building chain/liftOver SyntenyTracks. The genark and ucsc
// converters parse their own (differently-shaped) PIF filenames, but agree on
// how an assembly name is recognized and normalized.

// GCF_/GCA_ accessions are used verbatim; everything else is treated as a UCSC
// assembly name.
export function isAccession(name: string): boolean {
  return name.startsWith('GCF') || name.startsWith('GCA')
}

// Normalizes a target assembly name: UCSC names get their first letter
// lowercased (Hg38 -> hg38, Mm39 -> mm39); GCF/GCA accessions are unchanged.
export function normalizeAssemblyName(name: string): string {
  if (isAccession(name)) {
    return name
  }
  return name.charAt(0).toLowerCase() + name.slice(1)
}
