// One request to the hgdownload family per interval across a process, whatever
// its callers' concurrency: hgdownload stops answering a host after a burst
// (agent-docs/reference/TRACK_URL_CHECKS.md).
const HGDOWNLOAD_URL = /^https?:\/\/hgdownload[\w.-]*\.ucsc\.edu\//

let intervalMs = 250
let nextSlotAt = 0

export function setHgdownloadIntervalMs(ms: number) {
  intervalMs = ms
  nextSlotAt = 0
}

export async function waitForHgdownloadSlot(url: string) {
  if (HGDOWNLOAD_URL.test(url)) {
    const now = Date.now()
    const at = Math.max(now, nextSlotAt)
    nextSlotAt = at + intervalMs
    if (at > now) {
      await new Promise(resolve => setTimeout(resolve, at - now))
    }
  }
}
