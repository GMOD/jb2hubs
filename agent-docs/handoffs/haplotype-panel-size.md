# Haplotype panel size: why eight lanes, and drawing every configuration at small loci

Proposed 2026-09-17, not built. Colin asked why a haplotypes launch draws eight
lanes; nothing here is agreed. Delete this file once it is decided and done.

## Where the eight comes from

`DEFAULT_PANEL_SIZE = 8` in `website/src/components/pangenomePanels.ts` copies
the JBrowse tutorial's CFHR3-CFHR1 demo, which hand-picked eight haplotypes. No
measurement chose it.

`choosePanel` groups haplotypes by their genotype vector at the SV-tier sites in
the launch window. Identical vectors form one structural configuration. It draws
one representative per configuration, commonest first, breaking ties toward the
configuration least like those already chosen and preferring a member with gene
models, and stops at eight. A locus with fewer configurations draws them all:
HP has 2, PGA 3.

## What the cap hides

Per `website/public/pangenome-hprc/panels.json` on 2026-09-17, configurations
per locus:

| locus | configurations | lanes |
| --- | --- | --- |
| hp | 2 | 2 |
| pga | 3 | 3 |
| amy1 | 9 | 8 |
| nphp1 | 12 | 8 |
| mns | 24 | 8 |
| everything else | 60 to 259 | 8 |

At most loci eight is simply "the commonest few". AMY1 is the one where the cap
drops a single configuration: 9 exist, and the ninth, NA18620#2 (one haplotype),
loses the tie-break to HG00408#2 (one haplotype, 64 non-reference sites). Both
became readable with @gmod/gbz-base 2.6.3, when the `UNREADABLE` exclusion was
lifted (`1e6d9bd4efd`).

## Proposal

Draw every configuration when a locus has at most 10, and keep 8 otherwise.
Today that changes only AMY1, from 8 lanes to all 9. CFHR keeps its panel, so
the jbrowse-components tutorial figure `pangenome/genomes_hprc_cfhr_haplotypes`,
whose spec hard-codes that panel, stays valid.

The threshold of 10 is as unmeasured as the 8. Settle what it should mean
(readable lane count, launch load time for a panel of that size) before
committing to a number.

## Steps

1. Change the size rule in `choosePanel` or its caller in
   `website/generatePangenomePanels.ts`, and extend `pangenomePanels.test.ts`
   for a locus just under and just over the threshold.
2. On ada, regenerate the panels and diff `panels.json`: only AMY1 should gain a
   lane. If any other locus changes, stop and find out why.
3. On ada, run the website tests, `pnpm lint`, `pnpm typecheck`, and
   `pnpm check-pangenome-launches --loci amy1`. Confirm all 9 lanes load, and
   note the load time next to the 8-lane panel's 5.2 s.
4. Commit, push, and redeploy staging from ada
   (`./run.sh --upload-only --staging`).

Another session was regenerating these panels on 2026-09-17 (CAT gene models on
the lanes, `b96fea23fdf`, `666eb153c6d`). Rebase onto that work before step 2.
