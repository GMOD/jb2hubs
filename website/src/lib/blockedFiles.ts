// ucsc2jbrowse/blockedFiles.json: every UCSC file the pipeline found it may not
// fetch, keyed by url. It named 19,229 files on 2026-09-24, 19,180 of them
// FANTOM5 bigWigs in seven directories, and a row per entry made
// /unavailableTracks a 7 MB page.
export interface BlockedEntry {
  blocked: boolean
  lastChecked: number
  trackName?: string
}

export interface BlockedDirectory {
  assembly: string
  directory: string
  files: string[]
  lastChecked: number
}

function decode(name: string) {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

// Most keys are full hgdownload urls, and 39 name one of those files again
// site-relative (/gbdb/hg19/...), so a file is grouped, and counted once, by
// its path.
export function groupBlockedFiles(
  entries: Record<string, BlockedEntry>,
): BlockedDirectory[] {
  const groups = new Map<
    string,
    { assembly: string; files: Set<string>; lastChecked: number }
  >()
  for (const [url, { blocked, lastChecked }] of Object.entries(entries)) {
    if (blocked) {
      const filePath = url.replace(/^https?:\/\/[^/]+/, '')
      const slash = filePath.lastIndexOf('/')
      const directory = filePath.slice(0, slash + 1)
      const group = groups.get(directory) ?? {
        assembly: /^\/(?:gbdb|goldenPath)\/([^/]+)\//.exec(filePath)?.[1] ?? '',
        files: new Set<string>(),
        lastChecked: 0,
      }
      group.files.add(decode(filePath.slice(slash + 1)))
      group.lastChecked = Math.max(group.lastChecked, lastChecked)
      groups.set(directory, group)
    }
  }
  return [...groups]
    .map(([directory, { assembly, files, lastChecked }]) => ({
      assembly,
      directory,
      files: [...files].sort(),
      lastChecked,
    }))
    .sort(
      (a, b) =>
        b.files.length - a.files.length ||
        a.directory.localeCompare(b.directory),
    )
}

export function fileExamples(files: string[], shown = 3) {
  const rest = files.length - shown
  return (
    files.slice(0, shown).join(', ') + (rest > 0 ? ` and ${rest} more` : '')
  )
}

const utcDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatCheckedDate(timestamp: number) {
  return utcDate.format(new Date(timestamp))
}
