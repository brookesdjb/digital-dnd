import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'
import { remoteLog } from '@/lib/log'

const TERRAIN_DEBOUNCE_MS = 100
const OBJECTS_DEBOUNCE_MS = 100
const STATE_DEBOUNCE_MS   = 200

export interface SceneState {
  showGrid:      boolean
  rainIntensity: number
  bgColor:       string
  hemSkyColor:    string
  hemGroundColor: string
  hemIntensity:   number
  sunColor:       string
  sunIntensity:   number
  sunAzimuth:     number
  sunElevation:   number
  fogEnabled:     boolean
  fogColor:       string
  fogDensity:     number
  shadowMode:     string
  shadowRadius:   number
  aoRadius:       number
  aoIntensity:    number
  blobSize:       number
  blobOpacity:    number
  windSpeed:      number
  windStrength:   number
}

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
  const stateTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestState  = useRef<SceneState | null>(null)

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
    remoteLog('control', '→ TERRAIN_UPDATED', { sceneId, layers: `${layers.length} layers` })
    ch.send({ type: 'broadcast', event: 'TERRAIN_UPDATED', payload: { sceneId, terrain: { layers } } })
  }, [sceneIdRef, groundIO])

  const publishObjects = useCallback(() => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch) return
    const objects = objectsIO.current?.save() ?? []
    remoteLog('control', '→ OBJECTS_UPDATED', { sceneId, count: objects.length })
    ch.send({ type: 'broadcast', event: 'OBJECTS_UPDATED', payload: { sceneId, objects } })
  }, [sceneIdRef, objectsIO])

  const publishState = useCallback(() => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    const state = latestState.current
    if (!sceneId || !ch || !state) return
    remoteLog('control', '→ STATE_UPDATED', { sceneId, ...state } as Record<string, unknown>)
    ch.send({ type: 'broadcast', event: 'STATE_UPDATED', payload: { sceneId, ...state } })
  }, [sceneIdRef])

  const schedulePublishTerrain = useCallback(() => {
    if (terrainTimer.current) clearTimeout(terrainTimer.current)
    terrainTimer.current = setTimeout(publishTerrain, TERRAIN_DEBOUNCE_MS)
  }, [publishTerrain])

  const schedulePublishObjects = useCallback(() => {
    if (objectsTimer.current) clearTimeout(objectsTimer.current)
    objectsTimer.current = setTimeout(publishObjects, OBJECTS_DEBOUNCE_MS)
  }, [publishObjects])

  const schedulePublishState = useCallback((state: SceneState) => {
    latestState.current = state
    if (stateTimer.current) clearTimeout(stateTimer.current)
    stateTimer.current = setTimeout(publishState, STATE_DEBOUNCE_MS)
  }, [publishState])

  // Re-broadcast state every 8s so displays that connect after the initial publish catch up.
  useEffect(() => {
    const id = setInterval(publishState, 8000)
    return () => clearInterval(id)
  }, [publishState])

  return { schedulePublishTerrain, schedulePublishObjects, schedulePublishState }
}
