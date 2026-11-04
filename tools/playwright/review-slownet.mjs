// (extra) Slow network: emulate ~1.6 Mbps / 150 ms RTT via CDP and time when each layer of the home
// page becomes usable: DOMContentLoaded, hero copy painted, sections.js live (__sections), the
// main.js module graph live (__dbg.state, i.e. after three.module.js + rapier.es.js), scene ready,
// and whether the mobile menu / motion toggle respond before main.js arrives.
// Then, unthrottled: 60 s idle in the hero, sampling fps and JS heap for drift.
import { chromium, base, bust, watch, sleep, READY } from './review-lib.mjs'

const browser = await chromium.launch()
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  const t0 = Date.now()
  const marks = {}
  page.on('domcontentloaded', () => { marks.domContentLoaded = Date.now() - t0 })
  page.on('load', () => { marks.load = Date.now() - t0 })
  const nav = page.goto(base + 'index.html' + bust(), { waitUntil: 'commit' })
  await nav
  // poll the page for the layers
  const poll = async () => {
    while (Date.now() - t0 < 120000) {
      const s = await page.evaluate(() => ({
        h1: !!document.querySelector('.ch-hero h1') && getComputedStyle(document.querySelector('.ch-hero h1')).visibility !== 'hidden',
        sections: !!window.__sections, cart: !!(window.__dbg && window.__dbg.bag), main: !!(window.__dbg && window.__dbg.state), ready: !!(window.__dbg && window.__dbg.state && window.__dbg.state().ready),
        menuWired: !!document.getElementById('menu-toggle') && document.getElementById('menu-toggle').getAttribute('aria-expanded') !== null,
      })).catch(() => null)
      if (s) {
        const t = Date.now() - t0
        if (s.h1 && !marks.heroCopyVisible) marks.heroCopyVisible = t
        if (s.sections && !marks.sectionsJs) marks.sectionsJs = t
        if (s.cart && !marks.cartJs) marks.cartJs = t
        if (s.main && !marks.mainJsGraph) marks.mainJsGraph = t
        if (s.ready) { marks.sceneReady = t; break }
      }
      await sleep(100)
    }
  }
  const pollP = poll()
  // while waiting: try the menu button once the h1 is there but main.js is not
  let menuTriedAt = null, menuOpened = null
  while (Date.now() - t0 < 120000) {
    if (marks.heroCopyVisible && !marks.mainJsGraph && menuTriedAt === null) {
      await sleep(500)
      if (!marks.mainJsGraph) {
        menuTriedAt = Date.now() - t0
        await page.locator('#menu-toggle').click({ force: true }).catch(() => {})
        await sleep(200)
        menuOpened = await page.evaluate(() => document.getElementById('nav').classList.contains('menu-open')).catch(() => null)
      }
    }
    if (marks.sceneReady) break
    await sleep(100)
  }
  await pollP
  const sizes = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\.(js|css|woff2)(\?|$)/.test(e.name)).map(e => ({ n: e.name.replace(location.origin + '/', '').split('?')[0], kb: Math.round(e.encodedBodySize / 1024), end: Math.round(e.responseEnd) })).sort((a, b) => a.end - b.end))
  console.log('=== slow network (1.6 Mbps down, 150 ms RTT), phone 390x844 ===')
  console.log('timeline ms:', JSON.stringify(marks))
  console.log('menu button clicked at ms', menuTriedAt, '-> menu opened:', menuOpened, '(main.js graph live at', marks.mainJsGraph, 'ms)')
  console.log('script/css/font arrival order (responseEnd ms):'); sizes.forEach(s => console.log('  ', String(s.end).padStart(6), String(s.kb).padStart(5) + ' KB', s.n))
  console.log('errors:', JSON.stringify(errors))
  await ctx.close()
}

/* 60 s idle in the hero: fps + heap drift */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  await page.waitForFunction(READY, null, { timeout: 60000 })
  await sleep(3000)
  const heap = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = n => m.find(x => x.name === n)?.value; return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1), nodes: g('Nodes'), listeners: g('JSEventListeners'), layoutCount: g('LayoutCount'), styleRecalcs: g('RecalcStyleCount') } }
  const rows = []
  for (let i = 0; i <= 6; i++) {
    const f0 = await page.evaluate(() => __dbg.state().frames)
    await sleep(10000)
    const f1 = await page.evaluate(() => __dbg.state().frames)
    rows.push({ t: (i + 1) * 10, fps: +((f1 - f0) / 10).toFixed(1), ...(await heap()) })
    console.log(JSON.stringify(rows[rows.length - 1]))
  }
  console.log('=== 60 s idle in the hero ===')
  console.log('fps range:', Math.min(...rows.map(r => r.fps)), '-', Math.max(...rows.map(r => r.fps)), '| heap MB first/last:', rows[0].heapMB, '/', rows[rows.length - 1].heapMB, '| layouts/10s first/last:', rows[1].layoutCount - rows[0].layoutCount, '/', rows[rows.length - 1].layoutCount - rows[rows.length - 2].layoutCount, '| style recalcs/10s first/last:', rows[1].styleRecalcs - rows[0].styleRecalcs, '/', rows[rows.length - 1].styleRecalcs - rows[rows.length - 2].styleRecalcs)
  console.log('errors:', JSON.stringify(errors))
  await ctx.close()
}
await browser.close()
