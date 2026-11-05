/* Facts check: the one check that reads the REAL js/config.js.

   It loads the pages as a visitor gets them and asserts that every fact the team
   has filled in shows where it should (school line in About, on the business
   card, in both footers, on the team page), that blank facts still show a chip,
   and that the facts that are places to go are working links: the Instagram
   handle opens the profile in a new tab by click, tap and keyboard.

   The other check-*.mjs suites run against the blank template (see fixture.mjs),
   so this is the check that follows the live data. It works against any host:

     cd tools/playwright
     node check-facts.mjs
     SITE_BASE=https://addedup.github.io/seed-scent/ node check-facts.mjs

   Requests to instagram.com are answered locally by a stub, so the check never
   leaves this machine. Screenshots land in tools/playwright/out/facts-*.png. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
const BASE = (process.env.SITE_BASE || process.env.SEED_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '') + '/'
const INK = 'rgb(32, 52, 25)'

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}
const blank = v => v === null || v === undefined || v === ''
const bust = () => '?bust=' + Date.now()

const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
}
const touch = label => label !== 'desktop'

/* The "school · city, state" lines: on one line the dot shows between the parts; when the
   line breaks it breaks at the dot, the dot is clipped away and the place stays together. */
async function schoolLines(page) {
  return page.evaluate(() => [...document.querySelectorAll('.school-line')].filter(el => !el.hidden && el.getClientRects().length).map(el => {
    const a = el.querySelector('.sl-a'), b = el.querySelector('.sl-b'), dot = el.querySelector('.sl-dot')
    const box = el.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), rd = dot.getBoundingClientRect()
    const cs = getComputedStyle(el), clip = parseFloat(cs.fontSize) * 1.2, lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
    return {
      where: el.closest('.footer') ? 'footer' : el.closest('.about-meta') ? 'about' : el.closest('.team-hero') ? 'team header' : 'other',
      wrapped: rb.top > ra.top + 2,
      dotShown: rd.right > box.left + clip + 0.5,
      placeLines: Math.round(rb.height / lh),
      overflow: Math.round(Math.max(ra.right, rb.right) - box.right),
    }
  }))
}
const lineOk = s => (s.wrapped ? !s.dotShown : s.dotShown) && s.placeLines === 1 && s.overflow <= 0
const lineSay = s => `${s.where}: ${s.wrapped ? 'two lines, dot ' + (s.dotShown ? 'SHOWING' : 'gone') : 'one line, dot ' + (s.dotShown ? 'between' : 'MISSING')}${s.placeLines !== 1 ? ', place on ' + s.placeLines + ' lines' : ''}${s.overflow > 0 ? ', ' + s.overflow + 'px too wide' : ''}`

console.log(`Facts check against ${BASE}`)

for (const [label, opts] of Object.entries(sizes)) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts })
  /* a click on the Instagram link must not leave this machine during a check */
  await ctx.route(/^https?:\/\/([a-z0-9-]+\.)?instagram\.com\//i, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }))

  const page = await ctx.newPage()
  const errors = [], external = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !/^(data|blob|about):/.test(u)) external.push(u) })

  await page.goto(BASE + 'index.html' + bust(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dbg && window.__dbg.state && window.__dbg.state().ready, null, { timeout: 60000 })
  await page.waitForTimeout(600)

  const C = await page.evaluate(() => JSON.parse(JSON.stringify(window.SEED_SCENT)))
  const d = await page.evaluate(async () => {
    const { instagramHandle } = await import('./js/ui.js')
    const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null)
    const row = name => { const div = [...document.querySelectorAll('.biz-rows > div')].find(x => txt(x.querySelector('dt')) === name); return div ? div.querySelector('dd') : null }
    const about = document.querySelector('.about-meta .kicker'), foot = document.querySelectorAll('.footer p')[1]
    const shown = el => !el.hidden && getComputedStyle(el).display !== 'none'
    const ig = row('Instagram'), a = ig && ig.querySelector('a'), em = row('Email'), ea = em && em.querySelector('a')
    return {
      handle: instagramHandle(window.SEED_SCENT.contact && window.SEED_SCENT.contact.instagram),
      about: { text: txt(about), shown: shown(about), chips: about.querySelectorAll('.ph').length },
      footer: { text: txt(foot), shown: shown(foot), chips: foot.querySelectorAll('.ph').length },
      school: txt(row('School')), where: txt(row('Where')),
      schoolChips: (row('School') ? row('School').querySelectorAll('.ph').length : 0) + (row('Where') ? row('Where').querySelectorAll('.ph').length : 0),
      ig: ig ? { text: txt(ig), chip: !!ig.querySelector('.ph'), link: a ? { href: a.href, text: txt(a), target: a.target, rel: a.rel, label: a.getAttribute('aria-label') } : null } : null,
      email: em ? { text: txt(em), chip: !!em.querySelector('.ph'), link: ea ? { href: ea.getAttribute('href'), text: txt(ea), target: ea.target } : null } : null,
      labels: [...document.querySelectorAll('.biz-rows dt')].map(txt),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }
  })

  /* ---- school and place ---- */
  const S = C.school || {}
  const allSchool = !blank(S.name) && !blank(S.city) && !blank(S.state)
  const noSchool = blank(S.name) && blank(S.city) && blank(S.state)
  const line = `${S.name} · ${S.city}, ${S.state}`
  if (allSchool) {
    check(`[${label}] About shows the school and place`, d.about.text === line && d.about.shown && d.about.chips === 0, d.about.text)
    check(`[${label}] home footer shows the school and place`, d.footer.text === line && d.footer.shown && d.footer.chips === 0, d.footer.text)
    check(`[${label}] business card School and Where rows`, d.school === S.name && d.where === `${S.city}, ${S.state}` && d.schoolChips === 0, `${d.school} | ${d.where}`)
    const lines = await schoolLines(page)
    check(`[${label}] home: the school line breaks cleanly at the dot or not at all`, lines.length === 2 && lines.every(lineOk), lines.map(lineSay).join(' / '))
  } else if (noSchool) {
    check(`[${label}] school lines stay out of the way while the school is blank`, !d.about.shown && !d.footer.shown, `about shown ${d.about.shown}, footer shown ${d.footer.shown}`)
    check(`[${label}] business card keeps the three school chips`, d.schoolChips === 3, String(d.schoolChips))
  } else {
    const parts = [S.name, S.city, S.state].filter(v => !blank(v))
    check(`[${label}] the filled parts of the school line show, the rest stay chips`, parts.every(p => d.about.text.includes(p) && d.footer.text.includes(p)) && d.about.chips === 3 - parts.length, d.about.text)
  }

  /* ---- email on the business card ---- */
  const emailRaw = C.contact && C.contact.email
  if (blank(emailRaw)) check(`[${label}] Email row keeps its chip while the address is blank`, !!d.email && d.email.chip && !d.email.link, JSON.stringify(d.email))
  else check(`[${label}] Email row opens an email to the address`, !!d.email && !!d.email.link && d.email.link.href === 'mailto:' + String(emailRaw).trim() && d.email.link.text === String(emailRaw).trim() && !d.email.chip, JSON.stringify(d.email))

  /* ---- Instagram ---- */
  const igRaw = C.contact && C.contact.instagram
  check(`[${label}] the row is labelled Instagram`, d.labels.includes('Instagram'), d.labels.join(', '))
  if (blank(igRaw)) check(`[${label}] Instagram row keeps its chip while the handle is blank`, !!d.ig && d.ig.chip && !d.ig.link, JSON.stringify(d.ig))
  else if (!d.handle) check(`[${label}] a value that is not a handle keeps its chip`, !!d.ig && d.ig.chip && !d.ig.link, JSON.stringify(igRaw))
  else {
    const url = `https://www.instagram.com/${d.handle}/`
    const sel = '.biz-rows a.fact-link[target="_blank"]'
    check(`[${label}] Instagram row is a link to the profile`, !!d.ig && !!d.ig.link && d.ig.link.href === url && d.ig.link.text === '@' + d.handle && !d.ig.chip, JSON.stringify(d.ig))
    check(`[${label}] it opens a new tab and does not hand over the opener`, !!d.ig.link && d.ig.link.target === '_blank' && /\bnoopener\b/.test(d.ig.link.rel), d.ig.link ? `${d.ig.link.target} ${d.ig.link.rel}` : 'no link')
    check(`[${label}] its spoken name says Instagram and contains the visible handle`, !!d.ig.link && (d.ig.link.label || '').includes('@' + d.handle) && /instagram/i.test(d.ig.link.label || ''), d.ig.link ? d.ig.link.label : '')

    await page.evaluate(() => window.__dbg.scrollTo(1))
    await page.waitForTimeout(2600)   // the finale pendant drops in and settles
    const geo = await page.evaluate(s => {
      const a = document.querySelector(s), r = a.getBoundingClientRect(), cs = getComputedStyle(a)
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const mine = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && (el === a || a.contains(el)) }
      /* how far a finger can miss and still land on the link */
      let up = 0, down = 0
      while (up < 40 && mine(cx, cy - up - 1)) up++
      while (down < 40 && mine(cx, cy + down + 1)) down++
      return { w: Math.round(r.width), textH: Math.round(r.height), tapH: up + down + 1, onTop: mine(cx, cy), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, color: cs.color, deco: cs.textDecorationLine, cursor: cs.cursor }
    }, sel)
    check(`[${label}] the link is on screen, on top, underlined, ink on sage`, geo.inView && geo.onTop && geo.deco.includes('underline') && geo.color === INK && geo.cursor === 'pointer', JSON.stringify(geo))
    check(`[${label}] its tap area is at least 32px tall`, geo.tapH >= 32, `text ${geo.w}x${geo.textH}, tap area ${geo.tapH}px tall`)

    /* the pendant hangs in the same card: it must not sit on the words */
    const gaps = []
    for (let i = 0; i < 8; i++) {
      gaps.push(await page.evaluate(() => {
        const st = window.__dbg.state().finale
        if (!st) return null
        const k = innerHeight / 10, R = 1.2 * (Math.min(innerWidth, innerHeight) < 700 ? 0.62 : 1) * k   // same sizes as js/main.js
        const px = innerWidth / 2 + st.x * k, py = innerHeight / 2 - st.y * k
        const gap = el => { const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect(); return Math.round(Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom)) - R) }
        const words = [...document.querySelectorAll('.biz-name, .biz-tag, .biz-rows dt, .biz-rows dd, .biz-copy .pill')]
        return Math.min(...words.map(gap))
      }))
      await page.waitForTimeout(250)
    }
    const seen = gaps.filter(g => g !== null)
    if (seen.length) check(`[${label}] the finale pendant hangs clear of the card's words`, Math.min(...seen) > 0, `closest ${Math.min(...seen)}px over ${seen.length} samples`)
    else console.log(`NOTE  [${label}] no 3D scene here, so there is no pendant to measure`)

    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), touch(label) ? page.tap(sel) : page.click(sel)])
    await popup.waitForLoadState('domcontentloaded').catch(() => {})
    const openerGone = await popup.evaluate(() => window.opener === null).catch(() => null)
    check(`[${label}] a ${touch(label) ? 'tap' : 'click'} opens ${url} in a new tab`, popup.url() === url && openerGone === true, `${popup.url()} (opener gone: ${openerGone})`)
    await popup.close()
    const st = await page.evaluate(() => { const s = window.__dbg.state(); return { held: s.held, onPage: location.pathname } })
    check(`[${label}] pressing the link does not grab the pendant or leave the page`, st.held === false && /(index\.html|\/)$/.test(st.onPage), JSON.stringify(st))

    if (label === 'desktop') {
      await page.focus('.biz-copy .pill')
      await page.keyboard.press('Shift+Tab')
      const f = await page.evaluate(s => {
        const a = document.querySelector(s), cs = getComputedStyle(a), r = a.getBoundingClientRect()
        const dt = a.closest('div').querySelector('dt'), range = document.createRange(); range.selectNodeContents(dt)
        const ringTop = r.top - parseFloat(cs.outlineOffset) - parseFloat(cs.outlineWidth)
        return { on: document.activeElement === a, visible: a.matches(':focus-visible'), outline: cs.outlineColor, style: cs.outlineStyle, ringClearOfLabel: Math.round((ringTop - range.getBoundingClientRect().bottom) * 10) / 10 }
      }, sel)
      check('[desktop] the keyboard reaches the link and shows an ink focus ring', f.on && f.visible && f.outline === INK && f.style !== 'none', JSON.stringify(f))
      check('[desktop] the focus ring does not touch the Instagram label above it', f.ringClearOfLabel >= 0, `${f.ringClearOfLabel}px between ring and label`)
      await page.screenshot({ path: path.join(OUT, 'facts-desktop-focus.png'), clip: { x: 46, y: 520, width: 620, height: 230 } })
      const [p2] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), page.keyboard.press('Enter')])
      check('[desktop] Enter opens the profile', p2.url() === url, p2.url())
      await p2.close()
      await page.evaluate(() => document.activeElement && document.activeElement.blur())
    }
  }

  check(`[${label}] home: nothing wider than the screen`, d.overflow <= 1, `${d.overflow}px`)
  check(`[${label}] home: no console errors, no requests to other hosts`, errors.length === 0 && external.length === 0, [...errors, ...external].slice(0, 3).join(' | '))

  /* screenshots: the business card with the footer, and the About line */
  await page.evaluate(() => window.__dbg.scrollTo(1)); await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(OUT, `facts-${label}-finale.png`) })
  await page.evaluate(() => {
    const el = document.querySelector('.about-meta'), max = document.documentElement.scrollHeight - innerHeight
    window.__dbg.scrollTo(Math.min(1, Math.max(0, (el.getBoundingClientRect().top + scrollY - innerHeight * 0.45) / max)))
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, `facts-${label}-about.png`) })

  /* ---- team page ---- */
  const tp = await ctx.newPage()
  const tErrors = []
  tp.on('console', m => { if (m.type() === 'error' && !/images\/team-\d+\.\w+/.test(m.location().url || '')) tErrors.push(m.text()) })
  tp.on('pageerror', e => tErrors.push('pageerror: ' + e.message))
  await tp.goto(BASE + 'team.html' + bust(), { waitUntil: 'load' })
  await tp.waitForFunction(() => window.__team && typeof window.__team.count === 'function', null, { timeout: 15000 }).catch(() => {})
  await tp.waitForTimeout(1200)
  const t = await tp.evaluate(() => {
    const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null)
    const hero = document.querySelector('.team-hero .annotation'), foot = document.querySelectorAll('.footer p')[1]
    return { hero: txt(hero), heroChips: hero.querySelectorAll('.ph').length, footer: txt(foot), footerChips: foot.querySelectorAll('.ph').length, overflow: document.documentElement.scrollWidth - innerWidth }
  })
  if (allSchool) {
    check(`[${label}] team page header and footer show the school and place`, t.hero === line && t.footer === line && t.heroChips === 0 && t.footerChips === 0, `${t.hero} | ${t.footer}`)
    const lines = await schoolLines(tp)
    check(`[${label}] team: the school line breaks cleanly at the dot or not at all`, lines.length === 2 && lines.every(lineOk), lines.map(lineSay).join(' / '))
  } else if (noSchool) check(`[${label}] team page keeps the school chips`, t.heroChips === 3 && t.footerChips === 3, `${t.heroChips} + ${t.footerChips}`)
  check(`[${label}] team: nothing wider than the screen, no unexpected errors`, t.overflow <= 1 && tErrors.length === 0, `${t.overflow}px ${tErrors.slice(0, 2).join(' | ')}`)
  await tp.screenshot({ path: path.join(OUT, `facts-${label}-team.png`) })
  await tp.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await tp.waitForTimeout(700)
  await tp.screenshot({ path: path.join(OUT, `facts-${label}-team-foot.png`) })

  await browser.close()
}

console.log(fails ? `\n${fails} check${fails === 1 ? '' : 's'} failed` : '\nAll facts checks passed')
process.exit(fails ? 1 : 0)
