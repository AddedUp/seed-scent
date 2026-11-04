/* Bag + checkout check. Run from tools/playwright:  node check-cart.mjs
   Needs the local server on http://127.0.0.1:3001/ (python3 -m http.server 3001 from the project root). */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'out'); mkdirSync(out, { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:3001'
const bust = Date.now()

const results = {}, fails = [], errors = []
function expect(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : got === want
  results[name] = got
  if (!ok) fails.push(`${name}: got ${JSON.stringify(got)}, wanted ${typeof want === 'function' ? want.toString() : JSON.stringify(want)}`)
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`) })
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`))
  page.on('response', r => { if (r.status() >= 400) errors.push(`[${tag}] ${r.status()} ${r.url()}`) })
  // a mailto: link is handed to the mail app, which headless Chromium has not got, so that one abort is expected
  page.on('requestfailed', r => { if (!r.url().startsWith('mailto:')) errors.push(`[${tag}] failed: ${r.url()} ${r.failure()?.errorText || ''}`) })
}
const ready = page => page.waitForFunction(() => window.__dbg && typeof window.__dbg.bag === 'function', null, { timeout: 20000 })
const text = (page, sel) => page.locator(sel).first().evaluate(el => el.textContent.trim())
// the tier label without its "tbc" chip: only the element's own text nodes
const label = (page, sel) => page.locator(sel).first().evaluate(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim())
const active = page => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className))
// nothing a buyer or judge sees may name a file or a config key
const NO_CFG = /config|checkout\.mode|gatewayUrl|marketplaceUrl|\.js\b/i

const browser = await chromium.launch()

/* ---------------- desktop: index.html ---------------- */
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
let page = await desk.newPage(); watch(page, 'index')
await page.goto(`${BASE}/index.html?bust=${bust}`, { waitUntil: 'load' })
await ready(page)
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'load' }); await ready(page)

expect('index.count.start', await text(page, '#bag-count'), '0')
expect('index.bag.inert.closed', await page.locator('#bag').evaluate(el => el.inert === true && el.getAttribute('aria-hidden') === 'true'), true)

// the empty state: message shown, checkout disabled and out of the tab order, footer still at the bottom
await page.click('#bag-toggle'); await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
expect('index.empty.shown', await page.locator('#bag-empty').evaluate(el => !el.hidden && getComputedStyle(el).display !== 'none'), true)
expect('index.empty.lines', await page.locator('#bag-lines li').count(), 0)
expect('index.empty.checkoutDisabled', await page.locator('#bag-checkout').getAttribute('aria-disabled'), 'true')
expect('index.empty.checkoutTabindex', await page.locator('#bag-checkout').getAttribute('tabindex'), '-1')
expect('index.empty.footAtBottom', await page.evaluate(() => { const f = document.querySelector('.bag-foot').getBoundingClientRect(); return innerHeight - f.bottom < 60 }), true)
// the default tier is a draft too
expect('index.empty.tier', await label(page, '#bag-tier'), '1 to 9')
expect('index.empty.tier.tbc', await page.locator('#bag-tier .tbc').evaluate(el => ({ text: el.textContent, flag: el.dataset.tbc, title: el.title })), v => v.text === 'tbc' && v.flag === 'tiersConfirmed' && v.title.length > 0)
// focus trap with one focusable: Tab and Shift+Tab stay on Close
expect('index.empty.focus', await active(page), 'bag-close')
await page.keyboard.press('Tab'); expect('index.empty.trap.tab', await active(page), 'bag-close')
await page.keyboard.press('Shift+Tab'); expect('index.empty.trap.shiftTab', await active(page), 'bag-close')
await page.screenshot({ path: path.join(out, 'cart-desktop-empty.png') })
await page.keyboard.press('Escape'); await page.waitForTimeout(800)

// add scent 0 twice, scent 1 once (real clicks; Playwright scrolls the cards into view)
const add0 = page.locator('.add-to-bag[data-add="0"]'), add1 = page.locator('.add-to-bag[data-add="1"]')
await add0.click()
expect('index.ack.text', (await add0.textContent()).trim(), s => s.startsWith('Added'))
await add0.click()
await add1.click()
expect('index.count.after3', await text(page, '#bag-count'), '3')
await page.waitForTimeout(1400)
expect('index.ack.reverted', (await add0.textContent()).trim(), s => s.startsWith('Add to bag'))
expect('index.storage', await page.evaluate(() => JSON.parse(localStorage.getItem('seedscent.bag'))), v => Array.isArray(v) && v.length === 2 && v[0].qty === 2 && v[1].qty === 1 && v[0].format === 'mirror')

// open the drawer
await page.click('#bag-toggle')
await page.waitForSelector('#bag.open')
await page.waitForTimeout(800)   // slide-in
expect('index.drawer.aria', await page.locator('#bag').getAttribute('aria-hidden'), 'false')
expect('index.toggle.expanded', await page.locator('#bag-toggle').getAttribute('aria-expanded'), 'true')
expect('index.scrim.shown', await page.locator('#scrim').evaluate(el => !el.hidden), true)
expect('index.lines.count', await page.locator('#bag-lines li').count(), 2)
expect('index.lines.qty', await page.locator('#bag-lines .qty-num').evaluateAll(els => els.map(e => e.value)), v => JSON.stringify(v) === '["2","1"]')
expect('index.lines.format', await text(page, '#bag-lines li:first-child .line-format'), 'Mirror cord')
expect('index.lines.nameChip', await page.locator('#bag-lines li:first-child .line-name .ph').count(), 1)
expect('index.units', await text(page, '#bag-units'), '3')
expect('index.tier.3', await label(page, '#bag-tier'), '1 to 9')
expect('index.tier.tbc', await page.locator('#bag-tier .tbc[data-tbc="tiersConfirmed"]').count(), 1)
expect('index.total.chip', await text(page, '#bag-total .ph'), 'total')
expect('index.linePrice.chip', await page.locator('#bag-lines .line-price .ph').count(), 2)
expect('index.checkout.tabbable', await page.locator('#bag-checkout').getAttribute('tabindex'), null)
expect('index.focus.onClose', await active(page), 'bag-close')

// focus trap: Shift+Tab from Close wraps to the checkout pill, Tab wraps back, then the whole cycle
await page.keyboard.press('Shift+Tab'); expect('index.trap.shiftTabWraps', await active(page), 'bag-checkout')
await page.keyboard.press('Tab'); expect('index.trap.tabWraps', await active(page), 'bag-close')
await page.keyboard.press('Tab')
expect('index.trap.tabForward', await page.evaluate(() => { const a = document.activeElement; return a.closest('#bag-lines li:first-child') != null && a.dataset.act === 'dec' }), true)
// line 1: input, plus, remove; line 2: minus is disabled at qty 1 and gets skipped, then input, plus, remove; then the pill
for (let i = 0; i < 7; i++) await page.keyboard.press('Tab')
expect('index.trap.cycleEndsOnPill', await active(page), 'bag-checkout')
await page.keyboard.press('Tab'); expect('index.trap.cycleWraps', await active(page), 'bag-close')
expect('index.trap.stillOpen', await page.locator('#bag').evaluate(el => el.classList.contains('open')), true)

// stepper: plus on line 2, then type 58 into line 1 -> 58 + 2 = 60 units
await page.locator('#bag-lines li:nth-child(2) [data-act="inc"]').click()
expect('index.units.afterPlus', await text(page, '#bag-units'), '4')
const first = page.locator('#bag-lines li:first-child .qty-num')
await first.fill('58'); await first.press('Enter')
expect('index.units.60', await text(page, '#bag-units'), '60')
expect('index.count.60', await text(page, '#bag-count'), '60')
expect('index.tier.60', await label(page, '#bag-tier'), '50+')
expect('index.tier.60.tbc', await page.locator('#bag-tier .tbc').count(), 1)
expect('index.focus.kept', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('qty-num')), true)
expect('index.dbg.bag', await page.evaluate(() => window.__dbg.bag()), s => s.units === 60 && s.tier === '50+' && s.total === null && s.lines.length === 2)

// minus disabled at 1: set line 2 to 1 and check
await page.locator('#bag-lines li:nth-child(2) [data-act="dec"]').click()
expect('index.minus.disabled', await page.locator('#bag-lines li:nth-child(2) [data-act="dec"]').isDisabled(), true)

await page.screenshot({ path: path.join(out, 'cart-desktop-1440x900.png') })

// Escape closes, focus returns to the toggle
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
expect('index.escape.closed', await page.locator('#bag').evaluate(el => !el.classList.contains('open') && el.getAttribute('aria-hidden') === 'true' && el.inert === true), true)
expect('index.scrim.hidden', await page.locator('#scrim').evaluate(el => el.hidden), true)
expect('index.focus.back', await active(page), 'bag-toggle')

// "Open the bag" in the firms section: Escape returns focus to that opener, scrim click closes
await page.locator('#open-bag').click()
await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
await page.keyboard.press('Escape'); await page.waitForTimeout(800)
expect('index.escape.focusOpener', await active(page), 'open-bag')
await page.locator('#open-bag').click()
await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
await page.mouse.click(200, 450)   // on the scrim, left of the drawer
await page.waitForTimeout(800)
expect('index.scrim.click.closed', await page.locator('#bag').evaluate(el => !el.classList.contains('open')), true)

// remove a line
await page.click('#bag-toggle'); await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
await page.locator('#bag-lines li:nth-child(2) [data-act="remove"]').click()
expect('index.remove.count', await page.locator('#bag-lines li').count(), 1)
expect('index.remove.units', await text(page, '#bag-units'), '58')
await page.locator('#bag-lines li:first-child [data-act="inc"]').click()
await page.locator('#bag-lines li:first-child [data-act="inc"]').click()
expect('index.units.final', await text(page, '#bag-units'), '60')
// put the second line back so the checkout has two lines to show
await page.evaluate(() => window.__dbg.bagSet([...window.__dbg.bag().lines, { scentIndex: 1, format: 'vent', qty: 3 }]))
expect('index.units.beforeCheckout', await text(page, '#bag-units'), '63')
expect('index.checkout.enabled', await page.locator('#bag-checkout').getAttribute('aria-disabled'), null)

/* ---------------- desktop: checkout.html ---------------- */
page = await desk.newPage(); watch(page, 'checkout')
await page.goto(`${BASE}/checkout.html?bust=${bust}`, { waitUntil: 'load' })
await ready(page)
expect('co.lines.count', await page.locator('#co-lines li').count(), 2)
expect('co.lines.text', await page.locator('#co-lines li').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())), v => v[0].includes('Mirror cord') && v[1].includes('Vent clip'))
expect('co.lines.qty', await page.locator('#co-lines .qty-num').evaluateAll(els => els.map(e => e.value)), v => JSON.stringify(v) === '["60","3"]')
expect('co.units', await text(page, '#co-units'), '63')
expect('co.tier', await label(page, '#co-tier'), '50+')
expect('co.tier.tbc', await page.locator('#co-tier .tbc[data-tbc="tiersConfirmed"]').evaluate(el => el.textContent + '|' + el.title), 'tbc|To be confirmed by the team')
expect('co.each.chip', await text(page, '#co-each .ph'), 'price')
expect('co.total.chip', await text(page, '#co-total .ph'), 'total')
expect('co.empty.hidden', await page.locator('#co-empty').evaluate(el => el.hidden), true)

// copy on the page: no config talk, the optional field says so in plain words, "How this works" is one line
expect('co.annotation', await text(page, '.co-head .annotation'), 'Check the quantities, tell us who you are, and the bulk tier sorts itself out.')
expect('co.account.label', await text(page, 'label[for="co-account"]'), 'VE account or firm ID (optional)')
expect('co.account.noTbc', await page.locator('label[for="co-account"] .tbc').count(), 0)
expect('co.how.paragraphs', await page.locator('.co-how p:not(.kicker)').evaluateAll(els => els.map(e => e.textContent.trim())), v => v.length === 1 && v[0] === 'Your bag lives in this browser. Nothing leaves the page until you press the button.')
expect('co.how.noCode', await page.locator('.co-how code, #co-mode').count(), 0)
expect('co.page.noCfg', await page.evaluate(() => document.querySelector('main').textContent), s => !NO_CFG.test(s))

// email mode with no contact email: a dimmed pill out of the tab order, a ghost button that writes the order out
expect('co.final.offPill', await page.locator('#co-final span.pill[aria-disabled="true"]').evaluate(el => ({ text: el.textContent.trim(), tabindex: el.getAttribute('tabindex') })), v => v.text.startsWith('Send the order') && v.tabindex === '-1')
expect('co.final.noLivePrimary', await page.locator('#co-final button.pill:not(.ghost), #co-final a.pill').count(), 0)
expect('co.final.writeOut', await page.locator('#co-final button[type="submit"]').evaluate(el => ({ text: el.textContent.trim(), ghost: el.classList.contains('ghost') })), v => v.text === 'Write out the order' && v.ghost)
expect('co.final.note', await text(page, '#co-final .co-note'), 'The team has not published an order email yet. Write the order out below and copy it.')
expect('co.final.noChip', await page.locator('#co-final .ph').count(), 0)

// edit a quantity on the checkout page too
await page.locator('#co-lines li:nth-child(2) [data-act="inc"]').click()
expect('co.units.afterPlus', await text(page, '#co-units'), '64')

// validation first
await page.click('#co-final button[type="submit"]')
expect('co.error.shown', await text(page, '#co-error'), s => s.includes('Fill in'))
expect('co.error.invalid', await page.locator('[aria-invalid="true"]').count(), 3)
expect('co.result.stillHidden', await page.locator('#co-result').evaluate(el => el.hidden), true)

// then a real submit (email mode, no contact email set -> written out on screen)
await page.fill('#co-firm', 'Maple Street Goods')
expect('co.invalid.clearsOnInput', await page.locator('#co-firm').getAttribute('aria-invalid'), null)
await page.fill('#co-name', 'Test Contact')
await page.fill('#co-email', 'test@example.com')
await page.fill('#co-notes', 'Deliver to the trade show table.')
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)
await page.screenshot({ path: path.join(out, 'checkout-desktop-1440x900.png') })
await page.click('#co-final button[type="submit"]')
await page.waitForSelector('#co-result:not([hidden])')
const order = await text(page, '#co-order')
expect('co.order.firstLine', order.split('\n')[0], 'Seed Scent order from Maple Street Goods')
expect('co.order.body', order, s => s.includes('60 x Scent one (name tbc), mirror cord') && s.includes('4 x Scent two (name tbc), vent clip') && s.includes('Units: 64') && s.includes('Tier: 50+ (to be confirmed)') && s.includes('Total: total tbc') && s.includes('Deliver to the trade show table.'))
expect('co.note.unset', await text(page, '#co-result-note'), 'The team has not published an order email yet. Copy the order and send it to the team another way.')
expect('co.mailto.none', await page.evaluate(() => window.__dbg.mailto()), null)
expect('co.error.hidden', await page.locator('#co-error').evaluate(el => el.hidden), true)
await page.click('#co-copy')
await page.waitForTimeout(150)
expect('co.copy.label', await text(page, '#co-copy'), 'Copied')
expect('co.copy.clipboard', await page.evaluate(() => navigator.clipboard.readText()), s => s === order)
await page.waitForTimeout(1400)   // let the smooth scroll to the written-out order finish
expect('co.result.scrolledTo', await page.locator('#co-result').evaluate(el => Math.round(el.getBoundingClientRect().top)), t => t >= 0 && t <= 40)   // lands 24px under the top edge
await page.screenshot({ path: path.join(out, 'checkout-desktop-after-submit.png') })
await page.screenshot({ path: path.join(out, 'checkout-desktop-full.png'), fullPage: true })

/* other configs: config.js is patched on the wire so the override is in place before any module runs */
async function onCheckout(tag, { mode = null, patch = {} } = {}, fn) {
  const p = await desk.newPage(); watch(p, tag)
  const warns = []
  p.on('console', m => { if (m.type() === 'warning') warns.push(m.text()) })
  await p.route('**/js/config.js*', async route => {
    const res = await route.fetch()
    const body = (await res.text()) + `\n;(function(){ ${mode != null ? `window.SEED_SCENT.checkout.mode = ${JSON.stringify(mode)};` : ''} Object.assign(window.SEED_SCENT, ${JSON.stringify(patch)}); })();`
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body })
  })
  await p.goto(`${BASE}/checkout.html?bust=${bust}&t=${encodeURIComponent(tag)}`, { waitUntil: 'load' }); await ready(p)
  const finalHtml = async () => (await p.locator('#co-final').innerHTML()).replace(/\s+/g, ' ').trim()
  const r = await fn(p, { warns, finalHtml })
  await p.close()
  return r
}
const fillFirm = async p => { await p.fill('#co-firm', 'Maple Street Goods'); await p.fill('#co-name', 'Test Contact'); await p.fill('#co-email', 'test@example.com') }
const offBranch = html => html.includes('aria-disabled="true"') && html.includes('tabindex="-1"') && html.includes('Write out the order') && !html.includes('data-magnetic') && !NO_CFG.test(html)

// marketplace
const mk0 = await onCheckout('mode:marketplace:null', { mode: 'marketplace' }, async (p, { finalHtml }) => finalHtml())
expect('mode.marketplace.null', mk0, h => offBranch(h) && h.includes('Finish on the VE marketplace') && h.includes('The team has not published a marketplace link yet. Write the order out below and copy it.'))
const mk1 = await onCheckout('mode:marketplace:url', { mode: 'marketplace', patch: { marketplaceUrl: 'https://example.test/seed-scent' } }, async (p, { finalHtml }) => finalHtml())
expect('mode.marketplace.url', mk1, h => h.includes('href="https://example.test/seed-scent"') && h.includes('target="_blank"') && h.includes('Write out the order') && !NO_CFG.test(h))

// gateway
const gw0 = await onCheckout('mode:gateway:null', { mode: 'gateway' }, async (p, { finalHtml }) => ({ html: await finalHtml(), action: await p.locator('#co-form').getAttribute('action') }))
expect('mode.gateway.null', gw0, r => offBranch(r.html) && r.html.includes('Send the order') && r.html.includes('The team has not switched on online payment yet.') && r.action === null)
const gw1 = await onCheckout('mode:gateway:url', { patch: { checkout: { mode: 'gateway', gatewayUrl: 'https://pay.example.test/order' } } }, async (p, { finalHtml }) => ({
  html: await finalHtml(), action: await p.locator('#co-form').evaluate(f => ({ action: f.getAttribute('action'), method: f.getAttribute('method') })),
}))
expect('mode.gateway.url', gw1, r => r.action.action === 'https://pay.example.test/order' && r.action.method === 'post' && r.html.includes('pay.example.test') && !NO_CFG.test(r.html))

// an unknown mode behaves like email with no address: one warning, no live primary
const unk = await onCheckout('mode:unknown', { mode: 'paypal' }, async (p, { warns, finalHtml }) => ({ html: await finalHtml(), warns }))
expect('mode.unknown.warnOnce', unk.warns, w => w.length === 1 && w[0].includes('paypal') && w[0].includes('email'))
expect('mode.unknown.final', unk.html, h => offBranch(h) && h.includes('Send the order') && h.includes('The team has not published an order email yet.'))

// email mode with an address: a live primary, the mailto carries the plain address and encodes only subject and body
const em = await onCheckout('mode:email:set', { patch: { contact: { email: 'orders@example.test' } } }, async (p, { finalHtml }) => {
  const html = await finalHtml()
  await fillFirm(p)
  await p.click('#co-final button[type="submit"]')
  await p.waitForSelector('#co-result:not([hidden])')
  return { html, mailto: await p.evaluate(() => window.__dbg.mailto()), note: await text(p, '#co-result-note') }
})
expect('email.set.primary', em.html, h => /<button class="pill" type="submit" data-magnetic(="")?>Send the order/.test(h) && h.includes('Opens an email to orders@example.test.') && !h.includes('Write out the order') && !h.includes('aria-disabled'))
expect('email.set.mailto', em.mailto, s => typeof s === 'string' && s.startsWith('mailto:orders@example.test?subject=Seed%20Scent%20order%20from%20Maple%20Street%20Goods&body=Seed%20Scent%20order%20from%20Maple%20Street%20Goods%0D%0A%0D%0AFirm%3A%20Maple%20Street%20Goods') && !s.includes('mailto:orders%40'))
expect('email.set.note', em.note, s => s.includes('addressed to orders@example.test'))

// tiers confirmed: the chip goes away in the summary and in the written-out order
const tc = await onCheckout('tiers:confirmed', { patch: { tiersConfirmed: true } }, async p => {
  const chips = await p.locator('#co-tier .tbc').count(), lbl = await label(p, '#co-tier')
  await fillFirm(p)
  await p.click('#co-final button[type="submit"]')
  await p.waitForSelector('#co-result:not([hidden])')
  return { chips, lbl, order: await text(p, '#co-order') }
})
expect('tiers.confirmed.noChip', tc, r => r.chips === 0 && r.lbl === '50+')
expect('tiers.confirmed.orderText', tc.order, s => /^Tier: 50\+$/m.test(s))

// prices read through num(): "4.50" and "$4.00" count, "abc" falls back to chips, a string min still sorts
const pricing = [{ min: 1, label: '1 to 9', price: '4.50' }, { min: '10', label: '10+', price: '$4.00' }, { min: 50, label: '50+', price: 'abc' }, { min: 100, label: '100+', price: 3.5 }]
const pr = await onCheckout('tiers:prices', { patch: { bulkTiers: pricing } }, async p => {
  const before = await p.evaluate(() => window.__dbg.bag().lines)
  const read = async () => ({
    tier: await label(p, '#co-tier'), each: await text(p, '#co-each'), total: await text(p, '#co-total'),
    lineChips: await p.locator('#co-lines .line-price .ph').count(), line1: await text(p, '#co-lines li:first-child .line-price'), fmt1: await text(p, '#co-lines li:first-child .line-format'),
  })
  const r = {}
  r.at64 = await read()                                                                      // 64 units -> "abc" -> chips
  await p.evaluate(() => window.__dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 12 }])); r.at12 = await read()
  await p.evaluate(() => window.__dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 5 }])); r.at5 = await read()
  await p.evaluate(() => window.__dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 120 }])); r.at120 = await read()
  r.snap = await p.evaluate(() => window.__dbg.bag())
  await p.evaluate(b => window.__dbg.bagSet(b), before)                                      // leave the bag as it was
  r.restored = await text(p, '#co-units')
  return r
})
expect('prices.abc.chips', pr.at64, r => r.tier === '50+' && r.each === 'price' && r.total === 'total' && r.lineChips === 2)
expect('prices.dollarString', pr.at12, r => r.tier === '10+' && r.each === '$4.00' && r.total === '$48.00' && r.line1 === '$48.00' && r.fmt1.includes('$4.00 each') && r.lineChips === 0)
expect('prices.plainString', pr.at5, r => r.tier === '1 to 9' && r.each === '$4.50' && r.total === '$22.50')
expect('prices.number', pr.at120, r => r.tier === '100+' && r.each === '$3.50' && r.total === '$420.00')
expect('prices.snapshot', pr.snap, s => s.unitPrice === 3.5 && s.total === 420 && s.units === 120)
expect('prices.restored', pr.restored, '64')

await desk.close()

/* ---------------- mobile: 390 x 844 ---------------- */
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
page = await mob.newPage(); watch(page, 'mobile')
await page.goto(`${BASE}/index.html?bust=${bust}`, { waitUntil: 'load' }); await ready(page)
await page.evaluate(() => localStorage.setItem('seedscent.bag', JSON.stringify([{ scentIndex: 0, format: 'mirror', qty: 2 }, { scentIndex: 2, format: 'vent', qty: 1 }])))
await page.reload({ waitUntil: 'load' }); await ready(page)
expect('mobile.count', await text(page, '#bag-count'), '3')
await page.click('#bag-toggle'); await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
expect('mobile.drawer.width', await page.locator('#bag').evaluate(el => Math.round(el.getBoundingClientRect().width)), 390)
expect('mobile.lines', await page.locator('#bag-lines li').count(), 2)
expect('mobile.tier.oneLine', await page.locator('#bag-tier').evaluate(el => { const dd = el.getBoundingClientRect(), chip = el.querySelector('.tbc').getBoundingClientRect(); return chip.right <= dd.right + 1 && chip.bottom <= dd.bottom + 1 }), true)
await page.screenshot({ path: path.join(out, 'cart-mobile-390x844.png') })

page = await mob.newPage(); watch(page, 'mobile-checkout')
await page.goto(`${BASE}/checkout.html?bust=${bust}`, { waitUntil: 'load' }); await ready(page)
expect('mobile.co.lines', await page.locator('#co-lines li').count(), 2)
expect('mobile.co.columns', await page.locator('.co-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1)
await page.screenshot({ path: path.join(out, 'checkout-mobile-390x844.png') })
await page.screenshot({ path: path.join(out, 'checkout-mobile-full.png'), fullPage: true })
await mob.close()

await browser.close()

/* ---------------- report ---------------- */
console.log(JSON.stringify(results, null, 1))
console.log('\nConsole/network errors (' + errors.length + '):')
errors.forEach(e => console.log('  ' + e))
console.log('\nFailures (' + fails.length + '):')
fails.forEach(f => console.log('  ' + f))
process.exit(fails.length ? 1 : 0)
