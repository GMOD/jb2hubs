---
name: config-compat-and-sidecars
description:
  'What a published config must keep doing on old JBrowse hosts, how a
  config-level feature is staged in a sibling file, and why assembly sidecars
  are mirrored for UCSC and not GenArk.'
---

# Config compatibility, staging siblings and sidecars

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

What is staged today, and what promoting each costs, is
`agent-docs/ideas/waiting-on-a-call/staged-config-features.md`. GenArk hubs are
not staged (thousands of configs, nothing staged so far is GenArk-specific), so
a staged feature reaches `/ucsc/*` launches only.

`pnpm check-display-types` lists every display type the configs name, and it is
worth running before promoting any display type because the answer is narrower
than the machinery suggests. Measured 2026-08-12 over **50,957** config files,
both arms: exactly two types are named anywhere — `LinearBasicDisplay` (1,130
UCSC / 66,200 GenArk) and `MultiLinearWiggleDisplay` (39 UCSC / 0 GenArk). Both
exist in **v4.0.0**, the oldest entry in `checkConfigCompat.mjs`'s
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
links keep naming, so a regenerated config has to keep booting on old hosts.
**`plugins[].url` is the only field that can kill a whole session**; unknown
track types, adapters and shorthand cost an old host that one track at most. The
measurements and the decision not to version config urls are
`agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md`.

**An unknown display type is the exception.** It fails the track config's MST
union the moment something opens that track, so it is the one content change
`check-config-compat` cannot catch on its own (measured 2026-08-09 on v4.0.0,
v4.3.0 and main with `LinearMultiRowFeatureDisplay` on `hg38-rmsk`).

`pnpm check-config-compat` loads the shipped configs into every hosted release
and fails when one breaks; run it before shipping regenerated configs. The
support floor is the oldest version in its `HOST_VERSIONS` list. Reach for a
staging sibling only when losing the new content on old hosts is itself
unacceptable, not as routine protection.

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
  support floor is **v4.0.0** (ADR 0002's amendment says why).
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

**GenArk is deliberately not mirrored.** The sweep was 101,384 objects against
UCSC's 400, and was reverted the day it shipped (ADR 0003's amendment has the
numbers).

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

`check-sidecar-urls` reports any UCSC assembly still naming an upstream sidecar.
`cb1` was the last, until it began building like the rest
(`agent-docs/reference/TRACK_URL_CHECKS.md` tells that story). On a mirrored
assembly `loadPre()` touches only jbrowse.org, so a UCSC outage costs the
sequence track (the 2bit is still theirs, too big to mirror) and the individual
tracks that name hgdownload, and the assembly still opens.

Two things that will bite a change here:

- `chromSizes` is a **bare string** on TwoBitAdapter, not a `{ uri }` node, so
  anything that rewrites relative locations has to name it explicitly —
  `mergeAll.ts` does, or `all.json` would resolve it against `/ucsc/`.
- Relative is safe back to the v4.0.0 support floor only because jbrowse-web
  stamps `baseUri` beside the adapter's `uri` and TwoBitAdapter's
  `preProcessSnapshot` forwards it to `chromSizesLocation`. Full reasoning:
  `agent-docs/architecture-decision-records/0003-mirror-assembly-sidecars.md`.
