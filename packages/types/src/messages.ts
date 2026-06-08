import type { PlacedObject, Scene, TerrainState } from './scene'

// Control → Supabase Realtime channel (broadcast)
export type ControlMessage =
  | { type: 'SCENE_ACTIVATE';  payload: { sceneId: string } }
  | { type: 'SCENE_PATCH';     payload: { sceneId: string; patch: Partial<Scene> } }
  | { type: 'TERRAIN_UPDATE';  payload: { sceneId: string; terrain: TerrainState } }
  | { type: 'FOG_UPDATE';      payload: { sceneId: string; fogMask: string } }
  | { type: 'OBJECTS_UPDATE';  payload: { sceneId: string; objects: PlacedObject[] } }
  | { type: 'PAUSE_TOGGLE';    payload: { isPaused: boolean } }
  | { type: 'FORCE_FULL_SYNC'; payload: { scene: Scene } }

// Server → all channel subscribers (Supabase broadcasts to all clients)
export type DisplayMessage =
  | { type: 'STATE_SYNC';      payload: { scene: Scene; isPaused: boolean } }
  | { type: 'SCENE_ACTIVATED'; payload: { sceneId: string } }
  | { type: 'SCENE_PATCHED';   payload: { sceneId: string; patch: Partial<Scene> } }
  | { type: 'TERRAIN_UPDATED'; payload: { sceneId: string; terrain: TerrainState } }
  | { type: 'FOG_UPDATED';     payload: { sceneId: string; fogMask: string } }
  | { type: 'OBJECTS_UPDATED'; payload: { sceneId: string; objects: PlacedObject[] } }
  | { type: 'PAUSE_CHANGED';   payload: { isPaused: boolean } }
