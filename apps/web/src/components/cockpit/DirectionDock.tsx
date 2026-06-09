'use client'

import React, { useState } from 'react'
import { Icons, ago } from './primitives'
import { FogControls, ObjectControls, RoadControls, ImagesControls, LightingControls, WeatherControls, ViewControls, ShadowControls, ScenePanel } from './panels'
import type { CockpitState } from './useCockpit'
import type { PanelActions } from './panels'

type PanelId = 'fog' | 'object' | 'road' | 'image' | 'light' | 'weather' | 'scenes' | 'view' | 'shadows' | null

const TRAY_META: Record<NonNullable<PanelId>, { title: string; icon: (p: { s?: number }) => React.ReactElement; wide?: boolean }> = {
  fog:     { title: 'Fog of War',      icon: Icons.fog,    wide: true },
  object:  { title: 'Objects',         icon: Icons.tree,   wide: true },
  road:    { title: 'Terrain Paint',   icon: Icons.brush,  wide: true },
  image:   { title: 'Map Images',      icon: Icons.image,  wide: true },
  light:   { title: 'Lighting & Mood', icon: Icons.sun,    wide: true },
  weather: { title: 'Weather & Wind',  icon: Icons.rain    },
  scenes:  { title: 'Scenes',          icon: Icons.layers  },
  view:    { title: 'View & Grid',     icon: Icons.grid    },
  shadows: { title: 'Shadows',         icon: Icons.shadows },
}

interface DockTrayProps { panel: NonNullable<PanelId>; c: CockpitState; actions: PanelActions; onClose: () => void }

function DockTray({ panel, c, actions, onClose }: DockTrayProps) {
  const meta = TRAY_META[panel]
  const Icon = meta.icon

  let body: React.ReactNode
  switch (panel) {
    case 'fog':     body = <FogControls     c={c} actions={actions} />; break
    case 'object':  body = <ObjectControls  c={c} actions={actions} />; break
    case 'road':    body = <RoadControls    c={c} />; break
    case 'image':   body = <ImagesControls  c={c} actions={actions} />; break
    case 'light':   body = <LightingControls c={c} />; break
    case 'weather': body = <WeatherControls c={c} />; break
    case 'scenes':  body = <ScenePanel      actions={actions} />; break
    case 'view':    body = <ViewControls    c={c} actions={actions} />; break
    case 'shadows': body = <ShadowControls  c={c} />; break
  }

  return (
    <div className={`dk-tray${meta.wide ? ' wide' : ''}`}>
      <div className="dk-tray-head">
        <span className="dk-tray-title"><Icon s={18} />{meta.title}</span>
        <button className="dk-tray-close" onClick={onClose}><Icons.close s={18} /></button>
      </div>
      <div className="dk-tray-body">{body}</div>
    </div>
  )
}

interface DockToolProps { icon: (p: { s?: number }) => React.ReactElement; label: string; active: boolean; onClick: () => void; extraClass?: string }

function DockTool({ icon: Icon, label, active, onClick, extraClass = '' }: DockToolProps) {
  return (
    <button className={`dk-tool${active ? ' on' : ''}${extraClass ? ' ' + extraClass : ''}`} onClick={onClick}>
      <Icon s={24} />
      <span>{label}</span>
    </button>
  )
}

interface Props { c: CockpitState; actions: PanelActions; savedAt: number }

export function DirectionDock({ c, actions, savedAt }: Props) {
  const [panel, setPanel] = useState<PanelId>(null)

  const pickTool = (t: 'fog' | 'object' | 'road' | 'image' | 'select') => {
    c.setTool(t)
    setPanel(t === 'select' ? null : t as PanelId)
  }
  const togglePanel = (p: NonNullable<PanelId>) => setPanel(cur => cur === p ? null : p)

  const scene = actions.scenes.find(s => s.id === actions.activeSceneId) ?? actions.scenes[0]

  return (
    <div className="dir dir-dock">
      {/* Status chip */}
      <div className="dk-status">
        <span className="dk-live"><span className="dk-live-dot" />LIVE</span>
        <span className="dk-scene-name">{scene?.name ?? '—'}</span>
        <span className="dk-dot-sep" />
        <span className={`dk-saved${actions.savedFlash ? ' flash' : ''}`}>
          {actions.savedFlash ? 'Saved' : `Saved ${ago(savedAt)}`}
        </span>
      </div>

      {c.paused && (
        <div className="dk-pause-flag">
          <Icons.pause s={16} />Display paused
        </div>
      )}

      {panel && (
        <DockTray panel={panel} c={c} actions={actions} onClose={() => setPanel(null)} />
      )}

      {/* Dock bar */}
      <div className="dk-dock">
        <div className="dk-group">
          <DockTool icon={Icons.cursor} label="Move"    active={c.tool === 'select'} onClick={() => pickTool('select')} />
          <DockTool icon={Icons.fog}    label="Fog"     active={c.tool === 'fog'}    onClick={() => pickTool('fog')} />
          <DockTool icon={Icons.tree}   label="Objects" active={c.tool === 'object'} onClick={() => pickTool('object')} />
          <DockTool icon={Icons.brush}  label="Terrain" active={c.tool === 'road'}   onClick={() => pickTool('road')} />
          <DockTool icon={Icons.image}  label="Images"  active={c.tool === 'image'}  onClick={() => pickTool('image')} />
        </div>
        <div className="dk-sep" />
        <div className="dk-group">
          <DockTool icon={Icons.sun}  label="Mood"    active={panel === 'light'}   onClick={() => togglePanel('light')} />
          <DockTool icon={Icons.rain} label="Weather" active={panel === 'weather'} onClick={() => togglePanel('weather')} />
          <DockTool icon={Icons.shadows} label="Shadows" active={panel === 'shadows'} onClick={() => togglePanel('shadows')} />
        </div>
        <div className="dk-sep" />
        <div className="dk-group">
          <DockTool icon={Icons.layers} label="Scenes" active={panel === 'scenes'} onClick={() => togglePanel('scenes')} />
          <DockTool icon={Icons.grid}   label="View"   active={panel === 'view'}   onClick={() => togglePanel('view')} />
        </div>
        <div className="dk-sep" />
        <div className="dk-group">
          <button className={`dk-tool dk-pause${c.paused ? ' active' : ''}`} onClick={() => c.setPaused(!c.paused)}>
            {c.paused ? <Icons.play s={24} /> : <Icons.pause s={24} />}
            <span>{c.paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button className={`dk-tool dk-save${actions.savedFlash ? ' done' : ''}`} onClick={actions.onSave}>
            {actions.savedFlash ? <Icons.check s={24} /> : <Icons.save s={24} />}
            <span>{actions.savedFlash ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
