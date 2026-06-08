import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GroundIO } from '@/components/scene/Ground'
import type { PlacedObject, WeatherType } from '@dnd-table/types'

export function useSceneSync(
  tableId: string,
  groundIO: React.RefObject<GroundIO | undefined>,
) {
  const supabase = createClient()
  const [objects,  setObjects]  = useState<PlacedObject[]>([])
  const [screenW,  setScreenW]  = useState(48.5)
  const [screenH,  setScreenH]  = useState(27.3)
  const [bgColor,  setBgColor]  = useState('#6a8fa8')
  const [weather,  setWeather]  = useState<WeatherType>('none')
  // Store pending terrain in case a Realtime message arrives before groundIO mounts.
  const pendingTerrain = useRef<string[] | null>(null)

  // Initial DB load
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: table } = await supabase
        .from('table_config')
        .select('screen_w_in, screen_h_in, active_scene_id, scene(id, terrain, objects, bg_color, weather)')
        .eq('id', tableId)
        .single()

      if (cancelled || !table) return

      setScreenW(Number(table.screen_w_in))
      setScreenH(Number(table.screen_h_in))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scene = (table.scene as any[])?.[0]
      if (!scene) return

      const terrain = scene.terrain as { layers?: string[] } | null
      const objs    = scene.objects as PlacedObject[] | null

      if (terrain?.layers) {
        if (groundIO.current) {
          await groundIO.current.load(terrain.layers)
        } else {
          pendingTerrain.current = terrain.layers
        }
      }
      if (objs) setObjects(objs)
      if (scene.bg_color) setBgColor(scene.bg_color)
      if (scene.weather)  setWeather(scene.weather as WeatherType)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  // Apply any terrain that arrived before groundIO was ready (runs every render, cheap check)
  useEffect(() => {
    if (!pendingTerrain.current || !groundIO.current) return
    const layers = pendingTerrain.current
    pendingTerrain.current = null
    groundIO.current.load(layers)
  })

  // Realtime subscription
  useEffect(() => {
    const ch = supabase.channel(`table:${tableId}`)
    ch
      .on('broadcast', { event: 'TERRAIN_UPDATED' }, async ({ payload }) => {
        const layers = (payload as { terrain: { layers: string[] } }).terrain.layers
        if (groundIO.current) {
          await groundIO.current.load(layers)
        } else {
          pendingTerrain.current = layers
        }
      })
      .on('broadcast', { event: 'OBJECTS_UPDATED' }, ({ payload }) => {
        setObjects((payload as { objects: PlacedObject[] }).objects)
      })
      .subscribe()

    return () => void supabase.removeChannel(ch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  return { objects, screenW, screenH, bgColor, weather }
}
