import { getUcscFeatureDisplay } from './featureDisplay.ts'
import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig, JBrowsePlugin, Track } from './types.ts'

// The BLAT plugin pairs with the sequence.metadata.blatDb stamp (createAssembly /
// generateJBrowseConfigForAssemblyHub). It is opt-in via BLAT_PLUGIN_URL because
// a plugin url that 404s hard-fails the whole web session (PluginLoader.load runs
// Promise.all over every entry). The name must be 'Blat' so PluginLoader finds
// the JBrowsePluginBlat UMD global.
//
// As of 2026-07-26 two of the three preconditions are met:
//   - the UMD build is published:
//     https://jbrowse.org/plugins/jbrowse-plugin-blat/dist/jbrowse-plugin-blat.umd.production.min.js
//   - the CORS/apiKey proxy is live at https://api.jbrowse.org/ucsc/v1/{blat,ispcr},
//     and is what the plugin defaults to in a browser
//
// The third is a JBrowse RELEASE. A BLAT hit is added as an AlignmentsTrack over
// a SamAdapter, and SamAdapter landed after v4.3.0 — so on JBROWSE_BASE
// `.../jb2/latest` the plugin loads, the query runs, and the result track then
// fails as an unknown adapter type. Enable this only once the release that
// carries SamAdapter is what `latest` serves (or, for a staging-only rebuild,
// once configs are no longer shared with production).
const blatPlugin: JBrowsePlugin[] = process.env.BLAT_PLUGIN_URL
  ? [{ name: 'Blat', url: process.env.BLAT_PLUGIN_URL }]
  : []

const defaultPlugins: JBrowsePlugin[] = [
  {
    name: 'MafViewer',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/dist/jbrowse-plugin-mafviewer.umd.production.min.js',
  },
  {
    name: 'Hubs',
    url: 'https://jbrowse.org/plugins/@cmdcolin/jbrowse-plugin-hubs/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  {
    name: 'Protein3d',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-protein3d/dist/jbrowse-plugin-protein3d.umd.production.min.js',
  },
  {
    name: 'MsaView',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-msaview/dist/jbrowse-plugin-msaview.umd.production.min.js',
  },
  ...blatPlugin,
]

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

// Labels/tooltips bigBed FeatureTracks from the columns UCSC's trackDb intends
// (e.g. gnomAD _displayName, ncbiGene geneName2), leaving any hand-authored
// display untouched.
function deriveFeatureDisplay(track: Track): Track {
  const { metadata } = track
  const ucsc =
    isRecord(metadata) && isRecord(metadata.ucsc) ? metadata.ucsc : undefined
  return track.type === 'FeatureTrack' &&
    ucsc !== undefined &&
    track.displays === undefined
    ? { ...track, ...getUcscFeatureDisplay(track.trackId, ucsc) }
    : track
}

/**
 * Enhances a JBrowse configuration file with standard plugins and hierarchical settings.
 * @param configPath Path to the config.json file to enhance.
 * @param plugins Optional array of plugins to add. Defaults to standard JBrowse plugins.
 */
export function enhanceConfig(
  configPath: string,
  plugins: JBrowsePlugin[] = defaultPlugins,
): void {
  const config = readJSON<JBrowseConfig>(configPath)

  config.plugins ??= []

  for (const plugin of plugins) {
    if (!config.plugins.some(p => p.name === plugin.name)) {
      config.plugins.push(plugin)
    }
  }

  config.tracks = config.tracks?.map(deriveFeatureDisplay)

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

  writeJSON(configPath, config)
}
