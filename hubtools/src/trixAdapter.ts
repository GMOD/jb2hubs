interface Config {
  aggregateTextSearchAdapters?: Record<string, unknown>[]
}

// `jbrowse text-index` from @jbrowse/cli 5.0.0-beta.16 rewrites an index's
// TrixTextSearchAdapter without `textSearchAdapterId` or `metaFilePath`.
// Releases before v5 require the id, and fail the whole session without it
// ("No matching type for union"): 360 GenArk configs shipped that way on
// 2026-10-20. This puts both back, in the order the pipelines write them.
export function restoreTrixAdapters(config: Config) {
  if (!config.aggregateTextSearchAdapters) {
    return 0
  }
  let restored = 0
  config.aggregateTextSearchAdapters = config.aggregateTextSearchAdapters.map(
    adapter => {
      const { type, textSearchAdapterId, ixFilePath, ixxFilePath, ...rest } =
        adapter
      const name = /^trix\/(.+)\.ix$/.exec(
        (ixFilePath as { uri?: string } | undefined)?.uri ?? '',
      )?.[1]
      if (type !== 'TrixTextSearchAdapter' || textSearchAdapterId || !name) {
        return adapter
      }
      restored++
      const { metaFilePath, assemblyNames, ...others } = rest
      return {
        type,
        textSearchAdapterId: `${name}-index`,
        ixFilePath,
        ixxFilePath,
        metaFilePath: metaFilePath ?? {
          uri: `trix/${name}_meta.json`,
          locationType: 'UriLocation',
        },
        assemblyNames,
        ...others,
      }
    },
  )
  return restored
}
