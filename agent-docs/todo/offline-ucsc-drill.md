# Make the UCSC outage drill repeatable

`check-sidecar-urls` proves a config _names_ local files. Nothing proves the app
actually opens without UCSC, and the 6-hourly `config-canary.yml` boots against
a working hgdownload, so it stays green right up until the outage itself.

`scripts/checkConfigCompat.mjs` already calls
`page.setRequestInterception(true)`, so an `--offline-ucsc` mode that aborts
every request to `hgdownload.soe.ucsc.edu` and then asserts hg38/hg19 still open
is small (~40 lines against existing code). Wire it into `config-canary.yml` and
a regression surfaces within 6 hours — including one that originates outside
this repo.

Context: as of 2026-08-05 hg19/hg38 already survive an outage — all three
`loadPre()` sidecars are mirrored and confirmed live in the bucket, and
`MUST_BE_LOCAL` fails the pre-upload gate if that regresses. See
[../architectural-decision-records/0003-mirror-assembly-sidecars.md](../architectural-decision-records/0003-mirror-assembly-sidecars.md).
