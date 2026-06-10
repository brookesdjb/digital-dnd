#!/usr/bin/env node
/**
 * CI-compatible performance profiler for the R3F battle map.
 *
 * Runs ALL presets sequentially in headless mode with SwiftShader
 * (software WebGL), producing a single consolidated table + JSON output.
 *
 * Usage:
 *   TABLE_ID=<uuid> node scripts/perf-ci.mjs
 *   TABLE_ID=<uuid> node scripts/perf-ci.mjs --route=control
 *   TABLE_ID=<uuid> node scripts/perf-ci.mjs --route=display --preset=ssao
 *
 * The dev server must already be running on port 3000–3004.
 * Output: table to stdout + /tmp/perf-ci-results.json
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'fs'

// ── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null
const has  = (name) => args.includes(`--${name}`)

async function findDevServer() {
  const { default: http } = await import('http')
  for (const port of [3000, 3001, 3002, 3003, 3004]) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(`http://localhost:${port}`, r => { r.resume(); res(port) })
        req.on('error', rej)
        req.setTimeout(800, () => { req.destroy(); rej(new Error('timeout')) })
      })
      return `http://localhost:${port}`
    } catch {}
  }
  return null
}

// ── Presets ──────────────────────────────────────────────────────────────────

const ALL_PRESETS = ['baseline', 'wind', 'rain', 'soft-shadows', 'ssao', 'full']
const ALL_ROUTES  = ['control', 'display']

const TABLE_ID   = process.env.TABLE_ID ?? flag('tableId')
const BASE_URL   = process.env.BASE_URL ?? null
const onlyPreset = flag('preset')
const onlyRoute  = flag('route')
// CI_PRESETS / CI_ROUTES let the workflow narrow the run without changing defaults
const ciPresets  = process.env.CI_PRESETS?.split(',').map(s => s.trim()).filter(Boolean)
const ciRoutes   = process.env.CI_ROUTES?.split(',').map(s => s.trim()).filter(Boolean)
const presets    = onlyPreset ? [onlyPreset] : (ciPresets ?? ALL_PRESETS)
const routes     = onlyRoute  ? [onlyRoute]  : (ciRoutes  ?? ALL_ROUTES)

const WARMUP_TIMEOUT_MS = Number(process.env.PERF_WARMUP_TIMEOUT ?? 90_000)
const SAMPLE_MS         = 5_000
const SAMPLE_INTERVAL   = 200
const SAMPLES_NEEDED    = SAMPLE_MS / SAMPLE_INTERVAL

if (!TABLE_ID) {
  console.error('Error: TABLE_ID is required.')
  console.error('  TABLE_ID=<uuid> node scripts/perf-ci.mjs')
  process.exit(1)
}

// ── Sampling ────────────────────────────────────────────────────────────────

// page.evaluate() hangs indefinitely if the browser's JS thread is blocked
// (e.g. SwiftShader compiling GLSL shaders on the CPU). Wrap with a Node.js
// timeout so the warmup deadline check can actually run.
function evalWithTimeout(page, fn, ms = 5_000) {
  return Promise.race([
    page.evaluate(fn),
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

async function waitForReady(page, url) {
  const errors = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(err.message))

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  // Wait until the page has rendered at least one frame (any stats at all).
  // We avoid the 180-frame warmup from PerformanceHUD.tsx because software
  // WebGL (SwiftShader on Linux CI) is too slow to reach it in a reasonable time.
  const deadline = Date.now() + WARMUP_TIMEOUT_MS
  let lastStats = null
  let lastFrame = 0
  let spinner = 0
  const spin = () => ['⢎', '⠢', '⡱', '⢔'][spinner++ % 4]

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const stats = await evalWithTimeout(page, () => window.__perfStats ?? null)
    lastStats = stats

    // Accept any non-null stats — don't wait for the 180-frame warmup flag
    if (stats && stats.sampleCount > 0) {
      process.stdout.write(`\r  ${spin()} sampling after ${stats.sampleCount} frames, fps=${stats.fps}          \n`)
      return
    }

    const frames = stats?.sampleCount ?? 0
    const progress = frames > lastFrame
      ? `${frames} frames, fps=${stats?.fps ?? 0}`
      : 'waiting for WebGL...'
    process.stdout.write(`\r  ${spin()} ${progress}                    `)
    lastFrame = frames
  }

  process.stdout.write('\n')
  const errStr = errors.length ? `\n  Page errors:\n    ${errors.slice(0, 5).join('\n    ')}` : ''
  throw new Error(
    `Warmup timed out after ${WARMUP_TIMEOUT_MS / 1000}s. ` +
    `Last stats: ${JSON.stringify(lastStats)}${errStr}`
  )
}

async function collectSamples(page) {
  const collected = []
  for (let i = 0; i < SAMPLES_NEEDED; i++) {
    await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL))
    const s = await evalWithTimeout(page, () => window.__perfStats, 2_000)
    if (s) collected.push(s)
  }
  return collected
}

function aggregate(samples) {
  if (!samples.length) return null
  const fps     = samples.map(s => s.fps)
  const frameMs = samples.map(s => s.frameMs)
  const dc      = samples.map(s => s.drawCalls)
  const tris    = samples.map(s => s.triangles)
  const avg     = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const p5      = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * 0.05)]
  return {
    avgFps:    +avg(fps).toFixed(1),
    minFps:    Math.min(...fps),
    p5Fps:     p5(fps),
    avgFrameMs: +avg(frameMs).toFixed(1),
    p95FrameMs: +frameMs.slice().sort((a, b) => a - b)[Math.floor(frameMs.length * 0.95)].toFixed(1),
    drawCalls: Math.round(avg(dc)),
    triangles: Math.round(avg(tris)),
    samples:   samples.length,
  }
}
// ── Render ──────────────────────────────────────────────────────────────────

function renderResults(allResults) {
  for (const route of routes) {
    const rows = allResults.filter(r => r.route === route)
    if (!rows.length) continue

    const col   = (s, w) => String(s ?? '?').padStart(w)
    const lcol  = (s, w) => String(s ?? '?').padEnd(w)

    const header = [
      lcol('Preset', 14),
      col('FPS avg', 8), col('FPS min', 8), col('FPS p5', 7),
      col('ms avg', 7), col('ms p95', 7),
      col('DrawCalls', 10), col('Triangles', 10),
    ].join('  ')

    const divider = '─'.repeat(header.length)
    console.log(`\n┌─ ${route.toUpperCase()} ─${divider.slice(4 + route.length)}`)
    console.log(header)
    console.log(divider)

    let baseAvg = null
    for (const r of rows) {
      if (r.stats === null) {
        console.log(`${lcol(r.preset, 14)}  FAIL: ${r.error}`)
        continue
      }
      const s = r.stats
      if (r.preset === 'baseline') baseAvg = s.avgFps

      const fpsDelta = baseAvg != null && r.preset !== 'baseline'
        ? ` (${s.avgFps < baseAvg ? '-' : '+'}${Math.abs(s.avgFps - baseAvg).toFixed(1)})`
        : ''

      const row = [
        lcol(r.preset, 14),
        col(`${s.avgFps}${fpsDelta}`, 8 + fpsDelta.length),
        col(s.minFps, 8),
        col(s.p5Fps, 7),
        col(s.avgFrameMs, 7),
        col(s.p95FrameMs, 7),
        col(s.drawCalls, 10),
        col(`${(s.triangles / 1000).toFixed(0)}k`, 10),
      ].join('  ')
      console.log(row)
    }
    console.log(divider)

    if (baseAvg != null) {
      const costly = rows
        .filter(r => r.stats && r.preset !== 'baseline')
        .map(r => ({ preset: r.preset, delta: +(baseAvg - r.stats.avgFps).toFixed(1) }))
        .filter(r => r.delta > 0.5)
        .sort((a, b) => b.delta - a.delta)

      if (costly.length) {
        console.log('\n  Cost vs baseline:')
        for (const c of costly) {
          const bar = '█'.repeat(Math.min(Math.round(c.delta * 2), 50))
          console.log(`    ${String(c.preset).padEnd(16)} ${c.delta > 0 ? '-' : '+'}${Math.abs(c.delta).toFixed(1)} fps  ${bar}`)
        }
      } else {
        console.log('\n  No measurable bottleneck — all presets within 0.5 fps of baseline.')
      }
    }

    const minFpsAll = rows.filter(r => r.stats).map(r => r.stats.minFps)
    if (minFpsAll.length) {
      const worst = Math.min(...minFpsAll)
      if (worst < 20) {
        console.log(`\n  ⚠ Warning: min FPS across all presets = ${worst} (below 20)`)
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const baseUrl = BASE_URL ?? await findDevServer()
  if (!baseUrl) {
    console.error('❌ Dev server not reachable on ports 3000-3004.')
    console.error('   Start it with: npm run dev')
    process.exit(1)
  }

  console.log()
  console.log(`  ╔══════════════════════════════════════════════╗`)
  console.log(`  ║   R3F Battle Map — CI Performance Profiler  ║`)
  console.log(`  ╚══════════════════════════════════════════════╝`)
  console.log()
  console.log(`  Server:  ${baseUrl}`)
  console.log(`  Table:   ${TABLE_ID}`)
  console.log(`  Routes:  ${routes.join(', ')}`)
  console.log(`  Presets: ${presets.join(', ')}`)
  console.log(`  Headless: true (SwiftShader software WebGL)`)
  console.log(`  Warmup:  ${WARMUP_TIMEOUT_MS / 1000}s max per preset (set PERF_WARMUP_TIMEOUT to adjust)`)
  console.log(`  Sample:  ${SAMPLE_MS / 1000}s per preset`)
  console.log()

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  })

  const results = []
  const total = routes.length * presets.length
  let done = 0
  const startTime = Date.now()

  for (const route of routes) {
    for (const preset of presets) {
      done++
      console.log(`  [${done}/${total}] ${route}/${preset}`)

      const url = `${baseUrl}/${route}/${TABLE_ID}?preset=${preset}&perf=1`

      // Create a fresh page per preset so a frozen context from one preset
      // can't block subsequent navigations on the same page.
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

      try {
        await waitForReady(page, url)
        const samples = await collectSamples(page)
        const stats   = aggregate(samples)

        results.push({ route, preset, stats, error: null })

        if (stats) {
          const fpsMsg = `avg=${stats.avgFps}  min=${stats.minFps}  p5=${stats.p5Fps}  ms=${stats.avgFrameMs}  dc=${stats.drawCalls}  tris=${(stats.triangles / 1000).toFixed(0)}k`
          console.log(`    ✔ ${fpsMsg}`)
        }
      } catch (err) {
        results.push({ route, preset, stats: null, error: err.message })
        console.log(`    ✖ FAIL: ${err.message}`)
      } finally {
        await page.close().catch(() => {})
      }
    }
  }
  await browser.close()

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)

  // ── Save JSON ────────────────────────────────────────────────────────────
  const jsonPath = '/tmp/perf-ci-results.json'
  const output = {
    timestamp: new Date().toISOString(),
    tableId: TABLE_ID,
    baseUrl,
    elapsedSeconds: Number(elapsed),
    results,
  }
  writeFileSync(jsonPath, JSON.stringify(output, null, 2))

  // ── Print results ────────────────────────────────────────────────────────
  console.log()
  console.log(`  ${'═'.repeat(74)}`)
  console.log(`  RESULTS  (${elapsed}s total)`)
  console.log(`  ${'═'.repeat(74)}`)

  renderResults(results)

  console.log()
  console.log(`  JSON saved: ${jsonPath}`)
  console.log()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})