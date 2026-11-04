// (6) Resize without reload: 1440x900 -> 900x700 -> 390x844. Checks that the hero pendant's anchor
// follows the card (world -> px vs the live card rect), the pendant hangs under it and on screen,
// the card panel's inline inset follows the CSS vars, the chapter ranges are rebuilt from the live
// layout (start*max == offsetTop - innerHeight), scrollTo(0.5) lands in the same chapter, and
// nothing is left over / duplicated. Also compares with a fresh load at 390x844.
import { chromium, base, out, bust, watch, sleep, READY } from './review-lib.mjs'

const snap = () => {
  const s = __dbg.state()
  const card = document.getElementById('card-panel').getBoundingClientRect()
  const wpp = 10 / innerHeight
  const toPx = (x, y) => ({ x: +(innerWidth / 2 + x / wpp).toFixed(1), y: +(innerHeight / 2 - y / wpp).toFixed(1) })
  const h = s.hero
  const max = document.documentElement.scrollHeight - innerHeight
  const chapters = __dbg.chapters().map(c => {
    const el = document.getElementById(c.name === 'finale' ? 'contact' : c.name)
    const expectStart = Math.max(0, (el.offsetTop - innerHeight) / max)
    return { name: c.name, start: c.start, end: c.end, expectStart: +expectStart.toFixed(4), startErrPx: +((c.start - expectStart) * max).toFixed(1) }
  })
  const chips = [...document.querySelectorAll('#labels .chip')].map(c => c.textContent.trim())
  return {
    view: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollMax: max, scrollH: document.documentElement.scrollHeight },
    canvas: { w: document.getElementById('gl').width, h: document.getElementById('gl').height, cssW: document.getElementById('gl').clientWidth, cssH: document.getElementById('gl').clientHeight },
    card: { left: +card.left.toFixed(1), top: +card.top.toFixed(1), right: +card.right.toFixed(1), bottom: +card.bottom.toFixed(1), inlineInset: document.getElementById('card-panel').style.inset, cssVars: { navH: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim(), inset: getComputedStyle(document.documentElement).getPropertyValue('--card-inset').trim() } },
    anchorPx: h ? toPx(h.anchor.x, h.anchor.y) : null,
    expectedAnchorPx: { x: +(card.left + card.width * 0.66).toFixed(1), y: +card.top.toFixed(1) },
    hangHeroElPx: (() => { const r = document.getElementById('hang-hero').getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1) } })(),
    heroPx: h ? toPx(h.x, h.y) : null,
    heroWorld: h ? { x: h.x, y: h.y, anchorX: h.anchor.x, anchorY: h.anchor.y, hangLen: +(h.anchor.y - h.y).toFixed(3), speed: +Math.hypot(h.vx, h.vy).toFixed(3) } : null,
    chapter: s.chapter, progress: s.progress,
    chapters,
    chips, chipCount: chips.length, splitLines: document.querySelectorAll('.split-line').length,
    hangers: __dbg.hangers().map(x => ({ name: x.name, enabled: x.enabled, target: x.target })),
    canvases: document.querySelectorAll('canvas').length, labels: document.getElementById('labels').childElementCount,
    hintDisplay: getComputedStyle(document.getElementById('push-hint')).display, meterDisplay: getComputedStyle(document.querySelector('.meter')).display,
    bodyScrollW: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > innerWidth,
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const { errors } = watch(page)
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page.waitForFunction(READY, null, { timeout: 60000 })
await sleep(2000)

const results = {}
async function record(tag) {
  const a = await page.evaluate(snap)
  await page.evaluate(() => __dbg.scrollTo(0.5)); await sleep(400)
  a.chapterAtHalf = await page.evaluate(() => __dbg.state().chapter)
  a.stateAtHalf = await page.evaluate(() => { const s = __dbg.state(); return { soil: s.soil, theme: s.theme, hero: !!s.hero, scents: s.scents, finale: !!s.finale } })
  await page.screenshot({ path: out + `rev-resize-${tag}-half.png` })
  await page.evaluate(() => __dbg.scrollTo(0)); await sleep(2200)
  const b = await page.evaluate(snap)
  a.afterReturn = { anchorPx: b.anchorPx, heroPx: b.heroPx, heroWorld: b.heroWorld, chapter: b.chapter }
  await page.screenshot({ path: out + `rev-resize-${tag}-hero.png` })
  results[tag] = a
  const anchorErr = a.anchorPx ? { dx: +(a.anchorPx.x - a.expectedAnchorPx.x).toFixed(1), dy: +(a.anchorPx.y - a.expectedAnchorPx.y).toFixed(1) } : null
  console.log(`\n=== ${tag} ===`)
  console.log(JSON.stringify({ view: a.view, canvas: a.canvas, card: a.card, anchorPx: a.anchorPx, expectedAnchorPx: a.expectedAnchorPx, anchorErrPx: anchorErr, hangHeroElPx: a.hangHeroElPx, heroPx: a.heroPx, heroWorld: a.heroWorld, chapterAtHalf: a.chapterAtHalf, stateAtHalf: a.stateAtHalf, afterReturn: a.afterReturn, chipCount: a.chipCount, chips: a.chips, splitLines: a.splitLines, canvases: a.canvases, labels: a.labels, hintDisplay: a.hintDisplay, meterDisplay: a.meterDisplay, overflowX: a.overflowX, bodyScrollW: a.bodyScrollW, hangers: a.hangers }, null, 1))
  console.log('chapters:', JSON.stringify(a.chapters))
}

await record('1440x900')
await page.setViewportSize({ width: 900, height: 700 }); await sleep(1500)
await record('900x700-resized')
await page.setViewportSize({ width: 390, height: 844 }); await sleep(1500)
await record('390x844-resized')
console.log('\nerrors so far:', JSON.stringify(errors))
await ctx.close()

/* fresh load at 390x844 for comparison (pendant scale, rope, chip format) */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const page2 = await ctx2.newPage()
const w2 = watch(page2)
await page2.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page2.waitForFunction(READY, null, { timeout: 60000 })
await sleep(2200)
const fresh = await page2.evaluate(snap)
await page2.screenshot({ path: out + 'rev-resize-390x844-fresh-hero.png' })
await page2.evaluate(() => __dbg.scrollTo(0.5)); await sleep(400)
fresh.chapterAtHalf = await page2.evaluate(() => __dbg.state().chapter)
await page2.screenshot({ path: out + 'rev-resize-390x844-fresh-half.png' })
console.log('\n=== 390x844 fresh load ===')
console.log(JSON.stringify({ view: fresh.view, anchorPx: fresh.anchorPx, expectedAnchorPx: fresh.expectedAnchorPx, heroPx: fresh.heroPx, heroWorld: fresh.heroWorld, chips: fresh.chips, chapterAtHalf: fresh.chapterAtHalf, overflowX: fresh.overflowX }, null, 1))
console.log('chapters:', JSON.stringify(fresh.chapters))
console.log('\nhang length (anchor.y - pendant.y, world units): 1440 =', results['1440x900'].heroWorld && results['1440x900'].heroWorld.hangLen, '| 390 after resize =', results['390x844-resized'].heroWorld && results['390x844-resized'].heroWorld.hangLen, '| 390 fresh =', fresh.heroWorld && fresh.heroWorld.hangLen, '(desktop L+R = 3.85, phone L+R = 1.9 + 0.837 = 2.737)')
console.log('errors (fresh):', JSON.stringify(w2.errors))
await browser.close()
