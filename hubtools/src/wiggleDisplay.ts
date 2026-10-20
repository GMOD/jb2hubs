// Derives a LinearWiggleDisplay from a bigWig's trackDb `windowingFunction` and
// `viewLimits`, in v5's spelling. A v4 host ignores both keys and draws its
// defaults.

export interface WiggleDisplay {
  type: 'LinearWiggleDisplay'
  displayId: string
  y?: string
  extent?: string
  scales?: { y: { domainMin: number; domainMax: number } }
}

// A windowing function is which of a zoom bin's stored summaries UCSC plots,
// which JBrowse's `y` names, and whiskers its min-to-max `extent`
const SUMMARIES: Record<string, { y: string; extent?: string }> = {
  maximum: { y: 'maxScore' },
  minimum: { y: 'minScore' },
  mean: { y: 'score' },
  'mean+whiskers': { y: 'score', extent: 'min-max' },
}

function summaryOf(ucsc: Record<string, unknown>) {
  const { windowingFunction } = ucsc
  return typeof windowingFunction === 'string'
    ? SUMMARIES[windowingFunction.toLowerCase()]
    : undefined
}

// UCSC draws viewLimits only while autoScale is off, which is a bigWig's
// default.
function viewLimits(ucsc: Record<string, unknown>) {
  const { viewLimits, autoScale } = ucsc
  if (
    typeof viewLimits !== 'string' ||
    (typeof autoScale === 'string' && autoScale.toLowerCase() !== 'off')
  ) {
    return undefined
  }
  const [domainMin, domainMax] = viewLimits.split(':').map(Number)
  return domainMin !== undefined &&
    domainMax !== undefined &&
    Number.isFinite(domainMin) &&
    Number.isFinite(domainMax) &&
    domainMin < domainMax
    ? { domainMin, domainMax }
    : undefined
}

export function getUcscWiggleDisplay(
  trackId: string,
  ucsc: Record<string, unknown>,
): WiggleDisplay | undefined {
  const summary = summaryOf(ucsc)
  const limits = viewLimits(ucsc)
  return summary !== undefined || limits !== undefined
    ? {
        type: 'LinearWiggleDisplay',
        displayId: `${trackId}-LinearWiggleDisplay`,
        ...summary,
        ...(limits !== undefined ? { scales: { y: limits } } : {}),
      }
    : undefined
}
