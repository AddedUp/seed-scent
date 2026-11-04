/* Team page check: loads team.html from the local server, asserts the cards,
   placeholders, nav, footer, copy rules, console, hover tilt and rise-in, then
   saves screenshots at 1440x900 and 390x844 under tools/playwright/out/.
   Run: cd tools/playwright && node check-team.mjs */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })

const BASE = process.env.SEED_BASE || 'http://127.0.0.1:3001'
const PAGE = `${BASE}/team.html?bust=${Date.now()}`
/* textContent of the home footer (the [ ] around chips are CSS pseudo-elements, so they are not in the text) */
const FOOTER = ['A Virtual Enterprise company', 'school · city, state', 'Smells great. Leaves eventually.']

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}

async function open(browser, label, ctxOpts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts })
  const page = await ctx.newPage()
  const log = { errors: [], warnings: [], pageErrors: [], failed: [], requests: [] }
  page.on('console', m => {
    const entry = { text: m.text(), url: m.location().url || '' }
    if (m.type() === 'error') log.errors.push(entry)
    else if (m.type() === 'warning') log.warnings.push(entry)
  })
  page.on('pageerror', e => log.pageErrors.push(e.message))
  page.on('requestfailed', r => log.failed.push(r.url()))
  page.on('request', r => log.requests.push(r.url()))
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  try { await page.waitForFunction(() => window.__team && typeof window.__team.count === 'function', null, { timeout: 8000 }) }
  catch { check(`[${label}] team.js booted`, false, `page errors: ${log.pageErrors.join(' | ') || 'none'}`) }
  return { ctx, page, log }
}

/* which optional photo files are really missing (asked from Node, so the page console stays clean) */
async function missingPhotos(ctx) {
  const team = await (await ctx.request.get(`${BASE}/js/config.js`)).text()
  const photos = [...team.matchAll(/photo:\s*"([^"]+)"/g)].map(m => m[1])
  const missing = []
  for (const p of photos) { const r = await ctx.request.head(`${BASE}/${p}`); if (!r.ok()) missing.push(p) }
  return { photos, missing }
}

function reportConsole(label, log, expectedMissing) {
  const expected = log.errors.filter(e => expectedMissing.some(p => e.url.endsWith('/' + p)))
  const other = log.errors.filter(e => !expected.includes(e))
  console.log(`[${label}] console: ${log.errors.length} error lines (${expected.length} are the expected 404s for missing team photos), ${log.warnings.length} warnings, ${log.pageErrors.length} page errors, ${log.failed.length} failed requests`)
  other.forEach(e => console.log('   unexpected console error:', e.text, e.url))
  log.pageErrors.forEach(e => console.log('   page error:', e))
  log.warnings.forEach(w => console.log('   warning:', w.text))
  check(`[${label}] no unexpected console errors`, other.length === 0, `${other.length} unexpected`)
  check(`[${label}] no page errors`, log.pageErrors.length === 0)
  const external = log.requests.filter(u => !u.startsWith(BASE + '/'))
  check(`[${label}] zero external requests`, external.length === 0, `${log.requests.length} requests, ${external.length} external`)
}

async function structure(page, label, missing) {
  const d = await page.evaluate(() => {
    const txt = el => (el ? el.textContent.trim().replace(/\s+/g, ' ') : null)
    const cards = [...document.querySelectorAll('.team-card')]
    return {
      title: document.title,
      activeNav: txt(document.querySelector('.nav-links a.active[aria-current="page"]')),
      navHrefs: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')),
      orderPill: document.querySelector('.nav-actions .pill').getAttribute('href'),
      configTeam: (window.SEED_SCENT.team || []).length,
      cards: cards.length,
      ghostNums: cards.map(c => txt(c.querySelector('.ghost-num'))),
      chips: window.__team.chips(),
      chipKinds: [...document.querySelectorAll('.team-card .ph')].map(e => e.textContent).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}),
      photos: window.__team.photos(),
      heroChips: [...document.querySelectorAll('.team-hero .annotation .ph')].map(e => e.textContent),
      heroHeading: txt(document.querySelector('#team-title')),
      heroKicker: txt(document.querySelector('.team-hero-top .kicker')),
      heroLogo: (() => { const i = document.querySelector('.team-hero-logo'); return i ? { src: i.getAttribute('src'), w: Math.round(i.getBoundingClientRect().width), complete: i.complete && i.naturalWidth > 0 } : null })(),
      regMarks: document.querySelectorAll('.team-hero .reg').length,
      how: [...document.querySelectorAll('.how li')].map(li => ({ kicker: txt(li.querySelector('.kicker')), line: txt(li.querySelector('p:last-child')) })),
      footer: [...document.querySelectorAll('.footer p')].map(p => txt(p)),
      noteShown: !document.getElementById('team-note').hidden,
      emDashes: document.documentElement.outerHTML.split(String.fromCharCode(8212)).length - 1,
      bodyEmDashes: document.body.innerText.split(String.fromCharCode(8212)).length - 1,
      heroBg: getComputedStyle(document.querySelector('.team-hero')).backgroundColor,
      heroRadius: getComputedStyle(document.querySelector('.team-hero')).borderRadius,
      gridCols: getComputedStyle(document.getElementById('team-grid')).gridTemplateColumns.split(' ').length,
      pageHeight: document.documentElement.scrollHeight,
      hasLenis: window.__team.hasLenis,
    }
  })
  console.log(`[${label}] numbers:`, JSON.stringify({ cards: d.cards, chips: d.chips, chipKinds: d.chipKinds, photos: d.photos, ghostNums: d.ghostNums, gridCols: d.gridCols, pageHeight: d.pageHeight, heroLogo: d.heroLogo, hasLenis: d.hasLenis }))
  check(`[${label}] title`, d.title === 'Seed Scent · The team', d.title)
  check(`[${label}] Team marked active in nav`, d.activeNav === 'Team', String(d.activeNav))
  check(`[${label}] other nav links go back to index.html anchors`, d.navHrefs.filter(h => h !== 'team.html').every(h => /^index\.html#(drive|scents|inside|firms|contact)$/.test(h)) && d.navHrefs.length === 6, d.navHrefs.join(' '))
  check(`[${label}] Order pill links to index.html#firms`, d.orderPill === 'index.html#firms', d.orderPill)
  check(`[${label}] 6 team cards rendered from config`, d.cards === 6 && d.cards === d.configTeam, `${d.cards} cards, config has ${d.configTeam}`)
  check(`[${label}] ghost numerals 01..06`, d.ghostNums.join(',') === '01,02,03,04,05,06', d.ghostNums.join(','))
  check(`[${label}] name/role/bio chips for every null value`, d.chips === 18 && d.chipKinds.name === 6 && d.chipKinds.role === 6 && d.chipKinds.bio === 6, JSON.stringify(d.chipKinds))
  check(`[${label}] photo slots: label for every missing file, image only when it loads`, d.photos.labels === missing.length && d.photos.shown === 6 - missing.length, `${d.photos.shown} shown, ${d.photos.labels} labels, ${missing.length} files missing`)
  check(`[${label}] header: sage card with radius and four + marks`, d.heroBg === 'rgb(168, 200, 143)' && d.heroRadius === '28px' && d.regMarks === 4, `${d.heroBg} ${d.heroRadius} ${d.regMarks} marks`)
  check(`[${label}] header kicker, heading, school chips, logo`, d.heroKicker === 'The team' && d.heroHeading === 'The people behind the paper.' && d.heroChips.join(',') === 'school,city,state' && d.heroLogo && d.heroLogo.complete && d.heroLogo.w > 80, `${d.heroKicker} | ${d.heroHeading} | ${d.heroChips.join(',')} | logo ${d.heroLogo && d.heroLogo.w}px`)
  check(`[${label}] how we work: three fragments with one line each`, d.how.length === 3 && d.how.every(h => h.kicker && h.line && h.line.split(/[.!?]\s/).length <= 3), JSON.stringify(d.how.map(h => h.kicker)))
  check(`[${label}] footer identical to home`, JSON.stringify(d.footer) === JSON.stringify(FOOTER), JSON.stringify(d.footer))
  check(`[${label}] placeholder note shown while chips remain`, d.noteShown === true)
  check(`[${label}] no em dashes anywhere in the document`, d.emDashes === 0 && d.bodyEmDashes === 0, `${d.emDashes} in markup`)
  return d
}

async function revealAll(page, label) {
  await page.evaluate(() => window.__team.scrollTo(document.documentElement.scrollHeight))
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__team.scrollTo(document.documentElement.scrollHeight))
  let ok = true
  try { await page.waitForFunction(() => window.__team.revealed() >= window.__team.revealTotal(), null, { timeout: 6000 }) } catch { ok = false }
  const r = await page.evaluate(() => ({
    revealed: window.__team.revealed(), total: window.__team.revealTotal(),
    opacities: [...document.querySelectorAll('.team-card, .how li')].map(el => getComputedStyle(el).opacity),
  }))
  check(`[${label}] rise-in finished for every card and fragment`, ok && r.revealed === r.total && r.opacities.every(o => o === '1'), `${r.revealed}/${r.total} revealed, opacities ${[...new Set(r.opacities)].join(',')}`)
  await page.evaluate(() => window.__team.scrollTo(0))
  await page.waitForTimeout(400)
}

async function tiltTest(page, label) {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  const n = await page.evaluate(() => window.__team.tilt().length)
  if (coarse) { check(`[${label}] tilt skipped on coarse pointer`, n === 0, `${n} tilt handlers, coarse=${coarse}`); return }
  check(`[${label}] tilt armed on every card`, n === 6, `${n} handlers`)
  const card = page.locator('.team-card').first()
  await page.evaluate(() => { const c = document.querySelector('.team-card'); window.__team.scrollTo(c.getBoundingClientRect().top + window.scrollY - 140) })
  await page.waitForTimeout(300)
  const b = await card.boundingBox()
  const at = (fx, fy) => page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 4 })
  await at(0.5, 0.5); await at(0.9, 0.85)
  await page.waitForTimeout(600)
  const t1 = (await page.evaluate(() => window.__team.tilt()))[0]
  check(`[${label}] tilt follows the pointer (bottom-right corner tips the card)`, t1.ry > 2 && t1.rx < -2 && t1.ry <= 5 && t1.rx >= -5, JSON.stringify(t1))
  await page.mouse.move(2, 2, { steps: 4 })
  await page.waitForTimeout(1200)
  const t2 = (await page.evaluate(() => window.__team.tilt()))[0]
  check(`[${label}] tilt settles back to flat`, Math.abs(t2.rx) < 0.05 && Math.abs(t2.ry) < 0.05, JSON.stringify(t2))
  await page.evaluate(() => { window.__team.motion.paused = true })
  await at(0.5, 0.5); await at(0.9, 0.85)
  await page.waitForTimeout(600)
  const t3 = (await page.evaluate(() => window.__team.tilt()))[0]
  check(`[${label}] tilt stays flat while motion is paused`, Math.abs(t3.rx) < 0.01 && Math.abs(t3.ry) < 0.01, JSON.stringify(t3))
  await page.evaluate(() => { window.__team.motion.paused = false })
  await page.mouse.move(2, 2)
  await page.evaluate(() => window.__team.scrollTo(0))
  await page.waitForTimeout(400)
}

async function shoot(page, label, file, fullPage) {
  const p = path.join(OUT, file)
  await page.screenshot({ path: p, fullPage })
  const { size } = fs.statSync(p)
  console.log(`[${label}] screenshot ${p} (${Math.round(size / 1024)} KB)`)
}

const browser = await chromium.launch()
try {
  /* desktop */
  {
    const { ctx, page, log } = await open(browser, 'desktop', { viewport: { width: 1440, height: 900 } })
    const { missing } = await missingPhotos(ctx)
    console.log(`[desktop] team photo files missing on disk: ${missing.length} (${missing.join(', ')})`)
    await structure(page, 'desktop', missing)
    await revealAll(page, 'desktop')
    await tiltTest(page, 'desktop')
    await shoot(page, 'desktop', 'team-1440-fold.png', false)
    await shoot(page, 'desktop', 'team-1440.png', true)
    reportConsole('desktop', log, missing)
    await ctx.close()
  }
  /* phone */
  {
    const { ctx, page, log } = await open(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const { missing } = await missingPhotos(ctx)
    const d = await structure(page, 'phone', missing)
    check('[phone] one column grid', d.gridCols === 1, `${d.gridCols} columns`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('[phone] no horizontal overflow', overflow <= 0, `${overflow}px`)
    await revealAll(page, 'phone')
    await tiltTest(page, 'phone')
    await shoot(page, 'phone', 'team-390.png', true)
    reportConsole('phone', log, missing)
    await ctx.close()
  }
  /* reduced motion */
  {
    const { ctx, page, log } = await open(browser, 'reduced', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const { missing } = await missingPhotos(ctx)
    const r = await page.evaluate(() => ({
      revealed: window.__team.revealed(), total: window.__team.revealTotal(), hasLenis: window.__team.hasLenis,
      opacities: [...new Set([...document.querySelectorAll('.team-card, .how li')].map(el => getComputedStyle(el).opacity))],
      cards: window.__team.count(),
    }))
    check('[reduced] everything visible at once, no Lenis', r.revealed === r.total && r.opacities.join() === '1' && r.hasLenis === false && r.cards === 6, JSON.stringify(r))
    reportConsole('reduced', log, missing)
    await ctx.close()
  }
  /* filled config: test-only values appended to config.js in transit, so the chips should go away */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await ctx.route('**/js/config.js*', async route => {
      const res = await route.fetch()
      const body = (await res.text()) + `
window.SEED_SCENT.school = { name: "Sample High School", city: "Sampletown", state: "NY" };
window.SEED_SCENT.team = window.SEED_SCENT.team.map((m, i) => ({ ...m,
  name: "Member " + (i + 1), role: "Role " + (i + 1), bio: "One line about member " + (i + 1) + ".",
  photo: i % 2 ? "images/product-studio-1.jpg" : m.photo }));`
      await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
    const page = await ctx.newPage()
    const log = { errors: [], pageErrors: [] }
    page.on('console', m => { if (m.type() === 'error') log.errors.push({ text: m.text(), url: m.location().url || '' }) })
    page.on('pageerror', e => log.pageErrors.push(e.message))
    await page.goto(`${BASE}/team.html?bust=${Date.now() + 1}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__team && window.__team.photos().shown === 3, null, { timeout: 8000 }).catch(() => {})
    const f = await page.evaluate(() => ({
      chips: window.__team.chips(),
      photos: window.__team.photos(),
      names: [...document.querySelectorAll('.team-card .card-title')].map(e => e.textContent.trim()),
      roles: [...document.querySelectorAll('.team-role')].map(e => e.textContent.trim()),
      bios: [...document.querySelectorAll('.team-bio')].map(e => e.textContent.trim()),
      alts: [...document.querySelectorAll('.team-card img.slot:not([hidden])')].map(i => i.alt),
      hero: document.querySelector('.team-hero .annotation').textContent.trim(),
      footer: document.querySelectorAll('.footer p')[1].textContent.trim(),
      noteHidden: document.getElementById('team-note').hidden,
    }))
    console.log('[filled] numbers:', JSON.stringify(f))
    check('[filled] every chip replaced by its value', f.chips === 0 && f.names.join() === 'Member 1,Member 2,Member 3,Member 4,Member 5,Member 6' && f.roles[0] === 'Role 1' && f.bios[5] === 'One line about member 6.', `${f.chips} chips left`)
    check('[filled] photos that exist show, the rest keep the label', f.photos.shown === 3 && f.photos.labels === 3 && f.alts.join() === 'Member 2,Member 4,Member 6', JSON.stringify(f.photos))
    check('[filled] school line in header and footer', f.hero === 'Sample High School · Sampletown, NY' && f.footer === 'Sample High School · Sampletown, NY' && f.noteHidden === true, `${f.hero} | note hidden ${f.noteHidden}`)
    const unexpected = log.errors.filter(e => !/images\/team-[135]\.jpg$/.test(e.url))
    check('[filled] no unexpected console or page errors', unexpected.length === 0 && log.pageErrors.length === 0, `${unexpected.length} console, ${log.pageErrors.length} page`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks passed')
process.exit(fails ? 1 : 0)
