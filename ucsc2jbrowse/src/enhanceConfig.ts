import { readFileSync, writeFileSync } from 'fs'

const configPath = process.argv[2]!

interface JBrowseConfig {
  plugins?: Array<{ name: string; url: string }>
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

// Read existing config
const config: JBrowseConfig = JSON.parse(readFileSync(configPath, 'utf8'))

// Add plugins if not already present
if (!config.plugins) {
  config.plugins = []
}

const pluginsToAdd = [
  {
    name: 'MafViewer',
    url: 'https://unpkg.com/jbrowse-plugin-mafviewer/dist/jbrowse-plugin-mafviewer.umd.production.min.js',
  },
  {
    name: 'Hubs',
    url: 'https://unpkg.com/@cmdcolin/jbrowse-plugin-hubs/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  {
    name: 'Protein3d',
    url: 'https://unpkg.com/jbrowse-plugin-protein3d/dist/jbrowse-plugin-protein3d.umd.production.min.js',
  },
  {
    name: 'MsaView',
    url: 'https://unpkg.com/jbrowse-plugin-msaview/dist/jbrowse-plugin-msaview.umd.production.min.js',
  },
]

// Add plugins that aren't already in the config
for (const plugin of pluginsToAdd) {
  if (!config.plugins.some(p => p.name === plugin.name)) {
    config.plugins.push(plugin)
  }
}

// Add or update hierarchical configuration
if (!config.configuration) {
  config.configuration = {}
}

config.configuration.hierarchical = {
  sort: {
    trackNames: true,
    categories: true,
  },
  defaultCollapsed: {
    topLevelCategories: true,
    subCategories: true,
  },
}

// Write enhanced config back to file
writeFileSync(configPath, JSON.stringify(config, null, 2))

export {}
