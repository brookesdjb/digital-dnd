/**
 * Playwright performance profiler for the R3F battle map.
 *
 * Usage:
 *   TABLE_ID=<uuid> npm run profile
 *   TABLE_ID=<uuid> npm run profile -- --route=control
 *   TABLE_ID=<uuid> npm run profile -- --preset=ssao
 *   TABLE_ID=<uuid> npm run profile -- --trace   (also save CDP traces)
 *
 * Requires dev server running: npm run dev
 * Requires Supabase running:   supabase start
 */

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null
const has  = (name) => args.includes(`--${name}`)

// Auto-detect dev server port by trying common Next.js ports
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

const TABLE_ID  = process.env.TABLE_ID ?? flag('tableId')
const BASE_URL  = process.env.BASE_URL ?? null  // auto-detected below
const SAVE_TRACE = has('trace')

const WARMUP_TIMEOUT_MS = 35_000   // max time to wait for __perfStats.ready
const SAMPLE_MS         = 6_000    // how long to sample after warmup
const SAMPLE_INTERVAL   = 200      // ms between samples during measurement
const SAMPLES_NEEDED    = SAMPLE_MS / SAMPLE_INTERVAL

if (!TABLE_ID) {
  console.error('Error: TABLE_ID is required.')
  console.error('  TABLE_ID=<uuid> npm run profile')
  console.error('\nExisting tables (from remote Supabase):')
  console.error('  "new camp"     0e08ed8f-71f4-44b2-ba10-1c2a31018d53')
  console.error('  "Test Session" fec9b348-1c01-4218-a03a-50f98506602f')
  process.exit(1)
}

// ── Preset matrix ─────────────────────────────────────────────────────────────

const ALL_PRESETS = ['baseline', 'wind', 'rain', 'soft-shadows', 'ssao', 'full']
const ALL_ROUTES  = ['control', 'display']

const onlyPreset = flag('preset')
const onlyRoute  = flag('route')

const presets = onlyPreset ? [onlyPreset] : ALL_PRESETS
const routes  = onlyRoute  ? [onlyRoute]  : ALL_ROUTES

// ── Sampling ──────────────────────────────────────────────────────────────────

async function waitForReady(page, url) {
  const errors = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(err.message))

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

  const deadline = Date.now() + WARMUP_TIMEOUT_MS
  let lastStats = null
  let lastFrame = 0

  while (Date.now() < deadline) {
    await page.waitForTimeout(2000)
    const stats = await page.evaluate(() => window.__perfStats ?? null)
    lastStats = stats

    if (stats?.ready) return  // done

    const frames = stats?.sampleCount ?? 0
    const progress = frames > lastFrame
      ? `${frames} frames rendered, fps=${stats?.fps ?? 0}, ready=${stats?.ready}`
      : 'no frames yet'
    process.stdout.write(`\r  waiting... ${progress}                `)
    lastFrame = frames
  }

  process.stdout.write('\n')
  const errStr = errors.length ? `\nPage errors:\n  ${errors.slice(0, 5).join('\n  ')}` : ''
  throw new Error(
    `Warmup timed out. Last stats: ${JSON.stringify(lastStats)}${errStr}`
  )
}

async function collectSamples(page) {
  const collected = []
  for (let i = 0; i < SAMPLES_NEEDED; i++) {
    await page.waitForTimeout(SAMPLE_INTERVAL)
    const s = await page.evaluate(() => window.__perfStats)
    if (s) collected.push(s)
  }
  return collected
}

function aggregate(samples) {
  if (!samples.length) return null
  const fps    = samples.map(s => s.fps)
  const frameMs = samples.map(s => s.frameMs)
  const dc     = samples.map(s => s.drawCalls)
  const tris   = samples.map(s => s.triangles)
  const avg    = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const p5     = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * 0.05)]
  return {
    avgFps:    +avg(fps).toFixed(1),
    minFps:    Math.min(...fps),
    p5Fps:     p5(fps),
    avgFrameMs: +avg(frameMs).toFixed(1),
    p95FrameMs: +frameMs.slice().sort((a, b) => a - b)[Math.floor(frameMs.length * 0.95)].toFixed(1),
    drawCalls: Math.round(avg(dc)),
    triangles: Math.round(avg(tris)),
  }
}

// ── CDP trace analysis ────────────────────────────────────────────────────────

async function analyzeTrace(traceBuffer) {
  const { createGunzip } = await import('zlib')
  const { promisify }    = await import('util')
  const gunzip = promisify(createGunzip)

  let json
  try {
    const buf = await new Promise((res, rej) => {
      const chunks = []
      const stream = require('zlib').createGunzip()
      stream.on('data', c => chunks.push(c))
      stream.on('end', () => res(Buffer.concat(chunks)))
      stream.on('error', rej)
      stream.end(traceBuffer)
    })
    json = JSON.parse(buf.toString())
  } catch {
    return null
  }

  const events = json.traceEvents ?? []

  const longTasks = events
    .filter(e => e.name === 'RunTask' && e.dur > 50_000)
    .map(e => +(e.dur / 1000).toFixed(1))
    .sort((a, b) => b - a)

  const gcMs = events
    .filter(e => e.name === 'MajorGC' || e.name === 'MinorGC')
    .reduce((sum, e) => sum + (e.dur ?? 0), 0) / 1000

  const gpuStats = (() => {
    const gpuDurs = events
      .filter(e => e.name === 'GPUTask' && e.dur != null)
      .map(e => e.dur / 1000)
    if (!gpuDurs.length) return null
    gpuDurs.sort((a, b) => a - b)
    return {
      count:  gpuDurs.length,
      totalMs: +gpuDurs.reduce((a, b) => a + b, 0).toFixed(0),
      p95Ms:  +gpuDurs[Math.floor(gpuDurs.length * 0.95)].toFixed(2),
      maxMs:  +gpuDurs[gpuDurs.length - 1].toFixed(1),
    }
  })()

  return { longTasks: longTasks.slice(0, 5), gcMs: +gcMs.toFixed(1), gpu: gpuStats }
}

// ── Run one preset ────────────────────────────────────────────────────────────

async function profilePreset(browser, route, preset, baseUrl) {
  const url  = `${baseUrl}/${route}/${TABLE_ID}?preset=${preset}&perf=1`
  const page = await browser.newPage()

  if (SAVE_TRACE) await page.tracing.start({ screenshots: false, snapshots: true })

  try {
    await waitForReady(page, url)
    const samples   = await collectSamples(page)
    const stats     = aggregate(samples)

    let trace = null
    if (SAVE_TRACE) {
      const buf = await page.tracing.stop()
      trace = await analyzeTrace(buf)
    }

    return { preset, route, stats, trace, error: null }
  } catch (err) {
    if (SAVE_TRACE) { try { await page.tracing.stop() } catch {} }
    return { preset, route, stats: null, trace: null, error: err.message }
  } finally {
    await page.close()
  }
}

// ── Render results ────────────────────────────────────────────────────────────

function renderTable(results, route) {
  const rows = results.filter(r => r.route === route)
  if (!rows.length) return

  const col = (s, w) => String(s ?? '?').padStart(w)
  const lcol = (s, w) => String(s ?? '?').padEnd(w)

  const header = [
    lcol('Preset', 14),
    col('FPS avg', 8), col('FPS min', 8), col('FPS p5', 7),
    col('ms avg', 7), col('ms p95', 7),
    col('DrawCalls', 10), col('Triangles', 10),
  ].join('  ')

  const divider = '─'.repeat(header.length)
  console.log(`\n┌─ ${route.toUpperCase()} ─────────────────────────────────────────────────────────────────`)
  console.log(header)
  console.log(divider)

  let baseAvg = null
  for (const r of rows) {
    if (r.stats === null) {
      console.log(`${lcol(r.preset, 14)}  ERROR: ${r.error}`)
      continue
    }
    const s = r.stats
    if (r.preset === 'baseline') baseAvg = s.avgFps

    const fpsDelta = baseAvg != null && r.preset !== 'baseline'
      ? ` (${s.avgFps < baseAvg ? '-' : '+'}${Math.abs(s.avgFps - baseAvg).toFixed(1)})`
      : ''

    const row = [
      lcol(r.preset, 14),
      col(`${s.avgFps}${fpsDelta}`, 8 + fpsDelta.length), col(s.minFps, 8), col(s.p5Fps, 7),
      col(s.avgFrameMs, 7), col(s.p95FrameMs, 7),
      col(s.drawCalls, 10), col(`${(s.triangles / 1000).toFixed(0)}k`, 10),
    ].join('  ')
    console.log(row)

    if (r.trace) {
      const t = r.trace
      if (t.longTasks.length) console.log(`  ⚠ long tasks: ${t.longTasks.map(ms => `${ms}ms`).join(', ')}`)
      if (t.gcMs > 20)        console.log(`  ⚠ GC: ${t.gcMs}ms total`)
      if (t.gpu?.maxMs > 50)  console.log(`  ⚠ GPU spike: ${t.gpu.maxMs}ms max (p95: ${t.gpu.p95Ms}ms)`)
    }
  }
  console.log(divider)

  // Bottleneck summary
  if (baseAvg != null) {
    const costly = rows
      .filter(r => r.stats && r.preset !== 'baseline')
      .map(r => ({ preset: r.preset, delta: +(baseAvg - r.stats.avgFps).toFixed(1) }))
      .filter(r => r.delta > 1)
      .sort((a, b) => b.delta - a.delta)

    if (costly.length) {
      console.log('\nBottleneck analysis (FPS lost vs baseline):')
      for (const c of costly) {
        const bar = '█'.repeat(Math.min(Math.round(c.delta), 30))
        console.log(`  ${String(c.preset).padEnd(16)} -${String(c.delta).padStart(5)} fps  ${bar}`)
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Auto-detect dev server
  const baseUrl = BASE_URL ?? await findDevServer()
  if (!baseUrl) {
    console.error('Dev server not reachable on ports 3000-3004. Run: npm run dev')
    process.exit(1)
  }

  console.log(`\nR3F Battle Map — Performance Profiler`)
  console.log(`Server: ${baseUrl}  |  Table: ${TABLE_ID}`)
  console.log(`Routes: ${routes.join(', ')}  |  Presets: ${presets.join(', ')}`)
  console.log(`Sample window: ${SAMPLE_MS / 1000}s × ${SAMPLES_NEEDED} samples  |  Traces: ${SAVE_TRACE ? 'on' : 'off'}\n`)

  const browser = await chromium.launch({
    headless: false,  // visible window — helps diagnose WebGL/load issues
    args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'],
  })
  const results = []

  const total = routes.length * presets.length
  let done = 0

  for (const route of routes) {
    for (const preset of presets) {
      done++
      process.stdout.write(`[${done}/${total}] ${route}/${preset} ... `)
      const result = await profilePreset(browser, route, preset, baseUrl)
      results.push(result)
      if (result.error) {
        console.log(`ERROR: ${result.error}`)
      } else {
        const s = result.stats
        console.log(`${s.avgFps} fps avg  (${s.p5Fps} p5)  ${s.avgFrameMs}ms`)
      }
    }
  }

  await browser.close()

  // Print tables
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  console.log(`\n${'═'.repeat(80)}`)
  console.log(` R3F Battle Map — Profile Results  ${timestamp}`)
  console.log('═'.repeat(80))

  for (const route of routes) renderTable(results, route)

  console.log()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
