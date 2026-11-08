import {
  isArray,
  isArrayOf,
  isBoolean,
  isNullable,
  isNumber,
  isOptional,
  isShape,
  isString,
} from './guards.ts'

import type { Guard } from './guards.ts'
import type {
  HierarchicalConfig,
  JBrowseConfig,
  JBrowseConfiguration,
  JBrowsePlugin,
  Track,
  UCSCGenArkAssemblyEntry,
} from './types.ts'

const optBoolean = isOptional(isBoolean)

export const isJBrowsePlugin: Guard<JBrowsePlugin> = isShape({
  name: isString,
  url: isOptional(isString),
  storePlugin: isOptional(isString),
})

export const isTrack: Guard<Track> = isShape({ trackId: isString })

const isHierarchicalConfig: Guard<HierarchicalConfig> = isShape({
  sort: isOptional(isShape({ trackNames: optBoolean, categories: optBoolean })),
  defaultCollapsed: isOptional(
    isShape({ topLevelCategories: optBoolean, subCategories: optBoolean }),
  ),
})

const isJBrowseConfiguration: Guard<JBrowseConfiguration> = isShape({
  hierarchical: isOptional(isHierarchicalConfig),
})

export const isJBrowseConfig: Guard<JBrowseConfig> = isShape({
  plugins: isOptional(isArrayOf(isJBrowsePlugin)),
  assemblies: isOptional(isArray),
  tracks: isOptional(isArrayOf(isTrack)),
  configuration: isOptional(isJBrowseConfiguration),
})

export const isUCSCGenArkAssemblyEntry: Guard<UCSCGenArkAssemblyEntry> =
  isShape({
    taxId: isNumber,
    asmId: isString,
    genBank: isNullable(isString),
    refSeq: isNullable(isString),
    identical: isBoolean,
    sciName: isString,
    comName: isString,
    ucscBrowser: isString,
  })

export const isGenArkHubList = isShape({
  data: isArrayOf(isUCSCGenArkAssemblyEntry),
})
