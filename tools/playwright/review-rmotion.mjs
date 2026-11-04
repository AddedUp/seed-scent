// (4) prefers-reduced-motion: reduce. Loads the home page, checks the motion flags, samples the hero
// pendant at rest (auto-motion?), scrolls through, measures how long the pendant keeps swinging
// after a scroll stops, and pixel-diffs two screenshots 600 ms apart in the "Breathe" beat to catch
// anything still animating on its own. Screenshots: out/rev-rmotion-*.png
import { chromium, base, out, bust, watch, sleep, READY } from './review-lib.mjs'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const { errors } = watch(page)
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page.waitForFunction(READY, null, { timeout: 60000 })
await sleep(1500)

const flags = await page.evaluate(() => ({
  prefersReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  motionPaused: __dbg.motion.paused,
  toggleText: document.getElementById('motion-toggle').textContent.trim(), togglePressed: document.getElementById('motion-toggle').getAttribute('aria-pressed'),
  bodyReducedClass: document.body.classList.contains('reduced'),
  htmlClass: document.documentElement.className, // lenis adds classes when it runs
  cueAnimation: getComputedStyle(document.getElementById('cue')).animationName,
  splitLines: document.querySelectorAll('.split-line').length,
  rvElements: document.querySelectorAll('.rv').length,
  hintClass: document.getElementById('push-hint').className,
  hero: __dbg.state().hero,
}))
console.log('flags', JSON.stringify(flags, null, 1))

/* hero at rest: 40 samples over 4 s */
const rest = []
for (let i = 0; i < 40; i++) { rest.push(await page.evaluate(() => { const h = __dbg.state().hero; return h && { x: h.x, y: h.y, vx: h.vx, vy: h.vy, rz: h.rz } })); await sleep(100) }
const xs = rest.map(r => r.x), ys = rest.map(r => r.y)
const restStats = { dx: +(Math.max(...xs) - Math.min(...xs)).toFixed(4), dy: +(Math.max(...ys) - Math.min(...ys)).toFixed(4), maxSpeed: +Math.max(...rest.map(r => Math.hypot(r.vx, r.vy))).toFixed(4), maxRz: +Math.max(...rest.map(r => Math.abs(r.rz))).toFixed(4) }
console.log('hero at rest over 4s (world units):', JSON.stringify(restStats))
// pendant on screen?
const onScreen = await page.evaluate(() => { const h = __dbg.state().hero; const wpp = 10 / innerHeight; const x = innerWidth / 2 + h.x / wpp, y = innerHeight / 2 - h.y / wpp; return { px: Math.round(x), py: Math.round(y), inView: x > 0 && x < innerWidth && y > 0 && y < innerHeight } })
console.log('pendant projected to screen:', JSON.stringify(onScreen))
await page.screenshot({ path: out + 'rev-rmotion-hero.png' })

/* scroll through in 40 steps, watching for errors / NaN */
let bad = 0
for (let i = 0; i <= 40; i++) {
  await page.evaluate(p => __dbg.scrollTo(p), i / 40)
  await sleep(150)
  const s = await page.evaluate(() => { const s = __dbg.state(); return { ch: s.chapter, hero: s.hero, scents: s.scents, finale: s.finale } })
  const vals = [s.hero, ...s.scents, s.finale].filter(Boolean).flatMap(o => Object.values(o).filter(v => typeof v === 'number'))
  if (vals.some(v => !Number.isFinite(v))) bad++
}
console.log('scroll sweep done; frames with non-finite values:', bad)

/* find the "Breathe" beat (drive.pin ~ 0.35) */
const drive = await page.evaluate(() => __dbg.chapters().find(c => c.name === 'drive'))
let pBreathe = null
for (let i = 0; i <= 60; i++) {
  const p = drive.start + (i / 60) * (drive.end - drive.start)
  const pin = await page.evaluate(p => { __dbg.scrollTo(p); return null }, p)
  await sleep(40)
  const st = await page.evaluate(() => __dbg.state().locals.drive)
  if (st.pin >= 0.35) { pBreathe = p; break }
}
await page.evaluate(p => __dbg.scrollTo(p), pBreathe)
// how long does the pendant keep moving after the scroll stops?
const settle = []
for (let i = 0; i < 60; i++) { settle.push(await page.evaluate(() => { const h = __dbg.state().hero; return h ? +Math.hypot(h.vx, h.vy).toFixed(3) : null })); await sleep(100) }
const firstCalm = settle.findIndex((v, i) => v !== null && v < 0.08 && settle.slice(i, i + 5).every(w => w !== null && w < 0.08))
console.log('after a scroll jump into the Breathe beat, pendant speed samples (every 100 ms):', JSON.stringify(settle.slice(0, 30)), '| calm after ms:', firstCalm < 0 ? '>6000' : firstCalm * 100)

/* two screenshots 600 ms apart, then diff them in a same-origin page */
await sleep(600)
const stateA = await page.evaluate(() => { const s = __dbg.state(); return { pin: s.locals.drive.pin, hero: s.hero, fade: s.fade } })
await page.screenshot({ path: out + 'rev-rmotion-breathe-A.png' })
await sleep(600)
await page.screenshot({ path: out + 'rev-rmotion-breathe-B.png' })
const stateB = await page.evaluate(() => { const s = __dbg.state(); return { pin: s.locals.drive.pin, hero: s.hero } })
console.log('breathe A', JSON.stringify(stateA), '\nbreathe B', JSON.stringify(stateB))

const diffPage = await ctx.newPage()
await diffPage.goto(base + 'checkout.html' + bust())
const diff = await diffPage.evaluate(async () => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src + '?b=' + Date.now() })
  const [a, b] = await Promise.all([load('/tools/playwright/out/rev-rmotion-breathe-A.png'), load('/tools/playwright/out/rev-rmotion-breathe-B.png')])
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height
  const g = c.getContext('2d')
  g.drawImage(a, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data
  g.drawImage(b, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data
  let changed = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) > 10 || Math.abs(da[i + 1] - db[i + 1]) > 10 || Math.abs(da[i + 2] - db[i + 2]) > 10) {
      changed++
      const p = i / 4, x = p % c.width, y = Math.floor(p / c.width)
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return { changedPixels: changed, pct: +((changed / (c.width * c.height)) * 100).toFixed(3), box: changed ? [minX, minY, maxX, maxY] : null }
})
console.log('pixel diff between A and B (600 ms apart, no input):', JSON.stringify(diff))

/* and the same diff at rest in the hero */
await page.evaluate(() => __dbg.scrollTo(0)); await sleep(2500)
await page.screenshot({ path: out + 'rev-rmotion-hero-A.png' }); await sleep(600); await page.screenshot({ path: out + 'rev-rmotion-hero-B.png' })
const diffHero = await diffPage.evaluate(async () => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src + '?b=' + Date.now() })
  const [a, b] = await Promise.all([load('/tools/playwright/out/rev-rmotion-hero-A.png'), load('/tools/playwright/out/rev-rmotion-hero-B.png')])
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height
  const g = c.getContext('2d')
  g.drawImage(a, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data
  g.drawImage(b, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data
  let changed = 0
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 10 || Math.abs(da[i + 1] - db[i + 1]) > 10 || Math.abs(da[i + 2] - db[i + 2]) > 10) changed++
  return { changedPixels: changed, pct: +((changed / (c.width * c.height)) * 100).toFixed(3) }
})
console.log('pixel diff at rest in the hero (600 ms apart):', JSON.stringify(diffHero))
console.log('errors:', JSON.stringify(errors))
await browser.close()
