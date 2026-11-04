// Follow-ups for the copy review: (A) team-page bag count with a shared storage
// context, (B) what the index page shows with JavaScript off (the noscript
// line claims "The text and order details still work without it").
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
const BASE = 'http://127.0.0.1:3001/'
const OUT = fileURLToPath(new URL('./out/', import.meta.url))
const bust = () => '?bust=' + Date.now()
const browser = await chromium.launch()

/* A: one context, so localStorage is shared between index and team */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(BASE + 'index.html' + bust())
  await page.waitForFunction(() => window.__dbg && __dbg.bagSet, null, { timeout: 30000 })
  await page.evaluate(() => __dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 3 }, { scentIndex: 1, format: 'vent', qty: 4 }]))
  console.log('index bag-count after bagSet(3+4):', await page.evaluate(() => document.getElementById('bag-count').textContent))
  await page.goto(BASE + 'team.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(600)
  console.log('team.html localStorage bag:', await page.evaluate(() => localStorage.getItem('seedscent.bag')))
  console.log('team.html Bag button text:', JSON.stringify(await page.evaluate(() => document.getElementById('bag-toggle').innerText)))
  await page.screenshot({ path: OUT + 'copy-team-bag-count.png', clip: { x: 900, y: 0, width: 540, height: 90 } })
  await page.goto(BASE + 'checkout.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(600)
  console.log('checkout units with the same bag:', await page.evaluate(() => document.getElementById('co-units').textContent))
  await ctx.close()
}

/* B: JavaScript off */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(BASE + 'index.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(500)
  const vis = await page.evaluate(() => {
    const probe = sel => [...document.querySelectorAll(sel)].slice(0, 2).map(el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { sel, opacity: cs.opacity, visibility: cs.visibility, display: cs.display, h: Math.round(r.height), text: el.innerText.replace(/\s+/g, ' ').slice(0, 60) } })
    return [].concat(probe('.hero-copy h1'), probe('.beat'), probe('.giant'), probe('.sprout-copy'), probe('.card-title'), probe('#spec'), probe('#tiers'), probe('#order-form'), probe('.mission'), probe('#bag-total'), probe('.noscript'), probe('#labels .chip'))
  })
  console.log('\nJS OFF, index.html:'); for (const v of vis) console.log('  ', JSON.stringify(v))
  console.log('JS OFF body text length:', await page.evaluate(() => document.body.innerText.length))
  console.log('JS OFF: bag-total raw text:', JSON.stringify(await page.evaluate(() => document.getElementById('bag-total').textContent)))
  console.log('JS OFF: noscript text:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('noscript')].map(n => n.innerText || n.textContent))))
  await page.screenshot({ path: OUT + 'copy-index-nojs-top.png' })
  await page.evaluate(() => document.getElementById('drive').scrollIntoView()); await page.waitForTimeout(200)
  await page.screenshot({ path: OUT + 'copy-index-nojs-drive.png' })
  await page.evaluate(() => document.getElementById('firms').scrollIntoView()); await page.waitForTimeout(200)
  await page.screenshot({ path: OUT + 'copy-index-nojs-firms.png' })
  await page.goto(BASE + 'checkout.html' + bust()); await page.waitForLoadState('load')
  console.log('JS OFF checkout noscript:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('noscript')].map(n => n.textContent))))
  await ctx.close()
}
await browser.close()
