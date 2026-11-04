// Scroll tour + interaction probes, headless. Usage: node tour.mjs [desktop|phone|all]
import { chromium } from 'playwright'
import fs from 'fs'
import { fileURLToPath } from 'url'
const base = 'http://127.0.0.1:3001/index.html'
const out = fileURLToPath(new URL('./out/', import.meta.url))
fs.mkdirSync(out, { recursive: true })
const which = process.argv[2] || 'all'
const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}
const stops = [['hero', 0], ['drive', 0.3], ['drive', 0.47], ['drive', 0.64], ['drive', 0.88], ['drive', 0.985], ['sprout', 0.6], ['sprout', 0.95], ['scents', 0.12], ['scents', 0.7], ['cards', 0.4], ['inside', 0.15], ['inside', 0.75], ['firms', 0.3], ['about', 0.5], ['finale', 1]]

for (const [name, opts] of Object.entries(sizes)) {
  if (which !== 'all' && which !== name) continue
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.goto(base + '?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1800)
  const { width, height } = opts.viewport

  if (name === 'desktop') {
    const toPx = h => [width / 2 + h.x / (10 / height), height / 2 - h.y / (10 / height)]
    let h = await page.evaluate(() => __dbg.state().hero)
    let [px, py] = toPx(h)
    // 1. brush the cursor through the pendant
    await page.mouse.move(px + 220, py - 10)
    for (let i = 0; i <= 14; i++) { await page.mouse.move(px + 220 - i * 22, py - 10 + i * 2); await page.waitForTimeout(16) }
    await page.waitForTimeout(200)
    const afterHover = await page.evaluate(() => __dbg.state().hero)
    console.log('HOVER  before vx=%s x=%s | after vx=%s x=%s y=%s', h.vx, h.x, afterHover.vx, afterHover.x, afterHover.y)
    await page.waitForTimeout(2500)
    // 2. grab and throw
    h = await page.evaluate(() => __dbg.state().hero); [px, py] = toPx(h)
    await page.mouse.move(px, py); await page.mouse.down()
    for (let i = 1; i <= 12; i++) { await page.mouse.move(px - i * 20, py + i * 4); await page.waitForTimeout(16) }
    const whileHeld = await page.evaluate(() => ({ held: __dbg.state().held, hero: __dbg.state().hero }))
    await page.mouse.up()
    await page.waitForTimeout(120)
    const afterThrow = await page.evaluate(() => __dbg.state().hero)
    console.log('GRAB   held=%s heldX=%s | released vx=%s x=%s', whileHeld.held, whileHeld.hero.x, afterThrow.vx, afterThrow.x)
    await page.mouse.move(width * 0.1, height * 0.9)
    await page.waitForTimeout(2500)
    // 3. scrolling swings it
    const calm = await page.evaluate(() => __dbg.state().hero)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(250)
    const scrolled = await page.evaluate(() => ({ hero: __dbg.state().hero, p: __dbg.state().progress }))
    console.log('SCROLL calm vx=%s | after wheel vx=%s progress=%s', calm.vx, scrolled.hero && scrolled.hero.vx, scrolled.p)
  }

  let i = 0
  for (const [chName, local] of stops) {
    await page.evaluate(([c, l]) => { const ch = __dbg.chapters().find(x => x.name === c); __dbg.scrollTo(ch.start + l * (ch.end - ch.start)) }, [chName, local])
    await page.waitForTimeout(1000)
    const st = await page.evaluate(() => { const s = __dbg.state(); return { ch: s.chapter, soil: s.soil, theme: s.theme, plant: s.plant, hero: s.hero && [s.hero.x, s.hero.y], scents: s.scents, finale: s.finale } })
    const file = `${name}-${String(i++).padStart(2, '0')}-${chName}-${local}.png`
    await page.screenshot({ path: out + file })
    console.log(name.padEnd(8), chName.padEnd(7), String(local).padEnd(5), JSON.stringify(st))
  }
  const fps = await page.evaluate(async () => { const a = __dbg.state().frames; await new Promise(r => setTimeout(r, 1000)); return __dbg.state().frames - a })
  console.log(name, 'fps', fps)
  console.log(name, 'console errors:', errors.length ? errors : 'none')
  await browser.close()
}
