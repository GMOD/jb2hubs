import { getUcscFeatureDisplay } from './featureDisplay.ts'
import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig, JBrowsePlugin, Track } from './types.ts'

// The BLAT plugin pairs with the sequence.metadata.blatDb stamp (createAssembly /
// generateJBrowseConfigForAssemblyHub). It is opt-in via BLAT_PLUGIN_URL because
// a plugin url that 404s hard-fails the whole web session (PluginLoader.load runs
// Promise.all over every entry). The name must be 'Blat' so PluginLoader finds
// the JBrowsePluginBlat UMD global.
//
// As of 2026-07-26 the pieces are in place:
//   - the UMD build is published, at a VERSIONED path:
//     https://jbrowse.org/plugins/jbrowse-plugin-blat/dist/v1/jbrowse-plugin-blat.umd.production.min.js
//     v1 keeps receiving compatible updates, so a config that names it picks
//     those up; a change needing a newer JBrowse than some host runs gets a v2
//     instead of breaking the configs already out there. Use the versioned URL,
//     never a bare .../dist/ one.
//   - the CORS/apiKey proxy is live at https://api.jbrowse.org/ucsc/v1/{blat,ispcr},
//     and is what the plugin defaults to in a browser
//   - results degrade on an older host. They are drawn as an AlignmentsTrack
//     over a SamAdapter, which postdates v4.3.0 and so is absent from whatever
//     `.../jb2/latest` currently serves; the plugin checks and falls back to a
//     plain feature track there, rather than adding one that cannot resolve its
//     adapter. So this no longer waits on a release.
//
// It is deliberately NOT in the JBrowse plugin store: the store implies plug and
// play, and BLAT is only zero-config for genomes UCSC hosts (elsewhere it wants
// a db set in advanced settings). Hence a plain hosted URL.
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
