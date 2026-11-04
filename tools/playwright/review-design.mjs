// Art-direction review probes. Read-only against the served site.
// Usage: cd tools/playwright && node review-design.mjs
import { chromium } from 'playwright'
import fs from 'fs'
import { fileURLToPath } from 'url'

const base = 'http://127.0.0.1:3001/'
const out = fileURLToPath(new URL('./out/', import.meta.url))
fs.mkdirSync(out, { recursive: true })
const bust = () => '?bust=' + Date.now()

const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}

// ---- helpers evaluated in page ------------------------------------------
const censusFn = () => {
  const vw = innerWidth, vh = innerHeight
  const effOpacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity) } return o }
  const inView = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
  const list = sel => [...document.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return inView(r) && effOpacity(el) > 0.08 })
  const ph = list('.ph'), tbc = list('.tbc')
  const sizesPh = ph.map(el => Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10)
  return { ph: ph.length, tbc: tbc.length, phSizes: [...new Set(sizesPh)].sort((a, b) => a - b), tiny: ph.filter(el => parseFloat(getComputedStyle(el).fontSize) < 9).map(el => (el.closest('p,dd,span,figcaption,h3,li') || el).className + ' :: ' + el.textContent.trim()).slice(0, 6) }
}

const navCollisionFn = () => {
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'))
  const effOpacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity) } return o }
  const hits = []
  document.querySelectorAll('main p, main span, main td, main th, main h1, main h2, main h3, main dt, main dd, main a, main legend, main figcaption, main label, main output').forEach(el => {
    if (el.closest('.nav')) return
    if (!el.textContent.trim()) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    if (r.top < navH - 4 && r.bottom > 6 && effOpacity(el) > 0.3) {
      // only the innermost text elements
      if ([...el.children].some(c => c.getBoundingClientRect().height > 0 && c.textContent.trim() === el.textContent.trim())) return
      hits.push({ tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 30), text: el.textContent.trim().slice(0, 40), top: Math.round(r.top), left: Math.round(r.left) })
    }
  })
  return { navH, hits: hits.slice(0, 6) }
}

const metricsFn = () => {
  const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  return {
    h1: cs('h1.display', 'fontSize'), h2: cs('.ch-scents h2.display', 'fontSize'), displaySm: cs('.display.sm', 'fontSize'),
    kicker: cs('.kicker', 'fontSize'), annotation: cs('.annotation', 'fontSize'), lede: cs('.lede', 'fontSize'), body: cs('body', 'fontSize'),
    giant: cs('.giant', 'fontSize'), day: cs('.day', 'fontSize'), cardTitle: cs('.card-title', 'fontSize'), cardTitlePh: cs('.card-title .ph', 'fontSize'),
    footerPh: cs('.footer .ph', 'fontSize'), formNotePh: cs('.form-note .ph', 'fontSize'), chipPh: cs('.chip .ph', 'fontSize'), bodyPh: cs('.beat-copy .ph', 'fontSize'), specPh: cs('.spec .ph', 'fontSize'),
    navBg: cs('.nav', 'backgroundColor'), navBackdrop: cs('.nav', 'backdropFilter'),
    bizPill: rect('.biz-copy .pill'), bizCopy: rect('.biz-copy'),
    brandName: rect('.brand-name'), brandNameLines: (() => { const el = document.querySelector('.brand-name'); if (!el) return null; const lh = parseFloat(getComputedStyle(el).lineHeight); return Math.round(el.getBoundingClientRect().height / lh * 10) / 10 })(),
    menuBtn: rect('#menu-toggle'), bagBtn: rect('#bag-toggle'),
    annotationLen: (document.querySelector('.ch-scents .annotation') || {}).textContent?.trim().length,
    cardsGap: cs('.cards', 'gap'),
    chipOpacity: [...document.querySelectorAll('.chip')].map(c => getComputedStyle(c).opacity),
    chipRects: [...document.querySelectorAll('.chip')].map(c => { const r = c.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width), text: c.textContent.trim().slice(0, 30) } }),
    scentsHead: rect('.ch-scents .section-head'),
    sproutCopy: rect('.sprout-copy'), sproutCopyOpacity: cs('.sprout-copy', 'opacity'),
    heroLogo: rect('.hero-logo'), heroKicker: rect('.hero-copy .kicker'), heroH1: rect('h1.display'),
    stepsTbc: rect('.steps-block .annotation .tbc'),
    regSize: cs('.reg', 'fontSize'),
    dataTheme: document.body.dataset.theme,
    soilClip: cs('.layer-soil', 'clipPath'),
  }
}

const go = async (page, chName, local) => {
  await page.evaluate(([c, l]) => { const ch = __dbg.chapters().find(x => x.name === c); __dbg.scrollTo(ch.start + l * (ch.end - ch.start)) }, [chName, local])
  await page.waitForTimeout(900)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
}

for (const [name, opts] of Object.entries(sizes)) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const external = []
  page.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u) })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base + 'index.html' + bust())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1500)

  console.log(`\n==================== ${name} ${opts.viewport.width}x${opts.viewport.height} ====================`)
  console.log('chapters', JSON.stringify(await page.evaluate(() => __dbg.chapters().map(c => [c.name, +c.start.toFixed(3), +c.end.toFixed(3)]))))

  // fresh top-of-page nav capture (the tour's phone shots predate the last css edit)
  await page.screenshot({ path: out + `rv-${name}-nav-top.png`, clip: { x: 0, y: 0, width: opts.viewport.width, height: 90 } })
  const m0 = await page.evaluate(metricsFn)
  console.log('nav metrics', JSON.stringify({ brandName: m0.brandName, brandNameLines: m0.brandNameLines, menuBtn: m0.menuBtn, bagBtn: m0.bagBtn, navBg: m0.navBg, navBackdrop: m0.navBackdrop, regSize: m0.regSize }))
  console.log('hero layout', JSON.stringify({ logo: m0.heroLogo, kicker: m0.heroKicker, h1: m0.heroH1, gapLogoToKicker: m0.heroKicker && m0.heroLogo ? m0.heroKicker.y - (m0.heroLogo.y + m0.heroLogo.h) : null }))
  console.log('type scale', JSON.stringify({ h1: m0.h1, h2: m0.h2, displaySm: m0.displaySm, giant: m0.giant, day: m0.day, cardTitle: m0.cardTitle, lede: m0.lede, body: m0.body, kicker: m0.kicker, annotation: m0.annotation, annotationChars: m0.annotationLen }))
  console.log('ph sizes', JSON.stringify({ cardTitlePh: m0.cardTitlePh, bodyPh: m0.bodyPh, specPh: m0.specPh, chipPh: m0.chipPh, footerPh: m0.footerPh, formNotePh: m0.formNotePh }))
  console.log('finale pill', JSON.stringify({ pill: m0.bizPill, copy: m0.bizCopy }))

  if (name === 'desktop') {
    // hero cursor probe
    const before = await page.evaluate(() => ({ ...__dbg.state().hero }))
    const toPx = h => [1440 / 2 + h.x / (10 / 900), 900 / 2 - h.y / (10 / 900)]
    const [px, py] = toPx(before)
    await page.mouse.move(px + 200, py)
    for (let i = 0; i <= 12; i++) { await page.mouse.move(px + 200 - i * 24, py + i); await page.waitForTimeout(16) }
    await page.waitForTimeout(150)
    const after = await page.evaluate(() => ({ ...__dbg.state().hero }))
    console.log('hero hover probe', JSON.stringify({ before: { x: +before.x.toFixed(3), vx: +before.vx.toFixed(3) }, after: { x: +after.x.toFixed(3), vx: +after.vx.toFixed(3) }, hint: await page.evaluate(() => document.querySelector('#push-hint').className) }))
    await page.mouse.move(10, 880)
    await page.waitForTimeout(1500)
  }

  // ---- sprout -> scents hand-off, fine steps --------------------------------
  const hand = [['sprout', 0.8], ['sprout', 0.9], ['sprout', 0.97], ['sprout', 1.0], ['scents', 0.03], ['scents', 0.06], ['scents', 0.1], ['scents', 0.15], ['scents', 0.2], ['scents', 0.3], ['scents', 0.45]]
  for (const [c, l] of hand) {
    await go(page, c, l)
    const m = await page.evaluate(metricsFn)
    const st = await page.evaluate(() => { const s = __dbg.state(); return { ch: s.chapter, soil: s.soil, theme: s.theme } })
    const f = `rv-${name}-hand-${c}-${l}.png`
    await page.screenshot({ path: out + f })
    console.log('handoff', c, l, JSON.stringify({ ...st, soilClip: m.soilClip, sproutCopy: m.sproutCopy, sproutOpacity: m.sproutCopyOpacity, chips: m.chipOpacity, scentsHead: m.scentsHead }), f)
  }

  // ---- chip census + nav collisions at the tour stops ----------------------
  const stops = [['hero', 0], ['drive', 0.3], ['drive', 0.47], ['drive', 0.88], ['sprout', 0.6], ['scents', 0.7], ['cards', 0.4], ['inside', 0.15], ['inside', 0.5], ['inside', 0.75], ['firms', 0.15], ['firms', 0.3], ['firms', 0.6], ['about', 0.5], ['finale', 1]]
  for (const [c, l] of stops) {
    await go(page, c, l)
    const census = await page.evaluate(censusFn)
    const nav = await page.evaluate(navCollisionFn)
    console.log('stop', c.padEnd(7), String(l).padEnd(4), 'chips ph=%s tbc=%s sizes=%s', census.ph, census.tbc, JSON.stringify(census.phSizes), census.tiny.length ? '\n     tiny(<9px): ' + JSON.stringify(census.tiny) : '', nav.hits.length ? '\n     under nav: ' + JSON.stringify(nav.hits) : '')
  }

  // ---- specific frames ---------------------------------------------------
  await go(page, 'scents', 0.7)
  const m = await page.evaluate(metricsFn)
  console.log('scents row chips', JSON.stringify(m.chipRects), 'head', JSON.stringify(m.scentsHead))
  if (name === 'phone') {
    await page.screenshot({ path: out + 'rv-phone-scents-chips.png', clip: { x: 0, y: Math.max(0, (m.chipRects[0]?.t || 380) - 40), width: 390, height: 120 } })
    await go(page, 'inside', 0.75)
    const r = await page.evaluate(() => { const el = document.querySelector('.steps-block .annotation .tbc'); const b = el.getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) } })
    console.log('steps tbc pill phone', JSON.stringify(r))
    // menu open
    await go(page, 'hero', 0)
    await page.click('#menu-toggle')
    await page.waitForTimeout(400)
    await page.screenshot({ path: out + 'rv-phone-menu-open.png' })
    await page.click('#menu-toggle')
  }
  if (name === 'desktop') {
    await go(page, 'cards', 0.4)
    await page.screenshot({ path: out + 'rv-desktop-cards.png' })
    await go(page, 'inside', 0.75)
    await page.screenshot({ path: out + 'rv-desktop-inside-photos.png' })
    await go(page, 'finale', 1)
    await page.screenshot({ path: out + 'rv-desktop-finale.png' })
    // the bag drawer
    await page.click('#bag-toggle')
    await page.waitForTimeout(900)
    await page.screenshot({ path: out + 'rv-desktop-bag-open.png' })
    await page.click('#bag-close')
    await page.waitForTimeout(400)
    // drive beat composition: where is the giant word and how much sage is dead below it
    await go(page, 'drive', 0.3)
    const g = await page.evaluate(() => { const el = [...document.querySelectorAll('.giant')].find(e => parseFloat(getComputedStyle(e).opacity) > 0.5); const b = el.getBoundingClientRect(); const beat = document.querySelector('.beat[data-beat="0"]').getBoundingClientRect(); return { giantTop: Math.round(b.top), giantBottom: Math.round(b.bottom), beatTop: Math.round(beat.top), beatBottom: Math.round(beat.bottom), vh: innerHeight } })
    console.log('drive composition', JSON.stringify(g))
  }

  console.log(name, 'external requests:', external.length ? external : 'none', '| page errors:', errors.length ? errors : 'none')
  await browser.close()
}

// ---- hero at common projector sizes ----------------------------------------
{
  const browser = await chromium.launch()
  for (const [w, h] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.goto(base + 'index.html' + bust())
    await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
    await page.waitForTimeout(800)
    const m = await page.evaluate(metricsFn)
    console.log(`hero ${w}x${h}`, JSON.stringify({ logo: m.heroLogo, kicker: m.heroKicker, gap: m.heroKicker.y - (m.heroLogo.y + m.heroLogo.h), h1: m.h1 }))
    await page.close()
  }
  // team + checkout at 1440 (fold) for chip census
  for (const p of ['team.html', 'checkout.html']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(base + p + bust())
    await page.waitForTimeout(1500)
    const c = await page.evaluate(censusFn)
    const all = await page.evaluate(() => ({ ph: document.querySelectorAll('.ph').length, tbc: document.querySelectorAll('.tbc').length }))
    console.log(p, 'fold chips', JSON.stringify(c), 'whole page', JSON.stringify(all))
    if (p === 'team.html') { await page.evaluate(() => scrollTo(0, 700)); await page.waitForTimeout(1200); await page.screenshot({ path: out + 'rv-team-cards-fold.png' }) }
    await page.close()
  }
  await browser.close()
}
