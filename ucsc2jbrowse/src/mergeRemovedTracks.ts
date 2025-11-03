import fs from 'fs'
import path from 'path'

interface RemovedTrack {
  trackId: string
  name: string
  reason: string
  assembly: string
}

/**
 * Merges all assembly-specific removed tracks JSON into a single removedTracks.json
 */
function mergeRemovedTracks() {
  const removedTracksDir = 'removedTracks'
  const outputFile = 'removedTracks.json'

  if (!fs.existsSync(removedTracksDir)) {
    console.log('No removedTracks directory found, nothing to merge')
    return
  }

  const files = fs
    .readdirSync(removedTracksDir)
    .filter(f => f.endsWith('.json'))

  if (files.length === 0) {
    console.log('No removed tracks found to merge')
    return
  }

  console.log(`Merging ${files.length} removed tracks files...`)

  const allTracks: RemovedTrack[] = []

  for (const file of files) {
    const filePath = path.join(removedTracksDir, file)
    try {
      const data = fs.readFileSync(filePath, 'utf-8')
      const tracks: RemovedTrack[] = JSON.parse(data)
      allTracks.push(...tracks)
    } catch (error) {
      console.error(`Error reading ${filePath}: ${error}`)
    }
  }

  // Group by reason for statistics
  const byReason = allTracks.reduce(
    (acc, track) => {
      acc[track.reason] = (acc[track.reason] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  console.log(`Merged ${allTracks.length} removed tracks`)
  console.log('Breakdown by reason:')
  for (const [reason, count] of Object.entries(byReason).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  - ${reason}: ${count}`)
  }

  fs.writeFileSync(outputFile, JSON.stringify(allTracks, null, 2))
  console.log(`Merged removed tracks written to ${outputFile}`)
}

mergeRemovedTracks()
