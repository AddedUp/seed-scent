// Handover verification: load the site in Chromium, collect console errors and
// failed requests, count the placeholder chips the page still shows, compare
// them with the placeholder report, and take two screenshots.
// Run:  cd tools/playwright && node handover-check.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const out = path.join(here, 'out')
mkdirSync(out, { recursive: true })

const bust = Date.now()
const url = `http://127.0.0.1:3001/?bust=${bust}`

// the report's null list, parsed from the script output
const report = execFileSync('node', [path.join(root, 'tools/placeholders.mjs')], { encoding: 'utf8' })
const reportNulls = new Set()
let section = ''
for (const line of report.split('\n')) {
  if (/^Still null/.test(line)) section = 'null'
  else if (/^Optional/.test(line)) section = 'optional'
  else if (/^Photos/.test(line) || /^Marked/.test(line)) section = ''
  else if ((section === 'null' || section === 'optional') && /^  \S/.test(line)) reportNulls.add(line.trim().split(/\s+/)[0])
}

const browser = await chromium.launch()
const results = {}

for (const [name, viewport] of [['desktop-1440x900', { width: 1440, height: 900 }], ['phone-390x844', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 })
  const page = await ctx.newPage()
  const errors = [], failed = [], external = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('requestfailed', r => failed.push(r.url() + ' ' + (r.failure()?.errorText || '')))
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1') external.push(r.url()) })

  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(2500)

  const info = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.ph')]
    const visibleChips = chips.filter(c => c.offsetParent !== null || getComputedStyle(c).display !== 'none')
    const paths = [...new Set(chips.map(c => c.dataset.ph).filter(Boolean))]
    const tbc = document.querySelectorAll('.tbc:not([hidden])').length
    const dbg = window.__dbg ? window.__dbg.state() : null
    return {
      title: document.title,
      chips: chips.length, visibleChips: visibleChips.length, distinctPaths: paths, tbc,
      ready: dbg ? dbg.ready : null, frames: dbg ? dbg.frames : null,
      bodyText: document.body.innerText.length,
      hasConfig: !!window.SEED_SCENT, scents: window.SEED_SCENT ? window.SEED_SCENT.scents.length : 0,
    }
  })

  const notInReport = info.distinctPaths.filter(p => !reportNulls.has(p))
  const file = path.join(out, `handover-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  results[name] = { ...info, distinctPaths: info.distinctPaths.length, notInReport, errors, failed, external, screenshot: file }
  await ctx.close()
}
await browser.close()

console.log(`URL: ${url}`)
console.log(`Report lists ${reportNulls.size} null paths (required + optional)`)
console.log(JSON.stringify(results, null, 2))
