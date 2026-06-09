'use client'

import React, { useState } from 'react'
import { Icons, ago } from './primitives'
import { FogControls, ObjectControls, RoadControls, LightingControls, WeatherControls, ViewControls, ShadowControls, ScenePanel } from './panels'
import type { CockpitState } from './useCockpit'
import type { PanelActions } from './panels'

type RailId = 'scenes' | 'fog' | 'object' | 'road' | 'light' | 'weather' | 'view' | 'shadows'

const RAIL_ITEMS: Array<{ id: RailId; icon: (p: { s?: number }) => React.ReactElement; label: string }> = [
  { id: 'scenes',  icon: Icons.layers,  label: 'Scenes'   },
  { id: 'fog',     icon: Icons.fog,     label: 'Fog'      },
  { id: 'object',  icon: Icons.tree,    label: 'Objects'  },
  { id: 'road',    icon: Icons.brush,   label: 'Terrain'  },
  { id: 'light',   icon: Icons.sun,     label: 'Lighting' },
  { id: 'weather', icon: Icons.rain,    label: 'Weather'  },
  { id: 'view',    icon: Icons.grid,    label: 'View'     },
  { id: 'shadows', icon: Icons.shadows, label: 'Shadows'  },
]

const FLYOUT_TITLES: Record<RailId, string> = {
  scenes: 'SCENES', fog: 'FOG OF WAR', object: 'OBJECT PAINTING',
  road: 'TERRAIN PAINTING', light: 'LIGHTING & MOOD',
  weather: 'WEATHER & WIND', view: 'VIEW & GRID', shadows: 'SHADOWS',
}

interface FlyoutBodyProps { id: RailId; c: CockpitState; actions: PanelActions }
function FlyoutBody({ id, c, actions }: FlyoutBodyProps) {
  switch (id) {
    case 'scenes':  return <ScenePanel      actions={actions} />
    case 'fog':     return <FogControls     c={c} actions={actions} />
    case 'object':  return <ObjectControls  c={c} actions={actions} />
    case 'road':    return <RoadControls    c={c} />
    case 'light':   return <LightingControls c={c} />
    case 'weather': return <WeatherControls c={c} />
    case 'view':    return <ViewControls    c={c} actions={actions} />
    case 'shadows': return <ShadowControls  c={c} />
  }
}

interface Props { c: CockpitState; actions: PanelActions; savedAt: number }

export function DirectionRail({ c, actions, savedAt }: Props) {
  const [open, setOpen] = useState<RailId | null>(null)
  const scene = actions.scenes.find(s => s.id === actions.activeSceneId) ?? actions.scenes[0]

  const pick = (id: RailId) => {
    if (id === 'fog' || id === 'object' || id === 'road') c.setTool(id)
    setOpen(cur => cur === id ? null : id)
  }

  const isToolActive = (id: RailId) =>
    (id === 'fog' || id === 'object' || id === 'road') && c.tool === id

  return (
    <div className="dir dir-rail">
      {/* Topbar */}
      <div className="rl-topbar">
        <span className="rl-live"><span className="rl-live-dot" />LIVE</span>
        <span className="rl-scene">{scene?.name ?? '—'}</span>
        <span className="rl-meta">
          {actions.savedFlash ? '● saved' : `● saved ${ago(savedAt)}`}
        </span>
        {c.paused && <span className="rl-paused">PAUSED</span>}
      </div>

      {/* Rail + flyout */}
      <div className="rl-wrap">
        <div className="rl-rail">
          <div className="rl-rail-top">
            {RAIL_ITEMS.map(it => {
              const Icon = it.icon
              return (
                <button key={it.id} title={it.label}
                  className={`rl-item${open === it.id ? ' open' : ''}${isToolActive(it.id) ? ' active' : ''}`}
                  onClick={() => pick(it.id)}>
                  <Icon s={22} />
                  <span className="rl-item-label">{it.label}</span>
                </button>
              )
            })}
          </div>
          <div className="rl-rail-bot">
            <button title="Pause display"
              className={`rl-item${c.paused ? ' active' : ''}`}
              onClick={() => c.setPaused(!c.paused)}>
              {c.paused ? <Icons.play s={22} /> : <Icons.pause s={22} />}
              <span className="rl-item-label">{c.paused ? 'Resume' : 'Pause'}</span>
            </button>
            <button title="Save scene"
              className={`rl-item rl-save${actions.savedFlash ? ' done' : ''}`}
              onClick={actions.onSave}>
              {actions.savedFlash ? <Icons.check s={22} /> : <Icons.save s={22} />}
              <span className="rl-item-label">Save</span>
            </button>
          </div>
        </div>

        {open && (
          <div className="rl-flyout">
            <div className="rl-flyout-head">
              <span className="rl-flyout-title">{FLYOUT_TITLES[open]}</span>
              <button className="rl-flyout-close" onClick={() => setOpen(null)}>
                <Icons.close s={16} />
              </button>
            </div>
            <div className="rl-flyout-body">
              <FlyoutBody id={open} c={c} actions={actions} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
