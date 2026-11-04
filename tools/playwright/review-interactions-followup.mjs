// Follow-up measurements: parallax alone (sweep that avoids the pendant), and the about text-link hover.
// Usage: cd tools/playwright && node review-interactions-followup.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const { PNG } = require('playwright-core/lib/utilsBundle')
const here = dirname(fileURLToPath(import.meta.url)), OUT = join(here, 'out')
const W = 1440, H = 900
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []
const rec = (name, pass, detail) => { out.push({ name, pass, detail }); console.log(`${pass === null ? '[info]' : pass ? '[PASS]' : '[FAIL]'} followup · ${name} · ${JSON.stringify(detail)}`) }
function pixDiff(a, b, step = 1, thr = 12, box = null) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b)
  const [bx0, by0, bx1, by1] = box || [0, 0, A.width - 1, A.height - 1]
  let sampled = 0, changed = 0, maxD = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = by0; y <= by1; y += step) for (let x = bx0; x <= bx1; x += step) {
    const i = (y * A.width + x) * 4
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])
    sampled++; if (d > thr) { changed++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } if (d > maxD) maxD = d
  }
  return { sampled, changed, maxD, bbox: changed ? [x0, y0, x1, y1] : null }
}
const pump = (page, n = 3) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)) }, n)
const state = page => page.evaluate(() => window.__dbg.state())
const speed = h => (h ? +Math.hypot(h.vx, h.vy).toFixed(3) : null)
const toPx = (x, y) => [W / 2 + (x * H) / 10, H / 2 - (y * H) / 10]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(`http://127.0.0.1:3001/index.html?bust=${Date.now()}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__dbg && window.__dbg.state().ready && window.__sections, null, { timeout: 30000 })
await page.evaluate(() => { window.__dbg.tune.breeze = 0 })
await page.mouse.move(40, 880)

/* 1. parallax alone: sweep the full width along y = 820 (the disc bottom is ~552), pendant at rest */
{
  let s; const t0 = Date.now()
  while (Date.now() - t0 < 12000) { s = await state(page); if (speed(s.hero) < 0.02) break; await sleep(300) }
  const [px, py] = toPx(s.hero.x, s.hero.y)
  await page.mouse.move(60, 820); await sleep(900); await pump(page, 2)
  const a = await page.screenshot({ type: 'png' })
  const sA = await state(page)
  for (let i = 0; i <= 40; i++) { await page.mouse.move(60 + i * ((W - 120) / 40), 820); await sleep(16) }
  await sleep(900); await pump(page, 2)
  const b = await page.screenshot({ type: 'png' })
  const sB = await state(page)
  const d = pixDiff(a, b, 1, 12)
  fs.writeFileSync(join(OUT, 'followup-parallax-left.png'), a); fs.writeFileSync(join(OUT, 'followup-parallax-right.png'), b)
  // also a 60px wiggle's worth: move 60px and compare
  await page.mouse.move(W / 2 - 30, 820); await sleep(900); await pump(page, 2)
  const c = await page.screenshot({ type: 'png' })
  await page.mouse.move(W / 2 + 30, 820); await sleep(900); await pump(page, 2)
  const e = await page.screenshot({ type: 'png' })
  const d60 = pixDiff(c, e, 1, 12)
  rec('parallax only (pendant at rest, sweep y=820 avoids the disc): full-width sweep vs a 60px step', null, { pendantPx: [Math.round(px), Math.round(py)], heroSpeed: [speed(sA.hero), speed(sB.hero)], fullWidth: { changedPx: d.changed, maxD: d.maxD, bbox: d.bbox }, step60px: { changedPx: d60.changed, maxD: d60.maxD, bbox: d60.bbox }, rigRotationRange: '±0.05 rad over the full width (chapters.js:240), i.e. ±0.0021 rad for 60px' })
  await page.mouse.move(40, 880)
}

/* 2. about: the Meet the team link hover, measured directly */
{
  const p = await page.evaluate(() => { const el = document.querySelector('#about .text-link'); const r = el.getBoundingClientRect(); const abs = r.top + window.scrollY; const y = abs - (innerHeight - r.height) * 0.5; const total = Math.max(1, document.documentElement.scrollHeight - innerHeight); return Math.min(1, Math.max(0, y / total)) })
  await page.evaluate(p => window.__dbg.scrollTo(p), p); await sleep(1200); await pump(page, 3)
  const r = await page.$eval('#about .text-link', el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
  const box = [Math.floor(r[0]) - 10, Math.floor(r[1]) - 10, Math.ceil(r[0] + r[2]) + 10, Math.ceil(r[1] + r[3]) + 10]
  await page.mouse.move(r[0] - 60, r[1] + r[3] / 2); await sleep(600)
  const c0 = await page.$eval('#about .text-link', el => ({ color: getComputedStyle(el).color, hover: el.matches(':hover'), transition: getComputedStyle(el).transitionProperty + ' ' + getComputedStyle(el).transitionDuration }))
  const a = await page.screenshot({ type: 'png' })
  await page.mouse.move(r[0] + r[2] / 2, r[1] + r[3] / 2); await sleep(700)
  const c1 = await page.$eval('#about .text-link', el => ({ color: getComputedStyle(el).color, hover: el.matches(':hover'), cursor: getComputedStyle(el).cursor }))
  const b = await page.screenshot({ type: 'png' })
  const d = pixDiff(a, b, 1, 12, box)
  rec('about "Meet the team" link: hover colour change', c1.hover && c1.color !== c0.color, { linkRect: r.map(Math.round), resting: c0, hovered: c1, pixelDiffInLinkBox: { changed: d.changed, maxD: d.maxD } })
}

await browser.close()
fs.writeFileSync(join(OUT, 'review-interactions-followup.json'), JSON.stringify(out, null, 1))
