'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

const WARMUP_FRAMES = 180
const ROLLING_WINDOW = 60

export interface PerfStats {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  minFps: number
  maxFps: number
  avgFps: number
  sampleCount: number
  ready: boolean
}

declare global {
  interface Window { __perfStats?: PerfStats }
}

export const perfStats: PerfStats = {
  fps: 0, frameMs: 0, drawCalls: 0, triangles: 0,
  minFps: Infinity, maxFps: 0, avgFps: 0,
  sampleCount: 0, ready: false,
}

// ── PerfSampler ───────────────────────────────────────────────────────────────
// Render inside <Canvas>. Samples stats each frame.

export function PerfSampler() {
  const { gl } = useThree()
  const lastRef    = useRef(performance.now())
  const frameCount = useRef(0)
  const fpsWindow  = useRef<number[]>([])

  useFrame(() => {
    const now = performance.now()
    const ms  = now - lastRef.current
    lastRef.current = now
    frameCount.current++

    const fps = Math.round(1000 / ms)

    // Rolling window for min/max/avg
    fpsWindow.current.push(fps)
    if (fpsWindow.current.length > ROLLING_WINDOW) fpsWindow.current.shift()

    const ring = fpsWindow.current
    const sum  = ring.reduce((a, b) => a + b, 0)

    perfStats.fps         = fps
    perfStats.frameMs     = +ms.toFixed(1)
    perfStats.drawCalls   = gl.info.render.calls
    perfStats.triangles   = gl.info.render.triangles
    perfStats.minFps      = Math.min(...ring)
    perfStats.maxFps      = Math.max(...ring)
    perfStats.avgFps      = +(sum / ring.length).toFixed(1)
    perfStats.sampleCount = frameCount.current
    perfStats.ready       = frameCount.current >= WARMUP_FRAMES

    globalThis.window.__perfStats = { ...perfStats }
  })

  return null
}

// ── PerformanceOverlay ────────────────────────────────────────────────────────
// Render outside <Canvas>. Reads perfStats via rAF — no React re-renders.

export function PerformanceOverlay() {
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let id: number
    const tick = () => {
      if (divRef.current) {
        const ready = perfStats.ready ? '' : ` (warmup ${perfStats.sampleCount}/${WARMUP_FRAMES})`
        divRef.current.textContent = [
          `FPS  ${perfStats.fps}  [${perfStats.minFps}–${perfStats.maxFps}]${ready}`,
          `ms   ${perfStats.frameMs}`,
          `dc   ${perfStats.drawCalls}`,
          `tris ${(perfStats.triangles / 1000).toFixed(0)}k`,
        ].join('\n')
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      ref={divRef}
      style={{
        position:      'fixed',
        bottom:        8,
        right:         8,
        zIndex:        9999,
        background:    'rgba(0,0,0,0.78)',
        color:         '#4ade80',
        fontFamily:    'monospace',
        fontSize:      11,
        padding:       '4px 9px',
        borderRadius:  4,
        whiteSpace:    'pre',
        lineHeight:    1.65,
        userSelect:    'none',
        pointerEvents: 'none',
      }}
    />
  )
}
