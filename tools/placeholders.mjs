#!/usr/bin/env node
/* Seed Scent placeholder report.

   Reads js/config.js the same way the browser does (as a script that sets
   window.SEED_SCENT), then lists:
     1. every value that is still null (the site shows these as dashed [ chips ]),
        including a required line that was deleted from a scent, tier or team entry,
     2. values that look wrong: a price in quotes, an unknown checkout.mode, a store
        or gateway address that the mode needs but is not set, a bad currency code,
        the wrong number of scents or tiers, an empty team,
     3. every photo the config points at that is not in images/, checked by exact
        file name so a capitals mismatch is caught here and not on the web host,
     4. every "...Confirmed" flag that is still false, and what setting it true removes.

   No dependencies. Run from anywhere:
     node tools/placeholders.mjs
   To check a copy of the config before you paste it in:
     node tools/placeholders.mjs path/to/config-copy.js

   Exits 0 after a normal report: it is a checklist, not a test.
   Exits 1 only if the config cannot be read or has a syntax error. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configArg = process.argv[2]
const configFile = configArg ? path.resolve(process.cwd(), configArg) : path.join(root, 'js', 'config.js')
const configName = configArg || path.join('js', 'config.js')

/* Fields that may stay null on purpose. Everything else is expected to be filled. */
const OPTIONAL = {
  'contact.phone': 'not shown on the site unless you want it',
  'contact.tiktok': 'not shown on the site unless you want it',
  'contact.linkedin': 'not shown on the site unless you want it',
  'product.fixativeName': 'leave null to keep "a natural, plant-based fixative"',
}

/* Lines every entry in these lists must have. A deleted line counts as a placeholder. */
const REQUIRED_KEYS = {
  scents: ['name', 'notes', 'price', 'packSize', 'image', 'imageVent'],
  bulkTiers: ['min', 'label', 'price'],
  team: ['name', 'role', 'bio', 'photo'],
}

/* How many entries the pages are typeset for. */
const COUNTS = {
  scents: { exactly: 3, why: 'the home page is typeset for three cards' },
  bulkTiers: { exactly: 4, why: 'the tier list is typeset for four rows (1 to 9, 10+, 50+, 100+)' },
  team: { atLeast: 1, why: 'the team page needs at least one person' },
}

const MODES = ['email', 'marketplace', 'gateway']

/* What each flag removes from the page once it is set to true. */
const FLAG_REMOVES = {
  'tiersConfirmed': 'the "tiers tbc" tag next to the quantity slider in the firms section',
  'product.seedsConfirmed': 'the "tbc" tag after "Wildflower mix" in the spec sheet',
  'product.formatConfirmed': 'the "tbc" tags on the format pickers, the Holder, Mounts and End of life rows, and the two photo captions',
  'product.plantingConfirmed': 'the "Steps are a draft until the team confirms them" note above the planting steps',
}

function loadConfig() {
  const src = readFileSync(configFile, 'utf8')
  const window = {}
  vm.runInNewContext(src, { window }, { filename: configName, timeout: 1000 })
  const cfg = window.SEED_SCENT
  if (!cfg || typeof cfg !== 'object') throw new Error(`${configName} ran, but did not set window.SEED_SCENT`)
  return cfg
}

/* ---------- what the report collects ---------- */
const nulls = []   // { path, note, missing, optional }   optional: the reason it may stay null
const wrong = []   // { path, text }
const photos = []  // { path, file, state, ok }
const flags = []   // { path, removes }

const isBlank = v => v === null || v === undefined || v === ''
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const emptyNote = v => (v === '' ? 'empty text, counts as a placeholder' : '')

/* a value as the student typed it, kept short */
function show(v) {
  if (v === undefined) return 'missing'
  if (v === null) return 'null'
  const s = typeof v === 'string' || typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 44 ? s.slice(0, 40) + '...' : s
}

/* ---------- photos: any key named photo or image ---------- */
const dirCache = new Map()
function filesIn(dirRel) {   // file names in a folder under the site root, or null if there is no such folder
  if (!dirCache.has(dirRel)) {
    let names = null
    try { names = readdirSync(path.join(root, dirRel)) } catch { /* no folder */ }
    dirCache.set(dirRel, names)
  }
  return dirCache.get(dirRel)
}
const stem = name => name.replace(/\.[^.]*$/, '')

function checkPhoto(dotted, value) {
  if (isBlank(value)) { nulls.push({ path: dotted, note: emptyNote(value) }); return }
  if (typeof value !== 'string') { wrong.push({ path: dotted, text: `is ${show(value)}. Use the file name in quotes: "images/photo.jpg"` }); return }
  const photo = { path: dotted, file: value, ok: false, state: 'MISSING' }
  photos.push(photo)
  if (value.includes('\\')) { photo.state = 'use forward slashes: images/photo.jpg'; return }
  if (!value.startsWith('images/')) { photo.state = 'must start with images/'; return }
  const dir = path.posix.dirname(value), base = path.posix.basename(value)
  const names = filesIn(dir)
  if (!names) { photo.state = `MISSING (there is no ${dir}/ folder)`; return }
  if (names.includes(base)) {
    let bytes = -1
    try { const st = statSync(path.join(root, value)); bytes = st.isFile() ? st.size : -1 } catch { /* unreadable */ }
    if (bytes > 0) { photo.ok = true; photo.state = `ok, ${Math.max(1, Math.round(bytes / 1024))} KB` }
    else photo.state = bytes === 0 ? 'the file is empty, 0 KB' : 'that is a folder, not a file'
    return
  }
  const capitals = names.find(n => n.toLowerCase() === base.toLowerCase())
  if (capitals) { photo.state = `found as ${capitals}: fix the capitals, web hosts care`; return }
  const ext = names.find(n => stem(n).toLowerCase() === stem(base).toLowerCase())
  if (ext) { photo.state = `found as ${ext}: fix the file extension`; return }
}

/* ---------- flags: any key ending in Confirmed ---------- */
function checkFlag(dotted, value) {
  if (value === true) return
  if (value === false) { flags.push({ path: dotted, removes: FLAG_REMOVES[dotted] || 'the "tbc" tag it is tied to' }); return }
  wrong.push({ path: dotted, text: `is ${show(value)}. Use true or false without quotes.` })
}

/* ---------- prices on scents and tiers ---------- */
function checkPrice(dotted, value) {
  if (isBlank(value)) { nulls.push({ path: dotted, note: emptyNote(value) }); return }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) wrong.push({ path: dotted, text: `is ${value}. A price cannot be below zero.` })
    return
  }
  const quoted = typeof value === 'string' ? ' (text in quotes)' : ''
  wrong.push({ path: dotted, text: `is ${show(value)}${quoted}. Prices are numbers without quotes: price: 4.5` })
}

/* The same reading of an address as emailAddress() in js/ui.js; keep the two in step. */
function emailAddress(v) {
  if (typeof v !== 'string') return null
  const e = v.trim().replace(/^mailto:/i, '').trim().replace(/\.$/, '')
  return /^[^\s@?&#:<>,;\/]+@(?:[A-Za-z0-9\u00a1-\uffff-]+\.)+[A-Za-z\u00a1-\uffff]{2,}$/.test(e) ? e : null
}
function checkEmail(dotted, value) {
  if (isBlank(value)) { nulls.push({ path: dotted, note: emptyNote(value), optional: OPTIONAL[dotted] }); return }
  if (!emailAddress(value)) {
    wrong.push({ path: dotted, text: `is ${show(value)}. It should be the address on its own in quotes, like "orders@school.org". Until it is, the site keeps the chip and sends no order email.` })
  }
}

/* The same reading of a handle as instagramHandle() in js/ui.js; keep the two in step. */
const IG_PAGES = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'share', 'about', 'legal', 'developer', 'directory', 'web', 'challenge', '_u', '_n']
function instagramHandle(v) {
  if (typeof v !== 'string') return null
  let h = v.trim()
  const m = h.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)(?:\/(?:reels|tagged|feed)?)?\/?(?:[?#]\S*)?$/i)
  if (m) h = m[1]
  else if (/instagram\./i.test(h)) return null
  h = h.replace(/^@/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h) || h.startsWith('.') || h.endsWith('.') || h.includes('..')) return null
  return IG_PAGES.includes(h.toLowerCase()) ? null : h
}
function checkInstagram(dotted, value) {
  if (isBlank(value)) { nulls.push({ path: dotted, note: emptyNote(value), optional: OPTIONAL[dotted] }); return }
  if (!instagramHandle(value)) {
    wrong.push({ path: dotted, text: `is ${show(value)}. Use the handle on its own in quotes, like "seedscent.ve" (letters, numbers, dots and underscores, 30 at most), or paste the link to the profile itself. Until it is, the site keeps the chip.` })
  }
}

/* ---------- checkout mode and the addresses it needs ---------- */
let MODE = { raw: undefined, valid: false, mode: null }
function readMode(cfg) {
  const raw = isObj(cfg.checkout) ? cfg.checkout.mode : undefined
  const lower = typeof raw === 'string' ? raw.toLowerCase() : raw
  const valid = MODES.includes(lower)
  return { raw, valid, mode: valid ? lower : null }
}
const urlProblem = v => (typeof v !== 'string' ? `is ${show(v)}. Put the web address in quotes.` : /^https?:\/\//i.test(v.trim()) ? null : `is ${show(v)}. A web address starts with https://`)

const SPECIAL = {
  'checkout.mode': v => {
    if (MODE.valid) return
    const hint = isBlank(v) ? ' The site behaves as "email" until it is set.' : ''
    wrong.push({ path: 'checkout.mode', text: `is ${show(v)}. Use one of "email", "marketplace" or "gateway".${hint}` })
  },
  'marketplaceUrl': v => {
    if (!isBlank(v)) { const p = urlProblem(v); if (p) wrong.push({ path: 'marketplaceUrl', text: p }); return }
    if (MODE.mode === 'marketplace') wrong.push({ path: 'marketplaceUrl', text: `is ${show(v)} but checkout.mode is "marketplace". Paste the link to the firm's VE marketplace store, or change the mode.` })
    else nulls.push({ path: 'marketplaceUrl', optional: 'only if the firm has a VE marketplace store; the marketplace button stays greyed out until then' })
  },
  'checkout.gatewayUrl': v => {
    if (!isBlank(v)) { const p = urlProblem(v); if (p) wrong.push({ path: 'checkout.gatewayUrl', text: p }); return }
    if (MODE.mode === 'gateway') wrong.push({ path: 'checkout.gatewayUrl', text: `is ${show(v)} but checkout.mode is "gateway". Paste the payment address VE gave the firm, or change the mode.` })
    else nulls.push({ path: 'checkout.gatewayUrl', optional: 'only used when checkout.mode is "gateway"' })
  },
  'currency': v => {
    if (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v)) return
    wrong.push({ path: 'currency', text: `is ${show(v)}. Use a 3-letter code such as "USD".` })
  },
}
const seen = new Set()

/* ---------- the walk over the whole config ---------- */
function walk(value, trail) {
  const key = trail.length ? String(trail[trail.length - 1]) : ''
  const dotted = trail.join('.')
  const parent = trail.slice(0, -1).join('.')
  if (dotted in SPECIAL) { seen.add(dotted); SPECIAL[dotted](value); return }
  if (/^(photo|image|imageVent)$/i.test(key)) return checkPhoto(dotted, value)
  if (/confirmed$/i.test(key)) return checkFlag(dotted, value)
  if (key === 'price' && /^(scents|bulkTiers|shop)\.\d+$/.test(parent)) return checkPrice(dotted, value)
  if (dotted === 'contact.email') return checkEmail(dotted, value)
  if (dotted === 'contact.instagram') return checkInstagram(dotted, value)
  if (isBlank(value)) { nulls.push({ path: dotted, note: emptyNote(value), optional: OPTIONAL[dotted] }); return }
  if (Array.isArray(value)) {
    const need = REQUIRED_KEYS[dotted]
    value.forEach((entry, i) => {
      if (need) {
        if (!isObj(entry)) { wrong.push({ path: `${dotted}.${i}`, text: `is ${show(entry)}. Each entry is a set of lines inside { } like the others.` }); return }
        for (const k of need) if (!(k in entry)) nulls.push({ path: `${dotted}.${i}.${k}`, missing: k })
      }
      walk(entry, [...trail, i])
    })
    return
  }
  if (typeof value === 'object') { for (const k of Object.keys(value)) walk(value[k], [...trail, k]) }
}

function checkCounts(cfg) {
  for (const [key, rule] of Object.entries(COUNTS)) {
    const list = cfg[key]
    if (list === undefined) { wrong.push({ path: key, text: `is missing. Put the list back in [ ] like the one that shipped.` }); continue }
    if (isBlank(list)) continue   // already in the null list
    if (!Array.isArray(list)) { wrong.push({ path: key, text: `is ${show(list)}. It should be a list in [ ] like the one that shipped.` }); continue }
    const n = list.length, word = n === 1 ? 'entry' : 'entries'
    if (rule.exactly !== undefined && n !== rule.exactly) wrong.push({ path: key, text: `has ${n} ${word}, ${rule.why}: keep exactly ${rule.exactly}.` })
    if (rule.atLeast !== undefined && n < rule.atLeast) wrong.push({ path: key, text: `has ${n} ${word}, ${rule.why}.` })
  }
}

/* ---------- run ---------- */
let cfg
try {
  cfg = loadConfig()
} catch (err) {
  console.log('Seed Scent placeholder report')
  console.log('')
  console.log(`Could not read ${configName}.`)
  console.log(`  ${err && err.name === 'SyntaxError' ? 'Syntax error' : 'Error'}: ${err.message}`)
  if (err && err.stack) {
    const where = String(err.stack).split('\n').find(l => l.includes(configName + ':'))
    if (where) console.log(`  ${where.trim()}`)
  }
  if (err && err.code === 'ENOENT') console.log('  There is no file at that path. Check the spelling, or run the report with no path to check js/config.js.')
  else console.log('  Usual causes: a missing comma, a missing quote, or a stray character.')
  process.exit(1)
}

MODE = readMode(cfg)
walk(cfg, [])
for (const p of Object.keys(SPECIAL)) if (!seen.has(p)) SPECIAL[p](undefined)   // the line was deleted
checkCounts(cfg)

/* a scent whose two photos are the same file: the card would label the mirror cord photo "Vent clip" */
;(Array.isArray(cfg.scents) ? cfg.scents : []).forEach((s, i) => {
  if (!isObj(s) || typeof s.image !== 'string' || typeof s.imageVent !== 'string') return
  if (s.image.trim() && s.image.trim() === s.imageVent.trim()) wrong.push({ path: `scents.${i}.imageVent`, text: `is the same file as scents.${i}.image. Give the vent clip its own photo; until then the card shows the mirror cord photo under the label "Vent clip".` })
})

/* the shop list (shop.html): the lines the Shop page would leave out, and what a product of its own
   still needs. A line with scent and format borrows everything from that scent. */
if (cfg.shop !== undefined && !isBlank(cfg.shop)) {
  if (!Array.isArray(cfg.shop)) wrong.push({ path: 'shop', text: `is ${show(cfg.shop)}. It should be a list in [ ] like the one that shipped.` })
  else {
    const ids = new Set(), nScents = Array.isArray(cfg.scents) ? cfg.scents.length : 0
    const which = nScents ? `Use ${Array.from({ length: nScents }, (_, k) => k).join(', ').replace(/, (\d+)$/, ' or $1')} for the scent in that place in the scents list` : 'Use the place of a scent in the scents list'
    cfg.shop.forEach((p, i) => {
      if (!isObj(p)) { wrong.push({ path: `shop.${i}`, text: `is ${show(p)}. Each entry is a set of lines inside { } like the others; the Shop page leaves it out.` }); return }
      const id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id).trim() : ''
      if (p.scent != null) {
        const n = typeof p.scent === 'number' ? p.scent : typeof p.scent === 'string' && /^\d+$/.test(p.scent.trim()) ? Number(p.scent) : NaN
        if (!Number.isInteger(n) || n < 0 || n >= nScents) wrong.push({ path: `shop.${i}.scent`, text: `is ${show(p.scent)}. ${which} (0 is the first); the Shop page leaves this line out.` })
        if (p.format !== 'mirror' && p.format !== 'vent') wrong.push({ path: `shop.${i}.format`, text: `is ${show(p.format)}. Use "mirror" or "vent"; the Shop page leaves this line out.` })
      } else {
        for (const k of ['name', 'price', 'image']) if (!(k in p)) nulls.push({ path: `shop.${i}.${k}`, missing: k })
      }
      if (!id) wrong.push({ path: `shop.${i}.id`, text: `is ${show(p.id)}. Give every shop line its own id in quotes, like "refill-pack"; the Shop page leaves this one out.` })
      else if (ids.has(id)) wrong.push({ path: `shop.${i}.id`, text: `"${id}" is used twice. Every id must be different; the Shop page shows only the first line with it that works.` })
      else ids.add(id)
    })
  }
}

/* ---------- print ---------- */
const required = nulls.filter(n => !n.optional)
const optional = nulls.filter(n => n.optional)
const missingPhotos = photos.filter(p => !p.ok)
const widest = rows => Math.min(30, Math.max(0, ...rows.map(r => r.length)))
const pad = (s, n) => String(s).padEnd(n)

console.log('Seed Scent placeholder report')
console.log(`Config: ${configName}`)
console.log('')

console.log('Still null (shows on the site as a dashed [ chip ]):')
if (!required.length) console.log('  none. Every required fact is filled in.')
const w1 = widest(required.map(n => n.path))
for (const n of required) {
  const note = n.missing ? `(the ${n.missing}: line is missing from this entry, add it back)` : n.note ? `(${n.note})` : ''
  console.log(note ? `  ${pad(n.path, w1)}   ${note}` : `  ${n.path}`)
}
if (optional.length) {
  console.log('')
  console.log('Optional, fine to leave null:')
  const w2 = widest(optional.map(n => n.path))
  for (const n of optional) console.log(`  ${pad(n.path, w2)}   (${n.optional})`)
}
console.log('')

if (!wrong.length) console.log('Looks wrong: nothing. Every value the page reads has the right shape.')
else {
  console.log('Looks wrong (the page cannot use these as they are):')
  const w3 = widest(wrong.map(x => x.path))
  for (const x of wrong) console.log(`  ${pad(x.path, w3)}   ${x.text}`)
}
console.log('')

console.log('Photos the config points at:')
if (!photos.length) console.log('  none referenced.')
const w4 = widest(photos.map(p => p.path)), w4b = widest(photos.map(p => p.file))
for (const p of photos) console.log(`  ${pad(p.path, w4)}   ${pad(p.file, w4b)}   ${p.state}`)
console.log('')

console.log('Still marked to be confirmed (set the flag to true once the team signs off):')
if (!flags.length) console.log('  none.')
const w5 = widest(flags.map(f => f.path))
for (const f of flags) console.log(`  ${pad(f.path, w5)}   removes ${f.removes}`)
console.log('')

if (wrong.length) console.log(`Fix the ${wrong.length} ${wrong.length === 1 ? 'line' : 'lines'} under Looks wrong first.`)
console.log(`${required.length} placeholders to fill, ${missingPhotos.length} photos missing, ${flags.length} facts to confirm`)
console.log('Edit js/config.js, save, reload the page.')
process.exit(0)
