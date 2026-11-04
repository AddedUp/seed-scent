/* Verifies js/sections.js + css/sections.css in a real Chromium.
   Run: cd tools/playwright && node check-sections.mjs
   Prints the numbers that prove each part works and saves screenshots to out/. */
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

function watch(page, label) {
  const errors = [], notMine = []
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/cart\.(js|css)/.test(t) || /Failed to load resource/.test(t)) notMine.push(t); else errors.push(t)
  })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
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

  /* --- tiers --- */
  await scrollTo(page, '#firms')
  await page.$eval('#qty-range', el => { el.value = '60'; el.dispatchEvent(new Event('input', { bubbles: true })) })
  await sleep(700)
  const out = (await page.textContent('#qty-out')).trim()
  const activeTier = await page.$$eval('#tiers .tier.active', els => els.map(e => e.querySelector('.tier-qty').textContent.trim()))
  const note = (await page.textContent('#tier-note')).trim()
  info(`slider -> 60: output "${out}", active tier ${JSON.stringify(activeTier)}, note "${note}"`)
  ok(out === '60', 'output reads 60')
  ok(activeTier.length === 1 && activeTier[0] === '50+', 'tier 50+ is the only active tier')
  ok(note === 'Tier pricing is being finalized.', 'note falls back while prices are null')
  const t9 = await page.evaluate(() => window.__sections.tier(9))
  const t100 = await page.evaluate(() => window.__sections.tier(100))
  const t200 = await page.evaluate(() => window.__sections.tier(200))
  info(`tier(9)=${t9.label} tier(100)=${t100.label} tier(200)=${t200.label}`)
  ok(t9.label === '1 to 9' && t100.label === '100+' && t200.label === '100+', 'tier edges resolve')

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
  await page.fill('#f-firm', FIRM)
  await page.fill('#f-name', 'Jordan Reyes')
  await page.fill('#f-email', 'jordan@mapleleaf.example')
  await page.selectOption('#f-scent', '1')
  await page.fill('#f-qty', '60')
  await page.fill('#f-notes', 'Vent clips if you have them. Need by the trade show.')
  await page.click('#order-form button[type="submit"]')
  await sleep(300)
  const visible = await page.isVisible('#form-summary')
  const summaryText = (await page.textContent('#form-summary .summary-text')) || ''
  const noteText = (await page.textContent('#form-summary .summary-note')) || ''
  const stillInvalid = await page.$$eval('#order-form [aria-invalid="true"]', els => els.length)
  info(`summary visible=${visible}, invalid left=${stillInvalid}`)
  console.log(summaryText.split('\n').map(l => '       | ' + l).join('\n'))
  info(`summary note: "${noteText.trim()}"`)
  ok(visible, '#form-summary is visible after a valid submit')
  ok(summaryText.includes(FIRM), `summary contains the firm name "${FIRM}"`)
  ok(summaryText.includes('Order request for Seed Scent') && summaryText.includes('Sent from the Seed Scent website'), 'summary has the header and footer lines')
  ok(summaryText.includes('Bulk tier: 50+ at [ price ] each'), 'summary names the 50+ tier with a price placeholder')
  ok(summaryText.includes('Scent: Scent two'), 'summary names the chosen scent by its option label while the config name is null')
  ok(/placeholder/.test(noteText) && /Nothing was sent/.test(noteText), 'summary says nothing was sent because the contact email is a placeholder')
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
  ok(disp1 > 0, `__xsec.displaced() > 0 (${disp1})`)
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

  /* --- pause motion: seeds rest, loop stops --- */
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
  await page.evaluate(() => window.__xsec.tick(1 / 60, 6))
  const before = await page.evaluate(() => window.__xsec.displaced())
  await page.click('#motion-toggle')
  await sleep(250)
  const paused = await page.evaluate(() => ({ displaced: window.__xsec.displaced(), running: window.__xsec.running(), label: document.getElementById('motion-toggle').textContent }))
  info(`pause motion: displaced ${before} -> ${paused.displaced}, running=${paused.running}, button "${paused.label}"`)
  ok(paused.displaced === 0 && !paused.running, 'pausing motion rests the seeds and stops the loop')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 4 })
  await sleep(120)
  const whilePaused = await page.evaluate(() => window.__xsec.displaced())
  ok(whilePaused === 0, `pointer does nothing while paused (displaced=${whilePaused})`)
  await page.click('#motion-toggle')
  await sleep(250)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
  await sleep(120)
  const resumed = await page.evaluate(() => window.__xsec.running())
  ok(resumed, 'loop resumes after Play motion')
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
  const imgScale = await page.$eval('.card[data-tilt] .card-media img', el => getComputedStyle(el).transform)
  info(`card image transform on hover (after the transition): ${imgScale}`)
  ok(imgScale !== 'none' && imgScale.startsWith('matrix(1.05'), 'card image scales to 1.05 on hover')
  await page.mouse.move(5, 5, { steps: 4 })
  await sleep(1400)
  const trAfter = await page.$eval('.card[data-tilt]', el => el.style.transform)
  ok(trAfter === '', `tilt resets on leave (transform "${trAfter}")`)

  /* --- reveal: walk past every candidate --- */
  await scrollTo(page, '#planting-steps', 'center')
  await scrollTo(page, '#firms', 'end')
  await sleep(1300)
  const rv1 = await page.evaluate(() => ({ marked: [...document.querySelectorAll('.rv')].map(e => e.className), ...window.__sections.reveal() }))
  info(`reveal after the tour: ${rv1.revealed}/${rv1.total} revealed, still marked: ${JSON.stringify(rv1.marked)}`)
  ok(rv1.revealed === rv1.total && rv1.marked.length === 0, 'every candidate revealed and stripped of reveal classes')
  const tierTransitions = await page.$eval('#tiers .tier', el => getComputedStyle(el).transitionProperty)
  info(`tier transition-property after reveal: ${tierTransitions}`)
  ok(/background/.test(tierTransitions) && !/opacity/.test(tierTransitions), 'tiers get their stock transitions back')

  /* --- the frame loop idles when nothing is in view --- */
  await scrollTo(page, '#hero')
  await sleep(800)
  const idle = await page.evaluate(() => window.__sections.loop())
  ok(idle === 0, `frame loop empty on the hero (size ${idle})`)

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
    paused: document.getElementById('motion-toggle').textContent,
  }))
  info(`reduced motion: .rv elements=${st.rv}, xsec running=${st.xsec.running}, seeds=${st.xsec.seeds}, toggle "${st.paused}"`)
  ok(st.rv === 0, 'no reveal classes under prefers-reduced-motion')
  ok(!st.xsec.running, 'cross-section loop idle while motion is paused')
  await ctx.close()
  return log
}

const browser = await chromium.launch()
try {
  const logs = []
  logs.push(await desktop(browser))
  logs.push(await mobile(browser))
  logs.push(await reduced(browser))
  for (const l of logs) {
    ok(l.errors.length === 0, `${l.label}: console/page errors from the site = ${l.errors.length}${l.errors.length ? ' -> ' + l.errors.join(' | ') : ''}`)
    if (l.notMine.length) info(`${l.label}: resources missing (other modules, not sections): ${[...new Set(l.notMine)].join(', ')}`)
  }
} finally {
  await browser.close()
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
