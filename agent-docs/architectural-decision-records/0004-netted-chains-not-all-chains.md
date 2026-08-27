# 4. Chain tracks come from netted chains, not `all.chain`

Date: 2026-08-08 (measured), recorded 2026-08-27

## Status

Accepted.

## Context

`createChainTrackPifs.sh` takes a source of either `liftOver` or `vs`, and
`makePifs.sh` only ever calls it with `liftOver`. That reads as a coverage gap
in the pipeline. It is not one, and the `vs` files were deleted from the bucket
deliberately — so the reasoning needs to live somewhere that stops someone
turning the switch on.

`liftOver` is UCSC's netted `over.chain`; `vs` is the raw `all.chain` in the
per-pair `vsXxx` directories.

## `vs` adds almost no pairs anyone opens

Measured against hgdownload 2026-08-08, counting targets rather than
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

For everything that carries traffic, `vs` is very nearly a subset of what
liftOver already covers, and hg38's single addition is its own self-chain.

It is also far bigger: hg38→mm39 is 70MB netted against 208MB all-chain,
hg38→panTro6 12MB against 135MB. Worst exactly where coverage would be gained,
because close relatives align almost everywhere — galGal6→melGal5 is **2.2GB**
and galGal6→anaPla1 1.3GB, for one pair each.

## Netting does not drop paralogs

This is the obvious fear, so it was measured rather than assumed.
`netChainSubset` pulls **whole chains** that appear anywhere in the net, not
just the top-level one, so a paralogous chain comes along with them. Do not
describe `over.chain` as "the best chain per region" — that is wrong, and it is
what makes dropping `all.chain` sound riskier than it is.

hg38→panTro6, both files:

|                                             | over.chain | all.chain |
| ------------------------------------------- | ---------- | --------- |
| chains                                      | 30,099     | 3,428,602 |
| hg38 bases covered                          | 2.989 Gb   | 2.989 Gb  |
| covered by all.chain and **not** over.chain | —          | **0**     |
| mean alignments per covered base            | 1.18       | 2.46      |
| max alignments on one base                  | 19         | **5,960** |

No hg38 territory is lost at all, and paralogy is retained rather than
collapsed: 15% of hg38 bases and 28% of panTro6 bases sit under more than one
chain in the netted file, up to 19 deep. The textbook case checks out too — SMN1
and SMN2 are each covered by several chains and both map to the same chimp loci,
so the duplication is representable.

What `all.chain` adds is the depth tail from ~20 to 5,960 alignments on a single
base. A base aligning 5,960 ways is in a repeat family, not a gene duplication,
and drawing it is the hairball. That is the whole difference: 114× the chains,
0% new sequence.

Measured on one close pair. The zero-extra-territory result should hold
generally, since a chain that aligns anything is eligible for the net, but the
depth numbers move with divergence.

## Consequence

Keep `makePifs.sh` calling `liftOver` only. If the galGal6 bird set is ever
actually wanted, source netted chains for it rather than turning the `vs` switch
on.

Unrelated but easy to trip over: mm39's GCF_003668045.3 has no `vs` directory
either — that alignment exists only under `/gbdb/mm39/bbi/chainNet`.
