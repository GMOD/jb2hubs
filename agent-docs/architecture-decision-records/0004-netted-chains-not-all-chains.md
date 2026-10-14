# ADR 0004 — Chain tracks come from netted chains, not `all.chain`

- **Status:** Accepted
- **Date:** 2026-08-27 (measured 2026-08-08)
- **Affected:** `ucsc2jbrowse/createChainTrackPifs.sh`,
  `ucsc2jbrowse/makePifs.sh`

## Context

Until 2026-10-08 `createChainTrackPifs.sh` took a source of either `liftOver` or
`vs`, and `makePifs.sh` only ever called it with `liftOver`. That looked like a
coverage gap in the pipeline. We deleted the `vs` files from the bucket on
purpose, and this record keeps the reasoning so nobody turns the switch on.

`liftOver` is UCSC's netted `over.chain`; `vs` is the raw `all.chain` in the
per-pair `vsXxx` directories.

## `vs` adds almost no pairs anyone opens

Measured against hgdownload on 2026-08-08, counting targets rather than
directories:

| assembly | liftOver | vs  | vs-only                          |
| -------- | -------- | --- | -------------------------------- |
| hg38     | 239      | 171 | 1 (`self`)                       |
| hg19     | 117      | 96  | 3 (`galGal6`, `vicPac2`, `self`) |
| mm10     | 173      | 142 | 1 (`gorGor6`)                    |
| mm39     | 76       | 36  | 0                                |
| danRer11 | 8        | 4   | 1                                |
| dm6      | 57       | 29  | 19                               |
| ce11     | 6        | 27  | 26                               |
| galGal6  | 11       | 78  | 74                               |

For the assemblies with traffic, `vs` is very nearly a subset of the liftOver
pairs, and hg38's single addition is its self-chain.

The `vs` files are also far bigger: hg38→mm39 is 70MB netted against 208MB
all-chain, and hg38→panTro6 12MB against 135MB. The size is worst where coverage
would be gained, because close relatives align almost everywhere:
galGal6→melGal5 is **2.2GB** and galGal6→anaPla1 1.3GB, for one pair each.

## Netting keeps paralogs

Netting might drop paralogs, so we measured it. `netChainSubset` pulls whole
chains that appear anywhere in the net, not only the top-level one, so a
paralogous chain is included with them. Do not describe `over.chain` as "the
best chain per region": that description is wrong, and it makes dropping
`all.chain` sound riskier than it is.

hg38→panTro6, both files:

|                                             | over.chain | all.chain |
| ------------------------------------------- | ---------- | --------- |
| chains                                      | 30,099     | 3,428,602 |
| hg38 bases covered                          | 2.989 Gb   | 2.989 Gb  |
| covered by all.chain and **not** over.chain | —          | **0**     |
| mean alignments per covered base            | 1.18       | 2.46      |
| max alignments on one base                  | 19         | **5,960** |

The netted file loses no hg38 territory and keeps paralogy: 15% of hg38 bases
and 28% of panTro6 bases are under more than one chain in it, up to 19 deep.
SMN1 and SMN2, the textbook case, are each covered by several chains and both
map to the same chimp loci, so the netted file represents the duplication.

`all.chain` adds the depth tail from ~20 to 5,960 alignments on a single base. A
base that aligns 5,960 ways is in a repeat family, not a gene duplication, and
drawing those alignments produces an unreadable tangle. All told, `all.chain`
has 114× the chains and 0% new sequence.

These numbers come from one close pair. The zero-extra-territory result should
hold generally, since any chain that aligns sequence is eligible for the net,
but the depth numbers change with divergence.

## Consequence

Keep `makePifs.sh` calling `liftOver` only. If the galGal6 bird set is ever
wanted, source netted chains for it instead of turning the `vs` switch on.

mm39's GCF_003668045.3 has no `vs` directory either; that alignment exists only
under `/gbdb/mm39/bbi/chainNet`.
