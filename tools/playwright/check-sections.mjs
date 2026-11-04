/* Verifies js/sections.js + css/sections.css in a real Chromium.
   Run: cd tools/playwright && node check-sections.mjs
   Prints the numbers that prove each part works and saves screenshots to out/.

   Contexts: desktop (the stock config), variants (config typed the way a student might type it:
   prices as text, one that is not a number, tiers confirmed, an order email), mobile, reduced motion. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, 'out')
mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:3001/index.html'
const url = () => `${BASE}?bust=${Date.now()}`

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '[ok]  ' : '[FAIL]'} ${msg}`); if (!cond) failures++ }
const info = msg => console.log(`[info] ${msg}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DASHES = /[–—]/
const LEAKS = /null|undefined|NaN|config\.js|\.js\b/

/* console/page errors: what sections.js could have caused counts; the rest is listed, not failed */
function watch(page, label) {
  const errors = [], notMine = []
  const other = t => /cart\.(js|css)/.test(t) || /Failed to load resource/.test(t) || /import map|module specifier|\bthree\b|rapier/i.test(t)
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (other(t)) notMine.push(t); else errors.push(t)
  })
  page.on('pageerror', e => { const t = `pageerror: ${e.message}`; if (other(t)) notMine.push(t); else errors.push(t) })
  page.on('response', r => { if (r.status() >= 400) notMine.push(`${r.status()} ${r.url().replace(/\?.*$/, '')}`) })
  return { errors, notMine, label }
}

async function settle(page) {
  await page.waitForFunction(() => window.__xsec && window.__sections, null, { timeout: 15000 })
  await sleep(600)
}
async function scrollTo(page, selector, block = 'start') {
  await page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ block: b }), [selector, block])
  await sleep(900)
}
/* after a wheel flick Lenis keeps the page moving for a while: wait until scrollY holds still */
async function settleScroll(page, limit = 4000) {
  const t0 = Date.now()
  let last = await page.evaluate(() => Math.round(scrollY)), still = 0
  while (Date.now() - t0 < limit) {
    await sleep(100)
    const y = await page.evaluate(() => Math.round(scrollY))
    if (y === last) { if (++still >= 3) break } else { still = 0; last = y }
  }
  return Date.now() - t0
}
/* box-shadow color as Chromium prints it: rgba(...) or color(srgb r g b / a). Returns [r, g, b, a] in 0..255 / 0..1 */
function shadowColor(str) {
  let m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]]
  m = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/)
  if (m) return [Math.round(+m[1] * 255), Math.round(+m[2] * 255), Math.round(+m[3] * 255), m[4] == null ? 1 : +m[4]]
  return null
}
/* the slider thumb is a pseudo-element getComputedStyle cannot see, so measure it in pixels:
   the moss disc's bounding box, the cream ring just left of it, the track further out */
async function measureThumb(page) {
  const box = await page.locator('#qty-range').boundingBox()
  const clip = { x: Math.floor(box.x) - 4, y: Math.floor(box.y) - 4, width: Math.ceil(box.width) + 8, height: Math.ceil(box.height) + 8 }
  const png = (await page.screenshot({ clip })).toString('base64')
  const m = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
    const near = (p, q, tol) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol
    const MOSS = [88, 117, 65], CREAM = [251, 246, 229], TRACK = [233, 223, 192]
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (near(px(x, y), MOSS, 14)) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    if (!n) return { n: 0 }
    const cy = Math.round((minY + maxY) / 2), cx = Math.round((minX + maxX) / 2)
    const left = [1, 2, 3, 4].map(k => px(minX - k, cy))
    return {
      n, w: maxX - minX + 1, h: maxY - minY + 1, cx, cy,
      ring: left.filter(p => near(p, CREAM, 14)).length >= 2,
      track: near(px(minX - 7, cy), TRACK, 14),
      left: left.map(p => p.join(',')),
    }
  }, png)
  return { ...m, clip }
}

/* Flip "Pause motion" the way a visitor does: the button. If main.js never wired the button
   (it does not load while the page's import map is rejected), do exactly what ui.js does on a
   click so the sections can still be checked, and say so once. */
let toggleVia = ''
async function setPaused(page, want) {
  const r = await page.evaluate(async want => {
    const m = await import('/js/scroll.js')   // the same module instance the page runs
    if (!!m.motion.paused === want) return { via: 'already', paused: !!m.motion.paused }
    document.getElementById('motion-toggle')?.click()
    if (!!m.motion.paused === want) return { via: 'button', paused: !!m.motion.paused }
    m.motion.paused = want
    document.body.classList.toggle('reduced', want)
    dispatchEvent(new CustomEvent('motion:toggle', { detail: { paused: want } }))
    return { via: 'fallback', paused: !!m.motion.paused }
  }, want)
  if (r.via !== toggleVia) {
    if (r.via === 'fallback') info('motion toggle: the button is inert (main.js did not initialize it, see the page errors listed at the end); flipping motion.paused and dispatching motion:toggle the way ui.js does')
    else if (r.via === 'button') info('motion toggle: the Pause motion button works')
    toggleVia = r.via
  }
  return r
}

/* serve js/config.js as it is, plus a patch written the way a student might type values */
async function overrideConfig(ctx, patch) {
  await ctx.route(u => u.pathname.endsWith('/js/config.js'), async route => {
    const res = await route.fetch()
    const body = `${await res.text()}\n/* check-sections.mjs: test overrides */\n(${patch.toString()})(window.SEED_SCENT);\n`
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
  })
}

async function submitOrder(page, { firm = 'Maple Leaf Trading Co', name = 'Jordan Reyes', email = 'jordan@mapleleaf.example', scent = '1', qty = '60', notes = '' } = {}) {
  await page.fill('#f-firm', firm); await page.fill('#f-name', name); await page.fill('#f-email', email)
  await page.selectOption('#f-scent', scent); await page.fill('#f-qty', qty); await page.fill('#f-notes', notes)
  await page.click('#order-form button[type="submit"]')
  await sleep(300)
  return page.evaluate(() => ({
    text: window.__sections.order(),
    visible: !document.getElementById('form-summary').hidden,
    note: (document.querySelector('#form-summary .summary-note')?.textContent || '').trim(),
  }))
}
const slide = async (page, v) => { await page.$eval('#qty-range', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, v); await sleep(500) }
const noteText = page => page.$eval('#tier-note', el => el.textContent.trim())
const motionState = page => page.evaluate(() => ({
  loop: window.__sections.loop(), raf: window.__sections.rafPending(), paused: window.__sections.paused(),
  xsec: window.__sections.xsec(), skew: window.__sections.skew(), skewRunning: window.__sections.skewRunning(),
  skewed: [...document.querySelectorAll('#spec tbody tr, .steps li')].filter(r => r.style.transform).length,
  tilted: [...document.querySelectorAll('.card[data-tilt]')].filter(c => c.style.transform).length,
}))

/* ---------------------------------------------------------------- desktop */
async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3001' })
  const page = await ctx.newPage()
  const log = watch(page, 'desktop')
  await page.goto(url(), { waitUntil: 'load' })
  await settle(page)

  /* --- drawing counts --- */
  const x0 = await page.evaluate(() => window.__sections.xsec())
  info(`cross-section: fibres=${x0.fibres} seeds=${x0.seeds} drops=${x0.drops} sprouts=${x0.sprouts}`)
  ok(x0.fibres >= 200, `fibre strokes >= 200 (${x0.fibres})`)
  ok(x0.seeds >= 60 && x0.seeds <= 90, `seeds between 60 and 90 (${x0.seeds})`)
  ok(x0.sprouts >= 2 && x0.sprouts <= 3, `sprout outlines 2 or 3 (${x0.sprouts})`)
  const svgKids = await page.$$eval('#paper-xsec *', els => els.length)
  info(`svg element count: ${svgKids}`)

  /* --- reveal: initial state --- */
  const rv0 = await page.evaluate(() => ({ marked: document.querySelectorAll('.rv').length, ...window.__sections.reveal() }))
  info(`reveal: ${rv0.total} candidates, ${rv0.marked} still hidden, ${rv0.revealed} revealed so far`)
  const expectedReveal = await page.$$eval('.tier, .way, .steps li, .card', els => els.length)
  ok(rv0.total === expectedReveal && rv0.marked === rv0.total, `reveal candidates = ${expectedReveal} (tiers + ways + steps + cards), all marked hidden at start`)

  /* --- tiers (stock config: every price null) --- */
  await scrollTo(page, '#firms')
  const note0 = await noteText(page)
  await slide(page, 60)
  await sleep(300)
  const out = (await page.textContent('#qty-out')).trim()
  const activeTier = await page.$$eval('#tiers .tier.active', els => els.map(e => e.querySelector('.tier-qty').textContent.trim()))
  const note = await noteText(page)
  info(`slider -> 60: output "${out}", active tier ${JSON.stringify(activeTier)}, note "${note}" (at load: "${note0}")`)
  ok(out === '60', 'output reads 60')
  ok(activeTier.length === 1 && activeTier[0] === '50+', 'tier 50+ is the only active tier')
  ok(note === 'Tiers and pricing are being finalized.' && note0 === note, 'note reads "Tiers and pricing are being finalized." while prices are null, same as the static text')
  const t9 = await page.evaluate(() => window.__sections.tier(9))
  const t100 = await page.evaluate(() => window.__sections.tier(100))
  const t200 = await page.evaluate(() => window.__sections.tier(200))
  info(`tier(9)=${t9.label} tier(100)=${t100.label} tier(200)=${t200.label}; prices ${JSON.stringify([t9.price, t100.price, t200.price])}`)
  ok(t9.label === '1 to 9' && t100.label === '100+' && t200.label === '100+', 'tier edges resolve')
  ok(t9.price === null && t100.price === null, 'null prices read as null, not 0 or NaN')

  /* --- form: invalid first --- */
  await scrollTo(page, '#order-form', 'center')
  await page.fill('#f-firm', ''); await page.fill('#f-name', ''); await page.fill('#f-email', 'not-an-email'); await page.fill('#f-qty', '0')
  await page.click('#order-form button[type="submit"]')
  await sleep(200)
  const invalid = await page.$$eval('#order-form [aria-invalid="true"]', els => els.map(e => e.id))
  const errs = await page.$$eval('#order-form .field[data-error]', els => els.map(e => e.dataset.error))
  const hiddenAfterInvalid = await page.$eval('#form-summary', el => el.hidden)
  info(`invalid submit: aria-invalid on ${JSON.stringify(invalid)}, hints ${JSON.stringify(errs)}, summary hidden=${hiddenAfterInvalid}`)
  ok(invalid.length === 4 && hiddenAfterInvalid, 'four invalid fields flagged, summary stays hidden')

  /* --- form: valid --- */
  const FIRM = 'Maple Leaf Trading Co'
  const o = await submitOrder(page, { firm: FIRM, notes: 'Vent clips if you have them. Need by the trade show.' })
  const stillInvalid = await page.$$eval('#order-form [aria-invalid="true"]', els => els.length)
  info(`summary visible=${o.visible}, invalid left=${stillInvalid}`)
  console.log(o.text.split('\n').map(l => '       | ' + l).join('\n'))
  info(`summary note: "${o.note}"`)
  ok(o.visible, '#form-summary is visible after a valid submit')
  ok(o.text.includes(FIRM), `summary contains the firm name "${FIRM}"`)
  ok(o.text.includes('Order request for Seed Scent') && o.text.includes('Sent from the Seed Scent website'), 'summary has the header and footer lines')
  ok(o.text.includes('Bulk tier (tiers to be confirmed): 50+ at [ price ] each'), 'bulk tier line: "(tiers to be confirmed)" after the label, "[ price ]" for the unknown price')
  ok(o.text.includes('Scent: Scent two'), 'summary names the chosen scent by its option label while the config name is null')
  ok(o.note === 'The team has not published an order email yet. Nothing was sent. Copy the request and send it to them another way.', 'no-email note: not published yet, nothing sent, send it another way')
  ok(!LEAKS.test(o.text) && !LEAKS.test(o.note) && !DASHES.test(o.text + o.note), 'request and note carry no null/NaN/undefined, no file names, no em or en dashes')
  ok(stillInvalid === 0, 'no field left flagged')
  ok(page.url().startsWith('http://127.0.0.1:3001/index.html'), 'no mailto was opened (email is null)')
  // copy button
  await page.click('#form-summary [data-copy]')
  await sleep(150)
  const copyLabel = (await page.textContent('#form-summary [data-copy]')).trim()
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  info(`copy button reads "${copyLabel}", clipboard length ${clip.length}`)
  ok(copyLabel === 'Copied', 'copy button reports Copied')
  ok(clip.includes(FIRM), 'clipboard holds the request text')

  /* --- hover life in the firms section (css/sections.css) --- */
  await scrollTo(page, '#tiers', 'center')
  await sleep(1200) // the reveal finishes
  const idle = page.locator('#tiers .tier:not(.active)').first()
  const read = el => ({ bg: getComputedStyle(el).backgroundColor, tf: getComputedStyle(el).transform })
  const idle0 = await idle.evaluate(read)
  await idle.hover(); await sleep(700)
  const idle1 = await idle.evaluate(read)
  info(`idle tier: rest ${JSON.stringify(idle0)} -> hover ${JSON.stringify(idle1)}`)
  ok(idle0.bg === 'rgb(243, 235, 211)' && idle0.tf === 'none', 'idle tier at rest: paper-2, no transform')
  ok(idle1.bg === 'rgb(233, 223, 192)' && idle1.tf === 'matrix(1, 0, 0, 1, 4, 0)', 'idle tier on hover: paper-3 and translateX(4px)')
  const act = page.locator('#tiers .tier.active')
  await act.hover(); await sleep(700)
  const act1 = await act.evaluate(read)
  info(`active tier on hover: ${JSON.stringify(act1)}`)
  ok(act1.bg === 'rgb(168, 200, 143)' && act1.tf === 'matrix(1, 0, 0, 1, 10, 0)', 'active tier keeps sage and translateX(10px) under the pointer')
  await scrollTo(page, '.ways', 'center')
  await sleep(1200)
  const way = page.locator('.way').nth(1)
  const way0 = await way.evaluate(el => getComputedStyle(el).boxShadow)
  await way.hover(); await sleep(800)
  const way1 = await way.evaluate(el => getComputedStyle(el).boxShadow)
  const wayColor = shadowColor(way1)
  info(`way box-shadow: rest "${way0}" -> hover "${way1}" (color ${JSON.stringify(wayColor)})`)
  ok(way0 === 'none' && JSON.stringify(wayColor) === '[32,52,25,0.35]' && /0px 24px 50px -30px/.test(way1), 'a way lifts on hover: ink at 35% (32,52,25), 0 24px 50px -30px')
  await page.mouse.move(5, 5)
  await scrollTo(page, '#tiers', 'center')
  const range = await page.$eval('#qty-range', el => {
    const s = getComputedStyle(el)
    const rules = []
    for (const sheet of document.styleSheets) {
      let list = []
      try { list = [...sheet.cssRules] } catch { continue }
      for (const r of list) if (r.selectorText && /#qty-range/.test(r.selectorText)) rules.push(r.selectorText)
    }
    return { appearance: s.appearance, height: s.height, rules }
  })
  info(`slider: appearance=${range.appearance} height=${range.height}; ${range.rules.length} #qty-range rules in the sheets (${range.rules.filter(r => /thumb/.test(r)).length} for the thumb)`)
  ok(range.appearance === 'none', 'slider has appearance: none (custom thumb and track)')
  ok(range.rules.some(r => r.includes('#qty-range::-webkit-slider-thumb')) && range.rules.some(r => r.includes('#qty-range:hover::-webkit-slider-thumb')), 'thumb rule and its hover rule are in the sheet')
  const rest = await measureThumb(page)
  info(`thumb at rest (pixels): moss disc ${rest.w}x${rest.h} from ${rest.n} pixels, ring=${rest.ring}, track beyond=${rest.track}, left of disc ${JSON.stringify(rest.left)}`)
  ok(rest.n > 0 && rest.w >= 21 && rest.w <= 23 && rest.h >= 21 && rest.h <= 23, `thumb draws as a 22px moss disc (${rest.w}x${rest.h})`)
  ok(rest.ring && rest.track, 'a cream ring sits between the disc and the paper-3 track')
  await page.mouse.move(rest.clip.x + rest.cx, rest.clip.y + rest.cy, { steps: 4 })
  await sleep(500)
  const hov = await measureThumb(page)
  await page.mouse.down(); await sleep(400)
  const pressed = await measureThumb(page)
  await page.mouse.up()
  info(`thumb under the pointer: ${hov.w}x${hov.h}; pressed: ${pressed.w}x${pressed.h}`)
  ok(hov.w >= 24 && hov.w <= 27 && hov.h >= 24 && hov.h <= 27, `thumb grows under the pointer (scale 1.15: ${hov.w}x${hov.h})`)
  ok(pressed.w >= 24 && pressed.w <= 27, `thumb stays grown while pressed (${pressed.w}x${pressed.h})`)
  await page.mouse.move(5, 5)
  await sleep(500)
  const back = await measureThumb(page)
  ok(back.w >= 21 && back.w <= 23, `thumb returns to 22px when the pointer leaves (${back.w}x${back.h})`)
  const sliderBox = await page.locator('.tier-control').boundingBox()
  await page.screenshot({ path: join(OUT, 'sections-slider-1440.png'), clip: { x: sliderBox.x - 10, y: sliderBox.y - 10, width: sliderBox.width + 20, height: sliderBox.height + 20 } })

  /* --- cross-section interaction --- */
  await scrollTo(page, '#paper-xsec', 'center')
  const box = await page.locator('#paper-xsec').boundingBox()
  info(`svg on screen at ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`)
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3, { steps: 4 })
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 10 })
  await page.evaluate(() => window.__xsec.tick(1 / 60, 8))
  const running = await page.evaluate(() => window.__xsec.running())
  const disp1 = await page.evaluate(() => window.__xsec.displaced())
  info(`after pointer move + 8 pumped frames: displaced=${disp1} of ${x0.seeds}, loop running=${running}`)
  ok(disp1 > 0 && running, `a pointer merely moving over the sheet stirs the seeds (displaced=${disp1}, running=${running})`)
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 12 })
  await page.evaluate(() => window.__xsec.tick(1 / 60, 8))
  const disp2 = await page.evaluate(() => window.__xsec.displaced())
  info(`after a sweep: displaced=${disp2}`)
  // leave and let the springs settle
  await page.mouse.move(5, 5, { steps: 3 })
  await page.evaluate(() => window.__xsec.tick(1 / 60, 360))
  const disp3 = await page.evaluate(() => window.__xsec.displaced())
  info(`after leaving + 360 pumped frames: displaced=${disp3}`)
  ok(disp3 === 0, 'seeds spring back home')
  const drifting = await page.$$eval('#paper-xsec .xsec-fibres path[transform]', els => els.length)
  info(`fibres drifting while in view: ${drifting}`)
  ok(drifting > 0, 'idle fibre drift is running while in view')

  /* --- pause motion mid-displacement: seeds rest within 1s, nothing left on the frame queue --- */
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
  await page.evaluate(() => window.__xsec.tick(1 / 60, 6))
  const before = await page.evaluate(() => window.__xsec.displaced())
  ok(before > 0, `seeds displaced before the pause (${before})`)
  const tPause = Date.now()
  await setPaused(page, true)
  let settledMs = null
  while (Date.now() - tPause < 1000) {
    if ((await page.evaluate(() => window.__xsec.displaced())) === 0) { settledMs = Date.now() - tPause; break }
    await sleep(16)
  }
  await sleep(150) // any frame that was already queued has run by now
  const paused = await motionState(page)
  const toggle = await page.$eval('#motion-toggle', b => ({ label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') }))
  info(`pause mid-displacement: displaced ${before} -> ${paused.xsec.displaced} after ${settledMs}ms; xsec running=${paused.xsec.running}, loop size=${paused.loop}, rAF pending=${paused.raf}, button "${toggle.label}" aria-pressed=${toggle.pressed}`)
  ok(settledMs != null && settledMs <= 1000, `seeds at rest within 1s of pausing (${settledMs}ms)`)
  ok(!paused.xsec.running && paused.loop === 0 && !paused.raf, 'figure holds no animation loop while paused: not in the loop, loop empty, no rAF scheduled')
  const drift = await page.$$eval('#paper-xsec .xsec-fibres path[transform]', els => els.length)
  ok(drift === 0, `fibre drift cleared while paused (${drift} fibres still transformed)`)
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 4 })
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 })
  await sleep(150)
  const whilePaused = await motionState(page)
  ok(whilePaused.xsec.displaced === 0 && !whilePaused.xsec.running && !whilePaused.raf && whilePaused.loop === 0, `pointer over the sheet while paused: displaced=${whilePaused.xsec.displaced}, loop=${whilePaused.loop}, rAF=${whilePaused.raf}`)
  await setPaused(page, false)
  await sleep(250)
  const resumed = await page.evaluate(() => ({ running: window.__xsec.running(), drift: document.querySelectorAll('#paper-xsec .xsec-fibres path[transform]').length }))
  ok(resumed.running && resumed.drift > 0, `play again: loop resumes in view and the fibres drift (${resumed.drift})`)
  await page.mouse.move(5, 5)

  /* --- skew: wheel scroll on the inside section --- */
  await scrollTo(page, '#spec', 'center')
  await page.mouse.move(720, 450)
  let peak = 0
  const t0 = Date.now()
  await page.mouse.wheel(0, 420)
  while (Date.now() - t0 < 900) {
    const s = await page.evaluate(() => window.__sections.skew())
    peak = Math.max(peak, Math.abs(s))
    await sleep(16)
  }
  await sleep(1200)
  const skewRest = await page.evaluate(() => window.__sections.skew())
  const rowsSkewed = await page.evaluate(() => window.__sections.skewRows)
  info(`velocity skew: ${rowsSkewed} rows, peak ${peak.toFixed(2)}deg after a wheel flick, at rest ${skewRest.toFixed(3)}deg`)
  ok(peak > 0 && peak <= 4.0001, 'skew moved and stayed within 4 degrees')
  ok(Math.abs(skewRest) < 0.01, 'skew lerps back to 0')

  /* --- skew: pause mid-flick straightens every row in the same tick --- */
  await scrollTo(page, '#spec', 'center')
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, 460)
  let lean = 0, leanRows = 0
  const t1 = Date.now()
  while (Date.now() - t1 < 800) {
    const s = await page.evaluate(() => ({ skew: window.__sections.skew(), rows: [...document.querySelectorAll('#spec tbody tr, .steps li')].filter(r => r.style.transform).length }))
    if (Math.abs(s.skew) > 0.15) { lean = s.skew; leanRows = s.rows; break }
    await sleep(8)
  }
  await setPaused(page, true)
  const straight = await motionState(page)
  info(`skew at the pause: ${lean.toFixed(3)}deg on ${leanRows} rows -> ${straight.skew}deg on ${straight.skewed} rows, skew in the loop=${straight.skewRunning}`)
  ok(Math.abs(lean) > 0.15 && leanRows > 0, `rows were leaning when motion was paused (${lean.toFixed(3)}deg)`)
  ok(straight.skew === 0 && straight.skewed === 0 && !straight.skewRunning, 'pause resets the skew to 0 and clears every row transform at once')
  await sleep(150)
  const quiet = await motionState(page)
  ok(quiet.loop === 0 && !quiet.raf && quiet.skewed === 0, `nothing scheduled while paused after the flick (loop=${quiet.loop}, rAF=${quiet.raf})`)
  await setPaused(page, false)
  info(`scroll settled ${await settleScroll(page)}ms after play (Lenis carries the flick on)`)

  /* --- tilt --- */
  await scrollTo(page, '#scent-cards', 'center')
  const card = await page.locator('.card[data-tilt]').first().boundingBox()
  await page.mouse.move(card.x + card.width * 0.85, card.y + card.height * 0.2, { steps: 6 })
  await sleep(350)
  const tr = await page.$eval('.card[data-tilt]', el => el.style.transform)
  const tiltState = await page.evaluate(() => window.__sections.tilt())
  info(`tilt: ${tiltState.count} cards, active ${tiltState.active}, transform "${tr}"`)
  const rx = Number((tr.match(/rotateX\((-?[\d.]+)deg\)/) || [])[1])
  const ry = Number((tr.match(/rotateY\((-?[\d.]+)deg\)/) || [])[1])
  ok(/perspective/.test(tr) && Math.abs(rx) > 0.5 && Math.abs(ry) > 0.5, `tilt applied (rotateX ${rx} rotateY ${ry})`)
  ok(Math.abs(rx) <= 6 && Math.abs(ry) <= 6, 'tilt within 6 degrees')
  await sleep(1000) // the photo zoom is a 0.9s transition
  const img = await page.$eval('.card[data-tilt] .card-media img', el => ({ hidden: el.hidden, transform: getComputedStyle(el).transform }))
  info(`card image on hover (after the transition): hidden=${img.hidden} transform=${img.transform}`)
  if (img.hidden) info('card photo slot is still hidden (main.js did not run fillSlots): the 1.05 zoom check is skipped, it is not a sections.js matter')
  else ok(img.transform.startsWith('matrix(1.05'), 'card image scales to 1.05 on hover')
  // pause while tilted: flat at once, nothing scheduled
  await setPaused(page, true)
  const flat = await motionState(page)
  ok(flat.tilted === 0, `pause while tilted flattens the card in the same tick (${flat.tilted} cards still transformed)`)
  await sleep(150)
  const flatQuiet = await motionState(page)
  ok(flatQuiet.loop === 0 && !flatQuiet.raf, `nothing scheduled while paused after the tilt (loop=${flatQuiet.loop}, rAF=${flatQuiet.raf})`)
  await setPaused(page, false)
  await page.mouse.move(5, 5, { steps: 4 })
  await sleep(1400)
  const trAfter = await page.$eval('.card[data-tilt]', el => el.style.transform)
  ok(trAfter === '', `tilt resets on leave (transform "${trAfter}")`)

  /* --- reveal: walk past every candidate --- */
  await scrollTo(page, '#planting-steps', 'center')
  await scrollTo(page, '#firms', 'end')
  await sleep(1300)
  const rv1 = await page.evaluate(() => ({ marked: [...document.querySelectorAll('.rv')].map(e => e.className), ...window.__sections.reveal() }))
  info(`reveal after the tour: ${rv1.revealed}/${rv1.total} revealed, pending ${rv1.pending}, still marked: ${JSON.stringify(rv1.marked)}`)
  ok(rv1.revealed === rv1.total && rv1.marked.length === 0 && rv1.pending === 0, 'every candidate revealed and stripped of reveal classes')
  const tierTransitions = await page.$eval('#tiers .tier', el => getComputedStyle(el).transitionProperty)
  info(`tier transition-property after reveal: ${tierTransitions}`)
  ok(/background/.test(tierTransitions) && !/opacity/.test(tierTransitions), 'tiers get their stock transitions back')

  /* --- the frame loop idles when nothing is in view --- */
  await scrollTo(page, '#hero')
  await sleep(800)
  const idleLoop = await motionState(page)
  ok(idleLoop.loop === 0 && !idleLoop.raf, `frame loop empty on the hero (size ${idleLoop.loop}, rAF pending ${idleLoop.raf})`)

  /* --- screenshots --- */
  await scrollTo(page, '#inside')
  await sleep(900)
  await page.screenshot({ path: join(OUT, 'sections-inside-1440.png') })
  await scrollTo(page, '#firms')
  await sleep(900)
  await page.screenshot({ path: join(OUT, 'sections-firms-1440.png') })

  info(`loop size at the end: ${await page.evaluate(() => window.__sections.loop())}`)
  await ctx.close()
  return log
}

/* --------------------------------------------------- config variants (desktop) */
async function variants(browser) {
  /* V1: prices typed the way a student might type them; tiers still a draft; motion paused at the top */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  await overrideConfig(ctx, c => {
    c.bulkTiers[0].price = 4.5       // a number
    c.bulkTiers[1].price = 'abc'     // not a number at all
    c.bulkTiers[2].price = '4.50'    // typed as text
    c.bulkTiers[3].price = ''        // emptied
  })
  const page = await ctx.newPage()
  const log = watch(page, 'variants')
  await page.goto(url(), { waitUntil: 'load' })
  await settle(page)
  const served = await page.evaluate(() => (window.SEED_SCENT.bulkTiers || []).map(t => t.price))
  info(`variant config served: tier prices ${JSON.stringify(served)}`)
  ok(served[2] === '4.50' && served[1] === 'abc', 'config override is in effect')

  /* reveal: pausing motion at the top leaves nothing hidden and nothing pending */
  const rvA = await page.evaluate(() => ({ marked: document.querySelectorAll('.rv').length, ...window.__sections.reveal() }))
  await setPaused(page, true)
  const rvB = await page.evaluate(() => ({ marked: document.querySelectorAll('.rv').length, inClass: document.querySelectorAll('.in').length, ...window.__sections.reveal() }))
  info(`reveal across a pause at the top: marked ${rvA.marked} -> ${rvB.marked}, pending ${rvA.pending} -> ${rvB.pending}, revealed ${rvA.revealed} -> ${rvB.revealed}/${rvB.total}`)
  ok(rvA.marked === rvA.total && rvA.pending === rvA.total, 'before the pause every candidate was waiting to reveal')
  ok(rvB.marked === 0 && rvB.inClass === 0 && rvB.pending === 0 && rvB.revealed === rvB.total, 'pausing motion reveals everything at once: no .rv or .in left, nothing pending')
  const opq = await page.$$eval('.tier, .way, .steps li, .card', els => els.map(e => getComputedStyle(e).opacity).filter(o => o !== '1').length)
  ok(opq === 0, `no reveal candidate left transparent after the pause (${opq})`)
  await setPaused(page, false)
  const rvC = await page.evaluate(() => ({ marked: document.querySelectorAll('.rv').length, ...window.__sections.reveal() }))
  ok(rvC.marked === 0 && rvC.revealed === rvC.total, 'playing again hides nothing that is already shown')

  /* tier note and prices through num() */
  await scrollTo(page, '#firms')
  const prices = await page.evaluate(() => [5, 24, 60, 150].map(n => ({ n, ...window.__sections.tier(n) })))
  info(`tier(n).price: ${JSON.stringify(prices.map(p => [p.n, p.label, p.price]))}`)
  ok(prices[0].price === 4.5 && prices[2].price === 4.5, 'number 4.5 and text "4.50" both read as 4.5')
  ok(prices[1].price === null && prices[3].price === null, '"abc" and "" read as null (not NaN, not 0)')
  const notes = {}
  for (const n of [60, 1, 24, 150, 5]) { await slide(page, n); notes[n] = await noteText(page) }
  info(`tier note by quantity: ${JSON.stringify(notes)}`)
  ok(notes[60] === '$4.50 each at 60 units', 'note at 60 (text price "4.50"): "$4.50 each at 60 units"')
  ok(notes[5] === '$4.50 each at 5 units', 'note at 5 (number 4.5): "$4.50 each at 5 units"')
  ok(notes[1] === '$4.50 each at 1 unit', 'note at 1 reads "unit"')
  ok(notes[24] === 'Tiers and pricing are being finalized.', 'note at 24 ("abc"): "Tiers and pricing are being finalized."')
  ok(notes[150] === 'Tiers and pricing are being finalized.', 'note at 150 (""): "Tiers and pricing are being finalized."')
  ok(!Object.values(notes).some(t => LEAKS.test(t) || DASHES.test(t)), 'no note shows null/NaN/undefined or a dash')

  /* the order request: a known price and an unknown one, tiers still to be confirmed */
  await scrollTo(page, '#order-form', 'center')
  const o60 = await submitOrder(page, { qty: '60' })
  const o24 = await submitOrder(page, { qty: '24' })
  info(`order line at 60: "${o60.text.split('\n').find(l => /^Bulk tier/.test(l))}"`)
  info(`order line at 24: "${o24.text.split('\n').find(l => /^Bulk tier/.test(l))}"`)
  ok(o60.text.includes('Bulk tier (tiers to be confirmed): 50+ at $4.50 each'), 'order text at 60 prices the 50+ tier from the text "4.50"')
  ok(o24.text.includes('Bulk tier (tiers to be confirmed): 10+ at [ price ] each'), 'order text at 24 shows "[ price ]" for "abc"')
  ok(!LEAKS.test(o60.text + o24.text) && !DASHES.test(o60.text + o24.text), 'order texts carry no null/NaN/undefined, file names or dashes')
  await page.screenshot({ path: join(OUT, 'sections-variant-typed-prices.png') })
  await ctx.close()

  /* V2: tiers confirmed and an order email published */
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  await overrideConfig(ctx2, c => {
    c.tiersConfirmed = true
    c.contact.email = 'orders@example.test'
    const p = ['4.50', '4', '3.50', '3']
    c.bulkTiers.forEach((t, i) => { t.price = p[i] })
  })
  const page2 = await ctx2.newPage()
  const log2 = watch(page2, 'variants-confirmed')
  const navs = []
  const cdp = await ctx2.newCDPSession(page2)
  await cdp.send('Page.enable')
  cdp.on('Page.frameRequestedNavigation', e => navs.push(e.url))
  cdp.on('Page.frameScheduledNavigation', e => navs.push(e.url))
  await page2.goto(url(), { waitUntil: 'load' })
  await settle(page2)
  await scrollTo(page2, '#firms')
  await slide(page2, 60)
  const note2 = await noteText(page2)
  await scrollTo(page2, '#order-form', 'center')
  navs.length = 0
  const o2 = await submitOrder(page2, { qty: '60' })
  const tierLine2 = o2.text.split('\n').find(l => /^Bulk tier/.test(l))
  const mailto = navs.find(u => u.startsWith('mailto:'))
  info(`confirmed tiers: note "${note2}", order line "${tierLine2}", summary note "${o2.note}"`)
  info(`mailto attempted: ${mailto ? decodeURIComponent(mailto).slice(0, 120) : 'none recorded'}`)
  ok(note2 === '$3.50 each at 60 units', 'note at 60 with text "3.50": "$3.50 each at 60 units"')
  ok(tierLine2 === 'Bulk tier: 50+ at $3.50 each', 'order line drops "(tiers to be confirmed)" once tiersConfirmed is true')
  ok(/orders@example\.test/.test(o2.note) && /should have opened/.test(o2.note), 'summary note says a draft to the published email should have opened')
  ok(!!mailto && /^mailto:orders(%40|@)example\.test\?subject=/.test(mailto), 'a mailto: to the published address was attempted')
  ok(!LEAKS.test(o2.text) && !LEAKS.test(o2.note) && !DASHES.test(o2.text + o2.note), 'confirmed-tier text and note carry no leaks or dashes')
  await ctx2.close()
  return [log, log2]
}

/* ----------------------------------------------------------------- mobile */
async function mobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const log = watch(page, 'mobile')
  await page.goto(url(), { waitUntil: 'load' })
  await settle(page)
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  info(`mobile: pointer coarse=${coarse}`)

  await scrollTo(page, '#paper-xsec', 'center')
  const box = await page.locator('#paper-xsec').boundingBox()
  // a synthetic touchmove over the drawing
  const disp = await page.evaluate(([bx, by, bw, bh]) => {
    const svg = document.getElementById('paper-xsec')
    const mk = (type, x, y) => {
      const touch = new Touch({ identifier: 1, target: svg, clientX: x, clientY: y, pageX: x, pageY: y })
      return new TouchEvent(type, { touches: [touch], changedTouches: [touch], targetTouches: [touch], bubbles: true, cancelable: true })
    }
    svg.dispatchEvent(mk('touchstart', bx + bw * 0.5, by + bh * 0.5))
    svg.dispatchEvent(mk('touchmove', bx + bw * 0.52, by + bh * 0.5))
    window.__xsec.tick(1 / 60, 8)
    return window.__xsec.displaced()
  }, [box.x, box.y, box.width, box.height])
  info(`mobile touchmove + 8 frames: displaced=${disp}`)
  ok(disp > 0, 'touchmove stirs the seeds on a coarse pointer')
  const tilt = await page.evaluate(() => window.__sections.tilt())
  ok(tilt.count === 0, `tilt skipped on coarse pointer (count=${tilt.count})`)
  // pause mid-touch: rest at once
  await setPaused(page, true)
  await sleep(150)
  const pausedM = await motionState(page)
  ok(pausedM.xsec.displaced === 0 && !pausedM.xsec.running && pausedM.loop === 0 && !pausedM.raf, `mobile pause rests the seeds and empties the loop (displaced=${pausedM.xsec.displaced}, loop=${pausedM.loop}, rAF=${pausedM.raf})`)
  await setPaused(page, false)
  const thumb = await page.$eval('#qty-range', el => ({ appearance: getComputedStyle(el).appearance, h: getComputedStyle(el).height }))
  info(`mobile slider: appearance=${thumb.appearance} height=${thumb.h}`)

  await scrollTo(page, '#paper-xsec', 'center')
  await sleep(900)
  await page.screenshot({ path: join(OUT, 'sections-inside-390.png') })
  await scrollTo(page, '#firms')
  await sleep(900)
  await page.screenshot({ path: join(OUT, 'sections-firms-390.png') })
  await ctx.close()
  return log
}

/* --------------------------------------------------------- reduced motion */
async function reduced(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const log = watch(page, 'reduced')
  await page.goto(url(), { waitUntil: 'load' })
  await settle(page)
  const st = await page.evaluate(() => ({
    rv: document.querySelectorAll('.rv').length,
    xsec: window.__sections.xsec(),
    reveal: window.__sections.reveal(),
    paused: document.getElementById('motion-toggle').textContent,
  }))
  info(`reduced motion: .rv elements=${st.rv}, xsec running=${st.xsec.running}, seeds=${st.xsec.seeds}, reveal ${st.reveal.revealed}/${st.reveal.total}, toggle "${st.paused}"`)
  ok(st.rv === 0, 'no reveal classes under prefers-reduced-motion')
  ok(!st.xsec.running, 'cross-section loop idle while motion is paused')
  ok(st.reveal.revealed === st.reveal.total, 'reveal counts everything as shown')
  await scrollTo(page, '#paper-xsec', 'center')
  const box = await page.locator('#paper-xsec').boundingBox()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
  await page.mouse.wheel(0, 300)
  await sleep(400)
  const q = await motionState(page)
  ok(q.loop === 0 && !q.raf && q.xsec.displaced === 0 && q.skewed === 0, `pointer and wheel under reduced motion schedule nothing (loop=${q.loop}, rAF=${q.raf}, displaced=${q.xsec.displaced}, skewed rows=${q.skewed})`)
  await ctx.close()
  return log
}

const browser = await chromium.launch()
try {
  const logs = []
  logs.push(await desktop(browser))
  logs.push(...await variants(browser))
  logs.push(await mobile(browser))
  logs.push(await reduced(browser))
  for (const l of logs) {
    ok(l.errors.length === 0, `${l.label}: console/page errors from the site = ${l.errors.length}${l.errors.length ? ' -> ' + l.errors.join(' | ') : ''}`)
    if (l.notMine.length) info(`${l.label}: errors and missing resources from other modules (not sections): ${[...new Set(l.notMine)].join(' | ')}`)
  }
} finally {
  await browser.close()
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
