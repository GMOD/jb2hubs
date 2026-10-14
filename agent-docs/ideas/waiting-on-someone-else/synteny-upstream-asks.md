---
name: synteny-upstream-asks
description:
  Changes to jbrowse-components' synteny view that our launches would use:
  species names in the launch dialog, an indel fade, "keep only connected
  chromosomes", one label policy across rows, data-gated colour modes.
---

# Synteny view changes to ask jbrowse-components for

Each one reaches our launches once it lands on jbrowse-components `main`, which
`JBROWSE_BASE` targets. Paths are in jbrowse-components; line numbers were read
2026-10-14 where given. Measurements behind them are in
`agent-docs/reference/SYNTENY_LAUNCH_MEASUREMENTS.md`.

- **Species names in the launch dialog.** `LaunchSyntenyView/PanelList.tsx:254`
  labels a panel `row.assemblyName`, as do the multi-way menus
  (`MultiWaySyntenyDisplay/menus.ts`). A GenArk row prints `GCF_036323735.1`.
- **Fade indels like the ribbon they sit in.** `thinWidthFade` returns 1.0 for
  every CIGAR kind (`LinearSyntenyDisplay/shaders/syntenyTypes.slang:126`), so a
  surviving indel, widened to a 1 px footprint, paints at full alpha against a
  body at 0.2: a 0.3 px deletion draws like a 3 px one. The comment justifying
  `MIN_INDEL_PX`'s drop from 2 to 1 credits an MSAA fade that this path does not
  have; `syntenyTypes.slang` records MSAA as abandoned, and `adr-033` rejects
  extending the density fade to indels.
- **"Keep only connected chromosomes"** in the Rows submenu, beside "Re-order
  chromosomes". `OffscreenMateData.mateRefNameDict`
  (`LinearSyntenyRPC/collectOffscreenMates.ts`) already names the other row's
  contigs and how much aligns to each; `view.showRegions(subset)` inside
  `showRegionsWithUndo` would apply it. `matePanelNavigation.ts` warns against
  narrowing a panel to one contig, which drops ribbons; narrowing to the
  connected set keeps every ribbon by construction.
- **One label policy across rows.** `showLabels` is a config slot, and each
  synteny row is a different trackId, so rows disagree, mostly through
  `maxLabelFeatureDensity`. `installLinkedViewSync` replays only
  `horizontalScroll` and `zoomTo`. A view-level checkbox that pins the mode on
  every row avoids mirroring the slot, which would be a persisted config write.
- **The scalebar's split label.** `withPrefix` (`LinearGenomeView/util.ts`)
  joins assembly and chromosome only on an un-reversed, sticky row whose
  transform fits `captionSpanPx`; otherwise the assembly becomes a separate chip
  and chromosomes print bare. The SVG export (`SVGRowHeader.tsx`,
  `ScalebarRefNameLabels.tsx`) never prints the chromosome.
- **Gate colour modes on the data.** `COLOR_MODES`
  (`packages/synteny-core/src/colorModes.ts`) offers `dN/dS` and
  `Mapping quality`, which a liftOver PIF cannot answer, and `Identity`, which
  needs `=`/`X` CIGAR or a `de` tag. The existing `hasCigarData` gate is the
  same shape.
- **A reduced-affordance launch key.** The view carries a header hamburger
  (seven groups, one holding every row's LGV menu), a menubar and a Tune menu,
  beside six toolbar controls. A launch that arrives with a purpose could open
  with the row menus and the value colour modes collapsed.
- **A compressed `spec-` prefix**, next to `SESSION_QUERY_PREFIXES`. Today
  `encoded-` is the only compressed form and it carries a whole snapshot.
