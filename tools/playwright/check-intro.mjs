/* The startup animation on the home page (css/intro.css, js/intro.js): it plays, lifts by itself,
   can be skipped, plays once per visit, stays off under reduced motion, and leaves the page whole.
   Run: cd tools/playwright && node check-intro.mjs   (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
const BASE = (process.env.SITE_BASE || 'http://127.0.0.1:3001/').replace(/\/?$/, '/')
const url = q => `${BASE}index.html?${q ? q + '&' : ''}bust=${Date.now()}`
let fails = 0, passes = 0
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const look = page => page.evaluate(() => {
  const el = document.getElementById('intro')
  const r = el && el.getBoundingClientRect()
  return { there: !!el, covers: !!el && getComputedStyle(el).display !== 'none' && r.top <= 0 && r.bottom >= innerHeight && r.width >= innerWidth, on: document.documentElement.classList.contains('intro-on'), over: window.__intro.over }
})

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage(); const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); page.on('pageerror', e => errs.push(e.message))
  await page.goto(url('intro=1'), { waitUntil: 'domcontentloaded' }); await sleep(700)
  const a = await look(page)
  check('[intro] it covers the page when the home page opens', a.covers && a.on && !a.over, JSON.stringify(a))
  const art = await page.evaluate(() => ({
    running: document.getAnimations().filter(x => x.effect.target.closest('#intro')).length,
    pct: Number(document.getElementById('intro-pct').textContent), words: document.querySelectorAll('.intro-words').length,
    hidden: document.getElementById('intro').getAttribute('aria-hidden'),
    text: document.getElementById('intro').textContent,
    headline: getComputedStyle(document.querySelector('.hero-copy [data-split]')).visibility,
  }))
  check('[intro] the cartoon is animating, with a percentage counting up in place of the captions', art.running > 10 && art.words === 0 && art.pct > 5 && art.pct < 60, JSON.stringify({ running: art.running, pct: art.pct }))
  check('[intro] it is kept from screen readers, has no dashes, and the headline waits behind it', art.hidden === 'true' && !/[–—]/.test(art.text) && art.headline === 'hidden', JSON.stringify(art))
  await sleep(1300)
  const mid = await look(page), pct2 = await page.evaluate(() => Number(document.getElementById('intro-pct').textContent))
  check('[intro] still up at two seconds, the count further along', mid.covers && pct2 > art.pct && pct2 <= 100, JSON.stringify({ ...mid, pct2 }))
  await sleep(1900)
  const b = await look(page)
  const hero = await page.evaluate(() => ({ vis: getComputedStyle(document.querySelector('.hero-copy [data-split]')).visibility, lines: document.querySelectorAll('.hero-copy .split-line').length, seen: sessionStorage.getItem('seedscent.intro') }))
  check('[intro] it lifts by itself within four seconds and is removed', !b.there && !b.on && b.over, JSON.stringify(b))
  check('[intro] the headline reveal runs once it has lifted', hero.vis === 'visible' && hero.lines > 0, JSON.stringify(hero))
  await sleep(2500)
  const st = await page.evaluate(() => window.__dbg.state())
  check('[intro] the scene and pendant start after it', st.ready === true && st.frames > 30, JSON.stringify({ ready: st.ready, hasScene: st.hasScene }))
  check('[intro] no console errors', !errs.length, errs.join(' | ').slice(0, 200))

  // once per visit: the same tab, back on the home page, in an ordinary (not automated) browser
  check('[intro] it remembers that this visit has seen it', hero.seen === '1')
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
  await page.goto(url(''), { waitUntil: 'domcontentloaded' }); await sleep(400)
  const again = await look(page)
  check('[intro] it does not play a second time in the same visit', !again.on && again.over, JSON.stringify(again))
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(url(''), { waitUntil: 'domcontentloaded' }); await sleep(400)
  const fresh = await look(page)
  check('[intro] a new visit plays it without being asked', fresh.covers && fresh.on, JSON.stringify(fresh))

  // skipping
  await page.keyboard.press('Escape'); await sleep(900)
  check('[intro] any key ends it early', !(await look(page)).there)
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(url(''), { waitUntil: 'domcontentloaded' }); await sleep(500)
  await page.locator('.intro-skip').click(); await sleep(900)
  check('[intro] the Skip button ends it early', !(await look(page)).there)
  await page.close()

  // reduced motion: never
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const cp = await calm.newPage(); await cp.goto(url('intro=1'), { waitUntil: 'domcontentloaded' }); await sleep(400)
  const c = await look(cp)
  check('[intro] reduced motion: it does not play, even when asked', !c.on && !c.covers && c.over, JSON.stringify(c))
  await calm.close()

  // phone
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const mp = await mob.newPage(); await mp.goto(url('intro=1'), { waitUntil: 'domcontentloaded' }); await sleep(600)
  const m = await mp.evaluate(() => { const r = document.querySelector('.intro-art').getBoundingClientRect(), w = document.querySelector('.intro-pct').getBoundingClientRect(); return { covers: document.getElementById('intro').getBoundingClientRect().height >= innerHeight, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && w.bottom <= innerHeight, overflow: document.documentElement.scrollWidth - innerWidth } })
  check('[intro phone] the cartoon and the count fit the screen', m.covers && m.fits && m.overflow <= 0, JSON.stringify(m))
  await mp.locator('#intro').tap({ position: { x: 100, y: 200 } }); await sleep(900)
  check('[intro phone] a tap ends it early', !(await look(mp)).there)
  await mob.close()
} finally { await browser.close() }
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
