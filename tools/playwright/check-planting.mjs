/* Planting stage check: the photo beside the four steps in "How to plant it" becomes a small
   stage (js/planting.js, css/planting.css): tear the disc of seed paper, press the pieces in,
   water them, give them sun; then the visitor's own sprouts stand a while and the photo returns.

   It runs the real home page on the blank config template (fixture.mjs) and drives it with real
   input: page.mouse for a mouse, CDP touch events for a finger (isMobile and hasTouch on), the
   keyboard for the button. It reads window.__planting (state, act, reset, peek) for numbers.

     1  lazy        the module is not fetched until the block nears the viewport; no layout shift
     2  mouse       1440x900: the whole flow by hand, the rip and its fibres, carry and plant,
                    the cursor, the ending held, press and hold to look back, the frame loop
     3  touch       390x844: swipes that scroll and tear nothing, sideways tears, taps, carry
                    by finger, the whole flow, two fingers
     4  keyboard    1024x768 with reduced motion: the button only, the rest it takes, destroy()
     5  fixes       each must-fix from the judges, one check each
     6  site        the Pause motion button, a config with three steps, JavaScript off, the
                    paper and mark images failing
     6b repairs     each defect from the third round of testing (PH, PR, PC ids), one check or more each
     7  sizes       every stage at 1440x900, 1024x768, 901x700, 390x844, 360x740 and 844x390
   Every page: no console errors, no requests to another host.

     cd tools/playwright
     node check-planting.mjs
     SITE_BASE=https://seedscent.com/ node check-planting.mjs
     node check-planting.mjs mouse          (one section only)

   Screenshots land in tools/playwright/out/planting-*.png. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankConfig } from './fixture.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = (process.env.SITE_BASE || process.env.SEED_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '') + '/'
const HOST = new URL(BASE).host
const ONLY = process.argv[2] || ''

const ACTION = { tear: 'Tear the paper', press: 'Press them in', water: 'Water it', sun: 'Give it sun', done: 'Plant another' }
const HINT = { tear: 'Drag across the paper to tear it', again: 'Keep tearing', press: 'Press the pieces into the soil', water: 'Hold to water', sun: 'Wait for the first sprouts', held: 'Raise the sun' }
const CAPTION = 'Where every disc ends up'
const HOLD = 0.21                                     // the share above which a piece stays in the hand (js/planting.js)
const sleep = ms => new Promise(r => setTimeout(r, ms))

let fails = 0, passed = 0
function check(name, ok, detail = '') {
  if (ok) passed++; else fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}
const section = name => console.log(`\n--- ${name}`)
const want = name => !ONLY || ONLY === name

/* ---------- opening the page ---------- */
async function open(browser, opts = {}, { append = '', expectFail = [], route = null, noJs = false } = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 }, ...opts, ...(noJs ? { javaScriptEnabled: false } : {}) })
  await blankConfig(ctx, append)
  if (route) await route(ctx)
  await ctx.addInitScript(() => {
    window.__seen = []; window.__marks = []; window.__shifts = []; window.__winMoves = 0
    document.addEventListener('planting:stage', e => window.__seen.push({ stage: e.detail.stage, t: performance.now() }))
    addEventListener('pointermove', () => { window.__winMoves++ })
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          const inside = (e.sources || []).some(s => s.node && s.node.closest && s.node.closest('.steps-block'))
          if (inside) window.__shifts.push({ value: e.value, t: e.startTime })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch { /* no layout-shift entries in this browser */ }
    document.addEventListener('DOMContentLoaded', () => {
      const fig = document.getElementById('planting')
      if (fig) new MutationObserver(() => { if (fig.classList.contains('is-photo') && !window.__marks.some(m => m.what === 'photo')) window.__marks.push({ what: 'photo', t: performance.now() }) }).observe(fig, { attributes: true, attributeFilter: ['class'] })
    })
  })
  const page = await ctx.newPage()
  const log = { errors: [], foreign: [], broken: [], planting: 0 }
  const expected = t => expectFail.some(f => t.includes(f))
  page.on('console', m => { if (m.type() === 'error' && !(expected(m.text()) || (expectFail.length && /Failed to load resource/.test(m.text())))) log.errors.push(m.text()) })
  page.on('pageerror', e => log.errors.push('uncaught: ' + e.message))
  page.on('request', r => {
    const u = new URL(r.url())
    if (!['data:', 'blob:', 'about:'].includes(u.protocol) && u.host !== HOST) log.foreign.push(r.url())
    if (/\/js\/planting\.js(\?|$)/.test(u.pathname + u.search)) log.planting++
  })
  page.on('response', r => { if (r.status() >= 400 && !expected(r.url())) log.broken.push(r.status() + ' ' + r.url()) })
  page.on('requestfailed', r => { if (!expected(r.url())) log.broken.push('failed ' + r.url()) })
  await page.goto(BASE + 'index.html?bust=' + Date.now(), { waitUntil: 'load' })
  if (!noJs) await page.waitForFunction(() => window.__dbg && typeof window.__dbg.scrollTo === 'function', null, { timeout: 60000 })
  return { ctx, page, log }
}
/* bring the block to the middle of the screen and wait for the stage */
async function toStage(page, block = 'center') {
  await page.evaluate(b => document.getElementById('planting').scrollIntoView({ block: b }), block)
  await page.waitForFunction(() => window.__planting && window.__planting.peek().ready, null, { timeout: 30000 })
  await page.evaluate(b => document.getElementById('planting').scrollIntoView({ block: b }), block)
  await sleep(1300)                                  // the disc arrives
}
function clean(tag, log) {
  check(`[${tag}] no console errors`, log.errors.length === 0, log.errors.slice(0, 3).join(' | '))
  check(`[${tag}] no requests to other hosts`, log.foreign.length === 0, log.foreign.slice(0, 3).join(' | '))
  check(`[${tag}] no failed or missing requests`, log.broken.length === 0, log.broken.slice(0, 3).join(' | '))
}

/* ---------- reading the stage ---------- */
const st = page => page.evaluate(() => window.__planting.state())
const pk = page => page.evaluate(() => window.__planting.peek())
const stageIs = (page, s, ms = 20000) => page.waitForFunction(x => window.__planting.state().stage === x, s, { timeout: ms }).then(() => true, () => false)
const seen = page => page.evaluate(() => window.__seen.map(e => e.stage))
/* what the frame says and shows */
const face = page => page.evaluate(() => {
  const fig = document.getElementById('planting'), stage = fig.querySelector('.plant-stage'), img = fig.querySelector('img')
  const hint = fig.querySelector('.plant-hint'), cap = fig.querySelector('figcaption'), btn = fig.querySelector('.plant-btn'), live = fig.querySelector('.plant-live')
  const steps = [...document.querySelectorAll('#planting-steps li')]
  const cs = getComputedStyle(cap), bs = getComputedStyle(btn)
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }
  const words = [hint.textContent, btn.textContent, stage.getAttribute('aria-label') || '', live.textContent].join(' | ')
  return {
    button: btn.textContent.trim(), buttonOff: btn.getAttribute('aria-disabled') === 'true', buttonBg: bs.backgroundColor, buttonFont: parseFloat(bs.fontSize),
    hint: hint.textContent.trim(), hintShown: Number(getComputedStyle(hint).opacity) > 0.5,
    caption: cap.textContent.trim(), captionShown: cs.visibility === 'visible' && Number(cs.opacity) > 0.5, captionVis: cs.visibility, captionBg: cs.backgroundColor,
    label: stage.getAttribute('aria-label') || '', role: stage.getAttribute('role'), live: live.textContent.trim(),
    current: steps.findIndex(li => li.getAttribute('aria-current') === 'step'), done: steps.filter(li => li.classList.contains('is-done')).length,
    stageHidden: stage.getAttribute('aria-hidden') === 'true', photoHidden: img.getAttribute('aria-hidden') === 'true',
    opacity: Number(getComputedStyle(stage).opacity), cursor: getComputedStyle(stage).cursor, touchAction: getComputedStyle(stage).touchAction,
    focusOnButton: document.activeElement === btn, cls: fig.className,
    dashes: new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(words), digits: /\d/.test(words), words,
    fig: box(fig), hintBox: box(hint), btnBox: box(btn), capBox: box(cap),
  }
})
const ORDER = ['tear', 'press', 'water', 'sun', 'done']
function words(tag, stage, f, held = false) {
  const line = stage === 'sun' && held ? HINT.held : HINT[stage]
  check(`[${tag}] ${stage}: the button reads "${ACTION[stage]}"`, f.button === ACTION[stage], f.button)
  if (stage === 'done') check(`[${tag}] done: the line of instruction gives way to the caption`, f.hint === '' && f.caption === CAPTION && f.captionShown, `hint "${f.hint}", caption ${f.captionVis}`)
  else check(`[${tag}] ${stage}: one line of instruction, "${line}", and the caption is hidden`, f.hint === line && f.hintShown && !f.captionShown && f.captionVis === 'hidden', `"${f.hint}", caption ${f.captionVis}`)
  check(`[${tag}] ${stage}: the stage is an image with a label`, f.role === 'img' && f.label.length > 12, f.label)
  const at = ORDER.indexOf(stage)
  check(`[${tag}] ${stage}: the steps list follows`, stage === 'done' ? f.current === -1 && f.done === 4 : f.current === at && f.done === at, `current ${f.current}, done ${f.done}`)
  check(`[${tag}] ${stage}: plain words, no dashes, no numbers`, !f.dashes && !f.digits, f.words)
}
/* the pixels of the canvas: is anything drawn, and what */
const ink = page => page.evaluate(() => {
  const c = document.querySelector('.plant-canvas'), k = window.__planting.peek()
  const w = 160, h = Math.max(1, Math.round((w * c.height) / c.width))
  const t = document.createElement('canvas'); t.width = w; t.height = h
  const g = t.getContext('2d', { willReadFrequently: true })
  g.drawImage(c, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  let painted = 0, paper = 0, soil = 0, green = 0, warm = 0
  const tones = new Set()
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3]
    if (a < 40) continue
    painted++
    tones.add(((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4))
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b
    if (lum > 170 && a > 200) paper++
    else if (lum < 60 && a > 200) soil++
    if (gg > r + 12 && gg > b + 20 && lum > 70 && lum < 190) green++
    if (r > gg + 15 && gg > b + 25 && r > 150 && r < 215) warm++
  }
  const n = w * h
  return { painted: painted / n, paper: paper / n, soil: soil / n, green: green / n, warm: warm / n, tones: tones.size, size: [c.width, c.height] }
})
const notBlank = (tag, stage, px) => check(`[${tag}] ${stage}: the stage is drawn`, px.painted > 0.2 && px.soil > 0.1 && px.tones >= 16, `painted ${(px.painted * 100) | 0}%, soil ${(px.soil * 100) | 0}%, ${px.tones} tones`)
/* the paper lies on the bed, all of it on the frame, clear of the row with the button */
async function lyingWell(tag, page, k) {
  const f = await face(page), loose = k.pieces.filter(q => !q.held)
  const off = loose.filter(q => q.x - q.hw < k.rect.x - 0.5 || q.x + q.hw > k.rect.x + k.rect.w + 0.5 || q.y + q.hh > k.rect.y + k.rect.h + 0.5)
  const up = loose.filter(q => q.flat > 0.56 || q.y - q.hh < q.ridge - 3)
  const low = loose.filter(q => q.y + q.hh > f.btnBox.y + 1)
  check(`[${tag}] the pieces lie flat on the bed, on the frame, clear of the button row`, loose.length > 0 && off.length === 0 && up.length === 0 && low.length === 0, `${loose.length} loose, ${off.length} off the frame, ${up.length} standing or above the soil, ${low.length} under the row`)
}
async function settled(page, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const k = await pk(page); if (k.pieces.every(q => q.asleep || q.held || q.pressed)) return true; await sleep(80) }
  return false
}
const still = (page, ms = 8000) => page.waitForFunction(() => !window.__planting.peek().looping, null, { timeout: ms }).then(() => true, () => false)
/* how many update-and-draw passes run for each frame the display shows: one, never more */
async function passes(page, ms = 500) {
  const a = await page.evaluate(() => {
    if (!window.__stamps) { window.__stamps = new Set(); const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => { window.__stamps.add(t); cb(t) }) }
    window.__stamps.clear()
    return window.__planting.peek().frames
  })
  await sleep(ms)
  const r = await page.evaluate(() => ({ frames: window.__planting.peek().frames, shown: window.__stamps.size }))
  return { ran: r.frames - a, shown: r.shown, per: r.shown ? (r.frames - a) / r.shown : 0 }
}
const onePass = (tag, name, p) => check(`[${tag}] one pass per frame ${name}`, p.shown > 5 && p.per > 0.9 && p.per < 1.1, `${p.ran} passes in ${p.shown} frames`)
const shot = (page, name) => page.locator('#planting').screenshot({ path: path.join(OUT, `planting-${name}.png`) })
const shotView = (page, name) => page.screenshot({ path: path.join(OUT, `planting-${name}.png`) })
/* the accessibility tree: is the caption in it? */
async function captionInTree(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  return nodes.some(n => !n.ignored && /where every disc ends up/i.test((n.name && n.name.value) || ''))
}
/* every mouse drag goes through real moves, a few milliseconds apart */
const mouseDrag = page => async (x0, y0, x1, y1, steps = 12, pause = 14) => {
  await page.mouse.move(x0, y0); await page.mouse.down()
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await sleep(pause) }
  await page.mouse.up()
}
/* the button's work through the hook, a stage at a time, waiting for each to play out */
async function actTo(page, target, ms = 20000) {
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < ms) {
    const s = (await st(page)).stage
    if (s === target) return true
    if (s !== last) { last = s; await page.evaluate(() => window.__planting.act()) }
    await sleep(120)
  }
  return false
}
/* a disc (x, y, r) and a box do not touch, with a gap */
const clearOf = (d, b, gap) => d.y + d.r <= b.y - gap || d.y - d.r >= b.b + gap || d.x + d.r <= b.x - gap || d.x - d.r >= b.r + gap
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN }
const biggestHeld = k => k.pieces.filter(q => q.held).sort((a, c) => c.share - a.share)[0]
const coinSized = k => k.pieces.every(q => q.share <= HOLD + 0.005) && k.pieces.every(q => q.share >= 0.05)
const shares = k => k.pieces.map(q => q.share.toFixed(2)).sort().reverse().join(' ')

console.log(`Planting stage check against ${BASE}`)
const browser = await chromium.launch()

/* ==========================================================================
   1 · the module arrives late, and nothing moves when it does
   ========================================================================== */
if (want('lazy')) {
  section('lazy: fetched only near the block, no layout shift')
  const plainCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false })
  await blankConfig(plainCtx)
  const plainPage = await plainCtx.newPage()
  await plainPage.goto(BASE + 'index.html?bust=' + Date.now(), { waitUntil: 'load' })
  const plain = await plainPage.evaluate(() => { const r = document.getElementById('planting').getBoundingClientRect(); return { w: r.width, h: r.height } })
  await plainCtx.close()

  const { ctx, page, log } = await open(browser)
  await sleep(1500)
  check('[lazy] at the top of the page js/planting.js has not been fetched', log.planting === 0, `${log.planting} requests`)
  const before = await page.evaluate(() => { const r = document.getElementById('planting').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top + scrollY, stage: !!document.querySelector('.plant-stage') } })
  check('[lazy] and the figure is the plain photo', !before.stage)
  await page.evaluate(() => { const el = document.getElementById('inside'); scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * 0.2) })
  await sleep(900)
  const far = log.planting
  await toStage(page)
  check('[lazy] it is fetched once, when the block nears the viewport', log.planting === 1, `${far} requests while further up, ${log.planting} at the block`)
  const after = await page.evaluate(() => { const r = document.getElementById('planting').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top + scrollY, stage: !!document.querySelector('.plant-stage') } })
  check('[lazy] the stage starts in the same frame, at the same size and place', after.stage && Math.abs(after.w - before.w) < 0.6 && Math.abs(after.h - before.h) < 0.6 && Math.abs(after.top - before.top) < 0.6, `${after.w.toFixed(1)}x${after.h.toFixed(1)} at ${after.top.toFixed(1)}, before ${before.w.toFixed(1)}x${before.h.toFixed(1)} at ${before.top.toFixed(1)}`)
  check('[lazy] the frame is the size the photo has with JavaScript off', Math.abs(after.w - plain.w) < 0.6 && Math.abs(after.h - plain.h) < 0.6, `${after.w.toFixed(1)}x${after.h.toFixed(1)}, plain ${plain.w.toFixed(1)}x${plain.h.toFixed(1)}`)
  const shifts = await page.evaluate(() => window.__shifts)
  check('[lazy] no layout shift in the steps block', shifts.length === 0, JSON.stringify(shifts).slice(0, 160))
  check('[lazy] the handle is on window.__dbg.planting', await page.evaluate(() => !!(window.__dbg.planting && window.__dbg.planting.destroy && window.__dbg.planting.reset)))
  clean('lazy', log)
  await ctx.close()
}

/* ==========================================================================
   2 · a mouse, 1440x900
   ========================================================================== */
if (want('mouse')) {
  section('mouse: 1440x900, the whole flow by hand')
  const tag = 'mouse'
  const { ctx, page, log } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const drag = mouseDrag(page)
  await toStage(page)
  let s = await st(page), k = await pk(page), f = await face(page), px = await ink(page)
  check(`[${tag}] starts at tear with one whole disc`, s.stage === 'tear' && s.pieces === 1 && s.pressed === 0 && s.water === 0 && s.growth === 0, JSON.stringify(s))
  check(`[${tag}] state() is exactly { stage, pieces, pressed, water, growth }`, Object.keys(s).join(',') === 'stage,pieces,pressed,water,growth')
  words(tag, 'tear', f)
  notBlank(tag, 'tear', px)
  check(`[${tag}] the photo is hidden from assistive tech while the stage plays, the stage is not`, f.photoHidden && !f.stageHidden)
  check(`[${tag}] the caption is out of the accessibility tree while the stage plays`, !(await captionInTree(page)))
  check(`[${tag}] touch-action is pan-y (with pinch-zoom): a vertical swipe scrolls, two fingers zoom`, f.touchAction === 'pan-y pinch-zoom', f.touchAction)
  await shot(page, '1440-tear')

  /* the cursor: a hand only over paper; the window still hears the pointer */
  const d = k.pieces[0]
  await page.evaluate(() => { window.__winMoves = 0 })
  await page.mouse.move(k.rect.x + 30, k.rect.y + k.rect.h * 0.45); await page.mouse.move(k.rect.x + 40, k.rect.y + k.rect.h * 0.45, { steps: 3 })
  const sky = (await face(page)).cursor
  await page.mouse.move(d.x - 6, d.y); await page.mouse.move(d.x, d.y, { steps: 3 })
  const onPaper = (await face(page)).cursor
  check(`[${tag}] the grab cursor shows over the paper only`, sky === 'default' && onPaper === 'grab', `sky ${sky}, paper ${onPaper}`)
  check(`[${tag}] pointer moves over the stage still reach the site's window listeners`, (await page.evaluate(() => window.__winMoves)) >= 4, `${await page.evaluate(() => window.__winMoves)} moves heard`)

  /* the first drag, slowly, with a stop half way: the rip runs behind the hand and the fibres stretch and snap */
  const y0 = d.y - d.r * 0.08
  await page.mouse.move(d.x - d.r - 26, y0); await page.mouse.down()
  check(`[${tag}] with the button down the hand closes: the grabbing cursor`, (await face(page)).cursor === 'grabbing', (await face(page)).cursor)
  let bridges = 0
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(d.x - d.r - 26 + ((d.r + 30) * i) / 12, y0 + Math.sin(i * 0.8) * 4); await sleep(24)
    const q = await pk(page); if (q.rips.length) bridges = Math.max(bridges, q.rips[0].bridges)
  }
  const pull = await pk(page)
  await sleep(320)
  k = await pk(page); s = await st(page)
  await shot(page, '1440-tear-rip')
  check(`[${tag}] half way across, the paper is still one piece`, s.pieces === 1, `${s.pieces}`)
  check(`[${tag}] the rip runs a moment behind the hand, then catches up`, pull.rips.length === 1 && pull.rips[0].head - pull.rips[0].tip > 1 && k.rips.length === 1 && k.rips[0].head - k.rips[0].tip < 1.5, `${pull.rips.map(q => (q.head - q.tip).toFixed(1))} units behind, then ${k.rips.map(q => (q.head - q.tip).toFixed(1))}`)
  check(`[${tag}] it opens behind the tip, with fibres still reaching across the gap`, k.rips.length === 1 && k.rips[0].open > 0.05 && bridges >= 2, `open ${k.rips[0] && k.rips[0].open.toFixed(3)}, up to ${bridges} fibres across`)
  for (let i = 1; i <= 10; i++) { await page.mouse.move(d.x + 4 + ((d.r + 24) * i) / 10, y0 - i * 0.5); await sleep(16) }
  await page.mouse.up()
  await sleep(550)
  s = await st(page); k = await pk(page); f = await face(page)
  check(`[${tag}] a drag across the disc tears it in two`, s.stage === 'tear' && s.pieces === 2 && k.pieces.every(q => q.torn), JSON.stringify(s))
  check(`[${tag}] as it opened, fibres across the gap stretched and snapped`, k.snapped >= 3, `${k.snapped} snapped`)
  check(`[${tag}] after the first rip the line reads "${HINT.again}"`, f.hint === HINT.again, f.hint)
  await shot(page, '1440-tear-two')

  /* more drags, the way a visitor makes them: through the biggest piece still in the hand */
  let gestures = 1
  for (let n = 0; n < 9 && (await st(page)).stage === 'tear'; n++) {
    k = await pk(page)
    const held = biggestHeld(k)
    if (!held) { await sleep(300); continue }
    const a = 1.35 + n * 1.1, reach = held.r + 26
    await drag(held.x - Math.cos(a) * reach, held.y - Math.sin(a) * reach, held.x + Math.cos(a) * reach, held.y + Math.sin(a) * reach)
    gestures++
    await sleep(380)
    if (n === 0) await shot(page, '1440-tear-fall')
    await sleep(220)
  }
  await stageIs(page, 'press', 4000)
  s = await st(page); k = await pk(page)
  check(`[${tag}] the tear ends after 4 to 6 drags`, s.stage === 'press' && gestures >= 4 && gestures <= 6, `${gestures} drags`)
  check(`[${tag}] and leaves 6 to 10 pieces, each about the size of a coin`, s.pieces >= 6 && s.pieces <= 10 && coinSized(k), `${s.pieces} pieces: ${shares(k)}`)

  /* press */
  check(`[${tag}] the pieces come to rest`, await settled(page))
  check(`[${tag}] nothing runs once the paper lies still`, await still(page))
  k = await pk(page); f = await face(page); px = await ink(page)
  await lyingWell(tag, page, k)
  words(tag, 'press', f)
  notBlank(tag, 'press', px)
  check(`[${tag}] on the bed the loose fibre lies down (less fringe than in the hand)`, k.pieces.every(q => q.fringe < 0.5), k.pieces.map(q => q.fringe).join(' '))
  await shot(page, '1440-press')
  await page.mouse.move(k.rect.x + k.rect.w * 0.5, k.rect.y + k.rect.h * 0.15); await page.mouse.move(k.rect.x + k.rect.w * 0.5 + 6, k.rect.y + k.rect.h * 0.15, { steps: 2 })
  const skyC = (await face(page)).cursor
  const p0 = k.pieces[0]
  await page.mouse.move(p0.x - 4, p0.y); await page.mouse.move(p0.x, p0.y, { steps: 2 })
  const pieceC = (await face(page)).cursor
  check(`[${tag}] press: a pointer over a piece, nothing over the sky`, skyC === 'default' && pieceC === 'pointer', `sky ${skyC}, piece ${pieceC}`)
  await page.mouse.click(k.rect.x + k.rect.w * 0.5, k.rect.y + k.rect.h * 0.15)
  await sleep(80)
  check(`[${tag}] a click on the sky presses nothing`, (await st(page)).pressed === 0)
  let clicks = 0
  for (let n = 0; n < 20 && (await st(page)).stage === 'press'; n++) {
    k = await pk(page)
    const q = k.pieces.find(o => !o.pressed && !o.pressing)
    if (!q) { await sleep(100); continue }
    await page.mouse.click(q.x, q.y); clicks++
    await sleep(200)
  }
  s = await st(page)
  check(`[${tag}] pressing every piece ends the stage`, s.stage === 'water' && s.pressed === s.pieces, `${clicks} clicks, ${JSON.stringify(s)}`)
  await sleep(700)
  k = await pk(page)
  check(`[${tag}] pressed in, hardly any loose fibre shows`, k.pieces.every(q => q.fringe <= 0.15), k.pieces.map(q => q.fringe).join(' '))

  /* water: hold */
  f = await face(page)
  words(tag, 'water', f)
  const wx = k.rect.x + k.rect.w * 0.3, wy = k.soilY - 40
  await page.mouse.move(wx, wy); await page.mouse.down()
  let mid = null
  for (let i = 0; i < 260 && (s = await st(page)).stage === 'water'; i++) {
    await page.mouse.move(wx + i * 3, wy + (i % 2)); await sleep(50)
    if (!mid && s.water > 0.3) { mid = await pk(page); await shot(page, '1440-water') }
  }
  await page.mouse.up()
  s = await st(page)
  check(`[${tag}] holding waters the soil and ends the stage`, s.stage === 'sun' && s.water === 1, JSON.stringify(s))
  check(`[${tag}] droplets fall during the hold`, !!mid && mid.drops > 0, mid ? `${mid.drops} droplets` : 'no sample')

  /* sun: watered by hand, it plays by itself, and the button rests meanwhile */
  await sleep(450)
  f = await face(page)
  check(`[${tag}] while the sun crosses by itself the button rests and says so`, f.button === ACTION.sun && f.buttonOff && /rgba\(0, 0, 0, 0\)|transparent/.test(f.buttonBg), `aria-disabled ${f.buttonOff}, background ${f.buttonBg}`)
  onePass(tag, 'while the sun crosses', await passes(page, 500))
  await page.waitForFunction(() => window.__planting.state().growth > 0.3, null, { timeout: 20000 })
  k = await pk(page); f = await face(page); px = await ink(page)
  words(tag, 'sun', f)
  check(`[${tag}] sun: a warm disc is in the sky`, k.sun && px.warm > 0.002, `warm ${(px.warm * 100).toFixed(2)}%`)
  await shot(page, '1440-sun')

  /* done: the drawn ending is held, the caption arrives, "Plant another" works */
  await stageIs(page, 'done')
  const doneAt = await page.evaluate(() => window.__seen.filter(e => e.stage === 'done').pop().t)
  await sleep(800)
  s = await st(page); k = await pk(page); f = await face(page); px = await ink(page)
  check(`[${tag}] done: fully grown`, s.growth === 1, JSON.stringify(s))
  words(tag, 'done', f)
  check(`[${tag}] done: sprouts are up, more than one kind, with seed leaves beside the bigger pieces`, k.sprouts >= 4 && k.sproutKinds.length >= 2 && px.green > 0.004, `${k.sprouts} sprouts: ${k.sproutKinds.join(', ')}`)
  check(`[${tag}] the caption is in the accessibility tree once the sprouts are up`, await captionInTree(page))
  check(`[${tag}] "Plant another" is ready while the sprouts stand`, !f.buttonOff && f.opacity === 1, `aria-disabled ${f.buttonOff}`)
  onePass(tag, 'while the sprouts stand', await passes(page, 400))
  await shot(page, '1440-done')
  await page.waitForFunction(() => window.__planting.peek().photo, null, { timeout: 20000 })
  const photoAt = await page.evaluate(() => window.__marks.find(m => m.what === 'photo').t)
  check(`[${tag}] the drawn ending is held at least 3.5 s before the photo returns`, photoAt - doneAt >= 3500, `${((photoAt - doneAt) / 1000).toFixed(2)} s`)
  await sleep(1700)
  k = await pk(page); f = await face(page)
  check(`[${tag}] then the photo is back, with its caption, and that is announced`, f.opacity < 0.05 && !f.photoHidden && f.stageHidden && f.captionShown && /photo/i.test(f.live), `stage opacity ${f.opacity}, "${f.live}"`)
  check(`[${tag}] the caption and the button share the row without touching`, f.capBox.r + 6 <= f.btnBox.x && Math.abs((f.capBox.y + f.capBox.b) / 2 - (f.btnBox.y + f.btnBox.b) / 2) < 3, `caption ends at ${f.capBox.r.toFixed(0)}, button starts at ${f.btnBox.x.toFixed(0)}`)
  check(`[${tag}] nothing runs while the photo shows`, k.looping === false)
  await shot(page, '1440-done-photo')
  /* press and hold on the photo: the visitor's own sprouts come back while held */
  await page.mouse.move(f.fig.x + f.fig.w * 0.4, f.fig.y + f.fig.h * 0.4); await page.mouse.down()
  await sleep(700)
  const peekF = await face(page)
  await shot(page, '1440-done-peek')
  await page.mouse.up()
  await sleep(500)
  const backF = await face(page)
  check(`[${tag}] press and hold on the photo shows your own sprouts again; letting go brings the photo back`, /is-peek/.test(peekF.cls) && peekF.opacity > 0.9 && !/is-peek/.test(backF.cls) && backF.opacity < 0.1, `held: opacity ${peekF.opacity}; let go: ${backF.opacity}`)
  await page.locator('.plant-btn').click()
  await sleep(1300)
  s = await st(page); f = await face(page)
  check(`[${tag}] "Plant another" starts over`, s.stage === 'tear' && s.pieces === 1 && f.opacity > 0.95 && f.photoHidden, JSON.stringify(s))
  check(`[${tag}] the stages came in order`, (await seen(page)).join(' ') === 'press water sun done tear', (await seen(page)).join(' > '))

  /* carry and plant: a piece torn off while the button is still down goes with the hand and lands where it is let go */
  k = await pk(page)
  const disc = k.pieces[0], ys = disc.y - disc.r * 0.62
  await page.mouse.move(disc.x - disc.r - 30, ys); await page.mouse.down()
  for (let i = 1; i <= 26; i++) { await page.mouse.move(disc.x - disc.r - 30 + ((2 * disc.r + 70) * i) / 26, ys + Math.sin(i * 0.4) * 3); await sleep(30) }
  await sleep(350)
  let carried = (await pk(page)).pieces.find(q => q.carried)
  const tx = k.rect.x + k.rect.w * 0.72
  let px1 = disc.x + disc.r + 40, py1 = ys
  for (let i = 1; i <= 18; i++) { px1 += (tx - px1) / (19 - i); py1 += ((k.soilY + 30) - py1) / (19 - i); await page.mouse.move(px1, py1); await sleep(35) }
  await sleep(200)
  const hold = await pk(page)
  const inHand = hold.pieces.find(q => q.carried)
  await shot(page, '1440-carry')
  const camAt = hold.cam, ux = hold.rect.w / 400
  check(`[${tag}] a small piece torn off with the button still down stays in the hand and follows it`, !!carried && !!inHand && hold.carrying && Math.hypot(inHand.x - px1, inHand.y - py1) < inHand.r * 1.6 + 16, carried ? `share ${carried.share.toFixed(2)}, ${inHand ? Math.hypot(inHand.x - px1, inHand.y - py1).toFixed(0) + ' px from the pointer' : 'not in the hand'}` : 'nothing carried')
  await page.mouse.up()
  await sleep(1400)
  k = await pk(page)
  const landed = inHand ? k.pieces.filter(q => !q.held && q.land).sort((a, c) => Math.abs(a.share - inHand.share) - Math.abs(c.share - inHand.share))[0] : null
  const expectY = py1 - (k.cam - camAt) * ux
  check(`[${tag}] let go over the bed, it lands under the release point`, !!landed && landed.asleep && Math.abs(landed.land.x - px1) < 12 && Math.abs(landed.land.y - expectY) < 16, landed ? `released at ${px1.toFixed(0)},${expectY.toFixed(0)}, lies at ${landed.land.x.toFixed(0)},${landed.land.y.toFixed(0)}` : 'no piece')
  await shot(page, '1440-carry-landed')

  /* off screen the loop stops; back on screen it wakes; left alone it rests */
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForFunction(() => !window.__planting.peek().inView, null, { timeout: 10000 }).catch(() => {})
  await sleep(250)
  const away = (await pk(page)).frames
  await sleep(400)
  k = await pk(page)
  check(`[${tag}] scrolled away, the frame loop stops`, !k.inView && !k.looping && k.frames === away, `inView ${k.inView}, looping ${k.looping}, ${k.frames - away} frames`)
  await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' }))
  await page.waitForFunction(() => window.__planting.peek().inView, null, { timeout: 10000 }).catch(() => {})
  await sleep(300)
  check(`[${tag}] scrolled back, it wakes`, (await pk(page)).frames > away)
  await page.mouse.move(4, 4)
  const rested = await page.waitForFunction(() => !window.__planting.peek().looping, null, { timeout: 16000 }).then(() => true, () => false)
  check(`[${tag}] left alone, the paper in the hand hangs still and the loop rests`, rested)
  clean(tag, log)
  await ctx.close()
}

/* ==========================================================================
   3 · a finger, 390x844
   ========================================================================== */
if (want('touch')) {
  section('touch: 390x844, swipes, taps, carry by finger')
  const tag = 'touch'
  const { ctx, page, log } = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const cdp = await ctx.newCDPSession(page)
  const finger = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const swipe = async (x0, y0, x1, y1, steps = 12, pause = 16) => {
    await finger('touchStart', x0, y0)
    for (let i = 1; i <= steps; i++) { await finger('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await sleep(pause) }
    await finger('touchEnd')
  }
  const scrollY = () => page.evaluate(() => Math.round(scrollY))
  const centre = async () => { await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' })); await sleep(450) }
  await toStage(page)
  let s = await st(page), k = await pk(page), f = await face(page)
  check(`[${tag}] the frame is square on a narrow phone`, Math.abs(f.fig.w / f.fig.h - 1) < 0.01, (f.fig.w / f.fig.h).toFixed(3))
  check(`[${tag}] the button is a full fingertip tall`, f.btnBox.h >= 44, `${f.btnBox.h.toFixed(0)} px`)
  words(tag, 'tear', f)
  await shot(page, '390-tear')

  /* a vertical swipe on the stage scrolls the page and tears nothing, both ways */
  let d = k.pieces[0], y0 = await scrollY()
  await swipe(d.x, d.y + 12, d.x + 4, d.y - 150)
  await sleep(600)
  let y1 = await scrollY(); s = await st(page)
  check(`[${tag}] a swipe up that starts on the paper scrolls the page and tears nothing`, y1 - y0 > 60 && s.pieces === 1 && (await pk(page)).rips.length === 0, `scrollY ${y0} to ${y1}, ${s.pieces} piece`)
  await centre(); k = await pk(page); d = k.pieces[0]; y0 = await scrollY()
  await swipe(d.x - 6, d.y - 20, d.x - 2, d.y + 150)
  await sleep(600)
  y1 = await scrollY(); s = await st(page)
  check(`[${tag}] a swipe down that starts on the paper scrolls the page back and tears nothing`, y0 - y1 > 60 && s.pieces === 1, `scrollY ${y0} to ${y1}, ${s.pieces} piece`)
  await centre()

  /* sideways tears, and the page stays put */
  k = await pk(page); d = k.pieces[0]; y0 = await scrollY()
  await swipe(d.x - d.r - 18, d.y - 5, d.x + d.r + 18, d.y + 6, 14)
  await sleep(650)
  s = await st(page)
  check(`[${tag}] a sideways swipe across the disc tears it in two, and the page did not move`, s.stage === 'tear' && s.pieces === 2 && (await scrollY()) === y0, `${JSON.stringify(s)}, scrollY ${y0} to ${await scrollY()}`)
  await shot(page, '390-tear-two')

  /* carry by finger: a strip torn off with the finger still down goes with it and lands where it lifts */
  k = await pk(page)
  let held = biggestHeld(k)
  const sy = held.y - held.r * 0.55
  await finger('touchStart', held.x - held.r - 16, sy)
  for (let i = 1; i <= 22; i++) { await finger('touchMove', held.x - held.r - 16 + ((2 * held.r + 52) * i) / 22, sy + Math.sin(i * 0.5) * 2); await sleep(24) }
  await sleep(350)
  let fx = held.x + held.r + 36, fy = sy
  const gx = k.rect.x + k.rect.w * 0.3, gy = k.soilY + 34
  for (let i = 1; i <= 16; i++) { fx += (gx - fx) / (17 - i); fy += (gy - fy) / (17 - i); await finger('touchMove', fx, fy); await sleep(30) }
  await sleep(200)
  const hold = await pk(page)
  const inHand = hold.pieces.find(q => q.carried)
  await shot(page, '390-carry')
  await finger('touchEnd')
  await sleep(1400)
  k = await pk(page)
  const landed = inHand ? k.pieces.filter(q => !q.held && q.land).sort((a, c) => Math.abs(a.share - inHand.share) - Math.abs(c.share - inHand.share))[0] : null
  const expectY = fy - (k.cam - hold.cam) * (hold.rect.w / 400)
  check(`[${tag}] a strip torn off by a finger stays with the finger and lands where it lifts`, !!inHand && !!landed && Math.abs(landed.land.x - fx) < 12 && Math.abs(landed.land.y - expectY) < 16, inHand && landed ? `lifted at ${fx.toFixed(0)},${expectY.toFixed(0)}, lies at ${landed.land.x.toFixed(0)},${landed.land.y.toFixed(0)}` : `carried ${!!inHand}`)

  /* then taps: each takes a bit about the size of a coin */
  let gestures = 2, taps = 0
  for (let n = 0; n < 10 && (await st(page)).stage === 'tear'; n++) {
    k = await pk(page)
    held = biggestHeld(k)
    if (!held) { await sleep(300); continue }
    await page.touchscreen.tap(held.x, held.y); taps++; gestures++
    await sleep(650)
  }
  await stageIs(page, 'press', 4000)
  s = await st(page); k = await pk(page)
  check(`[${tag}] swipes and taps finish the tear in 4 to 6 gestures, every piece about a coin`, s.stage === 'press' && gestures >= 4 && gestures <= 6 && coinSized(k), `${gestures} gestures (${taps} taps), ${s.pieces} pieces: ${shares(k)}`)

  /* press: a swipe that starts on a piece scrolls and presses nothing; taps press */
  await settled(page); await still(page)
  await centre()
  k = await pk(page); f = await face(page)
  await lyingWell(tag, page, k)
  words(tag, 'press', f)
  await shot(page, '390-press')
  const first = k.pieces.slice().sort((a, c) => a.x - c.x)[Math.floor(k.pieces.length / 2)]
  y0 = await scrollY()
  await swipe(first.x, first.y, first.x + 3, first.y - 150)
  await sleep(600)
  y1 = await scrollY(); s = await st(page)
  check(`[${tag}] a swipe that starts on a piece scrolls the page and presses nothing`, Math.abs(y1 - y0) > 60 && s.pressed === 0, `scrollY ${y0} to ${y1}, pressed ${s.pressed}`)
  await centre()
  for (let n = 0; n < 20 && (await st(page)).stage === 'press'; n++) {
    k = await pk(page)
    const q = k.pieces.find(o => !o.pressed && !o.pressing)
    if (!q) { await sleep(100); continue }
    await page.touchscreen.tap(q.x, q.y); await sleep(230)
  }
  s = await st(page)
  check(`[${tag}] tapping every piece ends the stage`, s.stage === 'water' && s.pressed === s.pieces, JSON.stringify(s))
  await sleep(700)

  /* water: a thumb held on the soil */
  k = await pk(page); f = await face(page)
  words(tag, 'water', f)
  const wx = k.rect.x + k.rect.w * 0.34, wy = k.soilY + 14
  y0 = await scrollY()
  await finger('touchStart', wx, wy)
  for (let i = 0; i < 260 && (s = await st(page)).stage === 'water'; i++) {
    await finger('touchMove', wx + i * 1.4, wy); await sleep(50)
    if (i === 12) await shot(page, '390-water')
  }
  await finger('touchEnd')
  s = await st(page)
  check(`[${tag}] a thumb held on the soil waters it, and the page did not scroll`, s.stage === 'sun' && s.water === 1 && (await scrollY()) === y0, JSON.stringify(s))
  await page.waitForFunction(() => window.__planting.state().growth > 0.3, null, { timeout: 20000 })
  await shot(page, '390-sun')
  await stageIs(page, 'done')
  await sleep(900)
  f = await face(page)
  words(tag, 'done', f)
  check(`[${tag}] the caption and the button do not overlap`, f.capBox.b <= f.btnBox.y + 0.5 || f.capBox.r + 4 <= f.btnBox.x, `caption ${f.capBox.x.toFixed(0)}..${f.capBox.r.toFixed(0)} x ${f.capBox.y.toFixed(0)}..${f.capBox.b.toFixed(0)}, button ${f.btnBox.x.toFixed(0)}..${f.btnBox.r.toFixed(0)} x ${f.btnBox.y.toFixed(0)}..${f.btnBox.b.toFixed(0)}`)
  await shot(page, '390-done')
  await page.waitForFunction(() => window.__planting.peek().photo, null, { timeout: 20000 })
  await sleep(1600)
  await shot(page, '390-done-photo')
  f = await face(page)
  /* press and hold on the photo with a finger */
  await finger('touchStart', f.fig.x + f.fig.w * 0.4, f.fig.y + f.fig.h * 0.35)
  await sleep(700)
  const peekF = await face(page)
  await finger('touchEnd')
  await sleep(450)
  check(`[${tag}] a finger held on the photo shows the sprouts again`, /is-peek/.test(peekF.cls) && peekF.opacity > 0.9 && (await face(page)).opacity < 0.1, `held ${peekF.opacity}`)
  f = await face(page)
  await page.touchscreen.tap(f.btnBox.x + f.btnBox.w / 2, f.btnBox.y + f.btnBox.h / 2)
  await sleep(1300)
  s = await st(page); f = await face(page)
  check(`[${tag}] a tap on "Plant another" starts over, and no hover tint stays on the button`, s.stage === 'tear' && s.pieces === 1 && f.buttonBg === 'rgb(251, 246, 229)', `${JSON.stringify(s)}, background ${f.buttonBg}`)

  /* two fingers are not a tear */
  k = await pk(page); d = k.pieces[0]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.x - d.r * 0.5, y: d.y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.x - d.r * 0.5, y: d.y, id: 1 }, { x: d.x + d.r * 0.5, y: d.y, id: 2 }] })
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: d.x - d.r * 0.5 - i * 9, y: d.y, id: 1 }, { x: d.x + d.r * 0.5 + i * 9, y: d.y, id: 2 }] }); await sleep(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
  s = await st(page)
  check(`[${tag}] a two-finger spread on the paper tears nothing`, s.stage === 'tear' && s.pieces === 1, JSON.stringify(s))
  clean(tag, log)
  await ctx.close()
}

/* ==========================================================================
   4 · the keyboard, with reduced motion, 1024x768
   ========================================================================== */
if (want('keyboard')) {
  section('keyboard: 1024x768, reduced motion, the one button')
  const tag = 'keyboard'
  const { ctx, page, log } = await open(browser, { viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' })
  await toStage(page)
  let s = await st(page), k = await pk(page), f = await face(page)
  check(`[${tag}] reduced motion is picked up and nothing animates while idle`, k.reduced && !k.looping)
  words(tag, 'tear', f)
  /* Tab reaches the button from the control before it */
  await page.evaluate(() => {
    const b = document.querySelector('.plant-btn')
    const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length)
    const i = all.indexOf(b); if (i > 0) all[i - 1].focus()
  })
  await page.keyboard.press('Tab')
  f = await face(page)
  check(`[${tag}] Tab reaches the button`, f.focusOnButton)
  const said = []
  await page.keyboard.press('Enter')
  await sleep(100)
  s = await st(page); k = await pk(page); f = await face(page)
  check(`[${tag}] Enter on "Tear the paper" tears it, the pieces placed at once`, s.stage === 'press' && s.pieces >= 6 && s.pieces <= 10 && k.pieces.every(q => q.asleep) && !k.looping, JSON.stringify(s))
  check(`[${tag}] right after the stage changes the button rests and says so`, f.buttonOff && /rgba\(0, 0, 0, 0\)|transparent/.test(f.buttonBg), `aria-disabled ${f.buttonOff}, background ${f.buttonBg}`)
  await page.keyboard.press('Space')
  await sleep(60)
  s = await st(page)
  check(`[${tag}] a second press that soon is taken for a slip`, s.stage === 'press' && s.pressed === 0, JSON.stringify(s))
  await sleep(380)
  f = await face(page)
  check(`[${tag}] after a third of a second the button is ready again`, !f.buttonOff && f.buttonBg === 'rgb(251, 246, 229)', `aria-disabled ${f.buttonOff}, background ${f.buttonBg}`)
  words(tag, 'press', f)
  check(`[${tag}] press: the button and the line say different things`, f.button !== f.hint && !/soil/i.test(f.button), `"${f.button}" / "${f.hint}"`)
  said.push(f.live)
  await shot(page, '1024-press')
  await page.keyboard.press('Space'); await sleep(100)
  s = await st(page); f = await face(page)
  check(`[${tag}] Space presses every piece in`, s.stage === 'water' && s.pressed === s.pieces, JSON.stringify(s))
  words(tag, 'water', f); said.push(f.live)
  await sleep(380)
  await page.keyboard.press('Enter'); await sleep(100)
  s = await st(page); k = await pk(page); f = await face(page)
  check(`[${tag}] Enter on "Water it" waters it; the sun then waits for its own press`, s.stage === 'sun' && s.water === 1 && k.sunWait && k.drops === 0, JSON.stringify(s))
  words(tag, 'sun', f, true); said.push(f.live)
  await sleep(1800)
  f = await face(page)
  check(`[${tag}] waiting for its cue, "Give it sun" is ready`, (await st(page)).growth === 0 && !f.buttonOff)
  await page.keyboard.press('Enter'); await sleep(100)
  s = await st(page); k = await pk(page); f = await face(page)
  const doneAt = Date.now()
  check(`[${tag}] Enter on "Give it sun" brings the sprouts up`, s.stage === 'done' && s.growth === 1 && k.sprouts >= 4, JSON.stringify(s))
  words(tag, 'done', f); said.push(f.live)
  check(`[${tag}] every stage change was announced`, new Set(said).size === said.length && said.every(t => t.length > 10), said.join(' / '))
  await shot(page, '1024-done')
  await sleep(2600)
  k = await pk(page); f = await face(page)
  check(`[${tag}] with reduced motion the drawn ending is held too`, !k.photo && f.opacity === 1, `${((Date.now() - doneAt) / 1000).toFixed(1)} s after done, photo ${k.photo}`)
  check(`[${tag}] and "Plant another" works during it`, !f.buttonOff)
  await page.keyboard.press('Enter'); await sleep(100)
  s = await st(page); f = await face(page)
  check(`[${tag}] Enter on "Plant another" starts over at once`, s.stage === 'tear' && s.pieces === 1 && f.focusOnButton && f.opacity === 1, JSON.stringify(s))
  /* the photo returns after the beat with reduced motion too */
  await page.evaluate(() => { const p = window.__planting; p.act(); p.act(); p.act(); p.act() })
  s = await st(page)
  check(`[${tag}] act() steps straight through: tear, press, water, sun`, s.stage === 'done' && s.pressed === s.pieces && s.water === 1 && s.growth === 1, JSON.stringify(s))
  const back = await page.waitForFunction(() => window.__planting.peek().photo, null, { timeout: 8000 }).then(() => true, () => false)
  f = await face(page)
  check(`[${tag}] the photo comes back without a fade`, back && f.opacity === 0 && !f.photoHidden && f.captionShown, `opacity ${f.opacity}`)
  await shot(page, '1024-done-photo')

  /* destroy() puts the figure back and lets go of everything it added */
  const after = await page.evaluate(async () => {
    const fig = document.getElementById('planting')
    window.__dbg.planting.destroy()
    const plainAgain = {
      stage: !!fig.querySelector('.plant-stage'), button: !!fig.querySelector('.plant-btn'), hint: !!fig.querySelector('.plant-hint'), live: !!fig.querySelector('.plant-live'),
      cls: fig.className, style: fig.getAttribute('style'), photoHidden: fig.querySelector('img').hasAttribute('aria-hidden'),
      steps: [...document.querySelectorAll('#planting-steps li')].some(li => /plant-step|is-done/.test(li.className) || li.hasAttribute('aria-current')),
      hook: typeof window.__planting !== 'undefined',
    }
    const added = [], removed = []
    const A = EventTarget.prototype.addEventListener, R = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (type, fn, o) { added.push([this, type, fn]); return A.call(this, type, fn, o) }
    EventTarget.prototype.removeEventListener = function (type, fn, o) { removed.push([this, type, fn]); return R.call(this, type, fn, o) }
    const mod = await import(new URL('js/planting.js', document.baseURI).href)
    const api = mod.initPlanting(fig, { steps: [...document.querySelectorAll('#planting-steps li')], reduced: false, paperSrc: 'images/paper-texture.jpg', markSrc: 'brand/mark-print.png' })
    await new Promise(r => setTimeout(r, 500))
    window.__planting.act()
    await new Promise(r => setTimeout(r, 300))
    api.destroy()
    let rafs = 0
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = function (fn) { if (String(fn).includes('inFrame')) rafs++; return raf.call(window, fn) }   // the stage's own frames, not the site's
    await new Promise(r => setTimeout(r, 400))
    window.requestAnimationFrame = raf
    EventTarget.prototype.addEventListener = A; EventTarget.prototype.removeEventListener = R
    const left = added.filter(a => !removed.some(r => r[0] === a[0] && r[1] === a[1] && r[2] === a[2])).map(a => a[1])
    return { plainAgain, added: added.length, left, rafs }
  })
  const pa = after.plainAgain
  check(`[${tag}] destroy() puts the figure back the way it was`, !pa.stage && !pa.button && !pa.hint && !pa.live && pa.cls === 'photo steps-photo' && !pa.style && !pa.photoHidden && !pa.steps && !pa.hook, JSON.stringify(pa))
  check(`[${tag}] destroy() removes every listener it added and asks for no more frames`, after.added > 5 && after.left.length === 0 && after.rafs === 0, `${after.added} added, left: ${after.left.join(',') || 'none'}, ${after.rafs} frames`)
  clean(tag, log)
  await ctx.close()
}

/* ==========================================================================
   5 · the judges' must-fix list, one check each
   ========================================================================== */
if (want('fixes')) {
  section('fixes: the judges\' must-fix list')
  /* 1 · a phone on its side: the frame fits the screen; the button and the line are on it */
  {
    const tag = 'fix 1 landscape'
    const opts = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    const plainCtx = await browser.newContext({ ...opts, javaScriptEnabled: false })
    await blankConfig(plainCtx)
    const pp = await plainCtx.newPage()
    await pp.goto(BASE + 'index.html?bust=' + Date.now(), { waitUntil: 'load' })
    const plain = await pp.evaluate(() => { const r = document.getElementById('planting').getBoundingClientRect(); return { w: r.width, h: r.height } })
    await plainCtx.close()
    const { ctx, page, log } = await open(browser, opts)
    await toStage(page)
    const f = await face(page)
    const navH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')))
    check(`[${tag}] the frame is no taller than the screen under the nav`, f.fig.h <= 390 - navH - 24 + 0.6, `${f.fig.w.toFixed(0)}x${f.fig.h.toFixed(1)}, room ${390 - navH - 24}`)
    check(`[${tag}] the plain photo has the same size, so nothing shifts`, Math.abs(plain.w - f.fig.w) < 0.6 && Math.abs(plain.h - f.fig.h) < 0.6, `plain ${plain.w.toFixed(0)}x${plain.h.toFixed(1)}`)
    check(`[${tag}] with the frame in the middle, the button and the line of instruction are on screen`, f.btnBox.y >= 0 && f.btnBox.b <= 390 && f.hintBox.y >= 0 && f.hintBox.b <= 390, `button ${f.btnBox.y.toFixed(0)}..${f.btnBox.b.toFixed(0)}, line ${f.hintBox.y.toFixed(0)}..${f.hintBox.b.toFixed(0)}`)
    await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'end' }))
    await sleep(500)
    const g = await face(page)
    check(`[${tag}] scrolled fully into view, the whole frame is on screen below the nav: line, disc, soil and button`, g.fig.y >= navH - 0.5 && g.fig.b <= 391.5 && g.hintBox.y >= navH && g.btnBox.b <= 390, `frame ${g.fig.y.toFixed(0)}..${g.fig.b.toFixed(0)}, nav ${navH}`)
    await shotView(page, '844x390-view')
    await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' }))
    await sleep(500)
    const k = await pk(page)
    const d = k.pieces[0]
    check(`[${tag}] the disc keeps clear of the line and the button`, clearOf(d, f.hintBox, 4) && (d.x + d.r <= f.btnBox.x + 0.5 || d.y + d.r <= f.btnBox.y), `disc ${(d.y - d.r).toFixed(0)}..${(d.y + d.r).toFixed(0)}, line ${f.hintBox.y.toFixed(0)}..${f.hintBox.b.toFixed(0)}`)
    clean(tag, log)
    await ctx.close()
  }
  /* 2 · four to six taps for coin-sized pieces, with a mouse (the touch and mouse runs cover drags) */
  {
    const tag = 'fix 2 coin'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    let n = 0
    for (; n < 10 && (await st(page)).stage === 'tear'; n++) {
      const held = biggestHeld(await pk(page))
      if (!held) { await sleep(300); continue }
      await page.mouse.click(held.x, held.y)
      await sleep(650)
    }
    await stageIs(page, 'press', 4000)
    const s = await st(page), k = await pk(page)
    check(`[${tag}] a visitor who only taps finishes in 4 to 6 taps with 6 to 8 pieces about the size of a coin`, s.stage === 'press' && n >= 4 && n <= 6 && s.pieces >= 6 && s.pieces <= 8 && coinSized(k), `${n} taps, ${s.pieces} pieces: ${shares(k)}`)
    await shot(page, '1440-taps')
    clean(tag, log)
    await ctx.close()
  }
  /* 3 to 7 and 10 · the ending, the caption, the button at rest, its dress, the words */
  {
    const tag = 'fix 3-7'
    const { ctx, page, log } = await open(browser, { viewport: { width: 901, height: 700 } })
    await toStage(page)
    await page.evaluate(() => window.__planting.act()); await sleep(100)
    let f = await face(page)
    check(`[fix 5 rest] a press right after a stage change meets a button that shows it is not ready`, f.buttonOff, `aria-disabled ${f.buttonOff}`)
    check(`[fix 10 words] press: "Press them in" on the button, "Press the pieces into the soil" on the line`, f.button === ACTION.press && f.hint === HINT.press)
    check(`[fix 4 caption] the caption is hidden from the accessibility tree while the stage plays`, f.captionVis === 'hidden' && !(await captionInTree(page)))
    await actTo(page, 'done')
    await sleep(1300)                                 // past the short rest after the change, and its fade
    f = await face(page)
    check(`[fix 7 dress] the caption is a solid paper chip and the button a solid cream pill in 12 px type`, f.captionBg === 'rgb(251, 246, 229)' && f.buttonBg === 'rgb(251, 246, 229)' && f.buttonFont >= 12, `caption ${f.captionBg}, button ${f.buttonBg} ${f.buttonFont}px`)
    check(`[fix 7 dress] in a narrow frame the caption takes the top corner on one line, clear of the button`, f.capBox.h <= 36 && f.capBox.y - f.fig.y < 20 && f.capBox.b < f.btnBox.y && f.capBox.x >= f.fig.x && f.capBox.r <= f.fig.r, `caption ${f.capBox.w.toFixed(0)}x${f.capBox.h.toFixed(0)} at ${(f.capBox.y - f.fig.y).toFixed(0)} px from the top, button top ${(f.btnBox.y - f.fig.y).toFixed(0)}`)
    check(`[fix 3 ending] "Plant another" is ready during the drawn ending, not a dimmed pill that ignores presses`, !f.buttonOff && (await face(page)).opacity === 1)
    await shot(page, '901-done')
    const hoverRules = await page.evaluate(() => {
      const out = []
      const walk = (rules, media) => { for (const r of rules) { if (r.cssRules && r.media) walk(r.cssRules, r.media.mediaText); else if (r.selectorText && /plant-/.test(r.selectorText) && /:hover/.test(r.selectorText)) out.push({ sel: r.selectorText, media }) } }
      for (const sh of document.styleSheets) { try { if (/planting\.css/.test(sh.href || '')) walk(sh.cssRules, '') } catch { /* other origin */ } }
      return out
    })
    check(`[fix 7 hover] every hover rule on the stage is behind (hover: hover)`, hoverRules.length > 0 && hoverRules.every(r => /hover:\s*hover/.test(r.media)), JSON.stringify(hoverRules))
    clean(tag, log)
    await ctx.close()
  }
  /* 8 · the grab cursor only over paper (also in the mouse run), and 11 · the window still hears the pointer */
  {
    const tag = 'fix 8 cursor'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    const k = await pk(page), d = k.pieces[0]
    const at = async (x, y) => { await page.mouse.move(x - 3, y); await page.mouse.move(x, y, { steps: 2 }); return (await face(page)).cursor }
    const c = { sky: await at(k.rect.x + k.rect.w * 0.1, k.rect.y + k.rect.h * 0.3), soil: await at(k.rect.x + k.rect.w * 0.2, k.rect.y + k.rect.h * 0.85), paper: await at(d.x, d.y) }
    check(`[${tag}] grab over the paper, the default cursor over the sky and the soil`, c.paper === 'grab' && c.sky === 'default' && c.soil === 'default', JSON.stringify(c))
    await page.evaluate(() => { window.__winMoves = 0 })
    await page.mouse.move(d.x - 40, d.y); await page.mouse.move(d.x + 40, d.y, { steps: 6 })
    check(`[fix 11 tilt] the figure has no data-tilt and the window hears every move over the stage`, (await page.evaluate(() => !document.getElementById('planting').hasAttribute('data-tilt') && window.__winMoves >= 6)), `${await page.evaluate(() => window.__winMoves)} moves`)
    clean(tag, log)
    await ctx.close()
  }
}

/* ==========================================================================
   6 · the rest of the site: Pause motion, three steps, no JavaScript, missing images
   ========================================================================== */
if (want('site')) {
  section('site: Pause motion, three steps, JavaScript off, images failing')
  {
    const tag = 'pause motion'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    await page.evaluate(() => window.__planting.act())
    await sleep(120)
    let k = await pk(page)
    const falling = k.pieces.some(q => !q.held && !q.asleep)
    await page.click('#motion-toggle')
    await sleep(150)
    k = await pk(page)
    const fig = await page.evaluate(() => document.getElementById('planting').classList.contains('is-reduced'))
    check(`[${tag}] Pause motion stills the stage at once: the paper is put where it was going`, falling && k.reduced && fig && k.pieces.every(q => q.asleep) && !k.looping, `falling before ${falling}, reduced ${k.reduced}, looping ${k.looping}`)
    await page.evaluate(() => window.__planting.act()); await sleep(80)
    check(`[${tag}] paused, the button still works`, (await st(page)).stage === 'water')
    await page.click('#motion-toggle')
    await sleep(150)
    k = await pk(page)
    check(`[${tag}] Play motion brings motion back`, !k.reduced && !(await page.evaluate(() => document.getElementById('planting').classList.contains('is-reduced'))))
    clean(tag, log)
    await ctx.close()
  }
  {
    const tag = 'three steps'
    const { ctx, page, log } = await open(browser, {}, { append: 'window.SEED_SCENT.product.plantingSteps = ["Tear it up.", "Plant it.", "Water it."];' })
    await toStage(page)
    const n = await page.evaluate(() => document.querySelectorAll('#planting-steps li').length)
    const done = await actTo(page, 'done')
    const marked = await page.evaluate(() => [...document.querySelectorAll('#planting-steps li')].some(li => /plant-step|is-done/.test(li.className) || li.hasAttribute('aria-current')))
    check(`[${tag}] with three steps in the config the stage still plays through, and leaves the list alone`, n === 3 && done && !marked, `${n} steps, done ${done}, list marked ${marked}`)
    clean(tag, log)
    await ctx.close()
  }
  {
    const tag = 'no javascript'
    const { ctx, page, log } = await open(browser, {}, { noJs: true })
    await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' }))
    const r = await page.evaluate(() => {
      const fig = document.getElementById('planting'), img = fig.querySelector('img'), cap = fig.querySelector('figcaption')
      const cs = getComputedStyle(cap), is = getComputedStyle(img), b = img.getBoundingClientRect()
      return { stage: !!fig.querySelector('.plant-stage'), img: is.visibility === 'visible' && +is.opacity === 1 && b.width > 100 && b.height > 100, cap: cs.visibility === 'visible' && +cs.opacity === 1, text: cap.textContent.trim() }
    })
    check(`[${tag}] with JavaScript off the photo and its caption show, and there is no stage`, !r.stage && r.img && r.cap && r.text === CAPTION, JSON.stringify(r))
    await shot(page, 'nojs')
    check(`[${tag}] no requests to other hosts`, log.foreign.length === 0, log.foreign.join(' | '))
    await ctx.close()
  }
  {
    const tag = 'images fail'
    const { ctx, page, log } = await open(browser, {}, {
      expectFail: ['paper-texture.jpg', 'mark-print.png'],
      route: async c => { await c.route('**/images/paper-texture.jpg*', r => r.abort()); await c.route('**/brand/mark-print.png*', r => r.fulfill({ status: 404, body: 'gone' })) },
    })
    await toStage(page)
    const px = await ink(page)
    check(`[${tag}] without the paper photo or the mark the disc is still drawn, in palette tones`, px.paper > 0.03 && px.painted > 0.2, `paper ${(px.paper * 100).toFixed(1)}%`)
    await shot(page, 'images-fail-tear')
    check(`[${tag}] and the whole flow plays`, await actTo(page, 'done'))
    clean(tag, log)
    await ctx.close()
  }
}

/* ==========================================================================
   6b · the third round of testing: each repair, so it cannot come back
   ========================================================================== */
if (want('repairs')) {
  section('repairs: the third round of testing')
  const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const fingersOf = async page => {
    const cdp = await page.context().newCDPSession(page)
    const finger = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
    const swipe = async pts => { await finger('touchStart', ...pts[0]); for (const q of pts.slice(1)) { await finger('touchMove', ...q); await sleep(16) } await finger('touchEnd') }
    return { cdp, finger, swipe }
  }
  const across = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  /* the stage's opacity on every frame for a while, to catch a flash */
  const watchOpacity = (page, n) => page.evaluate(n => { window.__op = []; const s = document.querySelector('#planting .plant-stage'); const loop = () => { window.__op.push(+getComputedStyle(s).opacity); if (window.__op.length < n) requestAnimationFrame(loop) }; loop() }, n)
  const maxOpacity = page => page.evaluate(() => Math.max(...window.__op))

  /* PH-2 · a timid nudge into the disc, then let go: nothing tears by itself */
  {
    const tag = 'PH-2 nudge'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    let d = (await pk(page)).pieces[0]
    await page.mouse.move(d.x - d.r - 20, d.y); await page.mouse.down()
    for (const [x, y] of across(d.x - d.r - 20, d.y, d.x - d.r + 12, d.y, 10).slice(1)) { await page.mouse.move(x, y); await sleep(15) }
    await page.mouse.up()
    await sleep(1500)
    let k = await pk(page)
    check(`[${tag}] a mouse nudged 12 px into the disc and let go leaves it whole`, k.pieces.length === 1 && k.rips.length === 0, `${k.pieces.length} pieces, last cut ${k.lastCut ? k.lastCut.len.toFixed(0) : 'none'}`)
    d = k.pieces[0]
    await page.mouse.move(d.x - d.r - 20, d.y); await page.mouse.down()
    for (const [x, y] of across(d.x - d.r - 20, d.y, d.x + 4, d.y, 14).slice(1)) { await page.mouse.move(x, y); await sleep(15) }
    await page.mouse.up()
    await sleep(1500)
    k = await pk(page)
    check(`[${tag}] a pull half way across, then let go, still runs on and tears it in two`, k.pieces.length === 2, `${k.pieces.length} pieces`)
    clean(tag, log); await ctx.close()
    const ph = await open(browser, PHONE)
    await toStage(ph.page)
    const t = await fingersOf(ph.page)
    d = (await pk(ph.page)).pieces[0]
    await t.swipe(across(d.x - d.r - 20, d.y, d.x - d.r + 15, d.y, 8))
    await sleep(1500)
    k = await pk(ph.page)
    check(`[${tag}] a finger 15 px into the disc, then lifted, leaves it whole`, k.pieces.length === 1, `${k.pieces.length} pieces`)
    clean(tag + ' phone', ph.log); await ph.ctx.close()
  }

  /* PH-3 and PH-5 · a phone allows only sideways swipes: they end with pieces about the size of a coin,
     not strips the width of the disc, and paper still in the hand stays where the thumb found it */
  {
    const tag = 'PH-3 strips'
    const { ctx, page, log } = await open(browser, PHONE)
    await toStage(page)
    const t = await fingersOf(page)
    const r0 = (await pk(page)).pieces[0].r
    let swipes = 0, dead = 0, maxDead = 0, drift = 0, camMoved = 0
    for (let i = 0; i < 16 && (await st(page)).stage === 'tear'; i++) {
      const k = await pk(page), b = biggestHeld(k)
      if (!b) { await sleep(400); continue }
      await t.swipe(across(b.x - b.r - 25, b.y, b.x + b.r + 25, b.y, 14)); swipes++
      /* every 100 ms while the pieces fall and the view may come down: paper still held keeps its place */
      let a = await pk(page)
      for (let j = 0; j < 14; j++) {
        await sleep(100)
        const c = await pk(page)
        if (c.pieces.length === a.pieces.length) {
          camMoved = Math.max(camMoved, Math.abs(c.cam - a.cam))
          a.pieces.forEach((q, n) => { if (q.held && c.pieces[n].held && !q.carried) drift = Math.max(drift, Math.abs(c.pieces[n].y - q.y)) })
        }
        a = c
      }
      if (a.pieces.length === k.pieces.length) maxDead = Math.max(maxDead, ++dead); else dead = 0
    }
    await stageIs(page, 'press', 4000); await settled(page)
    const k = await pk(page), loose = k.pieces.filter(q => !q.held)
    const long = median(loose.map(q => Math.max(q.hw, q.hh) / r0)), asp = median(loose.map(q => Math.max(q.hw, q.hh) / Math.max(1, Math.min(q.hw, q.hh))))
    check(`[${tag}] sideways thumb swipes through the paper end the tear, never more than two dead in a row`, (await st(page)).stage === 'press' && swipes <= 12 && maxDead <= 2, `${swipes} swipes, ${maxDead} dead in a row`)
    check(`[${tag}] and leave pieces about the size of a coin, not strips the width of the disc`, long <= 0.62 && asp <= 4.5 && coinSized(k), `median long side ${long.toFixed(2)} of the diameter, median lying aspect ${asp.toFixed(1)}: ${shares(k)}`)
    check(`[PH-5 hold] paper still in the hand stays where it is on screen while pieces fall`, drift <= 4, `held paper moved up to ${drift.toFixed(1)} px in 100 ms (the view moved up to ${camMoved.toFixed(1)} units in 100 ms)`)
    await shot(page, 'repair-390-strips')
    clean(tag, log); await ctx.close()
  }

  /* PH-4 · curved strokes through paper still in the hand do not go dead again and again */
  {
    const tag = 'PH-4 arcs'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    let arcs = 0, dead = 0, maxDead = 0
    for (let i = 0; i < 16 && (await st(page)).stage === 'tear'; i++) {
      const k = await pk(page), b = biggestHeld(k)
      if (!b) { await sleep(400); continue }
      const sgn = i % 2 ? 1 : -1, pts = []
      for (let j = 0; j <= 16; j++) { const u = j / 16; pts.push([b.x - b.r - 25 + u * (2 * b.r + 50), b.y + sgn * Math.sin(Math.PI * u) * b.r * 0.45]) }
      await page.mouse.move(...pts[0]); await page.mouse.down()
      for (const q of pts.slice(1)) { await page.mouse.move(...q); await sleep(16) }
      await page.mouse.up()
      arcs++
      await sleep(900)
      if ((await pk(page)).pieces.length === k.pieces.length) maxDead = Math.max(maxDead, ++dead); else dead = 0
    }
    await stageIs(page, 'press', 4000)
    const k = await pk(page)
    check(`[${tag}] curved strokes end the tear and never go dead more than twice in a row`, (await st(page)).stage === 'press' && maxDead <= 2 && arcs <= 12 && coinSized(k), `${arcs} arcs, ${maxDead} dead in a row: ${shares(k)}`)
    clean(tag, log); await ctx.close()
  }

  /* PR-1 · on a phone, a scroll or a tap that starts on the returned photo does not flash the drawn ending */
  {
    const tag = 'PR-1 peek'
    const { ctx, page, log } = await open(browser, PHONE)
    await toStage(page)
    await actTo(page, 'done', 40000)
    await page.waitForFunction(() => window.__planting.peek().photo, null, { timeout: 20000 })
    await sleep(1600)
    const t = await fingersOf(page)
    let f = await face(page)
    let x = f.fig.x + f.fig.w / 2, y = f.fig.y + f.fig.h / 2
    await watchOpacity(page, 60)
    await t.finger('touchStart', x, y); await sleep(120)
    for (let i = 1; i <= 10; i++) { await t.finger('touchMove', x, y - i * 14); await sleep(16) }
    await t.finger('touchEnd'); await sleep(900)
    const scrollMax = await maxOpacity(page)
    await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' })); await sleep(600)
    f = await face(page); x = f.fig.x + f.fig.w / 2; y = f.fig.y + f.fig.h / 2
    await watchOpacity(page, 50)
    await t.finger('touchStart', x, y); await sleep(80); await t.finger('touchEnd'); await sleep(800)
    const tapMax = await maxOpacity(page)
    check(`[${tag}] a finger that rests, then scrolls, and a short tap, both leave the photo as it is`, scrollMax < 0.05 && tapMax < 0.05, `stage opacity up to ${scrollMax.toFixed(2)} on the scroll, ${tapMax.toFixed(2)} on the tap`)
    await t.finger('touchStart', x, y); await sleep(700)
    const held = await face(page)
    await t.finger('touchEnd'); await sleep(600)
    check(`[${tag}] a still hold still brings the sprouts back`, /is-peek/.test(held.cls) && held.opacity > 0.9 && (await face(page)).opacity < 0.1, `held ${held.opacity}`)
    clean(tag, log); await ctx.close()
  }

  /* PR-2 · while the button's own pour plays, "Water it" rests */
  {
    const tag = 'PR-2 water'
    const { ctx, page, log } = await open(browser)
    await toStage(page)
    await actTo(page, 'water')
    await sleep(1000)
    await page.focus('#planting .plant-btn'); await page.keyboard.press('Enter')
    const offs = []
    for (let i = 0; i < 4; i++) { await sleep(250); const f = await face(page); if ((await st(page)).stage === 'water') offs.push(f.buttonOff) }
    await page.keyboard.press('Enter')
    const reached = await stageIs(page, 'sun', 15000)
    await sleep(1200)
    const f = await face(page)
    check(`[${tag}] after "Water it" the button rests while its water falls, then is ready at sun`, offs.length >= 2 && offs.every(Boolean) && reached && !f.buttonOff && f.button === ACTION.sun, `resting ${offs.join(',')}; at sun ready ${!f.buttonOff}`)
    clean(tag, log); await ctx.close()
  }

  /* PR-5 · two fingers on the stage zoom the page and tear nothing */
  {
    const tag = 'PR-5 pinch'
    const { ctx, page, log } = await open(browser, PHONE)
    await toStage(page)
    const f = await face(page), cdp = await ctx.newCDPSession(page)
    await cdp.send('Input.synthesizePinchGesture', { x: f.fig.x + f.fig.w / 2, y: f.fig.y + f.fig.h * 0.4, scaleFactor: 2, relativeSpeed: 600, gestureSourceType: 'touch' })
    await sleep(600)
    const scale = await page.evaluate(() => (window.visualViewport ? visualViewport.scale : 1))
    check(`[${tag}] a pinch on the stage zooms the page, and the paper stays whole`, scale > 1.3 && (await st(page)).pieces === 1 && /pinch-zoom/.test(f.touchAction), `scale ${scale.toFixed(2)}, touch-action ${f.touchAction}`)
    clean(tag, log); await ctx.close()
  }

  /* PC-1 and PR-3 · a phone on its side: the line of instruction is never under the nav */
  {
    const tag = 'PC-1 landscape line'
    const { ctx, page, log } = await open(browser, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await toStage(page)
    const navH = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')))
    const rows = []
    for (const top of [21, 51, navH]) {
      await page.evaluate(top => { const r = document.getElementById('planting').getBoundingClientRect(); window.scrollBy(0, r.top - top) }, top)
      await sleep(500)
      const f = await face(page)
      rows.push({ top: Math.round(f.fig.y), y: Math.round(f.hintBox.y), b: Math.round(f.hintBox.b), clear: f.hintBox.y >= navH + 16 && f.hintBox.b <= 390 })
    }
    check(`[${tag}] with the frame top at 21 px, centred, or just under the nav, the line is clear of the nav and its backing`, rows.every(r => r.clear), rows.map(r => `top ${r.top}: line ${r.y}..${r.b}`).join('; '))
    await page.evaluate(() => document.getElementById('planting').scrollIntoView({ block: 'center' })); await sleep(500)
    const seenRows = []
    for (const s of ['tear', 'press', 'water', 'sun']) {
      if (s !== 'tear') await actTo(page, s)
      await sleep(700)
      const f = await face(page), k = await pk(page)
      const color = await page.evaluate(() => getComputedStyle(document.querySelector('#planting .plant-hint')).color)
      const under = k.pieces.filter(q => !q.held && q.y + q.hh > f.hintBox.y + 1 && q.x + q.hw > f.hintBox.x && q.x - q.hw < f.hintBox.r)
      seenRows.push({ s, ok: f.hintShown && f.hintBox.r <= f.btnBox.x - 4 && f.hintBox.b <= f.btnBox.b + 1 && f.hintBox.y >= f.btnBox.y - 14 && under.length === 0 && color === 'rgb(251, 246, 229)', w: Math.round(f.hintBox.w) })
    }
    check(`[${tag}] at every stage the line sits in the bottom row in paper, left of the button, with no paper over it`, seenRows.every(r => r.ok), seenRows.map(r => `${r.s} ${r.ok ? 'ok' : 'NO'} (${r.w} px)`).join(', '))
    await shotView(page, 'repair-844x390-line')
    clean(tag, log); await ctx.close()
  }

  /* PC-4 · reduced motion: by the end the sun is down, as it is with motion */
  {
    const tag = 'PC-4 reduced sun'
    const { ctx, page, log } = await open(browser, { viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' })
    await toStage(page)
    await actTo(page, 'done', 30000)
    await sleep(300)
    const k = await pk(page)
    check(`[${tag}] at done with reduced motion there is no sun under the caption`, (await st(page)).stage === 'done' && !k.sun, `sun ${k.sun}`)
    clean(tag, log); await ctx.close()
  }
}

/* ==========================================================================
   7 · every stage at six sizes, for looking at
   ========================================================================== */
if (want('sizes')) {
  section('sizes: every stage at six sizes')
  const sizes = [
    ['1440x900', { viewport: { width: 1440, height: 900 } }],
    ['1024x768', { viewport: { width: 1024, height: 768 } }],
    ['901x700', { viewport: { width: 901, height: 700 } }],
    ['390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ['360x740', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }],
    ['844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }],
  ]
  for (const [name, opts] of sizes) {
    const { ctx, page, log } = await open(browser, { deviceScaleFactor: 2, ...opts })
    await toStage(page)
    const f0 = await face(page), k0 = await pk(page), d = k0.pieces[0]
    const clear = Math.min(d.x - d.r - f0.fig.x, f0.fig.r - d.x - d.r) >= 0 && clearOf(d, f0.hintBox, 6) && d.y + d.r <= f0.btnBox.y - 6
    await shot(page, `${name}-tear`)
    await actTo(page, 'press'); await settled(page); await still(page)
    let k = await pk(page)
    await shot(page, `${name}-press`)
    const inFrame = k.pieces.every(q => q.x - q.hw >= k.rect.x - 0.5 && q.x + q.hw <= k.rect.x + k.rect.w + 0.5 && q.y + q.hh <= f0.btnBox.y + 1)
    await actTo(page, 'water'); await sleep(900)
    await shot(page, `${name}-water`)
    await actTo(page, 'sun'); await sleep(900)
    await shot(page, `${name}-sun-wait`)
    await page.evaluate(() => window.__planting.act())
    await page.waitForFunction(() => window.__planting.state().growth > 0.35, null, { timeout: 15000 })
    await shot(page, `${name}-sun`)
    await stageIs(page, 'done', 15000); await sleep(650)
    const f = await face(page)
    await shot(page, `${name}-done`)
    if ((await pk(page)).photo) console.log(`note  [${name}] the screenshot was slow: the done picture may show the returned photo`)
    await page.waitForFunction(() => window.__planting.peek().photo, null, { timeout: 15000 }); await sleep(1600)
    await shot(page, `${name}-photo`)
    const overlap = !(f.capBox.b <= f.btnBox.y + 0.5 || f.capBox.r + 4 <= f.btnBox.x)
    check(`[${name}] the disc starts clear of the words and the button, the paper lies in the frame, the caption and button do not overlap`, clear && inFrame && !overlap && f.capBox.h <= 36, `disc clear ${clear}, pieces in frame ${inFrame}, overlap ${overlap}, caption ${f.capBox.h.toFixed(0)} px tall`)
    clean(name, log)
    await ctx.close()
  }
}

await browser.close()
console.log(`\n${passed} passed, ${fails} failed`)
console.log(fails ? `${fails} planting check(s) FAILED` : 'All planting checks passed')
process.exit(fails ? 1 : 0)
