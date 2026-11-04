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
  page.on('requestfailed', r => errors.push(`[${tag}] failed: ${r.url()} ${r.failure()?.errorText || ''}`))
}
const ready = page => page.waitForFunction(() => window.__dbg && typeof window.__dbg.bag === 'function', null, { timeout: 20000 })
const text = (page, sel) => page.locator(sel).first().evaluate(el => el.textContent.trim())

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

// the empty state: message shown, checkout disabled, footer still at the bottom
await page.click('#bag-toggle'); await page.waitForSelector('#bag.open'); await page.waitForTimeout(800)
expect('index.empty.shown', await page.locator('#bag-empty').evaluate(el => !el.hidden && getComputedStyle(el).display !== 'none'), true)
expect('index.empty.lines', await page.locator('#bag-lines li').count(), 0)
expect('index.empty.checkoutDisabled', await page.locator('#bag-checkout').getAttribute('aria-disabled'), 'true')
expect('index.empty.footAtBottom', await page.evaluate(() => { const f = document.querySelector('.bag-foot').getBoundingClientRect(); return innerHeight - f.bottom < 60 }), true)
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
expect('index.tier.3', await text(page, '#bag-tier'), '1 to 9')
expect('index.total.chip', await text(page, '#bag-total .ph'), 'total')
expect('index.linePrice.chip', await page.locator('#bag-lines .line-price .ph').count(), 2)
expect('index.focus.onClose', await page.evaluate(() => document.activeElement && document.activeElement.id), 'bag-close')

// stepper: plus on line 2, then type 58 into line 1 -> 58 + 2 = 60 units
await page.locator('#bag-lines li:nth-child(2) [data-act="inc"]').click()
expect('index.units.afterPlus', await text(page, '#bag-units'), '4')
const first = page.locator('#bag-lines li:first-child .qty-num')
await first.fill('58'); await first.press('Enter')
expect('index.units.60', await text(page, '#bag-units'), '60')
expect('index.count.60', await text(page, '#bag-count'), '60')
expect('index.tier.60', await text(page, '#bag-tier'), '50+')
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
expect('index.focus.back', await page.evaluate(() => document.activeElement && document.activeElement.id), 'bag-toggle')

// "Open the bag" in the firms section, scrim click closes
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
expect('co.tier', await text(page, '#co-tier'), '50+')
expect('co.each.chip', await text(page, '#co-each .ph'), 'price')
expect('co.total.chip', await text(page, '#co-total .ph'), 'total')
expect('co.mode', await text(page, '#co-mode'), 'email')
expect('co.final.button', await text(page, '#co-final button[type="submit"]'), s => s.startsWith('Send the order'))
expect('co.final.note.chip', await text(page, '#co-final .co-note .ph'), 'contact email')
expect('co.empty.hidden', await page.locator('#co-empty').evaluate(el => el.hidden), true)

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
expect('co.order.body', order, s => s.includes('60 x Scent one (name tbc), mirror cord') && s.includes('4 x Scent two (name tbc), vent clip') && s.includes('Units: 64') && s.includes('Tier: 50+') && s.includes('Total: total tbc') && s.includes('Deliver to the trade show table.'))
expect('co.note.unset', await text(page, '#co-result-note'), s => s.includes('not set'))
expect('co.error.hidden', await page.locator('#co-error').evaluate(el => el.hidden), true)
await page.click('#co-copy')
await page.waitForTimeout(150)
expect('co.copy.label', await text(page, '#co-copy'), 'Copied')
expect('co.copy.clipboard', await page.evaluate(() => navigator.clipboard.readText()), s => s === order)
await page.waitForTimeout(1400)   // let the smooth scroll to the written-out order finish
expect('co.result.scrolledTo', await page.locator('#co-result').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight }), true)
await page.screenshot({ path: path.join(out, 'checkout-desktop-after-submit.png') })
await page.screenshot({ path: path.join(out, 'checkout-desktop-full.png'), fullPage: true })

// other modes, through config overrides on a fresh load
async function modeCheck(mode, patch) {
  const p = await desk.newPage(); watch(p, `mode:${mode}`)
  await p.addInitScript(({ mode, patch }) => {
    const apply = () => { if (!window.SEED_SCENT) return false; window.SEED_SCENT.checkout.mode = mode; Object.assign(window.SEED_SCENT, patch); return true }
    if (!apply()) document.addEventListener('DOMContentLoaded', apply)   // config.js is a classic script in <head>, so this runs after it only via the DOM
    const t = setInterval(() => { if (apply()) clearInterval(t) }, 0)
  }, { mode, patch })
  await p.goto(`${BASE}/checkout.html?bust=${bust}&m=${mode}`, { waitUntil: 'load' }); await ready(p)
  const html = await p.locator('#co-final').innerHTML()
  const modeTxt = await text(p, '#co-mode')
  const action = await p.locator('#co-form').evaluate(f => ({ action: f.getAttribute('action'), method: f.getAttribute('method') }))
  await p.close()
  return { html: html.replace(/\s+/g, ' ').trim(), modeTxt, action }
}
const mk0 = await modeCheck('marketplace', {})
expect('mode.marketplace.null', mk0, r => r.modeTxt === 'marketplace' && r.html.includes('class="ph">marketplace url<') && r.html.includes('aria-disabled="true"'))
const mk1 = await modeCheck('marketplace', { marketplaceUrl: 'https://example.test/seed-scent' })
expect('mode.marketplace.url', mk1, r => r.html.includes('href="https://example.test/seed-scent"') && r.html.includes('target="_blank"'))
const gw0 = await modeCheck('gateway', {})
expect('mode.gateway.null', gw0, r => r.html.includes('class="ph">gateway url<') && r.action.action === null)
const gw1 = await modeCheck('gateway', { checkout: { mode: 'gateway', gatewayUrl: 'https://pay.example.test/order' } })
expect('mode.gateway.url', gw1, r => r.action.action === 'https://pay.example.test/order' && r.action.method === 'post' && r.html.includes('pay.example.test'))

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
