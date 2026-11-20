/* Rubric check: what the National E-Commerce Website Competition scoring guide asks for.
   Essential components on every page (firm name, description, contact, the VE educational
   disclaimer, products and prices, buy buttons), no unfinished placeholders, branding, social
   and contact links, the interactive pieces (scent quiz, upselling), the team page, and the
   files search engines read. Uses the real js/config.js.
   Run: cd tools/playwright && node check-rubric.mjs   (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
const BASE = (process.env.SITE_BASE || 'http://127.0.0.1:3001/').replace(/\/?$/, '/')
const url = p => `${BASE}${p}${p.includes('?') ? '&' : '?'}bust=${Date.now()}`
let fails = 0, passes = 0
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DISCLAIMER = 'Disclaimer: This Virtual Enterprise online store is for educational purposes only (2026-2027 - Seed Scent).'
const PAGES = ['index.html', 'shop.html', 'scent-breakdown.html', 'planting-guide.html', 'team.html']

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  for (const pg of PAGES) {
    const page = await ctx.newPage(); const errs = []
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); page.on('pageerror', e => errs.push(e.message))
    await page.goto(url(pg), { waitUntil: 'load' }); await sleep(pg === 'index.html' ? 4500 : 1800)
    const d = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0 && !e.closest('#bag')
      return {
        text: document.body.innerText.replace(/\s+/g, ' '),
        chips: [...document.querySelectorAll('.ph')].filter(vis).map(e => e.textContent.trim()),
        photoGaps: [...document.querySelectorAll('.slot-label')].filter(vis).length,
        tbc: [...document.querySelectorAll('.tbc')].filter(vis).length,
        brand: !!document.querySelector('.nav .brand-mark') && /Seed Scent/.test(document.querySelector('.nav .brand').textContent),
        insta: [...document.querySelectorAll('.site-links a')].map(a => a.href).find(h => /instagram\.com\/seed\.scent\.ve/.test(h)) || null,
        mail: [...document.querySelectorAll('.site-links a')].map(a => a.getAttribute('href')).find(h => /^mailto:seedscent\.ny@gmail\.com$/.test(h)) || null,
        tabs: [...document.querySelectorAll('.nav-links a')].map(a => a.textContent.trim()),
        desc: (document.querySelector('meta[name=description]') || {}).content || '',
        og: document.querySelectorAll('meta[property^="og:"]').length,
        dashes: /[–—]/.test(document.documentElement.outerHTML),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    check(`[${pg}] the VE educational disclaimer, word for word`, d.text.includes(DISCLAIMER))
    check(`[${pg}] firm name and logo in the header`, d.brand)
    check(`[${pg}] Instagram and the firm's email in the footer`, !!d.insta && !!d.mail, `${d.insta} ${d.mail}`)
    check(`[${pg}] nothing unfinished on screen: no placeholder chips, photo gaps or tbc tags`, d.chips.length === 0 && d.photoGaps === 0 && d.tbc === 0, JSON.stringify({ chips: d.chips, gaps: d.photoGaps, tbc: d.tbc }))
    check(`[${pg}] the same eight tabs in the menu`, d.tabs.join('|') === 'How it works|Scents|Scent Breakdown|Inside|Shop|Planting|Team|Contact', d.tabs.join('|'))
    check(`[${pg}] a description and link-preview tags for search and sharing`, d.desc.length > 50 && d.og >= 5, `${d.desc.length} chars, ${d.og} og tags`)
    check(`[${pg}] no dashes, no sideways scroll, no console errors`, !d.dashes && d.overflow <= 0 && !errs.length, `${d.overflow}px ${errs.join(' | ').slice(0, 160)}`)
    if (pg === 'index.html') {
      check('[home] company description, slogan and contact details', /our mission is to redefine everyday freshness/i.test(d.text) && /from scent to sprout/i.test(d.text) && /seedscent\.ny@gmail\.com/.test(d.text) && /Syosset Senior High School/.test(d.text))
      check('[home] the scent lasts about a month, in the story and the spec sheet', (d.text.match(/about a month/gi) || []).length >= 2)
      // the scent profiles on the five cards
      const sp = await page.evaluate(() => [...document.querySelectorAll('#scent-cards .card')].map(c => ({ notes: c.querySelector('.card-notes').textContent.trim(), rows: [...c.querySelectorAll('.blend li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()), bar: [...c.querySelectorAll('.blend-bar i')].map(i => i.style.flexGrow).join('/') })))
      check('[home] every scent card says what it smells like and shows its three oil blend', sp.length === 5 && sp.every(s => s.notes.length > 30 && s.rows.length === 3 && s.bar === '60/25/15') && sp[0].rows.join(', ') === '60% Lemon, 25% Orange, 15% Grapefruit' && /laundry/.test(sp[3].notes), JSON.stringify(sp[0]))
      // the quiz, start to finish
      await page.evaluate(() => document.getElementById('scent-quiz').scrollIntoView({ block: 'center' })); await sleep(1500)
      const q0 = await page.evaluate(() => ({ shown: !document.getElementById('scent-quiz').hidden, n: document.querySelectorAll('.quiz-answer').length, ask: document.querySelector('.quiz-ask').textContent }))
      check('[home] Find your scent shows its first question with five answers', q0.shown && q0.n === 5 && q0.ask === 'How should the drive feel?', JSON.stringify(q0))
      for (const label of ['Calm and quiet', 'A field of lavender', 'Purple']) { await page.locator('.quiz-answer', { hasText: label }).click(); await sleep(150) }
      const q1 = await page.evaluate(() => ({ result: window.__quiz.result(), head: document.querySelector('.quiz-result').textContent, href: document.querySelector('.quiz-stage a.pill').getAttribute('href'), focus: document.activeElement.className }))
      check('[home] three answers give a scent and a link to the shop with that scent picked', q1.result === 'Lavender' && q1.head === 'Lavender.' && q1.href === 'shop.html?scent=Lavender#products' && /quiz-ask/.test(q1.focus), JSON.stringify(q1))
      check('[home] the quiz result says what the scent smells like', await page.evaluate(() => /^Soft lavender with calming floral/.test((document.querySelector('.quiz-notes') || {}).textContent || '')))
      await page.locator('[data-again]').click(); await sleep(150)
      check('[home] Start again goes back to the first question', await page.evaluate(() => window.__quiz.step() === 0))
    }
    if (pg === 'shop.html') {
      const s = await page.evaluate(() => ({
        cards: document.querySelectorAll('.shop-card').length,
        priced: [...document.querySelectorAll('.shop-card .price')].every(e => /^\$\d+\.\d\d$/.test(e.textContent.trim())),
        buy: [...document.querySelectorAll('.shop-card')].every(c => { const a = c.querySelector('a.buy-ve'); return a && /^https:\/\/portal\.veinternational\.org\/buybuttons\/us0111040\/btn\/[a-z0-9-]+\/$/.test(a.href) }),
        goes: [...document.querySelectorAll('.goes-with')].map(g => g.closest('.shop-card').dataset.itemCard + '>' + g.querySelector('a').getAttribute('href')),
        targets: [...document.querySelectorAll('.goes-with a')].every(a => document.querySelector(a.getAttribute('href'))),
      }))
      check('[shop] nine products, each with a price and a working VE buy button link', s.cards === 9 && s.priced && s.buy, JSON.stringify({ c: s.cards, p: s.priced, b: s.buy }))
      const pr = await page.evaluate(() => { const c = document.querySelector('[data-item-card="the-vine"]'), sel = c.querySelector('.item-choice'), a = c.querySelector('.scent-profile').textContent; sel.value = 'Vanilla'; sel.dispatchEvent(new Event('change', { bubbles: true })); return { a, b: c.querySelector('.scent-profile').textContent, n: document.querySelectorAll('.scent-profile').length, bloom: !!document.querySelector('[data-item-card="the-bloom"] .scent-profile') } })
      check('[shop] the three scent pickers show the picked scent\'s profile, and it follows the pick', pr.n === 3 && !pr.bloom && /^Cool citrus blend.*About 60% lemon, 25% orange, 15% grapefruit\.$/.test(pr.a) && /creamy vanilla.*About 60% vanilla, 25% benzoin, 15% tonka bean\.$/.test(pr.b), JSON.stringify(pr))
      const le = await page.evaluate(() => { const c = document.querySelector('[data-item-card="limited-5"]'); return { notes: c.querySelector('.card-notes').textContent.trim(), inside: [...c.querySelectorAll('.item-inside li')].map(l => l.textContent.trim().split(':')[0]), img: c.querySelector('img.slot').getAttribute('src'), ok: c.querySelector('img.slot').naturalWidth > 600 } })
      check('[shop] Bake and Bloom: a description, its five scents with their profiles, and its own photo', /Five bakery scents/.test(le.notes) && le.inside.join('|') === 'Chocolate Chip Cookie|Brownie|Cake Batter|Cinnamon|Cupcake' && /bake-and-bloom/.test(le.img) && le.ok, JSON.stringify(le))
      check('[shop] upselling: cards suggest a product that goes well, linking to its card', s.goes.length === 6 && s.targets && s.goes.includes('the-vine>#p-the-releaf'), s.goes.join(' '))
    }
    if (pg === 'scent-breakdown.html') {
      const b = await page.evaluate(() => {
        const cards = id => [...document.querySelectorAll(`#${id} .scent-card`)].map(c => ({ name: c.querySelector('.card-title').textContent.trim(), notes: (c.querySelector('.card-notes') || {}).textContent || '', rows: [...c.querySelectorAll('.blend-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), about: [...c.querySelectorAll('.blend-about')].map(r => r.textContent.trim()), btn: c.querySelector('a.scent-shop').textContent.replace(/[\s·]+$/, '').trim(), href: c.querySelector('a.scent-shop').getAttribute('href'), img: (() => { const i = c.querySelector('img'); return !!i && i.complete && i.naturalWidth > 100 })() }))
        return { sig: cards('signature-grid'), bake: cards('bake-grid'), active: (document.querySelector('.nav-links a[aria-current="page"]') || {}).textContent, text: document.body.innerText }
      })
      check('[breakdown] its tab is the current one', b.active === 'Scent Breakdown')
      check('[breakdown] five signature scents, each with a photo, a description, three notes in depth and a button to that scent in the shop', b.sig.length === 5 && b.sig.every(s => s.img && s.notes.length > 30 && s.rows.length === 3 && s.about.length === 3 && s.about.every(a => a.length > 40) && s.btn === 'Shop this scent' && s.href === `shop.html?scent=${encodeURIComponent(s.name)}#products`) && b.sig[0].rows[0] === '60% Lemon' && /^Bright lemon top\. A bold, zesty burst/.test(b.sig[0].about[0]), JSON.stringify(b.sig[0]))
      check('[breakdown] the five Bake and Bloom scents, each with a button to the bundle', b.bake.map(s => s.name).join('|') === 'Chocolate Chip Cookie|Brownie|Cake Batter|Cinnamon|Cupcake' && b.bake.every(s => s.img && s.notes.length > 30 && s.btn === 'Shop the bundle' && s.href === 'shop.html#p-limited-5') && b.bake[0].rows.join(', ') === '40% Vanilla, 40% Chocolate, 20% Benzoin' && b.bake[3].rows.length === 0, JSON.stringify(b.bake.map(s => [s.name, s.rows.length, s.btn])))
      check('[breakdown] supplier names stay off the page', !/Eden Botanicals|Nature.s Flavors|apothecary/i.test(b.text))
    }
    if (pg === 'team.html') {
      const t = await page.evaluate(() => ({ cards: document.querySelectorAll('.team-card').length, depts: [...document.querySelectorAll('.team-dept')].map(e => e.textContent.trim()), photos: document.querySelectorAll('.team-card img.slot:not([hidden])').length, initials: [...document.querySelectorAll('.team-initials')].map(e => e.textContent.trim()), first: document.querySelector('.team-card .card-title').textContent.trim() + ', ' + document.querySelector('.team-card .team-role').textContent.trim(), alts: [...document.querySelectorAll('.team-card img.slot')].every(i => i.alt.length > 3) }))
      check('[team] 24 people under five departments, 23 photos with names as alt text, initials for the one without', t.cards === 24 && t.depts.join('|') === 'Executive|Finance|Marketing|Human Resources|Sales' && t.photos === 23 && t.initials.join() === 'JC' && t.alts && t.first === 'Jack Monteforte, CEO', JSON.stringify(t))
    }
    await page.close()
  }

  // a scent picked on the home page or in the quiz arrives picked on the shop
  const shop = await ctx.newPage()
  await shop.goto(url('shop.html?scent=Vanilla'), { waitUntil: 'load' }); await shop.waitForFunction(() => window.__shop && window.__shop.ready); await sleep(800)
  const v = await shop.evaluate(() => ['the-vine', 'the-dandelion', 'the-releaf'].map(id => { const c = document.querySelector(`[data-item-card="${id}"]`); return c.querySelector('.item-choice').value + ' ' + c.querySelector('a.buy-ve').href.replace(/^.*btn\//, '') }))
  check('[shop] shop.html?scent=Vanilla opens with Vanilla picked and its buy buttons', v.join(' | ') === 'Vanilla the-vine-vanilla-11013/ | Vanilla the-dandelion-vanilla-12013/ | Vanilla the-releaf-vanilla-16013/', v.join(' | '))
  await shop.close()
  // the bundle button on the Scent Breakdown page lands on the bundle's card
  const bun = await ctx.newPage()
  await bun.goto(url('shop.html') + '#p-limited-5', { waitUntil: 'load' }); await bun.waitForFunction(() => window.__shop && window.__shop.ready); await sleep(1500)
  const bt = await bun.evaluate(() => { const r = document.getElementById('p-limited-5').getBoundingClientRect(); return { top: Math.round(r.top), h: innerHeight } })
  check('[shop] shop.html#p-limited-5 opens on the Bake and Bloom card', bt.top > -50 && bt.top < bt.h * 0.6, JSON.stringify(bt))
  await bun.close()

  // phone: the new pieces fit
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  for (const pg of PAGES) {
    const page = await mob.newPage(); await page.goto(url(pg), { waitUntil: 'load' }); await sleep(pg === 'index.html' ? 3500 : 1500)
    const o = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, disclaimer: (() => { const e = document.querySelector('.disclaimer'); const r = e.getBoundingClientRect(); return r.width > 200 && r.right <= innerWidth })() }))
    check(`[phone ${pg}] no sideways scroll and the disclaimer fits`, o.overflow <= 0 && o.disclaimer, JSON.stringify(o))
    await page.close()
  }

  for (const [f, re] of [['robots.txt', /Sitemap: https:\/\/seedscent\.com\/sitemap\.xml/], ['sitemap.xml', /<loc>https:\/\/seedscent\.com\/shop\.html<\/loc>/]]) {
    const r = await ctx.request.get(BASE + f)
    check(`[search] ${f} is served`, r.status() === 200 && re.test(await r.text()), String(r.status()))
  }
} finally { await browser.close() }
console.log(`\n${passes} passed, ${fails} failed`)
console.log(fails ? 'RUBRIC CHECKS FAILED' : 'All rubric checks passed')
process.exit(fails ? 1 : 0)
