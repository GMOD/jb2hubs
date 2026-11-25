import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  setHgdownloadIntervalMs,
  waitForHgdownloadSlot,
} from './hgdownloadPace.ts'

async function startTimes(urls: string[]) {
  const started: number[] = []
  await Promise.all(
    urls.map(async url => {
      await waitForHgdownloadSlot(url)
      started.push(Date.now())
    }),
  )
  return started.toSorted((a, b) => a - b)
}

afterEach(() => {
  setHgdownloadIntervalMs(250)
})

describe('waitForHgdownloadSlot', () => {
  it('spaces requests across the hgdownload family', async () => {
    setHgdownloadIntervalMs(40)
    const begin = Date.now()
    const started = await startTimes([
      'https://hgdownload.soe.ucsc.edu/hubs/a/hub.txt',
      'https://hgdownload2.soe.ucsc.edu/hubs/a/hub.txt',
      'https://hgdownload.gi.ucsc.edu/gbdb/hg38/x.bb',
    ])
    assert.ok(started.at(-1)! - begin >= 2 * 40)
  })

  it('lets every other host through at once', async () => {
    setHgdownloadIntervalMs(1000)
    const begin = Date.now()
    await startTimes([
      'https://jbrowse.org/ucsc/hg38/config.json',
      'https://api.genome.ucsc.edu/list/ucscGenomes',
      'https://ftp.ncbi.nlm.nih.gov/x',
    ])
    assert.ok(Date.now() - begin < 100)
  })
})
