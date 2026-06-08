export type ShadowType = 'tree' | 'dead' | 'bush' | 'cover'

export type MapRotation = 0 | 90 | 180 | 270

export type WeatherType = 'none' | 'rain'

export interface TerrainState {
  textures: string[]
  layers: string[]   // base64 PNG masks, one per texture
}

export interface PlacedObject {
  id: string
  path: string
  x: number
  y: number
  z: number
  ry: number
  scale: number
  shadowType: ShadowType
}

export interface GridConfig {
  enabled: boolean
  type: 'square' | 'hex'
  color: string
  opacity: number
}

export interface Scene {
  id: string
  tableId: string
  name: string
  // Optional flat map image overlaid as the ground texture
  mapAssetUrl?: string
  mapScale: number
  mapOffsetX: number
  mapOffsetY: number
  mapRotation: MapRotation
  // Terrain paint state (painted texture masks + placed 3D objects)
  terrain: TerrainState | null
  objects: PlacedObject[]
  // Fog of War — base64 PNG mask, same encoding as terrain masks
  fogMask: string | null
  fogOpacity: number
  grid: GridConfig
  weather: WeatherType
  bgColor: string
}

export interface TableConfig {
  id: string
  name: string
  secretKey: string
  screenWidthIn: number
  screenHeightIn: number
  isPaused: boolean
  pauseImageUrl: string | null
  activeSceneId: string | null
}
