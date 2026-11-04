// (1) Offline audit: requests to any origin other than the local server, every non-2xx response,
// failed requests, bytes, and time-to-ready, for the home page (loaded + scrolled end to end,
// bag opened), team.html and checkout.html (with two lines in the bag so the summary renders).
import { chromium, base, out, bust, watch, sleep, READY } from './review-lib.mjs'

const pages = [['home', 'index.html'], ['team', 'team.html'], ['checkout', 'checkout.html']]
const report = {}

for (const [name, path] of pages) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  if (name === 'checkout') {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('seedscent.bag', JSON.stringify([{ scentIndex: 0, format: 'mirror', qty: 2 }, { scentIndex: 2, format: 'vent', qty: 1 }])) } catch {}
    })
  }
  const page = await ctx.newPage()
  const { errors, warnings } = watch(page)
  const reqs = [], resps = [], failed = []
  page.on('request', r => reqs.push({ url: r.url(), type: r.resourceType() }))
  page.on('response', r => resps.push({ url: r.url(), status: r.status() }))
  page.on('requestfailed', r => failed.push({ url: r.url(), err: r.failure() && r.failure().errorText }))

  const t0 = Date.now()
  await page.goto(base + path + bust(), { waitUntil: 'load' })
  const loadMs = Date.now() - t0
  let readyMs = null
  if (name === 'home') {
    await page.waitForFunction(READY, null, { timeout: 60000 })
    readyMs = Date.now() - t0
    // scroll the whole page in 50 steps so lazy images, chips, hangers and the finale all run
    for (let i = 0; i <= 50; i++) { await page.evaluate(p => __dbg.scrollTo(p), i / 50); await sleep(120) }
    await page.evaluate(() => __dbg.bagOpen && __dbg.bagOpen()); await sleep(400)
    await page.evaluate(() => __dbg.bagClose && __dbg.bagClose())
    await page.evaluate(() => __dbg.scrollTo(0)); await sleep(300)
  } else {
    await sleep(800)
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    for (let i = 0; i <= 20; i++) { await page.evaluate(y => window.scrollTo(0, y), (max * i) / 20); await sleep(120) }
  }
  await sleep(1500)

  const perf = await page.evaluate(() => performance.getEntriesByType('resource').map(e => ({
    name: e.name.replace(location.origin + '/', ''), type: e.initiatorType, encoded: e.encodedBodySize, decoded: e.decodedBodySize, dur: Math.round(e.duration),
  })))
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), loadEvent: Math.round(n.loadEventEnd), htmlBytes: n.encodedBodySize } : null
  })
  const local = url => url.startsWith(base)
  const external = reqs.filter(r => !local(r.url) && !/^(data|blob|about):/.test(r.url))
  const notOk = resps.filter(r => r.status >= 400).map(r => ({ url: r.url.replace(base, ''), status: r.status }))
  const totalBytes = perf.reduce((s, e) => s + (e.encoded || 0), 0) + (nav ? nav.htmlBytes : 0)
  const byType = {}
  for (const e of perf) { const k = e.type; byType[k] = (byType[k] || 0) + (e.encoded || 0) }
  report[name] = {
    loadMs, readyMs, nav, requests: reqs.length, uniqueUrls: new Set(reqs.map(r => r.url)).size,
    externalRequests: external, non2xx: notOk, failed, totalBytesKB: Math.round(totalBytes / 1024),
    byTypeKB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])),
    biggest: perf.sort((a, b) => b.encoded - a.encoded).slice(0, 8).map(e => ({ name: e.name.split('?')[0], KB: Math.round(e.encoded / 1024), ms: e.dur })),
    errors, warnings: warnings.slice(0, 5),
  }
  console.log('\n=== ' + name + ' ===')
  console.log(JSON.stringify(report[name], null, 1))
  await browser.close()
}

/* also: phone viewport home load, to catch anything viewport-specific */
{
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  const reqs = [], resps = []
  page.on('request', r => reqs.push(r.url()))
  page.on('response', r => resps.push({ url: r.url(), status: r.status() }))
  const t0 = Date.now()
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  await page.waitForFunction(READY, null, { timeout: 60000 })
  const readyMs = Date.now() - t0
  for (let i = 0; i <= 30; i++) { await page.evaluate(p => __dbg.scrollTo(p), i / 30); await sleep(100) }
  await sleep(1000)
  const external = reqs.filter(u => !u.startsWith(base) && !/^(data|blob|about):/.test(u))
  const notOk = resps.filter(r => r.status >= 400).map(r => r.url.replace(base, '') + ' ' + r.status)
  console.log('\n=== home (phone 390x844 @2x) ===')
  console.log(JSON.stringify({ readyMs, requests: reqs.length, external, notOk, errors }, null, 1))
  await browser.close()
}
