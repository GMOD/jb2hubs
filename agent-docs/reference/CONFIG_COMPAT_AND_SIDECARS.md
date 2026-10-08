---
name: config-compat-and-sidecars
description:
  'What a published config must keep doing on old JBrowse hosts, how a
  config-level feature is staged in a sibling file, and why assembly sidecars
  are mirrored for UCSC and not GenArk.'
---

# Config compatibility, staging siblings and sidecars

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## Staging a config-level feature

`features.staging` (`website/src/config/features.ts`) only gates website pages
and which hosted JBrowse build links target — the configs themselves are one
tree served to both sites, so regenerating `config.json` publishes to production
too.

To stage something that lives in the config (a plugin, a track), have
`ucsc2jbrowse/src/buildConfigs.ts` write it into the **sibling**
`config-staging.json` it emits beside every `config.json` (and `mergeAll.ts`
into `all-staging.json`), and read the filename through `ucscConfigPath` /
`ucscAllConfigPath` in `website/src/config/jbrowse.ts`. It has to be a sibling,
not a `/ucsc-staging/` tree: a UCSC config names ~600 of its files relatively
(`centromeres.bed.gz`, `ncbiRefSeq.gff.gz`, `trix/*`) and jbrowse-web resolves
those against the config's own URL, so only a file in the same directory reaches
the data production serves. The sibling is the finished config run through
`enhanceConfigObject` a second time with `stagingEnhanceOptions`, which is
idempotent, so it adds the staging extras and changes nothing else.

Two things are staged this way today, both in `stagingEnhanceOptions`
(`hubtools/src/enhanceConfig.ts`): the BLAT plugin and the RepeatMasker track's
split-by-class multi-row display (`repeatClassDisplay: true`,
`hubtools/src/repeatClassDisplay.ts`). The second is waiting on a release rather
than on a decision — delete its gate and call `addRepeatClassDisplay`
unconditionally once a released `latest` carries `LinearMultiRowFeatureDisplay`.
Re-run the probe rather than assuming, since from this side the failure is
silent.

A third is added by `ucsc2jbrowse/src/buildConfigs.ts` itself, since it reads
the build's trackDb: one multi-way synteny track over every liftOver PIF the
anchor's config already names (`multiwayStarTrack.ts`), 165 of the 238 UCSC
configs. It opens on the anchor's multiz `speciesDefaultOn` where UCSC curated
one, and the lane picker offers every other mate grouped by the multiz clades.
The display fetches only the lanes it draws from jbrowse-components `64199e02e9`
on; a `jb2/main` built before it reads every child on every window, 240 for
hg38. So deploy `jb2/main` before uploading these siblings.

For **this** question the probe is not the cheapest instrument, and the browser
one cannot answer it at all — the fatal needs the track opened. What decides it
is whether a release has happened since the display landed, which a
jbrowse-components checkout answers outright:

```
git ls-remote --tags origin | grep -o 'v4\.[0-9]*\.[0-9]*$' | sort -V | tail -1
git cat-file -e <newest-tag>:plugins/canvas/src/LinearMultiRowFeatureDisplay/model.ts
```

`ls-remote`, not local tags, or a checkout that has not fetched in a while says
"no release yet" forever. Measured 2026-08-12: newest tag `v4.3.0` (2026-05-21),
which predates both displays — `LinearMultiSampleVariantDisplay` landed
2026-06-03, `LinearMultiRowFeatureDisplay` 2026-06-20, and both are absent from
`v4.3.0`. So both gates are still correctly closed, and neither is waiting on
anything either repo can do.

GenArk hubs are not staged (thousands of configs, nothing staged so far is
GenArk-specific), so a staged feature reaches `/ucsc/*` launches only. That is
the one gap in the repeat display: `addRepeatClassDisplay` handles a GenArk
`-repeatMasker` track too (its `bigRmskBed` has no class column, so the class is
derived off the name suffix `L1HS#LINE/L1` with a jexl `rows.field`), and it
matches ~16% of GenArk configs — 78 of a 500-config sample, one track each — but
nothing sets `RMSK_MULTIROW_DISPLAY` for the GenArk pipeline, so that branch is
written and tested rather than live.

**A release does not by itself unblock GenArk**, and this is the part worth not
mis-remembering: a GenArk `config.json` is the production file, at a permanent
url, that old hosts and old Desktop installs read. Keeping it booting on those
is a standing requirement, not a wait — so v5 shipping makes `latest` safe while
leaving every pinned v4 host exactly as fatal as before. Enabling GenArk means
staging it the way `ucsc2jbrowse` is staged, and the cost of that (a sibling
file per hub, thousands of them) is the actual open question, not the release.

The gate's GenArk half is pinned at the pipeline level in
`hubtools/src/enhanceConfig.test.ts` — including, deliberately, that the
production pass with the env UNSET leaves a GenArk `-repeatMasker` track
displayless. That is the assertion protecting the shipped file, and it is shaped
like the real configs: `<acc>-repeatMasker`, `BigBedAdapter`, and no `displays`
key, checked against `GCF_000001215.4` and 32 siblings.

`pnpm check-display-types` is the whole-corpus version of that question, and it
is worth running before promoting any display type because the answer is
narrower than the machinery suggests. Measured 2026-08-12 over **50,957** config
files, both arms: exactly two types are named anywhere — `LinearBasicDisplay`
(1,130 UCSC / 66,200 GenArk) and `MultiLinearWiggleDisplay` (39 UCSC / 0
GenArk). Both exist in **v4.0.0**, the oldest entry in `checkConfigCompat.mjs`'s
`HOST_VERSIONS`, so nothing currently shipped can hit the union fatal on any
supported host. That is also why the check is cheap: promoting a display type
means adding a third name to a vocabulary of two, and the script tells you the
moment one appears where you did not intend it.

Neither website serves configs — jbrowse-web resolves `?config=/ucsc/…` against
its own origin, so they always come from the jbrowse.org bucket
(`ucsc2jbrowse/uploadAll.sh`), which both sites read. **Upload the staged
configs before deploying the staging website:** a staging build links to
`config-staging.json`, and every launch fails to fetch its config until that
file is in the bucket. The reverse order is safe — an uploaded staging config
that nothing links to is inert.

## Old JBrowse versions read these configs

A hub config lives at one permanent url that desktop installs and published
links keep naming, so a regenerated config has to keep booting on hosts years
older than the one we develop against. **`plugins[].url` is the only field that
can kill a whole session** (`PluginLoader`'s `Promise.all` — one dead url and
the app is an error page). Content is otherwise forward-tolerant, measured on
v4.0.4 and main: an unknown track type, an unknown adapter, and the
`displayDefaults` shorthand all boot fine and cost the old host that one track
at most. So modernizing config content is not the risk it looks like; the plugin
url is.

**An unknown display type is the exception, and it is not scoped to its track.**
A `displays[]` entry naming a type the host lacks fails the track config's MST
union, so the config hydrates and then the app renders "Fatal error ...
[mobx-state-tree] No matching type for union" the moment something opens that
track. Measured 2026-08-09 on v4.0.0, v4.3.0 and main with
`LinearMultiRowFeatureDisplay` on `hg38-rmsk`: fatal on both released hosts,
fine on main, and declaring a `LinearBasicDisplay` entry ahead of it does not
help. The website side had already found this independently for
`LinearMultiSampleVariantDisplay` (measured 2026-08-06; the website has since
dropped v4.3.0 as a target and declares the display unconditionally).

So a display type newer than the oldest supported release is a **staging-only**
config change until it ships in `latest` — see below. It is also the one kind of
content change `check-config-compat` cannot catch on its own, because the fatal
needs the track to be **opened**: the probe loads a config and a session, and a
track nothing opens hydrates clean.

`pnpm check-config-compat` loads the shipped configs into every hosted release
and fails when one breaks; run it before shipping regenerated configs. The
support floor is the oldest version in its `HOST_VERSIONS` list. Reach for a
staging sibling (above) only when losing the new content on old hosts is itself
unacceptable — not as routine protection. Full reasoning, including why the
config urls are deliberately **not** versioned:
`agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md`.

### Three places this is checked, because the breakage comes from elsewhere

The plugin bundles are published from **another repo** (jbrowse-plugin-list
rehosts them to jbrowse.org/plugins, and `latest/` is uploaded no-cache so a
publish reaches configs shipped months ago). So a config that booted yesterday
can be an error page today with nothing pushed here — push-triggered CI
structurally cannot see it. Hence:

- `pnpm check-plugin-urls` — seconds, no browser. Every `plugins[].url` the
  configs name: reachable, javascript, and actually defines
  `JBrowsePlugin<Name>`. Runs in `lint.yml`. It canNOT see a bundle that loads
  and then throws from `configure()`, which is also fatal.
- `.github/workflows/config-canary.yml` — cron, every 6h, boots production on
  the whole version matrix and files one rolling `config-canary` issue. This is
  the layer that catches a throwing plugin. A failure must survive a retry
  before it alerts, because a canary that reports CDN blips gets muted. The
  support floor is **v4.0.0**: pre-v4 hosts were dropped from `HOST_VERSIONS` on
  2026-07-30, having been broken already (v2/v3 could not load the MsaView
  bundle at all; v3.7.0's mobx-state-tree rejects a FeatureTrack union in the
  config content). The oldest entry in `HOST_VERSIONS` is therefore the floor
  again, and no `--floor` override is needed.
- `run.sh` gates the upload on `check-plugin-urls` +
  `check-config-compat --local` before either `uploadAll.sh` runs. `--local`
  serves the working-tree configs to the real hosted app via request
  interception, so an unpublished regeneration is tested before it becomes
  public. `SKIP_CONFIG_GATE=1` overrides.

`--plugin Name=path` does the same substitution for a candidate plugin build, so
"does this bundle error-page the app" is answerable before publishing it rather
than after. Use it on every hubs/msaview/protein3d build that these configs
name.

2026-07-29 is why all of the above exists: `@cmdcolin/jbrowse-plugin-hubs` 1.0.9
began calling `appendToMenu('File')`, which every released core rejects (the
File menu is a thunk; `menuItems.push` throws), and hg38/hg19/mm39/hs1 were
error pages on v4.0.0 through latest. `check-plugin-urls` passed the whole time
— the url was fine.

## Assembly sidecars are mirrored on UCSC only, and all three of them matter

A **UCSC golden-path/hub** assembly's `chrom.sizes`, `chromAlias` and `cytoBand`
are copied next to the `config.json` that names them and referenced relatively,
so a UCSC outage costs the sequence track (the 2bit is still hgdownload's)
instead of the whole session. The reason it is all three and not just
`chrom.sizes`: jbrowse-core's `assembly.loadPre()` fetches sequence regions,
`refNameAliases`, `cytobands` and genetic codes in one `Promise.all`, and **any
one rejection fails the entire assembly** — which is why a UCSC outage read as
"the app won't load" rather than "a track is missing".

`hubtools/src/mirrorSidecars.ts` owns the rewrite;
`ucsc2jbrowse/src/mirrorAssemblySidecars.ts` drives it (local-first: chrom.sizes
from `chromInfo.txt.gz`, cytoBand copied straight from `database/`, so only
chromAlias is fetched). It sweeps every assembly every build, because a
regenerated config comes back naming upstream urls. A sidecar that can't be
fetched is left pointing upstream and retried next run. It is one of the steps
in `src/buildConfigs.ts` (above), and must run **after**
`ensureAssemblyAliasesAndCytobands`, which is what adds the `refNameAliases` and
`cytobands` urls it mirrors.

**GenArk is deliberately not mirrored** — it was, briefly, and was reverted on
2026-08-05. The UCSC sweep is 400 objects; the same sweep over GenArk was
**101,384 objects and 17.6GB** in the bucket, plus 50,700 rewritten configs
churning the git tree and a CloudFront invalidation on every run. It is the
object count that decides it, not the bytes — a fragmented assembly's chromAlias
is megabytes on either side.

GenArk configs therefore still name `hgdownload.soe.ucsc.edu`. **Two** sidecars,
not the three above: a GenArk hub has no cytoBand, so its assembly node carries
`chromSizes` and `refNameAliases` and nothing else (measured over a 403-config
sample of the 50,701 — chromSizes on every one, refNameAliases on all but one,
cytobands on none). Both being remote is exactly why a UCSC outage takes a
GenArk assembly down whole rather than costing it a track: `loadPre()` needs the
sequence regions and the aliases in the same `Promise.all`.

That is the accepted trade: don't "fix" it by re-enabling the sweep. Note also
that nothing checks those ~101k urls — `check-sidecar-urls` is UCSC-only on
purpose, because probing them in bulk is the road back to the sweep — so the
`mpxvRivers` failure mode (a config naming a sidecar that 404s, unopenable in
production, invisible to every gate) is unguarded on the GenArk side. See the
amendment in ADR 0003 for the options if it needs revisiting;
`hubtools/src/mirrorSidecars.ts` is deliberately kept as the library a future
GenArk pass would be rebuilt on, which is why it lives in the shared package
despite having only one caller today.

A sidecar whose upstream url **404s** is removed from the config rather than
left pointing at a dead url — `refNameAliases` and `cytobands` only, since those
nodes are optional and an assembly without one loads fine while one naming a 404
does not. `chromSizes` is never dropped (nothing here demonstrates TwoBitAdapter
accepts its absence back to the v4.0.0 floor). The 404/transient distinction is
load-bearing: a timeout or 5xx must leave the url alone, or an hgdownload blip
would delete a working alias file that nothing would then name to fetch back.
`pnpm check-sidecar-urls` is the pre-upload guard, in `gate_configs` beside
`check-plugin-urls` — it is what would have caught `mpxvRivers`, which named a
`chromAlias.txt` that 404s and was unopenable in production while
`check-plugin-urls` and the canary both passed.

It also enforces **outage-independence**, which is a stronger property than
reachability and the reason the mirroring exists at all. `MUST_BE_LOCAL` in that
script (`hg38`, `hg19`, `mm39`, `mm10`, `hs1`) may not name an upstream sidecar
even when upstream answers: a config that regressed to
`hgdownload…/hg38.chrom.sizes` passes every reachability check while UCSC is up,
and the protection is silently gone until the outage that needed it. Mirroring
is one step in `buildConfigs.ts`; if it throws or leaves `STEPS`, this is what
notices. Other assemblies are reported rather than failed, because a sidecar
whose fetch failed is deliberately left upstream and retried next run — making
that fatal everywhere would turn one blip into a blocked deploy.

As of 2026-08-05 all 235 real UCSC assemblies are fully mirrored; the only
upstream `chromSizes` were `cb1` and `hgFixed`, both of which 404 — dismissed at
the time as "not assemblies", which is exactly the reasoning the section below
takes apart. For hg19/hg38 specifically, all three sidecars are served from our
bucket and verified live, so `loadPre()` touches only jbrowse.org — a UCSC
outage costs the sequence track (the 2bit is still theirs, too big to mirror)
and the individual tracks that name hgdownload, but the assembly still opens.

Two things that will bite a change here:

- `chromSizes` is a **bare string** on TwoBitAdapter, not a `{ uri }` node, so
  anything that rewrites relative locations has to name it explicitly —
  `mergeAll.ts` does, or `all.json` would resolve it against `/ucsc/`.
- Relative is safe back to the v4.0.0 support floor only because jbrowse-web
  stamps `baseUri` beside the adapter's `uri` and TwoBitAdapter's
  `preProcessSnapshot` forwards it to `chromSizesLocation`. Full reasoning:
  `agent-docs/architecture-decision-records/0003-mirror-assembly-sidecars.md`.
