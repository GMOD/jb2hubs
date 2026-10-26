import { addColumnDisplay } from './columnDisplays.ts'
import {
  COLOR_DERIVED_PATHS,
  FEATURE_DERIVED_PATHS,
  WIGGLE_DERIVED_PATHS,
  withDerivedDisplay,
} from './derivedDisplay.ts'
import { getUcscFeatureDisplay } from './featureDisplay.ts'
import { getUcscColorDisplay } from './fieldColor.ts'
import {
  addNcbiGffLabelDisplay,
  addNcbiGffLinks,
  addNcbiGffTextSearching,
} from './ncbiGff.ts'
import { addRepeatClassDisplay } from './repeatClassDisplay.ts'
import { ucscFormatDetails } from './ucscDetailLinks.ts'
import { isRecord } from './util.ts'
import { getUcscWiggleDisplay } from './wiggleDisplay.ts'

import type { JBrowseConfig, JBrowsePlugin, Track } from './types.ts'

// Each entry names the plugin store ENTRY. A url in a config is an answer
// computed the day the config was generated, and these configs are never
// revisited; `storePlugin` defers the choice to load time, when the host reads
// plugin-store/v2/plugins.json and gets the pinned, integrity-carrying build
// for the JBrowse version it is. See jbrowse-plugin-list ADR 0008.
//
// Its value is the store's `name`, which is why it repeats `name` here. NOT the
// npm package: npm and the plugin's author own that string and can rescope it,
// which would strand every config that had named it. The store owns its `name`
// and can repoint it at a different package without touching a config.
//
// A url beside a ref is what the host loads when the store cannot answer
// (unreachable, or the name unlisted). Hubs keeps its `latest/` path for that,
// never the bare `<pkg>/dist/<umd>` v1 layout, which is no longer republished.
// Protein3d's and MsaView's last UMD builds were tested on v4 alone, so they
// carry no url.
//
// Core vendors MafViewer, so every host we target drops an entry naming it;
// RETIRED_PLUGIN_NAMES takes it out of a config built before that. BLAT is
// deliberately not in the store, see stagingEnhanceOptions.
const defaultPlugins: JBrowsePlugin[] = [
  {
    name: 'Hubs',
    storePlugin: 'Hubs',
    url: 'https://jbrowse.org/plugins/@cmdcolin/jbrowse-plugin-hubs/latest/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  { name: 'Protein3d', storePlugin: 'Protein3d' },
  { name: 'MsaView', storePlugin: 'MsaView' },
]

const RETIRED_PLUGIN_NAMES = new Set(['MafViewer'])

function ucscMetadata(track: Track) {
  const { metadata } = track
  return isRecord(metadata) && isRecord(metadata.ucsc)
    ? metadata.ucsc
    : undefined
}

// Labels/tooltips/filters bigBed FeatureTracks from the columns UCSC's trackDb
// intends (e.g. gnomAD _displayName, ncbiGene geneName2, JASPAR's score cutoff).
function deriveFeatureDisplay(track: Track, ucscDb?: string): Track {
  const ucsc = ucscMetadata(track)
  if (track.type !== 'FeatureTrack' || ucsc === undefined) {
    return track
  }
  // Track-level rather than display-level, so it rides both branches below.
  // Left alone when the track already carries a hand-authored formatDetails.
  const formatDetails = ucscFormatDetails(
    ucsc,
    isRecord(track.adapter) ? track.adapter : undefined,
    ucscDb,
  )
  const base: Track =
    formatDetails !== undefined && track.formatDetails === undefined
      ? { ...track, formatDetails }
      : track

  return withDerivedDisplay(
    base,
    getUcscFeatureDisplay(base.trackId, ucsc).displays?.[0],
    FEATURE_DERIVED_PATHS,
  )
}

function deriveWiggleDisplay(track: Track): Track {
  const ucsc = ucscMetadata(track)
  return track.type === 'QuantitativeTrack' && ucsc !== undefined
    ? withDerivedDisplay(
        track,
        getUcscWiggleDisplay(track.trackId, ucsc),
        WIGGLE_DERIVED_PATHS,
      )
    : track
}

function deriveColorDisplay(track: Track): Track {
  const ucsc = ucscMetadata(track)
  return track.type === 'FeatureTrack' && ucsc !== undefined
    ? withDerivedDisplay(
        track,
        getUcscColorDisplay(track.trackId, ucsc),
        COLOR_DERIVED_PATHS,
      )
    : track
}

// The versioned UMD path: a config that names it picks up compatible updates,
// while a change needing a newer JBrowse than some host runs gets a v2 instead
// of breaking configs already published.
const BLAT_PLUGIN_URL_V1 =
  'https://jbrowse.org/plugins/jbrowse-plugin-blat/dist/v1/jbrowse-plugin-blat.umd.production.min.js'

// What config-staging.json gets on top of production. The BLAT plugin is kept
// out of the plugin store, since it is zero-config only on UCSC-hosted genomes.
export const stagingEnhanceOptions = {
  plugins: [...defaultPlugins, { name: 'Blat', url: BLAT_PLUGIN_URL_V1 }],
}

export function enhanceConfigObject(
  config: JBrowseConfig,
  {
    plugins = defaultPlugins,
    ucscDb,
  }: {
    plugins?: JBrowsePlugin[]
    ucscDb?: string
  } = {},
) {
  config.plugins = (config.plugins ?? []).filter(
    p => !RETIRED_PLUGIN_NAMES.has(p.name),
  )

  // Upsert the whole entry by name: the staging pass and the mouse-strain
  // builder re-run over already-enhanced configs, and an entry kept on a name
  // match never received a changed url or the `storePlugin` (the stale
  // protein3d bundle outlived four plugin releases that way). Replacing it also
  // drops a url this list stopped writing.
  for (const plugin of plugins) {
    const index = config.plugins.findIndex(p => p.name === plugin.name)
    if (index === -1) {
      config.plugins.push(plugin)
    } else {
      config.plugins[index] = plugin
    }
  }

  config.tracks = config.tracks
    ?.map(track => deriveFeatureDisplay(track, ucscDb))
    .map(deriveColorDisplay)
    .map(deriveWiggleDisplay)
    .map(addNcbiGffLabelDisplay)
    .map(addNcbiGffTextSearching)
    .map(addNcbiGffLinks)
    .map(addRepeatClassDisplay)
    .map(addColumnDisplay)

  config.configuration ??= {}
  config.configuration.hierarchical = {
    ...config.configuration.hierarchical,
    sort: {
      ...config.configuration.hierarchical?.sort,
      trackNames: true,
      categories: true,
    },
    defaultCollapsed: {
      ...config.configuration.hierarchical?.defaultCollapsed,
      topLevelCategories: true,
      subCategories: true,
    },
  }
  return config
}
