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
   Every frame is recorded inside the page, and the drawn cord is checked too: the
   pieces meet end to end, the bead sits on the cord, the strands reach the ring.

   The hand: a second finger, a right click mid-drag, a finger lifted (its invisible
   ball must go with it), and afterwards every pendant hangs free (not frozen),
   faces the visitor and sways on its own beat. On a short phone the hero's cord,
   cut to clear the hero copy, pays out again so the pendant hangs clear of the nav
   in the next chapter; the hero never leaves its card through the top.

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

  /* the page's own physics module (the same instance the page runs) */
  await page.evaluate(async () => { window.__P = await import(new URL('js/physics.js', document.baseURI).href) })

  /* Worst numbers seen for one cord while fn runs, recorded on every frame inside the page, after
     the frame is drawn. "drawn" is the largest gap in what is on screen: between neighbouring cord
     pieces, between the last piece and the bead, and between the strands and the bead and ring. */
  async function watch(name, fn) {
    await page.evaluate(name => {
      const P = window.__P
      const r = { length: 0, end: 0, gap: 0, dist: 0, stretch: 0, bad: 0, samples: 0, drawn: 0 }
      const ends = m => { const e = m.matrixWorld.elements; return [[e[12] - e[4] / 2, e[13] - e[5] / 2, e[14] - e[6] / 2], [e[12] + e[4] / 2, e[13] + e[5] / 2, e[14] + e[6] / 2]] }
      const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      const near = (A, B) => Math.min(dd(A[0], B[0]), dd(A[0], B[1]), dd(A[1], B[0]), dd(A[1], B[1]))
      const tick = () => {
        const h = P.hangers.find(x => x.name === name && x.enabled)
        if (!h) return
        const c = window.__dbg.cord().find(x => x.name === name)
        if (!c) return
        r.samples++
        if (![c.length, c.end, c.gap, c.dist].every(Number.isFinite)) { r.bad++; return }
        r.length = Math.max(r.length, c.length); r.end = Math.max(r.end, c.end); r.gap = Math.max(r.gap, c.gap)
        r.dist = Math.max(r.dist, c.dist / c.reach); r.stretch = Math.max(r.stretch, c.stretch)
        const shown = h.cordMeshes.filter(m => m.visible).map(ends)
        let worst = 0
        for (let i = 1; i < shown.length; i++) worst = Math.max(worst, near(shown[i - 1], shown[i]))
        const be = h.bead.matrixWorld.elements, bead = [be[12], be[13], be[14]]
        if (shown.length) worst = Math.max(worst, Math.min(dd(shown[shown.length - 1][0], bead), dd(shown[shown.length - 1][1], bead)))
        for (const st of [h.strandA, h.strandB]) { const E = ends(st); worst = Math.max(worst, Math.min(dd(E[0], bead), dd(E[1], bead))) }
        // the top of the drawn cord sits at the hang point (drawn a little behind the ring) ...
        const pe = h.cordMeshes[0].parent.matrixWorld.elements, at = h.anchor.translation(), az = at.z - h.R * 0.2
        const hang = [pe[0] * at.x + pe[4] * at.y + pe[8] * az + pe[12], pe[1] * at.x + pe[5] * at.y + pe[9] * az + pe[13], pe[2] * at.x + pe[6] * at.y + pe[10] * az + pe[14]]
        if (shown.length) worst = Math.max(worst, Math.min(dd(shown[0][0], hang), dd(shown[0][1], hang)))
        // ... and the two strands end on the top of the ring
        const me = h.mesh.matrixWorld.elements
        const ring = sx => { const x = sx * h.R * 0.26, y = h.R * 0.985; return [me[0] * x + me[4] * y + me[12], me[1] * x + me[5] * y + me[13], me[2] * x + me[6] * y + me[14]] }
        const ra = ring(-1), rb = ring(1), EA = ends(h.strandA), EB = ends(h.strandB)
        worst = Math.max(worst, Math.min(dd(EA[0], ra), dd(EA[1], ra)), Math.min(dd(EB[0], rb), dd(EB[1], rb)))
        r.drawn = Math.max(r.drawn, worst)
      }
      gsap.ticker.add(tick)
      window.__rec = { r, stop: () => gsap.ticker.remove(tick) }
    }, name)
    await fn()
    return page.evaluate(() => { window.__rec.stop(); return window.__rec.r })
  }
  const whole = w => w.bad === 0 && w.samples > 3 && w.length <= LIM.length && w.end <= LIM.end && w.gap <= LIM.gap && w.dist <= LIM.dist && w.drawn <= 0.02
  const say = w => `length ${w.length.toFixed(3)}, end ${w.end.toFixed(3)}, gap ${w.gap.toFixed(3)}, reach used ${w.dist.toFixed(3)}, give ${w.stretch.toFixed(3)}, drawn gap ${w.drawn.toFixed(4)}, ${w.samples} frames${w.bad ? ', ' + w.bad + ' not finite' : ''}`
  /* the hang point to pendant distance on every frame for 300 ms from now, inside the page */
  const trail = name => page.evaluate(name => new Promise(done => {
    const h = window.__P.hangers.find(x => x.name === name), t0 = performance.now(), out = []
    const tick = () => { const t = h.body.translation(), a = h.anchor.translation(); out.push(Math.hypot(t.x - a.x, t.y - a.y)); if (performance.now() - t0 < 300) requestAnimationFrame(tick); else done(out) }
    tick()
  }), name)

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
    const after = trail('hero')
    await up()
    if (dir !== 'up past the hang point' && w.stretch >= 0.2) {
      // the snap: a clearly stretched cord pulls the pendant back toward the hang point at once
      // (the snap grows with the stretch; a cord barely stretched just lets the pendant swing back)
      const tr = await after, reach = (await one('hero')).reach, drop = (tr[0] - Math.min(...tr)) / reach
      check(`[${label}] hero let go after ${dir}: the taut cord snaps it back`, drop >= 0.1, `${(drop * 100).toFixed(0)}% of its reach closer within 300 ms (${tr.length} frames, give ${w.stretch.toFixed(2)})`)
    } else {
      await after
      if (dir !== 'up past the hang point') console.log(`NOTE  [${label}] hero pulled ${dir}: the cord only gave ${w.stretch.toFixed(2)} (the card's edge stopped the pull), so a gentle swing back is expected, not a snap`)
    }
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

  /* ---------- the hand ---------- */
  const pend = () => page.evaluate(() => window.__P.hangers.filter(h => h.enabled).map(h => {
    const t = h.body.translation(), r = h.body.rotation(), a = h.anchor.translation()
    const yaw = Math.atan2(2 * (r.x * r.z + r.w * r.y), 1 - 2 * (r.x * r.x + r.y * r.y)) * 180 / Math.PI
    return { name: h.name, type: h.body.bodyType(), yaw: Math.abs(yaw), dx: t.x - a.x, x: t.x, y: t.y, R: h.R }
  }))
  const scents = async () => {
    await page.evaluate(() => { const ch = window.__dbg.chapters().find(x => x.name === 'scents'); window.__dbg.scrollTo(ch.start + 0.75 * (ch.end - ch.start)) })
    await page.waitForTimeout(3200)
  }

  /* the hero stays inside its card: pulled up hard, straight or diagonally, it stops under the card's top edge */
  await page.evaluate(() => window.__dbg.scrollTo(0))
  await page.waitForTimeout(2500)
  for (const [way, sx] of [['straight up', 0.004], ['up and to the left', -0.035], ['up and to the right', 0.03]]) {
    const c = await one('hero')
    const [px, py] = toPx(c)
    const top = await page.evaluate(() => document.getElementById('card-panel').getBoundingClientRect().top)
    let worst = Infinity
    await down(px, py)
    for (let s = 1; s <= 24; s++) {
      await move(px + s * W * sx, py - s * (H * 0.04)); await page.waitForTimeout(14)
      if (s > 12) { const h = (await pend()).find(p => p.name === 'hero'); worst = Math.min(worst, H / 2 - (h.y + h.R) * k) }
    }
    await page.waitForTimeout(300)
    const h = (await pend()).find(p => p.name === 'hero')
    worst = Math.min(worst, H / 2 - (h.y + h.R) * k)
    await up()
    check(`[${label}] hero pulled ${way}: it stays inside its card`, worst >= top - 3, `highest ring top ${worst.toFixed(0)} px, card top ${top.toFixed(0)} px`)
    await page.waitForTimeout(1800)
  }

  await scents()
  let list = await pend()
  if (list.filter(p => p.name.startsWith('scent')).length !== 3) check(`[${label}] the three scents hang in their chapter`, false, JSON.stringify(list.map(p => p.name)))
  else {
    const at = name => { const p = list.find(q => q.name === name); return toPx(p) }
    if (touch) {
      /* a second finger on another pendant: ignored, and nothing is left frozen */
      const [ax, ay] = at('scent-1'), [bx, by] = at('scent-0')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay, id: 1 }] })
      for (let s = 1; s <= 8; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ax + s * 6, y: ay + s * 3, id: 1 }] }); await page.waitForTimeout(16) }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax + 48, y: ay + 24, id: 1 }, { x: bx, y: by, id: 2 }] })
      for (let s = 1; s <= 6; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ax + 48 + s * 4, y: ay + 24, id: 1 }, { x: bx - s * 8, y: by + s * 4, id: 2 }] }); await page.waitForTimeout(16) }
      const during = await page.evaluate(() => ({ held: window.__P.grab.held && window.__P.grab.held.name, types: window.__P.hangers.filter(h => h.enabled).map(h => h.name + ':' + h.body.bodyType()) }))
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: ax + 72, y: ay + 24, id: 1 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(1500)
      list = await pend()
      check(`[${label}] a second finger on another pendant is ignored: the first stays in hand, the second is not grabbed`, during.held === 'scent-1' && !during.types.includes('scent-0:2'), JSON.stringify(during))
      check(`[${label}] after both fingers lift, every pendant hangs free again (none left frozen)`, list.every(p => p.type === 0), list.map(p => p.name + ':' + p.type).join(' '))
      /* a lifted finger takes its invisible ball with it */
      const [cx, cy] = at('scent-2')
      await down(cx, cy)
      for (let s = 1; s <= 10; s++) { await move(cx - s * 6, cy + s * 2); await page.waitForTimeout(16) }
      await up()
      await page.waitForTimeout(400)
      const ball = await page.evaluate(() => ({ active: window.__P.cursor.active }))
      check(`[${label}] a lifted finger leaves no invisible ball behind`, ball.active === false, JSON.stringify(ball))
    } else {
      /* a right click mid-drag: the grab ends when the left button does */
      const [ax, ay] = at('scent-1')
      await page.mouse.move(ax, ay); await page.mouse.down()
      for (let s = 1; s <= 8; s++) { await page.mouse.move(ax + s * 8, ay + s * 4); await page.waitForTimeout(16) }
      await page.mouse.down({ button: 'right' })
      await page.mouse.up({ button: 'left' })
      const before = (await pend()).find(p => p.name === 'scent-1')
      for (let s = 1; s <= 12; s++) { await page.mouse.move(ax + 64 + s * 20, ay + 32); await page.waitForTimeout(16) }
      await page.mouse.up({ button: 'right' })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const held = await page.evaluate(() => window.__dbg.state().held)
      const after = (await pend()).find(p => p.name === 'scent-1')
      check(`[${label}] a right click mid-drag: letting go of the left button lets go of the pendant`, held === false && after.type === 0 && Math.abs((after.x - before.x) * k) < 120, `held ${held}, type ${after.type}, moved ${((after.x - before.x) * k).toFixed(0)} px while only the right button was down`)
      await page.mouse.move(5, 5)
    }
    /* afterwards: every pendant faces the visitor */
    await page.waitForTimeout(8000)
    list = await pend()
    const sc = list.filter(p => p.name.startsWith('scent'))
    check(`[${label}] at rest every scent pendant hangs free and faces the visitor`, sc.every(p => p.type === 0 && p.yaw < 6), sc.map(p => `${p.name} ${p.type === 0 ? 'free' : 'FROZEN'} ${p.yaw.toFixed(1)} deg`).join(', '))
    /* and they sway on their own beats: record their sideways offsets for 3 s */
    await page.mouse.move(5, 5)
    await page.waitForTimeout(touch ? 200 : 5600)   // with a mouse the breeze starts after 5 s without a touch
    const series = await page.evaluate(async () => {
      const out = { 'scent-0': [], 'scent-1': [], 'scent-2': [] }
      for (let i = 0; i < 90; i++) {
        for (const h of window.__P.hangers) if (out[h.name] && h.enabled) out[h.name].push(h.body.translation().x - h.anchor.translation().x)
        await new Promise(r => setTimeout(r, 33))
      }
      return out
    })
    const corr = (a, b) => { const n = Math.min(a.length, b.length), ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2 } return c / Math.sqrt(va * vb || 1) }
    const r01 = corr(series['scent-0'], series['scent-1']), r12 = corr(series['scent-1'], series['scent-2'])
    check(`[${label}] the three scents sway on their own beats, not as one`, r01 < 0.97 && r12 < 0.97, `correlation ${r01.toFixed(3)} and ${r12.toFixed(3)}`)
  }

  check(`[${label}] no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
}

/* ---------- a short phone: the hero cord cut for the card pays out for the drive ---------- */
for (const [w, h] of [[375, 667], [390, 664], [320, 568], [390, 844]]) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  if (DRAFT) await ctx.route('**/js/physics.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: DRAFT }))
  const page = await ctx.newPage()
  await page.goto(BASE + 'index.html?bust=' + Date.now(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state && window.__dbg.state().ready, null, { timeout: 60000 })
  await page.waitForTimeout(1500)
  const read = () => page.evaluate(async () => {
    const P = await import(new URL('js/physics.js', document.baseURI).href)
    const hh = P.hangers.find(x => x.name === 'hero')
    if (!hh || !hh.enabled) return null
    const t = hh.body.translation()
    const nav = document.getElementById('nav').getBoundingClientRect().bottom
    return { L: hh.L, ringTop: innerHeight / 2 - (t.y + hh.R) * innerHeight / 10, nav }
  })
  const card = await read()
  let worst = Infinity, L = 0
  for (const pin of [0.12, 0.38, 0.62]) {
    await page.evaluate(p => { const ch = window.__dbg.chapters().find(x => x.name === 'drive'); window.__dbg.scrollTo(ch.start + (ch.end - ch.start) * (0.3 + 0.6 * p)) }, pin)
    await page.waitForTimeout(1800)
    const where = await page.evaluate(() => window.__dbg.state().chapter)
    if (where !== 'drive') { check(`[${w}x${h}] the probe reached the drive chapter`, false, where); continue }
    const r = await read()
    if (r) { worst = Math.min(worst, r.ringTop - r.nav); L = r.L }
  }
  check(`[${w}x${h}] in the drive the hero pendant hangs clear of the nav`, Number.isFinite(worst) && worst >= 20, `ring top ${worst.toFixed(0)} px below the nav; cord ${card ? card.L.toFixed(2) : '?'} on the card, ${L.toFixed(2)} in the drive`)
  await browser.close()
}

console.log(fails ? `\n${fails} check${fails === 1 ? '' : 's'} failed` : '\nAll cord checks passed')
process.exit(fails ? 1 : 0)
