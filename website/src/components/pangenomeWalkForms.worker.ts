// Reads a window's structural forms off the walk file away from the page's
// main thread, where at MHC class II the read cost 13 s of CPU. The page keeps
// one worker across questions, so the walk file's index is read once, and
// terminates it on an abort or a deadline.

import { readWalkForms } from './pangenomeWalkForms.ts'
import { serve } from './pangenomeWorkerClient.ts'

import type { WalkFormsRequest } from './pangenomeWalkFormsClient.ts'

serve(({ walksUrl, region }: WalkFormsRequest) =>
  readWalkForms(walksUrl, region),
)
