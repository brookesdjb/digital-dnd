'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SCREEN_SIZES as BATTLE_SIZES, SCREEN_SIZE_LABELS } from '@/components/scene/BattleGrid'

// ─── types ───────────────────────────────────────────────────────────────────

type BiomeKey = 'forest' | 'dirt' | 'coast' | 'crypt' | 'ember' | 'frost' | 'blank'

interface Campaign {
  id: string
  name: string
  screen_w_in: number
  screen_h_in: number
  created_at: string
  biome: BiomeKey
  seed: number
  cover?: string
}

interface Template {
  id: string
  name: string
  biome: BiomeKey
  tag: string
  seed: number
}

// ─── data ─────────────────────────────────────────────────────────────────────

const BIOMES: Record<BiomeKey, { c1: string; c2: string; obj: string[] }> = {
  forest: { c1: '#5f7a3e', c2: '#2c3a1c', obj: ['#3d5128', '#7a8a4a', '#8a3b2e', '#4f7a3e'] },
  dirt:   { c1: '#7c5a3c', c2: '#372616', obj: ['#5e4329', '#6a4926', '#4f7a3e', '#8a6038'] },
  coast:  { c1: '#3f6b78', c2: '#1a2c34', obj: ['#2a4954', '#6a8048', '#cdb380', '#3f6b78'] },
  crypt:  { c1: '#4a4d68', c2: '#191b29', obj: ['#272a3d', '#7a6a9a', '#5d5a52', '#3a3550'] },
  ember:  { c1: '#7a624a', c2: '#352a1d', obj: ['#473d28', '#a8503e', '#bba23e', '#6a4926'] },
  frost:  { c1: '#6c7f93', c2: '#28323d', obj: ['#9fb6e6', '#cdd6e0', '#3f5160', '#7d93a8'] },
  blank:  { c1: '#2a313d', c2: '#1a1f29', obj: [] },
}

const BIOME_KEYS = Object.keys(BIOMES).filter(k => k !== 'blank') as BiomeKey[]

const TEMPLATES: Template[] = [
  { id: 't1', name: 'Forest Glade',   biome: 'forest', tag: 'Wilderness', seed: 101 },
  { id: 't2', name: 'Dungeon Depths', biome: 'crypt',  tag: 'Dungeon',    seed: 102 },
  { id: 't3', name: 'Coastal Town',   biome: 'coast',  tag: 'Settlement', seed: 103 },
  { id: 't4', name: 'Frostspire Pass',biome: 'frost',  tag: 'Wilderness', seed: 104 },
  { id: 't5', name: 'Stronghold',     biome: 'ember',  tag: 'Fortress',   seed: 105 },
  { id: 't6', name: 'Blank Canvas',   biome: 'blank',  tag: 'Empty',      seed: 106 },
]

const SCREEN_SIZES = [
  ...SCREEN_SIZE_LABELS.map(label => ({
    label: `${label} (${BATTLE_SIZES[label].w} × ${BATTLE_SIZES[label].h}")`,
    w: BATTLE_SIZES[label].w,
    h: BATTLE_SIZES[label].h,
  })),
  { label: 'Custom', w: 0, h: 0 },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

function makeBlobs(seed: number, biome: BiomeKey) {
  const b = BIOMES[biome]
  if (!b.obj.length) return []
  const r = rng(seed * 2654435761)
  const n = 5 + Math.floor(r() * 4)
  return Array.from({ length: n }, () => ({
    x: 6 + r() * 88, y: 8 + r() * 84, s: 14 + r() * 30,
    col: b.obj[Math.floor(r() * b.obj.length)], o: 0.5 + r() * 0.4,
  }))
}

function biomeFromId(id: string): BiomeKey {
  const n = parseInt(id.replace(/-/g, '').slice(-4), 16)
  return BIOME_KEYS[n % BIOME_KEYS.length]
}

function seedFromId(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(-8), 16) || 42
}

// localStorage key for per-campaign biome overrides (set at create time)
const LS_KEY = 'dnd-campaign-meta'
function loadMeta(): Record<string, { biome: BiomeKey; seed: number }> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function saveMeta(id: string, biome: BiomeKey, seed: number) {
  try {
    const meta = loadMeta()
    meta[id] = { biome, seed }
    localStorage.setItem(LS_KEY, JSON.stringify(meta))
  } catch {}
}

function rel(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = 6e4, h = 36e5, day = 864e5
  if (d < 2 * m)   return 'just now'
  if (d < h)       return Math.round(d / m) + 'm ago'
  if (d < day)     return Math.round(d / h) + 'h ago'
  if (d < 2 * day) return 'yesterday'
  if (d < 7 * day) return Math.round(d / day) + ' days ago'
  if (d < 30 * day) return Math.round(d / (7 * day)) + 'w ago'
  if (d < 365 * day) return Math.round(d / (30 * day)) + 'mo ago'
  return 'over a year ago'
}

// ─── components ───────────────────────────────────────────────────────────────

function MapThumb({ biome, cover, seed }: { biome: BiomeKey; cover?: string; seed: number }) {
  const b = BIOMES[biome] ?? BIOMES.blank
  const blobs = useMemo(() => makeBlobs(seed, biome), [seed, biome])

  if (cover) {
    return (
      <div className="lib-thumb-img" style={{ backgroundImage: `url('${cover}')` }} />
    )
  }

  return (
    <div
      className="lib-thumb-gen"
      style={{ background: `radial-gradient(130% 150% at 28% 18%, ${b.c1}, ${b.c2})` }}
    >
      <div className="lib-thumb-grid" />
      {blobs.map((bl, i) => (
        <span key={i} className="lib-blob" style={{
          left: bl.x + '%', top: bl.y + '%',
          width: bl.s + 'px', height: bl.s + 'px',
          background: bl.col, opacity: bl.o,
        }} />
      ))}
    </div>
  )
}

function CampaignCard({
  c, menuOpen, onMenu, editing, onEdit, onRename, onDup, onDelete,
}: {
  c: Campaign
  menuOpen: boolean
  onMenu: (id: string | null) => void
  editing: boolean
  onEdit: (id: string | null) => void
  onRename: (id: string, name: string) => void
  onDup: (id: string) => void
  onDelete: (id: string) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(c.name)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])
  useEffect(() => { setDraft(c.name) }, [c.name, editing])

  const commit = () => {
    const v = draft.trim()
    onRename(c.id, v || c.name)
    onEdit(null)
  }

  const goLive = () => router.push(`/control/${c.id}`)

  return (
    <div className="lib-card">
      <div className="lib-thumb" onClick={() => !editing && goLive()}>
        <MapThumb biome={c.biome} cover={c.cover} seed={c.seed} />
        <div className="lib-thumb-vig" />
        <div className="lib-thumb-hi" />
        <div className="lib-thumb-chips">
          <span className="lib-chip">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" />
            </svg>
            {c.screen_w_in}" × {c.screen_h_in}"
          </span>
        </div>
        <div className="lib-golive">
          <button className="lib-golive-btn" onClick={e => { e.stopPropagation(); goLive() }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 5l12 7-12 7z" />
            </svg>
            Go Live
          </button>
        </div>
      </div>
      <div className="lib-body">
        <div className="lib-body-l">
          {editing ? (
            <input
              ref={inputRef}
              className="lib-name-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onEdit(null) }}
            />
          ) : (
            <div className="lib-name">{c.name}</div>
          )}
          <div className="lib-meta">
            <span className="mi">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx={12} cy={12} r={8.5} /><path d="M12 7.5V12l3 1.6" />
              </svg>
              {rel(c.created_at)}
            </span>
          </div>
        </div>
        <div className="lib-kebab">
          <button
            className={'lib-kebab-btn' + (menuOpen ? ' on' : '')}
            onClick={e => { e.stopPropagation(); onMenu(menuOpen ? null : c.id) }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx={12} cy={6} r={1.4} fill="currentColor" stroke="none" />
              <circle cx={12} cy={12} r={1.4} fill="currentColor" stroke="none" />
              <circle cx={12} cy={18} r={1.4} fill="currentColor" stroke="none" />
            </svg>
          </button>
          {menuOpen && (
            <div className="lib-menu" onClick={e => e.stopPropagation()}>
              <button className="lib-menu-item" onClick={() => { onMenu(null); onEdit(c.id) }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" />
                </svg>
                Rename
              </button>
              <button className="lib-menu-item" onClick={() => { onMenu(null); onDup(c.id) }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x={9} y={9} width={11} height={11} rx={2} /><path d="M5 15V5a2 2 0 0 1 2-2h8" />
                </svg>
                Duplicate
              </button>
              <div className="lib-menu-sep" />
              <button className="lib-menu-item danger" onClick={() => { onMenu(null); onDelete(c.id) }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NewCampaignModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, biome: BiomeKey, seed: number, w: number, h: number) => void
}) {
  const [sel, setSel] = useState(TEMPLATES[0].id)
  const [name, setName] = useState('')
  const [sizeIndex, setSizeIndex] = useState(0)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const tpl = TEMPLATES.find(t => t.id === sel)!
  const isCustom = sizeIndex === SCREEN_SIZES.length - 1

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleCreate = () => {
    const w = isCustom ? parseFloat(customW) : SCREEN_SIZES[sizeIndex].w
    const h = isCustom ? parseFloat(customH) : SCREEN_SIZES[sizeIndex].h
    if (!w || !h) return
    const finalName = name.trim() || 'Untitled Campaign'
    const seed = tpl.seed + Math.floor(Math.random() * 900)
    onCreate(finalName, tpl.biome, seed, w, h)
  }

  const canCreate = isCustom
    ? (parseFloat(customW) > 0 && parseFloat(customH) > 0)
    : true

  return (
    <div className="mo-back" onClick={onClose}>
      <div className="mo" onClick={e => e.stopPropagation()}>
        <div className="mo-head">
          <div>
            <h2>New Campaign</h2>
            <p>Pick a starting map — you can add more scenes once you&apos;re live.</p>
          </div>
          <button className="mo-close" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mo-body">
          <div className="mo-label">Starting map</div>
          <div className="mo-templates">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={'mo-tpl' + (sel === t.id ? ' on' : '')}
                onClick={() => setSel(t.id)}
              >
                <div className="mo-tpl-thumb">
                  <MapThumb biome={t.biome} seed={t.seed} />
                  <div className="lib-thumb-vig" />
                  <div className="mo-tpl-check">
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  </div>
                </div>
                <div className="mo-tpl-foot">
                  <div className="mo-tpl-name">{t.name}</div>
                  <div className="mo-tpl-tag">{t.tag}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="mo-field">
            <div className="mo-label">Campaign name</div>
            <input
              value={name}
              placeholder="e.g. The Whispering Glade"
              autoFocus
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate() }}
            />
          </div>

          <div className="mo-field">
            <div className="mo-label">Display screen size</div>
            <select
              value={sizeIndex}
              onChange={e => setSizeIndex(Number(e.target.value))}
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '13px 15px', color: 'var(--txt)', fontSize: 14, fontWeight: 600, outline: 'none', cursor: 'pointer', appearance: 'auto' }}
            >
              {SCREEN_SIZES.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>

          {isCustom && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={customW}
                onChange={e => setCustomW(e.target.value)}
                placeholder="Width (inches)"
                style={{ flex: 1, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '13px 15px', color: 'var(--txt)', fontSize: 14, fontWeight: 600, outline: 'none' }}
              />
              <input
                value={customH}
                onChange={e => setCustomH(e.target.value)}
                placeholder="Height (inches)"
                style={{ flex: 1, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '13px 15px', color: 'var(--txt)', fontSize: 14, fontWeight: 600, outline: 'none' }}
              />
            </div>
          )}
        </div>
        <div className="mo-foot">
          <button className="mo-btn ghost" onClick={onClose}>Cancel</button>
          <button className="mo-btn solid" onClick={handleCreate} disabled={!canCreate}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />
            </svg>
            Create &amp; Go Live
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── root ─────────────────────────────────────────────────────────────────────

const SORTS = [
  { id: 'recent', name: 'Recent' },
  { id: 'name',   name: 'Name' },
]

export default function SetupPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('table_config')
      .select('id, name, screen_w_in, screen_h_in, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const meta = loadMeta()
          const enriched: Campaign[] = data.map(row => ({
            ...row,
            biome: meta[row.id]?.biome ?? biomeFromId(row.id),
            seed:  meta[row.id]?.seed  ?? seedFromId(row.id),
          }))
          setCampaigns(enriched)
          if (!data.length) setShowNew(true)
        }
        setLoading(false)
      })
  }, [])

  // close menus on outside click
  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const list = useMemo(() => {
    let l = campaigns.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    if (sort === 'recent') l = [...l].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sort === 'name')   l = [...l].sort((a, b) => a.name.localeCompare(b.name))
    return l
  }, [campaigns, query, sort])

  const rename = async (id: string, name: string) => {
    const supabase = createClient()
    await supabase.from('table_config').update({ name }).eq('id', id)
    setCampaigns(cs => cs.map(c => c.id === id ? { ...c, name } : c))
  }

  const dup = async (id: string) => {
    const orig = campaigns.find(c => c.id === id)
    if (!orig) return
    const supabase = createClient()
    const { data } = await supabase
      .from('table_config')
      .insert({ name: orig.name + ' (Copy)', screen_w_in: orig.screen_w_in, screen_h_in: orig.screen_h_in })
      .select('id, name, screen_w_in, screen_h_in, created_at')
      .single()
    if (data) {
      saveMeta(data.id, orig.biome, orig.seed + 311)
      const newC: Campaign = { ...data, biome: orig.biome, seed: orig.seed + 311 }
      setCampaigns(cs => [newC, ...cs])
    }
  }

  const del = async (id: string) => {
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('table_config').delete().eq('id', id)
    setCampaigns(cs => cs.filter(c => c.id !== id))
    setDeleting(null)
  }

  const handleCreate = async (name: string, biome: BiomeKey, seed: number, w: number, h: number) => {
    setShowNew(false)
    const supabase = createClient()
    const { data } = await supabase
      .from('table_config')
      .insert({ name, screen_w_in: w, screen_h_in: h })
      .select('id, name, screen_w_in, screen_h_in, created_at')
      .single()
    if (data) {
      saveMeta(data.id, biome, seed)
      router.push(`/control/${data.id}`)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="lib">
        {/* top bar */}
        <div className="lib-top">
          <div className="lib-brand">
            <div className="lib-mark">✦</div>
            <div className="lib-wordmark">
              <b>Battle Map</b>
              <span>Dungeon Table</span>
            </div>
          </div>
          <div className="lib-top-r">
            <button className="lib-new" onClick={() => setShowNew(true)}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Campaign
            </button>
          </div>
        </div>

        {/* scroll area */}
        <div className="lib-scroll">
          <div className="lib-wrap">
            <div className="lib-head">
              <div>
                <div className="lib-kicker">Your worlds</div>
                <h1 className="lib-h1">Campaigns</h1>
                <div className="lib-sub">
                  <span>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            <div className="lib-bar">
              <div className="lib-search">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={11} cy={11} r={7} /><path d="M21 21l-4-4" />
                </svg>
                <input
                  value={query}
                  placeholder="Search campaigns…"
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <div className="lib-seg">
                {SORTS.map(s => (
                  <button
                    key={s.id}
                    className={'lib-seg-btn' + (sort === s.id ? ' on' : '')}
                    onClick={() => setSort(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="lib-grid">
              <button className="lib-addtile" onClick={() => setShowNew(true)}>
                <div className="lib-addtile-ic">
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <b>New Campaign</b>
                <span>Start from a template</span>
              </button>

              {loading ? null : list.map(c => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  menuOpen={menu === c.id}
                  onMenu={setMenu}
                  editing={editing === c.id}
                  onEdit={setEditing}
                  onRename={rename}
                  onDup={dup}
                  onDelete={del}
                />
              ))}

              {!loading && list.length === 0 && query && (
                <div className="lib-empty">
                  <div className="lib-empty-ic">
                    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx={11} cy={11} r={7} /><path d="M21 21l-4-4" />
                    </svg>
                  </div>
                  <b>No campaigns found</b>
                  <span>&ldquo;{query}&rdquo; didn&apos;t match any of your worlds.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {showNew && (
          <NewCampaignModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
        )}
      </div>
    </>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --acc: #4a8cff;
  --acc-press: #6aa0ff;
  --acc-soft: rgba(74,140,255,.16);
  --acc-line: rgba(74,140,255,.5);
  --txt: #eceff4;
  --txt-dim: #98a1b2;
  --txt-faint: #5b6371;
  --track: rgba(255,255,255,.12);
  --line: rgba(255,255,255,.08);
  --panel: #161a23;
  --panel-2: #1c2230;
  --radius: 16px;
  --shadow: 0 18px 50px -12px rgba(0,0,0,.65), 0 2px 8px rgba(0,0,0,.4);
  --font: var(--font-sans, 'Manrope', system-ui, sans-serif);
  --mono: var(--font-mono, 'Space Mono', ui-monospace, monospace);
}
.lib * { box-sizing: border-box; margin: 0; padding: 0; }
.lib button { font-family: var(--font); cursor: pointer; border: none; background: none; color: inherit; }
.lib input, .lib select { font-family: var(--font); }
.lib *::-webkit-scrollbar { width: 10px; height: 10px; }
.lib *::-webkit-scrollbar-thumb { background: rgba(255,255,255,.13); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.lib *::-webkit-scrollbar-track { background: transparent; }

.lib {
  position: fixed; inset: 0; display: flex; flex-direction: column;
  font-family: var(--font); color: var(--txt); -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(120% 80% at 80% -10%, rgba(74,140,255,.10), transparent 55%),
    radial-gradient(90% 70% at 8% 0%, rgba(216,169,63,.06), transparent 50%),
    #05070a;
}

.lib-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 30px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.lib-brand { display: flex; align-items: center; gap: 11px; }
.lib-mark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 18px; color: #fff;
  background: linear-gradient(150deg, var(--acc), #2f5fb0); box-shadow: 0 4px 14px -4px var(--acc), inset 0 1px 0 rgba(255,255,255,.3); }
.lib-wordmark { display: flex; flex-direction: column; line-height: 1; gap: 3px; }
.lib-wordmark b { font-size: 14px; font-weight: 800; letter-spacing: .02em; }
.lib-wordmark span { font-size: 9.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--txt-faint); font-weight: 700; }
.lib-top-r { display: flex; align-items: center; gap: 10px; }

.lib-scroll { flex: 1; overflow-y: auto; }
.lib-wrap { max-width: 1340px; margin: 0 auto; padding: 34px 30px 64px; }

.lib-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 26px; }
.lib-kicker { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--acc); font-weight: 700; margin-bottom: 9px; }
.lib-h1 { font-size: 34px; font-weight: 800; letter-spacing: -.02em; }
.lib-sub { margin-top: 8px; font-size: 14px; color: var(--txt-dim); display: flex; align-items: center; gap: 9px; }
.lib-new { display: inline-flex; align-items: center; gap: 9px; padding: 13px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; color: #fff;
  background: var(--acc); box-shadow: 0 8px 22px -8px var(--acc); transition: .15s; white-space: nowrap; }
.lib-new:hover { background: var(--acc-press); transform: translateY(-1px); }

.lib-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.lib-search { position: relative; flex: 1; max-width: 360px; }
.lib-search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--txt-faint); pointer-events: none; }
.lib-search input { width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 11px; padding: 11px 14px 11px 40px; color: var(--txt);
  font-size: 13.5px; outline: none; transition: .14s; }
.lib-search input::placeholder { color: var(--txt-faint); }
.lib-search input:focus { border-color: var(--acc-line); background: var(--panel-2); }
.lib-seg { display: inline-flex; background: var(--panel); border: 1px solid var(--line); border-radius: 11px; padding: 4px; gap: 3px; margin-left: auto; }
.lib-seg-btn { padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--txt-dim); transition: .14s; white-space: nowrap; }
.lib-seg-btn:hover { color: var(--txt); }
.lib-seg-btn.on { background: var(--panel-2); color: var(--txt); box-shadow: inset 0 0 0 1px var(--line); }

.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(286px, 1fr)); gap: 20px; }

.lib-addtile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 248px; border-radius: var(--radius);
  border: 1.5px dashed var(--line); color: var(--txt-dim); transition: .15s; }
.lib-addtile:hover { border-color: var(--acc-line); color: var(--acc); background: var(--acc-soft); }
.lib-addtile-ic { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: rgba(255,255,255,.04); transition: .15s; }
.lib-addtile:hover .lib-addtile-ic { background: var(--acc-soft); }
.lib-addtile b { font-size: 14px; font-weight: 700; }
.lib-addtile span { font-size: 12px; color: var(--txt-faint); }

.lib-card { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; transition: .16s; display: flex; flex-direction: column; }
.lib-card:hover { border-color: rgba(255,255,255,.17); transform: translateY(-3px); box-shadow: var(--shadow); }

.lib-thumb { position: relative; aspect-ratio: 16 / 10; overflow: hidden; cursor: pointer; background: #0c0f16; }
.lib-thumb-img, .lib-thumb-gen { position: absolute; inset: 0; }
.lib-thumb-img { background-size: cover; background-position: center; }
.lib-thumb-grid { position: absolute; inset: 0; opacity: .26; mix-blend-mode: overlay;
  background-image: linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px);
  background-size: 30px 30px; }
.lib-blob { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); filter: blur(1px); }
.lib-thumb-vig { position: absolute; inset: 0; background: linear-gradient(to top, rgba(6,9,15,.82) 0%, rgba(6,9,15,.18) 40%, rgba(6,9,15,0) 70%); }
.lib-thumb-hi { position: absolute; inset: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }

.lib-thumb-chips { position: absolute; left: 11px; bottom: 11px; display: flex; gap: 6px; }
.lib-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #e7ecf5;
  background: rgba(8,11,18,.62); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.1); }

.lib-golive { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; transition: .16s; background: rgba(6,9,15,.34); backdrop-filter: blur(1px); }
.lib-thumb:hover .lib-golive { opacity: 1; }
.lib-golive-btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 999px; font-size: 13.5px; font-weight: 800; color: #fff;
  background: var(--acc); box-shadow: 0 10px 26px -8px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.14) inset; transform: translateY(4px); transition: .16s; }
.lib-thumb:hover .lib-golive-btn { transform: translateY(0); }
.lib-golive-btn:hover { background: var(--acc-press); }

.lib-body { padding: 14px 15px 15px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.lib-body-l { min-width: 0; flex: 1; }
.lib-name { font-size: 15.5px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-name-input { width: 100%; background: #0c0f16; border: 1px solid var(--acc); border-radius: 7px; padding: 5px 8px; color: var(--txt); font-size: 15px; font-weight: 700; outline: none; }
.lib-meta { margin-top: 6px; font-size: 12.5px; color: var(--txt-dim); display: flex; align-items: center; gap: 8px; font-feature-settings: "tnum"; }
.lib-meta .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--txt-faint); flex-shrink: 0; }
.lib-meta .mi { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }

.lib-kebab { position: relative; flex-shrink: 0; }
.lib-kebab-btn { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--txt-dim); transition: .14s; margin: -4px -4px 0 0; }
.lib-kebab-btn:hover, .lib-kebab-btn.on { background: rgba(255,255,255,.08); color: var(--txt); }
.lib-menu { position: absolute; top: 36px; right: 0; z-index: 30; width: 168px; padding: 6px; background: #1b212d; border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; box-shadow: var(--shadow); animation: lib-pop .14s ease; }
@keyframes lib-pop { from { opacity: 0; transform: translateY(-4px); } }
.lib-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--txt); transition: .12s; text-align: left; }
.lib-menu-item svg { color: var(--txt-dim); }
.lib-menu-item:hover { background: rgba(255,255,255,.07); }
.lib-menu-item.danger { color: #e8857c; }
.lib-menu-item.danger svg { color: #e8857c; }
.lib-menu-item.danger:hover { background: rgba(220,80,70,.16); }
.lib-menu-sep { height: 1px; background: var(--line); margin: 5px 4px; }

.lib-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 70px 0; color: var(--txt-dim); }
.lib-empty-ic { width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center; background: var(--panel); border: 1px solid var(--line); color: var(--txt-faint); }
.lib-empty b { font-size: 16px; color: var(--txt); font-weight: 700; }
.lib-empty span { font-size: 13px; }

.mo-back { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 24px; background: rgba(4,6,10,.66); backdrop-filter: blur(8px); animation: lib-fade .18s ease; }
@keyframes lib-fade { from { opacity: 0; } }
.mo { width: 100%; max-width: 660px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; background: #141822; border: 1px solid rgba(255,255,255,.12);
  border-radius: 20px; box-shadow: var(--shadow); overflow: hidden; animation: lib-rise .22s cubic-bezier(.2,.9,.3,1); }
@keyframes lib-rise { from { transform: translateY(14px); opacity: .6; } }
.mo-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 22px 16px; border-bottom: 1px solid var(--line); }
.mo-head h2 { font-size: 19px; font-weight: 800; letter-spacing: -.01em; }
.mo-head p { margin-top: 4px; font-size: 13px; color: var(--txt-dim); }
.mo-close { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--txt-dim); transition: .14s; }
.mo-close:hover { background: rgba(255,255,255,.08); color: var(--txt); }
.mo-body { padding: 20px 22px; overflow-y: auto; }
.mo-label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--txt-dim); font-weight: 700; margin-bottom: 12px; }

.mo-templates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
.mo-tpl { position: relative; border-radius: 12px; overflow: hidden; border: 2px solid transparent; background: var(--panel-2); transition: .14s; text-align: left; }
.mo-tpl:hover { transform: translateY(-2px); }
.mo-tpl.on { border-color: var(--acc); box-shadow: 0 0 0 4px var(--acc-soft); }
.mo-tpl-thumb { position: relative; aspect-ratio: 16 / 11; overflow: hidden; }
.mo-tpl-check { position: absolute; top: 7px; right: 7px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  background: var(--acc); box-shadow: 0 2px 6px rgba(0,0,0,.4); opacity: 0; transform: scale(.6); transition: .15s; }
.mo-tpl.on .mo-tpl-check { opacity: 1; transform: scale(1); }
.mo-tpl-foot { padding: 9px 11px 10px; }
.mo-tpl-name { font-size: 13px; font-weight: 700; }
.mo-tpl-tag { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--txt-faint); font-weight: 700; margin-top: 2px; }

.mo-field { margin-top: 22px; }
.mo-field input { width: 100%; background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; padding: 13px 15px; color: var(--txt);
  font-size: 15px; font-weight: 600; outline: none; transition: .14s; }
.mo-field input:focus { border-color: var(--acc-line); }
.mo-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid var(--line); }
.mo-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 11px; font-size: 14px; font-weight: 700; transition: .14s; }
.mo-btn.ghost { color: var(--txt-dim); }
.mo-btn.ghost:hover { background: rgba(255,255,255,.07); color: var(--txt); }
.mo-btn.solid { background: var(--acc); color: #fff; box-shadow: 0 8px 22px -8px var(--acc); }
.mo-btn.solid:hover { background: var(--acc-press); }
.mo-btn.solid:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }

@media (max-width: 620px) {
  .lib-wrap { padding: 24px 18px 48px; }
  .lib-top { padding: 14px 18px; }
  .lib-head { flex-direction: column; align-items: stretch; }
  .mo-templates { grid-template-columns: repeat(2, 1fr); }
}
`
