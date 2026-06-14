'use client'

import React, { useState, useRef } from 'react'
import { Slider, Toggle, Segmented, Btn, FieldRow, ColorDots, TextureSwatch, LightPresets, Icons } from './primitives'
import type { CockpitState } from './useCockpit'
import { OBJECT_CATALOG } from '@/components/scene/ObjectPainter'
import { ROAD_TEXTURES, ROAD_TEXTURE_LABELS, BASE_TEXTURES, BASE_TEXTURE_LABELS } from '@/components/scene/Ground'
import { SCREEN_SIZE_LABELS } from '@/components/scene/BattleGrid'
import type { SceneRow } from '@/lib/sync/useSceneDB'
import type { AssetRecord } from '@/lib/useAssets'
import type { PlacedImage } from '@dnd-table/types'

// ── action callbacks passed down from ControlScene ───────────────────────────

export type { AssetRecord }

export interface PanelActions {
  scenes:        SceneRow[]
  activeSceneId: string | null
  savedFlash:    boolean
  onSave:        () => void
  onSwitchScene: (id: string) => void
  onCreateScene: () => void
  onDeleteScene: (id: string) => void
  onRenameScene: (id: string, name: string) => void
  onFogCoverAll:      () => void
  onFogClearAll:      () => void
  onObjectsUndo:      () => void
  onObjectsClearAll:  () => void
  onRecenter:         () => void
  onForceSync:        () => void
  // Display calibration
  dbScreenW:         number
  dbScreenH:         number
  onSetScreenDims:   (w: number, h: number) => void
  // Image library
  assets:            AssetRecord[]
  assetsLoading:     boolean
  mapImages:         PlacedImage[]
  selectedImageId:   string | null
  onUploadAsset:     (file: File) => Promise<void>
  onPlaceImage:      (asset: AssetRecord) => void
  onSelectImage:     (id: string | null) => void
  onUpdateImage:     (id: string, patch: Partial<PlacedImage>) => void
  onRemoveImage:     (id: string) => void
}

// ── model catalog grouped by category ────────────────────────────────────────

const MODEL_CATEGORIES = {
  Trees: OBJECT_CATALOG.filter(e =>
    e.shadowType === 'tree' || e.shadowType === 'dead'
  ),
  Foliage: OBJECT_CATALOG.filter(e =>
    (e.shadowType === 'bush' || e.shadowType === 'cover') && !e.path.includes('/rocks/')
  ),
  Rocks: OBJECT_CATALOG.filter(e => e.path.includes('/rocks/')),
}
const MODEL_CATEGORY_KEYS = Object.keys(MODEL_CATEGORIES) as Array<keyof typeof MODEL_CATEGORIES>

const MODEL_SWATCH: Record<string, string> = {
  tree: '#3e6b4a', dead: '#6b5a48', bush: '#4f7a3e', cover: '#6f9a4e',
}

// Texture swatch colours (approximation from filenames)
const TEX_SWATCHES: Record<string, [string, string]> = {
  'Natural Grass':    ['#5a7a3c', '#3d5828'],
  'Water':            ['#2f7d96', '#1f4a5c'],
  'Ground Stones 02': ['#8f8a7f', '#69655c'],
  'Ground Stones 01': ['#807c73', '#5d5a52'],
  'Ground 02':        ['#7c5a3c', '#5e4329'],
  'Ground 03':        ['#6f6540', '#50491e'],
  'Ground 06':        ['#8a7a5a', '#6a5c3a'],
  'Ground Tiles 04':  ['#9a958c', '#74706a'],
  'Ground Tiles 12':  ['#88837a', '#63605a'],
  'Ground Tiles 22':  ['#a09890', '#7a726a'],
  'Desert Ground':    ['#cdb380', '#b6975f'],
  'Moss Ground':      ['#5f7042', '#45532e'],
  'Rocks & Water':    ['#3f6b78', '#2a4954'],
  'Wood Planks':      ['#8a6038', '#6a4926'],
}

const FOG_COLORS = ['#0a0a1a', '#1a1320', '#0d1a16', '#201a10', '#14141a']
const SUN_COLORS = ['#fff4e0', '#ffd9a0', '#ff9e6b', '#cfe0ff', '#caa15a']

const SHADOW_MODES = ['Blob', 'Soft Shadows', 'SSAO', 'Soft Shadows + SSAO']

// ── FogControls ───────────────────────────────────────────────────────────────

export function FogControls({ c, actions }: { c: CockpitState; actions: PanelActions }) {
  const { fog, setFog } = c
  return (
    <div className="ck-stack">
      <Segmented full value={fog.mode} onChange={v => setFog({ mode: v as typeof fog.mode })}
        options={[
          { value: 'hide',   label: 'Conceal', icon: Icons.fog  },
          { value: 'reveal', label: 'Reveal',  icon: Icons.eye  },
          { value: 'erase',  label: 'Erase',   icon: Icons.erase },
        ]} />
      <Segmented value={fog.tool} onChange={v => setFog({ tool: v as typeof fog.tool })}
        options={[
          { value: 'brush', label: 'Brush' },
          { value: 'rect',  label: 'Rect'  },
        ]} />
      <Slider label="Brush size" value={fog.brushRadius} min={0.5} max={20} step={0.5}
        onChange={v => setFog({ brushRadius: v })} fmt={v => v.toFixed(1)} />
      <div className="ck-split">
        <Slider label="Player" value={fog.playerOpacity} min={0} max={1} step={0.01}
          onChange={v => setFog({ playerOpacity: v })} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="DM tint" value={fog.dmOpacity} min={0} max={1} step={0.01}
          onChange={v => setFog({ dmOpacity: v })} fmt={v => Math.round(v * 100) + '%'} />
      </div>
      <FieldRow label="Fog color">
        <ColorDots value={fog.color} onChange={v => setFog({ color: v })} colors={FOG_COLORS} />
      </FieldRow>
      <div className="ck-btn-row">
        <Btn variant="solid" full icon={Icons.fog} onClick={actions.onFogCoverAll}>Cover all</Btn>
        <Btn variant="ghost" full icon={Icons.eye} onClick={actions.onFogClearAll}>Clear fog</Btn>
      </div>
    </div>
  )
}

// ── ObjectControls ─────────────────────────────────────────────────────────────

export function ObjectControls({ c, actions }: { c: CockpitState; actions: PanelActions }) {
  const { object, setObject, scatter, setScatter } = c
  const [cat, setCat] = useState<keyof typeof MODEL_CATEGORIES>('Trees')
  const models = MODEL_CATEGORIES[cat]

  const rerollSeed = () => setScatter({ seed: (Math.random() * 0x100000000) >>> 0, erasedIndices: [] })

  return (
    <div className="ck-stack">
      <span className="ck-sub-head">Seeded vegetation</span>
      <Toggle label="Enabled" sub="Auto-scatter trees, bushes, grass"
        checked={scatter.enabled} onChange={v => setScatter({ enabled: v })} />
      {scatter.enabled && (
        <>
          <Slider label="Density" value={scatter.densityScale} min={0.1} max={3} step={0.1}
            onChange={v => setScatter({ densityScale: v })} fmt={v => v.toFixed(1) + '×'} />
          <div className="ck-btn-row">
            <Btn variant="ghost" full icon={Icons.sync} onClick={rerollSeed}>Re-roll seed</Btn>
            <Btn variant={scatter.eraseMode ? 'solid' : 'ghost'} full icon={Icons.erase}
              onClick={() => setScatter({ eraseMode: !scatter.eraseMode })}>
              {scatter.eraseMode ? 'Erasing…' : 'Erase'}
            </Btn>
          </div>
          {scatter.eraseMode && (
            <Slider label="Brush size" value={scatter.eraseBrushSize} min={0.5} max={10} step={0.5}
              onChange={v => setScatter({ eraseBrushSize: v })} fmt={v => v.toFixed(1)} />
          )}
          {scatter.erasedIndices.length > 0 && (
            <Btn variant="ghost" full icon={Icons.sync}
              onClick={() => setScatter({ erasedIndices: [] })}>
              Restore erased ({scatter.erasedIndices.length})
            </Btn>
          )}
        </>
      )}
      {/* Category tabs */}
      <div className="ck-mp">
        <div className="ck-mp-tabs">
          {MODEL_CATEGORY_KEYS.map(k => (
            <button key={k} type="button"
              className={`ck-mp-tab${cat === k ? ' on' : ''}`}
              onClick={() => setCat(k)}>
              {k}
              <span className="ck-mp-count">{MODEL_CATEGORIES[k].length}</span>
            </button>
          ))}
        </div>
        <div className="ck-mp-grid">
          {models.map(m => (
            <button key={m.label} type="button"
              className={`ck-chip${object.model === m.label ? ' on' : ''}`}
              onClick={() => setObject({ model: m.label, scale: m.defaultScale })}>
              <span className="ck-chip-swatch"
                style={{ background: MODEL_SWATCH[m.shadowType] ?? '#6f9a4e' }} />
              <span className="ck-chip-name">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ck-split">
        <Slider label="Scale" value={object.scale} min={0.05} max={10} step={0.05}
          onChange={v => setObject({ scale: v })} fmt={v => v.toFixed(2)} />
        <Slider label="Brush" value={object.brush} min={0.25} max={15} step={0.25}
          onChange={v => setObject({ brush: v })} fmt={v => v.toFixed(1)} />
      </div>
      <Slider label="Density" value={object.density} min={1} max={20} step={1}
        onChange={v => setObject({ density: v })} fmt={v => v + '×'} />
      <Toggle label="Random rotation" sub="Vary Y angle per placement"
        checked={object.randomY} onChange={v => setObject({ randomY: v })} />
      <Toggle label="Snap to grid" sub="Round position to 1 unit"
        checked={object.snapToGrid} onChange={v => setObject({ snapToGrid: v })} />
      <div className="ck-btn-row">
        <Btn variant="ghost" full icon={Icons.undo} onClick={actions.onObjectsUndo}>Undo last</Btn>
        <Btn variant="danger" full icon={Icons.trash} onClick={actions.onObjectsClearAll}>Clear all</Btn>
      </div>
    </div>
  )
}

// ── RoadControls ──────────────────────────────────────────────────────────────

export function RoadControls({ c }: { c: CockpitState }) {
  const { road, setRoad } = c
  return (
    <div className="ck-stack">
      <span className="ck-sub-head">Base layer</span>
      <div className="ck-tex-grid">
        {BASE_TEXTURE_LABELS.map(label => {
          const sw = TEX_SWATCHES[label] ?? ['#807c73', '#5d5a52']
          return (
            <TextureSwatch key={label} name={label} c1={sw[0]} c2={sw[1]}
              active={road.baseTexture === label}
              onClick={() => setRoad({ baseTexture: label })} />
          )
        })}
      </div>
      <span className="ck-tex-name">{road.baseTexture}</span>
      <span className="ck-sub-head">Overlay paint</span>
      <div className="ck-tex-grid">
        {ROAD_TEXTURE_LABELS.map(label => {
          const sw = TEX_SWATCHES[label] ?? ['#807c73', '#5d5a52']
          return (
            <TextureSwatch key={label} name={label} c1={sw[0]} c2={sw[1]}
              active={road.texture === label}
              onClick={() => setRoad({ texture: label })} />
          )
        })}
      </div>
      <span className="ck-tex-name">{road.texture}</span>
      <div className="ck-split">
        <Slider label="Brush size" value={road.brush} min={0.5} max={12} step={0.25}
          onChange={v => setRoad({ brush: v })} fmt={v => v.toFixed(1)} />
        <Slider label="Opacity" value={road.opacity} min={0.1} max={1} step={0.05}
          onChange={v => setRoad({ opacity: v })} fmt={v => Math.round(v * 100) + '%'} />
      </div>
      <Toggle label="Erase mode" sub="Wipe texture under brush"
        checked={road.erase} onChange={v => setRoad({ erase: v })} />
    </div>
  )
}

// ── LightingControls ──────────────────────────────────────────────────────────

export function LightingControls({ c }: { c: CockpitState }) {
  const { light, setLight } = c
  return (
    <div className="ck-stack">
      <LightPresets light={light} setLight={setLight} />
      <span className="ck-sub-head">Sun</span>
      <FieldRow label="Color">
        <ColorDots value={light.sunColor} onChange={v => setLight({ sunColor: v, preset: 'custom' })} colors={SUN_COLORS} />
      </FieldRow>
      <Slider label="Intensity" value={light.sunIntensity} min={0} max={6} step={0.1}
        onChange={v => setLight({ sunIntensity: v, preset: 'custom' })} fmt={v => v.toFixed(1)} />
      <div className="ck-split">
        <Slider label="Azimuth" value={light.azimuth} min={0} max={360} step={1}
          onChange={v => setLight({ azimuth: v, preset: 'custom' })} fmt={v => v + '°'} />
        <Slider label="Elevation" value={light.elevation} min={5} max={90} step={1}
          onChange={v => setLight({ elevation: v, preset: 'custom' })} fmt={v => v + '°'} />
      </div>
      <span className="ck-sub-head">Ambient</span>
      <Slider label="Intensity" value={light.hemIntensity} min={0} max={6} step={0.1}
        onChange={v => setLight({ hemIntensity: v, preset: 'custom' })} fmt={v => v.toFixed(1)} />
      <Toggle label="Atmospheric fog" checked={light.fogEnabled}
        onChange={v => setLight({ fogEnabled: v })} />
      {light.fogEnabled && (
        <Slider label="Fog density" value={light.fogDensity} min={0} max={0.06} step={0.001}
          onChange={v => setLight({ fogDensity: v })} fmt={v => v.toFixed(3)} />
      )}
    </div>
  )
}

// ── WeatherControls ───────────────────────────────────────────────────────────

export function WeatherControls({ c }: { c: CockpitState }) {
  const { weather, setWeather, grass, setGrass } = c
  return (
    <div className="ck-stack">
      <Slider label="Rain intensity" value={weather.rain} min={0} max={2} step={0.05}
        onChange={v => setWeather({ rain: v })} fmt={v => v.toFixed(2) + '×'} />
      <span className="ck-sub-head">Particles</span>
      <div className="ck-split">
        <Slider label="Embers"    value={weather.embers}    min={0} max={2} step={0.05}
          onChange={v => setWeather({ embers: v })}    fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Ash"       value={weather.ash}       min={0} max={2} step={0.05}
          onChange={v => setWeather({ ash: v })}       fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Fireflies" value={weather.fireflies} min={0} max={2} step={0.05}
          onChange={v => setWeather({ fireflies: v })} fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Snow"      value={weather.snow}      min={0} max={2} step={0.05}
          onChange={v => setWeather({ snow: v })}      fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Dust"      value={weather.dust}      min={0} max={2} step={0.05}
          onChange={v => setWeather({ dust: v })}      fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Mist"      value={weather.mist}      min={0} max={2} step={0.05}
          onChange={v => setWeather({ mist: v })}      fmt={v => v.toFixed(2) + '×'} />
        <Slider label="Lightning" value={weather.lightning} min={0} max={2} step={0.05}
          onChange={v => setWeather({ lightning: v })} fmt={v => v.toFixed(2) + '×'} />
      </div>
      <span className="ck-sub-head">Vegetation wind</span>
      <div className="ck-split">
        <Slider label="Speed" value={grass.windSpeed} min={0} max={5} step={0.1}
          onChange={v => setGrass({ windSpeed: v })} fmt={v => v.toFixed(1)} />
        <Slider label="Strength" value={grass.windStrength} min={0} max={3} step={0.1}
          onChange={v => setGrass({ windStrength: v })} fmt={v => v.toFixed(1)} />
      </div>
    </div>
  )
}

// ── ViewControls ──────────────────────────────────────────────────────────────

export function ViewControls({ c, actions }: { c: CockpitState; actions: PanelActions }) {
  const { view, setView } = c
  const [calibW, setCalibW] = useState(String(Math.round(actions.dbScreenW * 10) / 10))
  const [calibH, setCalibH] = useState(String(Math.round(actions.dbScreenH * 10) / 10))

  return (
    <div className="ck-stack">
      <Toggle label="Battle grid" sub="Calibrated 1″ squares"
        checked={view.grid} onChange={v => setView({ grid: v })} />
      <Slider label="Grid line width" value={view.gridLineWidth} min={0.5} max={4} step={0.5}
        onChange={v => setView({ gridLineWidth: v })} fmt={v => v + 'px'} />
      <Toggle label="Screen border" sub="Outline display bounds"
        checked={view.border} onChange={v => setView({ border: v })} />
      <Slider label="Field of view" value={view.fov} min={16} max={60} step={1}
        onChange={v => setView({ fov: v })} fmt={v => v + '°'} />
      <div className="ck-field">
        <span className="ck-field-label">Preview size</span>
        <select className="ck-select" value={view.screenSize}
          onChange={e => setView({ screenSize: e.target.value })}
          style={{ width: 'auto' }}>
          {SCREEN_SIZE_LABELS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Btn variant="ghost" full icon={Icons.recenter} onClick={actions.onRecenter}>Re-center camera</Btn>
      <span className="ck-sub-head">Display calibration</span>
      <div className="ck-split">
        <div className="ck-field">
          <span className="ck-field-label">Width (in)</span>
          <input className="ck-input-sm" type="number" min="1" max="200" step="0.1"
            value={calibW} onChange={e => setCalibW(e.target.value)} />
        </div>
        <div className="ck-field">
          <span className="ck-field-label">Height (in)</span>
          <input className="ck-input-sm" type="number" min="1" max="200" step="0.1"
            value={calibH} onChange={e => setCalibH(e.target.value)} />
        </div>
      </div>
      <Btn variant="solid" full icon={Icons.recenter} onClick={() => {
        const w = parseFloat(calibW), h = parseFloat(calibH)
        if (w > 0 && h > 0) actions.onSetScreenDims(w, h)
      }}>Update display screen</Btn>
      <span className="ck-sub-head">Sync</span>
      <Btn variant="ghost" full icon={Icons.sync} onClick={actions.onForceSync}>Force display sync</Btn>
    </div>
  )
}

// ── ShadowControls ────────────────────────────────────────────────────────────

export function ShadowControls({ c }: { c: CockpitState }) {
  const { shadows, setShadows } = c
  const showBlob  = shadows.mode === 'Blob'
  const showSoft  = shadows.mode === 'Soft Shadows' || shadows.mode === 'Soft Shadows + SSAO'
  const showSSAO  = shadows.mode === 'SSAO' || shadows.mode === 'Soft Shadows + SSAO'
  return (
    <div className="ck-stack">
      <div className="ck-field">
        <span className="ck-field-label">Mode</span>
        <select className="ck-select" value={shadows.mode}
          onChange={e => setShadows({ mode: e.target.value as typeof shadows.mode })}
          style={{ width: 'auto' }}>
          {SHADOW_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {showBlob && <>
        <Slider label="Blob size" value={shadows.blobSize} min={0.1} max={3} step={0.05}
          onChange={v => setShadows({ blobSize: v })} fmt={v => v.toFixed(2)} />
        <Slider label="Blob opacity" value={shadows.blobOpacity} min={0} max={1} step={0.05}
          onChange={v => setShadows({ blobOpacity: v })} fmt={v => Math.round(v * 100) + '%'} />
      </>}
      {showSoft && (
        <Slider label="Shadow softness" value={shadows.radius} min={1} max={30} step={1}
          onChange={v => setShadows({ radius: v })} fmt={v => v + 'px'} />
      )}
      {showSSAO && <>
        <Slider label="AO radius" value={shadows.aoRadius} min={0.1} max={5} step={0.1}
          onChange={v => setShadows({ aoRadius: v })} fmt={v => v.toFixed(1)} />
        <Slider label="AO intensity" value={shadows.aoIntensity} min={0} max={20} step={0.5}
          onChange={v => setShadows({ aoIntensity: v })} fmt={v => v.toFixed(1)} />
      </>}
    </div>
  )
}

// ── ScenePanel ────────────────────────────────────────────────────────────────

const THUMB_GRADS = [
  ['#5f7a3e', '#3d5128'], ['#6b4a2e', '#3a2818'],
  ['#3f6b78', '#243f49'], ['#7a6a4a', '#473d28'], ['#4a4f6b', '#272a3d'],
]

export function ScenePanel({ actions }: { actions: PanelActions }) {
  const [editing, setEditing] = useState<string | null>(null)
  const { scenes, activeSceneId, onSwitchScene, onCreateScene, onDeleteScene, onRenameScene } = actions

  return (
    <div className="ck-scenes">
      {scenes.map((s, i) => {
        const grad = THUMB_GRADS[i % THUMB_GRADS.length]
        const isActive = s.id === activeSceneId
        return (
          <div key={s.id}
            className={`ck-scene${isActive ? ' on' : ''}`}
            onClick={() => { if (editing !== s.id) onSwitchScene(s.id) }}>
            <span className="ck-scene-thumb"
              style={{ background: `linear-gradient(150deg, ${grad[0]}, ${grad[1]})` }}>
              {isActive && <span className="ck-scene-live">LIVE</span>}
            </span>
            <div className="ck-scene-body">
              {editing === s.id ? (
                <input className="ck-scene-input" autoFocus defaultValue={s.name}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { onRenameScene(s.id, e.target.value || 'Scene'); setEditing(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
              ) : (
                <span className="ck-scene-name"
                  onDoubleClick={e => { e.stopPropagation(); setEditing(s.id) }}>
                  {s.name}
                </span>
              )}
              {editing !== s.id && (
                <div className="ck-scene-acts">
                  <button title="Delete" className="del"
                    onClick={e => { e.stopPropagation(); onDeleteScene(s.id) }}>
                    <Icons.trash s={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
      <button className="ck-scene-add" onClick={onCreateScene}>
        <Icons.plus s={18} />
        <span>New scene</span>
      </button>
    </div>
  )
}

// ── ImagesControls ────────────────────────────────────────────────────────────

export function ImagesControls({ actions }: { c: CockpitState; actions: PanelActions }) {
  const { assets, assetsLoading, mapImages, selectedImageId } = actions
  const fileRef = useRef<HTMLInputElement>(null)
  const selected = mapImages.find(img => img.id === selectedImageId) ?? null

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArr = Array.from(files)  // snapshot before input is cleared
    for (const file of fileArr) {
      await actions.onUploadAsset(file)
    }
    if (fileRef.current) fileRef.current.value = ''  // reset after upload so same file can be re-picked
  }

  return (
    <div className="ck-stack">
      {/* Asset Library */}
      <span className="ck-sub-head">Asset library</span>
      <input
        ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        multiple style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      <Btn variant="ghost" full icon={Icons.upload} onClick={() => fileRef.current?.click()}>
        {assetsLoading ? 'Uploading…' : 'Upload image'}
      </Btn>

      {assets.length > 0 && (
        <div className="ck-img-grid">
          {assets.map(asset => (
            <button
              key={asset.id}
              className="ck-img-thumb"
              title={asset.filename}
              onClick={() => actions.onPlaceImage(asset)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.filename} draggable={false} />
              <span className="ck-img-name">{asset.filename.replace(/\.[^.]+$/, '')}</span>
            </button>
          ))}
        </div>
      )}
      {assets.length === 0 && !assetsLoading && (
        <span className="ck-empty">No images uploaded yet</span>
      )}

      {/* Placed images list */}
      {mapImages.length > 0 && (
        <>
          <span className="ck-sub-head">Placed images</span>
          {mapImages.map(img => {
            const asset = assets.find(a => a.id === img.assetId)
            const label = asset?.filename.replace(/\.[^.]+$/, '') ?? 'Image'
            return (
              <div
                key={img.id}
                className={`ck-img-row${img.id === selectedImageId ? ' on' : ''}`}
                onClick={() => actions.onSelectImage(img.id === selectedImageId ? null : img.id)}
              >
                <span className="ck-img-row-name">{label}</span>
                <button
                  className="ck-img-row-del"
                  onClick={e => { e.stopPropagation(); actions.onRemoveImage(img.id) }}
                >
                  <Icons.trash s={14} />
                </button>
              </div>
            )
          })}
        </>
      )}

      {/* Selected image properties */}
      {selected && (
        <>
          <span className="ck-sub-head">Image settings</span>
          <div className="ck-split">
            <Slider label="Width (in)" value={selected.widthIn} min={1} max={120} step={0.5}
              onChange={v => actions.onUpdateImage(selected.id, { widthIn: v })}
              fmt={v => v.toFixed(1) + '"'} />
            <Slider label="Height (in)" value={selected.heightIn} min={1} max={120} step={0.5}
              onChange={v => actions.onUpdateImage(selected.id, { heightIn: v })}
              fmt={v => v.toFixed(1) + '"'} />
          </div>
          <Slider label="Rotation" value={selected.rotation} min={0} max={360} step={1}
            onChange={v => actions.onUpdateImage(selected.id, { rotation: v })}
            fmt={v => v + '°'} />
          <Slider label="Edge fade" value={selected.edgeFade} min={0} max={0.3} step={0.01}
            onChange={v => actions.onUpdateImage(selected.id, { edgeFade: v })}
            fmt={v => Math.round(v * 100) + '%'} />
          <Btn variant="danger" full icon={Icons.trash}
            onClick={() => actions.onRemoveImage(selected.id)}>
            Remove image
          </Btn>
        </>
      )}
    </div>
  )
}

// ── toolMeta — maps tool id → title + icon + panel component ─────────────────

export type ToolId = 'fog' | 'object' | 'road' | 'image'

interface ToolMeta {
  title: string
  icon: (p: { s?: number }) => React.ReactElement
  Panel: (props: { c: CockpitState; actions: PanelActions }) => React.ReactElement
}

export const TOOL_META: Record<ToolId, ToolMeta> = {
  fog:    { title: 'Fog of War',    icon: Icons.fog,   Panel: FogControls    },
  object: { title: 'Objects',       icon: Icons.tree,  Panel: ObjectControls },
  road:   { title: 'Terrain Paint', icon: Icons.brush, Panel: RoadControls   },
  image:  { title: 'Map Images',    icon: Icons.image, Panel: ImagesControls },
}
