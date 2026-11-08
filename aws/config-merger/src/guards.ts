import {
  isArrayOf,
  isOptional,
  isRecord,
  isShape,
  isString,
  isStringArray,
} from '../../../hubtools/src/guards.ts'

import type { Guard } from '../../../hubtools/src/guards.ts'
import type { JBrowseConfig } from './types.ts'

const optString = isOptional(isString)

const isAdapter = isShape({ type: isString, uri: isString })

const isAssembly = isShape({
  name: isString,
  displayName: optString,
  sequence: isShape({ type: isString, trackId: isString, adapter: isAdapter }),
  refNameAliases: isOptional(isShape({ adapter: isAdapter })),
})

const isTrack = isShape({
  trackId: isString,
  name: isString,
  type: isString,
  assemblyNames: isStringArray,
  adapter: isOptional(isShape({ type: isString })),
  category: isOptional(isStringArray),
})

const isPlugin = isShape({
  name: isString,
  url: optString,
  umdUrl: optString,
  esmUrl: optString,
  cjsUrl: optString,
})

const isDefaultSession = isShape({
  name: isString,
  views: isOptional(isArrayOf(isShape({ type: isString, id: isString }))),
})

const isTextSearchAdapter = isShape({
  type: isString,
  assemblyNames: isStringArray,
})

export const isJBrowseConfig: Guard<JBrowseConfig> = isShape({
  assemblies: isOptional(isArrayOf(isAssembly)),
  tracks: isOptional(isArrayOf(isTrack)),
  plugins: isOptional(isArrayOf(isPlugin)),
  defaultSession: isOptional(isDefaultSession),
  aggregateTextSearchAdapters: isOptional(isArrayOf(isTextSearchAdapter)),
})

export { isRecord }
