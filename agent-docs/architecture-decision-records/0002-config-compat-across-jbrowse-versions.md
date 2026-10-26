# ADR 0002 — One permanent config url per hub, kept compatible by a tested floor

- **Status:** Accepted
- **Date:** 2026-07-26
- **Affected:** `hubtools/src/enhanceConfig.ts`,
  `scripts/checkConfigCompat.mjs`, every generated `config.json`/`minimal.json`,
  the merge API

## Context

Each hub is a monolithic deployment to one permanent url
(`jbrowse.org/ucsc/hg19/config.json`). Desktop installs, published links, and
saved sessions we do not control already name those urls, so a url cannot change
meaning or gain a version segment without abandoning its existing callers.
Meanwhile we regenerate the config continuously against whatever JBrowse we
develop against. No check confirmed that a regenerated config still loaded on an
older host, so we could not tell whether a modernization step broke one.

**Exactly one field in a config can kill a whole session: `plugins[].url`.**
`PluginLoader.load` runs `Promise.all` over the entries, so one bundle that 404s
or never defines its UMD global rejects them all, and the app renders
`Failed to load script: … START OVER WITHOUT URL OPTIONS` instead of a session.
A local `main` build given one deliberately dead plugin url showed no session,
no tracks, and nothing recoverable in the page.

**Config content is forward-tolerant.** We measured this, because reading the
code got it wrong. `baseTrackConfig`'s `preProcessSnapshot` does throw
`Unknown track type "X"`, and `rootModel.create({jbrowse: configSnapshot})` in
`createPluginManager.ts` does not guard it, which reads like a fatal path, but
config hydration never reaches that throw. We served a config with each kind of
content newer than the host to a locally installed `v4.0.4` and to a `main`
build, and every one **booted with the extra track present in the session**:

| content the host does not understand | v4.0.4 | main   |
| ------------------------------------ | ------ | ------ |
| unknown track `type`                 | booted | booted |
| unknown adapter `type`               | booted | booted |
| unknown display `type`               | booted | booted |
| `displayDefaults` shorthand          | booted | booted |
| **plugin url that fails to load**    | —      | FATAL  |

That measurement does not cover what such a track does when a user opens it on
an old host. It shows only that the track does not take the assembly down with
it.

The host tolerates the new content in two places, and our generators should rely
on them rather than work around them:

- **A vendored plugin entry is dropped.** When an external plugin is absorbed
  into the core build, the host removes the config's entry for it
  (`vendoredPluginNames`, currently `MafViewer` and `GWAS`) rather than
  registering the plugin twice. A config can therefore keep naming a plugin for
  years after that plugin stopped being external: the old config keeps working
  on new hosts, and the new host supplies the capability itself.
- **Display renames carry aliases**, so a legacy display type in an old config
  normalizes to its current name.

On 2026-07-26 `pnpm check-config-compat` showed the `hg38` config (571 tracks, 4
plugins) and a GenArk hub config (20 tracks) both booting with **every track
readable** on `v2.15.0`, `v3.0.0`, `v3.7.0`, `v4.0.0`, `v4.2.0`, `v4.3.0`,
`latest`, and `main`. The only difference across versions is `main` dropping the
`MafViewer` global, which is the vendored-plugin handling above. The shipped
configs had no compat break to fix; what was missing was a check that would
catch the next one.

## Decision

**Keep one clean permanent url per hub, and treat it as the conservative
artifact.** We add no versioned config trees and no `?v=` on the config url.
Compatibility is handled in what we _write into_ the file.

1. **A declared, tested floor.** `HOST_VERSIONS` in
   `scripts/checkConfigCompat.mjs` is the support contract. The oldest entry is
   the floor, and the rest are the release boundaries between it and now. A
   change that breaks any listed host is a regression. Raising the floor means
   deleting a version from that list **in a commit that says why**.
2. **Generators emit the oldest valid encoding.** Where two encodings mean the
   same thing to a current host, write the older one: expanded `displays`
   arrays, never the `displayDefaults` shorthand (added 2026-06-11, so absent
   from most hosts in the matrix). A host predating a shorthand ignores the
   unknown key rather than failing, so it loses the settings inside the key: the
   track renders with the default color instead of the one we configured, and
   reports no error. The same rule applies to any future shorthand.
3. **A type newer than the floor is allowed in the clean config, and is not a
   crisis.** This is the part that felt blocked and is not: the measurements
   above show an unknown track, adapter, or display type costs the old host that
   one track, not the assembly. So modernize the content — just do it knowing
   the old host loses that track, and use a staging sibling
   (`config-staging.json`) when even that is not acceptable. What must **never**
   go in is a plugin url the floor host cannot load, since that is the one fatal
   field.
4. **Plugin urls are the version-agnostic `latest/dist/` store path, gated by
   the matrix.** A pinned path caused the failure behind this ADR. The configs
   named the store's v1 unversioned path, which stopped being republished and
   served protein3d 0.4.1 for months while 0.8.0 was published. In that time the
   tutorial's demo link showed "Loading pairwise alignment" indefinitely and
   rejected the launch form the docs described. A moving url lets a fix reach
   configs already in use, and the matrix makes it safe. `enhanceConfig` upserts
   plugin urls by name, so a changed url reaches configs built before the
   change.
5. **Use the host's compat handling rather than working around it.** Prefer
   getting a capability vendored into core (old configs then keep working
   untouched) over inventing config-level version negotiation.

## Consequences

- Run `pnpm check-config-compat` before shipping regenerated configs. It costs
  one page load per config per version and needs a browser (`puppeteer-core` +
  `CHROME_PATH`, or a system Chrome); it does not download Chromium.
- The floor is visible in one list, so "can we use this yet" has a checkable
  answer.
- **jbrowse-components made the one fatal field non-fatal** on 2026-07-26
  (unreleased when this ADR was written). `PluginLoader.loadSettled` keeps the
  plugins that loaded instead of rejecting the batch, and Web and Desktop both
  open the session and report each failure as a session notification ("Failed to
  load UMD plugin X from <url>. The session is open without it, so tracks or
  views that need it are unavailable"). A local build with a dead plugin url
  opened the session with all tracks present and showed the notification, where
  the same config previously produced the error page. The RPC worker still loads
  strictly, and correctly so: it receives `runtimePluginDefinitions`, built only
  from plugins that installed, so it never sees the dead url.

  The upstream change does **not** fix released hosts. Every already-released
  host still dies on a dead plugin url, so the matrix keeps checking a config's
  plugin urls.

- The plugins have a similar exposure: a bundle that loads on an old host can
  still call a host API that host lacks, which breaks one feature rather than
  the session. `pnpm host-compat` in `jbrowse-plugin-protein3d` probes that per
  release; one `session.getTracksById()` call (core, 2026-01) held its
  declarative launch at `v4.2.0` while the bundle itself loaded back to
  `v2.15.0`.

## Amendment, 2026-07-30 — The floor is v4.0.0

`6af6fa9` dropped `v2.15.0`, `v3.0.0` and `v3.7.0` from `HOST_VERSIONS`, so the
host list in Context is the matrix as first measured, and the contract is
narrower. Those hosts had already stopped booting the configs: v2 and v3 could
not load the MsaView bundle, and v3.7.0's mobx-state-tree rejects a FeatureTrack
union in the config content. The floor moved to the oldest host that still boots
them, and `HOST_VERSIONS` is now `v4.0.0`, `v4.2.0`, `v4.3.0`, `latest` and
`main`.

## Amendment, 2026-08-09 — An unknown display type is fatal once opened

The boot table above holds, but an unknown display type is not filtered out of
`displays`. When a v4 host opens a track whose `displays[]` names a type it
lacks, the MST union rejects the track config and the app shows a fatal error
(measured on v4.0.0 and v4.3.0 with `LinearMultiRowFeatureDisplay` on
`hg38-rmsk`). Decision point 3 therefore does not cover display types: a display
type newer than the floor ships in `config-staging.json` only, until a release
carries it; `agent-docs/reference/CONFIG_COMPAT_AND_SIDECARS.md` has the check.

## Amendment, 2026-10-26 — The configs target the newest v5 release

Colin, 2026-10-26: "we are only targetting v5 latest, no v4.3.0, no old betas".
`HOST_VERSIONS` is now `v5.0.0-beta.17` and `main`, and the release entry moves
at each v5 tag. Hosted `latest` still serves 4.3.0, so the list names the tag.

- The 2026-08-09 fatal was v4's: since `v5.0.0-beta.1` a host drops a display of
  a type it lacks, with a warning (`preprocessTrackConfigSnapshot`). The
  RepeatMasker by-class display and the multi-way synteny star, held in
  `config-staging.json` for it, now ship in `config.json` (beta.17 has both
  display types).
- A display's closed schema drops a key the release does not declare, so a
  spelling `main` introduced after the tag waits for the next release.
- Plugin entries name the store ref. A url stays only where a v5 host should
  fall back to it when the store cannot answer (Hubs' `latest/` path);
  Protein3d's and MsaView's pinned v4 UMD builds and the vendored MafViewer
  entry are gone.
