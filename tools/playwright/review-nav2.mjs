// Follow-up to review-nav: how long the hero pendant keeps swinging after a Lenis-animated return
// to the top (nav link -> brand), with motion on and with motion paused; samples every 200 ms for 8 s.
import { chromium, base, bust, watch, sleep, READY } from './review-lib.mjs'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const { errors } = watch(page)
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page.waitForFunction(READY, null, { timeout: 60000 })
await sleep(1500)

const sample = () => { const s = __dbg.state(); const h = s.hero; return h ? { p: +s.progress.toFixed(3), dx: +(h.x - h.anchor.x).toFixed(2), speed: +Math.hypot(h.vx, h.vy).toFixed(2), tiltDeg: +(h.rz * 180 / Math.PI).toFixed(0), z: +h.z.toFixed(2) } : { p: +s.progress.toFixed(3), hero: null } }

async function scenario(label) {
  await page.locator('.nav-links a[data-nav="firms"]').click(); await sleep(2200)
  await page.locator('.brand').click()
  const t0 = Date.now(), rows = []
  while (Date.now() - t0 < 8000) { rows.push({ t: Date.now() - t0, ...(await page.evaluate(sample)) }); await sleep(200) }
  const calmIdx = rows.findIndex((r, i) => r.dx !== undefined && Math.abs(r.dx) < 0.5 && r.speed < 2 && rows.slice(i, i + 5).every(q => q.dx !== undefined && Math.abs(q.dx) < 0.5 && q.speed < 2))
  const stillIdx = rows.findIndex((r, i) => r.dx !== undefined && Math.abs(r.dx) < 0.25 && Math.abs(r.tiltDeg) < 8 && rows.slice(i, i + 5).every(q => q.dx !== undefined && Math.abs(q.dx) < 0.25 && Math.abs(q.tiltDeg) < 8))
  const arrived = rows.find(r => r.p <= 0.001)
  console.log(`\n=== ${label} ===`)
  console.log('scroll reaches top at ms:', arrived ? arrived.t : 'never', '| hanging in place (|dx|<0.5, speed<2) from ms:', calmIdx < 0 ? '>8000' : rows[calmIdx].t, '| visually still (|dx|<0.25, tilt<8deg) from ms:', stillIdx < 0 ? '>8000' : rows[stillIdx].t)
  console.log('max |dx| after arrival:', Math.max(...rows.filter(r => r.p <= 0.001 && r.dx !== undefined).map(r => Math.abs(r.dx))), '| max tilt deg after arrival:', Math.max(...rows.filter(r => r.p <= 0.001 && r.tiltDeg !== undefined).map(r => Math.abs(r.tiltDeg))))
  console.log(rows.filter((_, i) => i % 2 === 0).map(r => `${r.t}ms p=${r.p} dx=${r.dx} v=${r.speed} tilt=${r.tiltDeg}`).join('\n'))
}

await scenario('motion ON: firms -> brand (Lenis 1.6 s ease)')
await page.locator('#motion-toggle').click(); await sleep(300)
console.log('motion toggle now:', await page.locator('#motion-toggle').textContent())
await scenario('motion PAUSED: firms -> brand')
console.log('errors:', JSON.stringify(errors))
await browser.close()
