/* Products check: the real product list in js/config.js as the Shop page, the bag, the checkout
   and the home page show it. Names and prices come from the firm's product document; five
   products are sold through the firm's buy buttons on the VE marketplace, the rest through the bag.
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
  ['the-bloom', 'The Bloom', '$18.99'], ['the-garden', 'The Garden', '$28.99'],
  ['limited-5', 'Bake and Bloom Collection *LIMITED EDITION*', '$12.99'], ['wooden-box', 'Wooden Box', '$3.99'],
  ['subscription-5', 'Refill Subscription, 5 a Month', '$7.99 a month'], ['subscription-10', 'Refill Subscription, 10 a Month', '$12.99 a month'],
]
const FIVE = ['Citrus Grove', 'Lavender', 'Vanilla', 'Linen', 'Wildflowers']
const BTN = 'https://portal.veinternational.org/buybuttons/us0111040/btn/'
const VE = {
  'the-vine': BTN + 'the-vine-citrus-grove-11011/', 'the-dandelion': BTN + 'the-dandelion-citrus-grove-12011/',   // the scent shown first
  'the-releaf': BTN + 'the-releaf-2020202/', 'the-bloom': BTN + 'the-bloom-vent-clip-13012/', 'the-garden': BTN + 'the-garden-4040404/',
  'limited-5': BTN + 'limited-edition-seed-pack-14011/', 'subscription-5': BTN + 'refill-subscription-5-a-month-90234/', 'subscription-10': BTN + 'refill-subscription-10-a-month-95821/',
}
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
      ve: Object.fromEntries([...document.querySelectorAll('.shop-card a.buy-ve')].map(a => [a.closest('[data-item-card]').dataset.itemCard, a.getAttribute('href')])),
      veSafe: [...document.querySelectorAll('.shop-card a.buy-ve')].every(a => a.target === '_blank' && /noopener/.test(a.rel) && a.textContent.trim() === 'Buy on the VE marketplace ·'),
      veNoBag: [...document.querySelectorAll('.shop-card a.buy-ve')].every(a => { const c = a.closest('.shop-card'); return !c.querySelector('.add-to-bag') && !c.querySelector('.qty-num') }),
      bagCards: [...document.querySelectorAll('.shop-card .add-to-bag')].map(b => b.dataset.item),
      text: document.body.innerText, html: document.documentElement.outerHTML,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tap: Math.min(...[...document.querySelectorAll('.item-choice, .shop-card .add-to-bag, .shop-card a.buy-ve')].map(e => e.getBoundingClientRect().height)),
    }))
    check(`[${label}] nine products, with the names and prices from the product document`, JSON.stringify(d.cards) === JSON.stringify(WANT), JSON.stringify(d.cards))
    check(`[${label}] no placeholder chips, every card has its photo and what is inside`, d.chips === 0 && d.photos.shown === 9 && d.photos.labels === 0 && d.inside, JSON.stringify(d.photos))
    check(`[${label}] eight products link to their buy buttons on the VE marketplace`, JSON.stringify(d.ve) === JSON.stringify(VE), JSON.stringify(d.ve))
    check(`[${label}] those buttons open a new tab, say where they go, and replace the bag controls`, d.veSafe && d.veNoBag)
    check(`[${label}] the Wooden Box still goes in the bag`, d.bagCards.join() === 'wooden-box', d.bagCards.join())
    check(`[${label}] The Vine, The Dandelion and The Releaf pick one of the five signature scents; The Bloom and the Wooden Box pick hanging or vent clip`, JSON.stringify(d.picks) === JSON.stringify({ 'the-vine': FIVE, 'the-dandelion': FIVE, 'the-releaf': FIVE, 'the-bloom': ['Vent clip', 'Hanging'], 'wooden-box': ['Hanging', 'Vent clip'] }), JSON.stringify(d.picks))
    check(`[${label}] no dashes, and never the retired words`, !/[–—]/.test(d.html) && !/plant me|earthscents/i.test(d.html), '')
    check(`[${label}] recycled cardboard boxes are mentioned`, /recycled cardboard box/i.test(d.text))
    check(`[${label}] no sideways scroll`, d.overflow <= 0, `${d.overflow}px`)
    if (label === 'phone') check('[phone] pickers and buttons are at least 44px', d.tap >= 44, `${d.tap}px`)

    // each scent of The Vine and The Dandelion has its own buy button on the marketplace
    const SLUG = { 'Citrus Grove': 'citrus-grove', Lavender: 'lavender', Vanilla: 'vanilla', Linen: 'linen', Wildflowers: 'wildflowers' }
    const got = {}, want = {}
    for (const [id, base] of [['the-vine', 11010], ['the-dandelion', 12010]]) {
      for (const [i, sc] of FIVE.entries()) {
        await page.selectOption(`[data-item-card="${id}"] .item-choice`, sc)
        got[`${id} ${sc}`] = await page.getAttribute(`[data-item-card="${id}"] a.buy-ve`, 'href')
        want[`${id} ${sc}`] = `${BTN}${id}-${SLUG[sc]}-${base + i + 1}/`
      }
    }
    check(`[${label}] picking a scent on The Vine or The Dandelion points the button at that scent's buy button`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got).slice(0, 300))

    // The Bloom has a buy button for each edition
    await page.selectOption('[data-item-card="the-bloom"] .item-choice', 'Hanging')
    const bloomHang = await page.getAttribute('[data-item-card="the-bloom"] a.buy-ve', 'href')
    await page.selectOption('[data-item-card="the-bloom"] .item-choice', 'Vent clip')
    const bloomVent = await page.getAttribute('[data-item-card="the-bloom"] a.buy-ve', 'href')
    check(`[${label}] The Bloom's button follows hanging or vent clip`, bloomHang === BTN + 'the-bloom-hanging-13011/' && bloomVent === BTN + 'the-bloom-vent-clip-13012/', `${bloomHang} | ${bloomVent}`)

    await page.evaluate(() => window.__dbg.bagClear())
    await page.selectOption('[data-item-card="wooden-box"] .item-choice', 'Vent clip'); await sleep(600)
    const boxImg = await page.getAttribute('[data-item-card="wooden-box"] img.slot', 'src')
    check(`[${label}] picking Vent clip on the Wooden Box shows the vent clip photo`, boxImg === 'images/product-vent-studio.jpg', boxImg)
    await page.locator('[data-item-card="wooden-box"] .add-to-bag').click()
    await page.selectOption('[data-item-card="wooden-box"] .item-choice', 'Hanging')
    await page.locator('[data-item-card="wooden-box"] .add-to-bag').click()
    await page.selectOption('[data-item-card="wooden-box"] .item-choice', 'Vent clip')
    await page.locator('[data-item-card="wooden-box"] .add-to-bag').click()
    const b = await page.evaluate(() => window.__dbg.bag())
    check(`[${label}] the bag keeps each choice as its own line and merges repeats`, JSON.stringify(b.lines) === JSON.stringify([{ item: 'wooden-box', option: 'Vent clip', qty: 2 }, { item: 'wooden-box', option: 'Hanging', qty: 1 }]), JSON.stringify(b.lines))
    const total = 3 * 3.99
    check(`[${label}] the total is the sum of the prices`, Math.abs(b.total - total) < 0.005, `${b.total} vs ${total.toFixed(2)}`)
    await page.locator('#bag-toggle').click(); await sleep(800)
    const dr = await page.evaluate(() => ({ text: document.getElementById('bag-lines').innerText.replace(/\s+/g, ' '), tierShown: !document.getElementById('bag-tier').parentElement.hidden, note: !!document.querySelector('.bag-note:not([hidden])'), total: document.getElementById('bag-total').textContent }))
    check(`[${label}] drawer lines show the choice and the price`, /Wooden Box VENT CLIP · \$3\.99 EACH \$7\.98/i.test(dr.text) && /Wooden Box HANGING · \$3\.99 EACH \$3\.99/i.test(dr.text), dr.text.slice(0, 260))
    check(`[${label}] no bulk tier row or note, since every product has its own price`, !dr.tierShown && !dr.note && dr.total === '$11.97', JSON.stringify({ t: dr.tierShown, n: dr.note, total: dr.total }))
    check(`[${label}] no console errors, nothing fetched from another host`, !errs.length && !ext.length, [...errs, ...ext].join(' | ').slice(0, 200))

    if (label === 'desktop') {
      const co = await ctx.newPage()
      await co.goto(url('checkout.html'), { waitUntil: 'load' }); await co.waitForFunction(() => window.__dbg && window.__dbg.bag)
      await co.fill('#co-firm', 'Test Firm'); await co.fill('#co-name', 'Test Person'); await co.fill('#co-email', 'test@example.com')
      await co.route('mailto:*', r => r.abort()).catch(() => {})
      await co.locator('#co-final button[type="submit"]').first().click().catch(() => {}); await sleep(600)
      const order = await co.evaluate(() => document.getElementById('co-order').textContent)
      check('[checkout] the written order lists each product, its choice and price, with no tier lines', order.includes('2 x Wooden Box, Vent clip, $3.99 each') && order.includes('1 x Wooden Box, Hanging, $3.99 each') && order.includes('Total: $11.97') && !/Tier:/.test(order), order.replace(/\n/g, ' / ').slice(0, 420))
      await co.close()

      // the home page: named scents; a scent card sells The Releaf, which is on the VE marketplace
      const home = await ctx.newPage(); const herrs = []
      home.on('pageerror', e => herrs.push(e.message))
      await home.goto(url('index.html'), { waitUntil: 'load' }); await home.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 20000 })
      await home.evaluate(() => { window.__dbg.bagClear(); window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t, f]); return null } })
      await home.waitForFunction(() => document.querySelectorAll("#labels .chip").length >= 5, null, { timeout: 30000 }).catch(() => {})   // the labels arrive with the 3D scene
      const h = await home.evaluate(() => ({
        names: [...document.querySelectorAll('#scent-cards .card-title')].map(e => e.textContent.trim()),
        links: [...document.querySelectorAll('#scent-cards .card a.shop-scent')].map(x => x.getAttribute('href') + ' ' + x.textContent.trim()),
        adds: document.querySelectorAll('#scent-cards .add-to-bag').length,
        hangs: document.querySelectorAll('.hang-row .hang').length,
        chips: [...document.querySelectorAll('#labels .chip')].map(c => c.textContent.trim()),
        title: document.querySelector('#scents h2').textContent.trim().replace(/\s+/g, ' '),
        holder: [...document.querySelectorAll('#spec th')].find(t => t.textContent.trim() === 'Holder').nextElementSibling.textContent.trim(),
        firms: !!document.getElementById('firms'),
      }))
      check('[home] the five signature scents, each card a link to the shop', h.names.join() === FIVE.join() && h.links.length === 5 && h.links.every(l => l === 'shop.html Shop this scent ·') && h.adds === 0, JSON.stringify(h.names) + ' ' + h.links[0])
      check('[home] five pendants hang in the scents chapter, labelled with the scents', h.hangs === 5 && FIVE.every((n, i) => (h.chips[i] || '').endsWith(n)) && /^Five scents\./.test(h.title), JSON.stringify(h.chips) + ' ' + h.title)
      check('[home] the spec sheet calls the holder a reusable wooden box', /^A reusable wooden box\. Seed paper refills slide in\./.test(h.holder), h.holder)
      // a click anywhere on a card (here its title) opens the shop; the format picker still works on the card
      await home.locator('#scent-cards .card[data-scent="3"] input[value="vent"]').check()
      const stayed = home.url()
      await home.locator('#scent-cards .card[data-scent="3"] .card-title').click()
      await home.waitForURL(/shop\.html/, { timeout: 8000 }).catch(() => {})
      check('[home] picking a format stays on the page; clicking the card opens the shop', /index\.html/.test(stayed) && /shop\.html/.test(home.url()), home.url())
      check('[home] the wholesale section is off the home page, and nothing links to the hidden wholesale page', !h.firms && !(await home.evaluate(() => document.querySelector('a[href*="wholesale"]'))))
      check('[home] no page errors', !herrs.length, herrs.join(' | '))
      await home.close()
    }
    await ctx.close()
  }
} finally { await browser.close() }
console.log(`\n${passes} passed, ${fails} failed`)
console.log(fails ? 'PRODUCT CHECKS FAILED' : 'All product checks passed')
process.exit(fails ? 1 : 0)
