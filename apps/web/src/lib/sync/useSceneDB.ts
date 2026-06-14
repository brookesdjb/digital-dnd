import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'
import type { FogIO } from '@/components/scene/FogLayer'
import type { SceneState, PlacedImage } from '@dnd-table/types'

const DEBOUNCE_MS = 500

export interface SceneRow {
  id: string
  name: string
  sort_order: number
}

export function useSceneDB(
  tableId: string,
  groundIO: React.RefObject<GroundIO | undefined>,
  objectsIO: React.RefObject<ObjectsIO | undefined>,
  fogIO: React.RefObject<FogIO | undefined>,
) {
  const sceneIdRef      = useRef<string | null>(null)
  const saveTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSwitching     = useRef(false)
  const bgColorRef      = useRef<string>('#6a8fa8')
  const bakedGroundRef  = useRef<string | undefined>(undefined)
  const sceneStateRef   = useRef<SceneState | null>(null)
  const mapImagesRef    = useRef<PlacedImage[]>([])
  // Cache of last-encoded terrain/fog — used by saveStateOnly to avoid re-encoding.
  const lastLayersRef   = useRef<string[]>([])
  const lastFogRef      = useRef<string | null>(null)
  // Pending buffers: DB fetch can complete before ioRefs are registered (Ground is in Suspense).
  const pendingLayersRef  = useRef<string[] | null>(null)
  const pendingFogRef     = useRef<string | null>(null)
  const [screenW, setScreenW]           = useState(47.9)
  const [screenH, setScreenH]           = useState(27.0)
  const [scenes, setScenes]             = useState<SceneRow[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [loadedSceneState, setLoadedSceneState] = useState<SceneState | null>(null)
  const [loadedMapImages,  setLoadedMapImages]  = useState<PlacedImage[] | null>(null)
  // Increments every time a scene finishes loading (initial load or switch).
  // ControlScene watches this so the restore effect fires even when loadedSceneState goes null→null.
  const [sceneVersion, setSceneVersion] = useState(0)
  // Stable client — createClient() must not be called on every render (breaks useCallback deps).
  const supabase = useMemo(() => createClient(), [])

  // Load active scene and full scene list on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: table, error: tableError } = await supabase
        .from('table_config')
        .select('id, active_scene_id, screen_w_in, screen_h_in')
        .eq('id', tableId)
        .single()

      if (tableError) console.error('useSceneDB: table_config fetch', tableError?.message, tableError?.code, tableError)
      if (cancelled || !table) return

      setScreenW(Number(table.screen_w_in))
      setScreenH(Number(table.screen_h_in))

      // Load all scenes for this table
      const { data: allScenes } = await supabase
        .from('scene')
        .select('id, name, sort_order')
        .eq('table_id', tableId)
        .order('sort_order', { ascending: true })
      if (!cancelled) setScenes(allScenes ?? [])

      let scene: { id: string; terrain: unknown; objects: unknown; bg_color: string | null; fog_mask: string | null } | null = null
      if (table.active_scene_id) {
        const { data: sceneData, error: sceneError } = await supabase
          .from('scene')
          .select('id, terrain, objects, bg_color, fog_mask')
          .eq('id', table.active_scene_id)
          .single()
        if (sceneError) console.error('useSceneDB: scene fetch', sceneError)
        else scene = sceneData
      }

      if (cancelled) return

      if (!scene) {
        // No active scene — create a default one
        const { data: newScene, error: insertError } = await supabase
          .from('scene')
          .insert({ table_id: tableId, name: 'Scene 1', sort_order: 0 })
          .select('id, name, sort_order')
          .single()

        if (insertError) { console.error('useSceneDB: scene insert', insertError); return }
        if (!newScene || cancelled) return

        await supabase.from('table_config').update({ active_scene_id: newScene.id }).eq('id', tableId)
        sceneIdRef.current = newScene.id
        setActiveSceneId(newScene.id)
        setScenes([newScene])
        return
      }

      sceneIdRef.current = scene.id
      setActiveSceneId(scene.id)
      if (scene.bg_color) bgColorRef.current = scene.bg_color

      const terrain = scene.terrain as { layers?: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } | null
      const objects = scene.objects as unknown[] | null

      bakedGroundRef.current = terrain?.bakedGround ?? undefined
      if (terrain?.sceneState) sceneStateRef.current = terrain.sceneState
      setLoadedSceneState(terrain?.sceneState ?? null)
      setSceneVersion(v => v + 1)
      mapImagesRef.current = terrain?.mapImages ?? []
      setLoadedMapImages(terrain?.mapImages ?? [])

      if (terrain?.layers) {
        lastLayersRef.current = terrain.layers
        if (groundIO.current) await groundIO.current.load(terrain.layers)
        else pendingLayersRef.current = terrain.layers
      }
      if (objects && objectsIO.current) objectsIO.current.load(objects as Parameters<ObjectsIO['load']>[0])
      if (scene.fog_mask) {
        lastFogRef.current = scene.fog_mask
        if (fogIO.current) await fogIO.current.load(scene.fog_mask)
        else pendingFogRef.current = scene.fog_mask
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  // Apply buffered data that arrived before ioRefs were ready (runs every render, cheap check).
  useEffect(() => {
    if (!pendingLayersRef.current || !groundIO.current) return
    const layers = pendingLayersRef.current
    pendingLayersRef.current = null
    groundIO.current.load(layers)
  })
  useEffect(() => {
    if (!pendingFogRef.current || !fogIO.current) return
    const mask = pendingFogRef.current
    pendingFogRef.current = null
    fogIO.current.load(mask)
  })

  const save = useCallback(async (opts?: { bakedGround?: string }) => {
    const sceneId = sceneIdRef.current
    if (!sceneId) return
    const layers   = await groundIO.current?.save()
    const objects  = objectsIO.current?.save() ?? []
    const fog_mask = fogIO.current ? await fogIO.current.save() : null

    // Cache for saveStateOnly so state-only saves don't need to re-encode.
    if (layers)    lastLayersRef.current = layers
    if (fog_mask !== undefined) lastFogRef.current = fog_mask

    if (opts?.bakedGround !== undefined) bakedGroundRef.current = opts.bakedGround

    const terrain: { layers: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } = { layers: layers ?? [] }
    if (bakedGroundRef.current) terrain.bakedGround = bakedGroundRef.current
    if (sceneStateRef.current) terrain.sceneState = sceneStateRef.current
    if (mapImagesRef.current.length > 0) terrain.mapImages = mapImagesRef.current

    await supabase
      .from('scene')
      .update({ terrain, objects, bg_color: bgColorRef.current, fog_mask })
      .eq('id', sceneId)
  }, [groundIO, objectsIO, fogIO, supabase])

  // Fast state-only persist: reuses cached layers/fog so no canvas encoding.
  // Use this when only sceneState/bgColor changed (lighting, shadows, weather, wind).
  const saveStateOnly = useCallback(async () => {
    const sceneId = sceneIdRef.current
    if (!sceneId) return
    const terrain: { layers: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } = {
      layers: lastLayersRef.current,
    }
    if (bakedGroundRef.current) terrain.bakedGround = bakedGroundRef.current
    if (sceneStateRef.current) terrain.sceneState = sceneStateRef.current
    if (mapImagesRef.current.length > 0) terrain.mapImages = mapImagesRef.current
    await supabase
      .from('scene')
      .update({ terrain, bg_color: bgColorRef.current })
      .eq('id', sceneId)
  }, [supabase])

  const switchScene = useCallback(async (newSceneId: string) => {
    if (newSceneId === sceneIdRef.current || isSwitching.current) return
    isSwitching.current = true
    try {
      // Save current scene, then clear all 3D state
      await save()
      await groundIO.current?.load([])
      objectsIO.current?.load([])
      fogIO.current?.clear()

      // Update active scene in DB
      await supabase.from('table_config').update({ active_scene_id: newSceneId }).eq('id', tableId)
      sceneIdRef.current = newSceneId
      setActiveSceneId(newSceneId)

      // Load new scene data
      const { data: scene } = await supabase
        .from('scene')
        .select('id, terrain, objects, bg_color, fog_mask')
        .eq('id', newSceneId)
        .single()
      if (!scene) return

      const terrain  = scene.terrain  as { layers?: string[]; bakedGround?: string; sceneState?: SceneState; mapImages?: PlacedImage[] } | null
      const objects  = scene.objects  as unknown[] | null
      const fog_mask = scene.fog_mask as string | null

      bakedGroundRef.current = terrain?.bakedGround ?? undefined
      if (terrain?.sceneState) sceneStateRef.current = terrain.sceneState
      setLoadedSceneState(terrain?.sceneState ?? null)
      setSceneVersion(v => v + 1)
      mapImagesRef.current = terrain?.mapImages ?? []
      setLoadedMapImages(terrain?.mapImages ?? [])

      if (terrain?.layers) {
        lastLayersRef.current = terrain.layers
        if (groundIO.current) await groundIO.current.load(terrain.layers)
        else pendingLayersRef.current = terrain.layers
      }
      if (objects && objectsIO.current) objectsIO.current.load(objects as Parameters<ObjectsIO['load']>[0])
      if (fog_mask) {
        lastFogRef.current = fog_mask
        if (fogIO.current) await fogIO.current.load(fog_mask)
        else pendingFogRef.current = fog_mask
      }
      if (scene.bg_color) bgColorRef.current = scene.bg_color
    } finally {
      isSwitching.current = false
    }
  }, [save, groundIO, objectsIO, fogIO, tableId, supabase])

  const createScene = useCallback(async () => {
    const maxOrder = scenes.reduce((m, s) => Math.max(m, s.sort_order), -1)
    const { data: newScene, error } = await supabase
      .from('scene')
      .insert({ table_id: tableId, name: `Scene ${scenes.length + 1}`, sort_order: maxOrder + 1 })
      .select('id, name, sort_order')
      .single()
    if (error || !newScene) { console.error('createScene:', error); return }
    setScenes(prev => [...prev, newScene])
    await switchScene(newScene.id)
  }, [scenes, tableId, supabase, switchScene])

  const deleteScene = useCallback(async (sceneId: string) => {
    if (scenes.length <= 1) return
    const remaining = scenes.filter(s => s.id !== sceneId)
    if (sceneId === sceneIdRef.current && remaining.length > 0) {
      await switchScene(remaining[0].id)
    }
    await supabase.from('scene').delete().eq('id', sceneId)
    setScenes(prev => prev.filter(s => s.id !== sceneId))
  }, [scenes, supabase, switchScene])

  const renameScene = useCallback(async (sceneId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await supabase.from('scene').update({ name: trimmed }).eq('id', sceneId)
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, name: trimmed } : s))
  }, [supabase])

  const setBgColor    = useCallback((c: string)          => { bgColorRef.current = c }, [])
  const setSceneState = useCallback((s: SceneState)      => { sceneStateRef.current = s }, [])
  const setMapImages  = useCallback((imgs: PlacedImage[]) => { mapImagesRef.current = imgs }, [])

  const updateScreenDims = useCallback(async (w: number, h: number) => {
    await supabase.from('table_config').update({ screen_w_in: w, screen_h_in: h }).eq('id', tableId)
    setScreenW(w)
    setScreenH(h)
  }, [supabase, tableId])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, DEBOUNCE_MS)
  }, [save])

  const scheduleStateSave = useCallback(() => {
    if (stateSaveTimer.current) clearTimeout(stateSaveTimer.current)
    stateSaveTimer.current = setTimeout(saveStateOnly, DEBOUNCE_MS)
  }, [saveStateOnly])

  return {
    save, scheduleSave, scheduleStateSave, sceneIdRef, setBgColor, setSceneState, setMapImages,
    loadedSceneState, sceneVersion, loadedMapImages, screenW, screenH, updateScreenDims,
    scenes, activeSceneId, switchScene, createScene, deleteScene, renameScene,
  }
}
