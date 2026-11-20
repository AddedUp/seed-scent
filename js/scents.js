/* Scent Breakdown page: one card per scent, built from the scents list (the five signatures) and
   the limitedScents list (the Bake and Bloom Collection) in js/config.js. A signature card links
   to the shop with that scent picked; a limited edition card links to the bundle it is sold in.
   Shares scroll.js and ui.js with the other pages. */
import { lenis, motion, prefersReduced } from './scroll.js'
import { cfg, escapeHtml, fillPlaceholders, initSplit, fontsSettled, resplitWhenFontsArrive, initMagnetic, initMotionToggle, initMenu } from './ui.js'

const pad = n => String(n).padStart(2, '0')
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function blendHtml(blend) {
  const parts = Array.isArray(blend) ? blend.filter(b => b && b.oil && Number(b.share) > 0) : []
  if (!parts.length) return ''
  return `<div class="blend">
      <p class="kicker">The blend, roughly</p>
      <div class="blend-bar" aria-hidden="true">${parts.map(b => `<i style="flex:${Number(b.share)}"></i>`).join('')}</div>
      <ul class="blend-deep">${parts.map(b => `<li>
        <p class="blend-row"><b>${Number(b.share)}%</b> ${escapeHtml(b.oil)}</p>
        ${b.note || b.about ? `<p class="blend-about">${b.note ? `<strong>${escapeHtml(b.note)}.</strong> ` : ''}${escapeHtml(b.about || '')}</p>` : ''}
      </li>`).join('')}</ul>
    </div>`
}
function cardHtml(s, i, link) {
  const name = String(s.name)
  return `<li class="card scent-card" id="s-${slug(name)}">
      <span class="ghost-num" aria-hidden="true">${pad(i + 1)}</span>
      ${s.image ? `<figure class="card-media"><img src="${escapeHtml(s.image)}" alt="${escapeHtml(link.alt(name))}" width="1280" height="720" loading="lazy"></figure>` : ''}
      <h3 class="card-title">${escapeHtml(name)}</h3>
      ${s.notes ? `<p class="card-notes">${escapeHtml(s.notes)}</p>` : ''}
      ${blendHtml(s.blend)}
      <a class="pill small scent-shop" href="${escapeHtml(link.href(name))}" aria-label="${escapeHtml(link.label)}: ${escapeHtml(name)}">${escapeHtml(link.label)} <span class="dot">·</span></a>
    </li>`
}
function build() {
  const named = l => (Array.isArray(l) ? l : []).filter(s => s && s.name)
  const sig = document.getElementById('signature-grid'), bake = document.getElementById('bake-grid')
  const scents = named(cfg('scents'))
  if (sig) {
    sig.innerHTML = scents.map((s, i) => cardHtml(s, i, {
      label: 'Shop this scent', href: n => `shop.html?scent=${encodeURIComponent(n)}#products`, alt: n => `${n} seed paper in its wooden holder`,
    })).join('')
    if (!scents.length) sig.closest('section').hidden = true
  }
  const lim = cfg('limitedScents') || {}, limited = named(lim.scents)
  if (bake) {
    bake.innerHTML = limited.map((s, i) => cardHtml(s, i, {
      label: 'Shop the bundle', href: () => `shop.html#p-${encodeURIComponent(lim.bundle || '')}`, alt: n => `${n} seed paper from the ${lim.name || 'limited edition'} bundle`,
    })).join('')
    if (!limited.length) bake.closest('section').hidden = true
  }
  return { signature: scents.length, limited: limited.length }
}

/* the bag lives on the shop and the home page; only its count shows here */
function initBagCount() {
  const count = document.getElementById('bag-count'); if (!count) return
  const units = () => { try { const raw = JSON.parse(localStorage.getItem('seedscent.bag') || '[]'); return Array.isArray(raw) ? raw.reduce((s, l) => { const q = l && typeof l === 'object' ? Math.floor(Number(l.qty)) : NaN; return Number.isFinite(q) && q >= 1 ? s + q : s }, 0) : 0 } catch { return 0 } }
  count.textContent = String(units())
}
function initJumps() {
  document.querySelectorAll('.guide-hero a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'))
    if (!target || !lenis) return
    e.preventDefault()
    lenis.scrollTo(target, { offset: -90, duration: 1.1 })
    history.replaceState(null, '', a.getAttribute('href'))
  }))
}
function initReveal() {
  if (prefersReduced || motion.paused) return
  gsap.from('.guide-hero .team-hero-top > *, .guide-hero .team-hero-copy > :not(h1)', { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.15 })
  document.querySelectorAll('.scent-grid').forEach(grid => gsap.from(grid.children, {
    y: 26, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07,
    scrollTrigger: { trigger: grid, start: 'top 92%', once: true },
  }))
}

const counts = build()
fillPlaceholders()
initMagnetic()
initMotionToggle()
initMenu()
initBagCount()
initJumps()
initReveal()

const splitEls = [...document.querySelectorAll('[data-split]')]
if (!prefersReduced) splitEls.forEach(el => { el.style.visibility = 'hidden' })
fontsSettled(splitEls).then(how => {
  splitEls.forEach(el => { el.style.visibility = '' })
  initSplit()
  ScrollTrigger.refresh()
  if (how === 'timeout') resplitWhenFontsArrive(() => ScrollTrigger.refresh())
})
const refresh = () => ScrollTrigger.refresh()
addEventListener('load', refresh)
addEventListener('resize', refresh)

window.__scents = { ready: true, ...counts }
