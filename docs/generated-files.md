# Generated vs source-controlled files

Regeneration overwrites hand edits to these:

- `hubs/**` and
  `genark2jbrowse/{hubJson,processedHubJson,speciesDescriptions,taxon_images,categoryIndex}`
- `ucsc2jbrowse/{configs,configs-minimal,removedTracks,fileAccessCache}` and the
  merged `removedTracks.json` / `blockedFiles.json` (the latter is the
  blocked-only subset of `fileAccessCache/`)
- `website/{processedHubJson,public/searchIndex.json,src/recentlyUpdated.json}`

Edit these source-controlled inputs instead:

- `ucsc2jbrowse/ucscExtensions/*.json` (extra tracks merged into a generated
  config), `ucscMixins/`, `ucscRenames/`
- `genark2jbrowse/genArkExtensions/*.json`, the same idea for GenArk hubs
- everything under `hubtools/src/`, `*/src/` and `website/src/`
