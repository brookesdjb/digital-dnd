// M1 stub — returns static defaults.
// M3: replace with Supabase Realtime subscription.
// import { useEffect, useState } from 'react'
// import type { Scene } from '@dnd-table/types'

export function useSceneSync(_tableId: string) {
  // M3 implementation:
  //   subscribe to Supabase Realtime channel `table:{tableId}`
  //   fetch full scene from DB on mount (STATE_SYNC)
  //   apply incoming patches from SCENE_PATCHED, FOG_UPDATED, etc.
  return null
}
