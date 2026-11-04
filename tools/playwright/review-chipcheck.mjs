import { chromium } from 'playwright'
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:3001/index.html?bust=' + Date.now())
await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
await page.waitForTimeout(1500)
const ch = await page.evaluate(() => __dbg.chapters())
const sc = ch.find(c => c.name === 'scents'), cd = ch.find(c => c.name === 'cards')
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
console.log('scents.end', sc.end, 'cards.start', cd.start, 'total', total)
// smooth wheel scroll from scents 0.95 to cards 0.3 and sample chip opacity vs progress every ~40ms
await page.evaluate(p => __dbg.scrollTo(p), sc.start + 0.95 * (sc.end - sc.start))
await page.waitForTimeout(1200)
await page.mouse.move(720, 500)
const rows = []
let sent = 0
const t0 = Date.now()
while (sent < 500) {
  await page.mouse.wheel(0, 15); sent += 15
  await new Promise(r => setTimeout(r, 16))
  if (rows.length === 0 || Date.now() - rows[rows.length - 1].t > 40) {
    rows.push(await page.evaluate(t0 => { const s = __dbg.state(); const c = [...document.querySelectorAll('#labels .chip')].map(e => +getComputedStyle(e).opacity); return { t: Date.now() - t0, p: s.progress, loc: s.locals.scents.local, cards: s.locals.cards.local, chips: c, chipTop: document.querySelector('#labels .chip').getBoundingClientRect().top.toFixed(0), scentY: s.scents[0] && s.scents[0].y } }, t0))
  }
}
for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 120)); rows.push(await page.evaluate(t0 => { const s = __dbg.state(); const c = [...document.querySelectorAll('#labels .chip')].map(e => +getComputedStyle(e).opacity); return { t: Date.now() - t0, p: s.progress, loc: s.locals.scents.local, cards: s.locals.cards.local, chips: c, chipTop: document.querySelector('#labels .chip').getBoundingClientRect().top.toFixed(0), scentY: s.scents[0] && s.scents[0].y } }, t0)) }
for (const r of rows) console.log(`t=${String(r.t).padStart(5)} p=${r.p.toFixed(4)} scents.local=${r.loc.toFixed(3)} cards.local=${r.cards.toFixed(3)} chips=${r.chips.join(',')} chipTop=${r.chipTop} scentY=${r.scentY}`)
// headline vs soil edge during scents enter: sample positions
console.log('\n--- scents headline vs soil edge (instant positions, choreography only) ---')
for (const e of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0]) {
  const enterFrac = (sc.start + (7650 / total - sc.start)) // unused
  const pinStart = await page.evaluate(() => document.querySelector('.ch-scents').offsetTop / (document.documentElement.scrollHeight - innerHeight))
  const p = sc.start + e * (pinStart - sc.start)
  await page.evaluate(p => __dbg.scrollTo(p), p); await page.waitForTimeout(250)
  const r = await page.evaluate(() => { const s = __dbg.state(); const h2 = document.querySelector('.ch-scents .section-head h2').getBoundingClientRect(); const st = document.querySelector('.ch-scents .stage').getBoundingClientRect(); return { enter: s.locals.scents.enter, soil: s.soil, soilTop: ((1 - s.soil) * innerHeight).toFixed(0), h2Top: h2.top.toFixed(0), h2Bottom: h2.bottom.toFixed(0), stageTop: st.top.toFixed(0) } })
  console.log(`enter=${r.enter.toFixed(3)} soil=${r.soil} soilTop=${r.soilTop}px stageTop=${r.stageTop} h2=${r.h2Top}..${r.h2Bottom}px -> ${+r.h2Bottom > +r.soilTop && +r.h2Top < 900 ? 'HEADLINE CROSSES SOIL EDGE (ink on ink)' : 'ok'}`)
}
await b.close()
