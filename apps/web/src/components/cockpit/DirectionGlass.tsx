'use client'

import React, { useState } from 'react'
import { Icons, Segmented, ago } from './primitives'
import { FogControls, ObjectControls, RoadControls, ImagesControls, LightingControls, WeatherControls, ViewControls, ShadowControls, ScenePanel, CandleControls } from './panels'
import type { CockpitState, CockpitTool } from './useCockpit'
import type { PanelActions } from './panels'

interface SectionProps {
  id: string
  title: string
  icon: (p: { s?: number }) => React.ReactElement
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function GlassSection({ title, icon: Icon, open, onToggle, children }: SectionProps) {
  return (
    <div className={`gl-sec${open ? ' open' : ''}`}>
      <button className="gl-sec-head" onClick={onToggle}>
        <span className="gl-sec-icon"><Icon s={18} /></span>
        <span className="gl-sec-title">{title}</span>
        <span className="gl-sec-chev"><Icons.chevDown s={16} /></span>
      </button>
      {open && <div className="gl-sec-body">{children}</div>}
    </div>
  )
}

interface Props { c: CockpitState; actions: PanelActions; savedAt: number }

export function DirectionGlass({ c, actions, savedAt }: Props) {
  const [open, setOpen] = useState({ tool: true, mood: true, weather: false, candle: false, scenes: false, view: false, shadows: false })
  const toggle = (k: keyof typeof open) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const scene = actions.scenes.find(s => s.id === actions.activeSceneId) ?? actions.scenes[0]

  // Active tool panel
  const activeTool = c.tool === 'select' ? 'fog' : c.tool
  const toolTitle =
    activeTool === 'fog'    ? 'Fog of War'    :
    activeTool === 'object' ? 'Objects'       :
    activeTool === 'image'  ? 'Map Images'    : 'Terrain Paint'
  const ToolIcon =
    activeTool === 'fog'    ? Icons.fog   :
    activeTool === 'object' ? Icons.tree  :
    activeTool === 'image'  ? Icons.image : Icons.brush

  const toolBody =
    activeTool === 'fog'    ? <FogControls    c={c} actions={actions} /> :
    activeTool === 'object' ? <ObjectControls c={c} actions={actions} /> :
    activeTool === 'image'  ? <ImagesControls c={c} actions={actions} /> :
                              <RoadControls   c={c} />

  return (
    <div className="dir dir-glass">
      <div className="gl-panel">
        {/* Header */}
        <div className="gl-header">
          <div className="gl-header-l">
            <span className="gl-live"><span className="gl-live-dot" />Live on display</span>
            <span className="gl-scene">{scene?.name ?? '—'}</span>
            <span className="gl-saved">
              {actions.savedFlash ? 'Saved just now' : `Saved ${ago(savedAt)}`}
            </span>
          </div>
          <div className="gl-header-btns">
            <button className={`gl-round${c.paused ? ' on' : ''}`}
              title="Pause display" onClick={() => c.setPaused(!c.paused)}>
              {c.paused ? <Icons.play s={18} /> : <Icons.pause s={18} />}
            </button>
            <button className={`gl-round${actions.savedFlash ? ' done' : ''}`}
              title="Save" onClick={actions.onSave}>
              {actions.savedFlash ? <Icons.check s={18} /> : <Icons.save s={18} />}
            </button>
          </div>
        </div>

        {/* Tool selector */}
        <div className="gl-tools">
          <Segmented full
            value={activeTool}
            onChange={v => c.setTool(v as CockpitTool)}
            options={[
              { value: 'fog',    label: 'Fog',     icon: Icons.fog   },
              { value: 'object', label: 'Objects', icon: Icons.tree  },
              { value: 'road',   label: 'Terrain', icon: Icons.brush },
              { value: 'image',  label: 'Images',  icon: Icons.image },
            ]} />
        </div>

        {/* Accordion */}
        <div className="gl-scroll">
          <GlassSection id="tool" title={toolTitle} icon={ToolIcon}
            open={open.tool} onToggle={() => toggle('tool')}>
            {toolBody}
          </GlassSection>
          <GlassSection id="mood" title="Lighting & Mood" icon={Icons.sun}
            open={open.mood} onToggle={() => toggle('mood')}>
            <LightingControls c={c} />
          </GlassSection>
          <GlassSection id="weather" title="Weather & Wind" icon={Icons.rain}
            open={open.weather} onToggle={() => toggle('weather')}>
            <WeatherControls c={c} />
          </GlassSection>
          <GlassSection id="candle" title="Candle Lights" icon={Icons.candle}
            open={open.candle} onToggle={() => toggle('candle')}>
            <CandleControls c={c} />
          </GlassSection>
          <GlassSection id="scenes" title="Scenes" icon={Icons.layers}
            open={open.scenes} onToggle={() => toggle('scenes')}>
            <ScenePanel actions={actions} />
          </GlassSection>
          <GlassSection id="view" title="View & Grid" icon={Icons.grid}
            open={open.view} onToggle={() => toggle('view')}>
            <ViewControls c={c} actions={actions} />
          </GlassSection>
          <GlassSection id="shadows" title="Shadows" icon={Icons.shadows}
            open={open.shadows} onToggle={() => toggle('shadows')}>
            <ShadowControls c={c} />
          </GlassSection>
        </div>
      </div>
    </div>
  )
}
