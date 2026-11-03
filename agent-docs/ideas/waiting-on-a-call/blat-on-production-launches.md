---
name: blat-on-production-launches
description:
  BLAT and in-silico PCR reach only staging /ucsc/* launches, because the
  plugin's v1 UMD kills a v4.3.0 session and so cannot go in config.json.
  Bundling plugin-blat into jbrowse-web puts it on every production launch,
  GenArk included, with no config entry. The call is accepting the shared proxy
  budget across every jbrowse-web deployment.
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

## Bundle plugin-blat into jbrowse-web

jbrowse-desktop's `corePlugins.ts` already bundles it, and the BLAT user guide
(`website/docs/user_guides/blat.md` in jbrowse-components) says shipping it on
Web is planned. Once the jbrowse-web these launches run carries it, every launch
has BLAT, and `stagingEnhanceOptions` drops its Blat entry. Two things to do on
the way:

- `plugins/blat/src/index.ts` imports `IsPcrDialog` and the results widget
  eagerly; move them behind lazy imports before web's eager bundle takes them.
  The whole UMD is 39 KB gz; the in-app share is unmeasured.
- every jbrowse-web deployment, not only this site, then defaults to the one
  shared proxy key (`DEFAULT_BLAT_URL`): 1 query per 15 s and 4,500 a day for
  everyone, a 429 with `Retry-After` past that, and the budget table's `notice`
  item as the kill switch.

Launching the v5 sibling everywhere (`ucscV5ConfigPath` in
`website/src/config/jbrowse.ts`, which the multi-way star already does) would
reach UCSC launches only: GenArk writes no sibling.

## Demand, as far as it can be read

`/status` and CloudWatch show the proxy at about 4 Lambda invocations a day for
the 30 days to 2026-11-03, steady enough to be a scheduled probe rather than
users; DynamoDB's `day#` counters expire, so only two days are readable (3 and 1
calls). Staging therefore says nothing about production demand, only that the
budget has never been near its cap.
