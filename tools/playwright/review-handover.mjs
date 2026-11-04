// Hand-over lens: serve a FILLED js/config.js through page.route (the site files are
// untouched), route two photo names to an existing file, and assert that every page
// updates with no code changes. Then serve a BROKEN config and report what breaks.
// Run:  cd tools/playwright && node review-handover.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const out = path.join(here, 'out')
mkdirSync(out, { recursive: true })
const SCRATCH = process.env.SCRATCH || out
const BASE = 'http://127.0.0.1:3001'
const bust = () => `bust=${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const GATEWAY = 'https://gateway.example.test/pay'
const MARKET = 'https://marketplace.example.test/seedscent'
const PHOTO = path.join(root, 'images/product-studio-1.jpg')

const results = []
const fmt = d => (d === undefined ? '' : '  -> ' + (typeof d === 'string' ? d : JSON.stringify(d)))
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${fmt(detail)}`) }
function note(name, detail) { results.push({ name, ok: null, detail }); console.log(`NOTE  ${name}${fmt(detail)}`) }

/* ---------------- the two configs ---------------- */
const team = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((w, i) => ({
  name: `Team Member ${w}`, role: `Role ${w}`, bio: `Bio ${w.toLowerCase()}: a one-line test biography.`, photo: `images/team-${i + 1}.jpg`,
}))
const FILLED = {
  brand: { name: 'Seed Scent', tagline: 'from scent to sprout.', descriptor: 'A plantable car air freshener' },
  contact: { email: 'orders@example.test', phone: null, instagram: 'seedscent', tiktok: null, linkedin: null },
  school: { name: 'Test High School', city: 'Testville', state: 'TS' },
  marketplaceUrl: MARKET,
  checkout: { mode: 'email', gatewayUrl: null },
  currency: 'USD',
  scents: [
    { id: 'scent-1', name: 'Scent A', notes: 'Notes for scent A.', price: 4.5, packSize: '3 discs', image: 'images/scent-1.jpg', accent: 'ink' },
    { id: 'scent-2', name: 'Scent B', notes: 'Notes for scent B.', price: 4.5, packSize: '3 discs', image: 'images/product-mirror-2.jpg', accent: 'moss' },
    { id: 'scent-3', name: 'Scent C', notes: 'Notes for scent C.', price: 4.5, packSize: '3 discs', image: 'images/product-mirror-1.jpg', accent: 'sage' },
  ],
  bulkTiers: [
    { min: 1, label: '1 to 9', price: 4.5 }, { min: 10, label: '10+', price: 4 },
    { min: 50, label: '50+', price: 3.5 }, { min: 100, label: '100+', price: 3 },
  ],
  leadTime: '5 school days',
  paymentTerms: 'Invoice via VE bank',
  product: {
    seeds: 'wildflower mix', seedsConfirmed: true, scentDuration: 'about three weeks', daysToSprout: '7 to 14 days',
    paperSource: 'recycled cotton', fixativeName: 'Test fixative',
    plantingSteps: ['Step one (test).', 'Step two (test).', 'Step three (test).', 'Step four (test).'],
    plantingConfirmed: true,
  },
  team,
}
// mistakes a student could plausibly make: prices typed as text, one price that is not a
// number at all, one scent with its fields deleted rather than set to null
const BROKEN = JSON.parse(JSON.stringify(FILLED))
BROKEN.scents[0].price = '4.50'
BROKEN.scents[1].price = 'abc'
BROKEN.scents[2] = { id: 'scent-3', image: 'images/product-mirror-1.jpg' }
BROKEN.bulkTiers = [
  { min: 1, label: '1 to 9', price: '4.50' }, { min: 10, label: '10+', price: '4' },
  { min: 50, label: '50+', price: '3.50' }, { min: 100, label: '100+', price: '3' },
]
BROKEN.team = team.slice(0, 2)

const configJs = cfg => `/* test config served by review-handover.mjs */\nwindow.SEED_SCENT = ${JSON.stringify(cfg, null, 2)};\n`
writeFileSync(path.join(SCRATCH, 'filled-config.js'), configJs(FILLED))
writeFileSync(path.join(SCRATCH, 'broken-config.js'), configJs(BROKEN))

/* ---------------- helpers ---------------- */
const BAG60 = [{ scentIndex: 0, format: 'mirror', qty: 60 }]
async function openPage(browser, { cfg, viewport = { width: 1440, height: 900 }, mobile = false, bag = null }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  const log = { errors: [], failed: [], external: [], navs: [] }
  await ctx.route(u => u.pathname.endsWith('/js/config.js'), route => route.fulfill({ contentType: 'application/javascript', body: configJs(cfg) }))
  await ctx.route(u => /\/images\/(team-1|scent-1)\.jpg$/.test(u.pathname), route => route.fulfill({ path: PHOTO, contentType: 'image/jpeg' }))
  if (bag) await ctx.addInitScript(b => { try { localStorage.setItem('seedscent.bag', JSON.stringify(b)) } catch {} }, bag)
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()) })
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message))
  page.on('requestfailed', r => log.failed.push(`${r.url().replace(BASE, '')} ${r.failure()?.errorText || ''}`))
  page.on('response', r => { if (r.status() >= 400) log.failed.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
  page.on('request', r => { try { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1') log.external.push(r.url()) } catch {} })
  // mailto: never becomes an HTTP request; CDP sees the navigation attempt
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Page.enable')
  cdp.on('Page.frameRequestedNavigation', e => log.navs.push(e.url))
  cdp.on('Page.frameScheduledNavigation', e => log.navs.push(e.url))
  return { ctx, page, log }
}
const pump = (page, n = 6) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)) }, n)
async function goto(page, file, extra = '') {
  await page.goto(`${BASE}/${file}?${bust()}${extra}`, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await pump(page)
}
const chips = page => page.evaluate(() => [...document.querySelectorAll('.ph')].map(el => {
  const sec = el.closest('section, aside, header, footer, li, dl')
  return { ph: el.dataset.ph || '(no data-ph)', text: el.textContent.trim(), in: (sec && (sec.id || sec.className)) || '' }
}))
const texts = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()))
const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null)
async function shot(page, name, full = false) { const f = path.join(out, `handover-${name}.png`); await page.screenshot({ path: f, fullPage: full }); return f.replace(root + '/', '') }
async function landIn(page, chapter, t = 0.5) {
  await page.evaluate(([c, t]) => { const ch = window.__dbg.chapters().find(x => x.name === c); window.__dbg.scrollTo(ch.start + t * (ch.end - ch.start)) }, [chapter, t])
  await page.waitForTimeout(900); await pump(page, 10)
}

const browser = await chromium.launch()

/* =====================================================================
   A · FILLED config, index.html, desktop
   ===================================================================== */
console.log('\n=== A. index.html, filled config, 1440x900 ===')
{
  const { ctx, page, log } = await openPage(browser, { cfg: FILLED })
  await goto(page, 'index.html')
  const st = await page.evaluate(() => window.__dbg.state())
  check('A0 scene ready (chips are built in boot())', st.ready, { ready: st.ready, frames: st.frames })

  const left = await chips(page)
  check('A1 no .ph chips remain on index.html', left.length === 0, left)

  const cardPrices = await texts(page, '#scent-cards .card-meta div:nth-child(2) dd')
  check('A2 card prices render as currency', cardPrices.every(p => p === '$4.50'), cardPrices)
  const cardNames = await texts(page, '#scent-cards .card-title')
  check('A2b card names from config', JSON.stringify(cardNames) === JSON.stringify(['Scent A', 'Scent B', 'Scent C']), cardNames)
  const packs = await texts(page, '#scent-cards .card-meta div:nth-child(1) dd')
  check('A2c pack sizes', packs.every(p => p === '3 discs'), packs)

  const pendant = await texts(page, '#labels .chip')
  check('A3 pendant chips show name and currency', JSON.stringify(pendant) === JSON.stringify(['01 · Scent A · $4.50', '02 · Scent B · $4.50', '03 · Scent C · $4.50']), pendant)

  const tierPrices = await texts(page, '#tiers .tier-price')
  check('A4 tier list prices as currency', JSON.stringify(tierPrices) === JSON.stringify(['$4.50 each', '$4.00 each', '$3.50 each', '$3.00 each']), tierPrices)
  const note24 = await text(page, '#tier-note')
  check('A4b tier note at slider default 24', note24 === '$4.00 each at 24 units', note24)
  await page.$eval('#qty-range', el => { el.value = '60'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
  await page.waitForTimeout(500)
  const note60 = await text(page, '#tier-note')
  const tier60 = await page.evaluate(() => window.__sections.tier(60))
  check('A4c slider at 60 -> 50+ tier at $3.50', note60 === '$3.50 each at 60 units' && tier60 && tier60.price === 3.5, { note60, tier60 })
  const activeTier = await text(page, '#tiers .tier.active .tier-qty')
  check('A4d active tier row is 50+', activeTier === '50+', activeTier)

  const tbc = await page.evaluate(() => ({
    seeds: document.querySelector('[data-tbc="product.seedsConfirmed"]').hidden,
    planting: document.querySelector('[data-tbc="product.plantingConfirmed"]').hidden,
    stillVisible: [...document.querySelectorAll('.tbc:not([hidden])')].map(t => {
      const row = t.closest('tr, legend, figcaption, p, label')
      return { text: t.textContent.trim(), near: row ? row.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '' }
    }),
  }))
  check('A5 tbc chips bound to seedsConfirmed/plantingConfirmed hidden', tbc.seeds && tbc.planting, { seeds: tbc.seeds, planting: tbc.planting })
  check('A5b no other "tbc" tags remain visible after filling the whole config', tbc.stillVisible.length === 0, tbc.stillVisible)

  const fix = await text(page, '#spec tr:nth-child(5) td')
  check('A6 fixative name shows', fix === 'Natural, plant-based · Test fixative', fix)

  const mp = await page.$eval('#marketplace-link', a => ({ href: a.href, target: a.target, rel: a.rel, disabled: a.getAttribute('aria-disabled') }))
  check('A7 marketplace pill enabled with URL', mp.href === MARKET && mp.target === '_blank' && !mp.disabled, mp)
  const mpText = await page.evaluate(() => { const p = document.querySelector('#marketplace-link').nextElementSibling; return { text: p.textContent.trim(), overflow: p.scrollWidth > p.clientWidth, isLink: !!p.querySelector('a') } })
  note('A7b marketplace URL under the pill is plain text', mpText)

  const opts = await texts(page, '#f-scent option')
  check('A8 order-form scent options renamed', JSON.stringify(opts.slice(1)) === JSON.stringify(['Scent A', 'Scent B', 'Scent C']), opts)
  const formNote = await text(page, '.form-note')
  check('A8b form note names the contact email', formNote === 'Opens an email to orders@example.test', formNote)

  const facts = await page.evaluate(() => ({
    beat2: document.querySelector('.beat[data-beat="1"] .beat-copy').textContent.replace(/\s+/g, ' ').trim(),
    paper: document.querySelector('#spec tr:nth-child(2) td').textContent.trim(),
    lasts: document.querySelector('#spec tr:nth-child(6) td').textContent.trim(),
    after: document.querySelector('#spec tr:nth-child(7) td').textContent.replace(/\s+/g, ' ').trim(),
    sproutLine: document.querySelector('.sprout-copy .kicker.soft').textContent.replace(/\s+/g, ' ').trim(),
    about: document.querySelector('.about-meta .kicker').textContent.replace(/\s+/g, ' ').trim(),
    footer: document.querySelector('.footer p:nth-child(2)').textContent.replace(/\s+/g, ' ').trim(),
    biz: [...document.querySelectorAll('.biz-rows dd')].map(d => d.textContent.trim()),
    terms: [...document.querySelectorAll('.terms dd')].map(d => d.textContent.trim()),
    steps: [...document.querySelectorAll('#planting-steps li p')].map(p => p.textContent.trim()),
    stepsNote: document.querySelector('.steps-block .annotation').textContent.trim(),
  }))
  check('A9 scent duration in beat 02', facts.beat2.endsWith('so the scent lasts about three weeks.'), facts.beat2)
  check('A9b spec rows filled', facts.paper === 'Plantable seed paper, recycled cotton' && facts.lasts === 'about three weeks' && facts.after === 'Plant it. First sprouts in 7 to 14 days', { paper: facts.paper, lasts: facts.lasts, after: facts.after })
  check('A9c sprout chapter line reflects daysToSprout once filled', !/to be confirmed/i.test(facts.sproutLine), facts.sproutLine)
  check('A9d school/city/state in About, footer, business card', facts.about === 'Test High School · Testville, TS' && facts.footer === 'Test High School · Testville, TS' && JSON.stringify(facts.biz) === JSON.stringify(['orders@example.test', 'Test High School', 'Testville, TS', '@seedscent']), { about: facts.about, footer: facts.footer, biz: facts.biz })
  check('A9e lead time and payment terms', JSON.stringify(facts.terms) === JSON.stringify(['5 school days', 'Invoice via VE bank']), facts.terms)
  check('A9f planting steps rebuilt from config, draft note gone', facts.steps.length === 4 && facts.steps[0] === 'Step one (test).' && facts.stepsNote === '', { steps: facts.steps, stepsNote: facts.stepsNote })

  // photos: card 1 routed to scent-1.jpg, cards 2 and 3 use the shipped files
  const slots = await page.$$eval('#scent-cards figure', figs => figs.map(f => { const img = f.querySelector('img.slot'); return { hidden: img.hidden, src: img.getAttribute('src'), natural: img.naturalWidth, label: !!f.querySelector('.slot-label') } }))
  check('A10 routed scent-1.jpg replaces the [Photo] label on card 1', !slots[0].hidden && /images\/scent-1\.jpg$/.test(slots[0].src) && slots[0].natural > 0 && !slots[0].label, slots[0])
  check('A10b cards 2 and 3 show their shipped photos', slots.slice(1).every(s => !s.hidden && s.natural > 0 && !s.label), slots.slice(1))

  // the bag: 60 units of scent A
  await page.evaluate(b => window.__dbg.bagSet(b), BAG60)
  await page.waitForTimeout(200)
  const bag = await page.evaluate(() => ({
    snap: window.__dbg.bag(),
    count: document.querySelector('#bag-count').textContent, units: document.querySelector('#bag-units').textContent,
    tier: document.querySelector('#bag-tier').textContent, total: document.querySelector('#bag-total').textContent,
    line: { name: document.querySelector('#bag-lines .line-name')?.textContent.trim(), format: document.querySelector('#bag-lines .line-format')?.textContent.trim(), price: document.querySelector('#bag-lines .line-price')?.textContent.trim() },
    ph: document.querySelectorAll('#bag .ph').length,
    checkoutDisabled: document.querySelector('#bag-checkout').getAttribute('aria-disabled'),
  }))
  check('A11 bag with 60 units: tier 50+, $3.50 each, total $210.00', bag.snap.units === 60 && bag.snap.unitPrice === 3.5 && bag.snap.total === 210 && bag.total === '$210.00' && bag.tier === '50+' && bag.units === '60' && bag.count === '60', { snap: bag.snap, dom: { count: bag.count, units: bag.units, tier: bag.tier, total: bag.total } })
  check('A11b bag line shows name, per-unit and line price', bag.line.name === 'Scent A' && bag.line.format === 'Mirror cord · $3.50 each' && bag.line.price === '$210.00' && bag.ph === 0, bag.line)
  await page.evaluate(() => window.__dbg.bagOpen())
  await page.waitForTimeout(600)
  note('A11c screenshot: bag drawer', await shot(page, 'filled-bag-drawer'))
  await page.evaluate(() => window.__dbg.bagClose())

  // the order-request form: a mailto to the contact email
  await landIn(page, 'firms', 0.4)
  await page.fill('#f-firm', 'Test Firm'); await page.fill('#f-name', 'Tess Tester'); await page.fill('#f-email', 'buyer@example.test')
  await page.selectOption('#f-scent', '0'); await page.fill('#f-qty', '60')
  log.navs.length = 0
  await page.$eval('#order-form', f => f.requestSubmit())
  await page.waitForTimeout(800)
  const order = await page.evaluate(() => ({
    text: window.__sections.order(), summaryShown: !document.querySelector('#form-summary').hidden,
    note: document.querySelector('#form-summary .summary-note')?.textContent.trim(),
  }))
  const mailto = log.navs.find(u => u.startsWith('mailto:'))
  check('A12 order form summary has firm, scent, tier price', /Firm: Test Firm/.test(order.text) && /Scent: Scent A/.test(order.text) && /Bulk tier: 50\+ at \$3\.50 each/.test(order.text) && order.summaryShown, order.text.split('\n').filter(l => /Firm|Scent|Bulk/.test(l)))
  check('A12b summary note says a draft to the contact email opened', /orders@example\.test/.test(order.note || ''), order.note)
  check('A12c a mailto: navigation to orders@example.test was attempted', !!mailto && /^mailto:orders(%40|@)example\.test\?subject=/.test(mailto), mailto ? decodeURIComponent(mailto).slice(0, 160) : log.navs)
  note('A12d screenshot: order form summary', await shot(page, 'filled-order-form'))

  // screenshots for the record
  await landIn(page, 'scents', 0.55)
  note('A13 screenshot: pendants with chips', await shot(page, 'filled-pendants'))
  await landIn(page, 'cards', 0.5)
  note('A13b screenshot: scent cards', await shot(page, 'filled-cards'))
  await landIn(page, 'inside', 0.15)
  note('A13c screenshot: spec table', await shot(page, 'filled-spec'))
  await landIn(page, 'firms', 0.1)
  note('A13d screenshot: tiers', await shot(page, 'filled-tiers'))
  await landIn(page, 'finale', 0.9)
  note('A13e screenshot: business card and footer', await shot(page, 'filled-finale'))

  check('A14 no console errors on index.html', log.errors.length === 0, log.errors)
  check('A14b no external requests at load (offline promise)', log.external.filter(u => !u.startsWith('mailto:')).length === 0, log.external)
  check('A14c no failed requests on index.html', log.failed.length === 0, log.failed)
  await ctx.close()
}

/* =====================================================================
   B · FILLED config, index.html, phone
   ===================================================================== */
console.log('\n=== B. index.html, filled config, 390x844 phone ===')
{
  const { ctx, page, log } = await openPage(browser, { cfg: FILLED, viewport: { width: 390, height: 844 }, mobile: true })
  await goto(page, 'index.html')
  const left = await chips(page)
  check('B1 no .ph chips remain on the phone', left.length === 0, left)
  const pendant = await texts(page, '#labels .chip')
  note('B2 pendant chips on a phone omit the price by design (innerWidth < 760)', pendant)
  const mpOverflow = await page.evaluate(() => { const p = document.querySelector('#marketplace-link').nextElementSibling; return { text: p.textContent.trim(), scrollWidth: p.scrollWidth, clientWidth: p.clientWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth } })
  check('B3 marketplace URL text does not overflow its column on a phone', !(mpOverflow.scrollWidth > mpOverflow.clientWidth) && !mpOverflow.bodyOverflow, mpOverflow)
  await landIn(page, 'cards', 0.5)
  note('B4 screenshot: cards on phone', await shot(page, 'filled-phone-cards'))
  await landIn(page, 'firms', 0.5)
  note('B4b screenshot: firms on phone', await shot(page, 'filled-phone-firms'))
  check('B5 no console errors on the phone', log.errors.length === 0, log.errors)
  await ctx.close()
}

/* =====================================================================
   C · FILLED config, team.html
   ===================================================================== */
console.log('\n=== C. team.html, filled config ===')
{
  const { ctx, page, log } = await openPage(browser, { cfg: FILLED })
  await goto(page, 'team.html')
  const t = await page.evaluate(() => ({
    count: window.__team.count(), chips: window.__team.chips(), photos: window.__team.photos(),
    names: [...document.querySelectorAll('.team-card .card-title')].map(e => e.textContent.trim()),
    roles: [...document.querySelectorAll('.team-card .team-role')].map(e => e.textContent.trim()),
    noteHidden: document.querySelector('#team-note').hidden,
    hero: document.querySelector('.team-hero-copy .annotation').textContent.replace(/\s+/g, ' ').trim(),
    footer: document.querySelector('.footer p:nth-child(2)').textContent.replace(/\s+/g, ' ').trim(),
    card1: (() => { const img = document.querySelector('.team-card[data-index="0"] img.slot'); return { hidden: img.hidden, src: img.getAttribute('src'), alt: img.alt, natural: img.naturalWidth, label: !!document.querySelector('.team-card[data-index="0"] .slot-label') } })(),
    allPh: [...document.querySelectorAll('.ph')].map(e => e.dataset.ph || '(none)'),
  }))
  check('C1 six team cards, zero chips', t.count === 6 && t.chips === 0 && t.allPh.length === 0, { count: t.count, chips: t.chips, allPh: t.allPh })
  check('C2 names and roles from config', t.names[0] === 'Team Member One' && t.names[5] === 'Team Member Six' && t.roles[0] === 'Role One', { names: t.names, roles: t.roles })
  check('C3 "still filling in" note hidden', t.noteHidden, t.noteHidden)
  check('C4 routed team-1.jpg shows with the name as alt, label removed', !t.card1.hidden && /team-1\.jpg$/.test(t.card1.src) && t.card1.alt === 'Team Member One' && t.card1.natural > 0 && !t.card1.label, t.card1)
  check('C4b the five missing photos keep their [Photo] label', t.photos.shown === 1 && t.photos.labels === 5, t.photos)
  check('C5 school line in hero and footer', t.hero === 'Test High School · Testville, TS' && t.footer === 'Test High School · Testville, TS', { hero: t.hero, footer: t.footer })
  await page.evaluate(() => window.__team.scrollTo(document.querySelector('#team').offsetTop - 60)); await page.waitForTimeout(1500)
  note('C6 screenshot: team grid', await shot(page, 'filled-team'))
  check('C7 no console errors on team.html', log.errors.length === 0, log.errors)
  note('C7b failed requests on team.html (404s for the five photos not dropped in are expected)', log.failed)
  check('C7c no external requests on team.html', log.external.length === 0, log.external)
  await ctx.close()
}

/* =====================================================================
   D · FILLED config, checkout.html, mode email
   ===================================================================== */
console.log('\n=== D. checkout.html, filled config, mode email, 60 units in the bag ===')
{
  const { ctx, page, log } = await openPage(browser, { cfg: FILLED, bag: BAG60 })
  await goto(page, 'checkout.html')
  const co = await page.evaluate(() => ({
    units: document.querySelector('#co-units').textContent, tier: document.querySelector('#co-tier').textContent,
    each: document.querySelector('#co-each').textContent.trim(), total: document.querySelector('#co-total').textContent.trim(),
    ph: [...document.querySelectorAll('.ph')].map(e => e.textContent.trim()),
    mode: document.querySelector('#co-mode').textContent, final: document.querySelector('#co-final').textContent.replace(/\s+/g, ' ').trim(),
    action: document.querySelector('#co-form').getAttribute('action'), method: document.querySelector('#co-form').getAttribute('method'),
    line: document.querySelector('#co-lines .line-name')?.textContent.trim(),
  }))
  check('D1 checkout totals: 60 units, 50+, $3.50 each, $210.00', co.units === '60' && co.tier === '50+' && co.each === '$3.50' && co.total === '$210.00' && co.ph.length === 0, co)
  check('D2 email mode: button + note naming the contact email', /Send the order/.test(co.final) && /Opens an email to orders@example\.test/.test(co.final) && co.mode === 'email' && !co.action, { final: co.final, mode: co.mode, action: co.action })
  await page.fill('#co-firm', 'Test Firm'); await page.fill('#co-name', 'Tess Tester'); await page.fill('#co-email', 'buyer@example.test'); await page.fill('#co-account', 'VE-123')
  log.navs.length = 0
  await page.$eval('#co-form', f => f.requestSubmit())
  await page.waitForTimeout(900)
  const r = await page.evaluate(() => ({ shown: !document.querySelector('#co-result').hidden, order: document.querySelector('#co-order').textContent, note: document.querySelector('#co-result-note').textContent.trim(), err: document.querySelector('#co-error').hidden }))
  const mailto = log.navs.find(u => u.startsWith('mailto:'))
  check('D3 written-out order has firm, lines, tier and $ totals', r.shown && /Seed Scent order from Test Firm/.test(r.order) && /60 x Scent A, mirror cord/.test(r.order) && /Each: \$3\.50/.test(r.order) && /Total: \$210\.00/.test(r.order), r.order.split('\n').filter(l => /order from|x Scent|Each|Total/.test(l)))
  check('D3b note says the email app opened, addressed to the contact email', /orders@example\.test/.test(r.note), r.note)
  check('D3c a mailto: navigation to orders@example.test was attempted', !!mailto && /^mailto:orders@example\.test\?subject=Seed%20Scent%20order%20from%20Test%20Firm/.test(mailto), mailto ? decodeURIComponent(mailto).slice(0, 200) : log.navs)
  note('D4 screenshot: checkout email mode', await shot(page, 'filled-checkout-email', true))
  check('D5 no console errors on checkout.html', log.errors.length === 0, log.errors)
  check('D5b no external requests on checkout.html', log.external.filter(u => !u.startsWith('mailto:')).length === 0, log.external)
  await ctx.close()
}

/* =====================================================================
   E · FILLED config, checkout.html, mode gateway
   ===================================================================== */
console.log('\n=== E. checkout.html, mode gateway, gatewayUrl set ===')
{
  const cfg = JSON.parse(JSON.stringify(FILLED)); cfg.checkout = { mode: 'gateway', gatewayUrl: GATEWAY }
  const { ctx, page, log } = await openPage(browser, { cfg, bag: BAG60 })
  let posted = null
  await ctx.route(u => u.hostname === 'gateway.example.test', route => {
    const r = route.request(); posted = { method: r.method(), url: r.url(), contentType: r.headers()['content-type'], body: r.postData() }
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>gateway stub</p>' })
  })
  await goto(page, 'checkout.html')
  const co = await page.evaluate(() => ({
    action: document.querySelector('#co-form').action, method: document.querySelector('#co-form').method, mode: document.querySelector('#co-mode').textContent,
    final: document.querySelector('#co-final').textContent.replace(/\s+/g, ' ').trim(), hasSubmit: !!document.querySelector('#co-final button[type=submit]'),
  }))
  check('E1 form points at the gateway with method post', co.action === GATEWAY && co.method === 'post' && co.hasSubmit, co)
  check('E1b note names the gateway host', /Posts the order to gateway\.example\.test/.test(co.final), co.final)
  await page.fill('#co-firm', 'Test Firm'); await page.fill('#co-name', 'Tess Tester'); await page.fill('#co-email', 'buyer@example.test')
  const [req] = await Promise.all([
    page.waitForRequest(r => r.url().startsWith('https://gateway.example.test/'), { timeout: 8000 }).catch(() => null),
    page.$eval('#co-form', f => f.requestSubmit()),
  ])
  await page.waitForTimeout(500)
  const params = posted && posted.body ? Object.fromEntries(new URLSearchParams(posted.body)) : null
  check('E2 submit POSTs to the gateway URL', !!req && posted && posted.method === 'POST', posted && { method: posted.method, url: posted.url, contentType: posted.contentType })
  check('E2b posted fields carry the order', params && params.units === '60' && params.tier === '50+' && params.unit_price === '3.5' && params.total === '210' && params.firm === 'Test Firm' && params.line_1_scent === 'Scent A' && params.line_1_qty === '60' && params.currency === 'USD' && /Total: \$210\.00/.test(params.order_text || ''), params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.length > 60 ? v.slice(0, 60) + '…' : v])))
  const ext = log.external.filter(u => !u.startsWith('https://gateway.example.test/'))
  check('E3 no external requests other than the gateway post', ext.length === 0, ext)
  check('E4 no console errors in gateway mode', log.errors.length === 0, log.errors)
  await ctx.close()
}

/* =====================================================================
   F · FILLED config, checkout.html, mode marketplace, and an invalid mode
   ===================================================================== */
console.log('\n=== F. checkout.html, mode marketplace / mode typo ===')
{
  const cfg = JSON.parse(JSON.stringify(FILLED)); cfg.checkout = { mode: 'marketplace', gatewayUrl: null }
  const { ctx, page, log } = await openPage(browser, { cfg, bag: BAG60 })
  await goto(page, 'checkout.html')
  const go = await page.$eval('#co-go', a => ({ href: a.href, target: a.target })).catch(() => null)
  check('F1 marketplace mode: pill links to marketplaceUrl in a new tab', go && go.href === MARKET && go.target === '_blank', go)
  await ctx.close()

  const cfg2 = JSON.parse(JSON.stringify(FILLED)); cfg2.checkout = { mode: 'paypal', gatewayUrl: null }   // a value the README does not list
  const o2 = await openPage(browser, { cfg: cfg2, bag: BAG60 })
  await goto(o2.page, 'checkout.html')
  const before = await o2.page.evaluate(() => document.querySelector('#co-final').textContent.replace(/\s+/g, ' ').trim())
  await o2.page.fill('#co-firm', 'Test Firm'); await o2.page.fill('#co-name', 'Tess Tester'); await o2.page.fill('#co-email', 'buyer@example.test')
  o2.log.navs.length = 0
  await o2.page.$eval('#co-form', f => f.requestSubmit()); await o2.page.waitForTimeout(700)
  const after = await o2.page.evaluate(() => document.querySelector('#co-result-note').textContent.trim())
  const mailto2 = o2.log.navs.find(u => u.startsWith('mailto:'))
  check('F2 unknown checkout.mode: the page is consistent about what it will do', /email/i.test(before) === !!mailto2 && !/gateway/i.test(after), { buttonNoteBefore: before, resultNoteAfter: after, mailtoAttempted: !!mailto2 })
  await o2.ctx.close()
}

/* =====================================================================
   G · BROKEN config: string prices, a non-numeric price, a scent with fields missing
   ===================================================================== */
console.log('\n=== G. index.html + checkout.html with the BROKEN config ===')
{
  const { ctx, page, log } = await openPage(browser, { cfg: BROKEN })
  await goto(page, 'index.html')
  const g = await page.evaluate(() => ({
    cardPrices: [...document.querySelectorAll('#scent-cards .card-meta div:nth-child(2) dd')].map(d => ({ html: d.innerHTML.trim(), text: d.textContent.trim() })),
    cardNames: [...document.querySelectorAll('#scent-cards .card-title')].map(e => e.textContent.trim()),
    pendant: [...document.querySelectorAll('#labels .chip')].map(c => c.textContent),
    tierPrices: [...document.querySelectorAll('#tiers .tier-price')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    tierNote: document.querySelector('#tier-note').textContent.trim(),
    tier60: window.__sections.tier(60),
    ph: [...document.querySelectorAll('.ph')].map(e => ({ ph: e.dataset.ph || '(none)', text: e.textContent.trim() })),
    options: [...document.querySelectorAll('#f-scent option')].map(o => o.textContent),
  }))
  note('G1 card price cells', g.cardPrices)
  check('G1a string price "4.50" on scent A still renders as $4.50 in the card', g.cardPrices[0].text === '$4.50', g.cardPrices[0])
  check('G1b non-numeric price "abc" on scent B keeps a visible chip (not a blank cell)', g.cardPrices[1].text !== '' , g.cardPrices[1])
  check('G1c scent C with deleted fields keeps its chips', g.ph.some(p => p.ph === 'scents.2.name') && g.ph.some(p => p.ph === 'scents.2.price'), g.ph.filter(p => /scents\.2/.test(p.ph)))
  note('G2 pendant chips', g.pendant)
  check('G2a pendant chip for scent B does not print the word "null"', !g.pendant.some(t => /null|undefined|NaN/.test(t)), g.pendant)
  note('G3 tier list prices', g.tierPrices)
  check('G3a tier chips and the slider note agree about string prices', g.tierNote !== 'Tier pricing is being finalized.' && g.tier60 && g.tier60.price != null, { tierPrices: g.tierPrices, tierNote: g.tierNote, tier60: g.tier60 })

  await page.evaluate(b => window.__dbg.bagSet(b), BAG60); await page.waitForTimeout(200)
  const bag = await page.evaluate(() => ({ snap: window.__dbg.bag(), total: document.querySelector('#bag-total').textContent.trim(), tier: document.querySelector('#bag-tier').textContent }))
  note('G4 the bag with string tier prices', bag)
  await landIn(page, 'firms', 0.4)
  await page.fill('#f-firm', 'Test Firm'); await page.fill('#f-name', 'Tess Tester'); await page.fill('#f-email', 'buyer@example.test'); await page.selectOption('#f-scent', '0'); await page.fill('#f-qty', '60')
  await page.$eval('#order-form', f => f.requestSubmit()); await page.waitForTimeout(600)
  const orderText = await page.evaluate(() => window.__sections.order())
  const tierLine = orderText.split('\n').find(l => /Bulk tier/.test(l))
  check('G5 order-request email and the bag agree on the 50+ price', /\$3\.50/.test(tierLine || '') && bag.snap.total === 210, { emailTierLine: tierLine, bagTotal: bag.total })
  await landIn(page, 'cards', 0.5)
  note('G6 screenshot: cards with the broken config', await shot(page, 'broken-cards'))
  await landIn(page, 'scents', 0.55)
  note('G6b screenshot: pendant chips with the broken config', await shot(page, 'broken-pendants'))
  await landIn(page, 'firms', 0.1)
  note('G6c screenshot: tiers with the broken config', await shot(page, 'broken-tiers'))
  check('G7 no console errors with the broken config', log.errors.length === 0, log.errors)
  await ctx.close()

  const o = await openPage(browser, { cfg: BROKEN, bag: [{ scentIndex: 2, format: 'vent', qty: 60 }] })
  await goto(o.page, 'checkout.html')
  const co = await o.page.evaluate(() => ({
    each: document.querySelector('#co-each').textContent.trim(), total: document.querySelector('#co-total').textContent.trim(),
    lineName: document.querySelector('#co-lines .line-name')?.innerHTML.trim(), ph: document.querySelectorAll('.ph').length,
  }))
  note('G8 checkout with string tier prices and the field-less scent in the bag', co)
  await o.page.fill('#co-firm', 'Test Firm'); await o.page.fill('#co-name', 'Tess Tester'); await o.page.fill('#co-email', 'buyer@example.test')
  await o.page.$eval('#co-form', f => f.requestSubmit()); await o.page.waitForTimeout(600)
  const txt = await o.page.evaluate(() => document.querySelector('#co-order').textContent)
  note('G8b written-out order lines', txt.split('\n').filter(l => /x Scent|Each|Total/.test(l)))
  check('G9 no console errors on checkout with the broken config', o.log.errors.length === 0, o.log.errors)
  await o.ctx.close()
}

/* =====================================================================
   H · Baseline, untouched config: which visible text is NOT reachable from config
   ===================================================================== */
console.log('\n=== H. shipped config (no route): chips and tbc inventory ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/index.html?${bust()}`, { waitUntil: 'load' }); await page.waitForTimeout(2200)
  const h = await page.evaluate(() => ({
    phPaths: [...new Set([...document.querySelectorAll('[data-ph]')].map(e => e.dataset.ph))],
    phNoPath: [...document.querySelectorAll('.ph:not([data-ph])')].map(e => e.textContent.trim()),
    tbcBound: [...document.querySelectorAll('[data-tbc]')].map(e => e.dataset.tbc),
    tbcStatic: [...document.querySelectorAll('.tbc:not([data-tbc])')].map(e => e.textContent.trim()),
  }))
  note('H1 distinct data-ph paths in index.html', h.phPaths)
  note('H2 .ph chips without a config path (rendered by JS)', h.phNoPath)
  note('H3 tbc tags bound to a config flag', h.tbcBound)
  note('H4 tbc tags with no config flag (need an HTML edit to clear)', h.tbcStatic)
  await ctx.close()
}

await browser.close()

const fails = results.filter(r => r.ok === false)
console.log(`\n${results.filter(r => r.ok === true).length} passed, ${fails.length} failed, ${results.filter(r => r.ok === null).length} notes`)
writeFileSync(path.join(out, 'handover-results.json'), JSON.stringify(results, null, 2))
console.log(`results: ${path.join(out, 'handover-results.json')}`)
