---
name: config-compat-and-sidecars
description:
  'What a published config must keep doing on old JBrowse hosts, how a
  config-level feature is staged in a sibling file, and why assembly sidecars
  are mirrored for UCSC and not GenArk.'
---

# Config compatibility, staging siblings and sidecars

## Staging a config-level feature

`features.staging` (`website/src/config/features.ts`) gates website pages and
which hosted JBrowse build their links target. Both sites read one tree of
configs, so regenerating `config.json` publishes to production too.

To stage something that lives in the config (a plugin, a track), have
`ucsc2jbrowse/src/buildConfigs.ts` write it into the **sibling**
`config-staging.json` it emits beside every `config.json` (and `mergeAll.ts`
into `all-staging.json`), and read the filename through `ucscConfigPath` /
`ucscAllConfigPath` in `website/src/config/jbrowse.ts`. The staged file has to
sit beside `config.json`, not in a `/ucsc-staging/` tree. A UCSC config names
~600 of its files relatively (`centromeres.bed.gz`, `ncbiRefSeq.gff.gz`,
`trix/*`), and jbrowse-web resolves those against the config's URL, so only a
file in the same directory reaches the data production serves. The build makes
the sibling by running the finished config through `enhanceConfigObject` a
second time with `stagingEnhanceOptions`. That pass is idempotent, so it adds
the staging extras and changes nothing else.

The BLAT plugin is the one staged feature today. GenArk hubs are not staged
(thousands of configs, nothing staged so far is GenArk-specific), so a staged
feature reaches `/ucsc/*` launches only.

`pnpm check-display-types` lists every display type the configs name, and it is
worth running before promoting any display type because the answer is narrower
than the machinery suggests. Measured 2026-08-12 over **50,957** config files,
both arms: exactly two types are named anywhere — `LinearBasicDisplay` (1,130
UCSC / 66,200 GenArk) and `MultiLinearWiggleDisplay` (39 UCSC / 0 GenArk).
`LinearMultiRowFeatureDisplay` and `MultiWaySyntenyDisplay` joined them on
2026-10-26. The release in `HOST_VERSIONS` has to carry each, or it drops that
display, and the script tells you the moment a type appears where you did not
intend it.

The configs come from the jbrowse.org bucket (`ucsc2jbrowse/uploadAll.sh`),
which both sites read, because jbrowse-web resolves `?config=/ucsc/…` against
its own origin, jbrowse.org. **Upload the staged configs before deploying the
staging website.** A staging build links to `config-staging.json`, and every
launch fails to fetch its config until that file is in the bucket. The reverse
order is safe, since no page links to an uploaded staging config yet.

## Which JBrowse reads these configs

Each hub config has one permanent url that desktop installs and published links
keep naming. The configs target the newest v5 release and `main`, the two hosts
in `checkConfigCompat.mjs`'s `HOST_VERSIONS`. **`plugins[].url` is the only
field that can kill a whole session**; an unknown track type, adapter or
shorthand costs the host that one track, and an unknown display type that one
display.
`agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md`
has the measurements, the decision not to version config urls, and the
2026-10-26 amendment that dropped v4.

`pnpm check-config-compat` loads the shipped configs into both hosts and fails
when one breaks; run it before shipping regenerated configs.

### Three checks, because the plugin bundles come from another repo

The plugin bundles are published from **another repo**: jbrowse-plugin-list
rehosts them to jbrowse.org/plugins, and uploads `latest/` no-cache so a publish
reaches configs shipped months ago. A config that booted yesterday can therefore
be an error page today with nothing pushed here, and push-triggered CI never
runs for that change. Three checks cover it:

- `pnpm check-plugin-urls` takes seconds and needs no browser. It checks that
  every `plugins[].url` the configs name is reachable, is javascript, and
  defines `JBrowsePlugin<Name>`, and it runs in `lint.yml`. It cannot see a
  bundle that loads and then throws from `configure()`, which is also fatal.
- `.github/workflows/config-canary.yml` runs on cron every 6h, boots production
  on the whole version matrix, and files one rolling `config-canary` issue. The
  canary is the check that catches a throwing plugin. A failure must survive a
  retry before it alerts, because people mute a canary that reports CDN blips.
  The hosts are `HOST_VERSIONS` (ADR 0002's 2026-10-26 amendment says why).
- `run.sh` gates the upload on `check-plugin-urls` and
  `check-config-compat --local` before either `uploadAll.sh` runs. `--local`
  serves the working-tree configs to the real hosted app through request
  interception, so the gate tests an unpublished regeneration before it becomes
  public. `SKIP_CONFIG_GATE=1` overrides the gate.

`--plugin Name=path` does the same substitution for a candidate plugin build, so
you can check whether a bundle error-pages the app before publishing it. Use it
on every hubs/msaview/protein3d build that these configs name.

The three checks exist because of the breakage on 2026-07-29, when
`@cmdcolin/jbrowse-plugin-hubs` 1.0.9 began calling `appendToMenu('File')`.
Every released core rejects that call (the File menu is a thunk, so
`menuItems.push` throws), and hg38, hg19, mm39 and hs1 were error pages on
v4.0.0 through latest. `check-plugin-urls` passed the whole time, because the
url was fine.

## Assembly sidecars are mirrored on UCSC only, and all three of them matter

The build copies a **UCSC golden-path/hub** assembly's `chrom.sizes`,
`chromAlias` and `cytoBand` next to the `config.json` that names them and
references them relatively, so a UCSC outage costs the sequence track (the 2bit
is still hgdownload's) instead of the whole session. It mirrors all three
because jbrowse-core's `assembly.loadPre()` fetches sequence regions,
`refNameAliases`, `cytobands` and genetic codes in one `Promise.all`, and **any
one rejection fails the entire assembly**. That is why a UCSC outage looked like
"the app won't load" rather than "a track is missing".

`hubtools/src/mirrorSidecars.ts` does the rewrite, and
`ucsc2jbrowse/src/mirrorAssemblySidecars.ts` drives it, local files first: it
builds chrom.sizes from `chromInfo.txt.gz` and copies cytoBand straight from
`database/`, so only chromAlias is fetched. It sweeps every assembly on every
build, because a regenerated config comes back naming upstream urls. It leaves a
sidecar it can't fetch pointing upstream and retries it on the next run. The
sweep is one of the steps in `src/buildConfigs.ts` (above), and must run
**after** `ensureAssemblyAliasesAndCytobands`, which adds the `refNameAliases`
and `cytobands` urls it mirrors.

**GenArk is deliberately not mirrored.** The GenArk sweep was 101,384 objects
against UCSC's 400, and we reverted it the day it shipped (ADR 0003's amendment
has the numbers).

GenArk configs therefore still name `hgdownload.soe.ucsc.edu` for **two**
sidecars. A GenArk hub has no cytoBand, so its assembly node has `chromSizes`
and `refNameAliases` and nothing else (in a 403-config sample of the 50,701,
chromSizes was on every one, refNameAliases on all but one, and cytobands on
none). With both remote, a UCSC outage takes a GenArk assembly down whole, since
`loadPre()` needs the sequence regions and the aliases in the same
`Promise.all`.

We accept that trade; don't "fix" it by re-enabling the sweep.
`check-sidecar-urls` is UCSC-only on purpose, because a bulk probe of GenArk's
~101k urls makes about as many requests as the reverted sweep did. No gate
checks them, so the GenArk side has no guard against the `mpxvRivers` failure,
where a config names a sidecar that 404s and cannot open in production while
every gate passes. ADR 0003's amendment lists the options if this needs
revisiting. `hubtools/src/mirrorSidecars.ts` stays in the shared package,
despite having one caller today, as the library a future GenArk pass would be
rebuilt on.

When a sidecar's upstream url **404s**, the build removes it from the config
instead of leaving it pointing at a dead url. That applies to `refNameAliases`
and `cytobands` only: those nodes are optional, and an assembly without one
loads, while one naming a 404 does not. The build never drops `chromSizes`,
since nothing here shows TwoBitAdapter accepting its absence back to the v4.0.0
floor. The build depends on telling a 404 from a transient failure. A timeout or
5xx must leave the url alone, or an hgdownload outage would delete a working
alias file, and no config would then name it so a later run could fetch it back.

`pnpm check-sidecar-urls` is the pre-upload guard, in `gate_configs` beside
`check-plugin-urls`. It would have caught `mpxvRivers`, which named a
`chromAlias.txt` that 404s and could not open in production while
`check-plugin-urls` and the canary both passed.

`check-sidecar-urls` also enforces **outage-independence**, a stronger property
than reachability and the reason the mirroring exists. `MUST_BE_LOCAL` in that
script (`hg38`, `hg19`, `mm39`, `mm10`, `hs1`) lists assemblies that may not
name an upstream sidecar even when upstream answers. A config that regressed to
`hgdownload…/hg38.chrom.sizes` passes every reachability check while UCSC is up,
and the protection is gone, with no error, until the outage that needed it.
Mirroring is one step in `buildConfigs.ts`, so if it throws or leaves `STEPS`,
this check reports it. For other assemblies the script reports an upstream
sidecar without failing, because the build deliberately leaves a sidecar whose
fetch failed upstream and retries it on the next run; failing everywhere would
turn one outage into a blocked deploy.

`check-sidecar-urls` reports any UCSC assembly still naming an upstream sidecar.
`cb1` was the last, until it began building like the rest
(`agent-docs/reference/TRACK_URL_CHECKS.md` has the history). On a mirrored
assembly `loadPre()` fetches only from jbrowse.org, so a UCSC outage costs the
sequence track (the 2bit is still UCSC's, too big to mirror) and the individual
tracks that name hgdownload, and the assembly still opens.

Two details break a change here if missed:

- `chromSizes` is a **bare string** on TwoBitAdapter, not a `{ uri }` node, so
  anything that rewrites relative locations has to name it explicitly.
  `mergeAll.ts` does, and without that `all.json` would resolve it against
  `/ucsc/`.
- Relative locations are safe back to the v4.0.0 support floor only because
  jbrowse-web sets `baseUri` beside the adapter's `uri`, and TwoBitAdapter's
  `preProcessSnapshot` forwards it to `chromSizesLocation`. The full reasoning
  is in
  `agent-docs/architecture-decision-records/0003-mirror-assembly-sidecars.md`.
