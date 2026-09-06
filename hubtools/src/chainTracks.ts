// Shared helpers for building chain/liftOver SyntenyTracks. The genark and ucsc
// converters parse their own (differently-shaped) PIF filenames, but agree on
// how an assembly name is recognized and normalized.

// GCF_/GCA_ accessions are used verbatim; everything else is treated as a UCSC
// assembly name.
export function isAccession(name: string): boolean {
  return name.startsWith('GCF') || name.startsWith('GCA')
}

// A chain filename spells a GenArk target either as the bare accession or as
// the full NCBI asmId, and the two are the same assembly:
// GCF_000001735.3_TAIR10 is the hub published at .../GCF_000001735.3. Everything
// downstream addresses a GenArk assembly by accession -- the hub's own
// `genome` line, its trackIds, all.json's `accession` -- so an asmId in
// assemblyNames names an assembly nothing declares, and the synteny track can
// never resolve its mate.
const ACCESSION_WITH_ASM_NAME = /^(GC[AF]_\d+\.\d+)_/

// Normalizes a target assembly name: an accession keeps only its accession part
// (GCF_000001735.3_TAIR10 -> GCF_000001735.3); a UCSC name gets its first letter
// lowercased (Hg38 -> hg38, Mm39 -> mm39).
export function normalizeAssemblyName(name: string): string {
  if (isAccession(name)) {
    return ACCESSION_WITH_ASM_NAME.exec(name)?.[1] ?? name
  }
  return name.charAt(0).toLowerCase() + name.slice(1)
}
