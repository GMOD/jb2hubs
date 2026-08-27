# ideas

Things we might do. Nothing here is committed to, and several are open questions
whose answer might be "no" — the point is that the reasoning and the numbers
survive until someone decides.

Work we do intend to finish lives in [../todo/](../todo/).

- [desktop-content-integration.md](desktop-content-integration.md) — JBrowse
  Desktop can only launch a hosted config, so every spec-session feature this
  portal builds is web-only. The keystone and the dependency order behind it.
- [mirror-hg19-hg38-2bits.md](mirror-hg19-hg38-2bits.md) — 1.5 GB in 2 objects
  would close the last UCSC dependency for the two assemblies people open. ADR
  0003 said no to a different question.
- [genark-outage-protection.md](genark-outage-protection.md) — 50,701 assemblies
  that do not open at all when hgdownload stalls, and why the obvious fix was
  already reverted once
- [ortholog-page-polish.md](ortholog-page-polish.md) — clade scoping drops the
  reference row, plus the payload the page fetches and never shows
- [faster-lint-and-format.md](faster-lint-and-format.md) — unprofiled, so the
  first step is a measurement
