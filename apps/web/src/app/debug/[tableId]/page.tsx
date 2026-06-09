'use client'

import { use, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Add new event names here as the protocol grows.
const BROADCAST_EVENTS = ['TERRAIN_UPDATED', 'OBJECTS_UPDATED', 'STATE_UPDATED'] as const

interface LogEntry {
  id:      number
  ts:      string
  event:   string
  summary: string
}

// Redact base64 blobs and large arrays so the log stays readable.
function summarize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:') || value.length > 120) {
      return `<blob ~${Math.round(value.length / 1024)}kb>`
    }
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 6) return `[...${value.length} items]`
    return value.map(v => summarize(v, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    if (depth > 3) return '{...}'
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, summarize(v, depth + 1)])
    )
  }
  return value
}

let counter = 0

export default function DebugPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)
  const [entries,   setEntries]   = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`table:${tableId}`)

    BROADCAST_EVENTS.forEach(event => {
      ch.on('broadcast', { event }, ({ payload }) => {
        const entry: LogEntry = {
          id:      counter++,
          ts:      new Date().toISOString().slice(11, 23),
          event,
          summary: JSON.stringify(summarize(payload)),
        }
        setEntries(prev => [...prev, entry].slice(-300))
      })
    })

    ch.subscribe(status => setConnected(status === 'SUBSCRIBED'))
    return () => void supabase.removeChannel(ch)
  }, [tableId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const eventColor: Record<string, string> = {
    STATE_UPDATED:   '#7dd3fc',
    TERRAIN_UPDATED: '#86efac',
    OBJECTS_UPDATED: '#fde68a',
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13, padding: '1rem', background: '#0d0d0d', color: '#d4d4d4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
        <span style={{ color: '#fff', fontWeight: 'bold' }}>Channel monitor</span>
        <code style={{ color: '#888' }}>table:{tableId}</code>
        <span style={{ color: connected ? '#4ade80' : '#f87171' }}>
          {connected ? '● connected' : '○ disconnected'}
        </span>
        <button
          onClick={() => setEntries([])}
          style={{ marginLeft: 'auto', background: '#333', color: '#ccc', border: '1px solid #555', padding: '2px 10px', cursor: 'pointer', borderRadius: 4 }}
        >
          clear
        </button>
      </div>

      <div style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '0.5rem', height: 'calc(100vh - 70px)', overflowY: 'auto' }}>
        {entries.length === 0 && (
          <div style={{ color: '#555', padding: '0.5rem' }}>Waiting for broadcast events…</div>
        )}
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: '0.75rem', padding: '2px 0', borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ color: '#666', flexShrink: 0 }}>{e.ts}</span>
            <span style={{ color: eventColor[e.event] ?? '#fff', flexShrink: 0, minWidth: 160 }}>{e.event}</span>
            <span style={{ color: '#aaa', overflowWrap: 'anywhere' }}>{e.summary}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
