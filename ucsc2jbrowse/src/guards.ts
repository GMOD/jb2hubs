import {
  isArrayOf,
  isBoolean,
  isJBrowsePlugin,
  isNumber,
  isOptional,
  isPlainRecord,
  isRecordOf,
  isShape,
  isString,
  isStringArray,
} from 'hubtools'

import type {
  ConfigExtension,
  FileAccessCache,
  JBrowseConfig,
  TrackDbEntry,
  UcscGenomeList,
  UcscGenomeRaw,
  UcscTrack,
} from './types.ts'
import type { Guard } from 'hubtools'

const optString = isOptional(isString)
const optRecord = isOptional(isPlainRecord)

const isUcscTrack: Guard<UcscTrack> = isShape({
  type: optString,
  category: isOptional(isStringArray),
  assemblyNames: isStringArray,
  name: isString,
  metadata: isOptional(
    isShape({
      addedByJBrowseTeam: isOptional(isBoolean),
      multiWigContainer: isOptional(isBoolean),
      ucsc: optRecord,
      annotationSource: optString,
      annotationDate: optString,
      differsFromUcsc: isOptional(isRecordOf(isString)),
    }),
  ),
  trackId: isString,
  description: optString,
  adapter: isPlainRecord,
})

const isAdapterHolder = isShape({ adapter: isPlainRecord })

const isAssembly = isShape({
  name: isString,
  displayName: optString,
  aliases: isOptional(isStringArray),
  sequence: isOptional(
    isShape({
      type: isString,
      trackId: isString,
      metadata: optRecord,
      adapter: isPlainRecord,
    }),
  ),
  refNameAliases: isOptional(isAdapterHolder),
  cytobands: isOptional(isAdapterHolder),
  geneticCodes: isOptional(isRecordOf(isNumber)),
  circularRefNames: isOptional(isStringArray),
})

const isDefaultSession = isShape({
  name: isString,
  views: isArrayOf(
    isShape({
      id: isString,
      type: isString,
      init: isShape({
        loc: isString,
        assembly: isString,
        tracks: isOptional(isStringArray),
      }),
    }),
  ),
  widgets: isShape({
    hierarchicalTrackSelector: isShape({
      id: isString,
      type: isString,
      view: isString,
    }),
  }),
  activeWidgets: isShape({ hierarchicalTrackSelector: isString }),
})

const configSections = {
  configuration: optRecord,
  defaultSession: isOptional(isDefaultSession),
  plugins: isOptional(isArrayOf(isJBrowsePlugin)),
  aggregateTextSearchAdapters: isOptional(isArrayOf(isPlainRecord)),
}

export const isUcscConfig: Guard<JBrowseConfig> = isShape({
  ...configSections,
  tracks: isArrayOf(isUcscTrack),
  assemblies: isArrayOf(isAssembly),
})

const isAssemblyPatch = isShape({
  name: optString,
  displayName: optString,
  aliases: isOptional(isStringArray),
  refNameAliases: isOptional(isAdapterHolder),
  cytobands: isOptional(isAdapterHolder),
  geneticCodes: isOptional(isRecordOf(isNumber)),
  circularRefNames: isOptional(isStringArray),
})

export const isConfigExtension: Guard<ConfigExtension> = isShape({
  ...configSections,
  tracks: isOptional(isArrayOf(isUcscTrack)),
  assemblies: isOptional(isArrayOf(isAssemblyPatch)),
})

export const isUcscGenomeList: Guard<UcscGenomeList> = isShape({
  ucscGenomes: isRecordOf(
    isShape({
      id: isString,
      description: isString,
      defaultPos: isString,
      organism: optString,
    }),
  ),
})

export const isUcscGenomeRawList: Guard<{
  ucscGenomes: Record<string, UcscGenomeRaw>
}> = isShape({
  ucscGenomes: isRecordOf(
    isShape({
      organism: isString,
      description: isString,
      defaultPos: isString,
      scientificName: isString,
      sourceName: isString,
      nibPath: isString,
      taxId: isNumber,
    }),
  ),
})

export const isTrackDb: Guard<Record<string, TrackDbEntry>> = isRecordOf(
  isShape({
    tableName: isString,
    settings: isString,
    html: isString,
    longLabel: isString,
    grp: isString,
    shortLabel: isString,
    type: isString,
  }),
)

export const isFileAccessCache: Guard<FileAccessCache> = isRecordOf(
  isShape({
    lastChecked: isNumber,
    blocked: isBoolean,
    trackName: optString,
  }),
)

export const isRemovedTracks = isArrayOf(
  isShape({
    trackId: isString,
    name: isString,
    reason: isString,
    assembly: isString,
  }),
)
