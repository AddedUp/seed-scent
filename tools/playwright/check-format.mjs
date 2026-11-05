/* Format photos check: on each scent card the photo follows the format picker.

   Every card has two photos, scents[n].image (mirror cord) and scents[n].imageVent
   (vent clip). Picking a format shows that format's photo; a missing file never leaves
   the slot empty or shows the wrong label. Runs on the blank template (fixture.mjs),
   which points at the same six mock-up photos as the shipped config.

     cd tools/playwright
     node check-format.mjs
     SITE_BASE=https://addedup.github.io/seed-scent/ node check-format.mjs

   Screenshots land in tools/playwright/out/format-*.png. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankConfig } from './fixture.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = (process.env.SITE_BASE || process.env.SEED_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '') + '/'

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const bust = () => '?bust=' + Date.now()

/* what each card's photo slot shows right now */
const cards = page => page.evaluate(() => [...document.querySelectorAll('.card[data-scent]')].map(card => {
  const media = card.querySelector('.card-media'), tag = card.querySelector('.media-tag'), label = card.querySelector('.slot-label')
  const see = img => {
    if (!img) return null
    const cs = getComputedStyle(img)
    return { loaded: !img.hidden && img.naturalWidth > 0, shown: !img.hidden && cs.visibility === 'visible' && +cs.opacity > 0.99 && img.getClientRects().length > 0, src: (img.getAttribute('src') || '').split('/').pop(), alt: img.alt }
  }
  const picked = (card.querySelector('.format input:checked') || {}).value
  return {
    picked, format: media.dataset.format || null,
    mirror: see(card.querySelector('img.slot[data-for="mirror"]')), vent: see(card.querySelector('img.slot[data-for="vent"]')),
    tag: tag && !tag.hidden && tag.getClientRects().length ? tag.textContent.trim() : null,
    label: label && label.getClientRects().length ? label.textContent.trim() : null,
  }
}))
const showing = c => (c.mirror && c.mirror.shown ? 'mirror' : '') + (c.vent && c.vent.shown ? 'vent' : '') || 'nothing'
const say = c => `picked ${c.picked}, showing ${showing(c)}${c.tag ? `, tag "${c.tag}"` : ', no tag'}${c.label ? `, label "${c.label}"` : ''}`

async function open(browser, opts, append = '', expect404 = []) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts })
  await blankConfig(ctx, append)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !expect404.some(f => m.text().includes('404') || m.text().includes(f))) errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror ' + e.message))
  await page.goto(BASE + 'index.html' + bust())
  await page.waitForFunction(() => window.__sections && window.__dbg && window.__dbg.state().ready, null, { timeout: 60000 })
  await page.evaluate(() => { const el = document.getElementById('scent-cards'); const y = el.getBoundingClientRect().top + scrollY - innerHeight * 0.2; window.__dbg.scrollTo(y / (document.documentElement.scrollHeight - innerHeight)) })
  // both formats' photos are in (the second format's photos start a moment after the page has loaded)
  await page.waitForFunction(n => [...document.querySelectorAll('.card[data-scent] img.slot')].filter(i => !i.hidden && i.naturalWidth > 0).length >= n, expect404.length ? 0 : 6, { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  return { ctx, page, errors }
}
const shot = (page, n, name) => page.locator(`.card[data-scent="${n}"] .card-media`).screenshot({ path: path.join(OUT, `format-${name}.png`) })

const browser = await chromium.launch()

/* ---------- desktop: the full walk ---------- */
{
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } })
  let c = await cards(page)
  check('[desktop] three cards, each with a mirror cord photo and a vent clip photo', c.length === 3 && c.every(x => x.mirror && x.mirror.loaded && x.vent && x.vent.loaded), c.map(x => `${x.mirror && x.mirror.src} / ${x.vent && x.vent.src}`).join(' · '))
  check('[desktop] every card starts on Mirror cord and shows the mirror cord photo', c.every(x => x.picked === 'mirror' && showing(x) === 'mirror' && x.tag === 'Mirror cord'), c.map(say).join(' · '))
  check('[desktop] the photos say what they are', c.every(x => /mirror cord/i.test(x.mirror.alt) && /vent clip/i.test(x.vent.alt)), `"${c[0].mirror.alt}" / "${c[0].vent.alt}"`)
  check('[desktop] no card shows two formats, and no two slots share a photo', new Set(c.flatMap(x => [x.mirror.src, x.vent.src])).size === 6, [...new Set(c.flatMap(x => [x.mirror.src, x.vent.src]))].join(', '))
  const before = await shot(page, 0, 'desktop-0-mirror')

  // pick Vent clip on the first card with the mouse
  await page.locator('.card[data-scent="0"] .format label', { hasText: 'Vent clip' }).click()
  await sleep(120)
  const mid = await cards(page)
  check('[desktop] mid-switch the slot is never empty', showing(mid[0]) !== 'nothing', say(mid[0]))
  await sleep(1300)
  c = await cards(page)
  check('[desktop] picking Vent clip shows the vent clip photo on that card', c[0].picked === 'vent' && showing(c[0]) === 'vent' && c[0].tag === 'Vent clip', say(c[0]))
  check('[desktop] the other two cards do not change', c[1].picked === 'mirror' && showing(c[1]) === 'mirror' && c[2].picked === 'mirror' && showing(c[2]) === 'mirror', `${say(c[1])} · ${say(c[2])}`)
  const after = await shot(page, 0, 'desktop-0-vent')
  check('[desktop] the picture in the slot really changed', Buffer.compare(before, after) !== 0, `${before.length} bytes before, ${after.length} after`)

  // keyboard: arrow keys move through the picker and the photo follows
  await page.locator('.card[data-scent="1"] .format input[value="mirror"]').focus()
  await page.keyboard.press('ArrowRight')
  await sleep(1300)
  c = await cards(page)
  check('[desktop] the arrow key picks Vent clip and the photo follows', c[1].picked === 'vent' && showing(c[1]) === 'vent' && c[1].tag === 'Vent clip', say(c[1]))
  await page.keyboard.press('ArrowLeft')
  await sleep(1300)
  c = await cards(page)
  check('[desktop] back to Mirror cord by keyboard: the mirror cord photo returns', c[1].picked === 'mirror' && showing(c[1]) === 'mirror' && c[1].tag === 'Mirror cord', say(c[1]))

  // back and forth quickly: it ends on what is picked
  const lab = t => page.locator('.card[data-scent="2"] .format label', { hasText: t })
  for (const t of ['Vent clip', 'Mirror cord', 'Vent clip', 'Mirror cord', 'Vent clip']) { await lab(t).click(); await sleep(60) }
  await sleep(1400)
  c = await cards(page)
  check('[desktop] five quick flips end on the picked format', c[2].picked === 'vent' && showing(c[2]) === 'vent' && c[2].tag === 'Vent clip', say(c[2]))

  // the bag still gets the picked format
  await page.locator('.card[data-scent="0"] .add-to-bag').click()
  await sleep(900)
  const line = await page.evaluate(() => (document.querySelector('#bag-lines') || {}).innerText || '')
  check('[desktop] the bag line carries the picked format', /vent clip/i.test(line), line.replace(/\s+/g, ' ').slice(0, 90))
  check('[desktop] no console errors', errors.length === 0, errors.join(' | ').slice(0, 200))
  await ctx.close()
}

/* ---------- phone: tap ---------- */
{
  const { ctx, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  let c = await cards(page)
  check('[phone] every card starts on the mirror cord photo', c.every(x => showing(x) === 'mirror' && x.tag === 'Mirror cord'), c.map(say).join(' · '))
  const label = page.locator('.card[data-scent="0"] .format label', { hasText: 'Vent clip' })
  await label.scrollIntoViewIfNeeded()
  const box = await label.boundingBox()
  check('[phone] the format choices are at least 24px tall to tap', box.height >= 24, `${box.height.toFixed(1)}px`)
  await label.tap()
  await sleep(1300)
  c = await cards(page)
  check('[phone] a tap on Vent clip shows the vent clip photo', c[0].picked === 'vent' && showing(c[0]) === 'vent' && c[0].tag === 'Vent clip', say(c[0]))
  await shot(page, 0, 'phone-0-vent')
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check('[phone] nothing wider than the screen, no console errors', wide <= 0 && errors.length === 0, `${wide}px ${errors.join(' | ').slice(0, 160)}`)
  await ctx.close()
}

/* ---------- a missing vent photo: the card keeps the photo it has, honestly labelled ---------- */
{
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, 'window.SEED_SCENT.scents[0].imageVent = "images/not-there.jpg";', ['not-there.jpg'])
  await page.locator('.card[data-scent="0"] .format label', { hasText: 'Vent clip' }).click()
  await sleep(1300)
  const c = await cards(page)
  check('[no vent photo] picking Vent clip keeps the mirror cord photo, still labelled Mirror cord', c[0].picked === 'vent' && showing(c[0]) === 'mirror' && c[0].tag === 'Mirror cord', say(c[0]))
  check('[no vent photo] the other cards still switch', await (async () => { await page.locator('.card[data-scent="1"] .format label', { hasText: 'Vent clip' }).click(); await sleep(1300); const d = await cards(page); return showing(d[1]) === 'vent' })())
  check('[no vent photo] no errors beyond the missing file', errors.length === 0, errors.join(' | ').slice(0, 200))
  await ctx.close()
}

/* ---------- only a vent photo: it shows from the start, labelled Vent clip ---------- */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } }, 'window.SEED_SCENT.scents[0].image = "images/not-there.jpg";', ['not-there.jpg'])
  const c = await cards(page)
  check('[no mirror photo] the vent clip photo shows instead of an empty slot, labelled Vent clip', c[0].picked === 'mirror' && showing(c[0]) === 'vent' && c[0].tag === 'Vent clip' && !c[0].label, say(c[0]))
  await ctx.close()
}

/* ---------- no photos at all: the labelled empty slot stays ---------- */
{
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, 'window.SEED_SCENT.scents[0].image = null; window.SEED_SCENT.scents[0].imageVent = null;', ['x'])
  await page.locator('.card[data-scent="0"] .format label', { hasText: 'Vent clip' }).click()
  await sleep(700)
  const c = await cards(page)
  check('[no photos] the slot keeps its label and shows no format tag', showing(c[0]) === 'nothing' && !c[0].tag && /photo/i.test(c[0].label || ''), say(c[0]))
  check('[no photos] no console errors', errors.length === 0, errors.join(' | ').slice(0, 200))
  await ctx.close()
}

/* ---------- reduced motion: the switch is instant ---------- */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await page.locator('.card[data-scent="0"] .format label', { hasText: 'Vent clip' }).click()
  await sleep(80)
  const c = await cards(page)
  const moving = await page.evaluate(() => [...document.querySelectorAll('.card[data-scent="0"] img.slot')].map(i => { const cs = getComputedStyle(i); return Math.max(...cs.transitionDuration.split(',').map(parseFloat), ...cs.transitionDelay.split(',').map(parseFloat), ...cs.animationDuration.split(',').map(parseFloat)) }))
  check('[reduced motion] the photo switches at once, with no fade', showing(c[0]) === 'vent' && moving.every(s => s === 0), `${say(c[0])}; longest transition ${Math.max(...moving)}s`)
  await ctx.close()
}

await browser.close()
console.log(fails ? `\n${fails} format check(s) FAILED` : '\nAll format checks passed')
process.exit(fails ? 1 : 0)
