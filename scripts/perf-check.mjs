#!/usr/bin/env node
/**
 * Compare profiler results against a stored baseline.
 * Exits with code 1 if any preset drops below the threshold.
 *
 * Usage:
 *   node scripts/perf-check.mjs                              # uses defaults
 *   node scripts/perf-check.mjs --current=<path> --baseline=<path> --threshold=20
 *
 * Defaults:
 *   --current   /tmp/perf-ci-results.json
 *   --baseline  perf/baseline.json
 *   --threshold 15    (percent drop allowed before failure)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const args = process.argv.slice(2)
const flag = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null
const has  = (name) => args.includes(`--${name}`)

const CURRENT_PATH  = flag('current') || '/tmp/perf-ci-results.json'
const THRESHOLD_PCT = Number(flag('threshold') ?? process.env.PERF_THRESHOLD ?? 15)

// Auto-detect platform-specific baseline (perf/baseline-darwin.json, perf/baseline-linux.json)
// Falls back to perf/baseline.json
const BASE_DIR = resolve(import.meta.dirname, '..', 'perf')
function findBaseline() {
  const explicit = flag('baseline')
  if (explicit) return explicit
  const os = process.platform  // 'darwin' | 'linux' | 'win32'
  const osFile = resolve(BASE_DIR, `baseline-${os}.json`)
  const generic = resolve(BASE_DIR, 'baseline.json')
  if (existsSync(osFile)) return osFile
  return generic
}
const BASELINE_PATH = findBaseline()

const RED    = '\x1b[31m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'

function fail(msg) { console.error(`  ${RED}✖${RESET} ${msg}`) }
function pass(msg) { console.log(`  ${GREEN}✔${RESET} ${msg}`) }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`) }

// ── Load ────────────────────────────────────────────────────────────────────

for (const [label, p] of [['current', CURRENT_PATH], ['baseline', BASELINE_PATH]]) {
  if (!existsSync(p)) {
    console.error(`\n  ${RED}${BOLD}ERROR${RESET}: ${label} file not found: ${p}`)
    process.exit(1)
  }
}

const current  = JSON.parse(readFileSync(CURRENT_PATH, 'utf8'))
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

const threshold  = baseline.thresholdPct ?? THRESHOLD_PCT
const baseByName = new Map(baseline.results.map(r => [`${r.route}/${r.preset}`, r.stats]))
const curByName  = new Map(current.results.map(r => [`${r.route}/${r.preset}`, r.stats]))

// ── Compare ─────────────────────────────────────────────────────────────────

console.log(`\n  ${BOLD}Performance Check${RESET}`)
console.log(`  Threshold: >${threshold}% drop = fail`)
console.log(`  Baseline:  ${BASELINE_PATH}`)
console.log(`  Current:   ${CURRENT_PATH}`)
console.log()

const allKeys = new Set([...baseByName.keys(), ...curByName.keys()])
let failures = 0
let checks   = 0

// Column widths
const padPreset = (s) => String(s).padEnd(16)
const padVal    = (s) => String(s).padStart(7)

for (const key of [...allKeys].sort()) {
  const base = baseByName.get(key)
  const cur  = curByName.get(key)

  if (!base) { warn(`No baseline for ${key} — skipping`); continue }
  if (!cur)  { fail(`Missing result for ${key}`); failures++; continue }

  checks++
  const baseFps = base.avgFps
  const curFps  = cur.avgFps
  const pctDrop = baseFps > 0 ? ((baseFps - curFps) / baseFps * 100) : 0

  if (pctDrop > threshold) {
    failures++
    console.log([
      `  ${RED}✖${RESET}`,
      padPreset(key),
      `${padVal(curFps)} fps`,
      `(was ${padVal(baseFps)})`,
      `${RED}${BOLD}${pctDrop.toFixed(1)}% drop${RESET}`,
      `exceeds ${threshold}% threshold`,
    ].join('  '))
  } else if (pctDrop > threshold * 0.5) {
    // Warning zone — >50% of threshold
    console.log([
      `  ${YELLOW}⚠${RESET}`,
      padPreset(key),
      `${padVal(curFps)} fps`,
      `(was ${padVal(baseFps)})`,
      `${YELLOW}${pctDrop.toFixed(1)}% drop${RESET}`,
    ].join('  '))
  } else {
    const delta = curFps >= baseFps ? '+' : ''
    console.log([
      `  ${GREEN}✔${RESET}`,
      padPreset(key),
      `${padVal(curFps)} fps`,
      `(was ${padVal(baseFps)})`,
      `${delta}${(curFps - baseFps).toFixed(1)} (${delta}${pctDrop.toFixed(1)}%)`,
    ].join('  '))
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log()
const line = `  ${'─'.repeat(56)}`
console.log(line)

if (failures > 0) {
  console.log(`  ${RED}${BOLD}FAIL${RESET}  ${failures}/${checks} presets exceeded ${threshold}% regression threshold.`)
  console.log()
  console.log(`  Possible causes:`)
  console.log(`    • New feature added (more draw calls / heavier shaders)`)
  console.log(`    • Asset size increase (more polygons / larger textures)`)
  console.log(`    • Post-processing pipeline change (SSAO, bloom, etc.)`)
  console.log(`    • CI runner downgrade (different CPU/GPU than baseline machine)`)
  console.log()
  console.log(`  If the regression is expected (e.g. a deliberate trade-off for`)
  console.log(`  visual quality), update the baseline:`)
  console.log(`    cp ${CURRENT_PATH} ${BASELINE_PATH}`)
  console.log()
  process.exit(1)
} else {
  console.log(`  ${GREEN}${BOLD}PASS${RESET}  All ${checks} presets within ${threshold}% of baseline.`)
  console.log()
}