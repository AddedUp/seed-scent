// (2) Performance: baseline fps, then CPU throttled 4x via CDP. Measures frames per second from a
// rAF recorder during 6 s at rest in the hero and during a 6 s wheel-driven scroll through the
// drive chapter, plus frame-time distribution, long tasks, boot time, and physics sanity
// (NaN, chain stretch, teleports). Screenshots of the throttled run go to out/rev-perf-*.png.
import { chromium, base, out, bust, watch, sleep, stat, READY } from './review-lib.mjs'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => {
  window.__lt = []
  try { new PerformanceObserver(list => list.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }) } catch {}
})
const page = await ctx.newPage()
const { errors } = watch(page)
const cdp = await ctx.newCDPSession(page)

const L = 2.5, R = 1.35 // hero rope + radius on desktop (main.js)

async function installRecorder() {
  await page.evaluate(() => {
    window.__rec = { times: [], hero: [], run: false }
    function tick(now) {
      if (!window.__rec.run) return
      window.__rec.times.push(now)
      const s = __dbg.state()
      if (s.hero) window.__rec.hero.push({ x: s.hero.x, y: s.hero.y, ax: s.hero.anchor.x, ay: s.hero.anchor.y, vx: s.hero.vx, vy: s.hero.vy, p: s.progress, ch: s.chapter })
      else window.__rec.hero.push({ none: true, p: s.progress, ch: s.chapter })
      requestAnimationFrame(tick)
    }
    window.__recStart = () => { window.__rec = { times: [], hero: [], run: true, frames0: __dbg.state().frames }; requestAnimationFrame(tick) }
    window.__recStop = () => { window.__rec.run = false; window.__rec.frames1 = __dbg.state().frames; return window.__rec }
  })
}

function analyse(label, rec) {
  const t = rec.times, d = []
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1])
  const span = (t[t.length - 1] - t[0]) / 1000
  const fps = (t.length - 1) / span
  let nan = 0, maxStretch = 0, maxJump = 0, maxSpeed = 0, none = 0
  for (let i = 0; i < rec.hero.length; i++) {
    const h = rec.hero[i]
    if (h.none) { none++; continue }
    if ([h.x, h.y, h.vx, h.vy].some(v => !Number.isFinite(v))) nan++
    maxStretch = Math.max(maxStretch, Math.hypot(h.x - h.ax, h.y - h.ay) / (L + R))
    maxSpeed = Math.max(maxSpeed, Math.hypot(h.vx, h.vy))
    const prev = rec.hero[i - 1]
    if (prev && !prev.none) maxJump = Math.max(maxJump, Math.hypot(h.x - prev.x, h.y - prev.y))
  }
  // physics time scale: main.js caps dt at 0.05 and physics.js caps the timestep at 1/30
  const meanDt = span / (t.length - 1)
  const simStep = Math.min(Math.max(Math.min(0.05, meanDt), 1 / 120), 1 / 30)
  const r = {
    label, frames: t.length, seconds: +span.toFixed(2), fps: +fps.toFixed(1), tickerFps: +(((rec.frames1 - rec.frames0) / span)).toFixed(1),
    frameMs: stat(d), framesOver50ms: d.filter(x => x > 50).length, framesOver100ms: d.filter(x => x > 100).length,
    physicsTimeScale: +(simStep / meanDt).toFixed(2),
    nan, maxStretchOfRope: +maxStretch.toFixed(2), maxJumpPerFrame: +maxJump.toFixed(2), maxSpeed: +maxSpeed.toFixed(2), heroAbsentFrames: none,
    progress: [rec.hero[0] && rec.hero[0].p, rec.hero[rec.hero.length - 1] && rec.hero[rec.hero.length - 1].p], chapters: [...new Set(rec.hero.map(h => h.ch))],
  }
  console.log(JSON.stringify(r))
  return r
}

async function measureRest(label, seconds) {
  await page.evaluate(() => window.__recStart())
  await sleep(seconds * 1000)
  return analyse(label, await page.evaluate(() => window.__recStop()))
}

async function smoothScrollDrive(seconds, shotTag) {
  const drive = await page.evaluate(() => __dbg.chapters().find(c => c.name === 'drive'))
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  await page.evaluate(p => __dbg.scrollTo(p), drive.start)
  await sleep(900)
  await page.mouse.move(120, 860) // away from the pendant (which hangs at ~66% across)
  const total = (drive.end - drive.start) * max
  const steps = Math.round((seconds * 1000) / 50)
  const step = total / steps
  const shotAt = shotTag ? [0.2, 0.45, 0.7, 0.95].map(f => Math.round(steps * f)) : []
  await page.evaluate(() => window.__recStart())
  const t0 = Date.now()
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step)
    if (shotAt.includes(i)) {
      const st = await page.evaluate(() => { const s = __dbg.state(); return { p: s.progress, pin: s.locals.drive.pin, hero: s.hero && { x: s.hero.x, y: s.hero.y, vx: s.hero.vx } } })
      await page.screenshot({ path: out + `rev-perf-${shotTag}-drive-${i}.png` })
      console.log('shot', shotTag, i, JSON.stringify(st))
    }
    const wait = t0 + (i + 1) * 50 - Date.now()
    if (wait > 0) await sleep(wait)
  }
  return page.evaluate(() => window.__recStop())
}

/* ---------- baseline, unthrottled ---------- */
let t0 = Date.now()
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page.waitForFunction(READY, null, { timeout: 60000 })
console.log('baseline: ready after ms', Date.now() - t0, 'long tasks during boot (ms):', JSON.stringify(await page.evaluate(() => window.__lt)))
await sleep(1500)
await installRecorder()
await measureRest('baseline: hero at rest 3s', 3)
analyse('baseline: 6s wheel scroll through drive', await smoothScrollDrive(6, null))

/* ---------- 4x CPU throttle ---------- */
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
t0 = Date.now()
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
const loadMs = Date.now() - t0
await page.waitForFunction(READY, null, { timeout: 180000 })
const readyMs = Date.now() - t0
console.log('throttled 4x: load event ms', loadMs, 'ready ms', readyMs, 'long tasks during boot (ms):', JSON.stringify(await page.evaluate(() => window.__lt)))
await sleep(1500)
await installRecorder()
await measureRest('4x: hero at rest 6s', 6)
await page.screenshot({ path: out + 'rev-perf-4x-hero-rest.png' })
analyse('4x: 6s wheel scroll through drive', await smoothScrollDrive(6, null))
// second pass, same scroll, with screenshots (the screenshots themselves cost frames, so not timed)
const shotRec = await smoothScrollDrive(6, '4x')
analyse('4x: same scroll with screenshots (not representative)', shotRec)
await sleep(1500)
const after = await page.evaluate(() => { const s = __dbg.state(); return { chapter: s.chapter, p: s.progress, drivePin: s.locals.drive.pin, hero: s.hero, plant: s.plant, soil: s.soil, hangers: __dbg.hangers() } })
console.log('after throttled scroll + 1.5s:', JSON.stringify(after))
await page.screenshot({ path: out + 'rev-perf-4x-after-scroll.png' })
console.log('long tasks total (ms list, last 20):', JSON.stringify((await page.evaluate(() => window.__lt)).slice(-20)))
console.log('errors:', JSON.stringify(errors))
await browser.close()
