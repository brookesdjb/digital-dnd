export type ShadowType = 'tree' | 'dead' | 'bush' | 'cover'

export interface SceneState {
  showGrid:          boolean
  rainIntensity:     number
  bgColor:           string
  hemSkyColor:       string
  hemGroundColor:    string
  hemIntensity:      number
  sunColor:          string
  sunIntensity:      number
  sunAzimuth:        number
  sunElevation:      number
  fogEnabled:        boolean
  fogColor:          string
  fogDensity:        number
  shadowMode:        string
  shadowRadius:      number
  aoRadius:          number
  aoIntensity:       number
  blobSize:          number
  blobOpacity:       number
  windSpeed:         number
  windStrength:      number
  fowColor:          string
  fowDisplayOpacity: number
  gridLineWidth:     number
  embersIntensity?:    number
  dustIntensity?:      number
  snowIntensity?:      number
  mistIntensity?:      number
  firefliesIntensity?: number
  ashIntensity?:       number
  lightningIntensity?: number
}

export type MapRotation = 0 | 90 | 180 | 270

export type WeatherType = 'none' | 'rain'

export interface PlacedImage {
  id: string
  assetId: string
  storageKey: string  // path in Supabase Storage map-assets bucket
  x: number          // world X (inches from center)
  z: number          // world Z
  widthIn: number    // width in world units (inches)
  heightIn: number   // height in world units
  rotation: number   // Y rotation in degrees
  edgeFade: number   // 0.0–0.3 fraction of each edge that fades to transparent
}

export interface TerrainState {
  textures: string[]
  layers: string[]       // base64 PNG masks, one per texture
  bakedGround?: string   // base64 JPEG — composited flat texture, used by display route
  sceneState?: SceneState // lighting, shadows, weather — persisted alongside terrain
  mapImages?: PlacedImage[] // uploaded map image overlays per scene
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
