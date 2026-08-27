# Should we mirror the hg19 and hg38 2bits?

Open question, not a decision. `hg38.2bit` is 797 MB and `hg19.2bit` 778 MB:
**1.5 GB in 2 objects**. It is the last UCSC dependency for those two
assemblies, and during an outage it is the one visibly broken thing — the
assembly opens, the sequence track does not.

ADR 0003 rejects mirroring 2bits, but that was about doing it across all 238
assemblies, and what actually killed the GenArk sweep was object count
(101,384), which two objects does not approach. So this is a different decision
from the one the ADR made, and it wants an explicit answer rather than an
assumption either way — including an amendment to
[../architectural-decision-records/0003-mirror-assembly-sidecars.md](../architectural-decision-records/0003-mirror-assembly-sidecars.md)
if the answer is yes.
