'use client'

import { useState, useRef, useEffect } from 'react'
import type { SceneRow } from '@/lib/sync/useSceneDB'

interface SceneListProps {
  scenes:        SceneRow[]
  activeSceneId: string | null
  onSwitch:      (id: string) => void
  onCreate:      () => void
  onDelete:      (id: string) => void
  onRename:      (id: string, name: string) => void
}

export function SceneList({ scenes, activeSceneId, onSwitch, onCreate, onDelete, onRename }: SceneListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  function startRename(id: string, name: string) {
    setEditingId(id)
    setEditName(name)
  }

  function commitRename() {
    if (editingId && editName.trim()) onRename(editingId, editName)
    setEditingId(null)
  }

  return (
    <div style={{
      position:       'absolute',
      top:            12,
      left:           12,
      width:          196,
      background:     'rgba(8, 8, 18, 0.84)',
      border:         '1px solid rgba(255,255,255,0.09)',
      borderRadius:   6,
      zIndex:         100,
      userSelect:     'none',
      backdropFilter: 'blur(6px)',
      fontFamily:     'system-ui, sans-serif',
    }}>
      <div style={{
        padding:       '8px 10px 6px',
        fontSize:      10,
        fontWeight:    600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color:         'rgba(255,255,255,0.35)',
        borderBottom:  '1px solid rgba(255,255,255,0.07)',
      }}>
        Scenes
      </div>

      <div style={{ padding: '4px 0' }}>
        {scenes.map(scene => {
          const isActive  = scene.id === activeSceneId
          const isEditing = scene.id === editingId
          return (
            <div
              key={scene.id}
              onClick={() => { if (!isEditing) onSwitch(scene.id) }}
              onDoubleClick={() => startRename(scene.id, scene.name)}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         4,
                padding:     '5px 8px 5px 10px',
                cursor:      isEditing ? 'default' : 'pointer',
                background:  isActive ? 'rgba(90,150,255,0.15)' : 'transparent',
                borderLeft:  isActive ? '2px solid rgba(90,150,255,0.65)' : '2px solid transparent',
                transition:  'background 0.1s',
              }}
              onMouseEnter={e => { if (!isActive && !isEditing) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex:        1,
                    background:  'rgba(255,255,255,0.08)',
                    border:      '1px solid rgba(90,150,255,0.55)',
                    borderRadius: 3,
                    color:       '#fff',
                    fontSize:    13,
                    padding:     '1px 5px',
                    outline:     'none',
                    minWidth:    0,
                  }}
                />
              ) : (
                <span style={{
                  flex:         1,
                  fontSize:     13,
                  color:        isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  {scene.name}
                </span>
              )}

              {!isEditing && scenes.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(scene.id) }}
                  title="Delete scene"
                  style={{
                    background: 'none',
                    border:     'none',
                    color:      'rgba(255,255,255,0.2)',
                    cursor:     'pointer',
                    fontSize:   16,
                    lineHeight: 1,
                    padding:    '0 2px',
                    flexShrink: 0,
                    transition: 'color 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,80,80,0.85)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={onCreate}
          style={{
            width:        '100%',
            marginTop:    6,
            background:   'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color:        'rgba(255,255,255,0.45)',
            cursor:       'pointer',
            fontSize:     13,
            padding:      '5px 0',
            transition:   'background 0.1s, color 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.11)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          + New Scene
        </button>
      </div>
    </div>
  )
}
