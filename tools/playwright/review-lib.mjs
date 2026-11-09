// Shared bits for the review-*.mjs probes (resilience / performance / a11y / offline lens).
import { chromium } from 'playwright'
import fs from 'fs'
import { fileURLToPath } from 'url'

export { chromium }
// SITE_BASE=https://seedscent.com/ node review-net.mjs  runs a probe against the live site
export const base = process.env.SITE_BASE || 'http://127.0.0.1:3001/'
export const out = fileURLToPath(new URL('./out/', import.meta.url))
fs.mkdirSync(out, { recursive: true })
export const bust = () => '?bust=' + Date.now()
export const sleep = ms => new Promise(r => setTimeout(r, ms))

/* collect console errors + uncaught exceptions */
export function watch(page) {
  const errors = [], warnings = []
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text())
    else if (m.type() === 'warning') warnings.push(m.text())
  })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  return { errors, warnings }
}

export const READY = () => window.__dbg && window.__dbg.state && window.__dbg.state().ready

export async function gotoHome(page, { ready = true, timeout = 60000 } = {}) {
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  if (ready) await page.waitForFunction(READY, null, { timeout })
}

export function stat(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  return { n: s.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) }
}

/* WCAG relative luminance / contrast from hex colors */
export function hexToRgb(hex) { return hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16)) }
export function lum(hex) {
  const c = hexToRgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
/* sRGB blend of fg at alpha over bg (what opacity: .75 on flat text does) */
export function blend(fg, bg, alpha) {
  const f = hexToRgb(fg), b = hexToRgb(bg)
  return '#' + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}
