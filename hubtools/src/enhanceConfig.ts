import {
  getUcscFeatureDisplay,
  ucscHiddenDetailFields,
} from './featureDisplay.ts'
import { addNcbiGffLabelDisplay, addNcbiGffTextSearching } from './ncbiGff.ts'
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

// Each entry names the plugin store ENTRY, and carries the store's
// version-agnostic `latest/` url as a fallback.
//
// The ref is the durable half. A url in a config is an answer computed the day
// the config was generated, and these configs are never revisited — so the only
// url that keeps working is `latest/`, which carries no integrity hash and
// serves the same bytes to every host. `storePlugin` defers both decisions to
// load time: the host reads plugin-store/v2/plugins.json and gets the pinned,
// integrity-carrying build for the JBrowse version it actually is. See
// jbrowse-plugin-list ADR 0008.
//
// Its value is the store's `name`, which is why it repeats `name` here. NOT the
// npm package: npm and the plugin's author own that string and can rescope it,
// which would strand every config that had named it — the same failure as
// naming a url, one level up. The store owns its `name` and can repoint it at a
// different package without touching a config. The repetition expires with the
// url; a config that has stopped carrying one is just `{ storePlugin: 'MsaView' }`.
//
// The url stays because a host that predates ref support ignores the unknown
// key and loads it. Measured rather than argued — a paired boot matrix over
// v2.1.0..latest and the cross-origin trust gate, every row identical with and
// without the key, written up in jbrowse-plugin-list
// agent-docs/2026-08-26-store-plugin-refs-older-clients.md and gated by
// `check-plugins.ts --hybrid`. Drop the urls only when no such host is left in
// the wild. It must be the `latest/` path and never the bare `<pkg>/dist/<umd>`
// v1 layout, which is no longer republished: that is how protein3d served 0.4.1
// against a published 0.8.0, leaving the protein view on a perpetual "Loading
// pairwise alignment".
//
// MafViewer names no store entry on purpose. Core vendors it now, so it was
// removed from the store's plugins.json and a ref to it cannot resolve; jbrowse-web
// drops the entry before loading anyway (`vendoredPluginNames`), and the url is
// only there for hosts old enough not to bundle it. BLAT is absent for a
// different reason — deliberately not in the store, see above.
const defaultPlugins: JBrowsePlugin[] = [
  {
    name: 'MafViewer',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/latest/dist/jbrowse-plugin-mafviewer.umd.production.min.js',
  },
  {
    name: 'Hubs',
    storePlugin: 'Hubs',
    url: 'https://jbrowse.org/plugins/@cmdcolin/jbrowse-plugin-hubs/latest/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  {
    name: 'Protein3d',
    storePlugin: 'Protein3d',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-protein3d/latest/dist/jbrowse-plugin-protein3d.umd.production.min.js',
  },
  {
    name: 'MsaView',
    storePlugin: 'MsaView',
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
  // Track-level rather than display-level, so it rides both branches below.
  // Left alone when the track already carries a hand-authored formatDetails.
  const hidden = ucscHiddenDetailFields(ucsc)
  const base: Track =
    hidden !== undefined && track.formatDetails === undefined
      ? { ...track, formatDetails: { feature: hidden } }
      : track

  const derived = getUcscFeatureDisplay(base.trackId, ucsc).displays?.[0]
  if (derived === undefined) {
    return base
  }
  if (base.displays === undefined) {
    return { ...base, displays: [derived] }
  }
  const displayId = `${base.trackId}-LinearBasicDisplay`
  return Array.isArray(base.displays)
    ? {
        ...base,
        displays: base.displays.map(d => {
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
    : base
}

/**
 * Enhances a JBrowse configuration file in place with standard plugins and
 * hierarchical settings. genark2jbrowse builds its configs in memory and calls
 * enhanceConfigObject directly; this wrapper is for the callers that still work
 * on a file.
 */
export function enhanceConfig(
  configPath: string,
  plugins: JBrowsePlugin[] = defaultPlugins,
) {
  writeJSON(
    configPath,
    enhanceConfigObject(readJSON<JBrowseConfig>(configPath), plugins),
  )
}

export function enhanceConfigObject(
  config: JBrowseConfig,
  plugins: JBrowsePlugin[] = defaultPlugins,
) {
  config.plugins ??= []

  // Upsert by name rather than skip-if-present: enhanceConfigs.sh re-runs over
  // already-enhanced built configs, so a name match that kept its old entry meant
  // a changed url never reached any config built before the change (the stale
  // protein3d bundle outlived four plugin releases that way). Rewriting the entry
  // is what makes a re-run publish it.
  //
  // The whole entry, not just `url`. Assigning one field is what the url-only
  // version did, and it would have left every already-enhanced config without
  // the `storePlugin` this run adds — which is the same class of bug as the one
  // above, on a field that did not exist yet when it was fixed.
  //
  // Replacing the entry also drops anything else it held. Every plugin entry in
  // the tree is exactly `{ name, url }` — 208,344 across 52,086 genark configs,
  // 956 across 239 in ucsc2jbrowse/configs, checked 2026-08-26 — so there is
  // nothing to drop. A generator that starts writing a fifth field has to
  // revisit this.
  for (const plugin of plugins) {
    const index = config.plugins.findIndex(p => p.name === plugin.name)
    if (index === -1) {
      config.plugins.push(plugin)
    } else {
      config.plugins[index] = plugin
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
  // Unconditional, unlike withRepeatClass: it names a display type every
  // supported host has, so it needs no boot-matrix gate.
  config.tracks = config.tracks
    ?.map(deriveFeatureDisplay)
    .map(addNcbiGffLabelDisplay)
    .map(addNcbiGffTextSearching)
    .map(withRepeatClass)

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
