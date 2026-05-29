import { readJSON, writeJSON } from './util.ts'

interface JBrowseConfig {
  plugins?: { name: string; url: string }[]
  assemblies?: unknown[]
  tracks?: unknown[]
  configuration?: {
    hierarchical?: {
      sort?: {
        trackNames?: boolean
        categories?: boolean
      }
      defaultCollapsed?: {
        topLevelCategories?: boolean
        subCategories?: boolean
      }
    }
  }
}

const defaultPlugins = [
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
]

/**
 * Enhances a JBrowse configuration file with standard plugins and hierarchical settings.
 * @param configPath Path to the config.json file to enhance.
 * @param plugins Optional array of plugins to add. Defaults to standard JBrowse plugins.
 */
export function enhanceConfig(
  configPath: string,
  plugins: { name: string; url: string }[] = defaultPlugins,
): void {
  const config = readJSON<JBrowseConfig>(configPath)

  config.plugins ??= []

  for (const plugin of plugins) {
    if (!config.plugins.some(p => p.name === plugin.name)) {
      config.plugins.push(plugin)
    }
  }

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
