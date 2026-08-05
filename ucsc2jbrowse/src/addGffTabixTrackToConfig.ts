import { GFF_TABIX, runTabixTrackAdderCli } from './addTabixTrackToConfig.ts'

runTabixTrackAdderCli(
  GFF_TABIX,
  'Usage: node addGffTabixTrackToConfig.ts <config.json> <file.gff.gz> [file2.gff.gz ...]',
)
