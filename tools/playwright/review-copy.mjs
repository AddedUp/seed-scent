// Copy-and-claims review: capture every rendered string on the three pages,
// including the ones JS builds (chips, bag note, tier note, order summary,
// team cards, checkout notes in all three modes), and screenshot evidence.
// Read-only against the site; writes only under tools/playwright/out/.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:3001/'
const OUT = fileURLToPath(new URL('./out/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const bust = () => '?bust=' + Date.now()
const log = (...a) => console.log(...a)
const report = {}

const browser = await chromium.launch()

async function pump(page, n = 6) { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(r))) }

// everything a reader (or screen reader) can get as text
async function harvest(page) {
  return page.evaluate(() => {
    const meta = n => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || null
    const attr = (sel, a) => [...document.querySelectorAll(sel)].map(e => e.getAttribute(a)).filter(v => v && v.trim())
    const text = document.body.innerText
    // dashes / doubled words / double spaces in what is actually rendered
    const dashes = [...text.matchAll(/[^\n]{0,40}[–—][^\n]{0,40}/g)].map(m => m[0])
    const doubled = [...text.matchAll(/\b([A-Za-z]{2,})\s+\1\b/gi)].map(m => m[0])
    const dblSpace = [...text.matchAll(/[^\n]{0,30}\S  +\S[^\n]{0,30}/g)].map(m => m[0])
    const chips = [...document.querySelectorAll('.ph')].map(e => ({ t: e.textContent.trim(), ctx: (e.parentElement?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140) }))
    const tbc = [...document.querySelectorAll('.tbc')].map(e => ({ t: e.textContent.trim(), title: e.title, ctx: (e.parentElement?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) }))
    return {
      title: document.title, description: meta('description'), ogTitle: meta('og:title'), ogDescription: meta('og:description'),
      alts: attr('img[alt]', 'alt'), ariaLabels: attr('[aria-label]', 'aria-label'), titles: attr('[title]', 'title'),
      placeholders: attr('[placeholder]', 'placeholder'), options: [...document.querySelectorAll('option')].map(o => o.textContent.trim()),
      dashes, doubled, dblSpace, chips, tbc, text,
    }
  })
}

/* ------------------------------------------------------------------ index, desktop */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE + 'index.html' + bust())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(800); await pump(page)
  const h = await harvest(page)
  report.index = h
  writeFileSync(OUT + 'copy-index-text.txt', h.text)
  log('\n=== INDEX (1440) ===')
  log('title:', h.title); log('description:', h.description); log('og:title:', h.ogTitle); log('og:description:', h.ogDescription)
  log('dashes in rendered text:', h.dashes); log('doubled words:', h.doubled); log('double spaces:', h.dblSpace)
  log('alts:', h.alts); log('aria-labels:', h.ariaLabels); log('titles:', h.titles); log('placeholders:', h.placeholders); log('options:', h.options)
  log('chips:'); for (const c of h.chips) log('  ', JSON.stringify(c))
  log('tbc:'); for (const c of h.tbc) log('  ', JSON.stringify(c))
  await page.screenshot({ path: OUT + 'copy-index-hero.png' })

  // chapters
  const chapters = await page.evaluate(() => __dbg.chapters())
  log('chapters:', JSON.stringify(chapters))
  const chap = n => chapters.find(c => c.name === n)
  const land = async (name, t) => { const c = chap(name); await page.evaluate(p => __dbg.scrollTo(p), c.start + t * (c.end - c.start)); await page.waitForTimeout(250); await pump(page, 8) }

  // drive beats: the per-beat copy
  for (const t of [0.42, 0.55, 0.68, 0.85]) { await land('drive', t) ; const vis = await page.evaluate(() => [...document.querySelectorAll('.beat')].filter(b => parseFloat(b.style.opacity) > 0.5).map(b => b.innerText.replace(/\s+/g, ' '))); log(`drive t=${t}:`, vis) }
  await land('drive', 0.55); await page.screenshot({ path: OUT + 'copy-drive-beat.png' })

  // sprout: how far does the Day counter go?
  const days = []
  for (const t of [0.1, 0.4, 0.7, 0.9, 0.98]) { await land('sprout', t); days.push(await page.evaluate(() => document.getElementById('day-num').textContent)) }
  log('sprout Day counter across the chapter:', days)
  await land('sprout', 0.95); await page.screenshot({ path: OUT + 'copy-sprout-day.png' })

  // scents: the floating chips under the three hangers
  await land('scents', 0.6); await page.waitForTimeout(600); await pump(page, 10)
  const chips3d = await page.evaluate(() => [...document.querySelectorAll('#labels .chip')].map(c => ({ html: c.innerHTML, text: c.innerText, opacity: c.style.opacity })))
  log('3D scent chips:', JSON.stringify(chips3d))
  await page.screenshot({ path: OUT + 'copy-scents-chips.png' })

  // firms: tier note at several quantities
  await land('firms', 0.2)
  const notes = []
  for (const q of [1, 9, 10, 49, 50, 100, 200]) { await page.evaluate(n => { const r = document.getElementById('qty-range'); r.value = n; r.dispatchEvent(new Event('input', { bubbles: true })) }, q); await page.waitForTimeout(80); notes.push([q, await page.evaluate(() => document.getElementById('tier-note').textContent), await page.evaluate(() => document.querySelector('#tiers .tier.active')?.innerText.replace(/\s+/g, ' '))]) }
  log('tier note by qty:', JSON.stringify(notes))
  await page.screenshot({ path: OUT + 'copy-firms-tiers.png' })

  // order form: submit with the email unset -> what does the summary say?
  await page.fill('#f-firm', 'Test Firm'); await page.fill('#f-name', 'Test Person'); await page.fill('#f-email', 'test@example.com')
  await page.selectOption('#f-scent', '1')
  await page.click('#order-form button[type=submit]')
  await page.waitForTimeout(300)
  const summary = await page.evaluate(() => ({ text: document.getElementById('form-summary').innerText, hidden: document.getElementById('form-summary').hidden, url: location.href.slice(0, 80) }))
  log('order-form summary (email unset):', JSON.stringify(summary))
  await page.screenshot({ path: OUT + 'copy-order-summary.png' })
  // validation strings
  await page.fill('#f-email', 'nope'); await page.click('#order-form button[type=submit]'); await page.waitForTimeout(100)
  log('validation data-error:', await page.evaluate(() => [...document.querySelectorAll('#order-form [data-error]')].map(f => f.getAttribute('data-error'))))

  // marketplace button state
  log('marketplace link:', await page.evaluate(() => { const a = document.getElementById('marketplace-link'); return { href: a.getAttribute('href'), disabled: a.getAttribute('aria-disabled'), text: a.innerText } }))

  // bag: empty, then with a line
  await page.evaluate(() => __dbg.bagClear())
  await page.evaluate(() => __dbg.bagOpen()); await page.waitForTimeout(400)
  log('bag (empty):', JSON.stringify(await page.evaluate(() => document.getElementById('bag').innerText)))
  log('bag checkout aria-disabled (empty):', await page.evaluate(() => document.getElementById('bag-checkout').getAttribute('aria-disabled')))
  await page.evaluate(() => __dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 2 }, { scentIndex: 2, format: 'vent', qty: 10 }])); await page.waitForTimeout(300)
  log('bag (2 lines):', JSON.stringify(await page.evaluate(() => document.getElementById('bag').innerText)))
  log('bag line aria-labels:', await page.evaluate(() => [...document.querySelectorAll('#bag [aria-label]')].map(e => e.getAttribute('aria-label'))))
  await page.screenshot({ path: OUT + 'copy-bag-open.png' })
  // "Added" acknowledgement + live region
  await page.evaluate(() => __dbg.bagClose()); await land('cards', 0.3); await page.waitForTimeout(300)
  await page.click('.add-to-bag[data-add="1"]'); await page.waitForTimeout(100)
  log('add button after click:', await page.evaluate(() => document.querySelector('.add-to-bag[data-add="1"]').innerText), '| live region:', await page.evaluate(() => document.querySelector('.sr-only[role=status]')?.textContent))
  await page.screenshot({ path: OUT + 'copy-cards.png' })

  await land('inside', 0.3); await page.screenshot({ path: OUT + 'copy-inside-spec.png', fullPage: false })
  await land('about', 0.5); await page.screenshot({ path: OUT + 'copy-about.png' })
  await land('finale', 0.7); await page.waitForTimeout(400); await pump(page, 6); await page.screenshot({ path: OUT + 'copy-finale.png' })
  // leave a bag in localStorage for the team-page check
  await page.evaluate(() => __dbg.bagSet([{ scentIndex: 0, format: 'mirror', qty: 3 }]))
  await page.close()
}

/* ------------------------------------------------------------------ team, desktop (bag has 3 units) */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE + 'team.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(800); await pump(page)
  const h = await harvest(page); report.team = h
  writeFileSync(OUT + 'copy-team-text.txt', h.text)
  log('\n=== TEAM (1440) ===')
  log('title:', h.title); log('description:', h.description)
  log('dashes:', h.dashes, 'doubled:', h.doubled, 'dblSpace:', h.dblSpace)
  log('alts:', h.alts); log('aria-labels:', h.ariaLabels); log('titles:', h.titles)
  log('chips:'); for (const c of h.chips) log('  ', JSON.stringify(c))
  log('tbc:', JSON.stringify(h.tbc))
  log('bag-count on team page with 3 units in localStorage:', await page.evaluate(() => document.getElementById('bag-count').textContent), '| localStorage:', await page.evaluate(() => localStorage.getItem('seedscent.bag')))
  log('team-note hidden?', await page.evaluate(() => document.getElementById('team-note').hidden), '| text:', await page.evaluate(() => document.getElementById('team-note').textContent))
  log('TEXT:\n' + h.text)
  await page.screenshot({ path: OUT + 'copy-team-top.png' })
  await page.evaluate(() => window.__team.scrollTo(document.getElementById('team').offsetTop - 60)); await page.waitForTimeout(900); await pump(page)
  await page.screenshot({ path: OUT + 'copy-team-cards.png' })
  // where does the Bag button go?
  await page.click('#bag-toggle'); await page.waitForTimeout(600)
  log('after clicking Bag on team page, url =', page.url().replace(/\?bust=\d+/, ''))
  await page.close()
}

/* ------------------------------------------------------------------ checkout, desktop, each mode */
async function checkout(mode, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/js/config.js*', async route => {
    const res = await route.fetch(); let body = await res.text()
    body += `\nwindow.SEED_SCENT.checkout.mode = ${JSON.stringify(mode)};${extra}\n`
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
  })
  await page.goto(BASE + 'checkout.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(500); await pump(page)
  const label = mode + (extra ? '+set' : '')
  log(`\n=== CHECKOUT (1440) mode=${label} ===`)
  log('final block HTML:', await page.evaluate(() => document.getElementById('co-final').innerHTML.replace(/\s+/g, ' ').trim()))
  log('final block text:', JSON.stringify(await page.evaluate(() => document.getElementById('co-final').innerText)))
  // submit with empty bag
  await page.evaluate(() => localStorage.setItem('seedscent.bag', '[]')); await page.reload(); await page.waitForTimeout(400)
  const btn = await page.$('#co-final button[type=submit]')
  if (btn) { await btn.click(); await page.waitForTimeout(150); log('error with empty bag:', JSON.stringify(await page.evaluate(() => document.getElementById('co-error').textContent))) }
  // with a bag, missing fields
  await page.evaluate(() => localStorage.setItem('seedscent.bag', JSON.stringify([{ scentIndex: 1, format: 'vent', qty: 12 }]))); await page.reload(); await page.waitForTimeout(400); await pump(page)
  if (mode === 'email' && !extra) {
    const h = await harvest(page); report.checkout = h; writeFileSync(OUT + 'copy-checkout-text.txt', h.text)
    log('title:', h.title); log('description:', h.description); log('dashes:', h.dashes, 'doubled:', h.doubled, 'dblSpace:', h.dblSpace)
    log('aria-labels:', h.ariaLabels); log('placeholders:', h.placeholders); log('chips:', JSON.stringify(h.chips)); log('tbc:', JSON.stringify(h.tbc))
    log('TEXT:\n' + h.text)
    await page.screenshot({ path: OUT + 'copy-checkout-top.png' })
  }
  const btn2 = await page.$('#co-final button[type=submit]')
  if (btn2) {
    await btn2.click(); await page.waitForTimeout(150)
    log('error with blank fields:', JSON.stringify(await page.evaluate(() => document.getElementById('co-error').textContent)))
    await page.fill('#co-firm', 'Buyer Firm'); await page.fill('#co-name', 'Buyer Name'); await page.fill('#co-email', 'buyer@example.com')
    const before = page.url()
    await btn2.click(); await page.waitForTimeout(500)
    log('result hidden?', await page.evaluate(() => document.getElementById('co-result').hidden))
    log('result note:', JSON.stringify(await page.evaluate(() => document.getElementById('co-result-note').innerText)))
    log('order text:\n' + await page.evaluate(() => document.getElementById('co-order').textContent))
    log('url changed?', page.url() !== before, page.url().slice(0, 60))
    await page.screenshot({ path: OUT + `copy-checkout-result-${label}.png`, fullPage: true })
  }
  await page.close()
}
await checkout('email')
await checkout('email', 'window.SEED_SCENT.contact.email="orders@example.com";')
await checkout('marketplace')
await checkout('marketplace', 'window.SEED_SCENT.marketplaceUrl="https://marketplace.example.org/firm/seed-scent";')
await checkout('gateway')

/* ------------------------------------------------------------------ phones: layout words that assume a desktop */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(BASE + 'checkout.html' + bust()); await page.waitForLoadState('load'); await page.waitForTimeout(500)
  const pos = await page.evaluate(() => { const s = document.querySelector('.co-summary').getBoundingClientRect(), d = document.querySelector('.co-details').getBoundingClientRect(); return { summary: { x: s.x, y: s.y, w: s.width }, details: { x: d.x, y: d.y, w: d.width }, annotation: document.querySelector('.co-head .annotation').innerText } })
  log('\n=== CHECKOUT (390 phone) ===', JSON.stringify(pos))
  await page.screenshot({ path: OUT + 'copy-checkout-phone.png' })
  await page.goto(BASE + 'index.html' + bust())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 }); await page.waitForTimeout(800); await pump(page)
  log('index phone: xsec caption:', await page.evaluate(() => document.querySelector('.xsec figcaption').innerText))
  log('index phone: push hint shown?', await page.evaluate(() => document.getElementById('push-hint').classList.contains('show')), '| cue:', await page.evaluate(() => document.getElementById('cue').innerText))
  const chapters = await page.evaluate(() => __dbg.chapters()); const c = chapters.find(c => c.name === 'scents')
  await page.evaluate(p => __dbg.scrollTo(p), c.start + 0.6 * (c.end - c.start)); await page.waitForTimeout(700); await pump(page, 10)
  log('index phone: 3D chips (compact):', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#labels .chip')].map(c => c.innerText))))
  await page.screenshot({ path: OUT + 'copy-index-phone-scents.png' })
  const ci = chapters.find(c => c.name === 'inside'); await page.evaluate(p => __dbg.scrollTo(p), ci.start + 0.15 * (ci.end - ci.start)); await page.waitForTimeout(500)
  await page.screenshot({ path: OUT + 'copy-index-phone-inside.png' })
  await page.close()
}

await browser.close()
log('\nscreenshots in', OUT)
