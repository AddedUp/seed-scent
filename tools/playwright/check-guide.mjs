/* Planting guide check: planting-guide.html word for word against the firm's printed guide
   (dashes turned into commas and full stops), the Planting tab on every page, the home page's
   short steps and sprout time taken from the guide, the phone layout of the care table,
   printing, reduced motion, copy rules, the console and outside requests.
   The home checks read the real js/config.js, because the steps come from the firm's guide.
   Run: cd tools/playwright && node check-guide.mjs     (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const TITLES = ['Unhook or unclip your wooden box', 'Open the wooden diffuser box', 'Lift out & refresh', 'Prepare your pot & soil', 'Lay & lightly cover the seed paper', 'Water, sunshine & patience']
const PHRASES = [
  'When your wooden car diffuser is ready for a fresh scent',
  'For the hanging edition, lift the cord off your rearview mirror; for the vent clip edition, gently pull it straight off the air vent.',
  'set the lid aside safely while you swap your insert',
  'by its edges so you don\'t tear the embedded seeds',
  'such as the Seed Scent terracotta pot from The Bloom or The Garden bundle',
  'leaving about half an inch of space below the rim',
  'about 1/8 inch, of loose soil over the paper',
  'never soggy, for the first 10 to 14 days while seeds germinate',
  '4 to 6+ hours of daily direct sunlight on a sunny windowsill or patio.',
  'Roots anchor naturally as the biodegradable paper breaks down in soil.',
  'The Releaf (our 3-pack custom scent refill)',
  'Seed Scent Refill Subscription',
]
const HOME_STEPS = [
  'Tear the paper into smaller pieces if your pot is small.',
  'Lay it flat on damp soil and cover it with about 1/8 inch of loose soil.',
  'Mist or water gently so it stays damp, never soggy, for the first 10 to 14 days.',
  'Give it a warm, sunny spot and watch for the first sprouts.',
]

async function open(browser, label, file, ctxOpts = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 }, ...ctxOpts })
  const page = await ctx.newPage()
  const log = { errors: [], external: [] }
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()) })
  page.on('pageerror', e => log.errors.push(e.message))
  page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).host !== HOST) log.external.push(r.url()) })
  await page.goto(url(file), { waitUntil: 'load' })
  return { ctx, page, log }
}
function quiet(label, log) {
  check(`[${label}] no console errors`, !log.errors.length, log.errors.join(' | ').slice(0, 300))
  check(`[${label}] nothing fetched from another host`, !log.external.length, log.external.join(' '))
}

const browser = await chromium.launch()
try {
  /* ---------- desktop ---------- */
  {
    const { ctx, page, log } = await open(browser, 'desktop', 'planting-guide.html')
    await page.waitForFunction(() => window.__guide && window.__guide.ready, null, { timeout: 10000 })
    const d = await page.evaluate(() => {
      const txt = el => (el ? el.textContent.trim().replace(/\s+/g, ' ') : null)
      return {
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]').getAttribute('href'),
        active: txt(document.querySelector('.nav-links a[aria-current="page"]')),
        tabs: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')),
        h1: txt(document.querySelector('h1')),
        parts: [...document.querySelectorAll('.guide-part-title')].map(txt),
        titles: [...document.querySelectorAll('.guide-steps h3')].map(txt),
        nums: [...document.querySelectorAll('.guide-steps .step-num')].map(txt),
        starts: [...document.querySelectorAll('.guide-steps')].map(o => o.start),
        rows: [...document.querySelectorAll('.care tbody th')].map(txt),
        head: [...document.querySelectorAll('.care thead th')].map(txt),
        text: document.body.innerText.replace(/\s+/g, ' '),
        dashes: document.documentElement.outerHTML.split('').filter(c => c === String.fromCharCode(8212) || c === String.fromCharCode(8211)).length,
        bag: txt(document.getElementById('bag-toggle')), bagHref: document.getElementById('bag-toggle').getAttribute('href'),
        overflow: document.documentElement.scrollWidth - innerWidth,
        footerChips: document.querySelectorAll('.footer .ph').length,
      }
    })
    check('[desktop] title and canonical', d.title === 'Seed Scent · Planting guide' && d.canonical === 'https://seedscent.com/planting-guide.html', d.title)
    check('[desktop] Planting is the active tab, 8 tabs, after Shop', d.active === 'Planting' && d.tabs.length === 8 && d.tabs[5] === 'planting-guide.html' && d.tabs[4] === 'shop.html', d.tabs.join(' '))
    check('[desktop] heading is the brand tagline', d.h1 === 'From scent to sprout.', String(d.h1))
    check('[desktop] two parts and the care table, as in the printed guide', d.parts.join('|') === 'Part 1 · Removing your seed paper|Part 2 · Planting your seed paper|Quick sprout care reference', d.parts.join('|'))
    check('[desktop] the six steps, in order, numbered 01 to 06', d.titles.join('|') === TITLES.join('|') && d.nums.join() === '01,02,03,04,05,06' && d.starts.join() === '1,4', `${d.titles.join('|')} / ${d.starts}`)
    check('[desktop] care table: watering, sunlight, soil depth, for the first 2 weeks and after sprouting', d.rows.join('|') === 'Watering|Sunlight|Soil depth' && d.head.join('|') === 'Care factor|First 2 weeks (germination)|After sprouting (growth)', `${d.rows} / ${d.head}`)
    const missing = PHRASES.filter(p => !d.text.includes(p))
    check('[desktop] the guide\'s own words are all there', !missing.length, missing.join(' || '))
    check('[desktop] no em or en dashes', d.dashes === 0, String(d.dashes))
    check('[desktop] Bag link goes to the shop', d.bagHref === 'shop.html' && d.bag === 'Bag (0)', d.bag)
    check('[desktop] school filled in the footer, no sideways scroll', d.footerChips === 0 && d.overflow <= 0, `${d.footerChips} chips, ${d.overflow}px`)

    // print: the button calls print, and the printed page drops the site around the guide
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++ } })
    await page.locator('#print-guide').click()
    check('[desktop] Print the guide opens the print dialog', await page.evaluate(() => window.__printed === 1))
    await page.emulateMedia({ media: 'print' })
    const pr = await page.evaluate(() => ({ hiddenSteps: [...document.querySelectorAll('.guide-steps li, .care, .guide-next')].filter(e => getComputedStyle(e).opacity !== '1').length, nav: getComputedStyle(document.querySelector('.nav')).display, actions: getComputedStyle(document.querySelector('.guide-hero .actions')).display, footer: getComputedStyle(document.querySelector('.team-foot')).display, steps: document.querySelectorAll('.guide-steps li').length }))
    check('[desktop] printed before scrolling, the nav, buttons and footer drop away and every step prints', pr.nav === 'none' && pr.actions === 'none' && pr.footer === 'none' && pr.steps === 6 && pr.hiddenSteps === 0, JSON.stringify(pr))
    await page.pdf({ path: path.join(OUT, 'guide-print.pdf'), format: 'Letter', printBackground: true }).catch(() => {})
    await page.emulateMedia({ media: 'screen' })

    // the skip link lands on Part 2
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
    await page.locator('a[href="#part-2"]').click(); await sleep(1600)
    const top = await page.evaluate(() => document.getElementById('part-2').getBoundingClientRect().top)
    check('[desktop] Skip to planting lands on Part 2, below the nav', top > 40 && top < 200, `${Math.round(top)}px`)
    for (let y = 0; y < 9000; y += 400) { await page.mouse.wheel(0, 400); await sleep(60) }
    await sleep(1200)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400)
    await page.screenshot({ path: path.join(OUT, 'guide-1440.png'), fullPage: true })
    quiet('desktop', log)
    await ctx.close()
  }

  /* ---------- phone ---------- */
  {
    const { ctx, page, log } = await open(browser, 'phone', 'planting-guide.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await page.waitForFunction(() => window.__guide && window.__guide.ready, null, { timeout: 10000 })
    const d = await page.evaluate(() => {
      const td = document.querySelector('.care td')
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tableW: document.querySelector('.care').getBoundingClientRect().width, vw: innerWidth,
        label: getComputedStyle(td, '::before').content, headHidden: document.querySelector('.care thead').getBoundingClientRect().height <= 1,
        menuShown: getComputedStyle(document.getElementById('menu-toggle')).display !== 'none',
      }
    })
    check('[phone] no sideways scroll, the care table fits the screen', d.overflow <= 0 && d.tableW <= d.vw, JSON.stringify(d))
    check('[phone] care table becomes labelled cards', d.label === '"First 2 weeks"' && d.headHidden, `${d.label} ${d.headHidden}`)
    await page.locator('#menu-toggle').tap(); await sleep(300)
    const tab = await page.evaluate(() => [...document.querySelectorAll('.nav-links a')].some(a => a.getAttribute('href') === 'planting-guide.html' && a.getBoundingClientRect().height > 0))
    check('[phone] the menu lists Planting', d.menuShown && tab)
    await page.locator('#menu-toggle').tap(); await sleep(200)
    for (let y = 0; y < 9000; y += 400) { await page.mouse.wheel(0, 400); await sleep(60) }
    await sleep(1200)
    await page.screenshot({ path: path.join(OUT, 'guide-390.png'), fullPage: true })
    quiet('phone', log)
    await ctx.close()
  }

  /* ---------- reduced motion ---------- */
  {
    const { ctx, page, log } = await open(browser, 'reduced', 'planting-guide.html', { reducedMotion: 'reduce' })
    await page.waitForFunction(() => window.__guide && window.__guide.ready, null, { timeout: 10000 })
    const r = await page.evaluate(() => ({ revealed: window.__guide.revealed(), total: window.__guide.revealTotal(), lenis: window.__guide.hasLenis, op: [...new Set([...document.querySelectorAll('.guide-steps li')].map(e => getComputedStyle(e).opacity))] }))
    check('[reduced] everything visible at once, no smooth scroll', r.revealed === r.total && r.total === 8 && r.op.join() === '1' && !r.lenis, JSON.stringify(r))
    quiet('reduced', log)
    await ctx.close()
  }

  /* ---------- the home page: steps from the guide, the link, the tab ---------- */
  {
    const { ctx, page, log } = await open(browser, 'home', 'index.html')
    await page.waitForFunction(() => window.__dbg && window.__dbg.bag, null, { timeout: 20000 })
    const h = await page.evaluate(() => {
      const txt = el => (el ? el.textContent.trim().replace(/\s+/g, ' ') : null)
      const after = [...document.querySelectorAll('#spec th')].find(th => th.textContent.trim() === 'After')
      const draft = document.querySelector('[data-tbc="product.plantingConfirmed"]')
      return {
        steps: [...document.querySelectorAll('#planting-steps li p')].map(txt),
        after: after && txt(after.nextElementSibling),
        draftHidden: !draft || draft.hidden || draft.getBoundingClientRect().height === 0,
        link: document.querySelector('.guide-link a') && document.querySelector('.guide-link a').getAttribute('href'),
        tab: !!document.querySelector('.nav-links a[href="planting-guide.html"]'),
      }
    })
    check('[home] the four short steps come from the guide', h.steps.join('|') === HOME_STEPS.join('|'), h.steps.join('|'))
    check('[home] spec sheet says first sprouts in 10 to 14 days', h.after === 'Plant it. First sprouts in 10 to 14 days', String(h.after))
    check('[home] the draft note above the steps is gone', h.draftHidden)
    check('[home] Read the full planting guide link and the Planting tab', h.link === 'planting-guide.html' && h.tab, JSON.stringify(h))
    quiet('home', log)
    await ctx.close()
  }

  /* ---------- the tab on the other pages ---------- */
  for (const pg of ['shop.html', 'team.html']) {
    const { ctx, page } = await open(browser, pg, pg)
    const ok = await page.evaluate(() => [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')).indexOf('planting-guide.html') === 5)
    check(`[${pg}] Planting tab after Shop`, ok)
    await ctx.close()
  }

  /* ---------- the fold point ---------- */
  for (const pg of ['index.html', 'shop.html', 'team.html', 'planting-guide.html']) {
    const { ctx, page } = await open(browser, pg, pg, { viewport: { width: 1221, height: 800 } })
    await sleep(pg === 'index.html' ? 2500 : 800)
    const r = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.nav-links')).display, gap: document.querySelector('.nav-actions').getBoundingClientRect().left - document.querySelector('.nav-links').getBoundingClientRect().right, lead: document.querySelector('.nav-links').getBoundingClientRect().left - document.querySelector('.nav .brand').getBoundingClientRect().right }))
    check(`[${pg} at 1221px] the eight tabs fit on one line`, r.shown === 'flex' && r.gap >= 20 && r.lead >= 20, JSON.stringify(r))
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(`\n${passes} passed, ${fails} failed`)
console.log(fails ? 'GUIDE CHECKS FAILED' : 'All guide checks passed')
process.exit(fails ? 1 : 0)
