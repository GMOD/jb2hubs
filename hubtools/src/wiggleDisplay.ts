// Derives a LinearWiggleDisplay from a bigWig's trackDb `windowingFunction` and
// `viewLimits`, as `encoding.y`. A host older than `encoding.y` ignores both
// and draws its defaults.

export interface WiggleYChannel {
  field?: string
  scale?: { domainMin: number; domainMax: number }
}

export interface WiggleDisplay {
  type: 'LinearWiggleDisplay'
  displayId: string
  mark?: { extent: string }
  encoding: { y: WiggleYChannel }
}

// A windowing function is which of a zoom bin's stored summaries UCSC plots,
// which JBrowse's `encoding.y.field` names, and whiskers its min-to-max
// `mark.extent`
const SUMMARIES: Record<string, { field: string; extent?: string }> = {
  maximum: { field: 'maxScore' },
  minimum: { field: 'minScore' },
  mean: { field: 'score' },
  'mean+whiskers': { field: 'score', extent: 'min-max' },
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
        ...(summary?.extent !== undefined
          ? { mark: { extent: summary.extent } }
          : {}),
        encoding: {
          y: {
            ...(summary !== undefined ? { field: summary.field } : {}),
            ...(limits !== undefined ? { scale: limits } : {}),
          },
        },
      }
    : undefined
}
