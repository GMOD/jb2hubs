// EBI Job Dispatcher (Clustal Omega) is our multiple-sequence aligner —
// react-msaview renders alignments but does not compute them, and NCBI has no
// clean alignment API. The service is async: submit returns a job id, which we
// poll until FINISHED, then fetch the aligned FASTA and the guide tree. EBI
// sends `access-control-allow-origin: *`, so this runs from the browser.
//
// EBI requires a contact email and validates that its domain has a real MX
// record (jbrowse.org is rejected, gmail is fine), so this is a real address.

const CLUSTALO = 'https://www.ebi.ac.uk/Tools/services/rest/clustalo'

export const EBI_EMAIL = 'colin.diesh@gmail.com'

interface ClustalOptions {
  email?: string
  pollMs?: number
  timeoutMs?: number
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function text(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`EBI request failed (${res.status})`)
  }
  return (await res.text()).trim()
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
  }: ClustalOptions = {},
): Promise<{ aligned: string; newick: string }> {
  const body = new URLSearchParams({ email, stype: 'protein', sequence: fasta })
  const jobId = await text(`${CLUSTALO}/run`, { method: 'POST', body })
  if (!jobId.startsWith('clustalo-')) {
    throw new Error(`EBI submission rejected: ${jobId.slice(0, 200)}`)
  }

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await text(`${CLUSTALO}/status/${jobId}`)
    if (status === 'FINISHED') {
      const [aligned, newick] = await Promise.all([
        text(`${CLUSTALO}/result/${jobId}/fa`),
        text(`${CLUSTALO}/result/${jobId}/phylotree`),
      ])
      return { aligned, newick }
    }
    if (status !== 'RUNNING' && status !== 'QUEUED') {
      throw new Error(`EBI alignment job ${status}`)
    }
    await delay(pollMs)
  }
  throw new Error('EBI alignment timed out')
}
