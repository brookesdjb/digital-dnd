'use client'

import { useState, useEffect } from 'react'
import { OBJECT_CATALOG } from '@/components/scene/ObjectPainter'
import { ROAD_TEXTURE_LABELS, DEFAULT_BASE_TEXTURE } from '@/components/scene/Ground'
import { SCREEN_SIZE_LABELS } from '@/components/scene/BattleGrid'

export type CockpitTool = 'select' | 'fog' | 'object' | 'road' | 'image'

export interface CockpitFog {
  mode: 'hide' | 'reveal' | 'erase'
  tool: 'brush' | 'rect'
  brushRadius: number
  playerOpacity: number
  dmOpacity: number
  color: string
}

export interface CockpitObject {
  model: string   // OBJECT_CATALOG label
  scale: number
  brush: number
  density: number
  randomY: boolean
  snapToGrid: boolean
}

export interface CockpitRoad {
  texture: string  // ROAD_TEXTURE_LABELS entry
  brush: number
  opacity: number
  erase: boolean
  baseTexture: string  // BASE_TEXTURE_LABELS entry
}

export interface CockpitScatter {
  seed: number
  enabled: boolean
  densityScale: number
  eraseMode: boolean
  eraseBrushSize: number
  erasedIndices: number[]
}

export interface CockpitLight {
  preset: string
  hemSkyColor: string
  hemGroundColor: string
  hemIntensity: number
  sunColor: string
  sunIntensity: number
  azimuth: number
  elevation: number
  fogEnabled: boolean
  fogColor: string
  fogDensity: number
  bgColor: string
}

export interface CockpitWeather {
  rain:      number
  embers:    number
  dust:      number
  snow:      number
  mist:      number
  fireflies: number
  ash:       number
  lightning: number
}
export interface CockpitGrass   { windSpeed: number; windStrength: number }

export interface CockpitView {
  grid: boolean
  border: boolean
  fov: number
  screenSize: string
  gridLineWidth: number
}

export interface CockpitShadows {
  mode: 'Blob' | 'Soft Shadows' | 'SSAO' | 'Soft Shadows + SSAO'
  radius: number
  aoRadius: number
  aoIntensity: number
  blobSize: number
  blobOpacity: number
}

export interface CockpitState {
  tool:    CockpitTool
  paused:  boolean
  fog:     CockpitFog
  object:  CockpitObject
  road:    CockpitRoad
  light:   CockpitLight
  weather: CockpitWeather
  grass:   CockpitGrass
  view:    CockpitView
  shadows: CockpitShadows
  scatter: CockpitScatter
  setTool:    (t: CockpitTool) => void
  setPaused:  (p: boolean) => void
  setFog:     (p: Partial<CockpitFog>) => void
  setObject:  (p: Partial<CockpitObject>) => void
  setRoad:    (p: Partial<CockpitRoad>) => void
  setLight:   (p: Partial<CockpitLight>) => void
  setWeather: (p: Partial<CockpitWeather>) => void
  setGrass:   (p: Partial<CockpitGrass>) => void
  setView:    (p: Partial<CockpitView>) => void
  setShadows: (p: Partial<CockpitShadows>) => void
  setScatter: (p: Partial<CockpitScatter>) => void
}

export interface LightPreset {
  id: string
  name: string
  skyGrad: [string, string]  // for thumbnail gradient
  hemSkyColor: string
  hemGroundColor: string
  hemIntensity: number
  sunColor: string
  sunIntensity: number
  azimuth: number
  elevation: number
  fogEnabled: boolean
  fogColor: string
  fogDensity: number
  bgColor: string
}

export const LIGHT_PRESETS: LightPreset[] = [
  {
    id: 'dawn', name: 'Dawn', skyGrad: ['#e08060', '#c86828'],
    bgColor: '#c8622a', hemSkyColor: '#e09060', hemGroundColor: '#4a2a10', hemIntensity: 0.9,
    sunColor: '#ffcc80', sunIntensity: 0.9, azimuth: 95, elevation: 15,
    fogEnabled: true, fogColor: '#c8905a', fogDensity: 0.008,
  },
  {
    id: 'day', name: 'Daylight', skyGrad: ['#87ceeb', '#6a8fa8'],
    bgColor: '#6a8fa8', hemSkyColor: '#87ceeb', hemGroundColor: '#3d5a1e', hemIntensity: 1.5,
    sunColor: '#fff4e0', sunIntensity: 1.8, azimuth: 135, elevation: 55,
    fogEnabled: false, fogColor: '#adc4d4', fogDensity: 0.012,
  },
  {
    id: 'dusk', name: 'Dusk', skyGrad: ['#8a5080', '#4a2040'],
    bgColor: '#5a3060', hemSkyColor: '#8a5080', hemGroundColor: '#2a1a30', hemIntensity: 0.8,
    sunColor: '#ff7840', sunIntensity: 0.7, azimuth: 260, elevation: 10,
    fogEnabled: true, fogColor: '#6a4068', fogDensity: 0.018,
  },
  {
    id: 'night', name: 'Night', skyGrad: ['#1d2740', '#0a0f1e'],
    bgColor: '#0a0f1e', hemSkyColor: '#2a3d6a', hemGroundColor: '#0c0e1a', hemIntensity: 0.9,
    sunColor: '#a0b8e0', sunIntensity: 0.5, azimuth: 200, elevation: 35,
    fogEnabled: true, fogColor: '#0d1020', fogDensity: 0.018,
  },
  {
    id: 'cave', name: 'Cavern', skyGrad: ['#18140c', '#060504'],
    bgColor: '#060504', hemSkyColor: '#2e1e08', hemGroundColor: '#120c04', hemIntensity: 0.7,
    sunColor: '#d07828', sunIntensity: 0.5, azimuth: 90, elevation: 70,
    fogEnabled: true, fogColor: '#080604', fogDensity: 0.035,
  },
]

const DAY = LIGHT_PRESETS[1]

export interface CockpitOverrides {
  light?:   Partial<CockpitLight>
  weather?: Partial<CockpitWeather>
  shadows?: Partial<CockpitShadows>
  grass?:   Partial<CockpitGrass>
}

function patch<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
  return (upd: Partial<T>) => setter(s => ({ ...s, ...upd }))
}

export function useCockpit(overrides?: CockpitOverrides): CockpitState {
  const [tool,    setTool]    = useState<CockpitTool>('select')
  const [paused,  setPaused]  = useState(false)

  const [fog, _setFog] = useState<CockpitFog>({
    mode: 'hide', tool: 'brush', brushRadius: 4,
    playerOpacity: 0.92, dmOpacity: 0.35, color: '#0a0a1a',
  })
  const [object, _setObject] = useState<CockpitObject>({
    model: OBJECT_CATALOG[0].label, scale: OBJECT_CATALOG[0].defaultScale,
    brush: 1.5, density: 1, randomY: true, snapToGrid: false,
  })
  const [road, _setRoad] = useState<CockpitRoad>({
    texture: ROAD_TEXTURE_LABELS[0], brush: 3, opacity: 1.0, erase: false,
    baseTexture: DEFAULT_BASE_TEXTURE,
  })
  const [scatter, _setScatter] = useState<CockpitScatter>({
    seed: 0x5CA77E8D, enabled: true,
    densityScale: 1.0, eraseMode: false, eraseBrushSize: 2, erasedIndices: [],
  })
  const [light, _setLight] = useState<CockpitLight>({ ...DAY, preset: DAY.id, ...overrides?.light })
  const [weather, _setWeather] = useState<CockpitWeather>({
    rain: 1.0, embers: 0, dust: 0, snow: 0, mist: 0, fireflies: 0, ash: 0, lightning: 0,
    ...overrides?.weather,
  })
  const [grass,   _setGrass]   = useState<CockpitGrass>({ windSpeed: 1.2, windStrength: 1.0, ...overrides?.grass })
  const [view, _setView] = useState<CockpitView>({
    grid: false, border: true, fov: 45, gridLineWidth: 1.0,
    screenSize: SCREEN_SIZE_LABELS[0],
  })
  const [shadows, _setShadows] = useState<CockpitShadows>({
    mode: 'Blob', radius: 8, aoRadius: 1.5, aoIntensity: 5.0, blobSize: 1.0, blobOpacity: 1.0,
    ...overrides?.shadows,
  })

  // Auto-snap scale when selected model changes
  useEffect(() => {
    const entry = OBJECT_CATALOG.find(e => e.label === object.model)
    if (entry) _setObject(s => ({ ...s, scale: entry.defaultScale }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.model])

  return {
    tool, paused, fog, object, road, light, weather, grass, view, shadows, scatter,
    setTool, setPaused,
    setFog:     patch(_setFog),
    setObject:  patch(_setObject),
    setRoad:    patch(_setRoad),
    setLight:   patch(_setLight),
    setWeather: patch(_setWeather),
    setGrass:   patch(_setGrass),
    setView:    patch(_setView),
    setShadows: patch(_setShadows),
    setScatter: patch(_setScatter),
  }
}
