/* Shop page check: loads shop.html from the local server and asserts the cards built from the
   "shop" list, the per-card quantity, Add to bag with real clicks, the shared bag (drawer here,
   the home page and checkout.html), pricing with bulk tiers, a product of its own added to the
   list later, bad list lines, the empty list, nav and links on every page, phone layout and
   touch sizes, reduced motion, copy rules, the console and outside requests. Screenshots go to
   tools/playwright/out/.
   Every context is handed the blank config template (fixture.mjs), plus test-only values.
   Run: cd tools/playwright && node check-shop.mjs        (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankConfig } from './fixture.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = (process.env.SITE_BASE || 'http://127.0.0.1:3001/').replace(/\/?$/, '/')
const HOST = new URL(BASE).host
const url = p => `${BASE}${p}${p.includes('?') ? '&' : '?'}bust=${Date.now()}`

let fails = 0, passes = 0
function check(name, ok, detail = '') {
  if (ok) passes++; else fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PRICES = `window.SEED_SCENT.bulkTiers[0].price = 4; window.SEED_SCENT.bulkTiers[1].price = 3.5; window.SEED_SCENT.bulkTiers[2].price = 3; window.SEED_SCENT.bulkTiers[3].price = 2.5;`
const EXTRA = `window.SEED_SCENT.shop.push({ id: "test-refills", name: "Test refill pack", notes: "Test notes", packSize: "Test pack", price: 5, image: "images/product-vent-clip.jpg" });`

async function open(browser, label, file, ctxOpts = {}, append = '', ctx = null) {
  ctx = ctx || await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 }, ...ctxOpts })
  await blankConfig(ctx, append)
  const page = await ctx.newPage()
  const log = { errors: [], pageErrors: [], external: [] }
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()) })
  page.on('pageerror', e => log.pageErrors.push(e.message))
  page.on('request', r => { const h = new URL(r.url()).host; if (/^https?:/.test(r.url()) && h !== HOST) log.external.push(r.url()) })
  await page.goto(url(file), { waitUntil: 'load' })
  if (file.startsWith('shop')) {
    try { await page.waitForFunction(() => window.__shop && window.__shop.ready && window.__dbg && window.__dbg.bag, null, { timeout: 10000 }) }
    catch { check(`[${label}] shop.js and cart.js booted`, false, log.pageErrors.join(' | ') || 'timeout') }
  }
  return { ctx, page, log }
}
function quiet(label, log) {
  check(`[${label}] no console errors or page errors`, !log.errors.length && !log.pageErrors.length, [...log.errors, ...log.pageErrors].join(' | ').slice(0, 300))
  check(`[${label}] nothing fetched from another host`, !log.external.length, log.external.join(' '))
}
const bag = page => page.evaluate(() => window.__dbg.bag())
const card = (page, id) => page.locator(`[data-item-card="${id}"]`)

const browser = await chromium.launch()
try {
  /* ---------- desktop: structure ---------- */
  {
    const { ctx, page, log } = await open(browser, 'desktop', 'shop.html')
    const d = await page.evaluate(() => {
      const txt = el => (el ? el.textContent.trim().replace(/\s+/g, ' ') : null)
      const r = s => document.querySelector(s).getBoundingClientRect()
      const cards = [...document.querySelectorAll('.shop-card')]
      return {
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]').getAttribute('href'),
        active: txt(document.querySelector('.nav-links a[aria-current="page"]')),
        navHrefs: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')),
        navGap: r('.nav-actions').left - r('.nav-links').right,
        ids: cards.map(c => c.dataset.itemCard),
        names: cards.map(c => txt(c.querySelector('.card-title'))),
        formats: cards.map(c => txt(c.querySelector('.shop-format'))),
        tags: cards.map(c => txt(c.querySelector('.media-tag'))),
        imgs: cards.map(c => { const i = c.querySelector('img.slot'); return i && !i.hidden ? i.getAttribute('src') : null }),
        alts: cards.map(c => c.querySelector('img.slot').alt),
        ghosts: cards.map(c => txt(c.querySelector('.ghost-num'))),
        chips: window.__shop.chips(),
        count: txt(document.getElementById('shop-count')),
        noteShown: !document.getElementById('shop-note').hidden,
        gridCols: getComputedStyle(document.getElementById('shop-grid')).gridTemplateColumns.split(' ').length,
        buttons: cards.map(c => { const b = c.querySelector('.add-to-bag'); return { text: txt(b), describedBy: b.getAttribute('aria-describedby') } }),
        describedOk: cards.every(c => (c.querySelector('.add-to-bag').getAttribute('aria-describedby') || '').split(' ').every(id => document.getElementById(id))),
        dashes: document.body.innerText.split('').filter(ch => ch === String.fromCharCode(8212) || ch === String.fromCharCode(8211)).length,
        htmlDashes: document.documentElement.outerHTML.split('').filter(ch => ch === String.fromCharCode(8212) || ch === String.fromCharCode(8211)).length,
        paths: document.body.innerText.match(/\b(js|css|images)\/[\w.-]+|config\.js/g) || [],
        bagCount: txt(document.getElementById('bag-count')),
        navBacking: getComputedStyle(document.querySelector('.nav'), '::before').opacity,
      }
    })
    console.log('[desktop] numbers:', JSON.stringify({ ids: d.ids, names: d.names, imgs: d.imgs, chips: d.chips, gridCols: d.gridCols, navGap: d.navGap }))
    check('[desktop] title and canonical', d.title === 'Seed Scent · Shop' && d.canonical === 'https://seedscent.com/shop.html', `${d.title} ${d.canonical}`)
    check('[desktop] Shop is the active tab, 7 tabs', d.active === 'Shop' && d.navHrefs.length === 7 && d.navHrefs[4] === 'shop.html', d.navHrefs.join(' '))
    check('[desktop] the nav fits on one line with room to spare', d.navGap >= 30, `${Math.round(d.navGap)}px between links and buttons`)
    check('[desktop] six cards, in the order of the shop list', d.ids.join() === 'scent-1-mirror,scent-1-vent,scent-2-mirror,scent-2-vent,scent-3-mirror,scent-3-vent', d.ids.join())
    check('[desktop] the name chip says which scent, so the pairs read as pairs', d.names.join('|') === 'scent one|scent one|scent two|scent two|scent three|scent three', d.names.join('|'))
    check('[desktop] each card says its format, with the tbc tag, and the photo tag agrees', d.formats.every((f, i) => f === `${i % 2 ? 'Vent clip' : 'Mirror cord'} tbc`) && d.tags.every((t, i) => t === (i % 2 ? 'Vent clip' : 'Mirror cord')), `${d.formats.join('|')} / ${d.tags.join('|')}`)
    check('[desktop] each card shows the photo for its format', d.imgs.join() === ['images/product-studio-1.jpg', 'images/product-vent-clip.jpg', 'images/product-mirror-2.jpg', 'images/product-vent-clip.jpg', 'images/product-mirror-1.jpg', 'images/product-vent-clip.jpg'].join(), d.imgs.join())
    check('[desktop] photos have alt text naming scent and format', d.alts[0] === 'Scent one, mirror cord version' && d.alts[5] === 'Scent three, vent clip version', `${d.alts[0]} / ${d.alts[5]}`)
    check('[desktop] ghost numerals 01..06', d.ghosts.join() === '01,02,03,04,05,06', d.ghosts.join())
    check('[desktop] chips for name, notes, pack and price on every card, and the note under the grid', d.chips === 24 && d.noteShown, `${d.chips} chips, note ${d.noteShown}`)
    check('[desktop] three columns', d.gridCols === 3, String(d.gridCols))
    check('[desktop] count line', d.count === '6 to choose from.', String(d.count))
    check('[desktop] Add to bag buttons are told apart for screen readers', d.describedOk && d.buttons.every(b => b.text === 'Add to bag ·'), JSON.stringify(d.buttons[0]))
    check('[desktop] no em or en dashes in the page', d.dashes === 0 && d.htmlDashes === 0, `${d.dashes} in text, ${d.htmlDashes} in html`)
    check('[desktop] no file paths in the visible text', !d.paths.length, d.paths.join(' '))
    check('[desktop] nav has its paper backing', d.navBacking === '1', d.navBacking)
    check('[desktop] bag starts empty', d.bagCount === '0', d.bagCount)

    /* ---------- quantity stepper on a card ---------- */
    const vent1 = card(page, 'scent-1-vent')
    const qty = vent1.locator('.qty-num'), dec = vent1.locator('[data-step="-1"]'), inc = vent1.locator('[data-step="1"]')
    check('[desktop] minus is off at 1', await dec.isDisabled())
    await inc.click(); await inc.click()
    check('[desktop] plus twice makes 3, minus switches on', (await qty.inputValue()) === '3' && !(await dec.isDisabled()), await qty.inputValue())
    await qty.fill('0'); await qty.press('Tab')
    check('[desktop] 0 typed in becomes 1', (await qty.inputValue()) === '1', await qty.inputValue())
    await qty.fill('abc').catch(() => {}); await qty.press('Tab')
    check('[desktop] junk typed in becomes 1', (await qty.inputValue()) === '1', await qty.inputValue())
    await qty.fill('99999'); await qty.press('Tab')
    check('[desktop] a huge number is capped at 9999', (await qty.inputValue()) === '9999' && (await inc.isDisabled()), await qty.inputValue())
    await qty.fill('3'); await qty.press('Tab')

    /* ---------- Add to bag with real clicks ---------- */
    await vent1.locator('.add-to-bag').click()
    let b = await bag(page)
    check('[desktop] Add to bag puts in the card quantity, as a scent line', JSON.stringify(b.lines) === JSON.stringify([{ scentIndex: 0, format: 'vent', qty: 3 }]), JSON.stringify(b.lines))
    check('[desktop] the button says Added for a moment', (await vent1.locator('.add-to-bag').textContent()).trim() === 'Added ·')
    check('[desktop] the bag count follows', (await page.locator('#bag-count').textContent()) === '3')
    await card(page, 'scent-1-mirror').locator('.add-to-bag').click()
    await vent1.locator('.add-to-bag').click()
    b = await bag(page)
    check('[desktop] adding the same item again merges the line', JSON.stringify(b.lines) === JSON.stringify([{ scentIndex: 0, format: 'vent', qty: 6 }, { scentIndex: 0, format: 'mirror', qty: 1 }]), JSON.stringify(b.lines))
    const s3 = card(page, 'scent-3-mirror')
    await s3.locator('.qty-num').fill('2'); await s3.locator('.qty-num').press('Enter')
    b = await bag(page)
    check('[desktop] Enter in a quantity field adds that many', b.units === 9 && b.lines.some(l => l.scentIndex === 2 && l.format === 'mirror' && l.qty === 2), JSON.stringify(b.lines))
    await sleep(200)
    const live = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map(e => e.textContent).join('|'))
    check('[desktop] screen readers hear what went in', /Added 2 to the bag\. 9 units in all\./.test(live), live)

    /* ---------- the drawer on this page ---------- */
    await page.locator('#bag-toggle').click(); await sleep(800)
    let dr = await page.evaluate(() => ({ open: document.getElementById('bag').classList.contains('open'), lines: document.querySelectorAll('#bag-lines .bag-line').length, units: document.getElementById('bag-units').textContent, focus: document.activeElement.id }))
    check('[desktop] the Bag button opens the drawer with the lines', dr.open && dr.lines === 3 && dr.units === '9' && dr.focus === 'bag-close', JSON.stringify(dr))
    await page.keyboard.press('Escape'); await sleep(500)
    dr = await page.evaluate(() => ({ open: document.getElementById('bag').classList.contains('open'), focus: document.activeElement.id }))
    check('[desktop] Escape closes it and returns focus', !dr.open && dr.focus === 'bag-toggle', JSON.stringify(dr))
    await page.locator('#open-bag').click(); await sleep(600)
    check('[desktop] the Open the bag button opens it too', await page.evaluate(() => document.getElementById('bag').classList.contains('open')))
    await page.locator('#bag-close').click(); await sleep(500)
    await page.mouse.move(700, 300)
    await page.screenshot({ path: path.join(OUT, 'shop-1440.png'), fullPage: true })
    await page.screenshot({ path: path.join(OUT, 'shop-1440-fold.png') })
    quiet('desktop', log)

    /* ---------- the same bag on the home page and the checkout ---------- */
    const home = await ctx.newPage()
    const homeLog = { errors: [] }
    home.on('pageerror', e => homeLog.errors.push(e.message))
    await home.goto(url('index.html'), { waitUntil: 'load' })
    await home.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 15000 })
    const hb = await home.evaluate(() => ({ units: window.__dbg.bag().units, shopTab: !!document.querySelector('.nav-links a[href="shop.html"]'), visit: document.querySelector('.shop-link a') && document.querySelector('.shop-link a').getAttribute('href') }))
    check('[home] the bag from the shop is there', hb.units === 9, JSON.stringify(hb))
    check('[home] Shop tab in the nav and a Visit the shop link under the cards', hb.shopTab && hb.visit === 'shop.html', JSON.stringify(hb))
    check('[home] no page errors', !homeLog.errors.length, homeLog.errors.join(' | '))
    await home.close()
    const co = await ctx.newPage()
    await co.goto(url('checkout.html'), { waitUntil: 'load' })
    await co.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 10000 })
    const cb = await co.evaluate(() => ({ lines: document.querySelectorAll('#co-lines .bag-line').length, shop: !!document.querySelector('.co-links a[href="shop.html"]'), more: document.getElementById('co-add-more').getAttribute('href'), empty: document.querySelector('#co-empty a').getAttribute('href') }))
    check('[checkout] the lines are there, Shop link, Add more and the empty-bag link go to the shop', cb.lines === 3 && cb.shop && cb.more === 'shop.html' && cb.empty === 'shop.html', JSON.stringify(cb))
    await co.close()
    await ctx.close()
  }

  /* ---------- prices, and a product of its own added to the list ---------- */
  {
    const { ctx, page, log } = await open(browser, 'extra', 'shop.html', {}, PRICES + EXTRA)
    const d = await page.evaluate(() => {
      const c = document.querySelector('[data-item-card="test-refills"]')
      return {
        count: window.__shop.count(), last: window.__shop.ids().at(-1),
        name: c && c.querySelector('.card-title').textContent.trim(),
        format: c && !!c.querySelector('.shop-format'), tag: c && !!c.querySelector('.media-tag'),
        price: c && c.querySelector('.price').textContent.trim(), pack: c && c.querySelector('.card-meta dd').textContent.trim(),
        img: c && c.querySelector('img.slot').getAttribute('src'),
      }
    })
    check('[extra] a new line in the shop list becomes a seventh card, with its own details and no format', d.count === 7 && d.last === 'test-refills' && d.name === 'Test refill pack' && !d.format && !d.tag && d.price === '$5.00' && d.pack === 'Test pack' && d.img === 'images/product-vent-clip.jpg', JSON.stringify(d))
    const ex = card(page, 'test-refills')
    await ex.locator('[data-step="1"]').click()
    await ex.locator('.add-to-bag').click()
    await card(page, 'scent-2-vent').locator('.qty-num').fill('9')
    await card(page, 'scent-2-vent').locator('.add-to-bag').click()
    const b = await bag(page)
    check('[extra] it goes in the bag as its own line', JSON.stringify(b.lines) === JSON.stringify([{ item: 'test-refills', qty: 2 }, { scentIndex: 1, format: 'vent', qty: 9 }]), JSON.stringify(b.lines))
    check('[extra] it does not move the bulk tier, and it is priced at its own price', b.units === 11 && b.tier === '1 to 9' && b.unitPrice === 4 && b.total === 9 * 4 + 2 * 5, JSON.stringify({ units: b.units, tier: b.tier, unit: b.unitPrice, total: b.total }))
    await page.locator('#bag-toggle').click(); await sleep(700)
    const dl = await page.evaluate(() => ({
      line: document.querySelector('#bag-lines .bag-line').innerText.replace(/\s+/g, ' '),
      note: document.querySelector('.bag-note').textContent, total: document.getElementById('bag-total').textContent,
    }))
    check('[extra] the drawer line reads name, pack and price', /Test refill pack Test pack · \$5\.00 each \$10\.00/i.test(dl.line) && dl.total === '$46.00', JSON.stringify(dl))
    check('[extra] the drawer note explains the tiers count air fresheners', dl.note === 'One bulk tier for all the air fresheners in the bag. Other items are priced each.', dl.note)
    await page.screenshot({ path: path.join(OUT, 'shop-1440-extra-bag.png') })
    // the checkout writes it out
    const co = await ctx.newPage()
    await co.goto(url('checkout.html'), { waitUntil: 'load' })
    await co.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 10000 })
    await co.fill('#co-firm', 'Test Firm'); await co.fill('#co-name', 'Test Person'); await co.fill('#co-email', 'test@example.com')
    await co.locator('#co-final button[type="submit"]').first().click(); await sleep(600)
    const order = await co.evaluate(() => document.getElementById('co-order').textContent)
    check('[extra] the written order lists the product, its price, and labels the tier price', order.includes('2 x Test refill pack, Test pack, $5.00 each') && order.includes('9 x Scent two (name tbc), vent clip') && order.includes('Air fresheners: 9') && order.includes('Each air freshener: $4.00') && order.includes('Total: $46.00'), order.replace(/\n/g, ' / ').slice(0, 400))
    await co.close()
    quiet('extra', log)
    await ctx.close()
  }

  /* ---------- a bag saved before a product left the list; bad list lines ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('seedscent.bag', JSON.stringify([{ item: 'gone', qty: 2 }, { item: 'scent-3-vent', qty: 2 }, { scentIndex: 0, format: 'mirror', qty: 1 }])) } } catch {} })
    const bad = `window.SEED_SCENT.shop.push({ id: "scent-1-mirror", scent: 2, format: "vent" }, { id: "bad-scent", scent: 7, format: "vent" }, { id: "bad-format", scent: 0, format: "dash" }, { name: "no id" }, null);`
    const { page, log } = await open(browser, 'bad lines', 'shop.html', {}, bad, ctx)
    const r = await page.evaluate(() => ({ ids: window.__shop.ids(), lines: window.__dbg.bag().lines }))
    check('[bad lines] repeated ids, scents that do not exist, unknown formats and lines without an id are left out', r.ids.length === 6 && !r.ids.includes('bad-scent') && !r.ids.includes('bad-format'), r.ids.join())
    check('[bad lines] a saved product that left the list drops out; a saved shop id becomes its scent line', JSON.stringify(r.lines) === JSON.stringify([{ scentIndex: 2, format: 'vent', qty: 2 }, { scentIndex: 0, format: 'mirror', qty: 1 }]), JSON.stringify(r.lines))
    quiet('bad lines', log)
    await ctx.close()
  }

  /* ---------- a bag of other products only, and a scent written as "" ---------- */
  {
    const { ctx, page, log } = await open(browser, 'items only', 'shop.html', {}, PRICES + EXTRA + 'window.SEED_SCENT.shop.push({ id: "blank-scent", scent: "", format: "vent", name: "Odd" });')
    const ids = await page.evaluate(() => window.__shop.ids())
    check('[items only] a line with scent: "" is not taken for the first scent', !ids.includes('blank-scent'), ids.join())
    await card(page, 'test-refills').locator('.add-to-bag').click()
    const b = await bag(page)
    check('[items only] no air fresheners: no tier, no tier price, total is the product price', b.tier === '' && b.unitPrice === null && b.total === 5, JSON.stringify(b))
    await page.locator('#bag-toggle').click(); await sleep(600)
    const tier = await page.evaluate(() => document.getElementById('bag-tier').textContent)
    check('[items only] the drawer says the tier is none', tier === 'none', tier)
    quiet('items only', log)
    await ctx.close()
  }

  /* ---------- an empty shop list ---------- */
  {
    const { ctx, page, log } = await open(browser, 'empty', 'shop.html', {}, 'window.SEED_SCENT.shop = [];')
    const r = await page.evaluate(() => ({ count: window.__shop.count(), msg: document.querySelector('.shop-empty') && document.querySelector('.shop-empty').textContent.trim(), note: document.getElementById('shop-note').hidden }))
    check('[empty] no cards, a calm message, no chip note', r.count === 0 && r.msg === 'The shop is being stocked. Check back soon.' && r.note, JSON.stringify(r))
    quiet('empty', log)
    await ctx.close()
  }

  /* ---------- phone ---------- */
  {
    const { ctx, page, log } = await open(browser, 'phone', 'shop.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const d = await page.evaluate(() => {
      const c = document.querySelector('.shop-card'), r = el => el.getBoundingClientRect()
      return {
        cols: getComputedStyle(document.getElementById('shop-grid')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        step: Math.min(...[...c.querySelectorAll('.qty-btn')].map(b => r(b).height)),
        add: r(c.querySelector('.add-to-bag')).height,
        cardInside: [...document.querySelectorAll('.shop-card')].every(el => r(el).left >= 0 && r(el).right <= innerWidth),
      }
    })
    check('[phone] one column, no sideways scroll, cards inside the screen', d.cols === 1 && d.overflow <= 0 && d.cardInside, JSON.stringify(d))
    check('[phone] steppers and Add to bag are at least 44px for a finger', d.step >= 44 && d.add >= 44, JSON.stringify(d))
    await page.locator('#menu-toggle').tap(); await sleep(300)
    const menu = await page.evaluate(() => ({ open: document.getElementById('nav').classList.contains('menu-open'), shop: [...document.querySelectorAll('.nav-links a')].some(a => a.getAttribute('href') === 'shop.html' && a.getBoundingClientRect().height > 0) }))
    check('[phone] the menu opens and lists Shop', menu.open && menu.shop, JSON.stringify(menu))
    await page.locator('#menu-toggle').tap(); await sleep(200)
    const c = card(page, 'scent-2-mirror')
    await c.scrollIntoViewIfNeeded()
    await c.locator('[data-step="1"]').tap()
    await c.locator('.add-to-bag').tap()
    const b = await bag(page)
    check('[phone] tapping plus then Add to bag puts in two', JSON.stringify(b.lines) === JSON.stringify([{ scentIndex: 1, format: 'mirror', qty: 2 }]), JSON.stringify(b.lines))
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400)
    await page.screenshot({ path: path.join(OUT, 'shop-390.png'), fullPage: true })
    quiet('phone', log)
    await ctx.close()
  }

  /* ---------- tablet and the nav fold point ---------- */
  for (const w of [1121, 1120, 1100, 900]) {
    const { ctx, page } = await open(browser, `${w}px`, 'shop.html', { viewport: { width: w, height: 800 } })
    const r = await page.evaluate(() => ({ links: getComputedStyle(document.querySelector('.nav-links')).display, cols: getComputedStyle(document.getElementById('shop-grid')).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, gap: document.querySelector('.nav-actions').getBoundingClientRect().left - document.querySelector('.nav-links').getBoundingClientRect().right }))
    const linksOk = w > 1120 ? r.links === 'flex' && r.gap >= 20 : r.links === 'none'
    const cols = w > 1100 ? 3 : 2
    check(`[${w}px] nav ${w > 1120 ? 'fits on one line' : 'folds into the menu'}, ${cols} columns, no sideways scroll`, linksOk && r.cols === cols && r.overflow <= 0, JSON.stringify(r))
    await ctx.close()
  }

  /* ---------- reduced motion ---------- */
  {
    const { ctx, page, log } = await open(browser, 'reduced', 'shop.html', { reducedMotion: 'reduce' })
    const r = await page.evaluate(() => ({ revealed: window.__shop.revealed(), total: window.__shop.revealTotal(), lenis: window.__shop.hasLenis, opacities: [...new Set([...document.querySelectorAll('.shop-card')].map(c => getComputedStyle(c).opacity))] }))
    check('[reduced] every card visible at once, no smooth scroll', r.revealed === r.total && r.total === 6 && r.opacities.join() === '1' && !r.lenis, JSON.stringify(r))
    quiet('reduced', log)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(`\n${passes} passed, ${fails} failed`)
console.log(fails ? 'SHOP CHECKS FAILED' : 'All shop checks passed')
process.exit(fails ? 1 : 0)
