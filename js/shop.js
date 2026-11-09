/* Shop page: one card per line of the "shop" list in js/config.js, each with its own quantity
   and an Add to bag button. The bag, its drawer and the checkout are cart.js, the same module
   the home page uses, so the bag is shared. Shares scroll.js and ui.js with the other pages. */
import { lenis, motion, prefersReduced } from './scroll.js'
import { cfg, escapeHtml, fillPlaceholders, fillSlots, initSplit, fontsSettled, resplitWhenFontsArrive, initMagnetic, initMotionToggle, initMenu } from './ui.js'
import { shopList, MAX_QTY } from './cart.js'

const pad = n => String(n).padStart(2, '0')
const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const FORMATS = { mirror: 'Mirror cord', vent: 'Vent clip' }
const ICON = {
  minus: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
}

/* what one card shows, as config paths: the chips carry the path and fillPlaceholders() sets the
   text, so no value from the config is written into the markup unescaped */
function describe(p) {
  const raw = cfg('shop')
  if (p.scent != null) {
    const i = Number(p.scent), s = cfg(`scents.${i}`) || {}
    const name = s.name ? String(s.name) : `Scent ${WORDS[i] || i + 1}`
    return {
      base: `scents.${i}`, image: p.format === 'vent' ? `scents.${i}.imageVent` : `scents.${i}.image`,
      // the six cards come in pairs: the chip says which scent, so the pairs read as pairs
      chipName: `scent ${WORDS[i] || i + 1}`, chipNotes: 'scent notes', format: FORMATS[p.format],
      label: `${name}, ${FORMATS[p.format].toLowerCase()}`, alt: `${name}, ${FORMATS[p.format].toLowerCase()} version`,
    }
  }
  const k = raw.indexOf(p)
  const name = p.name ? String(p.name) : 'Product'
  return { base: `shop.${k}`, image: `shop.${k}.image`, chipName: 'product name', chipNotes: 'product notes', format: null, label: name, alt: name }
}

function cardHtml(p, n) {
  const d = describe(p), id = escapeHtml(String(p.id)), t = `item-${n}`
  const format = d.format
    ? `<p class="kicker shop-format" id="${t}-format">${d.format} <span class="tbc" data-tbc="product.formatConfirmed">tbc</span></p>`
    : ''
  return `
    <li class="card shop-card" data-item-card="${id}">
      <span class="ghost-num" aria-hidden="true">${pad(n + 1)}</span>
      <figure class="card-media">
        <img class="slot" data-slot="${d.image}" alt="${escapeHtml(d.alt)}" width="1280" height="720" hidden>
        <span class="slot-label">[Photo]</span>
        ${d.format ? `<figcaption class="media-tag kicker" aria-hidden="true">${d.format}</figcaption>` : ''}
      </figure>
      <h3 class="card-title" id="${t}-title"><span class="ph" data-ph="${d.base}.name">${d.chipName}</span></h3>
      ${format}
      <p class="card-notes"><span class="ph" data-ph="${d.base}.notes">${d.chipNotes}</span></p>
      <dl class="card-meta">
        <div><dt>Pack</dt><dd><span class="ph" data-ph="${d.base}.packSize">pack size</span></dd></div>
        <div><dt>Price</dt><dd><span class="ph price" data-ph="${d.base}.price">price</span></dd></div>
      </dl>
      <div class="shop-buy">
        <div class="qty" role="group" aria-label="How many, ${escapeHtml(d.label)}">
          <button class="qty-btn" type="button" data-step="-1" aria-label="One fewer" disabled>${ICON.minus}</button>
          <input class="qty-num" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" step="1" value="1" aria-label="Quantity">
          <button class="qty-btn" type="button" data-step="1" aria-label="One more">${ICON.plus}</button>
        </div>
        <button class="pill small add-to-bag" type="button" data-item="${id}" aria-describedby="${t}-title${d.format ? ` ${t}-format` : ''}">Add to bag <span class="dot">·</span></button>
      </div>
    </li>`
}

function renderShop(items) {
  const list = document.getElementById('shop-grid')
  if (!list) return []
  if (!items.length) {
    list.innerHTML = '<li class="shop-empty"><p class="kicker">The shop is being stocked. Check back soon.</p></li>'
    return []
  }
  list.innerHTML = items.map(cardHtml).join('')
  const count = document.getElementById('shop-count')
  if (count) count.textContent = `${items.length} to choose from.`
  return [...list.querySelectorAll('.shop-card')]
}

/* ---------- the quantity on each card ---------- */
function clampQty(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_QTY, n) : 1
}
function syncStepper(card) {
  const field = card.querySelector('.qty-num'), [dec, inc] = card.querySelectorAll('[data-step]')
  const n = clampQty(field.value)
  if (dec) dec.disabled = n <= 1
  if (inc) inc.disabled = n >= MAX_QTY
}
function initSteppers() {
  const list = document.getElementById('shop-grid')
  if (!list) return
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-step]'); if (!btn) return
    const card = btn.closest('[data-item-card]'), field = card.querySelector('.qty-num')
    field.value = String(clampQty(clampQty(field.value) + Number(btn.dataset.step)))
    syncStepper(card)
    if (btn.disabled) field.focus({ preventScroll: true })   // the button just switched off under the keyboard
  })
  list.addEventListener('change', e => {
    const field = e.target.closest('.qty-num'); if (!field) return
    field.value = String(clampQty(field.value))
    syncStepper(field.closest('[data-item-card]'))
  })
  list.addEventListener('input', e => {
    const field = e.target.closest('.qty-num'); if (field) syncStepper(field.closest('[data-item-card]'))
  })
  list.addEventListener('keydown', e => {
    // Enter in a quantity field adds that many, like pressing the card's button
    if (e.key !== 'Enter' || !e.target.classList.contains('qty-num')) return
    e.preventDefault()
    e.target.value = String(clampQty(e.target.value))
    const card = e.target.closest('[data-item-card]')
    syncStepper(card)
    const add = card.querySelector('.add-to-bag'); if (add) add.click()
  })
  // the bag reads the field when the button is pressed; keep it tidy afterwards
  document.addEventListener('bag:change', () => list.querySelectorAll('[data-item-card]').forEach(syncStepper))
}

/* the note under the grid shows only while chips remain on the cards */
function noteMissing() {
  const note = document.getElementById('shop-note')
  if (note) note.hidden = !document.querySelector('.shop-card .ph')
}

/* ---------- gentle rise-in on first view ---------- */
let revealed = 0, revealTotal = 0
function initReveal(cards) {
  const hero = [...document.querySelectorAll('.shop-hero .team-hero-top > *, .shop-hero .team-hero-copy > :not(h1)')]
  revealTotal = cards.length
  if (prefersReduced || motion.paused) { revealed = revealTotal; return }
  gsap.from(hero, { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.15 })
  cards.forEach((el, i) => {
    gsap.from(el, {
      y: 34, opacity: 0, duration: 1.0, ease: 'power3.out', delay: (i % 3) * 0.08,
      scrollTrigger: { trigger: el, start: 'top 94%', once: true },
      onComplete: () => { revealed++ },
      onInterrupt: () => { revealed++ },
    })
  })
}

/* ---------- boot ---------- */
const items = shopList()
const cards = renderShop(items)
fillPlaceholders()
fillSlots()
noteMissing()
initSteppers()
initMagnetic()
initMotionToggle()
initMenu()
initReveal(cards)

/* Split the headings once the fonts are in, as on the team page */
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

/* ---------- numbers for verification ---------- */
window.__shop = {
  ready: true,
  count: () => document.querySelectorAll('.shop-card').length,
  ids: () => [...document.querySelectorAll('.shop-card')].map(c => c.dataset.itemCard),
  chips: () => document.querySelectorAll('.shop-card .ph').length,
  photos: () => ({
    shown: document.querySelectorAll('.shop-card img.slot:not([hidden])').length,
    labels: document.querySelectorAll('.shop-card .slot-label').length,
  }),
  revealed: () => revealed,
  revealTotal: () => revealTotal,
  scrollTo: y => { lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y) },
  hasLenis: !!lenis,
  motion,
}
