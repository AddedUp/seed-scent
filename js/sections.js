/* 2D section behaviour: the seed paper cross-section, the bulk tier slider,
   the order-request form, hover tilt on the scent cards, velocity skew on
   the spec rows and planting steps, and the first-view reveal.
   Everything here is progressive: no hook, no effect, no error. */
import { motion, prefersReduced, isCoarse, scroll } from './scroll.js'
import { cfg, num, money, escapeHtml, contactEmail } from './ui.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

/* ---------- one shared frame loop: runs only while something asked for frames ---------- */
const loop = (() => {
  const fns = new Set()
  let raf = 0, last = 0
  function frame(now) {
    raf = 0
    const dt = clamp((now - last) / 1000, 0.001, 0.05)
    last = now
    for (const fn of [...fns]) fn(dt, now / 1000)
    if (fns.size) raf = requestAnimationFrame(frame)
  }
  return {
    add(fn) { if (fns.has(fn)) return; fns.add(fn); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } },
    remove(fn) { fns.delete(fn) },
    has: fn => fns.has(fn),
    get size() { return fns.size },
    /* true while a frame is on the queue; false means nothing here will run until something asks again */
    pending: () => raf !== 0,
  }
})()

/* motion.paused flips at runtime: ui.js dispatches 'motion:toggle' on window with detail.paused.
   Every part below registers a watcher and gets the new state the moment it changes. */
const motionWatchers = new Set()
addEventListener('motion:toggle', e => {
  const paused = typeof e.detail?.paused === 'boolean' ? e.detail.paused : !!motion.paused
  motionWatchers.forEach(fn => fn(paused))
})

/* deterministic random so the drawing is the same on every visit */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const SVG_NS = 'http://www.w3.org/2000/svg'
function svgEl(name, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, name)
  for (const k in attrs) el.setAttribute(k, attrs[k])
  if (parent) parent.appendChild(el)
  return el
}
const f1 = n => (Math.round(n * 10) / 10).toString()
const f2 = n => (Math.round(n * 100) / 100).toString()

/* ==========================================================================
   1 · Seed paper, up close
   ========================================================================== */
function initCrossSection() {
  const svg = $('#paper-xsec')
  if (!svg) return null
  const W = 600, H = 420
  const rand = rng(20261104)
  const seeds = []       // { el, hx, hy, x, y, vx, vy, dirty }
  const drifters = []    // { el, amp, w, ph, cx, cy, rot }
  const pointer = { x: 0, y: 0, active: false }
  const RADIUS = 70, PUSH = 1500, K = 60, DAMP = 7, VMAX = 700

  /* sheet */
  const defs = svgEl('defs', {}, svg)
  const clip = svgEl('clipPath', { id: 'xsec-clip' }, defs)
  svgEl('rect', { x: 14, y: 14, width: W - 28, height: H - 28, rx: 22 }, clip)
  svgEl('rect', { class: 'xsec-shadow', x: 19, y: 21, width: W - 28, height: H - 28, rx: 22 }, svg)
  svgEl('rect', { class: 'xsec-sheet', x: 14, y: 14, width: W - 28, height: H - 28, rx: 22 }, svg)
  const sheet = svgEl('g', { 'clip-path': 'url(#xsec-clip)' }, svg)

  /* fibres: short curved strokes in warm neutrals */
  const fibres = svgEl('g', { class: 'xsec-fibres' }, sheet)
  const FIBRES = 240
  const fibreMeta = []
  for (let i = 0; i < FIBRES; i++) {
    const x = 6 + rand() * (W - 12), y = 6 + rand() * (H - 12)
    const len = 14 + Math.pow(rand(), 1.4) * 52
    const a = rand() * Math.PI * 2
    const dx = Math.cos(a), dy = Math.sin(a)
    const x2 = x + dx * len, y2 = y + dy * len
    const bend = (rand() - 0.5) * len * 0.55
    const cx = (x + x2) / 2 - dy * bend, cy = (y + y2) / 2 + dx * bend
    const r = rand()
    let cls, op, w = 0.6 + rand() * 1.1
    if (r < 0.56) { cls = 'fb-ink'; op = 0.07 + rand() * 0.1 }
    else if (r < 0.82) { cls = 'fb-moss'; op = 0.11 + rand() * 0.14 }
    else { cls = 'fb-light'; op = 0.8 + rand() * 0.2; w += 0.5 }
    const el = svgEl('path', {
      class: cls, d: `M${f1(x)} ${f1(y)} Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}`,
      'stroke-width': f2(w), 'stroke-opacity': f2(op),
    }, fibres)
    fibreMeta.push({ el, len, cx: (x + x2) / 2, cy: (y + y2) / 2 })
  }
  /* a few of the longer fibres drift when idle */
  fibreMeta.filter(m => m.len > 34).slice(0, 30).forEach(m => {
    drifters.push({ el: m.el, amp: 1 + rand() * 1.6, w: 0.25 + rand() * 0.4, ph: rand() * Math.PI * 2, cx: m.cx, cy: m.cy, rot: 0.8 + rand() * 1.6 })
  })

  /* grain: tiny specks */
  const grain = svgEl('g', { class: 'xsec-grain' }, sheet)
  for (let i = 0; i < 70; i++) {
    svgEl('circle', { cx: f1(14 + rand() * (W - 28)), cy: f1(14 + rand() * (H - 28)), r: f2(0.5 + rand() * 0.8), 'fill-opacity': f2(0.06 + rand() * 0.08) }, grain)
  }

  /* oil droplets: translucent sage and moss */
  const oil = svgEl('g', { class: 'xsec-oil' }, sheet)
  const drops = [
    [120, 110, 26], [455, 96, 19], [520, 300, 30], [250, 330, 16], [372, 215, 22], [88, 296, 14],
  ]
  drops.forEach(([x, y, r], i) => {
    const cls = i % 3 === 1 ? 'oil-moss' : 'oil-sage'
    const a = -30 + rand() * 60
    svgEl('ellipse', { class: cls, cx: x, cy: y, rx: r, ry: f1(r * 0.86), transform: `rotate(${f1(a)} ${x} ${y})`, 'fill-opacity': f2(0.13 + rand() * 0.08), 'stroke-opacity': 0.3 }, oil)
    svgEl('ellipse', { class: 'oil-hi', cx: f1(x - r * 0.34), cy: f1(y - r * 0.38), rx: f1(r * 0.24), ry: f1(r * 0.13), transform: `rotate(-32 ${f1(x - r * 0.34)} ${f1(y - r * 0.38)})`, 'fill-opacity': 0.55 }, oil)
  })

  /* seeds: 76 ellipses, spaced out, in dark earthy tones */
  const seedsG = svgEl('g', { class: 'xsec-seeds' }, sheet)
  const SEEDS = 76
  const placed = []
  for (let i = 0; i < SEEDS; i++) {
    let x = 0, y = 0, ok = false
    for (let tries = 0; tries < 80 && !ok; tries++) {
      x = 36 + rand() * (W - 72); y = 36 + rand() * (H - 72)
      ok = placed.every(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 > 17 * 17)
    }
    placed.push([x, y])
    const rx = 2.4 + rand() * 2, ry = rx * (0.55 + rand() * 0.18)
    const rot = rand() * 180
    const r = rand()
    const cls = r < 0.55 ? 'seed-a' : r < 0.8 ? 'seed-b' : 'seed-c'
    const g = svgEl('g', { class: 'xsec-seed', transform: `translate(${f1(x)} ${f1(y)})` }, seedsG)
    svgEl('ellipse', { class: cls, cx: 0, cy: 0, rx: f2(rx), ry: f2(ry), transform: `rotate(${f1(rot)})`, 'fill-opacity': f2(0.82 + rand() * 0.14) }, g)
    seeds.push({ el: g, hx: x, hy: y, x, y, vx: 0, vy: 0, dirty: false })
  }

  /* three tiny sprouts, growing from seeds that have room above them */
  const sproutD = 'M0 -1 C-0.6 -7 1.6 -11 0.6 -17 M0.2 -9.5 C-4.5 -9 -8.5 -12.5 -9.5 -17.5 C-5 -17.5 -1 -14.5 0.2 -9.5 Z M0.5 -13 C5 -12.5 9 -16 10 -21 C5.5 -21 1.5 -18 0.5 -13 Z'
  const sproutSeeds = seeds.filter(s => s.hy > 80 && s.hy < H - 40)
  const picks = [sproutSeeds[Math.floor(sproutSeeds.length * 0.12)], sproutSeeds[Math.floor(sproutSeeds.length * 0.5)], sproutSeeds[Math.floor(sproutSeeds.length * 0.86)]]
  picks.filter(Boolean).forEach((s, i) => {
    const sc = 1.15 + i * 0.12
    svgEl('path', { class: 'xsec-sprout', d: sproutD, transform: `scale(${f2(sc)})`, 'vector-effect': 'non-scaling-stroke' }, s.el)
  })

  /* ---- simulation ---- */
  let displaced = 0
  function step(dt, t) {
    displaced = 0
    const active = pointer.active
    for (const s of seeds) {
      if (active) {
        let dx = s.x - pointer.x, dy = s.y - pointer.y
        let d = Math.hypot(dx, dy)
        if (d < RADIUS) {
          if (d < 0.001) { dx = 1; dy = 0; d = 1 }
          const f = 1 - d / RADIUS
          const push = f * f * PUSH * dt
          s.vx += (dx / d) * push; s.vy += (dy / d) * push
        }
      }
      // spring home with damping
      s.vx += (-K * (s.x - s.hx) - DAMP * s.vx) * dt
      s.vy += (-K * (s.y - s.hy) - DAMP * s.vy) * dt
      const sp = Math.hypot(s.vx, s.vy)
      if (sp > VMAX) { s.vx *= VMAX / sp; s.vy *= VMAX / sp }
      s.x += s.vx * dt; s.y += s.vy * dt
      const off = Math.hypot(s.x - s.hx, s.y - s.hy)
      if (off > 0.05 || sp > 0.5) {
        s.dirty = true
        s.el.setAttribute('transform', `translate(${f2(s.x)} ${f2(s.y)})`)
        if (off > 0.5) displaced++
      } else if (s.dirty) {
        s.x = s.hx; s.y = s.hy; s.vx = s.vy = 0; s.dirty = false
        s.el.setAttribute('transform', `translate(${f1(s.hx)} ${f1(s.hy)})`)
      }
    }
    if (t != null) {
      for (const d of drifters) {
        const tx = Math.sin(t * d.w + d.ph) * d.amp, ty = Math.cos(t * d.w * 0.8 + d.ph) * d.amp * 0.7
        const rot = Math.sin(t * d.w * 0.6 + d.ph) * d.rot
        d.el.setAttribute('transform', `translate(${f2(tx)} ${f2(ty)}) rotate(${f2(rot)} ${f1(d.cx)} ${f1(d.cy)})`)
      }
    }
  }
  function rest() {
    pointer.active = false
    for (const s of seeds) if (s.dirty) { s.x = s.hx; s.y = s.hy; s.vx = s.vy = 0; s.dirty = false; s.el.setAttribute('transform', `translate(${f1(s.hx)} ${f1(s.hy)})`) }
    for (const d of drifters) d.el.removeAttribute('transform')
    displaced = 0
  }

  let inView = false
  const update = (dt, t) => {
    if (motion.paused) { rest(); loop.remove(update); return }
    if (!inView) { loop.remove(update); return }
    step(dt, t)
  }
  /* paused: every seed snaps home in the same tick and the figure lets go of the loop,
     so nothing here schedules a frame while motion is off. Play again: the idle drift resumes. */
  const kick = () => { if (motion.paused) { rest(); loop.remove(update) } else if (inView) loop.add(update) }
  motionWatchers.add(kick)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; kick() }, { rootMargin: '12% 0px' }).observe(svg)
  } else { inView = true; kick() }

  /* pointer -> viewBox coordinates */
  function toLocal(clientX, clientY) {
    const m = svg.getScreenCTM()
    if (m) {
      const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
      return [p.x, p.y]
    }
    const r = svg.getBoundingClientRect()
    return [((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * H]
  }
  function point(clientX, clientY) {
    if (motion.paused) return
    const [x, y] = toLocal(clientX, clientY)
    pointer.x = x; pointer.y = y; pointer.active = true
    kick()
  }
  if (isCoarse) {
    svg.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY) }, { passive: true })
    svg.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY) }, { passive: true })
    svg.addEventListener('touchend', () => { pointer.active = false }, { passive: true })
    svg.addEventListener('touchcancel', () => { pointer.active = false }, { passive: true })
  } else {
    svg.addEventListener('pointermove', e => point(e.clientX, e.clientY))
    svg.addEventListener('pointerleave', () => { pointer.active = false })
  }

  const api = {
    seeds: () => seeds.length,
    displaced: () => displaced,
    fibres: () => fibres.childElementCount,
    drops: () => drops.length,
    sprouts: () => svg.querySelectorAll('.xsec-sprout').length,
    running: () => loop.has(update),
    inView: () => inView,
    pointerActive: () => pointer.active,
    tick: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) step(dt, performance.now() / 1000) },
    point: (clientX, clientY) => point(clientX, clientY),
    release: () => { pointer.active = false },
  }
  window.__xsec = api
  return api
}

/* ==========================================================================
   2 · Bulk tiers: slider, live tier, note
   ========================================================================== */
function initTiers() {
  const range = $('#qty-range'), out = $('#qty-out'), note = $('#tier-note')
  const tiers = $$('#tiers li.tier[data-min]')
  const cfgTiers = Array.isArray(cfg('bulkTiers')) ? cfg('bulkTiers') : []

  const tierFor = n => {
    let best = null
    for (const li of tiers) { const m = Number(li.dataset.min); if (m <= n && (!best || m > Number(best.dataset.min))) best = li }
    return best
  }
  /* the per-unit price as a number, or null: 4.5, "4.5" and "4.50" all count, "abc" and "" do not */
  const priceFor = li => {
    if (!li) return null
    const m = Number(li.dataset.min)
    const t = cfgTiers.find(t => t && Number(t.min) === m) || cfgTiers[tiers.indexOf(li)]
    return t ? num(t.price) : null
  }
  const labelFor = li => li ? (li.querySelector('.tier-qty')?.textContent || '').trim() : ''

  if (!range || !out) return { tierFor, priceFor, labelFor }

  const shown = { v: Number(out.textContent) || Number(range.value) || 0 }
  const haveGsap = typeof gsap !== 'undefined'
  function apply(n, animate) {
    const li = tierFor(n)
    tiers.forEach(t => {
      const on = t === li
      t.classList.toggle('active', on)
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current')
    })
    if (note) {
      const m = money(priceFor(li))
      note.textContent = m != null ? `${m} each at ${n} ${n === 1 ? 'unit' : 'units'}` : 'Tiers and pricing are being finalized.'
    }
    if (!animate || motion.paused || !haveGsap) {
      if (haveGsap) gsap.killTweensOf(shown)
      shown.v = n; out.textContent = String(n); return
    }
    gsap.to(shown, { v: n, duration: 0.35, ease: 'power2.out', overwrite: true, onUpdate: () => { out.textContent = String(Math.round(shown.v)) } })
  }
  range.addEventListener('input', () => apply(Number(range.value), true))
  range.addEventListener('change', () => apply(Number(range.value), true))
  apply(Number(range.value), false)
  return { tierFor, priceFor, labelFor, apply }
}

/* ==========================================================================
   3 · Order request form
   ========================================================================== */
function initOrderForm(tiersApi) {
  const form = $('#order-form')
  if (!form) return null
  const f = {
    firm: $('#f-firm'), name: $('#f-name'), email: $('#f-email'),
    scent: $('#f-scent'), qty: $('#f-qty'), notes: $('#f-notes'),
  }
  const summary = $('#form-summary')
  if (summary) { summary.setAttribute('tabindex', '-1'); summary.setAttribute('aria-live', 'polite') }
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  let lastText = ''

  const fieldOf = el => el?.closest('.field')
  function setError(el, msg) {
    if (!el) return
    el.setAttribute('aria-invalid', 'true')
    const box = fieldOf(el); if (box) box.setAttribute('data-error', msg)
  }
  function clearError(el) {
    if (!el) return
    el.removeAttribute('aria-invalid')
    const box = fieldOf(el); if (box) box.removeAttribute('data-error')
  }
  Object.values(f).forEach(el => el?.addEventListener('input', () => clearError(el)))

  function validate() {
    const bad = []
    const firm = (f.firm?.value || '').trim(), name = (f.name?.value || '').trim(), email = (f.email?.value || '').trim()
    const qty = Number(f.qty?.value)
    if (f.firm) { if (!firm) { setError(f.firm, 'Needed'); bad.push(f.firm) } else clearError(f.firm) }
    if (f.name) { if (!name) { setError(f.name, 'Needed'); bad.push(f.name) } else clearError(f.name) }
    if (f.email) {
      if (!email) { setError(f.email, 'Needed'); bad.push(f.email) }
      else if (!EMAIL.test(email)) { setError(f.email, 'Needs an @ and a dot'); bad.push(f.email) }
      else clearError(f.email)
    }
    if (f.qty) { if (!Number.isInteger(qty) || qty < 1) { setError(f.qty, 'At least 1'); bad.push(f.qty) } else clearError(f.qty) }
    return { ok: bad.length === 0, bad, firm, name, email, qty }
  }

  function scentLabel() {
    const sel = f.scent
    if (!sel) return 'a mix of all three'
    const v = sel.value
    if (v === 'mix' || v === '') return 'a mix of all three'
    const name = cfg(`scents.${v}.name`)
    const opt = sel.options[sel.selectedIndex]
    return (typeof name === 'string' && name.trim()) ? name.trim() : (opt ? opt.textContent.trim() : 'a mix of all three')
  }

  function buildText({ firm, name, email, qty }) {
    const li = tiersApi?.tierFor ? tiersApi.tierFor(qty) : null
    const price = tiersApi?.priceFor ? tiersApi.priceFor(li) : null   // a number or null, never raw config text
    const label = tiersApi?.labelFor ? tiersApi.labelFor(li) : ''
    const tierLine = li ? `${label} at ${money(price) ?? '[ price ]'} each` : 'to be confirmed'
    const tierLabel = cfg('tiersConfirmed') === true ? 'Bulk tier' : 'Bulk tier (tiers to be confirmed)'
    const notes = (f.notes?.value || '').trim()
    return [
      'Order request for Seed Scent',
      '',
      `Firm: ${firm}`,
      `Contact: ${name}`,
      `Email: ${email}`,
      `Scent: ${scentLabel()}`,
      `Quantity: ${qty}`,
      `${tierLabel}: ${tierLine}`,
      `Notes: ${notes || 'none'}`,
      '',
      'Sent from the Seed Scent website',
    ].join('\n')
  }

  function render(text, contactEmail, opened) {
    if (!summary) return
    lastText = text
    const noteHtml = contactEmail
      ? (opened
        ? `An email draft to ${escapeHtml(contactEmail)} should have opened in your mail app. If it did not, copy the request and send it there yourself.`
        : `Copy the request and send it to ${escapeHtml(contactEmail)}.`)
      : 'The team has not published an order email yet. Nothing was sent. Copy the request and send it to them another way.'
    summary.innerHTML =
      `<p class="kicker">Your order request</p>` +
      `<pre class="summary-text">${escapeHtml(text)}</pre>` +
      `<div class="summary-actions"><button class="pill small ghost" type="button" data-copy>Copy request</button>` +
      `<p class="kicker soft summary-note">${noteHtml}</p></div>`
    summary.hidden = false
    const btn = summary.querySelector('[data-copy]')
    btn?.addEventListener('click', async () => {
      let ok = false
      try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(lastText); ok = true } } catch { ok = false }
      if (!ok) {
        try {
          const ta = document.createElement('textarea')
          ta.value = lastText; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
          document.body.appendChild(ta); ta.select(); ok = document.execCommand && document.execCommand('copy'); ta.remove()
        } catch { ok = false }
      }
      btn.textContent = ok ? 'Copied' : 'Copy failed. Select the text instead.'
      btn.classList.toggle('copied', !!ok)
      clearTimeout(btn._t)
      btn._t = setTimeout(() => { btn.textContent = 'Copy request'; btn.classList.remove('copied') }, 2200)
    })
    try { summary.focus({ preventScroll: true }) } catch { /* fine */ }
  }

  form.addEventListener('submit', e => {
    e.preventDefault()
    const v = validate()
    if (!v.ok) { v.bad[0].focus(); return }
    const text = buildText(v)
    const to = contactEmail()   // null when there is no address an email app could use
    let opened = false
    if (to) {
      const subject = 'Order request for Seed Scent'
      const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`
      try { window.location.href = href; opened = true } catch { opened = false }
    }
    render(text, to, opened)
  })

  return { validate, buildText, last: () => lastText }
}

/* ==========================================================================
   4 · Hover tilt on [data-tilt]
   ========================================================================== */
function initTilt() {
  const els = $$('[data-tilt]')
  if (!els.length || isCoarse) return { count: 0, active: () => 0 }
  const MAX = 6
  let active = 0
  els.forEach(el => {
    const st = { rx: 0, ry: 0, tx: 0, ty: 0, on: false }
    const update = () => {
      st.rx += (st.tx - st.rx) * 0.14; st.ry += (st.ty - st.ry) * 0.14
      if (!st.on && Math.abs(st.rx) < 0.02 && Math.abs(st.ry) < 0.02) {
        st.rx = st.ry = 0; el.style.transform = ''; loop.remove(update); return
      }
      el.style.transform = `perspective(900px) rotateX(${st.rx.toFixed(3)}deg) rotateY(${st.ry.toFixed(3)}deg)`
    }
    const off = () => { if (st.on) active--; st.on = false; st.tx = st.ty = 0; loop.add(update) }
    /* paused: no easing back, the card is flat at once and asks for no more frames */
    const flat = () => { if (st.on) active--; st.on = false; st.tx = st.ty = st.rx = st.ry = 0; el.style.transform = ''; loop.remove(update) }
    el.addEventListener('pointermove', e => {
      if (motion.paused) { if (st.on || st.rx || st.ry) flat(); return }
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      const ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1)
      st.tx = -ny * MAX; st.ty = nx * MAX
      if (!st.on) { st.on = true; active++ }
      loop.add(update)
    })
    el.addEventListener('pointerleave', off)
    motionWatchers.add(paused => { if (paused) flat() })
  })
  return { count: els.length, active: () => active }
}

/* ==========================================================================
   5 · Velocity skew on the spec rows and the planting steps
   ========================================================================== */
function initSkew() {
  const rows = $$('#spec tbody tr, .steps li')
  const section = $('#inside')
  if (!rows.length || !section) return { skew: () => 0, rows: 0 }
  const MAX = 4, GAIN = 0.08
  let cur = 0, inView = false, lastRaw = 0, stale = 0, applied = 0

  /* straighten every row in the same tick and stop asking for frames */
  const reset = () => {
    cur = 0; lastRaw = 0; stale = 0
    if (applied !== 0) { applied = 0; rows.forEach(r => { r.style.transform = '' }) }
    loop.remove(update)
  }
  const update = () => {
    if (motion.paused) { reset(); return }
    let v = Number(scroll.vel) || 0
    // if the upstream reader stopped updating, a stuck velocity must not leave rows leaning
    if (v === lastRaw && v !== 0) { if (++stale > 8) v = 0 } else stale = 0
    lastRaw = Number(scroll.vel) || 0
    const target = clamp(v * GAIN, -MAX, MAX)
    cur += (target - cur) * 0.12
    if (Math.abs(cur) < 0.005 && Math.abs(target) < 0.005) {
      if (applied !== 0) { applied = 0; cur = 0; rows.forEach(r => { r.style.transform = '' }) }
      if (!inView) loop.remove(update)
      return
    }
    if (Math.abs(cur - applied) > 0.004) {
      applied = cur
      const s = cur.toFixed(3)
      rows.forEach(r => { r.style.transform = `skewY(${s}deg)` })
    }
  }
  // (re)start while motion is on: update unwinds to 0 and removes itself once out of view
  const kick = () => { if (motion.paused) reset(); else loop.add(update) }
  // the toggle: paused means straight rows now, not after an ease; play means pick the velocity back up
  motionWatchers.add(paused => { if (paused) reset(); else kick() })
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; kick() }, { rootMargin: '10% 0px' }).observe(section)
  } else { inView = true; kick() }
  return { skew: () => applied, rows: rows.length, running: () => loop.has(update) }
}

/* ==========================================================================
   6 · Reveal on first view
   ========================================================================== */
function initReveal() {
  const els = $$('.tier, .way, .steps li, .card')
  let revealed = 0
  // motion off from the start (the preference, or paused before this module ran): everything is simply there
  if (!els.length || prefersReduced || motion.paused || !('IntersectionObserver' in window)) {
    return { total: els.length, revealed: () => ((prefersReduced || motion.paused) ? els.length : 0), pending: () => 0 }
  }
  els.forEach(el => el.classList.add('rv'))
  const pending = new Set(els)
  const strip = el => { el.classList.remove('rv', 'in'); el.style.removeProperty('--rv-delay') }
  const io = new IntersectionObserver(entries => {
    const batch = entries.filter(e => e.isIntersecting)
      .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left))
    batch.forEach((e, i) => {
      const el = e.target
      io.unobserve(el)
      if (!pending.delete(el)) return
      const delay = Math.min(i, 5) * 80
      el.style.setProperty('--rv-delay', `${delay}ms`)
      requestAnimationFrame(() => el.classList.add('in'))
      setTimeout(() => strip(el), 1000 + delay)
      revealed++
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })
  els.forEach(el => io.observe(el))
  /* motion paused mid-page: nothing stays hidden waiting for a rise it will never get, and
     anything mid-transition lands at once. Playing again does not hide what is already shown. */
  motionWatchers.add(paused => {
    if (!paused) return
    for (const el of pending) { io.unobserve(el); revealed++ }
    pending.clear()
    els.forEach(strip)
  })
  return { total: els.length, revealed: () => revealed, pending: () => pending.size }
}

/* ==========================================================================
   7 · Scent cards: the photo follows the format picker
   Each card holds two photos, the mirror cord version and the vent clip version.
   The figure's data-format says which one shows (css/sections.css does the fade).
   A missing file never leaves the slot empty: the card keeps the photo it has,
   and the tag on the photo always names the version actually shown.
   ========================================================================== */
const FORMAT_NAMES = { mirror: 'Mirror cord', vent: 'Vent clip' }
function initFormatPhotos() {
  const cards = $$('.card[data-scent]').map(card => {
    const media = $('.card-media', card), tag = $('.media-tag', card)
    const radios = $$('.format input[type="radio"]', card)
    if (!media || !radios.length) return null
    const imgs = { mirror: $('img.slot[data-for="mirror"]', card), vent: $('img.slot[data-for="vent"]', card) }
    const ready = k => !!(imgs[k] && !imgs[k].hidden && imgs[k].getAttribute('src'))
    const picked = () => ((radios.find(r => r.checked) || {}).value === 'vent' ? 'vent' : 'mirror')
    let shown = null
    const sync = () => {
      const want = picked(), other = want === 'vent' ? 'mirror' : 'vent'
      shown = ready(want) ? want : ready(other) ? other : null
      if (shown) media.dataset.format = shown
      media.classList.toggle('has-photo', !!shown)
      if (tag) { tag.hidden = !shown; if (shown && tag.textContent !== FORMAT_NAMES[shown]) tag.textContent = FORMAT_NAMES[shown] }
    }
    radios.forEach(r => r.addEventListener('change', sync))
    Object.values(imgs).forEach(img => { if (img) img.addEventListener('load', sync) })
    sync()
    return { picked, shown: () => shown }
  }).filter(Boolean)
  return { count: cards.length, state: () => cards.map(c => ({ picked: c.picked(), shown: c.shown() })) }
}

/* ---------- go ---------- */
const formats = initFormatPhotos()
const xsec = initCrossSection()
const tiers = initTiers()
const order = initOrderForm(tiers)
const tilt = initTilt()
const skew = initSkew()
const reveal = initReveal()

/* numbers for verification */
window.__sections = {
  loop: () => loop.size,
  rafPending: () => loop.pending(),
  paused: () => !!motion.paused,
  reveal: () => ({ total: reveal.total, revealed: reveal.revealed(), pending: reveal.pending ? reveal.pending() : 0 }),
  skew: () => skew.skew(),
  skewRunning: () => (skew.running ? skew.running() : false),
  skewRows: skew.rows,
  tilt: () => ({ count: tilt.count, active: tilt.active() }),
  tier: n => { const li = tiers.tierFor(n); return li ? { label: tiers.labelFor(li), min: Number(li.dataset.min), price: tiers.priceFor(li) } : null },
  order: () => (order ? order.last() : ''),
  formats: () => formats.state(),
  xsec: () => (xsec ? { seeds: xsec.seeds(), displaced: xsec.displaced(), fibres: xsec.fibres(), drops: xsec.drops(), sprouts: xsec.sprouts(), running: xsec.running(), pointerActive: xsec.pointerActive() } : null),
}
