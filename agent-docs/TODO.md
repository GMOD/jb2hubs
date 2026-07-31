- check that aws create-invalidation run less
- optimize lint and format speed somehow
- MAF tracks: `createTrackConfiguration.ts` drops `data.frames`, never emits
  `samples`/`nhLocation`; 4 chainNet `.net.bb` tracks are mistyped as MafTrack.
  Fixing the sample wiring is also step one for MAF row → genome navigation —
  `agent-docs/MAF_CROSS_VIEW_NAVIGATION.md`
