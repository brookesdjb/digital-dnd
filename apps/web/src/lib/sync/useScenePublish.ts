import { useEffect, useRef, useCallback, useMemo } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'
import type { FogIO } from '@/components/scene/FogLayer'
import { remoteLog } from '@/lib/log'
import type { SceneState, PlacedImage } from '@dnd-table/types'

export type { SceneState }

const TERRAIN_DEBOUNCE_MS = 100
const OBJECTS_DEBOUNCE_MS = 100
const STATE_DEBOUNCE_MS   = 200

export function useScenePublish(
  tableId: string,
  sceneIdRef: React.RefObject<string | null>,
  groundIO: React.RefObject<GroundIO | undefined>,
  objectsIO: React.RefObject<ObjectsIO | undefined>,
  fogIO: React.RefObject<FogIO | undefined>,
) {
  // Stable client — must not be recreated on every render (breaks channel useEffect dep).
  const supabase     = useMemo(() => createClient(), [])
  const channelRef   = useRef<RealtimeChannel | null>(null)
  const terrainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const objectsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fogTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imagesTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestState  = useRef<SceneState | null>(null)
  const latestImages = useRef<PlacedImage[]>([])

  useEffect(() => {
    const ch = supabase.channel(`table:${tableId}`)
    ch
      .on('broadcast', { event: 'REQUEST_SYNC' }, () => {
        remoteLog('control', '← REQUEST_SYNC', {})
        publishState()
      })
      .subscribe()
    channelRef.current = ch
    return () => void supabase.removeChannel(ch)
  // publishState is a stable useCallback (only refs in deps) — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const publishFog = useCallback(async () => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch || !fogIO.current) return
    const fogMask = await fogIO.current.save()
    remoteLog('control', '→ FOG_UPDATED', { sceneId })
    ch.send({ type: 'broadcast', event: 'FOG_UPDATED', payload: { sceneId, fogMask } })
  }, [sceneIdRef, fogIO])

  const schedulePublishObjects = useCallback(() => {
    if (objectsTimer.current) clearTimeout(objectsTimer.current)
    objectsTimer.current = setTimeout(publishObjects, OBJECTS_DEBOUNCE_MS)
  }, [publishObjects])

  const schedulePublishState = useCallback((state: SceneState) => {
    latestState.current = state
    if (stateTimer.current) clearTimeout(stateTimer.current)
    stateTimer.current = setTimeout(publishState, STATE_DEBOUNCE_MS)
  }, [publishState])

  const schedulePublishFog = useCallback(() => {
    if (fogTimer.current) clearTimeout(fogTimer.current)
    fogTimer.current = setTimeout(publishFog, 100)
  }, [publishFog])

  const publishImages = useCallback(() => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch) return
    const images = latestImages.current
    remoteLog('control', '→ IMAGES_UPDATED', { sceneId, count: images.length })
    ch.send({ type: 'broadcast', event: 'IMAGES_UPDATED', payload: { sceneId, images } })
  }, [sceneIdRef])

  const schedulePublishImages = useCallback((images: PlacedImage[]) => {
    latestImages.current = images
    if (imagesTimer.current) clearTimeout(imagesTimer.current)
    imagesTimer.current = setTimeout(publishImages, 100)
  }, [publishImages])

  const publishSceneActivate = useCallback((newSceneId: string) => {
    const ch = channelRef.current
    if (!ch) return
    remoteLog('control', '→ SCENE_ACTIVATE', { sceneId: newSceneId })
    ch.send({ type: 'broadcast', event: 'SCENE_ACTIVATE', payload: { sceneId: newSceneId } })
  }, [])

  const publishPause = useCallback((isPaused: boolean) => {
    const ch = channelRef.current
    if (!ch) return
    remoteLog('control', '→ PAUSE_TOGGLE', { isPaused })
    ch.send({ type: 'broadcast', event: 'PAUSE_TOGGLE', payload: { isPaused } })
  }, [])

  const publishScreenDims = useCallback((screenW: number, screenH: number) => {
    const ch = channelRef.current
    if (!ch) return
    remoteLog('control', '→ SCREEN_UPDATED', { screenW, screenH })
    ch.send({ type: 'broadcast', event: 'SCREEN_UPDATED', payload: { screenW, screenH } })
  }, [])

  // Broadcasts all current state to recover a display that has drifted.
  const publishFullSync = useCallback(async () => {
    const sceneId = sceneIdRef.current
    const ch = channelRef.current
    if (!sceneId || !ch) return
    remoteLog('control', '→ FORCE_FULL_SYNC', { sceneId })

    const layers = await groundIO.current?.save()
    if (layers) {
      ch.send({ type: 'broadcast', event: 'TERRAIN_UPDATED', payload: { sceneId, terrain: { layers } } })
    }

    const objects = objectsIO.current?.save() ?? []
    ch.send({ type: 'broadcast', event: 'OBJECTS_UPDATED', payload: { sceneId, objects } })

    if (fogIO.current) {
      const fogMask = await fogIO.current.save()
      ch.send({ type: 'broadcast', event: 'FOG_UPDATED', payload: { sceneId, fogMask } })
    }

    const images = latestImages.current
    if (images.length > 0) {
      ch.send({ type: 'broadcast', event: 'IMAGES_UPDATED', payload: { sceneId, images } })
    }

    publishState()
  }, [sceneIdRef, groundIO, objectsIO, fogIO, publishState])

  // Re-broadcast state every 8s so displays that connect after the initial publish catch up.
  useEffect(() => {
    const id = setInterval(publishState, 8000)
    return () => clearInterval(id)
  }, [publishState])

  return { schedulePublishTerrain, schedulePublishObjects, schedulePublishState, schedulePublishFog, schedulePublishImages, publishSceneActivate, publishPause, publishScreenDims, publishFullSync }
}
