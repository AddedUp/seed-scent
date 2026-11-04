// Follow-up probes: whole-page chip totals, duplicate chip groups, crops.
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const base = 'http://127.0.0.1:3001/'
const out = fileURLToPath(new URL('./out/', import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + 'index.html?bust=' + Date.now())
await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
await page.waitForTimeout(1200)
const totals = await page.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(el => getComputedStyle(el).display !== 'none')
  const groups = {}
  document.querySelectorAll('[data-ph]').forEach(el => { const k = el.dataset.ph; groups[k] = (groups[k] || 0) + 1 })
  const dup = Object.entries(groups).filter(([, n]) => n > 1)
  const y = sel => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null }
  return { ph: vis('.ph').length, tbc: vis('.tbc').length, chips3d: document.querySelectorAll('.chip .ph').length, dup, aboutMetaY: y('.about-meta .ph'), bizRowsY: y('.biz-rows .ph'), footerY: y('.footer .ph'), docH: document.documentElement.scrollHeight }
})
console.log('index totals', JSON.stringify(totals))
// annotation line count + width at desktop
const ann = await page.evaluate(() => { const el = document.querySelector('.ch-scents .annotation'); const r = el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(el).lineHeight); return { w: Math.round(r.width), lines: Math.round(r.height / lh), fs: getComputedStyle(el).fontSize } })
console.log('scents annotation', JSON.stringify(ann))
// finale crop and cards chip crop
await page.evaluate(() => { const ch = __dbg.chapters().find(x => x.name === 'finale'); __dbg.scrollTo(ch.end) })
await page.waitForTimeout(1000)
const pill = await page.evaluate(() => { const r = document.querySelector('.biz-copy .pill').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } })
await page.screenshot({ path: out + 'rv-desktop-finale-pill.png', clip: { x: Math.max(0, pill.x - 20), y: Math.max(0, pill.y - 160), width: 420, height: 230 } })
console.log('finale pill crop', JSON.stringify(pill))
await page.evaluate(() => { const ch = __dbg.chapters().find(x => x.name === 'inside'); __dbg.scrollTo(ch.start + 0.15 * (ch.end - ch.start)) })
await page.waitForTimeout(1000)
await page.screenshot({ path: out + 'rv-desktop-cards-chips.png', clip: { x: 0, y: 100, width: 1440, height: 320 } })
// footer crop
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(800)
const foot = await page.evaluate(() => { const r = document.querySelector('.footer').getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height) } })
await page.screenshot({ path: out + 'rv-desktop-footer.png', clip: { x: 0, y: Math.max(0, foot.y - 10), width: 1440, height: foot.h + 30 } })
await browser.close()
