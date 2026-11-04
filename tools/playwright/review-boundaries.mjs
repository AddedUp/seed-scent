// Chapter-boundary review: 7 evenly spaced frames across each boundary (0.9 of the outgoing
// chapter -> 0.25 of the incoming one), plus the four drive beat hand-offs, at 1440x900 and 390x844.
// Also a fine numeric scan (no screenshots) that records choreography metrics per step and flags
// discontinuities. Read-only: nothing in the site is touched.
// Usage: node review-boundaries.mjs [desktop|phone|all] [shots|scan|both]
import { chromium } from 'playwright'
import fs from 'fs'
import { fileURLToPath } from 'url'

const base = 'http://127.0.0.1:3001/index.html'
const out = fileURLToPath(new URL('./out/', import.meta.url))
fs.mkdirSync(out, { recursive: true })
const which = process.argv[2] || 'all'
const mode = process.argv[3] || 'both'
const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}

/* ---------- in-page metrics ---------- */
const METRICS = `(() => {
  const s = __dbg.state()
  const w = innerWidth, h = innerHeight, wpp = 10 / h
  const scale = Math.min(w, h) < 700 ? 0.62 : 1
  const toPx = (x, y) => ({ x: w / 2 + x / wpp, y: h / 2 - y / wpp })
  const hero = s.hero ? { ...toPx(s.hero.x, s.hero.y), r: 1.35 * scale / wpp } : null
  const scents = (s.scents || []).map(p => p ? { ...toPx(p.x, p.y), r: 1.05 * scale / wpp } : null)
  const finale = s.finale ? { ...toPx(s.finale.x, s.finale.y), r: 1.2 * scale / wpp } : null
  const lum = c => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null
    const [r, g, b] = m[1].split(',').map(v => parseFloat(v) / 255)
    const f = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => { const [x, y] = a > b ? [a, b] : [b, a]; return (x + 0.05) / (y + 0.05) }
  const L = { soil: lum('rgb(32,52,25)'), cream: lum('rgb(251,246,229)'), sage: lum('rgb(168,200,143)'), paper2: lum('rgb(243,235,211)') }
  const effOpacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity) } return o }
  const card = document.getElementById('card-panel'), cardR = card.getBoundingClientRect(), cardO = parseFloat(getComputedStyle(card).opacity)
  const soilTop = (1 - s.soil) * h
  const bgAt = (x, y, el) => {
    if (y >= soilTop) return 'soil'
    if (el && el.closest('.biz-card')) return 'sage'
    if (el && el.closest('.card, .way, .xsec, .tier, .photo figcaption')) return 'paper2'
    if (cardO > 0.5 && x >= cardR.left && x <= cardR.right && y >= cardR.top && y <= cardR.bottom) return 'sage'
    return 'cream'
  }
  const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }
  const inView = r => r.x + r.w > 0 && r.x < w && r.y + r.h > 0 && r.y < h
  const sels = [
    ['nav-brand', '.nav .brand'], ['nav-links', '.nav .nav-links'], ['nav-actions', '.nav .nav-actions'], ['meter', '.meter'],
    ['hero-logo', '.hero-logo'], ['hero-kicker', '.hero-copy .kicker'], ['hero-h1', '.hero-copy h1'], ['hero-lede', '.hero-copy .lede'], ['hero-actions', '.hero-copy .actions'], ['cue', '#cue'], ['hint', '#push-hint'],
    ['giant0', '.giant[data-beat="0"]'], ['giant1', '.giant[data-beat="1"]'], ['giant2', '.giant[data-beat="2"]'], ['giant3', '.giant[data-beat="3"]'],
    ['beat0-k', '.beat[data-beat="0"] .kicker'], ['beat0', '.beat[data-beat="0"] .beat-copy'],
    ['beat1-k', '.beat[data-beat="1"] .kicker'], ['beat1', '.beat[data-beat="1"] .beat-copy'],
    ['beat2-k', '.beat[data-beat="2"] .kicker'], ['beat2', '.beat[data-beat="2"] .beat-copy'],
    ['beat3-k', '.beat[data-beat="3"] .kicker'], ['beat3', '.beat[data-beat="3"] .beat-copy'],
    ['sprout-kicker', '.sprout-copy > .kicker:first-child'], ['sprout-day', '.sprout-copy .day'], ['sprout-soft', '.sprout-copy .kicker.soft'], ['sprout-svg', '#sprout-svg'],
    ['scents-h2', '.ch-scents .section-head h2'], ['scents-ann', '.ch-scents .section-head .annotation'],
    ['chip0', '#labels .chip:nth-child(1)'], ['chip1', '#labels .chip:nth-child(2)'], ['chip2', '#labels .chip:nth-child(3)'],
    ['card0', '.cards .card:nth-child(1)'], ['card1', '.cards .card:nth-child(2)'], ['card2', '.cards .card:nth-child(3)'],
    ['inside-h2', '.ch-inside .section-head h2'], ['inside-ann', '.ch-inside .section-head .annotation'], ['spec', '#spec'], ['xsec', '.xsec'],
    ['mission', '.ch-about .mission'], ['about-meta', '.about-meta'], ['about-kicker', '.ch-about > .wrap > .kicker'],
    ['biz-card', '.biz-card'], ['biz-name', '.biz-name'], ['biz-tag', '.biz-tag'], ['biz-rows', '.biz-rows'], ['biz-pill', '.biz-copy .pill'], ['footer', '.footer'],
  ]
  const els = {}
  for (const [k, q] of sels) {
    const el = document.querySelector(q); if (!el) continue
    const r = rect(el), cs = getComputedStyle(el), o = effOpacity(el)
    const e = { r, o: +o.toFixed(3), inView: inView(r), color: cs.color, fs: parseFloat(cs.fontSize), text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50) }
    if (el.tagName !== 'IMG' && el.tagName !== 'svg' && e.text && o > 0.05 && e.inView) {
      // contrast against what is behind it, sampled down the middle
      const tl = lum(cs.color)
      let minC = 99, low = 0, n = 0
      const cx = r.x + r.w / 2
      for (let i = 0; i < 7; i++) {
        const y = r.y + 2 + (r.h - 4) * i / 6
        if (y < 0 || y > h) continue
        const bg = bgAt(cx, y, el), c = ratio(tl, L[bg])
        n++; if (c < minC) minC = c; if (c < 3) low++
        e['bg' + i] = bg
      }
      e.minContrast = +minC.toFixed(2); e.lowFrac = n ? +(low / n).toFixed(2) : 0
    }
    els[k] = e
  }
  // sprout paths
  const paths = {}
  for (const id of ['stem', 'leaf-l', 'leaf-r', 'vein-l', 'vein-r', 'stem-ext']) {
    const p = document.getElementById(id); if (!p) continue
    const cs = getComputedStyle(p)
    paths[id] = { drawn: +(1 - parseFloat(p.style.strokeDashoffset || 1)).toFixed(3), o: parseFloat(cs.opacity), stroke: cs.stroke }
  }
  // split lines mid-reveal (gsap yPercent on .split-line-inner)
  const split = [...document.querySelectorAll('.split-line-inner')].filter(l => { const r = l.getBoundingClientRect(); return r.bottom > 0 && r.top < h }).map(l => { const t = l.style.transform || ''; const m = t.match(/translate(?:3d)?\\([^,]+,\\s*([-\\d.]+)(px|%)/); return m ? (m[2] === 'px' ? parseFloat(m[1]) / 5 : parseFloat(m[1])) : 0 })
  const splitMoving = split.filter(v => Math.abs(v) > 0.5).length
  // reveal classes still pending
  const rvPending = document.querySelectorAll('.rv:not(.in)').length, rvIn = document.querySelectorAll('.rv.in').length
  return {
    w, h, soilTop: +soilTop.toFixed(1), theme: s.theme, chapter: s.chapter, locals: s.locals, soil: s.soil, cardOpen: s.cardOpen, fade: s.fade, plant: s.plant, holder: s.holder,
    card: { r: rect(card), o: cardO, inset: card.style.inset, radius: card.style.borderRadius },
    hero, scents, finale, heroWorld: s.hero, hangers: __dbg.hangers().map(x => ({ name: x.name, enabled: x.enabled, target: x.target })),
    els, paths, splitMoving, rvPending, rvIn, bodyChapter: document.body.dataset.chapter, navActive: [...document.querySelectorAll('.nav-links a.active')].map(a => a.textContent),
  }
})()`

const pump = async (page, n = 3) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(r))) }

async function chapterMap(page) {
  return page.evaluate(() => {
    const total = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    return __dbg.chapters().map(c => {
      const el = document.querySelector(`.ch[data-ch="${c.name}"]`)
      const pinStart = Math.min(1, Math.max(c.start, el.offsetTop / total))
      return { ...c, pinStart, enterFrac: (pinStart - c.start) / Math.max(1e-6, c.end - c.start), top: el.offsetTop, h: el.offsetHeight, total, vh: innerHeight }
    })
  })
}

function sweeps(chs) {
  const by = Object.fromEntries(chs.map(c => [c.name, c]))
  const at = (c, local) => c.start + local * (c.end - c.start)
  const drive = by.drive
  const pinToP = pin => at(drive, drive.enterFrac + pin * (1 - drive.enterFrac))
  const lin = (a, b, n = 7) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1))
  const list = []
  const bd = (a, b) => list.push({ name: `${a}-${b}`, ps: lin(at(by[a], 0.9), at(by[b], 0.25)) })
  bd('hero', 'drive')
  for (const v of [0.2, 0.26, 0.5, 0.74]) list.push({ name: `beat-${v.toFixed(2)}`, ps: lin(pinToP(v - 0.06), pinToP(v + 0.06)) })
  bd('drive', 'sprout'); bd('sprout', 'scents'); bd('scents', 'cards'); bd('cards', 'inside'); bd('about', 'finale')
  // about and finale are shorter than a viewport, so the strict 0.9 -> 0.25 window is ~30px wide; add a wider look
  list.push({ name: 'about-finale-wide', ps: lin(at(by.about, 0.7), at(by.finale, 0.6)) })
  return list
}

for (const [name, opts] of Object.entries(sizes)) {
  if (which !== 'all' && which !== name) continue
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:3001')) errors.push('EXTERNAL ' + u) })
  await page.goto(base + '?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1800)
  const chs = await chapterMap(page)
  console.log(`\n=== ${name} ${opts.viewport.width}x${opts.viewport.height} ===`)
  for (const c of chs) console.log(`  ${c.name.padEnd(7)} start=${c.start.toFixed(4)} pin=${c.pinStart.toFixed(4)} end=${c.end.toFixed(4)} enterFrac=${c.enterFrac.toFixed(3)} top=${c.top} h=${c.h}`)
  const list = sweeps(chs).filter(s => !process.env.SWEEP || s.name === process.env.SWEEP)
  const log = { viewport: opts.viewport, chapters: chs, sweeps: [] }

  if (mode === 'shots' || mode === 'both') {
    for (const sw of list) {
      const frames = []
      for (let i = 0; i < sw.ps.length; i++) {
        const p = sw.ps[i]
        await page.evaluate(p => __dbg.scrollTo(p), p)
        await page.waitForTimeout(700)
        await pump(page, 3)
        const m = await page.evaluate(METRICS)
        const file = `bd-${name}-${sw.name}-${i}-p${p.toFixed(4)}.png`
        await page.screenshot({ path: out + file })
        const l = m.locals[m.chapter]
        console.log(`${file.padEnd(52)} ch=${m.chapter.padEnd(6)} local=${l.local.toFixed(3)} enter=${l.enter.toFixed(3)} pin=${l.pin.toFixed(3)} soil=${m.soil} theme=${m.theme} holder=${m.holder} plant=${m.plant} cardO=${m.card.o} hero=${m.hero ? `${m.hero.x.toFixed(0)},${m.hero.y.toFixed(0)}` : '-'} scents=${m.scents.map(s => s ? `${s.x.toFixed(0)},${s.y.toFixed(0)}` : '-').join('|')} split=${m.splitMoving} rv=${m.rvPending}/${m.rvIn}`)
        frames.push({ i, p, file, m })
      }
      log.sweeps.push({ name: sw.name, frames })
    }
  }

  if (mode === 'scan' || mode === 'both') {
    // fine scan: 41 steps per sweep, forward then backward, metrics only
    const fine = []
    const pick = m => {
      const o = k => m.els[k] ? m.els[k].o : null
      return {
        chapter: m.chapter, soil: m.soil, theme: m.theme, holder: m.holder, plant: m.plant, cardOpen: m.cardOpen, cardO: m.card.o, cardTop: m.card.r.y,
        heroOn: !!m.hero, heroX: m.hero ? +m.hero.x.toFixed(0) : null, heroY: m.hero ? +m.hero.y.toFixed(0) : null,
        scentsOn: m.scents.map(s => !!s), scentY: m.scents.map(s => s ? +s.y.toFixed(0) : null), finaleOn: !!m.finale,
        chips: [o('chip0'), o('chip1'), o('chip2')], giants: [o('giant0'), o('giant1'), o('giant2'), o('giant3')], beats: [o('beat0'), o('beat1'), o('beat2'), o('beat3')],
        sproutCopy: o('sprout-day'), ext: m.paths['stem-ext'] ? m.paths['stem-ext'].drawn : null, extStroke: m.paths['stem-ext'] ? m.paths['stem-ext'].stroke : null, stem: m.paths.stem ? m.paths.stem.drawn : null,
        hangers: m.hangers.map(h => h.enabled ? 1 : 0).join(''),
      }
    }
    for (const sw of list) {
      const a = sw.ps[0], b = sw.ps[sw.ps.length - 1]
      const n = 41
      const fwd = [], back = []
      for (let i = 0; i < n; i++) {
        const p = a + (b - a) * i / (n - 1)
        await page.evaluate(p => __dbg.scrollTo(p), p)
        await page.waitForTimeout(120); await pump(page, 2)
        fwd.push({ p, ...pick(await page.evaluate(METRICS)) })
      }
      for (let i = n - 1; i >= 0; i--) {
        const p = a + (b - a) * i / (n - 1)
        await page.evaluate(p => __dbg.scrollTo(p), p)
        await page.waitForTimeout(120); await pump(page, 2)
        back[i] = { p, ...pick(await page.evaluate(METRICS)) }
      }
      // flag jumps between adjacent forward steps
      const jumps = []
      const num = (x, y, k, thr) => { if (x[k] == null || y[k] == null) return; if (Math.abs(x[k] - y[k]) > thr) jumps.push(`${k}: ${x[k]} -> ${y[k]} at p=${y.p.toFixed(4)}`) }
      for (let i = 1; i < n; i++) {
        const x = fwd[i - 1], y = fwd[i]
        num(x, y, 'soil', 0.2); num(x, y, 'holder', 0.3); num(x, y, 'plant', 0.3); num(x, y, 'cardOpen', 0.3); num(x, y, 'cardO', 0.5); num(x, y, 'cardTop', 60)
        if (x.heroOn !== y.heroOn) jumps.push(`heroOn: ${x.heroOn} -> ${y.heroOn} at p=${y.p.toFixed(4)} (holder ${y.holder})`)
        if (x.heroOn && y.heroOn && (Math.abs(x.heroX - y.heroX) > 90 || Math.abs(x.heroY - y.heroY) > 90)) jumps.push(`hero pos: ${x.heroX},${x.heroY} -> ${y.heroX},${y.heroY} at p=${y.p.toFixed(4)}`)
        if (x.hangers !== y.hangers) jumps.push(`hangers: ${x.hangers} -> ${y.hangers} at p=${y.p.toFixed(4)}`)
        x.chips.forEach((c, k) => { if (c != null && y.chips[k] != null && Math.abs(c - y.chips[k]) > 0.45) jumps.push(`chip${k} opacity: ${c} -> ${y.chips[k]} at p=${y.p.toFixed(4)}`) })
        x.giants.forEach((c, k) => { if (c != null && y.giants[k] != null && Math.abs(c - y.giants[k]) > 0.45) jumps.push(`giant${k} opacity: ${c} -> ${y.giants[k]} at p=${y.p.toFixed(4)}`) })
        x.beats.forEach((c, k) => { if (c != null && y.beats[k] != null && Math.abs(c - y.beats[k]) > 0.45) jumps.push(`beat${k} opacity: ${c} -> ${y.beats[k]} at p=${y.p.toFixed(4)}`) })
        if (x.sproutCopy != null && Math.abs(x.sproutCopy - y.sproutCopy) > 0.45) jumps.push(`sprout copy opacity: ${x.sproutCopy} -> ${y.sproutCopy} at p=${y.p.toFixed(4)}`)
        if (x.ext != null && Math.abs(x.ext - y.ext) > 0.3) jumps.push(`stem-ext drawn: ${x.ext} -> ${y.ext} at p=${y.p.toFixed(4)}`)
        if (x.extStroke !== y.extStroke) jumps.push(`stem-ext stroke: ${x.extStroke} -> ${y.extStroke} at p=${y.p.toFixed(4)} (soil ${y.soil})`)
        if (x.theme !== y.theme) jumps.push(`theme: ${x.theme} -> ${y.theme} at p=${y.p.toFixed(4)} (soil ${y.soil})`)
      }
      // hysteresis: forward vs backward at the same progress
      const hyst = []
      for (let i = 0; i < n; i++) {
        const f = fwd[i], r = back[i]
        for (const k of ['soil', 'holder', 'plant', 'cardOpen', 'cardO', 'theme', 'heroOn', 'hangers', 'ext', 'stem', 'sproutCopy']) {
          if (typeof f[k] === 'number' && typeof r[k] === 'number') { if (Math.abs(f[k] - r[k]) > 0.05) hyst.push(`${k} fwd=${f[k]} back=${r[k]} at p=${f.p.toFixed(4)}`) }
          else if (f[k] !== r[k]) hyst.push(`${k} fwd=${f[k]} back=${r[k]} at p=${f.p.toFixed(4)}`)
        }
        f.chips.forEach((c, k) => { if (c != null && r.chips[k] != null && Math.abs(c - r.chips[k]) > 0.3) hyst.push(`chip${k} fwd=${c} back=${r.chips[k]} at p=${f.p.toFixed(4)}`) })
      }
      console.log(`\n[scan ${sw.name}] p ${a.toFixed(4)} -> ${b.toFixed(4)}`)
      if (jumps.length) console.log('  JUMPS:\n   ' + jumps.join('\n   ')); else console.log('  no jumps')
      if (hyst.length) console.log('  HYSTERESIS:\n   ' + hyst.slice(0, 12).join('\n   ') + (hyst.length > 12 ? `\n   ... ${hyst.length - 12} more` : '')); else console.log('  no hysteresis')
      fine.push({ name: sw.name, fwd, back, jumps, hyst })
    }
    log.fine = fine
  }
  fs.writeFileSync(out + `bd-${name}-${process.env.SWEEP ? process.env.SWEEP + '-' : ''}${mode}-log.json`, JSON.stringify(log, null, 1))
  console.log(name, 'console errors/warnings:', errors.length ? errors : 'none')
  await browser.close()
}
