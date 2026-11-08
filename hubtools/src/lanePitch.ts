// MultiWaySyntenyDisplay's MIN_LANE_PITCH, its gene-name row and its gap under
// a layer's band (laneStack.ts, laneLayers.ts): a track this tall per lane
// never scrolls. Its own subpath, with no imports, so a page's client island
// reads it without the rest of hubtools.
const LANE_PITCH = 22
const GENE_NAME_ROW = 12
const LAYER_GAP = 2

export const GC_BAND = 14

/** px a multi-way display gives each lane, by whether its lanes name their
 * genes and the heights of the layer bands under each */
export const lanePitch = (geneNames: boolean, layers: number[] = []) =>
  LANE_PITCH +
  (geneNames ? GENE_NAME_ROW : 0) +
  layers.reduce((n, height) => n + height + LAYER_GAP, 0)
