import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { FogIO } from '@/components/scene/FogLayer'
import type { PlacedObject, PlacedImage, SceneState } from '@dnd-table/types'
import { remoteLog } from '@/lib/log'

export function useSceneSync(
  tableId: string,
  groundIO: React.RefObject<GroundIO | undefined>,
  fogIO: React.RefObject<FogIO | undefined>,
) {
  const supabase = useMemo(() => createClient(), [])
  const [objects,        setObjects]        = useState<PlacedObject[]>([])
  const [screenW,        setScreenW]        = useState(48.5)
  const [screenH,        setScreenH]        = useState(27.3)
  const [bgColor,        setBgColor]        = useState('#6a8fa8')
  const [rainIntensity,  setRainIntensity]  = useState(0)
  const [showGrid,       setShowGrid]       = useState(false)
  const [hemSkyColor,    setHemSkyColor]    = useState('#87ceeb')
  const [hemGroundColor, setHemGroundColor] = useState('#3d5a1e')
  const [hemIntensity,   setHemIntensity]   = useState(1.5)
  const [sunColor,       setSunColor]       = useState('#fff4e0')
  const [sunIntensity,   setSunIntensity]   = useState(1.8)
  const [sunAzimuth,     setSunAzimuth]     = useState(45)
  const [sunElevation,   setSunElevation]   = useState(55)
  const [fogEnabled,     setFogEnabled]     = useState(false)
  const [fogColor,       setFogColor]       = useState('#adc4d4')
  const [fogDensity,     setFogDensity]     = useState(0.012)
  const [shadowMode,     setShadowMode]     = useState('Blob')
  const [shadowRadius,   setShadowRadius]   = useState(8)
  const [aoRadius,       setAoRadius]       = useState(1.5)
  const [aoIntensity,    setAoIntensity]    = useState(5.0)
  const [blobSize,       setBlobSize]       = useState(1.0)
  const [blobOpacity,    setBlobOpacity]    = useState(1.0)
  const [windSpeed,         setWindSpeed]         = useState(1.2)
  const [windStrength,      setWindStrength]      = useState(1.0)
  const [fowColor,          setFowColor]          = useState('#0a0a1a')
  const [fowDisplayOpacity, setFowDisplayOpacity] = useState(0.92)
  const [gridLineWidth,     setGridLineWidth]     = useState(1.0)
  const [bakedGround,       setBakedGround]       = useState<string | null>(null)
  const [mapImages,         setMapImages]         = useState<PlacedImage[]>([])
  const [isPaused,          setIsPaused]          = useState(false)
  const [isConnected,       setIsConnected]       = useState(false)
  const [reconnectKey,      setReconnectKey]      = useState(0)

  // Pending buffers handle the race where a Realtime message arrives before ioRefs mount.
  const pendingTerrain = useRef<string[] | null>(null)
  const pendingFogMask = useRef<string | null>(null)

  const applySceneState = useCallback((s: SceneState) => {
    setShowGrid(s.showGrid)
    setRainIntensity(s.rainIntensity)
    setBgColor(s.bgColor)
    setHemSkyColor(s.hemSkyColor)
    setHemGroundColor(s.hemGroundColor)
    setHemIntensity(s.hemIntensity)
    setSunColor(s.sunColor)
    setSunIntensity(s.sunIntensity)
    setSunAzimuth(s.sunAzimuth)
    setSunElevation(s.sunElevation)
    setFogEnabled(s.fogEnabled)
    setFogColor(s.fogColor)
    setFogDensity(s.fogDensity)
    setShadowMode(s.shadowMode)
    setShadowRadius(s.shadowRadius)
    setAoRadius(s.aoRadius)
    setAoIntensity(s.aoIntensity)
    setBlobSize(s.blobSize)
    setBlobOpacity(s.blobOpacity)
    setWindSpeed(s.windSpeed)
    setWindStrength(s.windStrength)
    setFowColor(s.fowColor)
    setFowDisplayOpacity(s.fowDisplayOpacity)
    setGridLineWidth(s.gridLineWidth ?? 1.0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply buffered data that arrived before ioRefs were ready (runs every render, cheap check)
  useEffect(() => {
    if (!pendingTerrain.current || !groundIO.current) return
    const layers = pendingTerrain.current
    pendingTerrain.current = null
    groundIO.current.load(layers)
  })

  useEffect(() => {
    if (!pendingFogMask.current || !fogIO.current) return
    const mask = pendingFogMask.current
    pendingFogMask.current = null
    fogIO.current.load(mask)
  })

  // Combined DB load + Realtime subscription. Re-runs on reconnect (reconnectKey increments).
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // Tracks whether SUBSCRIBED has fired once in this effect run (for auto-recovery detection).
    const hasPreviouslySubscribed = { value: false }

    async function loadScene() {
      const { data: table, error: tableError } = await supabase
        .from('table_config')
        .select('id, active_scene_id, screen_w_in, screen_h_in')
        .eq('id', tableId)
        .single()
      if (tableError) console.error('useSceneSync: table_config fetch', tableError)
      if (cancelled || !table) return

      setScreenW(Number(table.screen_w_in))
      setScreenH(Number(table.screen_h_in))
      if (!table.active_scene_id) return

      const { data: scene, error: sceneError } = await supabase
        .from('scene')
        .select('id, terrain, objects, bg_color, weather, fog_mask')
        .eq('id', table.active_scene_id)
        .single()
      if (sceneError) console.error('useSceneSync: scene fetch', sceneError)
      if (cancelled || !scene) return

      const terrain = scene.terrain as { layers?: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } | null
      const objs    = scene.objects as PlacedObject[] | null
      const fogMask = (scene as { fog_mask?: string | null }).fog_mask ?? null

      if (terrain?.bakedGround) setBakedGround(terrain.bakedGround)
      if (terrain?.sceneState) applySceneState(terrain.sceneState)
      setMapImages(terrain?.mapImages ?? [])
      if (terrain?.layers) {
        if (groundIO.current) {
          await groundIO.current.load(terrain.layers)
        } else {
          pendingTerrain.current = terrain.layers
        }
      }
      if (fogMask) {
        if (fogIO.current) {
          await fogIO.current.load(fogMask)
        } else {
          pendingFogMask.current = fogMask
        }
      }
      if (objs) setObjects(objs)
      if (scene.bg_color) setBgColor(scene.bg_color)
      remoteLog('display', 'DB_LOAD', {
        sceneId: scene.id,
        reconnect: reconnectKey > 0,
        objects: objs?.length ?? 0,
        hasTerrain: !!terrain?.layers,
        hasFog: !!fogMask,
      })
    }

    loadScene()

    const ch = supabase.channel(`table:${tableId}`)
    ch
      .on('broadcast', { event: 'SCENE_ACTIVATE' }, async ({ payload }) => {
        const { sceneId } = payload as { sceneId: string }
        remoteLog('display', '← SCENE_ACTIVATE', { sceneId })

        if (groundIO.current) await groundIO.current.load([])
        if (fogIO.current) fogIO.current.clear()
        setObjects([])
        setBakedGround(null)
        setMapImages([])
        pendingTerrain.current = null
        pendingFogMask.current = null

        const { data: scene } = await supabase
          .from('scene')
          .select('id, terrain, objects, bg_color, fog_mask')
          .eq('id', sceneId)
          .single()
        if (!scene) return

        const terrain  = scene.terrain  as { layers?: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } | null
        const objs     = scene.objects  as PlacedObject[] | null
        const fogMask  = (scene as { fog_mask?: string | null }).fog_mask ?? null

        if (terrain?.bakedGround) setBakedGround(terrain.bakedGround)
        if (terrain?.sceneState) applySceneState(terrain.sceneState)
        setMapImages(terrain?.mapImages ?? [])
        if (terrain?.layers) {
          if (groundIO.current) await groundIO.current.load(terrain.layers)
          else pendingTerrain.current = terrain.layers
        }
        if (fogMask) {
          if (fogIO.current) await fogIO.current.load(fogMask)
          else pendingFogMask.current = fogMask
        }
        if (objs) setObjects(objs)
        if (scene.bg_color) setBgColor(scene.bg_color)
        remoteLog('display', 'SCENE_ACTIVATE loaded', { sceneId, objects: objs?.length ?? 0 })
      })
      .on('broadcast', { event: 'TERRAIN_UPDATED' }, async ({ payload }) => {
        const layers = (payload as { terrain: { layers: string[] } }).terrain.layers
        remoteLog('display', '← TERRAIN_UPDATED', { layers: `${layers.length} layers` })
        if (groundIO.current) {
          await groundIO.current.load(layers)
        } else {
          pendingTerrain.current = layers
        }
      })
      .on('broadcast', { event: 'FOG_UPDATED' }, async ({ payload }) => {
        const fogMask = (payload as { fogMask: string }).fogMask
        remoteLog('display', '← FOG_UPDATED', {})
        if (fogIO.current) {
          await fogIO.current.load(fogMask)
        } else {
          pendingFogMask.current = fogMask
        }
      })
      .on('broadcast', { event: 'IMAGES_UPDATED' }, ({ payload }) => {
        const images = (payload as { images: PlacedImage[] }).images
        remoteLog('display', '← IMAGES_UPDATED', { count: images.length })
        setMapImages(images)
      })
      .on('broadcast', { event: 'OBJECTS_UPDATED' }, ({ payload }) => {
        const objects = (payload as { objects: PlacedObject[] }).objects
        remoteLog('display', '← OBJECTS_UPDATED', { count: objects.length })
        setObjects(objects)
      })
      .on('broadcast', { event: 'PAUSE_TOGGLE' }, ({ payload }) => {
        const { isPaused } = payload as { isPaused: boolean }
        remoteLog('display', '← PAUSE_TOGGLE', { isPaused })
        setIsPaused(isPaused)
      })
      .on('broadcast', { event: 'SCREEN_UPDATED' }, ({ payload }) => {
        const { screenW: w, screenH: h } = payload as { screenW: number; screenH: number }
        remoteLog('display', '← SCREEN_UPDATED', { screenW: w, screenH: h })
        setScreenW(w)
        setScreenH(h)
      })
      .on('broadcast', { event: 'STATE_UPDATED' }, ({ payload }) => {
        remoteLog('display', '← STATE_UPDATED', payload as Record<string, unknown>)
        const p = payload as Record<string, unknown>
        if (p.showGrid      !== undefined) setShowGrid(p.showGrid      as boolean)
        if (p.rainIntensity !== undefined) setRainIntensity(p.rainIntensity as number)
        if (p.bgColor       !== undefined) setBgColor(p.bgColor       as string)
        if (p.hemSkyColor    !== undefined) setHemSkyColor(p.hemSkyColor    as string)
        if (p.hemGroundColor !== undefined) setHemGroundColor(p.hemGroundColor as string)
        if (p.hemIntensity   !== undefined) setHemIntensity(p.hemIntensity   as number)
        if (p.sunColor       !== undefined) setSunColor(p.sunColor       as string)
        if (p.sunIntensity   !== undefined) setSunIntensity(p.sunIntensity   as number)
        if (p.sunAzimuth     !== undefined) setSunAzimuth(p.sunAzimuth     as number)
        if (p.sunElevation   !== undefined) setSunElevation(p.sunElevation   as number)
        if (p.fogEnabled     !== undefined) setFogEnabled(p.fogEnabled     as boolean)
        if (p.fogColor       !== undefined) setFogColor(p.fogColor       as string)
        if (p.fogDensity     !== undefined) setFogDensity(p.fogDensity     as number)
        if (p.shadowMode     !== undefined) setShadowMode(p.shadowMode     as string)
        if (p.shadowRadius   !== undefined) setShadowRadius(p.shadowRadius   as number)
        if (p.aoRadius       !== undefined) setAoRadius(p.aoRadius       as number)
        if (p.aoIntensity    !== undefined) setAoIntensity(p.aoIntensity    as number)
        if (p.blobSize       !== undefined) setBlobSize(p.blobSize       as number)
        if (p.blobOpacity    !== undefined) setBlobOpacity(p.blobOpacity    as number)
        if (p.windSpeed         !== undefined) setWindSpeed(p.windSpeed         as number)
        if (p.windStrength      !== undefined) setWindStrength(p.windStrength      as number)
        if (p.fowColor          !== undefined) setFowColor(p.fowColor          as string)
        if (p.fowDisplayOpacity !== undefined) setFowDisplayOpacity(p.fowDisplayOpacity as number)
        if (p.gridLineWidth     !== undefined) setGridLineWidth(p.gridLineWidth     as number)
      })
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          // Ask the control client to send current state immediately (instead of waiting up to 8s).
          ch.send({ type: 'broadcast', event: 'REQUEST_SYNC', payload: {} })
          if (hasPreviouslySubscribed.value) {
            // Supabase auto-recovered: re-fetch DB to catch up on any missed messages.
            void loadScene()
          }
          hasPreviouslySubscribed.value = true
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false)
          // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s
          const delay = Math.min(1000 * Math.pow(2, reconnectKey), 30000)
          remoteLog('display', 'RECONNECT_SCHEDULED', { delay, attempt: reconnectKey + 1 })
          retryTimer = setTimeout(() => {
            if (!cancelled) setReconnectKey(k => k + 1)
          }, delay)
        }
      })

    return () => {
      cancelled = true
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      void supabase.removeChannel(ch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, reconnectKey])

  return {
    objects, screenW, screenH, isPaused,
    bgColor, rainIntensity, showGrid, gridLineWidth,
    hemSkyColor, hemGroundColor, hemIntensity,
    sunColor, sunIntensity, sunAzimuth, sunElevation,
    fogEnabled, fogColor, fogDensity,
    shadowMode, shadowRadius, aoRadius, aoIntensity, blobSize, blobOpacity,
    windSpeed, windStrength,
    fowColor, fowDisplayOpacity,
    bakedGround, mapImages,
    isConnected,
  }
}
