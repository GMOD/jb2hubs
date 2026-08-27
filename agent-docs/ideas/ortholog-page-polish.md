# Gene/ortholog page rough edges

None of these is decided; they are what the page knowingly does not do.

**Clade scoping loses the reference.** Scoping to a clade the reference is not
in (human TP53 → Birds) drops the ref row and every synteny link, because
`taxon_filter` excludes the reference's own report. The page now says so and
names the way back. The alternative is injecting the reference taxon into the
request, which muddies the "N of M in birds" count — a real trade, not an
oversight.

**Table affordances.** No column sorting, no expand-all.

**NCBI is browser-direct and unkeyed.** Pre-existing, not introduced here.

**Unused payload.** The ortholog response carries GO terms and
Ensembl/UniProt/OMIM ids that nothing displays.

See also [../ORTHOLOGS_LAUNCH_FOLLOWUPS.md](../ORTHOLOGS_LAUNCH_FOLLOWUPS.md).
