import {
  CACHE_TTL_MS,
  isDegraded,
  probeUcscLiveness,
  type LivenessResult,
  type UcscLiveness,
} from './ucscLiveness.ts'

// What a reader actually needs is not "UCSC is down" but "which of these launch
// buttons will do nothing, and will it tell me".
//
// The two arms fail differently, and that difference is the whole reason to say
// anything. A UCSC assembly's chrom.sizes, chromAlias and cytoBand are mirrored
// beside its config on our own storage, so loadPre() resolves and the assembly
// opens — the reference sequence and any track served from UCSC are what hang. A
// GenArk hub's chromSizes and refNameAliases still come straight from
// hgdownload, and both sit in that same Promise.all, so the assembly itself never
// opens. See CLAUDE.md, "Assembly sidecars are mirrored on UCSC only".
function consequences(verdict: UcscLiveness) {
  const verb = verdict === 'stalled' ? 'will' : 'may'
  return [
    `UCSC assemblies (hg38, mm39, hs1, …) still open, because their chromosome sizes and aliases come from our storage. The reference sequence and any track served from UCSC ${verb} hang.`,
    `GenArk assemblies (GCA_/GCF_ accessions) ${verb} not open at all: their chromosome sizes come directly from UCSC.`,
  ]
}

// The banner's wording for a verdict, or undefined when there is nothing to say:
// a healthy upstream and an inconclusive probe both render nothing.
export function bannerText({ verdict, elapsedMs }: LivenessResult) {
  if (!isDegraded(verdict)) {
    return undefined
  }
  return {
    headline:
      verdict === 'stalled'
        ? "UCSC's download server is not responding"
        : `UCSC's download server is responding slowly (${(elapsedMs / 1000).toFixed(1)}s)`,
    detail:
      verdict === 'stalled'
        ? ', which is accepting connections without answering them — so data requests hang instead of failing, and a track will sit on a loading spinner rather than show an error.'
        : ', which is answering far slower than usual. Tracks may take a very long time to load, or appear to hang.',
    consequences: consequences(verdict),
  }
}

// The host and the clause after it go into one element, so no markup
// whitespace can fall between them: an inline <code> carries padding, and a
// comma after a space renders detached from it, as "edu ,".
function render(banner: HTMLElement, result: LivenessResult) {
  const text = bannerText(result)
  banner.hidden = !text
  if (text) {
    banner.querySelector('[data-headline]')!.textContent = text.headline
    banner.querySelector('[data-detail]')!.replaceChildren(
      Object.assign(document.createElement('code'), {
        textContent: 'hgdownload.soe.ucsc.edu',
      }),
      text.detail,
    )
    banner
      .querySelector('[data-consequences]')!
      .replaceChildren(
        ...text.consequences.map(line =>
          Object.assign(document.createElement('li'), { textContent: line }),
        ),
      )
  }
}

// Probes once the browser is idle, since this is never the reason to delay a
// page, and again every CACHE_TTL_MS while the tab is visible. The probe's own
// cache and catch mean a repeat costs nothing inside the TTL and a failure is a
// verdict, not an exception.
export function mountUcscStatusBanners() {
  const banners = document.querySelectorAll<HTMLElement>(
    '[data-ucsc-status-banner]',
  )
  const update = () => {
    if (!document.hidden) {
      void probeUcscLiveness().then(result => {
        for (const banner of banners) {
          render(banner, result)
        }
      })
    }
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(update)
  } else {
    setTimeout(update, 1)
  }
  setInterval(update, CACHE_TTL_MS)
}
