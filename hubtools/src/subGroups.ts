function spaced(text: string) {
  return text.replaceAll('_', ' ')
}

/**
 * A track's subgroups as metadata: its `subGroups view=Signal cell=K562`
 * against the composite's `subGroupN cell Cell_Line K562=K562 …` definitions,
 * as `{ 'Cell Line': 'K562' }`, with UCSC's underscores read as spaces. The
 * settings are the track's merged with its ancestors', nearest winning, since
 * the definitions sit on the composite. JBrowse's own UCSC track hub
 * connection writes the same (`subGroupMetadata` in jbrowse-components'
 * `ucscTrackHub.ts`), so a hub opened either way gets the same columns.
 */
export function subGroupMetadata(settings: Record<string, string | undefined>) {
  const definitions = new Map(
    Object.entries(settings)
      .filter(([key]) => /^subGroup\d+$/.test(key))
      .map(([, value = '']) => {
        const [name = '', title = name, ...tags] = value.trim().split(/\s+/)
        const labels = new Map(
          tags.map(tag => {
            const [id = '', label = id] = tag.split('=')
            return [id, spaced(label)]
          }),
        )
        return [name, { title: spaced(title), labels }] as const
      }),
  )
  return Object.fromEntries(
    (settings.subGroups ?? '')
      .trim()
      .split(/\s+/)
      .flatMap(pair => {
        const [name = '', id = ''] = pair.split('=')
        const definition = definitions.get(name)
        return definition && id
          ? [[definition.title, definition.labels.get(id) ?? spaced(id)]]
          : []
      }),
  )
}
