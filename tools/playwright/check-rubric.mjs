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
const PAGES = ['index.html', 'shop.html', 'planting-guide.html', 'team.html']

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
        insta: [...document.querySelectorAll('.site-links a')].map(a => a.href).find(h => /instagram\.com\/seedscent\.ve/.test(h)) || null,
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
    check(`[${pg}] the same seven tabs in the menu`, d.tabs.join('|') === 'How it works|Scents|Inside|Shop|Planting|Team|Contact', d.tabs.join('|'))
    check(`[${pg}] a description and link-preview tags for search and sharing`, d.desc.length > 50 && d.og >= 5, `${d.desc.length} chars, ${d.og} og tags`)
    check(`[${pg}] no dashes, no sideways scroll, no console errors`, !d.dashes && d.overflow <= 0 && !errs.length, `${d.overflow}px ${errs.join(' | ').slice(0, 160)}`)
    if (pg === 'index.html') {
      check('[home] company description, slogan and contact details', /our mission is to redefine everyday freshness/i.test(d.text) && /from scent to sprout/i.test(d.text) && /seedscent\.ny@gmail\.com/.test(d.text) && /Syosset Senior High School/.test(d.text))
      check('[home] the scent lasts about a month, in the story and the spec sheet', (d.text.match(/about a month/gi) || []).length >= 2)
      // the quiz, start to finish
      await page.evaluate(() => document.getElementById('scent-quiz').scrollIntoView({ block: 'center' })); await sleep(1500)
      const q0 = await page.evaluate(() => ({ shown: !document.getElementById('scent-quiz').hidden, n: document.querySelectorAll('.quiz-answer').length, ask: document.querySelector('.quiz-ask').textContent }))
      check('[home] Find your scent shows its first question with five answers', q0.shown && q0.n === 5 && q0.ask === 'How should the drive feel?', JSON.stringify(q0))
      for (const label of ['Calm and quiet', 'A field of lavender', 'Purple']) { await page.locator('.quiz-answer', { hasText: label }).click(); await sleep(150) }
      const q1 = await page.evaluate(() => ({ result: window.__quiz.result(), head: document.querySelector('.quiz-result').textContent, href: document.querySelector('.quiz-stage a.pill').getAttribute('href'), focus: document.activeElement.className }))
      check('[home] three answers give a scent and a link to the shop with that scent picked', q1.result === 'Lavender' && q1.head === 'Lavender.' && q1.href === 'shop.html?scent=Lavender#products' && /quiz-ask/.test(q1.focus), JSON.stringify(q1))
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
      check('[shop] upselling: cards suggest a product that goes well, linking to its card', s.goes.length === 6 && s.targets && s.goes.includes('the-vine>#p-the-releaf'), s.goes.join(' '))
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
