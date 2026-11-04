#!/usr/bin/env node
/* Seed Scent placeholder report.

   Reads js/config.js the same way the browser does (as a script that sets
   window.SEED_SCENT), then lists:
     1. every value that is still null (the site shows these as dashed [ chips ]),
     2. every photo the config points at that is not in images/,
     3. every "...Confirmed" flag that is still false.

   No dependencies. Run from anywhere:
     node tools/placeholders.mjs

   Exits 0 after a normal report: it is a checklist, not a test.
   Exits 1 only if js/config.js cannot be read or has a syntax error. */

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configRel = path.join('js', 'config.js')

/* Fields that may stay null on purpose. Everything else is expected to be filled. */
const OPTIONAL = {
  'contact.phone': 'not shown on the site unless you want it',
  'contact.tiktok': 'not shown on the site unless you want it',
  'contact.linkedin': 'not shown on the site unless you want it',
  'marketplaceUrl': 'only if the firm has a VE marketplace store',
  'checkout.gatewayUrl': 'only if checkout.mode is "gateway"',
  'product.fixativeName': 'leave null to keep "a natural, plant-based fixative"',
}

function loadConfig() {
  const src = readFileSync(path.join(root, configRel), 'utf8')
  const window = {}
  vm.runInNewContext(src, { window }, { filename: configRel, timeout: 1000 })
  const cfg = window.SEED_SCENT
  if (!cfg || typeof cfg !== 'object') throw new Error(`${configRel} ran, but did not set window.SEED_SCENT`)
  return cfg
}

const nulls = []        // { path, optional }
const photos = []       // { path, file, present, bytes }
const unconfirmed = []  // dotted paths of ...Confirmed === false

function walk(value, trail) {
  const dotted = trail.join('.')
  if (value === null || value === '') {
    nulls.push({ path: dotted, empty: value === '', optional: OPTIONAL[dotted] })
    return
  }
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, [...trail, i])); return }
  if (typeof value === 'object') { for (const k of Object.keys(value)) walk(value[k], [...trail, k]); return }
  if (typeof value === 'string' && /^images\//i.test(value)) {
    let bytes = -1
    try { const st = statSync(path.join(root, value)); if (st.isFile()) bytes = st.size } catch {}
    photos.push({ path: dotted, file: value, present: bytes > 0, bytes })
    return
  }
  if (value === false && /confirmed$/i.test(String(trail[trail.length - 1]))) unconfirmed.push(dotted)
}

let cfg
try {
  cfg = loadConfig()
} catch (err) {
  console.log('Seed Scent placeholder report')
  console.log('')
  console.log(`Could not read ${configRel}.`)
  console.log(`  ${err && err.name === 'SyntaxError' ? 'Syntax error' : 'Error'}: ${err.message}`)
  if (err && err.stack) {
    const where = String(err.stack).split('\n').find(l => l.includes(configRel + ':'))
    if (where) console.log(`  ${where.trim()}`)
  }
  console.log('  Usual causes: a missing comma, a missing quote, or a stray character.')
  process.exit(1)
}

walk(cfg, [])

const required = nulls.filter(n => !n.optional)
const optional = nulls.filter(n => n.optional)
const missing = photos.filter(p => !p.present)

console.log('Seed Scent placeholder report')
console.log(`Config: ${configRel}`)
console.log('')

console.log('Still null (shows on the site as a dashed [ chip ]):')
if (!required.length) console.log('  none. Every required fact is filled in.')
for (const n of required) console.log(`  ${n.path}${n.empty ? '   (empty text, counts as a placeholder)' : ''}`)
if (optional.length) {
  console.log('')
  console.log('Optional, fine to leave null:')
  for (const n of optional) console.log(`  ${n.path}   (${n.optional})`)
}
console.log('')

console.log('Photos the config points at:')
if (!photos.length) console.log('  none referenced.')
for (const p of photos) {
  const state = p.present ? `ok, ${Math.round(p.bytes / 1024)} KB` : 'MISSING'
  console.log(`  ${p.path.padEnd(16)} ${p.file.padEnd(30)} ${state}`)
}
console.log('')

console.log('Marked unconfirmed (set to true once the team signs off):')
if (!unconfirmed.length) console.log('  none.')
for (const u of unconfirmed) console.log(`  ${u}`)
console.log('')

console.log(`Total: ${required.length} placeholders to fill, ${optional.length} optional, ${missing.length} of ${photos.length} photos missing, ${unconfirmed.length} to confirm.`)
process.exit(0)
