import { getUcscFeatureDisplay } from './featureDisplay.ts'
import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig, JBrowsePlugin, Track } from './types.ts'

// The BLAT plugin pairs with the sequence.metadata.blatDb stamp (createAssembly /
// generateJBrowseConfigForAssemblyHub). It is opt-in via BLAT_PLUGIN_URL because
// a plugin url that 404s hard-fails the whole web session (PluginLoader.load runs
// Promise.all over every entry), and web BLAT queries only work once the
// CORS/apiKey proxy is live. Set BLAT_PLUGIN_URL for a rebuild only after the UMD
// build is published and the proxy is deployed. The name must be 'Blat' so
// PluginLoader finds the JBrowsePluginBlat UMD global.
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
