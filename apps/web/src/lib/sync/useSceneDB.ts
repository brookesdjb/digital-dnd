import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'
import type { FogIO } from '@/components/scene/FogLayer'

const DEBOUNCE_MS = 500

export function useSceneDB(
  tableId: string,
  groundIO: React.RefObject<GroundIO | undefined>,
  objectsIO: React.RefObject<ObjectsIO | undefined>,
  fogIO: React.RefObject<FogIO | undefined>,
) {
  const sceneIdRef  = useRef<string | null>(null)
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bgColorRef  = useRef<string>('#6a8fa8')
  const [screenW, setScreenW] = useState(47.9)
  const [screenH, setScreenH] = useState(27.0)
  const supabase    = createClient()

  // Load active scene on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Two separate queries to avoid the ambiguous FK between table_config and scene.
      // (scene.table_id → table_config.id AND table_config.active_scene_id → scene.id)
      const { data: table, error: tableError } = await supabase
        .from('table_config')
        .select('id, active_scene_id, screen_w_in, screen_h_in')
        .eq('id', tableId)
        .single()

      if (tableError) console.error('useSceneDB: table_config fetch', tableError)
      if (cancelled || !table) return

      setScreenW(Number(table.screen_w_in))
      setScreenH(Number(table.screen_h_in))

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
          .insert({ table_id: tableId, name: 'Scene 1' })
          .select('id')
          .single()

        if (insertError) {
          console.error('useSceneDB: scene insert', insertError)
          return
        }
        if (!newScene || cancelled) return

        const { error: updateError } = await supabase
          .from('table_config')
          .update({ active_scene_id: newScene.id })
          .eq('id', tableId)
        if (updateError) console.error('useSceneDB: active_scene_id update', updateError)

        sceneIdRef.current = newScene.id
        return
      }

      sceneIdRef.current = scene.id
      if (scene.bg_color) bgColorRef.current = scene.bg_color

      const terrain = scene.terrain as { layers?: string[] } | null
      const objects = scene.objects as unknown[] | null

      if (terrain?.layers && groundIO.current) {
        await groundIO.current.load(terrain.layers)
      }
      if (objects && objectsIO.current) {
        objectsIO.current.load(objects as Parameters<ObjectsIO['load']>[0])
      }
      if (scene.fog_mask && fogIO.current) {
        await fogIO.current.load(scene.fog_mask)
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  const save = useCallback(async () => {
    const sceneId = sceneIdRef.current
    if (!sceneId) return
    const layers   = await groundIO.current?.save()
    const objects  = objectsIO.current?.save() ?? []
    const fog_mask = fogIO.current ? await fogIO.current.save() : null
    await supabase
      .from('scene')
      .update({
        terrain:  { layers: layers ?? [] },
        objects,
        bg_color: bgColorRef.current,
        fog_mask,
      })
      .eq('id', sceneId)
  }, [groundIO, objectsIO, fogIO, supabase])

  const setBgColor = useCallback((c: string) => { bgColorRef.current = c }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, DEBOUNCE_MS)
  }, [save])

  return { save, scheduleSave, sceneIdRef, setBgColor, screenW, screenH }
}
