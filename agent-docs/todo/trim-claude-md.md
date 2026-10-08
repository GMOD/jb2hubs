---
name: trim-claude-md
description:
  The root CLAUDE.md is 20,855 words loaded into every session, and four of its
  claims no longer match the code. Colin asked on 2026-09-26 for it to be
  trimmed.
metadata:
  category: ready
  area: docs
  first_move:
    'Move the incident narratives and dated measurements to
    agent-docs/reference/, keeping each rule, invariant and trap.'
  order: 2
---

# Trim the root CLAUDE.md

Colin asked on 2026-09-26 to trim `CLAUDE.md` and drop its version-specific
notes. Keep the rules, invariants and traps. Move the incident narratives and
dated measurements that justify them to `agent-docs/reference/`, or drop them
where git already holds the story.

Drift found by the 2026-09-26 shell review and still present on 2026-10-08:

- `CLAUDE.md` names the pinned CLI as `5.0.0-beta.2`; `package.json` pins
  `5.0.0-beta.7`.
- `CLAUDE.md` puts `seqids_resolve` in `downloadNcbiGff.sh`; the function is
  `seqidsResolve` in `ucsc2jbrowse/src/addNcbiRefSeqGffTrack.ts`.
- `CLAUDE.md` says a failed GenArk GFF fetch is classified with a HEAD request;
  `genark2jbrowse/downloadNcbiGff.sh` reads the GET's own `%{http_code}`.
- `CLAUDE.md` says the whole remote side of `deploy.sh` runs under pipefail; the
  file-count and cleanup ssh calls are bare commands.
- A comment in `lib/common.sh` still says genark hands the url to `wget -N`.
