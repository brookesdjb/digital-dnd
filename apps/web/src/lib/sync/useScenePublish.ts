import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'

const TERRAIN_DEBOUNCE_MS = 100
const OBJECTS_DEBOUNCE_MS = 100

export function useScenePublish(
  tableId: string,
  sceneIdRef: React.RefObject<string | null>,
  groundIO: React.RefObject<GroundIO | undefined>,
  objectsIO: React.RefObject<ObjectsIO | undefined>,
) {
  const supabase     = createClient()
  const channelRef   = useRef<RealtimeChannel | null>(null)
  const terrainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const objectsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ch = supabase.channel(`table:${tableId}`)
    ch.subscribe()
    channelRef.current = ch
    return () => void supabase.removeChannel(ch)
  }, [tableId, supabase])

  const publishTerrain = useCallback(async () => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch) return
    const layers = await groundIO.current?.save()
    if (!layers) return
    ch.send({ type: 'broadcast', event: 'TERRAIN_UPDATED', payload: { sceneId, terrain: { layers } } })
  }, [sceneIdRef, groundIO])

  const publishObjects = useCallback(() => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch) return
    const objects = objectsIO.current?.save() ?? []
    ch.send({ type: 'broadcast', event: 'OBJECTS_UPDATED', payload: { sceneId, objects } })
  }, [sceneIdRef, objectsIO])

  const schedulePublishTerrain = useCallback(() => {
    if (terrainTimer.current) clearTimeout(terrainTimer.current)
    terrainTimer.current = setTimeout(publishTerrain, TERRAIN_DEBOUNCE_MS)
  }, [publishTerrain])

  const schedulePublishObjects = useCallback(() => {
    if (objectsTimer.current) clearTimeout(objectsTimer.current)
    objectsTimer.current = setTimeout(publishObjects, OBJECTS_DEBOUNCE_MS)
  }, [publishObjects])

  return { schedulePublishTerrain, schedulePublishObjects }
}
