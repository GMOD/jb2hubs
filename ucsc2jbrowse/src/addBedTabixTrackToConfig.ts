import { BED_TABIX, runTabixTrackAdderCli } from './addTabixTrackToConfig.ts'

runTabixTrackAdderCli(
  BED_TABIX,
  'Usage: node addBedTabixTrackToConfig.ts <config.json> <file.bed.gz> [file2.bed.gz ...]',
)
