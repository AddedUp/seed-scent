// Review lens: the "never inert" rule and every interaction.
// Usage: cd tools/playwright && node review-interactions.mjs [inert|direct|mobile|all]
// Read-only: loads the served site, drives the mouse/touch, writes screenshots + a JSON log to out/.
import { chromium } from 'playwright'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { PNG } = require('playwright-core/lib/utilsBundle')

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:3001/index.html'
const url = () => `${BASE}?bust=${Date.now()}`
const which = process.argv[2] || 'all'
const W = 1440, H = 900

const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
function rec(section, name, pass, detail) {
  results.push({ section, name, pass, detail })
  console.log(`${pass === null ? '[info]' : pass ? '[PASS]' : '[FAIL]'} ${section} · ${name} · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

/* ---------- pixel diff: sampled, cheap ---------- */
function decode(buf) { return PNG.sync.read(buf) }
function pixDiff(a, b, step = 3, thr = 24) {
  const A = decode(a), B = decode(b)
  let sampled = 0, changed = 0, maxD = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = 0; y < A.height; y += step) {
    for (let x = 0; x < A.width; x += step) {
      const i = (y * A.width + x) * 4
      const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])
      sampled++
      if (d > thr) { changed++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
      if (d > maxD) maxD = d
    }
  }
  return { sampled, changed, pct: +((100 * changed) / sampled).toFixed(3), maxD, bbox: changed ? [x0, y0, x1, y1] : null }
}

/* ---------- page helpers ---------- */
const pump = (page, n = 3) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)) }, n)
const state = page => page.evaluate(() => window.__dbg.state())
const shot = page => page.screenshot({ type: 'png' })
const toPx = (x, y) => [W / 2 + (x * H) / 10, H / 2 - (y * H) / 10]
const under = (page, x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); if (!e) return 'nothing'; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') }, [x, y])

async function gotoProgress(page, p) {
  await page.evaluate(p => window.__dbg.scrollTo(p), p)
  await sleep(900); await pump(page, 3)
}
async function gotoPin(page, name, t) {
  const p = await page.evaluate(([name, t]) => {
    const el = document.querySelector(`.ch[data-ch="${name}"]`)
    const total = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    const pinStart = el.offsetTop / total, end = Math.min(1, (el.offsetTop + el.offsetHeight - innerHeight) / total)
    return pinStart + t * (end - pinStart)
  }, [name, t])
  await gotoProgress(page, p)
  const st = await state(page)
  return { p: +p.toFixed(4), chapter: st.chapter, local: st.locals[name] }
}
async function gotoElement(page, selector, align = 0.5) {
  const p = await page.evaluate(([s, a]) => {
    const el = document.querySelector(s); const r = el.getBoundingClientRect()
    const abs = r.top + window.scrollY
    const y = abs - (innerHeight - r.height) * a
    const total = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    return Math.min(1, Math.max(0, y / total))
  }, [selector, align])
  await gotoProgress(page, p)
  return p
}
async function wiggle(page, cx, cy, { ms = 600, r = 30, stepMs = 20 } = {}) {
  const n = Math.round(ms / stepMs)
  const t0 = Date.now()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 * 1.5
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    const wait = t0 + (i + 1) * stepMs - Date.now()
    if (wait > 0) await sleep(wait)
  }
}
const heroSpeed = s => (s.hero ? +Math.hypot(s.hero.vx, s.hero.vy).toFixed(3) : null)

function watch(page, label) {
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  page.on('requestfailed', r => errors.push('REQFAIL ' + r.url()))
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:3001')) errors.push('EXTERNAL ' + u) })
  return errors
}
async function openDesktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  const errors = watch(page, 'desktop')
  const nav0 = Date.now()
  await page.goto(url(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state().ready && window.__xsec && window.__sections, null, { timeout: 30000 })
  return { ctx, page, errors, nav0 }
}

/* ======================================================================
   A · never inert: wiggle 60px circle for 600ms at each scroll position
   ====================================================================== */
async function inertProbe(page, label, cx, cy, extra = {}) {
  cx = Math.round(cx); cy = Math.round(cy)
  await page.mouse.move(cx + 30, cy)              // park at the start of the circle, let hover transitions finish
  await sleep(800); await pump(page, 2)
  const what = await under(page, cx + 30, cy)
  const s0 = await state(page)
  const x0 = await page.evaluate(() => ({ xsec: window.__xsec ? window.__xsec.displaced() : null, tilt: window.__sections.tilt().active }))
  const a = await shot(page)
  await sleep(600)
  const b = await shot(page)
  const control = pixDiff(a, b)
  await wiggle(page, cx, cy)
  const s1 = await state(page)
  const x1 = await page.evaluate(() => ({ xsec: window.__xsec ? window.__xsec.displaced() : null, tilt: window.__sections.tilt().active }))
  const c = await shot(page)
  const moved = pixDiff(b, c)
  const file = `inert-${label}`
  fs.writeFileSync(join(OUT, `${file}-before.png`), b)
  fs.writeFileSync(join(OUT, `${file}-after.png`), c)
  const nums = {
    at: [cx, cy], under: what,
    control: { changed: control.changed, pct: control.pct, bbox: control.bbox },
    wiggle: { changed: moved.changed, pct: moved.pct, maxD: moved.maxD, bbox: moved.bbox },
    heroV: [heroSpeed(s0), heroSpeed(s1)], interactions: [s0.interactions, s1.interactions],
    xsecDisplaced: [x0.xsec, x1.xsec], tiltActive: [x0.tilt, x1.tilt], cursor: await page.evaluate(() => document.body.style.cursor || '(default)'),
    ...extra,
  }
  // "visibly responds": the wiggle changed clearly more than the idle control did, or a state number moved
  const stateMoved = (x1.xsec > 0 && x1.xsec !== x0.xsec) || x1.tilt > 0 || s1.interactions > s0.interactions
  const pixelsMoved = moved.changed >= Math.max(40, control.changed * 2 + 20)
  const pass = pixelsMoved || stateMoved
  rec('never-inert', label, pass, { ...nums, verdict: pixelsMoved ? 'pixels' : stateMoved ? 'state-only' : 'inert', shots: `out/${file}-{before,after}.png` })
  return { pass, nums }
}

async function runInert(browser) {
  const { page, errors } = await openDesktop(browser)
  await sleep(1500)
  const cx = W / 2, cy = H / 2

  // hero (0)
  await gotoProgress(page, 0)
  let s = await state(page)
  await inertProbe(page, 'hero-center', cx, cy)
  if (s.hero) { const [px, py] = toPx(s.hero.x, s.hero.y); await inertProbe(page, 'hero-pendant', px, py, { pendantPx: [Math.round(px), Math.round(py)] }) }

  // drive pins
  for (const t of [0.1, 0.4, 0.6, 0.9]) {
    const info = await gotoPin(page, 'drive', t)
    s = await state(page)
    await inertProbe(page, `drive-${t}-center`, cx, cy, { landed: info })
    if (s.hero) { const [px, py] = toPx(s.hero.x, s.hero.y); await inertProbe(page, `drive-${t}-pendant`, px, py, { pendantPx: [Math.round(px), Math.round(py)], holder: s.holder, plant: s.plant }) }
    else rec('never-inert', `drive-${t}-pendant`, null, 'hero hanger disabled here')
  }

  // sprout pin 0.6
  {
    const info = await gotoPin(page, 'sprout', 0.6)
    s = await state(page)
    await inertProbe(page, 'sprout-0.6-center', cx, cy, { landed: info, heroEnabled: !!s.hero })
    const svg = await page.$eval('#sprout-svg', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.45] })
    await inertProbe(page, 'sprout-0.6-over-svg', svg[0], svg[1])
    // the lean is the only cursor response here: measure it with a wide sweep too
    await page.mouse.move(80, cy); await sleep(700)
    const leanL = await page.$eval('#sprout-svg', el => el.style.transform)
    await page.mouse.move(W - 80, cy); await sleep(700)
    const leanR = await page.$eval('#sprout-svg', el => el.style.transform)
    rec('never-inert', 'sprout-lean-full-sweep', leanL !== leanR, { left: leanL, right: leanR })
  }

  // scents pin 0.6
  {
    const info = await gotoPin(page, 'scents', 0.6)
    s = await state(page)
    await inertProbe(page, 'scents-0.6-center', cx, cy, { landed: info, scents: s.scents })
    const mid = s.scents[1]
    if (mid) { const [px, py] = toPx(mid.x, mid.y); await inertProbe(page, 'scents-0.6-pendant', px, py, { pendantPx: [Math.round(px), Math.round(py)] }) }
  }

  // cards
  {
    await gotoElement(page, '#scent-cards', 0.5)
    s = await state(page)
    await inertProbe(page, 'cards-center', cx, cy, { chapter: s.chapter, scents: s.scents })
    const gap = await page.$$eval('#scent-cards .card', els => { const a = els[0].getBoundingClientRect(), b = els[1].getBoundingClientRect(); return [(a.right + b.left) / 2, a.top + a.height / 2, b.left - a.right] })
    rec('never-inert', 'cards-gap-width-px', null, gap[2])
    await inertProbe(page, 'cards-between', gap[0], gap[1])
    const above = await page.$eval('#scent-cards', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, Math.max(60, r.top - 60)] })
    await inertProbe(page, 'cards-above-list', above[0], above[1])
  }

  // inside: over the cross-section and off it
  {
    await gotoElement(page, '#paper-xsec', 0.5)
    s = await state(page)
    const xs = await page.$eval('#paper-xsec', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'inside-over-xsec', xs[0], xs[1], { chapter: s.chapter })
    const spec = await page.$eval('#spec', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'inside-off-xsec-spec-table', spec[0], spec[1])
    const head = await page.$eval('#inside .section-head .annotation', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'inside-off-xsec-heading', head[0], head[1])
    await gotoElement(page, '.inside-photos', 0.5)
    const ph = await page.$eval('.inside-photos .photo', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'inside-photo', ph[0], ph[1])
  }

  // firms: over the slider and the tiers
  {
    await gotoElement(page, '.tiers-block', 0.5)
    s = await state(page)
    const rg = await page.$eval('#qty-range', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height] })
    await inertProbe(page, 'firms-over-slider', rg[0], rg[1], { chapter: s.chapter, sliderRect: rg })
    const tiers = await page.$eval('#tiers', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'firms-over-tiers', tiers[0], tiers[1])
    const out = await page.$eval('#qty-out', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'firms-over-qty-number', out[0], out[1])
    await gotoElement(page, '.ways', 0.5)
    const way = await page.$eval('.ways .way:nth-child(2) .way-title', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'firms-over-way-card-text', way[0], way[1])
  }

  // about
  {
    await gotoElement(page, '#about .mission', 0.5)
    s = await state(page)
    await inertProbe(page, 'about-center', cx, cy, { chapter: s.chapter, finaleEnabled: !!s.finale })
    const q = await page.$eval('#about .mission', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'about-mission-text', q[0], q[1])
  }

  // finale
  {
    await gotoProgress(page, 1)
    s = await state(page)
    await inertProbe(page, 'finale-center', cx, cy, { chapter: s.chapter, finale: s.finale })
    if (s.finale) { const [px, py] = toPx(s.finale.x, s.finale.y); await inertProbe(page, 'finale-pendant', px, py, { pendantPx: [Math.round(px), Math.round(py)] }) }
    const foot = await page.$eval('.footer', el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await inertProbe(page, 'finale-footer', foot[0], foot[1])
  }

  rec('never-inert', 'console/page errors', errors.length === 0, errors.length ? errors : 'none')
  await page.context().close()
}

/* ======================================================================
   B · every interaction, directly
   ====================================================================== */
async function runDirect(browser) {
  const { page, errors, nav0 } = await openDesktop(browser)

  /* --- hint appears after ~2s with no interaction --- */
  let hintAt = null
  try {
    await page.waitForFunction(() => document.getElementById('push-hint').classList.contains('show'), null, { timeout: 5000 })
    hintAt = Date.now() - nav0
  } catch { /* not shown */ }
  const hintOpacity = async () => page.$eval('#push-hint', el => ({ show: el.classList.contains('show'), opacity: getComputedStyle(el).opacity }))
  await sleep(700)
  const h0 = await hintOpacity()
  rec('hint', 'appears after ~2s (ms since navigation)', hintAt !== null && hintAt < 4500, { shownAfterMs: hintAt, ...h0 })

  /* --- brush the pendant: velocity changes, cursor grab --- */
  await gotoProgress(page, 0)
  await sleep(2500)                                       // let the boot kick calm a little
  let s = await state(page)
  let [px, py] = toPx(s.hero.x, s.hero.y)
  await page.mouse.move(px + 200, py - 10)
  await sleep(300)
  const before = await state(page)
  for (let i = 0; i <= 16; i++) { await page.mouse.move(px + 200 - i * 25, py - 10 + i * 1.5); await sleep(16) }
  await pump(page, 2)
  const after = await state(page)
  rec('pendant', 'brush changes velocity', Math.abs(after.hero.vx - before.hero.vx) > 0.3 || Math.abs(after.hero.vy - before.hero.vy) > 0.3, { before: [before.hero.vx, before.hero.vy], after: [after.hero.vx, after.hero.vy], interactions: [before.interactions, after.interactions] })
  await sleep(600)
  const h1 = await hintOpacity()
  rec('hint', 'hides on first interaction', !h1.show, { ...h1, interactions: after.interactions })

  // cursor becomes grab over it: hover exactly on the pendant centre
  await sleep(1200)
  s = await state(page); [px, py] = toPx(s.hero.x, s.hero.y)
  await page.mouse.move(px, py); await pump(page, 2)
  const curOn = await page.evaluate(() => document.body.style.cursor)
  await page.mouse.move(px, py + 1); await pump(page, 1)
  const curOn2 = await page.evaluate(() => document.body.style.cursor)
  await page.mouse.move(px + 380, py + 200); await pump(page, 2)
  const curOff = await page.evaluate(() => document.body.style.cursor)
  rec('pendant', 'cursor is "grab" over it, default off it', (curOn === 'grab' || curOn2 === 'grab') && curOff === '', { over: curOn || curOn2 || '(default)', off: curOff || '(default)', pendantPx: [Math.round(px), Math.round(py)] })

  /* --- grab and drag, throw on release --- */
  await sleep(800)
  s = await state(page); [px, py] = toPx(s.hero.x, s.hero.y)
  await page.mouse.move(px, py); await pump(page, 2)
  await page.mouse.down()
  await pump(page, 1)
  const heldStart = await state(page)
  for (let i = 1; i <= 12; i++) { await page.mouse.move(px - i * 18, py + i * 5); await sleep(16) }
  const heldMid = await state(page)
  const curHeld = await page.evaluate(() => document.body.style.cursor)
  await page.mouse.up()
  await pump(page, 2)
  const thrown = await state(page)
  await sleep(150)
  const thrown2 = await state(page)
  rec('pendant', 'grab: held true while down, follows the pointer', heldStart.held && heldMid.held && Math.abs(heldMid.hero.x - heldStart.hero.x) > 1, { heldAtDown: heldStart.held, heldMidDrag: heldMid.held, xAtDown: heldStart.hero.x, xMidDrag: heldMid.hero.x, cursor: curHeld })
  rec('pendant', 'release: held false, thrown (velocity)', !thrown.held && Math.hypot(thrown.hero.vx, thrown.hero.vy) > 1, { heldAfter: thrown.held, v0: [thrown.hero.vx, thrown.hero.vy], v150ms: [thrown2.hero.vx, thrown2.hero.vy] })

  /* --- mouse wheel swings it --- */
  await page.mouse.move(120, 450)
  await sleep(2600)
  const calm = await state(page)
  await page.mouse.wheel(0, 500)
  await sleep(260)
  const wheeled = await state(page)
  const v = Math.abs(wheeled.hero.vx) + Math.abs(wheeled.hero.vy)
  rec('pendant', 'mouse wheel swings it', wheeled.hero && Math.abs(wheeled.hero.vx - calm.hero.vx) > 0.4, { calmV: [calm.hero.vx, calm.hero.vy], afterWheelV: [wheeled.hero.vx, wheeled.hero.vy], progress: [calm.progress, wheeled.progress] })
  await gotoProgress(page, 0)

  /* --- pills magnetize --- */
  {
    const pill = page.locator('.hero-copy a.pill[data-magnetic]').first()
    const r = await pill.boundingBox()
    const t0 = await pill.evaluate(el => el.style.transform || '(none)')
    await page.mouse.move(r.x + r.width * 0.8, r.y + r.height * 0.85)
    await page.mouse.move(r.x + r.width * 0.82, r.y + r.height * 0.9)
    await sleep(450)
    const t1 = await pill.evaluate(el => el.style.transform || '(none)')
    const cs1 = await pill.evaluate(el => getComputedStyle(el).transform)
    await page.mouse.move(r.x + r.width + 120, r.y + r.height + 120)
    await sleep(900)
    const t2 = await pill.evaluate(el => el.style.transform || '(none)')
    rec('pills', 'magnetize on hover (inline transform set), relax on leave', t1 !== t0 && t1 !== '(none)' && cs1 !== 'none', { before: t0, hover: t1, computedHover: cs1, afterLeave: t2 })
    // the nav Order pill too
    const navPill = page.locator('.nav-actions a.pill[data-magnetic]')
    const nr = await navPill.boundingBox()
    await page.mouse.move(nr.x + nr.width * 0.75, nr.y + nr.height * 0.8); await page.mouse.move(nr.x + nr.width * 0.78, nr.y + nr.height * 0.82); await sleep(400)
    const nt = await navPill.evaluate(el => el.style.transform || '(none)')
    rec('pills', 'nav Order pill magnetizes', nt !== '(none)' && /translate|matrix/.test(nt), nt)
    await page.mouse.move(400, 500); await sleep(500)
  }

  /* --- scent cards tilt on hover --- */
  {
    await gotoElement(page, '#scent-cards', 0.5)
    const card = page.locator('#scent-cards .card').nth(1)
    const r = await card.boundingBox()
    const t0 = await card.evaluate(el => el.style.transform || '(none)')
    await page.mouse.move(r.x + r.width * 0.15, r.y + r.height * 0.2)
    await page.mouse.move(r.x + r.width * 0.12, r.y + r.height * 0.18)
    await sleep(500); await pump(page, 2)
    const t1 = await card.evaluate(el => el.style.transform || '(none)')
    const active = await page.evaluate(() => window.__sections.tilt())
    const img = await card.evaluate(el => getComputedStyle(el.querySelector('.card-media img, .card-media')).transform)
    await page.mouse.move(r.x + r.width + 60, r.y - 40); await sleep(900); await pump(page, 2)
    const t2 = await card.evaluate(el => el.style.transform || '(none)')
    rec('cards', 'tilt on hover (perspective/rotate transform), flat after leave', /rotateX/.test(t1) && t1 !== t0, { before: t0, hover: t1, tilt: active, afterLeave: t2, mediaHoverTransform: img })
  }

  /* --- cross-section seeds displace --- */
  {
    await gotoElement(page, '#paper-xsec', 0.5)
    const r = await page.locator('#paper-xsec').boundingBox()
    const x0 = await page.evaluate(() => window.__sections.xsec())
    await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5)
    for (let i = 0; i <= 20; i++) { await page.mouse.move(r.x + r.width * (0.3 + i * 0.02), r.y + r.height * (0.5 + Math.sin(i / 3) * 0.1)); await sleep(16) }
    await pump(page, 2)
    const x1 = await page.evaluate(() => window.__sections.xsec())
    const peak = await page.evaluate(async () => { let m = 0; for (let i = 0; i < 6; i++) { await new Promise(r => requestAnimationFrame(r)); m = Math.max(m, window.__xsec.displaced()) } return m })
    await page.mouse.move(r.x - 80, r.y + r.height / 2)
    await sleep(1500); await pump(page, 2)
    const x2 = await page.evaluate(() => window.__sections.xsec())
    rec('xsec', 'seeds displace under the pointer, settle after leave', x1.displaced > 0 && x1.running, { before: x0, during: x1, peakNext6Frames: peak, afterLeave1500ms: x2 })
  }

  /* --- quantity slider: output + active tier --- */
  {
    await gotoElement(page, '.tiers-block', 0.5)
    const r = await page.locator('#qty-range').boundingBox()
    const readTier = () => page.evaluate(() => ({ out: document.getElementById('qty-out').textContent.trim(), value: document.getElementById('qty-range').value, active: [...document.querySelectorAll('#tiers .tier.active .tier-qty')].map(e => e.textContent.trim()), current: [...document.querySelectorAll('#tiers .tier[aria-current="true"] .tier-qty')].map(e => e.textContent.trim()), note: document.getElementById('tier-note').textContent.trim() }))
    const q0 = await readTier()
    await page.mouse.click(r.x + r.width * 0.6, r.y + r.height / 2)
    await sleep(600)
    const q1 = await readTier()
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
    await sleep(600)
    const q2 = await readTier()
    await page.mouse.click(r.x + r.width * 0.02, r.y + r.height / 2)
    await sleep(600)
    const q3 = await readTier()
    const expTier = n => (n >= 100 ? '100+' : n >= 50 ? '50+' : n >= 10 ? '10+' : '1 to 9')
    const okOut = q1.out === q1.value && q2.out === q2.value && q3.out === q3.value && Number(q2.value) === Number(q1.value) + 3
    const okTier = q1.active.length === 1 && q1.active[0] === expTier(+q1.value) && q3.active[0] === expTier(+q3.value) && q1.current[0] === q1.active[0]
    rec('slider', 'output follows the value (click + arrows), one active tier matches', okOut && okTier, { start: q0, afterClick60pct: q1, afterArrows: q2, afterClickLeft: q3 })
  }

  /* --- order form validates and shows the summary --- */
  {
    await gotoElement(page, '#order-form', 0.4)
    await page.locator('#order-form button[type="submit"]').click()
    await sleep(300)
    const e1 = await page.evaluate(() => ({ errors: [...document.querySelectorAll('#order-form .field[data-error]')].map(f => f.dataset.error), invalid: [...document.querySelectorAll('#order-form [aria-invalid="true"]')].map(e => e.id), focused: document.activeElement && document.activeElement.id, summaryHidden: document.getElementById('form-summary').hidden }))
    await page.fill('#f-firm', 'Review Firm'); await page.fill('#f-name', 'QA Reviewer'); await page.fill('#f-email', 'not-an-email')
    await page.locator('#order-form button[type="submit"]').click()
    await sleep(300)
    const e2 = await page.evaluate(() => ({ errors: [...document.querySelectorAll('#order-form .field[data-error]')].map(f => f.dataset.error), invalid: [...document.querySelectorAll('#order-form [aria-invalid="true"]')].map(e => e.id), summaryHidden: document.getElementById('form-summary').hidden }))
    await page.fill('#f-email', 'qa@example.test')
    await page.locator('#order-form button[type="submit"]').click()
    await sleep(500)
    const e3 = await page.evaluate(() => { const s = document.getElementById('form-summary'); return { hidden: s.hidden, errors: document.querySelectorAll('#order-form .field[data-error]').length, text: (s.querySelector('.summary-text') || {}).textContent, note: (s.querySelector('.summary-note') || {}).textContent, focused: document.activeElement && document.activeElement.id, url: location.href.slice(0, 40) } })
    rec('order-form', 'empty submit: 3 fields flagged, nothing shown', e1.errors.length === 3 && e1.invalid.includes('f-firm') && e1.summaryHidden, e1)
    rec('order-form', 'bad email flagged alone', e2.errors.length === 1 && e2.invalid.join() === 'f-email', e2)
    rec('order-form', 'valid submit shows the summary with the request text', !e3.hidden && /Firm: Review Firm/.test(e3.text || '') && /Quantity: 24/.test(e3.text || '') && e3.errors === 0, { ...e3, text: (e3.text || '').replace(/\n/g, ' | ') })
  }

  /* --- add to bag updates the nav count; drawer opens/closes --- */
  {
    await gotoElement(page, '#scent-cards', 0.5)
    const c0 = await page.textContent('#bag-count')
    await page.locator('.add-to-bag[data-add="0"]').click()
    await sleep(120)
    const c1 = await page.textContent('#bag-count')
    const label = await page.locator('.add-to-bag[data-add="0"]').textContent()
    await page.locator('.add-to-bag[data-add="2"]').click()
    await sleep(120)
    const c2 = await page.textContent('#bag-count')
    await sleep(1400)
    const label2 = await page.locator('.add-to-bag[data-add="0"]').textContent()
    rec('bag', 'Add to bag updates the nav count (0 -> 1 -> 2) and acknowledges', c0.trim() === '0' && c1.trim() === '1' && c2.trim() === '2' && /Added/.test(label), { counts: [c0, c1, c2].map(x => x.trim()), buttonWhileAdded: label.trim(), buttonAfter: label2.trim() })

    const drawer = () => page.evaluate(() => { const b = document.getElementById('bag'); return { open: b.classList.contains('open'), ariaHidden: b.getAttribute('aria-hidden'), inert: b.inert, scrimHidden: document.getElementById('scrim').hidden, toggleExpanded: document.getElementById('bag-toggle').getAttribute('aria-expanded'), focus: document.activeElement && document.activeElement.id, lines: document.querySelectorAll('#bag-lines li').length, units: document.getElementById('bag-units').textContent } })
    await page.click('#bag-toggle'); await sleep(700)
    const d1 = await drawer()
    await page.keyboard.press('Escape'); await sleep(700)
    const d2 = await drawer()
    await gotoElement(page, '.ways', 0.5)
    await page.click('#open-bag'); await sleep(700)
    const d3 = await drawer()
    await page.keyboard.press('Escape'); await sleep(700)
    const d4 = await drawer()
    rec('bag', 'drawer opens from nav toggle and closes with Escape', d1.open && d1.ariaHidden === 'false' && !d1.scrimHidden && !d2.open && d2.ariaHidden === 'true' && d2.inert, { opened: d1, closed: d2 })
    rec('bag', 'drawer opens from "Open the bag" and closes with Escape', d3.open && !d4.open && d4.focus === 'open-bag', { opened: d3, closed: d4 })
  }

  /* --- Pause motion / Play motion --- */
  {
    await gotoProgress(page, 0)
    await page.mouse.move(60, 450)          // far from the pendant and from every pill
    await sleep(1200)
    const toggle = page.locator('#motion-toggle')
    const t0 = await toggle.textContent()
    const pre = await state(page)
    await toggle.click()
    await page.mouse.move(60, 450)
    const t1 = await toggle.evaluate(el => ({ text: el.textContent.trim(), pressed: el.getAttribute('aria-pressed'), reduced: document.body.classList.contains('reduced'), paused: window.__dbg.motion.paused }))
    const samples = []
    const tStart = Date.now()
    for (let i = 0; i <= 6; i++) { samples.push({ t: +((Date.now() - tStart) / 1000).toFixed(2), v: heroSpeed(await state(page)) }); await sleep(500) }
    const at3s = samples[6].v
    let maxLater = 0
    for (let i = 0; i < 6; i++) { await sleep(500); maxLater = Math.max(maxLater, heroSpeed(await state(page))) }
    rec('motion', 'Pause motion: button flips, body.reduced set', t1.text === 'Play motion' && t1.pressed === 'true' && t1.reduced && t1.paused, { before: t0.trim(), after: t1 })
    rec('motion', 'Pause motion: hero speed decays to ~0 within 3s (<0.15) and stays there (3s more)', at3s < 0.15 && maxLater < 0.2, { speedBeforePause: heroSpeed(pre), samples, maxSpeedNext3s: +maxLater.toFixed(3) })

    await toggle.click()
    await page.mouse.move(60, 450)
    const t2 = await toggle.evaluate(el => ({ text: el.textContent.trim(), pressed: el.getAttribute('aria-pressed'), reduced: document.body.classList.contains('reduced'), paused: window.__dbg.motion.paused }))
    let maxPlay = 0; const playSamples = []
    const pStart = Date.now()
    for (let i = 0; i < 12; i++) { await sleep(500); const v = heroSpeed(await state(page)); maxPlay = Math.max(maxPlay, v); playSamples.push({ t: +((Date.now() - pStart) / 1000).toFixed(1), v }) }
    const idleGap = await page.evaluate(() => Math.round(performance.now() - (window.__dbg.state().interactions ? 0 : 0)))
    rec('motion', 'Play motion: button flips back, breeze restarts (max speed over 6s > 0.3)', t2.text === 'Pause motion' && t2.pressed === 'false' && !t2.reduced && maxPlay > 0.3, { after: t2, maxSpeed6s: +maxPlay.toFixed(3), samples: playSamples })
  }

  /* --- nav anchor links scroll to the right chapter --- */
  {
    await gotoProgress(page, 0); await sleep(500)
    const expect = { drive: 'drive', scents: 'scents', inside: 'inside', firms: 'firms', finale: 'finale' }
    const got = {}
    for (const key of Object.keys(expect)) {
      await page.locator(`.nav-links a[data-nav="${key}"]`).click()
      await sleep(2300); await pump(page, 2)
      const st = await state(page)
      const active = await page.$$eval('.nav-links a.active', els => els.map(e => e.dataset.nav))
      const local = st.locals[st.chapter]
      got[key] = { chapter: st.chapter, progress: st.progress, local, navActive: active }
    }
    await page.locator('.nav .brand').click(); await sleep(2300)
    const home = await state(page)
    got.brand = { chapter: home.chapter, progress: home.progress }
    const ok = Object.entries(expect).every(([k, v]) => got[k].chapter === v && got[k].navActive.join() === k) && home.chapter === 'hero' && home.progress < 0.01
    rec('nav', 'anchor links land in the right chapter and underline it', ok, got)
  }

  /* --- progress stem grows --- */
  {
    const stem = async () => page.evaluate(() => ({ offset: document.getElementById('meter-stem').style.strokeDashoffset, leaves: document.getElementById('meter-leaves').style.opacity, progress: window.__dbg.state().progress }))
    await gotoProgress(page, 0); const m0 = await stem()
    await gotoProgress(page, 0.5); const m1 = await stem()
    await gotoProgress(page, 1); const m2 = await stem()
    rec('meter', 'stem dashoffset 1 -> 0.5 -> 0 as progress grows, leaves at the end', +m0.offset > 0.99 && Math.abs(+m1.offset - 0.5) < 0.02 && +m2.offset < 0.01 && +m2.leaves > 0.9, { at0: m0, at50: m1, at100: m2 })
  }

  rec('direct', 'console/page errors', errors.length === 0, errors.length ? errors : 'none')
  await page.context().close()
}

/* ======================================================================
   C · 390x844, touch
   ====================================================================== */
async function runMobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = watch(page, 'mobile')
  await page.goto(url(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state().ready, null, { timeout: 30000 })
  await sleep(1500)
  const env = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches, menuDisplay: getComputedStyle(document.getElementById('menu-toggle')).display, linksDisplay: getComputedStyle(document.getElementById('nav-links')).display, hintDisplay: getComputedStyle(document.getElementById('push-hint')).display }))
  rec('mobile', 'environment', null, env)

  // Menu
  await page.tap('#menu-toggle'); await sleep(500)
  const m1 = await page.evaluate(() => { const n = document.getElementById('nav'), l = document.getElementById('nav-links'); const r = l.getBoundingClientRect(); return { open: n.classList.contains('menu-open'), expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'), display: getComputedStyle(l).display, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], links: [...l.querySelectorAll('a')].map(a => a.textContent.trim()) } })
  await page.screenshot({ path: join(OUT, 'mobile-menu-open.png') })
  await page.tap('.nav-links a[data-nav="scents"]'); await sleep(2300)
  const m2 = await page.evaluate(() => ({ open: document.getElementById('nav').classList.contains('menu-open'), chapter: window.__dbg.state().chapter }))
  rec('mobile', 'Menu button opens the links; a link closes it and scrolls', m1.open && m1.expanded === 'true' && m1.display !== 'none' && m1.rect[3] > 0 && !m2.open && m2.chapter === 'scents', { opened: m1, afterLinkTap: m2 })

  // pendant: tap, then a finger drag
  await page.evaluate(() => window.__dbg.scrollTo(0)); await sleep(1200)
  let s = await state(page)
  const mw = 390, mh = 844
  const toPxM = (x, y) => [mw / 2 + (x * mh) / 10, mh / 2 - (y * mh) / 10]
  let [px, py] = toPxM(s.hero.x, s.hero.y)
  const underTap = await under(page, px, py)
  const before = await state(page)
  await page.touchscreen.tap(px, py)
  await pump(page, 2)
  const afterTap = await state(page)
  await sleep(300)
  const afterTap2 = await state(page)
  rec('mobile', 'tap on the pendant registers (interactions++), position', afterTap.interactions > before.interactions, { pendantPx: [Math.round(px), Math.round(py)], under: underTap, interactions: [before.interactions, afterTap.interactions], v: [[before.hero.vx, before.hero.vy], [afterTap.hero.vx, afterTap.hero.vy], [afterTap2.hero.vx, afterTap2.hero.vy]], x: [before.hero.x, afterTap.hero.x, afterTap2.hero.x] })

  await sleep(800)
  s = await state(page); [px, py] = toPxM(s.hero.x, s.hero.y)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] })
  await pump(page, 1)
  const held0 = await state(page)
  let heldMid = null
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px - i * 9, y: py + i * 3 }] })
    await sleep(16)
    if (i === 6) heldMid = await state(page)
  }
  const scrollDuringDrag = await page.evaluate(() => window.scrollY)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await pump(page, 2)
  const released = await state(page)
  rec('mobile', 'finger drag: held while down, follows, thrown on lift, page did not scroll', held0.held && heldMid.held && Math.abs(heldMid.hero.x - held0.hero.x) > 0.5 && !released.held && Math.hypot(released.hero.vx, released.hero.vy) > 0.5 && scrollDuringDrag === 0, { heldAtStart: held0.held, heldMid: heldMid.held, xStart: held0.hero.x, xMid: heldMid.hero.x, releasedV: [released.hero.vx, released.hero.vy], scrollYDuringDrag: scrollDuringDrag })
  await page.screenshot({ path: join(OUT, 'mobile-hero-after-drag.png') })

  // the breeze on touch devices keeps the pendant alive without a pointer
  await sleep(1500)
  const b0 = heroSpeed(await state(page)); await sleep(1000); const b1 = heroSpeed(await state(page))
  rec('mobile', 'idle breeze keeps the pendant moving (speed samples 1s apart)', b0 > 0.05 || b1 > 0.05, { samples: [b0, b1] })

  rec('mobile', 'console/page errors', errors.length === 0, errors.length ? errors : 'none')
  await ctx.close()
}

/* ---------- go ---------- */
const browser = await chromium.launch()
try {
  if (which === 'inert' || which === 'all') await runInert(browser)
  if (which === 'direct' || which === 'all') await runDirect(browser)
  if (which === 'mobile' || which === 'all') await runMobile(browser)
} finally {
  await browser.close()
}
fs.writeFileSync(join(OUT, `review-interactions-${which}.json`), JSON.stringify(results, null, 1))
const fails = results.filter(r => r.pass === false)
console.log(`\n${results.filter(r => r.pass === true).length} pass, ${fails.length} fail, ${results.filter(r => r.pass === null).length} info -> out/review-interactions-${which}.json`)
