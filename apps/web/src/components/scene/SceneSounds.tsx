'use client'

import { useEffect, useRef, useState } from 'react'

// ── SceneSounds ───────────────────────────────────────────────────────────────
// Web Audio API sound engine for ambient rain + lightning-synced thunder.
//
// Autoplay strategy:
//   1. ctx.resume() is called immediately on mount — succeeds on Chrome/Firefox/
//      most TV browsers without any user gesture.
//   2. A pointerdown listener is attached as a fallback for iOS/Safari, where a
//      user gesture is always required.
//   3. If the context is still suspended after the initial attempt, a small
//      "Tap for audio" badge is shown so the user knows to tap once.
//
// Used on both the control (iPad) and display (TV) routes.

const RAIN_SRCS    = ['/sounds/rain1.mp3', '/sounds/rain2.mp3']
const THUNDER_SRCS = [
  '/sounds/thunder1.mp3', '/sounds/thunder2.mp3',
  '/sounds/thunder3.mp3', '/sounds/thunder4.mp3',
]

const THUNDER_BASE_S = 3.5  // avg seconds between strikes at intensity 1

interface SceneSoundsProps {
  rain:      number  // 0–2
  lightning: number  // 0–2
}

export function SceneSounds({ rain, lightning }: SceneSoundsProps) {
  const ctxRef       = useRef<AudioContext | null>(null)
  const rainGain     = useRef<GainNode | null>(null)
  const thunderBufs  = useRef<AudioBuffer[]>([])
  const thunderId    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lightningRef = useRef(lightning)
  useEffect(() => { lightningRef.current = lightning }, [lightning])

  // Whether to show the tap-to-unlock badge (only relevant on iOS display)
  const [needsTap, setNeedsTap] = useState(false)

  // ── Init: AudioContext + buffers ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    const ctx = new AudioContext()
    ctxRef.current = ctx

    const tryResume = () => {
      ctx.resume().then(() => {
        if (ctx.state === 'running') setNeedsTap(false)
      })
    }

    // 1. Try immediately — works on non-iOS browsers
    tryResume()

    // 2. Fallback: unlock on first user gesture (iOS Safari / iPadOS)
    const unlock = () => { tryResume(); setNeedsTap(false) }
    window.addEventListener('pointerdown', unlock, { once: true })

    // Show badge only if still suspended after 500 ms (iOS will stay suspended)
    const badgeTimer = setTimeout(() => {
      if (ctx.state === 'suspended') setNeedsTap(true)
    }, 500)

    // Rain: two looped sources through a shared GainNode
    const gn = ctx.createGain()
    gn.gain.value = 0
    gn.connect(ctx.destination)
    rainGain.current = gn

    async function loadBuf(url: string): Promise<AudioBuffer> {
      const resp = await fetch(url)
      const ab   = await resp.arrayBuffer()
      return ctx.decodeAudioData(ab)
    }

    RAIN_SRCS.forEach(url => {
      loadBuf(url).then(buf => {
        if (ctx.state === 'closed') return
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop   = true
        src.connect(gn)
        src.start()
      }).catch(() => {})
    })

    Promise.all(THUNDER_SRCS.map(loadBuf))
      .then(bufs => { thunderBufs.current = bufs })
      .catch(() => {})

    return () => {
      clearTimeout(badgeTimer)
      window.removeEventListener('pointerdown', unlock)
      ctx.close()
      ctxRef.current   = null
      rainGain.current = null
    }
  }, [])

  // ── Rain volume ────────────────────────────────────────────────────────────
  useEffect(() => {
    const gn  = rainGain.current
    const ctx = ctxRef.current
    if (!gn || !ctx) return
    gn.gain.setTargetAtTime(Math.min(rain, 2) * 0.45, ctx.currentTime, 0.3)
  }, [rain])

  // ── Thunder scheduling ─────────────────────────────────────────────────────
  useEffect(() => {
    if (thunderId.current) { clearTimeout(thunderId.current); thunderId.current = null }
    if (lightning <= 0) return

    function scheduleNext() {
      const li = lightningRef.current
      if (li <= 0) return
      const avgS   = THUNDER_BASE_S / li
      const delayS = Math.max(0.8, avgS * (0.5 + Math.random()))
      thunderId.current = setTimeout(() => {
        const bufs = thunderBufs.current
        const ctx  = ctxRef.current
        if (bufs.length > 0 && ctx && ctx.state !== 'closed') {
          const buf = bufs[Math.floor(Math.random() * bufs.length)]
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          src.start()
        }
        scheduleNext()
      }, delayS * 1000)
    }

    scheduleNext()
    return () => { if (thunderId.current) clearTimeout(thunderId.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightning > 0])

  // ── Tap-to-unlock badge (iOS display only) ─────────────────────────────────
  if (!needsTap) return null
  return (
    <div
      onClick={() => { ctxRef.current?.resume().then(() => setNeedsTap(false)) }}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 50,
        background: 'rgba(0,0,0,0.55)', color: '#fff',
        padding: '8px 14px', borderRadius: 8, fontSize: 13,
        cursor: 'pointer', backdropFilter: 'blur(4px)',
        userSelect: 'none',
      }}
    >
      🔇 Tap for audio
    </div>
  )
}
