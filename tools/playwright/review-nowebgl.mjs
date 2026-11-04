// (3) No WebGL: an init script makes getContext('webgl'/'webgl2') return null, then the home page
// is loaded. Reports uncaught errors, what survives of the shell (hero copy, card, each section,
// forms), what depends on the scene (chips, soil, sprout, beats, finale card), and whether the
// menu / motion toggle / anchors / bag / order form still work. Screenshots: out/rev-nowebgl-*.png
import { chromium, base, out, bust, watch, sleep } from './review-lib.mjs'

const stub = () => {
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
    return orig.call(this, type, ...rest)
  }
}

const effOpacityFn = `(el) => { let o = 1; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); o *= parseFloat(cs.opacity); if (cs.display === 'none' || cs.visibility === 'hidden') return 0 } return o }`

async function run(viewport, tag, mobile) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile })
  await ctx.addInitScript(stub)
  const page = await ctx.newPage()
  const { errors } = watch(page)
  await page.goto(base + 'index.html' + bust(), { waitUntil: 'load' })
  await sleep(2500)

  const probe = await page.evaluate((effSrc) => {
    const eff = eval(effSrc)
    const info = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { opacity: +eff(el).toFixed(3), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), color: cs.color, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) } }
    const card = document.getElementById('card-panel'), ccs = getComputedStyle(card)
    return {
      dbgKeys: window.__dbg ? Object.keys(window.__dbg) : null,
      hasSceneState: !!(window.__dbg && window.__dbg.state),
      noWebglClass: document.body.classList.contains('no-webgl'),
      dataChapter: document.body.dataset.chapter, theme: document.body.dataset.theme,
      lenis: document.documentElement.className,
      cardPanel: { inset: ccs.inset, radius: ccs.borderRadius, opacity: ccs.opacity, bg: ccs.backgroundColor, rect: card.getBoundingClientRect().toJSON() },
      hero: { kicker: info('.ch-hero .kicker'), h1: info('.ch-hero h1'), lede: info('.ch-hero .lede'), logo: info('.hero-logo'), pills: document.querySelectorAll('.ch-hero .pill').length, cue: info('#cue'), hint: info('#push-hint') },
      beatsOpacity: [...document.querySelectorAll('.beat')].map(b => +eff(b).toFixed(3)),
      giantsOpacity: [...document.querySelectorAll('.giant')].map(b => +eff(b).toFixed(3)),
      sprout: { copy: info('.sprout-copy'), day: info('#day-num'), stemStroke: getComputedStyle(document.getElementById('stem')).stroke, dasharray: getComputedStyle(document.getElementById('stem')).strokeDasharray, dashoffset: getComputedStyle(document.getElementById('stem')).strokeDashoffset, pathLengthAttr: document.getElementById('stem').getAttribute('pathLength') },
      soilClip: getComputedStyle(document.getElementById('soil')).clipPath,
      chips: document.querySelectorAll('#labels .chip').length,
      scentsH2: info('.ch-scents h2'), cards: document.querySelectorAll('#scent-cards .card').length,
      insideH2: info('.ch-inside h2'), specRows: document.querySelectorAll('#spec tr').length, xsecChildren: document.getElementById('paper-xsec').childElementCount,
      firmsH2: info('.ch-firms h2'), orderFields: document.querySelectorAll('#order-form input, #order-form select, #order-form textarea').length, range: info('#qty-range'),
      mission: info('.ch-about .mission'), bizCard: info('.biz-card'), bizName: info('.biz-name'),
      meterStemDashoffset: getComputedStyle(document.getElementById('meter-stem')).strokeDashoffset,
      marketplace: { href: document.getElementById('marketplace-link').getAttribute('href'), ariaDisabled: document.getElementById('marketplace-link').getAttribute('aria-disabled') },
      tbcWithTitle: [...document.querySelectorAll('.tbc')].filter(e => e.title).length, tbcTotal: document.querySelectorAll('.tbc').length,
      splitLines: document.querySelectorAll('.split-line').length,
      sections: window.__sections ? { loop: __sections.loop(), xsec: __sections.xsec(), tier: __sections.tier(24) } : null,
      bagHelpers: !!(window.__dbg && window.__dbg.bag),
    }
  }, effOpacityFn)
  console.log('\n=== no-webgl ' + tag + ' ===')
  console.log(JSON.stringify(probe, null, 1))
  await page.screenshot({ path: out + `rev-nowebgl-${tag}-hero.png` })

  // walk the page: at each stop, which text is actually visible in the viewport (effective opacity > .05)
  const vh = viewport.height
  const stops = [['drive', 0.6], ['drive', 2.4], ['sprout', 0.8], ['scents', 1.3], ['cards', 0.1], ['inside', 0.1], ['firms', 0.2], ['about', 0], ['contact', 0.1]]
  for (const [id, k] of stops) {
    await page.evaluate(([id, k, vh]) => { const el = document.getElementById(id); window.scrollTo(0, el.offsetTop + k * vh) }, [id, k, vh])
    await sleep(700)
    const vis = await page.evaluate((effSrc) => {
      const eff = eval(effSrc)
      const els = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main th, main td, main label, main legend, main blockquote')]
      const seen = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && eff(e) > 0.05 && (e.textContent || '').trim() })
        .map(e => ({ tag: e.tagName, text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36), color: getComputedStyle(e).color }))
      return { scrollY: Math.round(scrollY), visibleTextEls: seen.length, sample: seen.slice(0, 6) }
    }, effOpacityFn)
    console.log(tag, id, 'k=' + k, JSON.stringify(vis))
    await page.screenshot({ path: out + `rev-nowebgl-${tag}-${id}-${k}.png` })
  }

  // interactions that live in main.js/ui.js (menu, motion toggle, anchors) vs sections.js/cart.js (form, bag)
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400)
  const inter = {}
  const mt = page.locator('#motion-toggle')
  if (await mt.isVisible()) { const before = await mt.getAttribute('aria-pressed'); await mt.click(); await sleep(150); inter.motionToggle = { before, after: await mt.getAttribute('aria-pressed'), text: (await mt.textContent()).trim() } }
  const menu = page.locator('#menu-toggle')
  if (await menu.isVisible()) {
    await menu.click(); await sleep(250)
    inter.menu = { open: await page.evaluate(() => document.getElementById('nav').classList.contains('menu-open')), expanded: await menu.getAttribute('aria-expanded') }
    if (inter.menu.open) { await page.keyboard.press('Escape'); await sleep(150); inter.menu.closedByEsc = await page.evaluate(() => !document.getElementById('nav').classList.contains('menu-open')) }
  }
  // anchor link (desktop nav or the hero pill on phone)
  const anchor = mobile ? page.locator('.ch-hero a.pill[href="#firms"]') : page.locator('.nav-links a[data-nav="firms"]')
  await anchor.first().click({ force: true }); await sleep(1500)
  inter.anchor = await page.evaluate(() => ({ scrollY: Math.round(scrollY), firmsTop: document.getElementById('firms').offsetTop, h2Top: Math.round(document.querySelector('.ch-firms h2').getBoundingClientRect().top), navH: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim() }))
  // add to bag, open the bag, Escape
  await page.evaluate(() => window.scrollTo(0, document.getElementById('cards').offsetTop)); await sleep(400)
  await page.locator('.add-to-bag[data-add="0"]').click({ force: true }); await sleep(300)
  inter.bagCount = (await page.locator('#bag-count').textContent()).trim()
  await page.locator('#bag-toggle').click({ force: true }); await sleep(600)
  inter.bagOpen = await page.evaluate(() => document.getElementById('bag').classList.contains('open'))
  await page.keyboard.press('Escape'); await sleep(300)
  inter.bagClosedByEsc = await page.evaluate(() => !document.getElementById('bag').classList.contains('open'))
  // order form
  await page.evaluate(() => window.scrollTo(0, document.getElementById('firms').offsetTop)); await sleep(400)
  await page.fill('#f-firm', 'Test Firm'); await page.fill('#f-name', 'Tester'); await page.fill('#f-email', 'test@example.com')
  await page.locator('#order-form button[type="submit"]').click({ force: true }); await sleep(500)
  inter.orderSummaryShown = await page.evaluate(() => !document.getElementById('form-summary').hidden)
  inter.tierSlider = await page.evaluate(() => { const r = document.getElementById('qty-range'); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#tiers .tier.active .tier-qty').textContent.trim() })
  console.log(tag, 'interactions', JSON.stringify(inter, null, 1))
  console.log(tag, 'errors', JSON.stringify(errors, null, 1))
  await browser.close()
}

await run({ width: 1440, height: 900 }, 'desktop', false)
await run({ width: 390, height: 844 }, 'phone', true)
