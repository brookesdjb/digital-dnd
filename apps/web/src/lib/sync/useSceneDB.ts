import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { ObjectsIO } from '@/components/scene/ObjectPainter'

const DEBOUNCE_MS = 500

export function useSceneDB(
  tableId: string,
  groundIO: React.RefObject<GroundIO | undefined>,
  objectsIO: React.RefObject<ObjectsIO | undefined>,
) {
  const sceneIdRef = useRef<string | null>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase   = createClient()

  // Load active scene on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Fetch table config and its active scene
      const { data: table } = await supabase
        .from('table_config')
        .select('id, active_scene_id, scene(id, terrain, objects)')
        .eq('id', tableId)
        .single()

      if (cancelled || !table) return

      let scene = (table.scene as unknown as { id: string; terrain: unknown; objects: unknown }[] | null)?.[0] ?? null

      // Create a default scene if none exists
      if (!scene) {
        const { data: newScene } = await supabase
          .from('scene')
          .insert({ table_id: tableId, name: 'Scene 1' })
          .select('id')
          .single()

        if (!newScene || cancelled) return

        await supabase
          .from('table_config')
          .update({ active_scene_id: newScene.id })
          .eq('id', tableId)

        sceneIdRef.current = newScene.id
        return
      }

      sceneIdRef.current = scene.id

      const terrain = scene.terrain as { layers?: string[] } | null
      const objects = scene.objects as unknown[] | null

      if (terrain?.layers && groundIO.current) {
        await groundIO.current.load(terrain.layers)
      }
      if (objects && objectsIO.current) {
        objectsIO.current.load(objects as Parameters<ObjectsIO['load']>[0])
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  const save = useCallback(async () => {
    const sceneId = sceneIdRef.current
    if (!sceneId) return
    const layers  = await groundIO.current?.save()
    const objects = objectsIO.current?.save() ?? []
    await supabase
      .from('scene')
      .update({
        terrain: { layers: layers ?? [] },
        objects,
      })
      .eq('id', sceneId)
  }, [groundIO, objectsIO, supabase])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, DEBOUNCE_MS)
  }, [save])

  return { save, scheduleSave, sceneIdRef }
}
