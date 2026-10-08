import { useSyncExternalStore } from 'react'

import {
  prefersDesktop,
  subscribeDesktopPreference,
} from '../lib/desktopPreference.ts'

export function useDesktopLaunch() {
  return useSyncExternalStore(
    subscribeDesktopPreference,
    prefersDesktop,
    () => false,
  )
}
