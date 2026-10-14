---
name: mirror-hg19-hg38-2bits
description:
  Mirror the 1.5 GB hg19 and hg38 2bits to close the last UCSC dependency for
  the two assemblies people open.
---

# Should we mirror the hg19 and hg38 2bits?

`hg38.2bit` is 797 MB and `hg19.2bit` 778 MB, so mirroring both adds 1.5 GB in 2
objects. The 2bit is the last UCSC dependency for those two assemblies, and
during an outage it is the one part that visibly breaks: the assembly opens and
the sequence track does not.

ADR 0003 rejects mirroring 2bits across all 238 assemblies, and the GenArk sweep
was reverted for its object count (101,384), which two objects do not approach.
Mirroring these two is therefore a separate decision from the one the ADR made,
and it needs an explicit answer. A yes means an amendment to
[../../architecture-decision-records/0003-mirror-assembly-sidecars.md](../../architecture-decision-records/0003-mirror-assembly-sidecars.md).
