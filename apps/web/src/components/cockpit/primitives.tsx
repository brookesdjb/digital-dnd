'use client'

import React from 'react'
import type { LightPreset } from './useCockpit'
import { LIGHT_PRESETS } from './useCockpit'
import type { CockpitLight } from './useCockpit'

// ── SVG icon helper ──────────────────────────────────────────────────────────

interface IconProps { s?: number; w?: number; style?: React.CSSProperties }
type IconFn = (p: IconProps) => React.ReactElement

function I(p: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={p.s ?? 22} height={p.s ?? 22} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={p.w ?? 1.7} strokeLinecap="round"
      strokeLinejoin="round" style={p.style}>
      {p.children}
    </svg>
  )
}

export const Icons: Record<string, IconFn> = {
  cursor:   p => <I {...p}><path d="M5 4l6 14 2.2-5.8L19 10z" /></I>,
  fog:      p => <I {...p}><path d="M3 9h13M6 13h12M4 17h11" /><path d="M19 6.5c1.6 0 2.5 1 2.5 2.2" /></I>,
  eye:      p => <I {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></I>,
  tree:     p => <I {...p}><path d="M12 3l5 7h-3l3 5H7l3-5H7z" /><path d="M12 15v6" /></I>,
  brush:    p => <I {...p}><path d="M16 4l4 4-8.5 8.5-4-4z" /><path d="M7.5 12.5L4 16c-1 1-1 3 0 4s3 1 4 0l3.5-3.5" /></I>,
  sun:      p => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></I>,
  rain:     p => <I {...p}><path d="M6 11a4 4 0 011-7.5A5 5 0 0117 6a3.5 3.5 0 01.5 7" /><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3" /></I>,
  layers:   p => <I {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></I>,
  grid:     p => <I {...p}><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></I>,
  pause:    p => <I {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></I>,
  play:     p => <I {...p}><path d="M7 5l12 7-12 7z" /></I>,
  save:     p => <I {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7M8 21v-7h8v7" /></I>,
  undo:     p => <I {...p}><path d="M9 7L4 12l5 5" /><path d="M4 12h11a5 5 0 015 5" /></I>,
  erase:    p => <I {...p}><path d="M4 15l7-7 6 6-4 4H7z" /><path d="M21 20H9" /></I>,
  recenter: p => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></I>,
  sliders:  p => <I {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></I>,
  plus:     p => <I {...p}><path d="M12 5v14M5 12h14" /></I>,
  copy:     p => <I {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></I>,
  trash:    p => <I {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></I>,
  chevron:  p => <I {...p}><path d="M9 6l6 6-6 6" /></I>,
  chevDown: p => <I {...p}><path d="M6 9l6 6 6-6" /></I>,
  close:    p => <I {...p}><path d="M6 6l12 12M18 6L6 18" /></I>,
  check:    p => <I {...p}><path d="M5 12l5 5L20 6" /></I>,
  wind:     p => <I {...p}><path d="M3 8h11a2.5 2.5 0 100-5" /><path d="M3 12h16a2.5 2.5 0 110 5" /><path d="M3 16h8a2 2 0 110 4" /></I>,
  shadows:  p => <I {...p}><circle cx="9" cy="12" r="5" /><path d="M14.5 7.5a5 5 0 010 9" opacity="0.4" /></I>,
  image:    p => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></I>,
  upload:   p => <I {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></I>,
}

// ── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  label?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  fmt?: (v: number) => string
}

export function Slider({ label, value, min, max, step, onChange, fmt }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="ck-slider">
      {label && (
        <div className="ck-slider-top">
          <span className="ck-slider-label">{label}</span>
          <span className="ck-slider-val">{fmt ? fmt(value) : value}</span>
        </div>
      )}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="ck-range"
        style={{ background: `linear-gradient(90deg, var(--acc) 0%, var(--acc) ${pct}%, var(--track) ${pct}%, var(--track) 100%)` }}
      />
    </div>
  )
}

// ── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  label: string
  sub?: string
  checked: boolean
  onChange: (v: boolean) => void
}

export function Toggle({ label, sub, checked, onChange }: ToggleProps) {
  return (
    <button type="button" className={`ck-toggle-row${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}>
      <span className="ck-toggle-txt">
        <span className="ck-toggle-label">{label}</span>
        {sub && <span className="ck-toggle-sub">{sub}</span>}
      </span>
      <span className="ck-switch"><span className="ck-switch-knob" /></span>
    </button>
  )
}

// ── Segmented ────────────────────────────────────────────────────────────────

interface SegOption { value: string; label?: string; icon?: IconFn }
interface SegmentedProps { options: SegOption[]; value: string; onChange: (v: string) => void; full?: boolean }

export function Segmented({ options, value, onChange, full }: SegmentedProps) {
  return (
    <div className={`ck-seg${full ? ' full' : ''}`}>
      {options.map(o => (
        <button key={o.value} type="button"
          className={`ck-seg-btn${value === o.value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}>
          {o.icon && <o.icon s={16} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Btn ──────────────────────────────────────────────────────────────────────

interface BtnProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'solid' | 'ghost' | 'danger'
  icon?: IconFn
  full?: boolean
}

export function Btn({ children, onClick, variant = 'ghost', icon: Icon, full }: BtnProps) {
  return (
    <button type="button" onClick={onClick}
      className={`ck-btn ${variant}${full ? ' full' : ''}`}>
      {Icon && <Icon s={16} />}
      <span>{children}</span>
    </button>
  )
}

// ── FieldRow ─────────────────────────────────────────────────────────────────

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ck-field">
      <span className="ck-field-label">{label}</span>
      <div className="ck-field-ctrl">{children}</div>
    </div>
  )
}

// ── ColorDots ────────────────────────────────────────────────────────────────

interface ColorDotsProps { value: string; onChange: (v: string) => void; colors: string[] }

export function ColorDots({ value, onChange, colors }: ColorDotsProps) {
  return (
    <div className="ck-dots">
      {colors.map(c => (
        <button key={c} type="button"
          className={`ck-dot${value === c ? ' on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

// ── TextureSwatch ─────────────────────────────────────────────────────────────

interface TexSwatchProps { name: string; c1: string; c2: string; active: boolean; onClick: () => void }

export function TextureSwatch({ name, c1, c2, active, onClick }: TexSwatchProps) {
  return (
    <button type="button" title={name}
      className={`ck-tex${active ? ' on' : ''}`}
      onClick={onClick}>
      <span className="ck-tex-fill" style={{ background: `repeating-linear-gradient(45deg, ${c1} 0 6px, ${c2} 6px 12px)` }} />
      {active && <span className="ck-tex-ring" />}
    </button>
  )
}

// ── LightPresets ─────────────────────────────────────────────────────────────

interface LightPresetsProps { light: CockpitLight; setLight: (p: Partial<CockpitLight>) => void }

export function LightPresets({ light, setLight }: LightPresetsProps) {
  return (
    <div className="ck-presets">
      {LIGHT_PRESETS.map(p => (
        <button key={p.id} type="button"
          className={`ck-preset${light.preset === p.id ? ' on' : ''}`}
          onClick={() => setLight({ ...p, preset: p.id })}>
          <span className="ck-preset-sky"
            style={{ background: `linear-gradient(160deg, ${p.skyGrad[0]}, ${p.skyGrad[1]})` }} />
          <span className="ck-preset-name">{p.name}</span>
        </button>
      ))}
    </div>
  )
}

// ── relative time ────────────────────────────────────────────────────────────

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}
