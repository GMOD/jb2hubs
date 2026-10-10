// Derives a LinearWiggleDisplay from a bigWig's trackDb `windowingFunction` and
// `viewLimits`, in v5's spelling. A v4 host ignores both keys and draws its
// defaults.

export interface WiggleDisplay {
  type: 'LinearWiggleDisplay'
  displayId: string
  aggregate?: string
  scales?: { y: { domainMin: number; domainMax: number } }
}

const AGGREGATES: Record<string, string> = {
  maximum: 'max',
  minimum: 'min',
  mean: 'mean',
  'mean+whiskers': 'whiskers',
}

function aggregateOf(ucsc: Record<string, unknown>) {
  const { windowingFunction } = ucsc
  return typeof windowingFunction === 'string'
    ? AGGREGATES[windowingFunction.toLowerCase()]
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
  const mode = aggregateOf(ucsc)
  const y = viewLimits(ucsc)
  return mode !== undefined || y !== undefined
    ? {
        type: 'LinearWiggleDisplay',
        displayId: `${trackId}-LinearWiggleDisplay`,
        ...(mode !== undefined ? { aggregate: mode } : {}),
        ...(y !== undefined ? { scales: { y } } : {}),
      }
    : undefined
}
