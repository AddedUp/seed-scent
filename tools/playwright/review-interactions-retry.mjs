// Second attempt for the never-inert FAILs, with the pitfalls in mind:
//  - the idle breeze moves the pendants anyway, so zero __dbg.tune.breeze and let them settle
//    before measuring whether the cursor itself does anything;
//  - measure the dead zone: how far from the disc edge does a wiggle still move the pendant;
//  - dense (step=1) pixel diffs over the local box for the subtle hover spots.
// Usage: cd tools/playwright && node review-interactions-retry.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { PNG } = require('playwright-core/lib/utilsBundle')
const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, 'out')
const BASE = 'http://127.0.0.1:3001/index.html'
const W = 1440, H = 900
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
function rec(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass === null ? '[info]' : pass ? '[PASS]' : '[FAIL]'} retry · ${name} · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
function pixDiff(a, b, step = 3, thr = 24, box = null) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b)
  const [bx0, by0, bx1, by1] = box || [0, 0, A.width - 1, A.height - 1]
  let sampled = 0, changed = 0, maxD = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = by0; y <= by1; y += step) for (let x = bx0; x <= bx1; x += step) {
    const i = (y * A.width + x) * 4
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])
    sampled++; if (d > thr) { changed++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } if (d > maxD) maxD = d
  }
  return { sampled, changed, pct: +((100 * changed) / sampled).toFixed(3), maxD, bbox: changed ? [x0, y0, x1, y1] : null }
}
const pump = (page, n = 3) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)) }, n)
const state = page => page.evaluate(() => window.__dbg.state())
const shot = page => page.screenshot({ type: 'png' })
const toPx = (x, y) => [W / 2 + (x * H) / 10, H / 2 - (y * H) / 10]
const speed = h => (h ? +Math.hypot(h.vx, h.vy).toFixed(3) : null)
async function gotoProgress(page, p) { await page.evaluate(p => window.__dbg.scrollTo(p), p); await sleep(900); await pump(page, 3) }
async function gotoPin(page, name, t) {
  const p = await page.evaluate(([name, t]) => { const el = document.querySelector(`.ch[data-ch="${name}"]`); const total = Math.max(1, document.documentElement.scrollHeight - innerHeight); const ps = el.offsetTop / total, end = Math.min(1, (el.offsetTop + el.offsetHeight - innerHeight) / total); return ps + t * (end - ps) }, [name, t])
  await gotoProgress(page, p)
}
async function gotoElement(page, selector, align = 0.5) {
  const p = await page.evaluate(([s, a]) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const abs = r.top + window.scrollY; const y = abs - (innerHeight - r.height) * a; const total = Math.max(1, document.documentElement.scrollHeight - innerHeight); return Math.min(1, Math.max(0, y / total)) }, [selector, align])
  await gotoProgress(page, p)
}
async function wiggle(page, cx, cy, { ms = 600, r = 30, stepMs = 20 } = {}) {
  const n = Math.round(ms / stepMs), t0 = Date.now()
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 * 1.5; await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r); const w = t0 + (i + 1) * stepMs - Date.now(); if (w > 0) await sleep(w) }
}
/* wait until the hero pendant is still (no breeze, damping only); remembers how still it ever got */
const settleLog = []
async function settle(page, key = 'hero', maxMs = 12000) {
  const t0 = Date.now(); let s, min = 1e9
  while (Date.now() - t0 < maxMs) { s = await state(page); const h = s[key]; const v = h ? speed(h) : 0; min = Math.min(min, v); if (h && v < 0.02) break; await sleep(300) }
  settleLog.push({ key, ms: Date.now() - t0, finalSpeed: s[key] ? speed(s[key]) : null, minSpeed: +min.toFixed(3) })
  return s
}
/* sample the hero for `ms` at 100ms: speed and sideways offset from its hang point */
async function series(page, ms) {
  const rows = []; const t0 = Date.now()
  while (Date.now() - t0 < ms) { const s = await state(page); if (s.hero) rows.push({ t: +((Date.now() - t0) / 1000).toFixed(1), v: speed(s.hero), dx: +(s.hero.x - s.hero.anchor.x).toFixed(3) }); await sleep(100) }
  const win = (a, b) => rows.filter(r => r.t >= a && r.t < b)
  const mx = arr => (arr.length ? +Math.max(...arr.map(r => r.v)).toFixed(3) : null)
  const mn = arr => (arr.length ? +Math.min(...arr.map(r => r.v)).toFixed(3) : null)
  const maxDx = arr => (arr.length ? +Math.max(...arr.map(r => Math.abs(r.dx))).toFixed(3) : null)
  return { n: rows.length, maxV_0to1: mx(win(0, 1)), maxV_2to3: mx(win(2, 3)), maxV_5to7: mx(win(5, 7)), minV_5to7: mn(win(5, 7)), maxAbsDx_0to7: maxDx(rows), maxAbsDx_5to7: maxDx(win(5, 7)), every5th: rows.filter((_, i) => i % 5 === 0).map(r => `${r.t}s v${r.v} dx${r.dx}`) }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`${BASE}?bust=${Date.now()}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__dbg && window.__dbg.state().ready && window.__sections, null, { timeout: 30000 })
/* ---------- 0. hint + "play" detection vs cursor speed (fresh page, breeze still on) ---------- */
{
  try { await page.waitForFunction(() => document.getElementById('push-hint').classList.contains('show'), null, { timeout: 5000 }) } catch { /* no hint */ }
  const hint = () => page.$eval('#push-hint', el => el.classList.contains('show'))
  const brush = async (pxPerFrame) => {
    const s = await state(page); const [px, py] = toPx(s.hero.x, s.hero.y)
    const span = 360, n = Math.ceil(span / pxPerFrame)
    await page.mouse.move(px + span / 2, py); await sleep(120)
    const i0 = (await state(page)).interactions
    const v0 = speed(s.hero)
    for (let i = 1; i <= n; i++) { await page.mouse.move(px + span / 2 - i * pxPerFrame, py); await sleep(16) }
    await pump(page, 2)
    const s1 = await state(page)
    await page.mouse.move(40, 880)
    return { pxPerFrame, pxPerSecondApprox: Math.round(pxPerFrame * 60), interactions: [i0, s1.interactions], speed: [v0, speed(s1.hero)], hintShown: await hint() }
  }
  const slow = await brush(6)      // ~360 px/s: a normal brush
  const mid = await brush(14)      // ~840 px/s
  const fast = await brush(40)     // ~2400 px/s: a flick
  rec('play detection: brush at ~360 px/s counts as an interaction and hides the hint', slow.interactions[1] > slow.interactions[0] && !slow.hintShown, slow)
  rec('play detection: brush at ~840 px/s', mid.interactions[1] > mid.interactions[0], mid)
  rec('play detection: flick at ~2400 px/s', fast.interactions[1] > fast.interactions[0] && !fast.hintShown, fast)
}

/* ---------- 0a. Pause motion vs Play motion, as 7s time series (breeze still on) ---------- */
{
  await gotoProgress(page, 0)
  await page.mouse.move(40, 880); await sleep(1500)
  const toggle = page.locator('#motion-toggle')
  await toggle.click(); await page.mouse.move(40, 880)
  const pausedState = await page.evaluate(() => ({ paused: window.__dbg.motion.paused, text: document.getElementById('motion-toggle').textContent.trim() }))
  const paused = await series(page, 7200)
  rec('Pause motion: hero speed over 7s (expects max in 5-7s < 0.1, i.e. at rest)', paused.maxV_5to7 !== null && paused.maxV_5to7 < 0.1, { ...pausedState, ...paused })
  await toggle.click(); await page.mouse.move(40, 880)
  const playState = await page.evaluate(() => ({ paused: window.__dbg.motion.paused, text: document.getElementById('motion-toggle').textContent.trim() }))
  await sleep(5500)                                   // the breeze only blows once no one has touched a pendant for 5s
  const playing = await series(page, 7200)
  rec('Play motion: breeze restarts (sideways offset and speed clearly above the paused floor)', playing.maxAbsDx_0to7 > paused.maxAbsDx_5to7 * 2 + 0.05 && playing.maxV_5to7 > paused.maxV_5to7 * 1.5, { ...playState, playing, pausedFloor: { maxV_5to7: paused.maxV_5to7, maxAbsDx_5to7: paused.maxAbsDx_5to7 } })
}

await page.evaluate(() => { window.__dbg.tune.breeze = 0 })
await page.mouse.move(40, 880)                 // bottom-left corner, far from everything
rec('setup', null, 'tune.breeze set to 0 so only the cursor can move a pendant')
{
  // with no breeze and no cursor, does the pendant ever come to rest? (joint-chain jitter floor)
  await gotoProgress(page, 0)
  const rest = await series(page, 8000)
  rec('breeze off, cursor parked: does the hero come to rest within 8s?', rest.maxV_5to7 !== null && rest.maxV_5to7 < 0.05, rest)
}

/* ---------- 0b. mouse wheel with the pendant at rest ---------- */
{
  await gotoProgress(page, 0)
  const s0 = await settle(page)
  await page.mouse.move(120, 450)
  await page.mouse.wheel(0, 400)
  let peak = 0
  for (let i = 0; i < 12; i++) { await sleep(40); const st = await state(page); if (st.hero) peak = Math.max(peak, speed(st.hero)) }
  const s1 = await state(page)
  rec('mouse wheel swings a resting pendant (peak speed within 0.5s)', peak > 0.3, { restingSpeed: speed(s0.hero), peakSpeed: +peak.toFixed(3), progressAfter: s1.progress, chapter: s1.chapter })
  await gotoProgress(page, 0)
}

/* ---------- 1. hero centre, pendant at rest: does the cursor do anything 230px away? ---------- */
await gotoProgress(page, 0)
let s = await settle(page)
rec('hero settled (speed)', null, speed(s.hero))
{
  const cx = W / 2, cy = H / 2
  await page.mouse.move(cx + 30, cy); await sleep(900); await pump(page, 2)
  const a = await shot(page); await sleep(600); const b = await shot(page)
  const control = pixDiff(a, b, 2)
  const s0 = await state(page)
  await wiggle(page, cx, cy)
  const s1 = await state(page)
  const c = await shot(page)
  const moved = pixDiff(b, c, 2)
  fs.writeFileSync(join(OUT, 'retry-hero-center-before.png'), b); fs.writeFileSync(join(OUT, 'retry-hero-center-after.png'), c)
  const [px, py] = toPx(s0.hero.x, s0.hero.y)
  rec('hero-center (breeze off): wiggle 60px at viewport centre', moved.changed > control.changed + 20 || speed(s1.hero) > 0.05, { pendantPx: [Math.round(px), Math.round(py)], distanceToPendantCentrePx: Math.round(Math.hypot(px - cx, py - cy)), control, wiggle: moved, heroSpeed: [speed(s0.hero), speed(s1.hero)] })
}
/* full-width sweep: how big is the parallax at all? */
{
  await page.mouse.move(60, 450); await sleep(900); await pump(page, 2)
  const sL = await state(page); const a = await shot(page)
  for (let i = 0; i <= 40; i++) { await page.mouse.move(60 + i * ((W - 120) / 40), 450); await sleep(16) }
  await sleep(900); await pump(page, 2)
  const sR = await state(page); const b = await shot(page)
  const d = pixDiff(a, b, 2)
  fs.writeFileSync(join(OUT, 'retry-hero-sweep-left.png'), a); fs.writeFileSync(join(OUT, 'retry-hero-sweep-right.png'), b)
  rec('hero full-width sweep (parallax only, pendant at rest)', null, { changed: d.changed, pct: d.pct, maxD: d.maxD, bbox: d.bbox, heroSpeed: [speed(sL.hero), speed(sR.hero)], note: 'rig.rotation.y spans ±0.05 rad; a 60px wiggle is ±0.002 rad' })
  await page.mouse.move(40, 880)
}
/* dead zone: wiggle at growing distances from the disc edge, pendant at rest each time */
{
  const R_px = (1.35 * H) / 10
  const rows = []
  for (const gap of [0, 20, 40, 60, 100, 160]) {
    await settle(page)
    const s0 = await state(page)
    const [px, py] = toPx(s0.hero.x, s0.hero.y)
    const cx = px - (R_px + gap + 30), cy = py   // circle's nearest point sits `gap` px left of the disc edge
    await wiggle(page, cx, cy, { ms: 600 })
    await pump(page, 2)
    let peak = 0
    for (let i = 0; i < 8; i++) { const st = await state(page); peak = Math.max(peak, speed(st.hero)); await sleep(50) }
    rows.push({ gapFromDiscEdgePx: gap, peakSpeed: +peak.toFixed(3), movedPx: +Math.abs(toPx((await state(page)).hero.x, 0)[0] - px).toFixed(1) })
    await page.mouse.move(40, 880)
  }
  const reach = rows.filter(r => r.peakSpeed > 0.05).map(r => r.gapFromDiscEdgePx)
  rec('hero dead zone: wiggle response vs distance from the disc edge', null, { discRadiusPx: Math.round(R_px), cursorColliderRadiusPx: Math.round((0.4 * H) / 10), rows, respondsUpToGapPx: reach.length ? Math.max(...reach) : 0 })
}

/* ---------- 2. drive centres with the breeze off ---------- */
for (const t of [0.1, 0.4, 0.6]) {
  await gotoPin(page, 'drive', t)
  await settle(page)
  const cx = W / 2, cy = H / 2
  await page.mouse.move(cx + 30, cy); await sleep(800); await pump(page, 2)
  const s0 = await state(page)
  const a = await shot(page); await sleep(600); const b = await shot(page)
  const control = pixDiff(a, b, 2)
  await wiggle(page, cx, cy)
  const s1 = await state(page)
  const c = await shot(page)
  const moved = pixDiff(b, c, 2)
  const [px, py] = toPx(s0.hero.x, s0.hero.y)
  rec(`drive-${t}-center (breeze off)`, moved.changed > control.changed + 20 || speed(s1.hero) > 0.05, { pendantPx: [Math.round(px), Math.round(py)], distancePx: Math.round(Math.hypot(px - cx, py - cy)), control, wiggle: moved, heroSpeed: [speed(s0.hero), speed(s1.hero)] })
  await page.mouse.move(40, 880)
}

/* ---------- 3. scents centre: the middle disc is under the circle, prove it moves ---------- */
{
  await gotoPin(page, 'scents', 0.6)
  await sleep(3500)                                       // the strings lower in and settle (no breeze)
  const cx = W / 2, cy = H / 2
  await page.mouse.move(cx + 30, cy); await sleep(800); await pump(page, 2)
  const s0 = await state(page)
  const a = await shot(page); await sleep(600); const b = await shot(page)
  const control = pixDiff(a, b, 2)
  const cur0 = await page.evaluate(() => document.body.style.cursor)
  await wiggle(page, cx, cy)
  const s1 = await state(page)
  await sleep(120)
  const s2 = await state(page)
  const c = await shot(page)
  const moved = pixDiff(b, c, 2)
  fs.writeFileSync(join(OUT, 'retry-scents-center-before.png'), b); fs.writeFileSync(join(OUT, 'retry-scents-center-after.png'), c)
  const dx = Math.abs(s2.scents[1].x - s0.scents[1].x), dy = Math.abs(s2.scents[1].y - s0.scents[1].y)
  rec('scents-0.6-center (breeze off): middle disc displaced by the cursor', (dx > 0.05 || dy > 0.05) && moved.changed > control.changed + 20, { scent1Before: s0.scents[1], scent1After: s2.scents[1], displacedWorldUnits: [+dx.toFixed(3), +dy.toFixed(3)], cursorOverDisc: cur0, control, wiggle: moved })
  await page.mouse.move(40, 880)
}

/* ---------- 4. finale centre with the breeze off ---------- */
{
  await gotoProgress(page, 1)
  await sleep(3500)
  const cx = W / 2, cy = H / 2
  await page.mouse.move(cx + 30, cy); await sleep(800); await pump(page, 2)
  const s0 = await state(page)
  const a = await shot(page); await sleep(600); const b = await shot(page)
  const control = pixDiff(a, b, 2)
  await wiggle(page, cx, cy)
  await sleep(120)
  const s1 = await state(page)
  const c = await shot(page)
  const moved = pixDiff(b, c, 2)
  const [px, py] = toPx(s0.finale.x, s0.finale.y)
  rec('finale-center (breeze off)', moved.changed > control.changed + 20, { finalePendantPx: [Math.round(px), Math.round(py)], distancePx: Math.round(Math.hypot(px - cx, py - cy)), finaleBefore: s0.finale, finaleAfter: s1.finale, control, wiggle: moved })
  // footer
  const foot = await page.$eval('.footer', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
  await page.mouse.move(foot[0] + 30, foot[1]); await sleep(800)
  const fa = await shot(page); await sleep(600); const fb = await shot(page)
  const fcontrol = pixDiff(fa, fb, 2)
  await wiggle(page, foot[0], foot[1])
  const fc = await shot(page)
  const fmoved = pixDiff(fb, fc, 2)
  rec('finale-footer (breeze off)', fmoved.changed > fcontrol.changed + 20, { control: fcontrol, wiggle: fmoved, under: await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, foot) })
  await page.mouse.move(40, 880)
}

/* ---------- 5. subtle hover spots: dense diff in the local box + computed styles ---------- */
async function denseProbe(name, selector, pick) {
  const r = await page.$eval(selector, el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
  const cx = r[0] + r[2] * (pick ? pick[0] : 0.5), cy = r[1] + r[3] * (pick ? pick[1] : 0.5)
  await page.mouse.move(cx + 30, cy); await sleep(800); await pump(page, 2)
  const a = await shot(page); await sleep(600); const b = await shot(page)
  const box = [Math.max(0, Math.floor(r[0]) - 40), Math.max(0, Math.floor(r[1]) - 40), Math.min(W - 1, Math.ceil(r[0] + r[2]) + 40), Math.min(H - 1, Math.ceil(r[1] + r[3]) + 40)]
  const control = pixDiff(a, b, 1, 12, box)
  await wiggle(page, cx, cy)
  const c = await shot(page)
  const moved = pixDiff(b, c, 1, 12, box)
  // sweep across the whole element too (a 60px circle may sit inside one row)
  for (let i = 0; i <= 20; i++) { await page.mouse.move(r[0] + 10 + (r[2] - 20) * (i / 20), r[1] + 6 + (r[3] - 12) * (i / 20)); await sleep(20) }
  await sleep(500)
  const d = await shot(page)
  const swept = pixDiff(b, d, 1, 12, box)
  fs.writeFileSync(join(OUT, `retry-${name}-before.png`), b); fs.writeFileSync(join(OUT, `retry-${name}-after.png`), d)
  return { at: [Math.round(cx), Math.round(cy)], box, control: { changed: control.changed, maxD: control.maxD }, wiggle: { changed: moved.changed, maxD: moved.maxD, bbox: moved.bbox }, sweep: { changed: swept.changed, maxD: swept.maxD, bbox: swept.bbox } }
}
{
  await gotoElement(page, '#paper-xsec', 0.5)
  const d = await denseProbe('spec-table', '#spec')
  const hoverCss = await page.evaluate(() => {
    const tr = document.querySelector('#spec tbody tr:nth-child(3)'); const r = tr.getBoundingClientRect()
    return { rowBg: getComputedStyle(tr).backgroundColor, thColor: getComputedStyle(tr.querySelector('th')).color, rowH: Math.round(r.height), pageBg: getComputedStyle(document.body).backgroundColor }
  })
  // hover a row directly and read the computed colours
  const tr = await page.$eval('#spec tbody tr:nth-child(3)', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
  await page.mouse.move(tr[0], tr[1]); await sleep(600)
  const hovered = await page.evaluate(() => { const tr = document.querySelector('#spec tbody tr:nth-child(3)'); return { rowBg: getComputedStyle(tr).backgroundColor, thColor: getComputedStyle(tr.querySelector('th')).color, matches: tr.matches(':hover') } })
  rec('inside-off-xsec-spec-table (dense diff + computed hover colours)', d.sweep.changed > 60 && d.sweep.maxD > 40, { ...d, restingRow: hoverCss, hoveredRow: hovered })
  const h = await denseProbe('inside-heading', '#inside .section-head .annotation')
  rec('inside-off-xsec-heading (dense diff)', h.sweep.changed > 60, h)
  await page.mouse.move(40, 880)
}
{
  await gotoElement(page, '.tiers-block', 0.5)
  const sl = await denseProbe('slider', '#qty-range')
  const thumb = await page.evaluate(() => { const r = document.getElementById('qty-range'); const cs = getComputedStyle(r); return { accent: cs.accentColor, appearance: cs.appearance, cursor: cs.cursor, value: r.value } })
  rec('firms-over-slider (dense diff, thumb hover)', sl.sweep.changed > 60 || sl.wiggle.changed > 60, { ...sl, range: thumb })
  const ti = await denseProbe('tiers', '#tiers')
  const tierCss = await page.evaluate(() => { const li = document.querySelector('#tiers .tier:not(.active)'); return { bg: getComputedStyle(li).backgroundColor, transform: getComputedStyle(li).transform, transition: getComputedStyle(li).transitionProperty } })
  rec('firms-over-tiers (dense diff)', ti.sweep.changed > 60, { ...ti, tierComputed: tierCss, cssHoverRuleForTier: 'none in css/site.css or css/sections.css' })
  const qo = await denseProbe('qty-out', '#qty-out')
  rec('firms-over-qty-number (dense diff)', qo.sweep.changed > 60, qo)
  await gotoElement(page, '.ways', 0.5)
  const wy = await denseProbe('way-card', '.ways .way:nth-child(2)', [0.5, 0.25])
  rec('firms-over-way-card (dense diff, excluding the pill)', wy.wiggle.changed > 60, wy)
  await page.mouse.move(40, 880)
}
{
  await gotoElement(page, '#about .mission', 0.5)
  const ab = await denseProbe('about-mission', '#about .mission')
  rec('about-mission-text (dense diff)', ab.sweep.changed > 60, ab)
  const link = await denseProbe('about-link', '#about .text-link')
  rec('about: only the "Meet the team" link reacts (dense diff over the link)', link.sweep.changed > 20, link)
  await page.mouse.move(40, 880)
}
{
  await gotoElement(page, '#scent-cards', 0.5)
  const above = await page.$eval('#scent-cards', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, Math.max(60, r.top - 60), r.top] })
  const what = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const r = e.getBoundingClientRect(); return { tag: e.tagName + '.' + e.className, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], parent: e.parentElement && e.parentElement.className } }, above)
  rec('cards-above-list: what is under the cursor there', null, { at: [Math.round(above[0]), Math.round(above[1])], cardsTop: Math.round(above[2]), ...what })
}

rec('settle() log (how still the hero ever got while waiting)', null, settleLog)
rec('console/page errors', errors.length === 0, errors.length ? errors : 'none')
await browser.close()
fs.writeFileSync(join(OUT, 'review-interactions-retry.json'), JSON.stringify(results, null, 1))
console.log(`\n${results.filter(r => r.pass === true).length} pass, ${results.filter(r => r.pass === false).length} fail, ${results.filter(r => r.pass === null).length} info`)
