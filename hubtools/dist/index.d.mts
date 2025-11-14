import { TrackDbFile } from '@gmod/ucsc-hub'

//#region src/const.d.ts
declare const categoryMap: {
  map: string
  pub: string
  genes: string
  phenDis: string
  rep: string
  varRep: string
  rna: string
  neandertal: string
  denisova: string
  expression: string
  compGeno: string
  regulation: string
  singleCell: string
  hprc: string
}
//#endregion
//#region src/dedupe.d.ts
type Hasher<T> = (input: T) => string
declare function dedupe<T>(list: T[], hasher?: Hasher<T>): T[]
//#endregion
//#region src/generateHubTracks.d.ts
type Adapter = Record<string, unknown>
declare function generateHubTracks({
  trackDb,
  trackDbUrl,
  assemblyName,
  sequenceAdapter,
}: {
  trackDb: TrackDbFile
  trackDbUrl: string
  assemblyName: string
  sequenceAdapter: Adapter
}): (
  | {
      name: string
      type: string
      adapter: {
        type: string
        uri: URL
        sequenceAdapter?: undefined
      }
      trackId: string
      description: string | undefined
      assemblyNames: string[]
      metadata: {
        ucsc: {
          html?: string | undefined
        }
      }
      category: string[]
    }
  | {
      name: string
      type: string
      adapter: {
        type: string
        uri: URL
        sequenceAdapter: {
          [x: string]: unknown
        }
      }
      trackId: string
      description: string | undefined
      assemblyNames: string[]
      metadata: {
        ucsc: {
          html?: string | undefined
        }
      }
      category: string[]
    }
)[]
//#endregion
//#region src/generateJBrowseConfigForAssemblyHub.d.ts
declare function generateJBrowseConfigForAssemblyHub({
  hubFileText,
  trackDbUrl,
}: {
  hubFileText: string
  trackDbUrl: string
}): Promise<{
  defaultSession?:
    | {
        name: string
        widgets: {
          hierarchicalTrackSelector: {
            id: string
            type: string
            view: string
          }
        }
        activeWidgets: {
          hierarchicalTrackSelector: string
        }
        views: {
          type: string
          id: string
          init: {
            assembly: string
            loc: string
          }
        }[]
      }
    | undefined
  assemblies: {
    refNameAliases?:
      | {
          adapter: {
            type: string
            refNameColumnHeaderName: string
            uri: string
          }
        }
      | undefined
    name: string
    displayName: string | undefined
    sequence: {
      type: string
      metadata: {
        ucsc: {
          htmlPath?: string | undefined
        }
      }
      trackId: string
      adapter: {
        type: string
        uri: string
        chromSizes: string
      }
    }
  }[]
  tracks: (
    | {
        name: string
        type: string
        adapter: {
          type: string
          uri: URL
          sequenceAdapter?: undefined
        }
        trackId: string
        description: string | undefined
        assemblyNames: string[]
        metadata: {
          ucsc: {
            html?: string | undefined
          }
        }
        category: string[]
      }
    | {
        name: string
        type: string
        adapter: {
          type: string
          uri: URL
          sequenceAdapter: {
            [x: string]: unknown
          }
        }
        trackId: string
        description: string | undefined
        assemblyNames: string[]
        metadata: {
          ucsc: {
            html?: string | undefined
          }
        }
        category: string[]
      }
  )[]
}>
//#endregion
//#region src/hubCategories.d.ts
declare const hubCategories: {
  id: string
  description: string
  tag: string
}[]
//#endregion
//#region src/notEmpty.d.ts
declare function notEmpty<T>(value: T | null | undefined): value is T
//#endregion
//#region src/types.d.ts
interface UCSCGenArkAssemblyEntry {
  taxId: number
  asmId: string
  genBank: string
  refSeq: string
  identical: string
  sciName: string
  comName: string
  ucscBrowser: string
}
interface NCBIAssemblyEntry {
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
  meta: string
}
interface NCBIData {
  uids: string[]
  [key: string]: NCBIAssemblyEntry
}
//#endregion
//#region src/util.d.ts
declare function resolve(uri: string, baseUri: string | URL): string
declare function myfetch(url: string): Promise<Response>
declare function myfetchtext(url: string): Promise<string>
declare function myfetchjson(url: string): Promise<any>
declare function makeLoc(
  first: string,
  base: {
    uri: string
    baseUri?: string
  },
): {
  uri: string
  locationType: string
}
declare function makeLocAlt(
  first: string,
  alt: string,
  base: {
    uri: string
  },
): {
  uri: string
  locationType: string
}
declare function makeLoc2(
  first: string,
  alt?: string,
): {
  uri: string | undefined
  locationType: string
}
declare function readJSON(f: string): unknown
declare function writeJSON(f: string, d: unknown): void
declare function myjsonfetch(url: string): Promise<unknown>
//#endregion
//#region src/parseAssemblyEntry.d.ts
declare function parseAssemblyEntry({
  entry,
}: {
  entry: UCSCGenArkAssemblyEntry
}):
  | {
      stats: Record<string, unknown> | undefined
      buscoStats: unknown
      seqReleaseDate: string
      submitterOrg: string
      ncbiOrganism: string
      ncbiAssemblyName: string
      ncbiRefSeqCategory: string
      suppressed: boolean
      accession: string
      assembly: string
      scientificName: string
      commonName: string
      taxonId: string | number
      assemblyStatus: string
      jbrowseLink: string
      jbrowseConfig: string
      ncbiGff: string
      ncbiLink: string
      ucscDataLink: string
      ucscBrowserLink: string
      igvBrowserLink: string
      ncbiName: string
      ncbiBrowserLink: string
    }
  | undefined
//#endregion
export {
  NCBIAssemblyEntry,
  NCBIData,
  UCSCGenArkAssemblyEntry,
  categoryMap,
  dedupe,
  generateHubTracks,
  generateJBrowseConfigForAssemblyHub,
  hubCategories,
  makeLoc,
  makeLoc2,
  makeLocAlt,
  myfetch,
  myfetchjson,
  myfetchtext,
  myjsonfetch,
  notEmpty,
  parseAssemblyEntry,
  readJSON,
  resolve,
  writeJSON,
}
