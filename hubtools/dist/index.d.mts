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
//#region src/enhanceConfig.d.ts
/**
 * Enhances a JBrowse configuration file with standard plugins and hierarchical settings.
 * @param configPath Path to the config.json file to enhance.
 * @param plugins Optional array of plugins to add. Defaults to standard JBrowse plugins.
 */
declare function enhanceConfig(
  configPath: string,
  plugins?: {
    name: string
    url: string
  }[],
): void
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
  synonyms?: {
    refseq: string
    genbank: string
  }
  meta: string
}
interface NCBIData {
  uids: string[]
  [key: string]: NCBIAssemblyEntry
}
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
/**
 * Reads a JSON file synchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns The parsed JSON object.
 */
declare function readJSON<T = unknown>(filePath: string): T
/**
 * Reads a JSON file asynchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns A promise that resolves to the parsed JSON object.
 */
declare function readJSONAsync<T = unknown>(filePath: string): Promise<T>
/**
 * Writes a JavaScript object to a JSON file.
 * @param filePath The path to the output JSON file.
 * @param data The data to write.
 */
declare function writeJSON(filePath: string, data: unknown): void
declare function myjsonfetch(url: string): Promise<unknown>
/**
 * Splits a string on the first occurrence of a separator.
 * @param str The string to split.
 * @param sep The separator string.
 * @returns A tuple containing the part before the separator and the part after.
 *          If the separator is not found, the second element will be an empty string.
 */
declare function splitOnFirst(str: string, sep: string): [string, string]
/**
 * Replaces specific relative links in a string with absolute UCSC genome links.
 * This is typically used for HTML content from UCSC track databases.
 * @param htmlContent The string containing HTML content.
 * @returns The string with replaced links.
 */
declare function replaceLink(htmlContent: string): string
/**
 * Decodes a URI component, gracefully handling malformed URIs.
 * @param uri The URI component to decode.
 * @returns The decoded URI component, or the original URI if decoding fails.
 */
declare function decodeURIComponentNoThrow(uri: string): string
/**
 * Validates that a required CLI argument is provided.
 * Exits with code 1 if the argument is missing.
 * @param arg The argument value to check.
 * @param usage The usage message to display if validation fails.
 * @returns The validated argument (non-null).
 */
declare function requireArg(arg: string | undefined, usage: string): string
//#endregion
export {
  NCBIAssemblyEntry,
  NCBIData,
  UCSCGenArkAssemblyEntry,
  categoryMap,
  decodeURIComponentNoThrow,
  dedupe,
  enhanceConfig,
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
  readJSONAsync,
  replaceLink,
  requireArg,
  resolve,
  splitOnFirst,
  writeJSON,
}
