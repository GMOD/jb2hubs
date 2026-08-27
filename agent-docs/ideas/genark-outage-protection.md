# GenArk still fails whole during a UCSC outage

50,701 assemblies with no protection, and nothing checks their ~101k upstream
sidecar urls either — `check-sidecar-urls` is UCSC-only on purpose, because
probing them in bulk is the road back to the reverted mirroring sweep. A GenArk
assembly does not open _at all_ when hgdownload stalls, because its `chromSizes`
and `refNameAliases` are both remote and both in the same `loadPre()`
`Promise.all`.

Partly mitigated already: the highest-traffic GenArk genomes are the
UCSC-aliased ones (`rn8` and friends), which get a mirrored UCSC-side config.

If this is revisited, note that of the three options in ADR 0003's amendment
only the CloudFront-origin proxy avoids putting tens of thousands of objects
back in the bucket, since it stores nothing.
