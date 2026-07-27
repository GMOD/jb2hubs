# ADR 0002 — One permanent config url per hub, kept compatible by a tested floor

- **Status:** Accepted
- **Date:** 2026-07-26
- **Affected:** `hubtools/src/enhanceConfig.ts`,
  `scripts/checkConfigCompat.mjs`, every generated `config.json`/`minimal.json`,
  the merge API

## Context

Each hub is a monolithic deployment to one permanent url
(`jbrowse.org/ucsc/hg19/config.json`). Desktop installs, published links, and
saved sessions we do not control already name those urls, so the url cannot
change meaning and cannot grow a version segment without abandoning the callers
that exist. Meanwhile the config is regenerated continuously against whatever
JBrowse we develop against. Nothing checked that a regenerated config still
loaded on an older host, which made every modernization step a blind risk.

**Exactly one field in a config can kill a whole session: `plugins[].url`.**
`PluginLoader.load` runs `Promise.all` over the entries, so one bundle that 404s
or never defines its UMD global rejects the lot and the app renders
`Failed to load script: … START OVER WITHOUT URL OPTIONS` instead of a session.
Measured against a local `main` build with one deliberately dead plugin url: no
session, no tracks, nothing recoverable in the page.

**Config content, by contrast, is forward-tolerant.** That was measured rather
than reasoned about, because reasoning got it wrong: `baseTrackConfig`'s
`preProcessSnapshot` does throw `Unknown track type "X"`, and
`rootModel.create({jbrowse: configSnapshot})` in `createPluginManager.ts` does
not guard it, which reads like a fatal path — but it is not reached at config
hydration. Serving a config carrying each kind of from-the-future content to a
locally installed `v4.0.4` and to a `main` build, every one **booted with the
extra track present in the session**:

| content the host does not understand | v4.0.4 | main   |
| ------------------------------------ | ------ | ------ |
| unknown track `type`                 | booted | booted |
| unknown adapter `type`               | booted | booted |
| unknown display `type`               | booted | booted |
| `displayDefaults` shorthand          | booted | booted |
| **plugin url that fails to load**    | —      | FATAL  |

What such a track does when a user actually opens it on an old host is not
covered by that measurement; the claim is only that it does not take the
assembly down with it.

Three seams do the tolerating, and they are worth leaning on rather than working
around:

- **An unknown display type is filtered out** of a track's `displays`, so adding
  a display an old host lacks costs that host nothing.
- **A vendored plugin entry is dropped.** When an external plugin is absorbed
  into the core build, the host removes the config's entry for it
  (`vendoredPluginNames`, currently `MafViewer` and `GWAS`) rather than
  double-registering. This is why a config may keep naming a plugin for years
  after that plugin stopped being external — the old config keeps working on new
  hosts, and the new host supplies the capability itself.
- **Display renames carry aliases**, so a legacy display type in an old config
  normalizes to its current name.

The shipped configs are in good shape today (`pnpm check-config-compat`,
2026-07-26): the `hg38` config (571 tracks, 4 plugins) and a GenArk hub config
(20 tracks) both boot with **every track readable** on `v2.15.0`, `v3.0.0`,
`v3.7.0`, `v4.0.0`, `v4.2.0`, `v4.3.0`, `latest`, and `main`. The only
cross-version difference is `main` dropping the `MafViewer` global, which is the
vendoring seam above working as designed. So there is no compat hole to dig out
of; what was missing is a tripwire.

## Decision

**Keep one clean permanent url per hub, and treat it as the conservative
artifact.** No versioned config trees, no `?v=` on the config url. The
compatibility budget is spent in what we _write into_ the file, not in the url.

1. **A declared, tested floor.** `HOST_VERSIONS` in
   `scripts/checkConfigCompat.mjs` is the support contract: the oldest entry is
   the floor, the rest are the release boundaries between it and now. A change
   that breaks any listed host is a regression, not a fact of life. Raising the
   floor means deleting a version from that list **in a commit that says why**.
2. **Generators emit the oldest valid encoding.** Where two encodings mean the
   same thing to a current host, write the older one: expanded `displays`
   arrays, never the `displayDefaults` shorthand (added 2026-06-11, so absent
   from most hosts in the matrix). A host predating a shorthand ignores the
   unknown key rather than failing, so what is lost is the settings inside it —
   a track that silently renders with default color instead of the one we
   configured. Same rule for any future shorthand.
3. **A type newer than the floor is allowed in the clean config, and is not a
   crisis.** This is the part that felt blocked and is not: the measurements
   above show an unknown track, adapter, or display type costs the old host that
   one track, not the assembly. So modernize the content — just do it knowing
   the old host loses that track, and use a staging sibling
   (`config-staging.json`) when even that is not acceptable. What must **never**
   go in is a plugin url the floor host cannot load, since that is the one fatal
   field.
4. **Plugin urls are the version-agnostic `latest/dist/` store path, gated by
   the matrix.** Pinning a version is what produced the failure this ADR came
   out of: the configs named the store's v1 unversioned path, which stopped
   being republished and served protein3d 0.4.1 for months against a published
   0.8.0 — long enough for the tutorial's demo link to sit on a perpetual
   "Loading pairwise alignment" and to reject the launch form the docs
   described. A moving url is what lets a fix reach configs already in the wild;
   the matrix is what makes it safe. `enhanceConfig` upserts plugin urls by name
   so a changed url actually reaches configs built before the change.
5. **Lean on the host's compat seams rather than working around them.** Prefer
   getting a capability vendored into core (old configs then keep working
   untouched) over inventing config-level version negotiation.

## Consequences

- `pnpm check-config-compat` before shipping regenerated configs. It costs one
  page load per config per version and needs a browser (`puppeteer-core` +
  `CHROME_PATH`, or a system Chrome), not a Chromium download.
- The floor is visible in one list, so "can we use this yet" has an answer that
  is not a guess.
- **The one fatal field has been de-fanged upstream**, as of jbrowse-components
  2026-07-26 (unreleased at time of writing): `PluginLoader.loadSettled` keeps
  the plugins that loaded instead of rejecting the batch, and Web and Desktop
  both open the session and report each failure as a session notification
  ("Failed to load UMD plugin X from <url>. The session is open without it, so
  tracks or views that need it are unavailable"). Verified against a local build
  with a dead plugin url: session opens, all tracks present, notification shown
  — where the same config previously produced the error page. The RPC worker
  still loads strictly and correctly so: it is sent `runtimePluginDefinitions`,
  built only from plugins that installed, so it never sees the dead url.

  This does **not** retroactively fix anything. Every already-released host
  still dies on a dead plugin url, which is exactly why a config's plugin urls
  stay under the matrix's watch rather than being treated as safe now.

- The parallel exposure lives in the plugins, not here: a bundle that loads on
  an old host can still call a host API that host lacks, which is a per-feature
  break rather than a dead session. `pnpm host-compat` in
  `jbrowse-plugin-protein3d` probes that per release; one
  `session.getTracksById()` call (core, 2026-01) was holding its declarative
  launch at `v4.2.0` while the bundle itself loaded back to `v2.15.0`.
