'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [tableName, setTableName] = useState('')

  function handleStart() {
    // M1: generate a random tableId locally. M2: persist to Supabase.
    const tableId = crypto.randomUUID()
    router.push(`/control/${tableId}`)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
      background: '#1a1a2e', color: '#fff', fontFamily: 'sans-serif',
    }}>
      <h1 style={{ margin: 0 }}>D&amp;D Table</h1>
      <input
        value={tableName}
        onChange={e => setTableName(e.target.value)}
        placeholder="Table name"
        style={{ padding: '8px 12px', borderRadius: 6, border: 'none', fontSize: 16, width: 240 }}
      />
      <button
        onClick={handleStart}
        style={{
          padding: '10px 24px', borderRadius: 6, border: 'none',
          background: '#4a7c59', color: '#fff', fontSize: 16, cursor: 'pointer',
        }}
      >
        Start Session
      </button>
      <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
        Open <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>/display/[tableId]</code> on the TV browser to connect the display.
      </p>
    </div>
  )
}
