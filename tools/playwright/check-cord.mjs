/* Cord check: the pendant's cord must never break.

   It grabs each pendant (the hero one, a scent, the one on the business card) and
   abuses it the way a visitor might: pulls it far past the cord's reach in every
   direction, scribbles with it, throws it, shoves it with the cursor, jumps the
   page around. All the while it reads window.__dbg.cord(), which measures every
   enabled cord:
     length  the drawn cord against its real length   (1 on a healthy cord)
     end     hang point to the top of the ring, against the cord's length
     gap     distance between the cord's last joint and the ring
     dist    hang point to the pendant's centre;  reach  the furthest that can be
     stretch the give of a taut cord (drawn only; it should show while over-pulled)
   and asserts the cord stays whole, the pendant stays within reach, the give
   shows under a hard pull, and letting go brings the pendant back on screen.

   cd tools/playwright && node check-cord.mjs
   SITE_BASE=https://addedup.github.io/seed-scent/ node check-cord.mjs
   DRAFT_PHYSICS=path/to/physics.js node check-cord.mjs   (serve a draft in place of js/physics.js) */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = (process.env.SITE_BASE || process.env.SEED_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '') + '/'
const DRAFT = process.env.DRAFT_PHYSICS ? fs.readFileSync(path.resolve(process.env.DRAFT_PHYSICS), 'utf8') : null

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}

/* limits: a whole cord measures 1; the solver and the drawn give allow a little over */
const LIM = { length: 1.2, end: 1.06, gap: 0.08, dist: 1.02 }

const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}

console.log(`Cord check against ${BASE}${DRAFT ? ' (draft physics)' : ''}`)

for (const [label, opts] of Object.entries(sizes)) {
  const touch = !!opts.hasTouch
  const { width: W, height: H } = opts.viewport
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts })
  if (DRAFT) await ctx.route('**/js/physics.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: DRAFT }))
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.goto(BASE + 'index.html?bust=' + Date.now(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state && window.__dbg.state().ready, null, { timeout: 60000 })
  await page.waitForTimeout(2600)

  const hasCord = await page.evaluate(() => typeof window.__dbg.cord === 'function')
  if (!hasCord) { check(`[${label}] the page exposes cord measurements`, false, 'window.__dbg.cord is missing'); await browser.close(); continue }

  const k = H / 10
  const toPx = c => [W / 2 + c.x * k, H / 2 - c.y * k]
  const cords = () => page.evaluate(() => window.__dbg.cord())
  const one = async name => (await cords()).find(c => c.name === name)
  const cdp = touch ? await ctx.newCDPSession(page) : null
  const down = async (x, y) => (touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }) : (await page.mouse.move(x, y), page.mouse.down()))
  const move = async (x, y) => (touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }) : page.mouse.move(x, y))
  const up = async () => (touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : page.mouse.up())

  /* worst numbers seen for one cord while fn runs */
  async function watch(name, fn) {
    const worst = { length: 0, end: 0, gap: 0, dist: 0, stretch: 0, bad: 0, samples: 0 }
    let on = true
    const loop = (async () => {
      while (on) {
        const c = await one(name).catch(() => null)
        if (c) {
          worst.samples++
          if (![c.length, c.end, c.gap, c.dist].every(Number.isFinite)) worst.bad++
          worst.length = Math.max(worst.length, c.length); worst.end = Math.max(worst.end, c.end); worst.gap = Math.max(worst.gap, c.gap)
          worst.dist = Math.max(worst.dist, c.dist / c.reach); worst.stretch = Math.max(worst.stretch, c.stretch)
        }
        await new Promise(r => setTimeout(r, 30))
      }
    })()
    await fn()
    on = false; await loop
    return worst
  }
  const whole = w => w.bad === 0 && w.samples > 3 && w.length <= LIM.length && w.end <= LIM.end && w.gap <= LIM.gap && w.dist <= LIM.dist
  const say = w => `length ${w.length.toFixed(3)}, end ${w.end.toFixed(3)}, gap ${w.gap.toFixed(3)}, reach used ${w.dist.toFixed(3)}, give ${w.stretch.toFixed(3)}, ${w.samples} samples${w.bad ? ', ' + w.bad + ' not finite' : ''}`

  /* grab a pendant and drag its centre along offsets (px), holding at the end */
  async function pull(name, offsets, { hold = 350, steps = 24 } = {}) {
    const c = await one(name)
    const [px, py] = toPx(c)
    await down(px, py)
    await page.waitForTimeout(60)
    let [lx, ly] = [px, py]
    for (const [ox, oy] of offsets) {
      const tx = px + ox, ty = py + oy
      for (let s = 1; s <= steps; s++) { await move(lx + (tx - lx) * s / steps, ly + (ty - ly) * s / steps); await page.waitForTimeout(12) }
      lx = tx; ly = ty
    }
    await page.waitForTimeout(hold)
    return { held: (await page.evaluate(() => window.__dbg.state().held)) }
  }
  async function settle(name, ms = 2600) {
    const w = await watch(name, () => page.waitForTimeout(ms))
    const c = await one(name)
    const [sx, sy] = toPx(c)
    const onScreen = sx > -c.R * k && sx < W + c.R * k && sy > -c.R * k && sy < H + c.R * k
    return { w, c, onScreen, held: await page.evaluate(() => window.__dbg.state().held) }
  }

  /* ---------- the hero pendant ---------- */
  const rest = await one('hero')
  check(`[${label}] hero: the cord is whole at rest`, !!rest && rest.length <= 1.05 && rest.end <= 1.03 && rest.gap <= 0.03, JSON.stringify(rest))

  const far = Math.max(W, H)
  const pulls = [
    ['down and left', [[-far * 0.55, far * 0.35]]],
    ['to the right', [[far * 0.7, 20]]],
    ['straight down', [[0, far * 0.6]]],
    ['up past the hang point', [[-30, -far * 0.55]]],
  ]
  for (const [dir, offsets] of pulls) {
    let grabbed = null
    const w = await watch('hero', async () => { grabbed = await pull('hero', offsets) })
    check(`[${label}] hero pulled ${dir}: the cord stays whole and the pendant stays on it`, grabbed.held === true && whole(w), `held ${grabbed.held}; ${say(w)}`)
    if (dir !== 'up past the hang point') check(`[${label}] hero pulled ${dir}: a taut cord gives a little`, w.stretch > 0.05 && w.stretch < 1.2, `give ${w.stretch.toFixed(3)} world units`)
    if (dir === 'down and left') await page.screenshot({ path: path.join(OUT, `cord-${label}-pulled.png`) })
    await up()
    const s = await settle('hero')
    check(`[${label}] hero let go after ${dir}: it comes back, whole and on screen`, s.held === false && s.onScreen && whole(s.w) && s.c.dist <= s.c.reach * LIM.dist && Math.abs(s.c.stretch) < 0.02, `on screen ${s.onScreen}; ${say(s.w)}; rest give ${s.c.stretch}`)
  }

  /* a scribble with the pendant in hand, then a throw */
  {
    let grabbed = null
    const pts = []
    for (let i = 0; i < 14; i++) pts.push([Math.sin(i * 2.1) * far * 0.6, Math.cos(i * 1.7) * far * 0.45])
    const w = await watch('hero', async () => { grabbed = await pull('hero', pts, { steps: 6, hold: 0 }) })
    await up()
    const s = await settle('hero', 3000)
    check(`[${label}] hero scribbled and thrown: the cord never breaks`, grabbed.held === true && whole(w) && whole(s.w) && s.onScreen, `held: ${say(w)} | after: ${say(s.w)}`)
  }

  /* the cursor shoving it around, including pressing down on it from above (mouse only) */
  if (!touch) {
    const c = await one('hero'); const [px, py] = toPx(c)
    const w = await watch('hero', async () => {
      for (let pass = 0; pass < 8; pass++) {
        const fromLeft = pass % 2 === 0
        for (let s = 0; s <= 16; s++) { await page.mouse.move(px + (fromLeft ? -260 + s * 32 : 260 - s * 32), py + (pass - 4) * 26); await page.waitForTimeout(8) }
      }
      for (let s = 0; s <= 30; s++) { await page.mouse.move(px, py - c.R * k * 1.6 + s * 9); await page.waitForTimeout(12) }   // press down on the top of it
      await page.waitForTimeout(600)
    })
    check(`[${label}] hero shoved by the cursor: the cord stays whole`, whole(w), say(w))
    await page.mouse.move(5, 5)
  }

  /* ---------- the page jumping under it ---------- */
  {
    const w = { length: 0, end: 0, gap: 0, dist: 0, bad: 0, n: 0 }
    for (const p of [0.02, 0.18, 0.05, 0.6, 0.0, 0.33, 0.0]) {
      await page.evaluate(v => window.__dbg.scrollTo(v), p)
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(50)
        for (const c of await cords()) {
          w.n++
          if (![c.length, c.end, c.gap, c.dist].every(Number.isFinite)) w.bad++
          w.length = Math.max(w.length, c.length); w.end = Math.max(w.end, c.end); w.gap = Math.max(w.gap, c.gap); w.dist = Math.max(w.dist, c.dist / c.reach)
        }
      }
    }
    check(`[${label}] jumping the page around: every cord on screen stays whole`, w.bad === 0 && w.n > 10 && w.length <= LIM.length && w.end <= 1.12 && w.gap <= 0.12, `length ${w.length.toFixed(3)}, end ${w.end.toFixed(3)}, gap ${w.gap.toFixed(3)}, ${w.n} samples`)
  }

  /* ---------- a scent pendant, and the one on the business card ---------- */
  for (const [name, chapter, local] of [['scent-1', 'scents', 0.75], ['finale', 'finale', 1]]) {
    await page.evaluate(([c, l]) => { const ch = window.__dbg.chapters().find(x => x.name === c); window.__dbg.scrollTo(ch.start + l * (ch.end - ch.start)) }, [chapter, local])
    await page.waitForTimeout(3000)
    const c = await one(name)
    if (!c) { check(`[${label}] ${name}: is hanging in its chapter`, false, 'not enabled'); continue }
    const [px, py] = toPx(c)
    if (px < 8 || px > W - 8 || py < 70 || py > H - 8) { console.log(`NOTE  [${label}] ${name} is not within reach of the pointer here (${Math.round(px)}, ${Math.round(py)}), skipped`); continue }
    let grabbed = null
    const w = await watch(name, async () => { grabbed = await pull(name, [[-far * 0.5, far * 0.3], [far * 0.5, far * 0.2]]) })
    check(`[${label}] ${name} pulled hard both ways: the cord stays whole and gives`, grabbed.held === true && whole(w) && w.stretch > 0.05, `held ${grabbed.held}; ${say(w)}`)
    if (name === 'finale') await page.screenshot({ path: path.join(OUT, `cord-${label}-finale-pulled.png`) })
    await up()
    const s = await settle(name)
    check(`[${label}] ${name} let go: it comes back, whole and on screen`, s.held === false && s.onScreen && whole(s.w), `on screen ${s.onScreen}; ${say(s.w)}`)
  }

  check(`[${label}] no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
}

console.log(fails ? `\n${fails} check${fails === 1 ? '' : 's'} failed` : '\nAll cord checks passed')
process.exit(fails ? 1 : 0)
