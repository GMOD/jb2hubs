import { enhanceConfig, requireArg } from 'hubtools'

const configPath = requireArg(
  process.argv[2],
  'Usage: node enhanceConfig.ts <path_to_config.json>',
)

enhanceConfig(configPath)
