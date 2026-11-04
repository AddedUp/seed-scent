// (7) Rapid navigation: nav links clicked in quick succession, jump to the end and back to the top
// (via the debug handle, native scrollTo, and End/Home keys); checks exceptions and that the hero
// pendant is hanging in place under its anchor within 2 s. Also measures where each anchor link
// lands relative to the fixed nav once Lenis settles.
import { chromium, base, out, bust, watch, sleep, READY } from './review-lib.mjs'

const L = 2.5, R = 1.35
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const { errors } = watch(page)
await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
await page.waitForFunction(READY, null, { timeout: 60000 })
await sleep(1500)

const heroCheck = () => {
  const s = __dbg.state()
  const h = s.hero
  if (!h) return { chapter: s.chapter, p: s.progress, hero: null }
  return { chapter: s.chapter, p: +s.progress.toFixed(4), dx: +(h.x - h.anchor.x).toFixed(3), hang: +(h.anchor.y - h.y).toFixed(3), speed: +Math.hypot(h.vx, h.vy).toFixed(3), rz: h.rz, anchor: h.anchor, nan: ![h.x, h.y, h.vx, h.vy].every(Number.isFinite), cardInset: document.getElementById('card-panel').style.inset, theme: s.theme, soil: s.soil, dataChapter: document.body.dataset.chapter }
}
// poll up to 2 s for "hanging in place": under the anchor, rope roughly its natural length, slow
async function waitHanging(label) {
  const t0 = Date.now()
  let last = null, okAt = null
  while (Date.now() - t0 < 2000) {
    last = await page.evaluate(heroCheck)
    const ok = last.hero !== null && !last.nan && Math.abs(last.dx) < 0.5 && Math.abs(last.hang - (L + R)) < 0.5 && last.speed < 2 && last.chapter === 'hero'
    if (ok && okAt === null) okAt = Date.now() - t0
    if (ok && Date.now() - t0 > 600) break
    await sleep(100)
  }
  console.log(label, '| hanging in place after ms:', okAt === null ? 'NOT within 2000' : okAt, '| final:', JSON.stringify(last))
  return okAt
}

/* 1. nav links in quick succession */
const links = ['drive', 'scents', 'inside', 'firms', 'finale']
for (const k of links) { await page.locator(`.nav-links a[data-nav="${k}"]`).click(); await sleep(120) }
await page.locator('.brand').click()
await sleep(120)
await page.locator('.nav-links a[data-nav="inside"]').click(); await sleep(100)
await page.locator('.brand').click()
const mid = await page.evaluate(heroCheck)
console.log('right after the click burst:', JSON.stringify(mid))
await waitHanging('after click burst -> brand (#hero)')
await page.screenshot({ path: out + 'rev-nav-after-burst.png' })

/* 2. jump to the end and back (debug handle, immediate) */
await page.evaluate(() => __dbg.scrollTo(1)); await sleep(400)
const atEnd = await page.evaluate(() => { const s = __dbg.state(); return { chapter: s.chapter, p: s.progress, finale: s.finale, hero: s.hero, hangers: __dbg.hangers().map(h => h.name + ':' + h.enabled) } })
console.log('at end:', JSON.stringify(atEnd))
await page.screenshot({ path: out + 'rev-nav-end.png' })
await page.evaluate(() => __dbg.scrollTo(0))
await waitHanging('end -> top (immediate)')
await page.screenshot({ path: out + 'rev-nav-top-after-jump.png' })

/* 3. native window.scrollTo (bypassing Lenis), then End/Home keys */
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(500)
const nativeEnd = await page.evaluate(() => ({ p: __dbg.state().progress, chapter: __dbg.state().chapter, scrollY: Math.round(scrollY) }))
await page.evaluate(() => window.scrollTo(0, 0))
await waitHanging('native scrollTo end -> 0')
console.log('native end state was:', JSON.stringify(nativeEnd))
await page.mouse.click(700, 500) // focus the page for key events (empty area)
await page.keyboard.press('End'); await sleep(900)
const keyEnd = await page.evaluate(() => ({ p: __dbg.state().progress, chapter: __dbg.state().chapter, scrollY: Math.round(scrollY) }))
await page.keyboard.press('Home')
await waitHanging('End key -> Home key')
console.log('End key state was:', JSON.stringify(keyEnd))

/* 4. rapid alternation while Lenis is mid-flight: drive, finale, hero, finale, hero */
for (const k of ['drive', 'finale']) { await page.locator(`.nav-links a[data-nav="${k}"]`).click(); await sleep(60) }
await page.locator('.brand').click(); await sleep(60)
await page.locator('.nav-links a[data-nav="finale"]').click(); await sleep(60)
await page.locator('.brand').click()
await waitHanging('mid-flight alternation -> brand')
const hangers = await page.evaluate(() => __dbg.hangers())
console.log('hangers after everything:', JSON.stringify(hangers))

/* 5. where does each anchor link land once Lenis settles? (heading vs the 76px fixed nav) */
console.log('\n=== anchor landing positions (after 2 s settle) ===')
for (const [k, sel] of [['drive', '.ch-drive .beat[data-beat="0"] .kicker'], ['scents', '.ch-scents h2'], ['inside', '.ch-inside h2'], ['firms', '.ch-firms h2'], ['finale', '.biz-card']]) {
  await page.locator(`.nav-links a[data-nav="${k}"]`).click(); await sleep(2100)
  const r = await page.evaluate(([sel]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return { top: Math.round(r.top), bottom: Math.round(r.bottom), opacity: +o.toFixed(2), chapter: __dbg.state().chapter, p: +__dbg.state().progress.toFixed(3), locals: __dbg.state().locals[__dbg.state().chapter] } }, [sel])
  console.log(k.padEnd(7), sel.padEnd(40), JSON.stringify(r), r.top < 76 && r.bottom > 0 ? '<-- under/at the fixed nav (76px)' : '')
  await page.screenshot({ path: out + `rev-nav-land-${k}.png` })
}
console.log('\nerrors:', JSON.stringify(errors))
await browser.close()
