// reduced-motion run + booth laptop sizes
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const out = fileURLToPath(new URL('./out/', import.meta.url))
const browser = await chromium.launch()
// 1. prefers-reduced-motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.goto('http://127.0.0.1:3001/index.html?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const a = await page.evaluate(() => ({ paused: __dbg.motion.paused, lenis: !!window.Lenis, hero: __dbg.state().hero, reducedBody: document.body.classList.contains('reduced') }))
  await page.mouse.wheel(0, 2200); await page.waitForTimeout(800)
  const b = await page.evaluate(() => ({ progress: __dbg.state().progress, chapter: __dbg.state().chapter, hero: __dbg.state().hero }))
  await page.screenshot({ path: out + 'reduced-drive.png' })
  console.log('REDUCED start', JSON.stringify(a)); console.log('REDUCED after wheel', JSON.stringify(b)); console.log('REDUCED errors', errors.length ? errors : 'none')
  await ctx.close()
}
// 2. booth laptop sizes, hero only
for (const [w, h] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:3001/index.html?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(2200)
  const overlap = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect()
    const logo = r('.hero-logo'), copy = r('.hero-copy'), cue = r('#cue')
    return { logoBottom: Math.round(logo.bottom), copyTop: Math.round(copy.top), overlap: logo.bottom > copy.top, cueBottom: Math.round(cue.bottom), vh: innerHeight }
  })
  await page.screenshot({ path: out + `hero-${w}x${h}.png` })
  console.log(`HERO ${w}x${h}`, JSON.stringify(overlap))
  await ctx.close()
}
await browser.close()
