/* Shop page: one card per line of the "shop" list in js/config.js, each with its own quantity
   and an Add to bag button. The bag, its drawer and the checkout are cart.js, the same module
   the home page uses, so the bag is shared. Shares scroll.js and ui.js with the other pages. */
import { lenis, motion, prefersReduced } from './scroll.js'
import { cfg, escapeHtml, fillPlaceholders, fillSlots, initSplit, fontsSettled, resplitWhenFontsArrive, initMagnetic, initMotionToggle, initMenu } from './ui.js'
import { shopList, itemOptions, veLink, MAX_QTY } from './cart.js'

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
  return { base: `shop.${k}`, image: `shop.${k}.image`, chipName: 'product name', chipNotes: 'product notes', format: null, label: name, alt: name, k }
}

/* the one choice a product can offer (edition, scent): a small set of radio pills */
function choiceHtml(p, t) {
  const opts = itemOptions(p)
  if (!opts.length) return ''
  const label = p.choice && p.choice.label ? String(p.choice.label) : 'Choose'
  return `<fieldset class="item-pick"><legend class="kicker">${escapeHtml(label)}</legend>
    <select class="item-choice" id="${t}-choice" aria-label="${escapeHtml(label)}">${opts.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>
  </fieldset>`
}
/* what is in the box, one line each */
function contentsHtml(p) {
  const c = Array.isArray(p.contents) ? p.contents.filter(x => typeof x === 'string' && x.trim()) : []
  if (!c.length) return ''
  return `<div class="item-inside"><p class="kicker">Inside</p><ul>${c.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`
}

/* upselling: a product can point at another one that goes well with it (goesWith: its id) */
function goesWithHtml(p) {
  const other = p.goesWith ? shopList().find(x => String(x.id) === String(p.goesWith)) : null
  if (!other || !other.name) return ''
  const note = p.goesWithNote ? ` <span class="goes-note">${escapeHtml(String(p.goesWithNote))}</span>` : ''
  return `<p class="goes-with"><span class="kicker">Goes well with</span> <a class="text-link" href="#p-${escapeHtml(String(other.id))}">${escapeHtml(String(other.name))}</a>${note}</p>`
}

function cardHtml(p, n) {
  const d = describe(p), id = escapeHtml(String(p.id)), t = `item-${n}`
  const own = p.scent == null
  const ve = own ? veLink(p, itemOptions(p)[0] ?? null) : null   // the link for the option shown first
  const format = d.format
    ? `<p class="kicker shop-format" id="${t}-format">${d.format} <span class="tbc" data-tbc="product.formatConfirmed">tbc</span></p>`
    : ''
  const kicker = own && p.kicker ? `<p class="kicker shop-kicker">${escapeHtml(String(p.kicker))}</p>` : ''
  const inside = own ? contentsHtml(p) : ''
  // a product with no notes yet simply has none: the chip is for scents, whose notes the team owes
  const notes = own && (p.notes == null || p.notes === '') ? '' : `<p class="card-notes"><span class="ph" data-ph="${d.base}.notes">${d.chipNotes}</span></p>`
  const per = own && p.per ? `<span class="price-per"> a ${escapeHtml(String(p.per))}</span>` : ''
  const meta = inside
    ? `<dl class="card-meta"><div><dt>Price</dt><dd><span class="ph price" data-ph="${d.base}.price">price</span>${per}</dd></div></dl>`
    : `<dl class="card-meta">
        <div><dt>Pack</dt><dd><span class="ph" data-ph="${d.base}.packSize">pack size</span></dd></div>
        <div><dt>Price</dt><dd><span class="ph price" data-ph="${d.base}.price">price</span>${per}</dd></div>
      </dl>`
  return `
    <li class="card shop-card" id="p-${id}" data-item-card="${id}">
      <span class="ghost-num" aria-hidden="true">${pad(n + 1)}</span>
      <figure class="card-media">
        <img class="slot" data-slot="${d.image}" alt="${escapeHtml(d.alt)}" width="1280" height="800" hidden>
        <span class="slot-label">[Photo]</span>
        ${d.format ? `<figcaption class="media-tag kicker" aria-hidden="true">${d.format}</figcaption>` : ''}
      </figure>
      ${kicker}
      <h3 class="card-title" id="${t}-title"><span class="ph" data-ph="${d.base}.name">${d.chipName}</span></h3>
      ${format}
      ${notes}
      ${inside}
      ${meta}
      ${own ? goesWithHtml(p) : ''}
      ${ve ? `${own ? choiceHtml(p, t) : ''}<div class="shop-buy shop-buy-ve">
        <a class="pill small buy-ve" href="${escapeHtml(ve)}" target="_blank" rel="noopener" aria-describedby="${t}-title">Buy on the VE marketplace <span class="dot">·</span></a>
        <p class="kicker soft">Opens the VE marketplace in a new tab</p>
      </div>` : `${own ? choiceHtml(p, t) : ''}
      <div class="shop-buy">
        <div class="qty" role="group" aria-label="How many, ${escapeHtml(d.label)}">
          <button class="qty-btn" type="button" data-step="-1" aria-label="One fewer" disabled>${ICON.minus}</button>
          <input class="qty-num" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" step="1" value="1" aria-label="Quantity">
          <button class="qty-btn" type="button" data-step="1" aria-label="One more">${ICON.plus}</button>
        </div>
        <button class="pill small add-to-bag" type="button" data-item="${id}" aria-describedby="${t}-title${d.format ? ` ${t}-format` : ''}">Add to bag <span class="dot">·</span></button>
      </div>`}
    </li>`
}

/* a product with a photo per option (hanging, vent clip) shows the one that is picked */
function initChoicePhotos(items) {
  const list = document.getElementById('shop-grid'); if (!list) return
  list.addEventListener('change', e => {
    const sel = e.target.closest('.item-choice'); if (!sel) return
    const card = sel.closest('[data-item-card]'), p = items.find(x => String(x.id) === card.dataset.itemCard)
    // sold on the VE marketplace with a buy button per option: the button follows the pick
    const buy = card.querySelector('a.buy-ve'), link = p ? veLink(p, sel.value) : null
    if (buy && link) buy.href = link
    const src = p && p.images && typeof p.images === 'object' ? p.images[sel.value] : null
    const img = card.querySelector('img.slot')
    if (!src || !img || img.hidden) return
    const probe = new Image()
    probe.onload = () => { img.src = src }
    probe.src = src
  })
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
  if (!field) return   // sold on the VE marketplace: no quantity here
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
initChoicePhotos(items)
/* shop.html?scent=Lavender (from a home scent card or the quiz): every scent picker that offers
   that scent starts on it, and its button points at that scent */
const wanted = new URLSearchParams(location.search).get('scent')
if (wanted) document.querySelectorAll('.item-choice').forEach(sel => {
  if (![...sel.options].some(o => o.value === wanted)) return
  sel.value = wanted
  sel.dispatchEvent(new Event('change', { bubbles: true }))
})
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
