import { getUcscFeatureDisplay } from './featureDisplay.ts'
import { addRepeatClassDisplay } from './repeatClassDisplay.ts'
import { isRecord, readJSON, writeJSON } from './util.ts'

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
//
// Setting BLAT_PLUGIN_URL for the pipeline's own enhanceConfigs pass would put
// BLAT in the config.json production serves. ucsc2jbrowse/stageConfigs.sh sets it
// for a second pass over a COPY instead, so staging gets it and production does
// not — see that script for why the copy is a sibling file.
const blatPlugin: JBrowsePlugin[] = process.env.BLAT_PLUGIN_URL
  ? [{ name: 'Blat', url: process.env.BLAT_PLUGIN_URL }]
  : []

// Every url is the plugin store's version-agnostic `latest/` path, which the
// store's upload sets no-cache so a publish reaches these configs. The bare
// `<pkg>/dist/<umd>` path these used to name is the store's v1 layout, no longer
// republished: it was serving protein3d 0.4.1 against a published 0.8.0, which is
// how the protein view came to sit on a perpetual "Loading pairwise alignment"
// and to reject the short-form (uniprotId + transcriptId) declarative launch.
// Never name the bare path here.
const defaultPlugins: JBrowsePlugin[] = [
  {
    name: 'MafViewer',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/latest/dist/jbrowse-plugin-mafviewer.umd.production.min.js',
  },
  {
    name: 'Hubs',
    url: 'https://jbrowse.org/plugins/@cmdcolin/jbrowse-plugin-hubs/latest/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  {
    name: 'Protein3d',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-protein3d/latest/dist/jbrowse-plugin-protein3d.umd.production.min.js',
  },
  {
    name: 'MsaView',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-msaview/latest/dist/jbrowse-plugin-msaview.umd.production.min.js',
  },
  ...blatPlugin,
]

// The keys getUcscFeatureDisplay derives, and therefore the keys a re-run
// re-derives: dropped from an existing entry before the fresh ones are spread
// over it, so a trackDb setting that goes away takes its config with it. Any
// other key on that entry is left alone.
const DERIVED_KEYS = ['labels', 'mouseover', 'jexlFilters'] as const

// Labels/tooltips/filters bigBed FeatureTracks from the columns UCSC's trackDb
// intends (e.g. gnomAD _displayName, ncbiGene geneName2, JASPAR's score cutoff),
// leaving any hand-authored display untouched.
//
// An entry this deriver already wrote is REFRESHED rather than skipped, matched
// by the displayId it gives itself. enhanceConfigs.sh runs over built configs in
// place, so most of what it sees on any given run is its own previous output —
// the same reason the plugin loop below upserts by name. Skipping those meant a
// track that had earned a display from one trackDb setting could never receive a
// second one, which is how the JASPAR score filter would have reached no
// already-built config.
function deriveFeatureDisplay(track: Track): Track {
  const { metadata } = track
  const ucsc =
    isRecord(metadata) && isRecord(metadata.ucsc) ? metadata.ucsc : undefined
  if (track.type !== 'FeatureTrack' || ucsc === undefined) {
    return track
  }
  const derived = getUcscFeatureDisplay(track.trackId, ucsc).displays?.[0]
  if (track.displays === undefined) {
    return derived ? { ...track, displays: [derived] } : track
  }
  const displayId = `${track.trackId}-LinearBasicDisplay`
  return derived !== undefined && Array.isArray(track.displays)
    ? {
        ...track,
        displays: track.displays.map(d => {
          if (!isRecord(d) || d.displayId !== displayId) {
            return d
          }
          const kept = Object.fromEntries(
            Object.entries(d).filter(
              ([k]) => !(DERIVED_KEYS as readonly string[]).includes(k),
            ),
          )
          return { ...kept, ...derived }
        }),
      }
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

  // Upsert by name rather than skip-if-present: enhanceConfigs.sh re-runs over
  // already-enhanced built configs, so a name match that kept its old entry meant
  // a changed url never reached any config built before the change (the stale
  // protein3d bundle outlived four plugin releases that way). Rewriting the url
  // is what makes a re-run publish it.
  for (const plugin of plugins) {
    const existing = config.plugins.find(p => p.name === plugin.name)
    if (existing) {
      existing.url = plugin.url
    } else {
      config.plugins.push(plugin)
    }
  }

  // Opt-in for the same reason BLAT is, and a sharper one: a `displays[]` entry
  // naming a display type the host does not have fails the track config's MST
  // union, and the failure is not scoped to the track. Measured 2026-08-09
  // against jbrowse.org/code/jb2/{v4.0.0,v4.3.0,main} with the multi-row entry
  // on hg38-rmsk: the config hydrates on every host, and then OPENING the track
  // renders "Fatal error ... [mobx-state-tree] No matching type for union" on
  // v4.0.0 and v4.3.0 (= today's `latest`), whichever order the entries are
  // declared in. Only `main` has LinearMultiRowFeatureDisplay, which landed
  // 2026-06-20, after v4.3.0.
  //
  // So ucsc2jbrowse/stageConfigs.sh sets this for its pass over a COPY, and
  // staging (which launches code/jb2/main) gets the display while production
  // does not. Drop the gate and call it unconditionally once a released
  // `latest` carries the display — the same promotion
  // HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY in the website is waiting on.
  const withRepeatClass = process.env.RMSK_MULTIROW_DISPLAY
    ? addRepeatClassDisplay
    : (track: Track) => track
  config.tracks = config.tracks?.map(deriveFeatureDisplay).map(withRepeatClass)

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
