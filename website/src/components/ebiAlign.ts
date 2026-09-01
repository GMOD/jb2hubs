// EBI Job Dispatcher (Clustal Omega) is our multiple-sequence aligner —
// react-msaview renders alignments but does not compute them, and NCBI has no
// clean alignment API. The service is async: submit returns a job id, which we
// poll until FINISHED, then fetch the aligned FASTA and the guide tree. EBI
// sends `access-control-allow-origin: *`, so this runs from the browser.
//
// EBI requires a contact email and validates that its domain has a real MX
// record (jbrowse.org is rejected), so this is the project's real mailbox. It
// ships to every visitor, since the job is submitted from their browser.

const CLUSTALO = 'https://www.ebi.ac.uk/Tools/services/rest/clustalo'

export const EBI_EMAIL = 'jbrowse2@berkeley.edu'

interface ClustalOptions {
  email?: string
  pollMs?: number
  timeoutMs?: number
  // aborting stops the polling; the job itself runs on at EBI, which offers no
  // cancel and drops it on its own
  signal?: AbortSignal
}

async function text(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`EBI request failed (${res.status})`)
  }
  return (await res.text()).trim()
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('EBI alignment abandoned', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Align protein sequences (FASTA in, FASTA out). Sequence ids in the input FASTA
// flow through to both the aligned output and the tree leaf names, so the caller
// controls the labels used everywhere downstream.
export async function clustalOmega(
  fasta: string,
  {
    email = EBI_EMAIL,
    pollMs = 2000,
    timeoutMs = 180_000,
    signal,
  }: ClustalOptions = {},
): Promise<{ aligned: string; newick: string }> {
  const body = new URLSearchParams({ email, stype: 'protein', sequence: fasta })
  const jobId = await text(`${CLUSTALO}/run`, { method: 'POST', body, signal })
  if (!jobId.startsWith('clustalo-')) {
    throw new Error(`EBI submission rejected: ${jobId.slice(0, 200)}`)
  }

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await text(`${CLUSTALO}/status/${jobId}`, { signal })
    if (status === 'FINISHED') {
      const [aligned, newick] = await Promise.all([
        text(`${CLUSTALO}/result/${jobId}/fa`, { signal }),
        text(`${CLUSTALO}/result/${jobId}/phylotree`, { signal }),
      ])
      return { aligned, newick }
    }
    if (status !== 'RUNNING' && status !== 'QUEUED') {
      throw new Error(`EBI alignment job ${status}`)
    }
    await sleep(pollMs, signal)
  }
  throw new Error('EBI alignment timed out')
}
