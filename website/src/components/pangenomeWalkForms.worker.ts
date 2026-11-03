// Reads a window's structural forms off the walk file away from the page's
// main thread, where at MHC class II the read cost 13 s of CPU. The page keeps
// one worker across questions, so the walk file's index is read once, and
// terminates it on an abort or a deadline.

import { replyError } from './pangenomeGraphLayout.ts'
import { readWalkForms } from './pangenomeWalkForms.ts'

import type {
  PostedWalkFormsRequest,
  WalkFormsReply,
} from './pangenomeWalkFormsClient.ts'

self.onmessage = async ({ data }: MessageEvent<PostedWalkFormsRequest>) => {
  let reply: WalkFormsReply
  try {
    reply = {
      id: data.id,
      forms: await readWalkForms(data.walksUrl, data.region),
    }
  } catch (e) {
    reply = { id: data.id, error: replyError(e) }
  }
  self.postMessage(reply)
}
