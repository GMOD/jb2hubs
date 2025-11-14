export interface UCSCGenArkAssemblyEntry {
  taxId: number
  asmId: string
  genBank: string
  refSeq: string
  identical: string
  sciName: string
  comName: string
  ucscBrowser: string
}

export interface NCBIAssemblyEntry {
  assemblyaccession: string
  assemblystatus: string
  assemblyname: string
  assemblydate: string
  submitterorganization: string
  seqreleasedate: string
  organism: string
  propertylist: string[]
  refseq_category: string
  busco: unknown
  synonyms?: { refseq: string; genbank: string }
  meta: string
}
export interface NCBIData {
  // @ts-expect-error
  uids: string[]
  [key: string]: NCBIAssemblyEntry
}
