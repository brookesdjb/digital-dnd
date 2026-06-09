'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase/client'
import { SCREEN_SIZES as BATTLE_SIZES, SCREEN_SIZE_LABELS } from '@/components/scene/BattleGrid'

const SCREEN_SIZES = [
  ...SCREEN_SIZE_LABELS.map(label => ({
    label: `${label} (${BATTLE_SIZES[label].w} × ${BATTLE_SIZES[label].h}")`,
    w: BATTLE_SIZES[label].w,
    h: BATTLE_SIZES[label].h,
  })),
  { label: 'Custom', w: 0, h: 0 },
]

type Created = { tableId: string; displayUrl: string; controlUrl: string }

export default function SetupPage() {
  const [tableName, setTableName] = useState('')
  const [sizeIndex, setSizeIndex] = useState(0)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)

  const isCustom = sizeIndex === SCREEN_SIZES.length - 1

  async function handleCreate() {
    if (!tableName.trim()) { setError('Enter a table name'); return }
    const size = SCREEN_SIZES[sizeIndex]
    const w = isCustom ? parseFloat(customW) : size.w
    const h = isCustom ? parseFloat(customH) : size.h
    if (!w || !h) { setError('Enter screen dimensions'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: dbError } = await supabase
      .from('table_config')
      .insert({ name: tableName.trim(), screen_w_in: w, screen_h_in: h })
      .select('id')
      .single()

    setLoading(false)

    if (dbError || !data) {
      setError(dbError?.message ?? 'Failed to create table')
      return
    }

    const base = window.location.origin
    setCreated({
      tableId: data.id,
      displayUrl: `${base}/display/${data.id}`,
      controlUrl: `${base}/control/${data.id}`,
    })
  }

  if (created) {
    return (
      <div style={styles.page}>
        <h1 style={styles.title}>Table ready</h1>
        <p style={styles.subtitle}>{tableName}</p>

        <div style={styles.card}>
          <p style={styles.label}>Display URL — open on iPad or TV</p>
          <QRCodeSVG value={created.displayUrl} size={200} bgColor="#1a1a2e" fgColor="#ffffff" />
          <code style={styles.url}>{created.displayUrl}</code>
        </div>

        <a href={created.controlUrl} style={styles.button}>
          Open Control View
        </a>

        <button onClick={() => setCreated(null)} style={styles.ghost}>
          Create another table
        </button>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>New Table</h1>

      <div style={styles.field}>
        <label style={styles.label}>Table name</label>
        <input
          value={tableName}
          onChange={e => setTableName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Basement Campaign"
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Display screen</label>
        <select
          value={sizeIndex}
          onChange={e => setSizeIndex(Number(e.target.value))}
          style={styles.input}
        >
          {SCREEN_SIZES.map((s, i) => (
            <option key={i} value={i}>{s.label}</option>
          ))}
        </select>
      </div>

      {isCustom && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={customW}
            onChange={e => setCustomW(e.target.value)}
            placeholder='Width (inches)'
            style={{ ...styles.input, width: 140 }}
          />
          <input
            value={customH}
            onChange={e => setCustomH(e.target.value)}
            placeholder='Height (inches)'
            style={{ ...styles.input, width: 140 }}
          />
        </div>
      )}

      {error && <p style={{ color: '#f87171', margin: 0, fontSize: 13 }}>{error}</p>}

      <button onClick={handleCreate} disabled={loading} style={styles.button}>
        {loading ? 'Creating…' : 'Create Table'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: 20,
    background: '#1a1a2e', color: '#fff', fontFamily: 'sans-serif', padding: 24,
  },
  title: { margin: 0, fontSize: 28 },
  subtitle: { margin: 0, color: '#aaa', fontSize: 16 },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    background: '#252540', borderRadius: 12, padding: 32,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, width: 300 },
  label: { fontSize: 13, color: '#aaa', margin: 0 },
  input: {
    padding: '8px 12px', borderRadius: 6, border: '1px solid #444',
    background: '#252540', color: '#fff', fontSize: 15, width: '100%',
    boxSizing: 'border-box' as const,
  },
  url: {
    fontSize: 12, color: '#aaa', wordBreak: 'break-all' as const,
    background: '#111', padding: '6px 10px', borderRadius: 4, maxWidth: 280, textAlign: 'center' as const,
  },
  button: {
    display: 'inline-block', padding: '10px 28px', borderRadius: 6, border: 'none',
    background: '#4a7c59', color: '#fff', fontSize: 15, cursor: 'pointer',
    textDecoration: 'none', textAlign: 'center' as const,
  },
  ghost: {
    background: 'none', border: 'none', color: '#666', fontSize: 13,
    cursor: 'pointer', padding: 0,
  },
}
