export interface JBrowseConfig {
  assemblies?: Assembly[]
  tracks?: Track[]
  defaultSession?: DefaultSession
  aggregateTextSearchAdapters?: AggregateTextSearchAdapter[]
  [key: string]: unknown
}

export interface Assembly {
  name: string
  displayName?: string
  sequence: {
    type: string
    trackId: string
    adapter: {
      type: string
      uri: string
      [key: string]: unknown
    }
    metadata?: unknown
  }
  refNameAliases?: {
    adapter: {
      type: string
      uri: string
      [key: string]: unknown
    }
  }
  [key: string]: unknown
}

export interface Track {
  trackId: string
  name: string
  type: string
  assemblyNames: string[]
  adapter?: {
    type: string
    [key: string]: unknown
  }
  category?: string[]
  metadata?: unknown
  [key: string]: unknown
}

export interface SyntenyTrack {
  trackId: string
  name: string
  assemblyNames: string[]
  configFile?: string
  adapter: {
    type: string
    targetAssembly: string
    queryAssembly: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface DefaultSession {
  name: string
  views?: View[]
  widgets?: unknown
  activeWidgets?: unknown
  [key: string]: unknown
}

export interface View {
  type: string
  id: string
  [key: string]: unknown
}

export interface AggregateTextSearchAdapter {
  type: string
  textSearchAdapterId: string
  assemblyNames: string[]
  [key: string]: unknown
}

export interface MergeOptions {
  includeSyntenyTracks?: boolean
  syntenyTracks?: SyntenyTrack[]
  createDefaultSession?: boolean
  sessionType?: 'linear' | 'synteny'
}
