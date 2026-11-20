/* The five hanging scents on the home page: a click on a pendant or on the name under it opens
   the shop with that scent picked; dragging a pendant still only swings it.
   Run: cd tools/playwright && node check-hang.mjs   (SITE_BASE=https://seedscent.com/ for the live site) */
import { chromium } from 'playwright'
const BASE = (process.env.SITE_BASE || 'http://127.0.0.1:3001/').replace(/\/?$/, '/')
let fails = 0, passes = 0
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const NAMES = ['Citrus Grove', 'Lavender', 'Vanilla', 'Linen', 'Wildflowers']

async function open(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}index.html?bust=${Date.now()}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state().hasScene, null, { timeout: 30000 })
  await page.evaluate(() => { const ch = window.__dbg.chapters().find(x => x.name === 'scents'); window.__dbg.scrollTo(ch.start + 0.75 * (ch.end - ch.start)) })
  await sleep(2500)
  return page
}
// where each chip is, and the middle of the disc above it
const spots = page => page.evaluate(() => [...document.querySelectorAll('#labels .chip')].map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, href: el.getAttribute('href'), text: el.textContent, opacity: +el.style.opacity, pe: el.style.pointerEvents, x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top } }))
const shopScent = page => page.evaluate(() => ({ path: location.pathname.split('/').pop(), scent: new URLSearchParams(location.search).get('scent'), hash: location.hash, picked: window.__shop && window.__shop.ready ? document.querySelector('[data-item-card="the-vine"] .item-choice').value : null }))

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let page = await open(ctx)
  let s = await spots(page)
  check('[hang] five name labels, each a link to its scent in the shop', s.length === 5 && s.every((c, i) => c.tag === 'A' && c.href === `shop.html?scent=${encodeURIComponent(NAMES[i])}#products` && c.opacity > 0.9 && c.pe === 'auto'), JSON.stringify(s.map(c => [c.tag, c.href, c.opacity, c.pe])))

  // a drag swings the pendant and goes nowhere
  const d = s[2], discY = d.top - 120
  await page.mouse.move(d.x, discY); await sleep(200)
  check('[hang] the cursor over a scent pendant is a pointing hand', await page.evaluate(() => document.body.style.cursor) === 'pointer')
  const px = () => page.evaluate(() => window.__dbg.hangers().find(h => h.name === 'scent-2').pos.x)
  // the cursor nudges a pendant as it arrives, so press only once the pendant has settled under it
  let x0 = 0, x1 = 0
  for (let attempt = 0; attempt < 4 && x1 - x0 <= 0.5; attempt++) {
    await page.mouse.move(d.x - 200, discY + 200); await sleep(1200)
    await page.mouse.move(d.x, discY, { steps: 6 }); await sleep(700)
    if (await page.evaluate(() => document.body.style.cursor) !== 'pointer') continue
    x0 = await page.evaluate(() => window.__dbg.hangers().find(h => h.name === 'scent-2').target.x)   // where it hangs at rest
    await page.mouse.down(); await page.mouse.move(d.x + 160, discY + 20, { steps: 12 })
    x1 = x0
    for (let i = 0; i < 10 && x1 - x0 <= 0.5; i++) { await sleep(120); x1 = await px() }
    await page.mouse.up(); await sleep(700)
  }
  check('[hang] dragging a pendant still only swings it', (await shopScent(page)).path === 'index.html' && x1 - x0 > 0.5, `moved ${(x1 - x0).toFixed(2)}`)
  await sleep(1800)

  // a click on the name
  s = await spots(page)
  await page.mouse.click(s[1].x, s[1].y)
  await page.waitForURL(/shop\.html/, { timeout: 8000 }).catch(() => {}); await page.waitForFunction(() => window.__shop && window.__shop.ready, null, { timeout: 8000 }).catch(() => {})
  let at = await shopScent(page)
  check('[hang] a click on the name opens the shop with that scent picked', at.path === 'shop.html' && at.scent === 'Lavender' && at.hash === '#products' && at.picked === 'Lavender', JSON.stringify(at))
  await page.close()

  // a click on the air freshener itself
  page = await open(ctx)
  s = await spots(page)
  await page.mouse.move(s[4].x, s[4].top - 120); await sleep(150)
  await page.mouse.down(); await sleep(60); await page.mouse.up()
  await page.waitForURL(/shop\.html/, { timeout: 8000 }).catch(() => {}); await page.waitForFunction(() => window.__shop && window.__shop.ready, null, { timeout: 8000 }).catch(() => {})
  at = await shopScent(page)
  check('[hang] a click on the air freshener opens the shop with that scent picked', at.path === 'shop.html' && at.scent === 'Wildflowers' && at.picked === 'Wildflowers', JSON.stringify(at))
  await page.close()

  // the hero pendant is not a link
  page = await ctx.newPage()
  await page.goto(`${BASE}index.html?bust=${Date.now()}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state().hasScene, null, { timeout: 30000 }); await sleep(2500)
  const hp = await page.evaluate(() => { const h = window.__dbg.hangers().find(h => h.name === 'hero'); return h && h.pos })
  let tapped = null
  await page.exposeFunction('__tapped', n => { tapped = n })
  await page.evaluate(() => addEventListener('pendant:tap', e => window.__tapped(e.detail.name)))
  // find it on screen by sweeping for the grab cursor
  let found = null
  for (let y = 200; y < 700 && !found; y += 30) for (let x = 700; x < 1300; x += 30) { await page.mouse.move(x, y); if (await page.evaluate(() => document.body.style.cursor) === 'grab') { found = { x, y }; break } }
  if (found) { await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(600) }
  check('[hang] a click on the hero pendant stays on the home page', !!found && tapped === 'hero' && (await shopScent(page)).path === 'index.html', JSON.stringify({ found, tapped, hp: !!hp }))
  await page.close()

  // phone: a tap
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page = await open(mob)
  s = await spots(page)
  check('[hang phone] the five labels are links and in view', s.length === 5 && s.every(c => c.tag === 'A' && c.opacity > 0.9 && c.x > 0 && c.x < 390), JSON.stringify(s.map(c => [Math.round(c.x), Math.round(c.y), c.opacity])))
  await page.touchscreen.tap(s[0].x, s[0].y)
  await page.waitForURL(/shop\.html/, { timeout: 8000 }).catch(() => {})
  at = await shopScent(page)
  check('[hang phone] a tap on the name opens the shop on that scent', at.path === 'shop.html' && at.scent === 'Citrus Grove', JSON.stringify(at))
  await mob.close()
} finally { await browser.close() }
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
