---
name: blat-on-production-launches
description:
  BLAT and in-silico PCR reach only staging /ucsc/* launches. The v1 UMD killed
  every v4.3.0 session, which kept it out of config.json; jbrowse-components
  a7bd11c298 fixes that, so publishing the bundle and moving the Blat entry into
  defaultPlugins puts it on every production launch, GenArk included.
---

# BLAT on production launches

`stagingEnhanceOptions` (`hubtools/src/enhanceConfig.ts`) writes the BLAT plugin
into `config-staging.json` only, so only staging `/ucsc/*` launches have the
Tools menu's **BLAT search** and **In-silico PCR**. The assemblies are ready on
both arms: `ucsc2jbrowse/src/createAssembly.ts` and
`hubtools/src/generateJBrowseConfigForAssemblyHub.ts` write `blatDb`, and
jbrowse-components' `plugins/blat/src/ucscDbMap.ts` accepts UCSC dbs and GenArk
accessions. A browser reaches UCSC through the jbrowse.org proxy
(`products/aws/blat-proxy` in jbrowse-components), whose one shared key is
accepted as the budget for every launch.

## What kept it out of config.json

Booted 2026-11-03 with a copy of `scripts/checkConfigCompat.mjs` that added the
published `hg38/config-staging.json` and `hg19/config-staging.json`:

| host           | published v1 UMD                                                           | a7bd11c298's bundle  |
| -------------- | -------------------------------------------------------------------------- | -------------------- |
| v4.3.0         | FATAL `Failed to load UMD bundle for Blat, JBrowsePluginBlat is undefined` | boots, no BLAT items |
| v5.0.0-beta.20 | ok                                                                         | boots, BLAT in Tools |
| main           | ok                                                                         | boots, BLAT in Tools |

The new bundle was served in place of the published one by request interception.
`checkConfigCompat.mjs`'s `CONFIGS` boots no staging sibling, which is why
nothing had caught the crash.

## The steps

- Publish the bundle (`plugins/blat/scripts/publish-umd.sh` in
  jbrowse-components, which a release tag also runs).
- Move the Blat entry from `stagingEnhanceOptions` into `defaultPlugins`, so
  `config.json` carries it on both arms.
- `pnpm check-config-compat --local` on the regenerated configs, then upload
  them.

## Demand, as far as it can be read

`/status` and CloudWatch show the proxy at about 4 Lambda invocations a day for
the 30 days to 2026-11-03, steady enough to be a scheduled probe rather than
users; DynamoDB's `day#` counters expire, so only two days are readable (3 and 1
calls).
