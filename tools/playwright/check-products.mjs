/* Products check: the real product list in js/config.js as the Shop page, the bag, the checkout
   and the home page show it. Names and prices come from the firm's product document.
   Run: cd tools/playwright && node check-products.mjs   (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
const BASE = (process.env.SITE_BASE || 'http://127.0.0.1:3001/').replace(/\/?$/, '/')
const HOST = new URL(BASE).host
const url = p => `${BASE}${p}?bust=${Date.now()}`
let fails = 0, passes = 0
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const WANT = [
  ['the-vine', 'The Vine', '$8.99'], ['the-dandelion', 'The Dandelion', '$8.99'], ['the-releaf', 'The Releaf', '$5.99'],
  ['the-bloom', 'The Bloom', '$18.99'], ['the-garden', 'The Garden', '$28.99'], ['seed-paper-10', 'Seed Paper 10 Pack', '$16.99'],
  ['limited-3', 'Limited Edition Seed Pack', '$7.99'], ['limited-10', 'Limited Edition Scent Pack', '$19.99'], ['wooden-box', 'Wooden Box', '$3.99'],
  ['subscription-5', 'Refill Subscription, 5 a Month', '$7.99 a month'], ['subscription-10', 'Refill Subscription, 10 a Month', '$12.99 a month'],
]
const browser = await chromium.launch()
try {
  for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errs = [], ext = []
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); page.on('pageerror', e => errs.push(e.message))
    page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).host !== HOST) ext.push(r.url()) })
    await page.goto(url('shop.html'), { waitUntil: 'load' })
    await page.waitForFunction(() => window.__shop && window.__shop.ready && window.__dbg && window.__dbg.bag, null, { timeout: 15000 })
    await sleep(1500)
    const d = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('.shop-card')].map(c => [c.dataset.itemCard, c.querySelector('.card-title').textContent.trim(), c.querySelector('.card-meta dd').textContent.trim().replace(/\s+/g, ' ')]),
      chips: window.__shop.chips(), photos: window.__shop.photos(),
      inside: [...document.querySelectorAll('.shop-card')].every(c => c.querySelectorAll('.item-inside li').length >= 1),
      picks: Object.fromEntries([...document.querySelectorAll('.item-choice')].map(s => [s.closest('[data-item-card]').dataset.itemCard, [...s.options].map(o => o.value)])),
      text: document.body.innerText, html: document.documentElement.outerHTML,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tap: Math.min(...[...document.querySelectorAll('.item-choice, .shop-card .add-to-bag')].map(e => e.getBoundingClientRect().height)),
    }))
    check(`[${label}] eleven products, with the names and prices from the product document`, JSON.stringify(d.cards) === JSON.stringify(WANT), JSON.stringify(d.cards))
    check(`[${label}] no placeholder chips, every card has its photo and what is inside`, d.chips === 0 && d.photos.shown === 11 && d.photos.labels === 0 && d.inside, JSON.stringify(d.photos))
    check(`[${label}] The Releaf picks a scent; The Bloom and the Wooden Box pick hanging or vent clip`, JSON.stringify(d.picks) === JSON.stringify({ 'the-releaf': ['Lavender', 'Mint', 'Wildflower'], 'the-bloom': ['Hanging', 'Vent clip'], 'wooden-box': ['Hanging', 'Vent clip'] }), JSON.stringify(d.picks))
    check(`[${label}] no dashes, and never the retired words`, !/[–—]/.test(d.html) && !/plant me|earthscents/i.test(d.html), '')
    check(`[${label}] recycled cardboard boxes are mentioned`, /recycled cardboard box/i.test(d.text))
    check(`[${label}] no sideways scroll`, d.overflow <= 0, `${d.overflow}px`)
    if (label === 'phone') check('[phone] pickers and Add buttons are at least 44px', d.tap >= 44, `${d.tap}px`)

    await page.evaluate(() => window.__dbg.bagClear())
    await page.selectOption('[data-item-card="the-releaf"] .item-choice', 'Mint')
    await page.locator('[data-item-card="the-releaf"] .add-to-bag').click()
    await page.selectOption('[data-item-card="the-releaf"] .item-choice', 'Lavender')
    await page.locator('[data-item-card="the-releaf"] .add-to-bag').click()
    await page.selectOption('[data-item-card="the-releaf"] .item-choice', 'Mint')
    await page.locator('[data-item-card="the-releaf"] .add-to-bag').click()
    await page.selectOption('[data-item-card="the-bloom"] .item-choice', 'Vent clip'); await sleep(600)
    const bloomImg = await page.getAttribute('[data-item-card="the-bloom"] img.slot', 'src')
    check(`[${label}] picking Vent clip on The Bloom shows the vent clip photo`, bloomImg === 'images/product-bloom-vent.jpg', bloomImg)
    await page.locator('[data-item-card="the-bloom"] .add-to-bag').click()
    await page.locator('[data-item-card="the-garden"] .add-to-bag').click()
    await page.locator('[data-item-card="subscription-10"] .add-to-bag').click()
    const b = await page.evaluate(() => window.__dbg.bag())
    check(`[${label}] the bag keeps each choice as its own line and merges repeats`, JSON.stringify(b.lines) === JSON.stringify([{ item: 'the-releaf', option: 'Mint', qty: 2 }, { item: 'the-releaf', option: 'Lavender', qty: 1 }, { item: 'the-bloom', option: 'Vent clip', qty: 1 }, { item: 'the-garden', qty: 1 }, { item: 'subscription-10', qty: 1 }]), JSON.stringify(b.lines))
    const total = 3 * 5.99 + 18.99 + 28.99 + 12.99
    check(`[${label}] the total is the sum of the prices`, Math.abs(b.total - total) < 0.005, `${b.total} vs ${total.toFixed(2)}`)
    await page.locator('#bag-toggle').click(); await sleep(800)
    const dr = await page.evaluate(() => ({ text: document.getElementById('bag-lines').innerText.replace(/\s+/g, ' '), tierShown: !document.getElementById('bag-tier').parentElement.hidden, note: !!document.querySelector('.bag-note:not([hidden])'), total: document.getElementById('bag-total').textContent }))
    check(`[${label}] drawer lines show the choice and the price, the subscription per month`, /The Releaf MINT · \$5\.99 EACH \$11\.98/i.test(dr.text) && /The Bloom VENT CLIP · \$18\.99 EACH/i.test(dr.text) && /10 a Month \$12\.99 A MONTH/i.test(dr.text), dr.text.slice(0, 260))
    check(`[${label}] no bulk tier row or note, since every product has its own price`, !dr.tierShown && !dr.note && dr.total === '$78.94', JSON.stringify({ t: dr.tierShown, n: dr.note, total: dr.total }))
    check(`[${label}] no console errors, nothing fetched from another host`, !errs.length && !ext.length, [...errs, ...ext].join(' | ').slice(0, 200))

    if (label === 'desktop') {
      const co = await ctx.newPage()
      await co.goto(url('checkout.html'), { waitUntil: 'load' }); await co.waitForFunction(() => window.__dbg && window.__dbg.bag)
      await co.fill('#co-firm', 'Test Firm'); await co.fill('#co-name', 'Test Person'); await co.fill('#co-email', 'test@example.com')
      await co.locator('#co-final button[type="submit"]').first().click(); await sleep(600)
      const order = await co.evaluate(() => document.getElementById('co-order').textContent)
      check('[checkout] the written order lists each product, its choice and price, with no tier lines', order.includes('2 x The Releaf, Mint, $5.99 each') && order.includes('1 x The Bloom, Vent clip, $18.99 each') && order.includes('1 x Refill Subscription, 10 a Month, $12.99 a month') && order.includes('Total: $78.94') && !/Tier:/.test(order), order.replace(/\n/g, ' / ').slice(0, 420))
      check('[checkout] the summary hides the tier and each rows', await co.evaluate(() => document.getElementById('co-tier').parentElement.hidden && document.getElementById('co-each').parentElement.hidden))
      await co.close()

      // the home page: named scents, and a scent card adds The Releaf in that scent
      const home = await ctx.newPage(); const herrs = []
      home.on('pageerror', e => herrs.push(e.message))
      await home.goto(url('index.html'), { waitUntil: 'load' }); await home.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 20000 })
      await home.evaluate(() => window.__dbg.bagClear())
      const h = await home.evaluate(() => ({
        names: [...document.querySelectorAll('#scent-cards .card-title')].map(e => e.textContent.trim()),
        meta: [...document.querySelectorAll('#scent-cards .card')].map(c => [...c.querySelectorAll('.card-meta dd')].map(e => e.textContent.trim()).join(' | ')),
        holder: [...document.querySelectorAll('#spec th')].find(t => t.textContent.trim() === 'Holder').nextElementSibling.textContent.trim(),
      }))
      check('[home] the three scents are named, each card priced as its refill pack', h.names.join() === 'Lavender,Mint,Wildflower' && h.meta.every(m => m === '3 seed papers | $5.99'), JSON.stringify(h))
      check('[home] the spec sheet calls the holder a reusable wooden box', /^A reusable wooden box\. Seed paper refills slide in\./.test(h.holder), h.holder)
      await home.evaluate(() => document.querySelector('.add-to-bag[data-add="2"]').click())
      const hb = await home.evaluate(() => window.__dbg.bag())
      check('[home] Add to bag on the Wildflower card adds The Releaf in Wildflower', JSON.stringify(hb.lines) === JSON.stringify([{ item: 'the-releaf', option: 'Wildflower', qty: 1 }]) && hb.total === 5.99, JSON.stringify(hb.lines))
      check('[home] no page errors', !herrs.length, herrs.join(' | '))
      await home.close()
    }
    await ctx.close()
  }
} finally { await browser.close() }
console.log(`\n${passes} passed, ${fails} failed`)
console.log(fails ? 'PRODUCT CHECKS FAILED' : 'All product checks passed')
process.exit(fails ? 1 : 0)
