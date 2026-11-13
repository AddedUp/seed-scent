/* Team page check: loads team.html from the local server, asserts the cards,
   placeholders, nav (Bag link + count, phone Menu), footer, copy rules, contrast
   on the sage header, empty photo slots, console, hover tilt and rise-in, then
   saves screenshots at 1440x900 and 390x844 (menu closed and open) under
   tools/playwright/out/.
   Every browser context here is handed the blank config template (fixture.mjs),
   so the checks do not move when the real site data fills up with the firm's facts.
   Run: cd tools/playwright && node check-team.mjs */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankConfig, BLANK } from './fixture.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })

const BASE = process.env.SEED_BASE || 'http://127.0.0.1:3001'
const PAGE = `${BASE}/team.html?bust=${Date.now()}`
/* textContent of the home footer (the [ ] around chips are CSS pseudo-elements, so they are not in the text) */
const FOOTER = ['A Virtual Enterprise company', 'school · city, state', 'Smells great. Leaves eventually.']
/* the three "how we work" lines, word for word */
const HOW = [
  'Every job here is held by a student. The ordering, the making, the selling, the counting.',
  'Decisions are made together, and the best idea in the room usually wins.',
  'The team made the product. The team made this page. Same hands.',
]
const INK = 'rgb(32, 52, 25)'
const BAG_KEY = 'seedscent.bag'

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol

async function open(browser, label, ctxOpts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts })
  await blankConfig(ctx)
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
  /* the header copy rises in over about a second; measure colours and opacity once it has settled */
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.team-hero .kicker')).opacity) >= 0.9, null, { timeout: 4000 }).catch(() => {})
  return { ctx, page, log }
}

/* which optional photo files are really missing (asked from Node, so the page console stays clean).
   The photo paths are the blank template's, the same ones the page under test is given. */
async function missingPhotos(ctx) {
  const photos = [...BLANK.matchAll(/photo:\s*"([^"]+)"/g)].map(m => m[1])
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

/* photo slot boxes: h/w of every .card-media, split by whether its image shows */
const slotRatios = () => {
  const out = { shown: [], empty: [] }
  document.querySelectorAll('.team-card .card-media').forEach(m => {
    const r = m.getBoundingClientRect()
    const img = m.querySelector('img.slot')
    out[img && !img.hidden ? 'shown' : 'empty'].push(+(r.height / r.width).toFixed(3))
  })
  return out
}

async function structure(page, label, missing) {
  const d = await page.evaluate((slotRatiosSrc) => {
    const slotRatios = eval(slotRatiosSrc)
    const txt = el => (el ? el.textContent.trim().replace(/\s+/g, ' ') : null)
    const color = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null }
    const cards = [...document.querySelectorAll('.team-card')]
    const bag = document.getElementById('bag-toggle')
    const menu = document.getElementById('menu-toggle')
    return {
      title: document.title,
      activeNav: txt(document.querySelector('.nav-links a.active[aria-current="page"]')),
      navHrefs: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')),
      navLinksId: document.querySelector('nav.nav-links') && document.querySelector('nav.nav-links').id,
      orderPill: document.querySelector('.nav-actions .pill').getAttribute('href'),
      bag: bag ? { tag: bag.tagName, href: bag.getAttribute('href'), text: txt(bag), count: txt(document.getElementById('bag-count')), underline: getComputedStyle(bag).textDecorationLine } : null,
      menu: menu ? { inActions: !!menu.closest('.nav-actions'), first: menu.parentElement.firstElementChild === menu, expanded: menu.getAttribute('aria-expanded'), controls: menu.getAttribute('aria-controls'), text: txt(menu), display: getComputedStyle(menu).display } : null,
      navLinksDisplay: getComputedStyle(document.querySelector('.nav-links')).display,
      configTeam: (window.SEED_SCENT.team || []).length,
      cards: cards.length,
      ghostNums: cards.map(c => txt(c.querySelector('.ghost-num'))),
      ghostOpacity: [...new Set(cards.map(c => getComputedStyle(c.querySelector('.ghost-num')).opacity))],
      chips: window.__team.chips(),
      chipKinds: [...document.querySelectorAll('.team-card .ph')].map(e => e.textContent).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}),
      photos: window.__team.photos(),
      slots: slotRatios(),
      heroChips: [...document.querySelectorAll('.team-hero .annotation .ph')].map(e => e.textContent),
      heroHeading: txt(document.querySelector('#team-title')),
      heroKicker: txt(document.querySelector('.team-hero-top .kicker')),
      heroColors: { kicker: color('.team-hero .kicker'), kickerOpacity: getComputedStyle(document.querySelector('.team-hero .kicker')).opacity, annotation: color('.team-hero .annotation'), chip: color('.team-hero .ph'), chipBorder: getComputedStyle(document.querySelector('.team-hero .ph')).borderTopColor },
      heroLogo: (() => { const i = document.querySelector('.team-hero-logo'); return i ? { src: i.getAttribute('src'), w: Math.round(i.getBoundingClientRect().width), complete: i.complete && i.naturalWidth > 0 } : null })(),
      regMarks: document.querySelectorAll('.team-hero .reg').length,
      how: [...document.querySelectorAll('.how li')].map(li => ({ kicker: txt(li.querySelector('.kicker')), line: txt(li.querySelector('p:last-child')) })),
      footer: [...document.querySelectorAll('.footer p')].map(p => txt(p)),
      noteShown: !document.getElementById('team-note').hidden,
      emDashes: document.documentElement.outerHTML.split(String.fromCharCode(8212)).length - 1,
      enDashes: document.documentElement.outerHTML.split(String.fromCharCode(8211)).length - 1,
      bodyEmDashes: document.body.innerText.split(String.fromCharCode(8212)).length - 1,
      filePathsInText: (document.body.innerText.match(/\b(js|css|images)\/[\w.-]+|config\.js|\.js\b|\.css\b/g) || []),
      heroBg: getComputedStyle(document.querySelector('.team-hero')).backgroundColor,
      heroRadius: getComputedStyle(document.querySelector('.team-hero')).borderRadius,
      gridCols: getComputedStyle(document.getElementById('team-grid')).gridTemplateColumns.split(' ').length,
      pageHeight: document.documentElement.scrollHeight,
      hasLenis: window.__team.hasLenis,
    }
  }, slotRatios.toString())
  console.log(`[${label}] numbers:`, JSON.stringify({ cards: d.cards, chips: d.chips, chipKinds: d.chipKinds, photos: d.photos, slots: d.slots, ghostNums: d.ghostNums, ghostOpacity: d.ghostOpacity, gridCols: d.gridCols, pageHeight: d.pageHeight, heroLogo: d.heroLogo, heroColors: d.heroColors, bag: d.bag, menu: d.menu, navLinksDisplay: d.navLinksDisplay, hasLenis: d.hasLenis }))
  check(`[${label}] title`, d.title === 'Seed Scent · The team', d.title)
  check(`[${label}] Team marked active in nav`, d.activeNav === 'Team', String(d.activeNav))
  check(`[${label}] other nav links go back to index.html anchors, plus the Shop tab`, d.navHrefs.filter(h => h !== 'team.html' && h !== 'shop.html' && h !== 'planting-guide.html').every(h => /^index\.html#(drive|scents|inside|firms|contact)$/.test(h)) && d.navHrefs.includes('shop.html') && d.navHrefs.includes('planting-guide.html') && d.navHrefs.length === 8, d.navHrefs.join(' '))
  check(`[${label}] nav.nav-links has id="nav-links" for the menu button`, d.navLinksId === 'nav-links', String(d.navLinksId))
  check(`[${label}] Order pill links to index.html#firms`, d.orderPill === 'index.html#firms', d.orderPill)
  check(`[${label}] Bag is a link to the shop without an underline`, d.bag && d.bag.tag === 'A' && d.bag.href === 'shop.html' && d.bag.underline === 'none', JSON.stringify(d.bag))
  check(`[${label}] Menu button: first in .nav-actions, closed, controls nav-links`, d.menu && d.menu.inActions && d.menu.first && d.menu.expanded === 'false' && d.menu.controls === 'nav-links' && d.menu.text === 'Menu ··', JSON.stringify(d.menu))
  check(`[${label}] 6 team cards rendered from config`, d.cards === 6 && d.cards === d.configTeam, `${d.cards} cards, config has ${d.configTeam}`)
  check(`[${label}] ghost numerals 01..06 at .12 opacity`, d.ghostNums.join(',') === '01,02,03,04,05,06' && d.ghostOpacity.join() === '0.12', `${d.ghostNums.join(',')} opacity ${d.ghostOpacity.join()}`)
  check(`[${label}] name/role/bio chips for every null value`, d.chips === 18 && d.chipKinds.name === 6 && d.chipKinds.role === 6 && d.chipKinds.bio === 6, JSON.stringify(d.chipKinds))
  check(`[${label}] photo slots: label for every missing file, image only when it loads`, d.photos.labels === missing.length && d.photos.shown === 6 - missing.length, `${d.photos.shown} shown, ${d.photos.labels} labels, ${missing.length} files missing`)
  check(`[${label}] empty photo slots are a 16/7 band, shown photos 4/5 (1/1 on phones)`, d.slots.empty.every(r => near(r, 7 / 16)) && d.slots.shown.every(r => near(r, 1.25) || near(r, 1)), JSON.stringify(d.slots))
  check(`[${label}] header: sage card with radius and four + marks`, d.heroBg === 'rgb(168, 200, 143)' && d.heroRadius === '28px' && d.regMarks === 4, `${d.heroBg} ${d.heroRadius} ${d.regMarks} marks`)
  check(`[${label}] header kicker, heading, school chips, logo`, d.heroKicker === 'The team' && d.heroHeading === 'The people behind the paper.' && d.heroChips.join(',') === 'school,city,state' && d.heroLogo && d.heroLogo.complete && d.heroLogo.w > 80, `${d.heroKicker} | ${d.heroHeading} | ${d.heroChips.join(',')} | logo ${d.heroLogo && d.heroLogo.w}px`)
  check(`[${label}] header text is ink on sage: kicker, annotation, chip text and border`, d.heroColors.kicker === INK && d.heroColors.annotation === INK && d.heroColors.chip === INK && d.heroColors.chipBorder === INK && Number(d.heroColors.kickerOpacity) >= 0.9, JSON.stringify(d.heroColors))
  check(`[${label}] how we work: three fragments, the agreed lines`, d.how.length === 3 && d.how.map(h => h.line).join('|') === HOW.join('|'), JSON.stringify(d.how.map(h => h.line)))
  check(`[${label}] footer identical to home`, JSON.stringify(d.footer) === JSON.stringify(FOOTER), JSON.stringify(d.footer))
  check(`[${label}] placeholder note shown while chips remain`, d.noteShown === true)
  check(`[${label}] no em or en dashes anywhere in the document`, d.emDashes === 0 && d.enDashes === 0 && d.bodyEmDashes === 0, `${d.emDashes} em, ${d.enDashes} en in markup`)
  check(`[${label}] no file paths or config names in the visible text`, d.filePathsInText.length === 0, d.filePathsInText.join(' '))
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

/* phone menu: open, focus, Escape, close; screenshot while open */
async function menuTest(page, label) {
  const state = () => page.evaluate(() => ({
    open: window.__team.menuOpen(),
    expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'),
    linksDisplay: getComputedStyle(document.querySelector('.nav-links')).display,
    linksVisible: (() => { const r = document.querySelector('.nav-links').getBoundingClientRect(); return r.width > 0 && r.height > 0 })(),
    linksBg: getComputedStyle(document.querySelector('.nav-links')).backgroundColor,
    linkColor: getComputedStyle(document.querySelector('.nav-links a')).color,
    btnDisplay: getComputedStyle(document.getElementById('menu-toggle')).display,
    focus: (() => { const ae = document.activeElement; return !ae || ae === document.body ? 'body' : (ae.id || ae.textContent.trim()) })(),
    firstLink: document.querySelector('.nav-links a').textContent.trim(),
  }))
  const s0 = await state()
  check(`[${label}] menu closed on load: button shown, links hidden`, !s0.open && s0.expanded === 'false' && s0.btnDisplay !== 'none' && s0.linksDisplay === 'none', JSON.stringify(s0))
  await page.click('#menu-toggle')
  await page.waitForTimeout(150)
  const s1 = await state()
  console.log(`[${label}] menu open:`, JSON.stringify(s1))
  check(`[${label}] click opens: .menu-open on #nav, aria-expanded true, links visible`, s1.open && s1.expanded === 'true' && s1.linksDisplay === 'grid' && s1.linksVisible, JSON.stringify({ open: s1.open, expanded: s1.expanded, display: s1.linksDisplay, visible: s1.linksVisible }))
  check(`[${label}] open menu moves focus to the first link`, s1.focus === s1.firstLink, `focus on "${s1.focus}"`)
  check(`[${label}] open menu is a paper panel with ink links`, s1.linksBg === 'rgb(251, 246, 229)' && s1.linkColor === INK, `${s1.linksBg} ${s1.linkColor}`)
  await shoot(page, label, 'team-390-menu.png', false)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const s2 = await state()
  check(`[${label}] Escape closes the menu and returns focus to the button`, !s2.open && s2.expanded === 'false' && s2.linksDisplay === 'none' && s2.focus === 'menu-toggle', JSON.stringify({ open: s2.open, expanded: s2.expanded, focus: s2.focus }))
  await page.click('#menu-toggle')
  await page.waitForTimeout(100)
  const s3 = await state()
  await page.click('#menu-toggle')
  await page.waitForTimeout(100)
  const s4 = await state()
  check(`[${label}] button toggles: open again, then closed`, s3.open && !s4.open && s4.expanded === 'false', `${s3.open} -> ${s4.open}`)
}

async function shoot(page, label, file, fullPage) {
  const p = path.join(OUT, file)
  await page.screenshot({ path: p, fullPage })
  const { size } = fs.statSync(p)
  console.log(`[${label}] screenshot ${p} (${Math.round(size / 1024)} KB)`)
}

/* a page in this context with a quiet console; returns the log */
function watch(page) {
  const log = { errors: [], pageErrors: [] }
  page.on('console', m => { if (m.type() === 'error') log.errors.push({ text: m.text(), url: m.location().url || '' }) })
  page.on('pageerror', e => log.pageErrors.push(e.message))
  return log
}
const notPhoto404 = e => !/images\/team-\d\.jpg$/.test(e.url)

const browser = await chromium.launch()
try {
  /* desktop */
  {
    const { ctx, page, log } = await open(browser, 'desktop', { viewport: { width: 1440, height: 900 } })
    const { missing } = await missingPhotos(ctx)
    console.log(`[desktop] team photo files missing on disk: ${missing.length} (${missing.join(', ')})`)
    const d = await structure(page, 'desktop', missing)
    check('[desktop] menu button hidden, nav links shown', d.menu.display === 'none' && d.navLinksDisplay === 'flex', `${d.menu.display} / ${d.navLinksDisplay}`)
    check('[desktop] bag count reads 0 with nothing saved', d.bag.count === '0', d.bag.count)
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
    await menuTest(page, 'phone')
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
  /* bag count: the saved bag from the home page shows its unit total here and follows changes from another tab */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await blankConfig(ctx)
    const seed = [{ scentIndex: 0, format: 'mirror', qty: 2 }, { scentIndex: 1, format: 'vent', qty: 3 }]
    await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [BAG_KEY, JSON.stringify(seed)])
    const page = await ctx.newPage()
    const log = watch(page)
    await page.goto(`${BASE}/team.html?bust=${Date.now() + 2}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__team && typeof window.__team.bagUnits === 'function', null, { timeout: 8000 }).catch(() => {})
    const count = () => page.evaluate(() => document.getElementById('bag-count').textContent)
    const c0 = await count()
    check('[bag] count on load is the unit total of the saved bag (2 + 3)', c0 === '5', c0)
    /* a second tab on the same origin changes the bag: the storage event updates this one */
    const other = await ctx.newPage()
    await other.goto(`${BASE}/team.html?bust=${Date.now() + 3}`, { waitUntil: 'domcontentloaded' })
    const setBag = v => other.evaluate(([k, val]) => localStorage.setItem(k, val), [BAG_KEY, v])
    await setBag(JSON.stringify([{ scentIndex: 2, format: 'mirror', qty: 7 }]))
    let ok = true
    try { await page.waitForFunction(() => document.getElementById('bag-count').textContent === '7', null, { timeout: 3000 }) } catch { ok = false }
    check('[bag] storage event from another tab updates the count to 7', ok, await count())
    await setBag(JSON.stringify([{ qty: '3' }, { qty: 2.9 }, { qty: -4 }, { qty: 'abc' }, null, 'x']))
    ok = true
    try { await page.waitForFunction(() => document.getElementById('bag-count').textContent === '5', null, { timeout: 3000 }) } catch { ok = false }
    check('[bag] odd lines: "3" + floor(2.9) count, negatives, text and junk do not (5)', ok, await count())
    await setBag('not json at all')
    ok = true
    try { await page.waitForFunction(() => document.getElementById('bag-count').textContent === '0', null, { timeout: 3000 }) } catch { ok = false }
    check('[bag] unreadable storage falls back to 0 without throwing', ok && log.pageErrors.length === 0, `${await count()}, ${log.pageErrors.length} page errors`)
    await other.evaluate(k => localStorage.removeItem(k), BAG_KEY)
    ok = true
    try { await page.waitForFunction(() => document.getElementById('bag-count').textContent === '0', null, { timeout: 3000 }) } catch { ok = false }
    check('[bag] emptied bag reads 0', ok, await count())
    const unexpected = log.errors.filter(notPhoto404)
    check('[bag] no unexpected console or page errors', unexpected.length === 0 && log.pageErrors.length === 0, `${unexpected.length} console, ${log.pageErrors.length} page`)
    await ctx.close()
  }
  /* filled config: test-only values appended to the blank template, so the chips should go away */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await blankConfig(ctx, `
window.SEED_SCENT.school = { name: "Sample High School", city: "Sampletown", state: "NY" };
window.SEED_SCENT.team = window.SEED_SCENT.team.map((m, i) => ({ ...m,
  name: "Member " + (i + 1), role: "Role " + (i + 1), bio: "One line about member " + (i + 1) + ".",
  photo: i % 2 ? "images/product-studio-1.jpg" : m.photo }));`)
    const page = await ctx.newPage()
    const log = watch(page)
    await page.goto(`${BASE}/team.html?bust=${Date.now() + 1}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__team && window.__team.photos().shown === 3, null, { timeout: 8000 }).catch(() => {})
    const f = await page.evaluate((slotRatiosSrc) => ({
      chips: window.__team.chips(),
      photos: window.__team.photos(),
      slots: eval(slotRatiosSrc)(),
      names: [...document.querySelectorAll('.team-card .card-title')].map(e => e.textContent.trim()),
      roles: [...document.querySelectorAll('.team-role')].map(e => e.textContent.trim()),
      bios: [...document.querySelectorAll('.team-bio')].map(e => e.textContent.trim()),
      alts: [...document.querySelectorAll('.team-card img.slot:not([hidden])')].map(i => i.alt),
      hero: document.querySelector('.team-hero .annotation').textContent.trim(),
      footer: document.querySelectorAll('.footer p')[1].textContent.trim(),
      noteHidden: document.getElementById('team-note').hidden,
    }), slotRatios.toString())
    console.log('[filled] numbers:', JSON.stringify(f))
    check('[filled] every chip replaced by its value', f.chips === 0 && f.names.join() === 'Member 1,Member 2,Member 3,Member 4,Member 5,Member 6' && f.roles[0] === 'Role 1' && f.bios[5] === 'One line about member 6.', `${f.chips} chips left`)
    check('[filled] photos that exist show, the rest keep the label', f.photos.shown === 3 && f.photos.labels === 3 && f.alts.join() === 'Member 2,Member 4,Member 6', JSON.stringify(f.photos))
    check('[filled] shown photos are 4/5 portraits, empty slots stay 16/7 bands', f.slots.shown.length === 3 && f.slots.shown.every(r => near(r, 1.25)) && f.slots.empty.length === 3 && f.slots.empty.every(r => near(r, 7 / 16)), JSON.stringify(f.slots))
    check('[filled] school line in header and footer', f.hero === 'Sample High School · Sampletown, NY' && f.footer === 'Sample High School · Sampletown, NY' && f.noteHidden === true, `${f.hero} | note hidden ${f.noteHidden}`)
    await shoot(page, 'filled', 'team-1440-filled.png', false)
    const unexpected = log.errors.filter(e => !/images\/team-[135]\.jpg$/.test(e.url))
    check('[filled] no unexpected console or page errors', unexpected.length === 0 && log.pageErrors.length === 0, `${unexpected.length} console, ${log.pageErrors.length} page`)
    await ctx.close()
  }
  /* no team entries at all: a plain line, nothing technical, note hidden */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await blankConfig(ctx, 'window.SEED_SCENT.team = [];')
    const page = await ctx.newPage()
    const log = watch(page)
    await page.goto(`${BASE}/team.html?bust=${Date.now() + 4}`, { waitUntil: 'networkidle' })
    const e = await page.evaluate(() => ({
      cards: document.querySelectorAll('.team-card').length,
      empty: (document.querySelector('.team-empty') || {}).textContent,
      noteHidden: document.getElementById('team-note').hidden,
      technical: (document.body.innerText.match(/config\.js|\.js\b|<code>|\bnull\b/g) || []),
    }))
    console.log('[empty] numbers:', JSON.stringify(e))
    check('[empty] no cards, one plain line, note hidden, nothing technical', e.cards === 0 && e.empty && e.empty.trim() === 'The team is still filling this in.' && e.noteHidden === true && e.technical.length === 0, JSON.stringify(e))
    check('[empty] no console or page errors', log.errors.length === 0 && log.pageErrors.length === 0, `${log.errors.length} console, ${log.pageErrors.length} page`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks passed')
process.exit(fails ? 1 : 0)
