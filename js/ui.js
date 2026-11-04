/* Shell behaviour: text reveals, magnetic buttons, placeholders from config,
   photo slots, the push hint, the motion toggle, anchor scrolling. */
import { lenis, motion, prefersReduced } from './scroll.js'

const CFG = window.SEED_SCENT || {}

/* resolve "a.b.0.c" in the config */
export function cfg(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), CFG)
}
export function money(n) {
  if (n == null || isNaN(n)) return null
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: CFG.currency || 'USD' }).format(n) }
  catch { return '$' + Number(n).toFixed(2) }
}

/* ---------- placeholders: fill what the config knows, chip the rest ---------- */
export function fillPlaceholders() {
  document.querySelectorAll('[data-ph]').forEach(el => {
    const path = el.dataset.ph
    let v = cfg(path)
    if (v === null || v === undefined || v === '') return
    if (el.classList.contains('price')) v = money(v)
    if (path === 'product.fixativeName') v = ' · ' + v
    if (path === 'contact.instagram') v = '@' + String(v).replace(/^@/, '')
    el.textContent = v
    el.classList.remove('ph', 'optional')
    el.removeAttribute('data-ph')
  })
  document.querySelectorAll('[data-tbc]').forEach(el => { if (cfg(el.dataset.tbc) === true) el.hidden = true })
  document.querySelectorAll('.tbc').forEach(el => { if (!el.title) el.title = 'To be confirmed by the team' })

  const mp = document.getElementById('marketplace-link')
  if (mp) {
    if (CFG.marketplaceUrl) { mp.href = CFG.marketplaceUrl; mp.target = '_blank'; mp.rel = 'noopener' }
    else { mp.setAttribute('aria-disabled', 'true'); mp.href = '#firms' }
  }
  // planting steps from config (if edited there)
  const steps = cfg('product.plantingSteps')
  const list = document.getElementById('planting-steps')
  if (Array.isArray(steps) && list && steps.length) {
    list.innerHTML = steps.map((s, i) => `<li><span class="step-num">${String(i + 1).padStart(2, '0')}</span><p>${escapeHtml(s)}</p></li>`).join('')
  }
  // scent options in the order form
  const sel = document.getElementById('f-scent')
  if (sel) (CFG.scents || []).forEach((s, i) => { const o = sel.querySelector(`option[value="${i}"]`); if (o && s.name) o.textContent = s.name })
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

/* photo slots: show the image only if the file exists */
export function fillSlots() {
  document.querySelectorAll('img.slot[data-slot]').forEach(img => {
    const src = cfg(img.dataset.slot)
    if (!src) return
    const probe = new Image()
    probe.onload = () => {
      img.src = src; img.hidden = false
      const label = img.parentElement.querySelector('.slot-label'); if (label) label.remove()
    }
    probe.src = src
  })
}

/* ---------- masked line reveals ---------- */
export function initSplit() {
  const els = document.querySelectorAll('[data-split]')
  if (prefersReduced) return
  els.forEach(el => {
    const split = new SplitText(el, { type: 'lines', linesClass: 'split-line-inner' })
    split.lines.forEach(line => {
      const wrap = document.createElement('div')
      wrap.className = 'split-line'
      line.parentNode.insertBefore(wrap, line)
      wrap.appendChild(line)
    })
    gsap.from(split.lines, {
      yPercent: 110, duration: 1.0, ease: 'power4.out', stagger: 0.07,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    })
  })
}

/* ---------- magnetic pills ---------- */
export function initMagnetic() {
  if (matchMedia('(pointer: coarse)').matches) return
  document.querySelectorAll('[data-magnetic]').forEach(el => {
    el.addEventListener('pointermove', e => {
      if (!motion.active) return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
      gsap.to(el, { x: dx * 0.28, y: dy * 0.28, duration: 0.3, ease: 'power2.out' })
    })
    el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'power4.out' }))
  })
}

/* ---------- anchors scroll smoothly through Lenis ---------- */
export function initAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1)
      const target = document.getElementById(id)
      if (!target || a.getAttribute('aria-disabled') === 'true') { if (!target) return; e.preventDefault(); return }
      e.preventDefault()
      // pinned chapters: land a little way in so the first beat shows
      const extra = target.classList.contains('ch-drive') ? innerHeight * 0.35 : 0
      if (lenis) lenis.scrollTo(target, { offset: extra, duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) })
      else window.scrollTo({ top: target.offsetTop + extra, behavior: 'smooth' })
    })
  })
}

/* ---------- the push hint and the motion toggle ---------- */
export function initHint() {
  const hint = document.getElementById('push-hint')
  if (!hint) return
  let shown = false
  const t = setTimeout(() => { if (!matchMedia('(pointer: coarse)').matches) { hint.classList.add('show'); shown = true } }, 1800)
  addEventListener('pendant:interact', () => { clearTimeout(t); hint.classList.remove('show') }, { once: true })
  addEventListener('scroll', () => { if (shown && scrollY > innerHeight * 0.3) hint.classList.remove('show') }, { passive: true })
}

export function initMenu() {
  const btn = document.getElementById('menu-toggle'), nav = document.getElementById('nav')
  if (!btn || !nav) return
  const set = open => { nav.classList.toggle('menu-open', open); btn.setAttribute('aria-expanded', String(open)) }
  btn.addEventListener('click', () => set(!nav.classList.contains('menu-open')))
  nav.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => set(false)))
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false) })
}

export function initMotionToggle() {
  const btn = document.getElementById('motion-toggle')
  if (!btn) return
  const apply = () => {
    btn.setAttribute('aria-pressed', String(motion.paused))
    btn.textContent = motion.paused ? 'Play motion' : 'Pause motion'
    document.body.classList.toggle('reduced', motion.paused)
  }
  apply()
  btn.addEventListener('click', () => { motion.paused = !motion.paused; apply() })
}

/* nav: dotted underline follows the chapter */
let lastNav = ''
export function setNavActive(name) {
  const map = { hero: '', drive: 'drive', sprout: 'drive', scents: 'scents', cards: 'scents', inside: 'inside', firms: 'firms', about: 'finale', finale: 'finale' }
  const key = map[name] ?? ''
  if (key === lastNav) return
  lastNav = key
  document.querySelectorAll('.nav-links a[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === key))
}
