// (5) Keyboard + axe-like pass. Desktop: Tab from the top through the whole home page, recording
// each stop (what it is, in view?, under the fixed nav?, focus indicator visible = focused vs
// blurred computed styles differ), the skip link, Escape on the bag, focus containment of the
// drawer. Phone: Escape on the menu. Static audit on all three pages: alt text, labels, names,
// landmarks, heading order, aria-hidden traps, plus contrast computed from the CSS tokens.
import { chromium, base, out, bust, watch, sleep, READY, contrast, blend } from './review-lib.mjs'

const describeFocus = () => {
  const a = document.activeElement
  if (!a || a === document.body) return { tag: 'body' }
  const cs = getComputedStyle(a)
  const pick = c => ({ outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, boxShadow: c.boxShadow, borderBottom: c.borderBottomColor, bg: c.backgroundColor, color: c.color })
  const focused = pick(cs)
  const fv = a.matches(':focus-visible')
  a.blur()
  const blurred = pick(getComputedStyle(a))
  a.focus({ preventScroll: true })
  const r = a.getBoundingClientRect()
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 76
  const indicator = focused.outline !== blurred.outline ? 'outline' : focused.boxShadow !== blurred.boxShadow ? 'box-shadow' : focused.borderBottom !== blurred.borderBottom ? 'border-bottom color' : focused.bg !== blurred.bg ? 'background' : 'NONE'
  const name = (a.getAttribute('aria-label') || a.textContent || a.value || '').trim().replace(/\s+/g, ' ').slice(0, 34)
  return {
    el: a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.type ? `[${a.type}]` : ''), name,
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
    inView: r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0,
    underNav: !a.closest('.nav, .skip') && r.top < navH && r.bottom > 0,
    focusVisible: fv, indicator, outline: focused.outline, scrollY: Math.round(scrollY),
    ariaDisabled: a.getAttribute('aria-disabled'), inBag: !!a.closest('#bag'),
  }
}

const audit = () => {
  const imgs = [...document.images].map(i => ({ src: (i.getAttribute('src') || '').slice(0, 50), alt: i.getAttribute('alt'), hidden: i.hidden }))
  const imgsNoAlt = imgs.filter(i => i.alt === null)
  const fields = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].map(f => {
    const lab = (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label')
    return { id: f.id || f.className, type: f.type, labelled: !!(lab || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) }
  })
  const unlabelled = fields.filter(f => !f.labelled)
  const named = el => !!((el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || el.getAttribute('title') || '').trim()) || !!el.querySelector('img[alt]:not([alt=""])')
  const controls = [...document.querySelectorAll('button, [role=button], a[href]')]
  const unnamed = controls.filter(c => !named(c)).map(c => c.outerHTML.slice(0, 90))
  const landmarks = {
    banner: document.querySelectorAll('body > header, [role=banner]').length,
    nav: document.querySelectorAll('nav, [role=navigation]').length,
    main: document.querySelectorAll('main').length,
    contentinfo: [...document.querySelectorAll('footer')].filter(f => !f.closest('main, section, article, aside')).length + document.querySelectorAll('[role=contentinfo]').length,
    footersInsideMain: [...document.querySelectorAll('footer')].filter(f => f.closest('main')).length,
    complementary: [...document.querySelectorAll('aside')].map(a => ({ id: a.id, label: a.getAttribute('aria-label') || a.getAttribute('aria-labelledby'), ariaHidden: a.getAttribute('aria-hidden') })),
    labelledRegions: [...document.querySelectorAll('section')].filter(s => s.getAttribute('aria-label') || s.getAttribute('aria-labelledby')).length, sections: document.querySelectorAll('section').length,
  }
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ level: +h.tagName[1], text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 44) }))
  const skips = []; let prev = 0
  headings.forEach(h => { if (prev && h.level > prev + 1) skips.push(`h${prev} -> h${h.level} "${h.text}"`); prev = h.level })
  const ariaHiddenWithFocusable = [...document.querySelectorAll('[aria-hidden="true"]')].filter(e => e.querySelector('a[href], button, input, select, textarea, [tabindex]')).map(e => ({ el: e.tagName.toLowerCase() + '#' + e.id, inert: !!e.inert }))
  const disabledLinksInTabOrder = [...document.querySelectorAll('a[aria-disabled="true"][href]')].map(a => (a.id || a.textContent.trim().slice(0, 30)) + ' tabindex=' + a.tabIndex)
  const sectionsNoHeading = [...document.querySelectorAll('main section')].filter(s => !s.querySelector('h1,h2,h3,h4') && !s.getAttribute('aria-label') && !s.getAttribute('aria-labelledby')).map(s => '#' + s.id)
  const emptyHeadings = headings.filter(h => !h.text).length
  const chipOnlyHeadings = [...document.querySelectorAll('h1,h2,h3')].filter(h => h.querySelector('.ph') && h.textContent.trim() === h.querySelector('.ph').textContent.trim()).length
  const positiveTabindex = document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length
  const liveRegions = document.querySelectorAll('[aria-live], [role=status], [role=alert]').length
  const svgs = [...document.querySelectorAll('svg')].map(s => ({ id: s.id || s.parentElement.className, hidden: s.getAttribute('aria-hidden'), role: s.getAttribute('role'), label: s.getAttribute('aria-label') })).filter(s => !s.hidden && !s.label)
  return { lang: document.documentElement.lang, title: document.title, imgs: imgs.length, imgsNoAlt, fields: fields.length, unlabelled, controls: controls.length, unnamed, landmarks, headings, headingSkips: skips, h1Count: headings.filter(h => h.level === 1).length, emptyHeadings, chipOnlyHeadings, ariaHiddenWithFocusable, disabledLinksInTabOrder, sectionsNoHeading, positiveTabindex, liveRegions, svgsWithoutName: svgs }
}

const browser = await chromium.launch()

/* ---------- home, desktop keyboard ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  await page.waitForFunction(READY, null, { timeout: 60000 })
  await sleep(1200)
  // one bag line so the drawer has controls
  await page.evaluate(() => __dbg.bagSet([{ scentIndex: 1, format: 'vent', qty: 2 }]))

  console.log('\n=== home: Tab order (desktop 1440x900) ===')
  const stops = []
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    await sleep(90)
    const d = await page.evaluate(describeFocus)
    stops.push(d)
    if (i > 2 && d.el === 'a' && d.name === 'Skip to content') break // wrapped
    if (d.tag === 'body') { stops.push({ wrappedToBody: true }); break }
  }
  stops.forEach((s, i) => console.log(String(i + 1).padStart(2), JSON.stringify(s)))
  const noIndicator = stops.filter(s => s.indicator === 'NONE')
  const offscreen = stops.filter(s => s.el && !s.inView)
  const underNav = stops.filter(s => s.underNav)
  console.log('stops:', stops.length, '| no visible indicator:', noIndicator.length, JSON.stringify(noIndicator.map(s => s.el + ' ' + s.name)), '| focused while off-screen:', offscreen.length, JSON.stringify(offscreen.map(s => s.el + ' ' + s.name + ' top=' + s.top)), '| focused under the fixed nav:', underNav.length, JSON.stringify(underNav.map(s => s.el + ' ' + s.name + ' top=' + s.top)))
  const afterFocusSweep = await page.evaluate(() => ({ p: __dbg.state().progress, chapter: __dbg.state().chapter }))
  console.log('scroll position after the Tab sweep:', JSON.stringify(afterFocusSweep))

  /* skip link */
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(READY, null, { timeout: 60000 }); await sleep(800)
  await page.keyboard.press('Tab'); await sleep(100)
  const skipFocused = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { el: a.className, text: a.textContent.trim(), top: Math.round(r.top), visible: r.top >= 0 && r.bottom <= innerHeight } })
  await page.keyboard.press('Enter'); await sleep(900)
  const afterEnter = await page.evaluate(() => ({ active: document.activeElement.tagName + '#' + document.activeElement.id, hash: location.hash, scrollY: Math.round(scrollY) }))
  await page.keyboard.press('Tab'); await sleep(100)
  const afterSkipTab = await page.evaluate(() => { const a = document.activeElement; return a.tagName.toLowerCase() + '.' + a.className + ' "' + (a.getAttribute('aria-label') || a.textContent.trim()).slice(0, 30) + '"' })
  console.log('\n=== skip link ===\nfocused:', JSON.stringify(skipFocused), '\nafter Enter:', JSON.stringify(afterEnter), '\nnext Tab lands on:', afterSkipTab, '(expected: something inside <main>, not the nav brand)')

  /* bag: open, Escape, focus return, containment */
  await page.locator('#bag-toggle').click(); await sleep(800)
  const bagOpen = await page.evaluate(() => ({ open: document.getElementById('bag').classList.contains('open'), ariaHidden: document.getElementById('bag').getAttribute('aria-hidden'), inert: document.getElementById('bag').inert, focus: document.activeElement.id, expanded: document.getElementById('bag-toggle').getAttribute('aria-expanded') }))
  const bagTabs = []
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); await sleep(60); bagTabs.push(await page.evaluate(() => { const a = document.activeElement; return (a.closest('#bag') ? 'bag:' : 'PAGE:') + a.tagName.toLowerCase() + '#' + (a.id || a.className.split(' ')[0]) })) }
  await page.keyboard.press('Escape'); await sleep(400)
  const bagClosed = await page.evaluate(() => ({ open: document.getElementById('bag').classList.contains('open'), ariaHidden: document.getElementById('bag').getAttribute('aria-hidden'), inert: document.getElementById('bag').inert, focus: document.activeElement.id, scrim: document.getElementById('scrim').hidden }))
  console.log('\n=== bag ===\nopen:', JSON.stringify(bagOpen), '\nTab path from inside the open bag:', JSON.stringify(bagTabs), '\nafter Escape:', JSON.stringify(bagClosed))

  /* static audit + live color readings */
  const a = await page.evaluate(audit)
  console.log('\n=== home: static audit ===\n' + JSON.stringify(a, null, 1))
  const colors = await page.evaluate(() => {
    const eff = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return +o.toFixed(3) }
    const read = (sel, backdrop) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { sel, color: cs.color, opacity: eff(el), fontPx: cs.fontSize, weight: cs.fontWeight, backdrop, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) } }
    return [
      read('.ch-hero .hero-copy .kicker', 'sage card #a8c88f'),
      read('.ch-hero .lede', 'sage card #a8c88f'),
      read('.ch-hero h1', 'sage card #a8c88f'),
      read('#cue', 'sage card / cream'),
      read('.beat-copy', 'sage (card opened) #a8c88f'),
      read('.beat .kicker', 'sage (card opened) #a8c88f'),
      read('.sprout-copy .kicker', 'soil #203419'),
      read('.ch-scents .annotation', 'cream #fbf6e5'),
      read('#tier-note', 'cream #fbf6e5'),
      read('.form-note', 'paper-2 #f3ebd3'),
      read('.ch-sprout .tbc', 'soil #203419'),
      read('.spec .tbc', 'cream #fbf6e5'),
      read('.biz-rows dt', 'sage card #a8c88f'),
      read('.biz-card .ph', 'sage card #a8c88f'),
      read('.biz-tag', 'sage card #a8c88f'),
      read('.footer', 'cream #fbf6e5'),
      read('.nav-links a', 'cream / sage'),
      read('.card-meta dt', 'paper-2 #f3ebd3'),
      read('.slot-label', 'paper-3 #e9dfc0'),
      read('.format label', 'paper-2 #f3ebd3'),
      read('.step-num', 'cream'),
    ]
  })
  console.log('\n=== home: live color readings ==='); colors.forEach(c => console.log(JSON.stringify(c)))
  console.log('errors:', JSON.stringify(errors))
  await ctx.close()
}

/* ---------- home, phone: menu + Escape, motion toggle availability ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  await page.waitForFunction(READY, null, { timeout: 60000 })
  await sleep(1000)
  const menuBtn = page.locator('#menu-toggle')
  await menuBtn.click(); await sleep(300)
  const opened = await page.evaluate(() => ({ open: document.getElementById('nav').classList.contains('menu-open'), expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'), focus: document.activeElement.id, firstLinkVisible: document.querySelector('.nav-links a').getBoundingClientRect().height > 0 }))
  await page.screenshot({ path: out + 'rev-a11y-phone-menu-open.png' })
  // Tab from the menu button: does focus go into the menu?
  await page.keyboard.press('Tab'); await sleep(80)
  const tabFromMenu = await page.evaluate(() => { const a = document.activeElement; return a.tagName.toLowerCase() + '#' + (a.id || a.className) + ' "' + a.textContent.trim().slice(0, 20) + '"' })
  await page.keyboard.press('Escape'); await sleep(200)
  const closed = await page.evaluate(() => ({ open: document.getElementById('nav').classList.contains('menu-open'), expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'), focus: document.activeElement.id || document.activeElement.tagName }))
  const phoneBits = await page.evaluate(() => ({
    motionToggleDisplay: getComputedStyle(document.getElementById('motion-toggle')).display,
    menuBtnSize: (() => { const r = document.getElementById('menu-toggle').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })(),
    bagBtnSize: (() => { const r = document.getElementById('bag-toggle').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })(),
    tapTargetsUnder24: [...document.querySelectorAll('button, a[href]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24) }).map(e => (e.id || e.className.split(' ')[0]) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)),
    menuOrder: [...document.querySelectorAll('.nav-links a')].map(a => a.textContent.trim()),
    domOrderMenuBeforeLinks: document.getElementById('menu-toggle').compareDocumentPosition(document.querySelector('.nav-links a')) & Node.DOCUMENT_POSITION_PRECEDING ? 'links precede button' : 'button precedes links',
  }))
  console.log('\n=== home phone: menu ===\nopened:', JSON.stringify(opened), '\nTab from the menu button goes to:', tabFromMenu, '\nafter Escape:', JSON.stringify(closed), '\nphone bits:', JSON.stringify(phoneBits, null, 1))
  console.log('errors:', JSON.stringify(errors))
  await ctx.close()
}

/* ---------- team + checkout: Tab sweep summary + static audit ---------- */
for (const path of ['team.html', 'checkout.html']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  if (path === 'checkout.html') await ctx.addInitScript(() => { try { localStorage.setItem('seedscent.bag', JSON.stringify([{ scentIndex: 0, format: 'mirror', qty: 2 }])) } catch {} })
  const page = await ctx.newPage()
  const { errors } = watch(page)
  await page.goto(base + path + bust(), { waitUntil: 'load' })
  await sleep(1500)
  const stops = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab'); await sleep(70)
    const d = await page.evaluate(describeFocus)
    stops.push(d)
    if (i > 1 && d.name === 'Skip to content') break
    if (d.tag === 'body') break
  }
  console.log(`\n=== ${path}: Tab order ===`)
  stops.forEach((s, i) => console.log(String(i + 1).padStart(2), JSON.stringify({ el: s.el, name: s.name, inView: s.inView, underNav: s.underNav, indicator: s.indicator, fv: s.focusVisible })))
  console.log(`=== ${path}: static audit ===\n` + JSON.stringify(await page.evaluate(audit), null, 1))
  if (path === 'team.html') console.log('team bag count shown:', await page.locator('#bag-count').textContent(), '(localStorage bag has', await page.evaluate(() => localStorage.getItem('seedscent.bag')), ')')
  if (path === 'checkout.html') {
    const co = await page.evaluate(() => {
      const eff = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return +o.toFixed(3) }
      const read = sel => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { sel, color: cs.color, opacity: eff(el), fontPx: cs.fontSize, text: el.textContent.trim().slice(0, 24) } }
      return [read('.co-summary .line-format'), read('.co-summary .line-remove'), read('.co-summary .bag-totals dt'), read('.co-summary .ph'), read('.co-note'), read('.co-how p:not(.kicker)')]
    })
    console.log('checkout live colors (backdrop sage #a8c88f for .co-summary):'); co.forEach(c => console.log(JSON.stringify(c)))
  }
  console.log('errors:', JSON.stringify(errors))
  await ctx.close()
}
await browser.close()

/* ---------- contrast from the tokens ---------- */
const T = { paper: '#fbf6e5', ink: '#203419', moss: '#587541', sage: '#a8c88f', paper2: '#f3ebd3', paper3: '#e9dfc0', sage2: '#c2d8b1', moss2: '#4a6336', ink2: '#172610' }
const pairs = [
  ['ink on cream (body text)', T.ink, T.paper],
  ['ink on sage (hero h1/lede, biz-name, co-summary)', T.ink, T.sage],
  ['moss on cream (.kicker, .annotation, .footer, .text-link, .field label, .tbc@1)', T.moss, T.paper],
  ['moss on paper-2 (.card-meta dt, .way .kicker, .form-note base)', T.moss, T.paper2],
  ['moss on sage (hero .kicker, .biz-rows dt, .biz-card .ph chips, .reg marks)', T.moss, T.sage],
  ['moss-2 on sage (.biz-tag, large bold)', T.moss2, T.sage],
  ['cream on ink (soil theme text, .pill text)', T.paper, T.ink],
  ['sage on ink (soil theme .kicker, .sprout-copy .kicker)', T.sage, T.ink],
  ['moss @ .75 on cream (.kicker.soft: tier-note, "Bulk tiers apply", about kicker...)', blend(T.moss, T.paper, 0.75), T.paper],
  ['moss @ .75 on paper-2 (.kicker.soft .form-note in .way)', blend(T.moss, T.paper2, 0.75), T.paper2],
  ['moss @ .7 on cream (.tbc badges)', blend(T.moss, T.paper, 0.7), T.paper],
  ['moss @ .7 on sage (hero/finale .tbc on card)', blend(T.moss, T.sage, 0.7), T.sage],
  ['sage @ .7 on ink (sprout "sprout time to be confirmed" .tbc on soil)', blend(T.sage, T.ink, 0.7), T.ink],
  ['ink @ .72 on sage (.co-summary .line-format/.line-remove/dt)', blend(T.ink, T.sage, 0.72), T.sage],
  ['ink @ .8 on cream (.nav-links a)', blend(T.ink, T.paper, 0.8), T.paper],
  ['moss @ .8 on paper-3 (.slot-label "[Photo: scent one]")', blend(T.moss, T.paper3, 0.8), T.paper3],
  ['ink @ .85 on paper-2 (.card-notes, .team-bio)', blend(T.ink, T.paper2, 0.85), T.paper2],
  ['moss-2 on cream (.co-error, .text-link:hover)', T.moss2, T.paper],
  ['moss-2 on paper-2 (.co-how code)', T.moss2, T.paper2],
]
console.log('\n=== contrast (WCAG 2.x, from CSS tokens; AA normal text needs 4.5, large/bold>=18.66px needs 3.0) ===')
for (const [label, fg, bg] of pairs) { const c = contrast(fg, bg); console.log(c.toFixed(2).padStart(6), c >= 4.5 ? 'PASS ' : c >= 3 ? 'large-only' : 'FAIL ', label, `(${fg} on ${bg})`) }
