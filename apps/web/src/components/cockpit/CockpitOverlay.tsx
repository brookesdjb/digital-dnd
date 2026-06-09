'use client'

import React, { useState, useEffect } from 'react'
import './cockpit.css'
import type { CockpitState } from './useCockpit'
import type { PanelActions } from './panels'
import { DirectionDock  } from './DirectionDock'
import { DirectionRail  } from './DirectionRail'
import { DirectionGlass } from './DirectionGlass'

type Direction = 'dock' | 'rail' | 'glass'

const DIRECTIONS: Array<{ id: Direction; name: string; sub: string }> = [
  { id: 'dock',  name: 'Command Dock',  sub: 'Bottom toolbar'    },
  { id: 'rail',  name: 'Mission Rail',  sub: 'Left rail + flyout' },
  { id: 'glass', name: 'Glass Console', sub: 'Right glass panel'  },
]

function Switcher({ dir, setDir }: { dir: Direction; setDir: (d: Direction) => void }) {
  return (
    <div className="sw">
      <span className="sw-tag">Layout</span>
      <div className="sw-segs">
        {DIRECTIONS.map(d => (
          <button key={d.id} className={`sw-seg${dir === d.id ? ' on' : ''}`}
            onClick={() => setDir(d.id)}>
            <span className="sw-seg-name">{d.name}</span>
            <span className="sw-seg-sub">{d.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface CockpitOverlayProps {
  c:       CockpitState
  actions: PanelActions
  savedAt: number
}

export function CockpitOverlay({ c, actions, savedAt }: CockpitOverlayProps) {
  const [dir, setDir] = useState<Direction>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dnd-cockpit-dir') as Direction | null) ?? 'dock'
    }
    return 'dock'
  })

  useEffect(() => {
    localStorage.setItem('dnd-cockpit-dir', dir)
  }, [dir])

  const dirProps = { c, actions, savedAt }

  return (
    <div className="cockpit-root">
      <Switcher dir={dir} setDir={setDir} />
      {dir === 'dock'  && <DirectionDock  {...dirProps} />}
      {dir === 'rail'  && <DirectionRail  {...dirProps} />}
      {dir === 'glass' && <DirectionGlass {...dirProps} />}
    </div>
  )
}
