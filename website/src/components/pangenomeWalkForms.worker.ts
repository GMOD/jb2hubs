// Reads a window's structural forms off the walk file away from the page's
// main thread, where at MHC class II the read cost 13 s of CPU. One worker
// per question; the page terminates it on an answer, an abort or its deadline.

import { replyError } from './pangenomeGraphLayout.ts'
import { readWalkForms } from './pangenomeWalkForms.ts'

import type {
  WalkFormsReply,
  WalkFormsRequest,
} from './pangenomeWalkFormsClient.ts'

self.onmessage = async ({ data }: MessageEvent<WalkFormsRequest>) => {
  let reply: WalkFormsReply
  try {
    reply = { forms: await readWalkForms(data.walksUrl, data.region) }
  } catch (e) {
    reply = { error: replyError(e) }
  }
  self.postMessage(reply)
}
