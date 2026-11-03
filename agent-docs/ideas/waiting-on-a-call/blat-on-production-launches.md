---
name: blat-on-production-launches
description:
  BLAT and in-silico PCR reach only staging /ucsc/* launches, because the
  plugin's v1 UMD kills a v4.3.0 session and so cannot go in config.json. Two
  routes put it on every production launch without touching config.json: launch
  the v5 sibling everywhere, or bundle the plugin into jbrowse-web. The call is
  which.
---

# BLAT on production launches

`stagingEnhanceOptions` (`hubtools/src/enhanceConfig.ts`) writes the BLAT plugin
into `config-staging.json` only, so only staging `/ucsc/*` launches have the
Tools menu's **BLAT search** and **In-silico PCR**. The assemblies are ready on
both arms: `ucsc2jbrowse/src/createAssembly.ts` and
`hubtools/src/generateJBrowseConfigForAssemblyHub.ts` write `blatDb`, and
jbrowse-components' `plugins/blat/src/ucscDbMap.ts` accepts UCSC dbs and GenArk
accessions. A browser reaches UCSC only through the jbrowse.org proxy
(`products/aws/blat-proxy` in jbrowse-components), since hgBlat sends no CORS
headers.

## Why not config.json

Booted 2026-11-03 with a copy of `scripts/checkConfigCompat.mjs` that added the
published `hg38/config-staging.json` and `hg19/config-staging.json`:

| host           | result                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| v4.3.0         | FATAL `Failed to load UMD bundle for Blat, JBrowsePluginBlat is undefined` |
| v5.0.0-beta.20 | ok                                                                         |
| main           | ok                                                                         |

So the v1 UMD in `config.json` takes down every v4.3.0 Desktop session that
opens the genome. `checkConfigCompat.mjs`'s `CONFIGS` boots no staging sibling,
which is why nothing had caught it; a sibling only owes the v5 hosts a boot.

## Route A: launch the v5 sibling on every site

`website/src/config/jbrowse.ts` already has `ucscV5ConfigPath`, which the
multi-way star launch reads on production because the sibling keeps the v5-only
tracks `withoutV5Only` strips. Website launches always run a v5 jbrowse-web, so
`ucscConfigPath` could return the sibling unconditionally, and `config.json`
stays the v4-safe permanent url desktop installs name. Then the sibling is the
v5 config rather than a staging one, and its name should say so. Reaches UCSC
launches only: GenArk writes no sibling, and adding one doubles GenArk's config
files.

## Route B: bundle plugin-blat into jbrowse-web

jbrowse-desktop's `corePlugins.ts` already bundles it, and the BLAT user guide
(`website/docs/user_guides/blat.md` in jbrowse-components) says shipping it on
Web is planned. Every launch, GenArk included, gets BLAT with no config entry,
and `stagingEnhanceOptions` loses its reason to exist. Costs:

- every jbrowse-web deployment, not only this site, defaults to the one shared
  proxy key (`DEFAULT_BLAT_URL`): 1 query per 15 s and 4,500 a day for everyone,
  a 429 with `Retry-After` past that;
- `plugins/blat/src/index.ts` imports `IsPcrDialog` and the results widget
  eagerly, so web's eager bundle grows unless they move behind lazy imports. The
  whole UMD is 39 KB gz; the in-app share is unmeasured.

## Demand, as far as it can be read

`/status` and CloudWatch show the proxy at about 4 Lambda invocations a day for
the 30 days to 2026-11-03, steady enough to be a scheduled probe rather than
users; DynamoDB's `day#` counters expire, so only two days are readable (3 and 1
calls). Staging therefore says nothing about production demand, only that the
budget has never been near its cap.
