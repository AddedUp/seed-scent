/* The bag and the checkout. One module for both pages:
   index.html gets the drawer, checkout.html gets the summary and the firm form.
   State lives in localStorage under "seedscent.bag" as [{ scentIndex, format, qty }].
   Every hook is optional, so the module runs quietly on a page that lacks it. */
import { cfg, num, money, escapeHtml, initMagnetic } from './ui.js'
import { motion, lenis } from './scroll.js'

const KEY = 'seedscent.bag'
const FORMATS = { mirror: 'Mirror cord', vent: 'Vent clip' }
const MODES = ['email', 'marketplace', 'gateway']
const MAX_QTY = 9999
const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TBC_TITLE = 'To be confirmed by the team'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const isFormat = f => f === 'mirror' || f === 'vent'
const str = v => (v == null || v === '' ? null : String(v))
const chip = text => `<span class="ph">${escapeHtml(text)}</span>`

/* the tier breakpoints are a draft until the team flips tiersConfirmed, so the label carries a chip */
const tiersTbc = () => cfg('tiersConfirmed') !== true
const tierHtml = label => escapeHtml(label) + (tiersTbc() ? ` <span class="tbc" data-tbc="tiersConfirmed" title="${TBC_TITLE}">tbc</span>` : '')
const tierText = label => label + (tiersTbc() ? ' (to be confirmed)' : '')

const ICON = {
  minus: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
}

/* ---------- config readers ---------- */
function scents() { const s = cfg('scents'); return Array.isArray(s) ? s : [] }
/* num() reads every number in a tier, so 10, "10" and "4.50" all count and "abc" drops to a chip */
function tiers() {
  const t = cfg('bulkTiers')
  return (Array.isArray(t) ? t : [])
    .map(x => (x && num(x.min) != null ? { ...x, min: num(x.min) } : null))
    .filter(Boolean)
    .sort((a, b) => a.min - b.min)
}
function scentName(i) { const s = scents()[i]; return s && s.name ? String(s.name) : null }
function scentText(i) { return scentName(i) || `Scent ${WORDS[i] || i + 1} (name tbc)` }
function scentHtml(i) { const n = scentName(i); return n ? escapeHtml(n) : chip('scent name') }

/* ---------- state ---------- */
/* drop anything malformed, merge lines that share a scent and a format */
function clean(raw) {
  const n = scents().length
  const out = []
  for (const l of Array.isArray(raw) ? raw : []) {
    if (!l) continue
    const i = Number(l.scentIndex), q = Math.floor(Number(l.qty)), f = l.format
    if (!Number.isInteger(i) || i < 0 || i >= n || !isFormat(f) || !Number.isFinite(q) || q < 1) continue
    const same = out.find(o => o.scentIndex === i && o.format === f)
    if (same) same.qty = Math.min(MAX_QTY, same.qty + q)
    else out.push({ scentIndex: i, format: f, qty: Math.min(MAX_QTY, q) })
  }
  return out
}
function load() { try { return clean(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return [] } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* private mode: the bag lives for this page only */ } }

let lines = load()

/* one tier for the whole bag: the highest tier whose minimum the unit count reaches */
function totals() {
  const units = lines.reduce((s, l) => s + l.qty, 0)
  const T = tiers()
  let tier = T[0] || null
  for (const t of T) if (units >= t.min) tier = t
  const unit = tier ? num(tier.price) : null
  return { units, tier, label: tier ? String(tier.label ?? '') : '', unit, total: unit == null ? null : unit * units }
}
function snapshot() {
  const t = totals()
  return { lines: lines.map(l => ({ ...l })), units: t.units, tier: t.label, unitPrice: t.unit, total: t.total }
}

function commit() { save(); render() }
function addToBag(scentIndex, format, qty = 1) { lines = clean([...lines, { scentIndex, format, qty }]); commit() }
function setQty(i, n) {
  if (!lines[i]) return
  lines[i].qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(n)) || 1))
  commit()
}
function removeLine(i) { if (lines[i]) { lines.splice(i, 1); commit() } }

/* ---------- rendering: the drawer and the checkout summary share one line template ---------- */
const views = []
function addView(v) { if (v && v.lines) { views.push(v); bindLines(v) } }

function lineHtml(l, idx, unit) {
  const label = scentText(l.scentIndex)
  const each = unit == null ? '' : ` · ${escapeHtml(money(unit))} each`
  const price = unit == null ? chip('price') : escapeHtml(money(unit * l.qty))
  return `<li class="bag-line" data-line="${idx}">
    <div class="line-head">
      <p class="line-name">${scentHtml(l.scentIndex)}</p>
      <p class="line-format">${FORMATS[l.format]}${each}</p>
    </div>
    <p class="line-price">${price}</p>
    <div class="qty" role="group" aria-label="Quantity, ${escapeHtml(label)}, ${FORMATS[l.format]}">
      <button class="qty-btn" type="button" data-act="dec" aria-label="One fewer"${l.qty <= 1 ? ' disabled' : ''}>${ICON.minus}</button>
      <input class="qty-num" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" step="1" value="${l.qty}" aria-label="Quantity">
      <button class="qty-btn" type="button" data-act="inc" aria-label="One more"${l.qty >= MAX_QTY ? ' disabled' : ''}>${ICON.plus}</button>
    </div>
    <button class="line-remove" type="button" data-act="remove">Remove</button>
  </li>`
}

function render() {
  const t = totals()
  const count = $('#bag-count'); if (count) count.textContent = String(t.units)
  for (const v of views) {
    const keep = rememberFocus(v)
    v.lines.innerHTML = lines.map((l, i) => lineHtml(l, i, t.unit)).join('')
    if (v.empty) v.empty.hidden = lines.length > 0
    if (v.units) v.units.textContent = String(t.units)
    if (v.tier) v.tier.innerHTML = tierHtml(t.label)
    if (v.each) v.each.innerHTML = t.unit == null ? chip('price') : escapeHtml(money(t.unit))
    if (v.total) v.total.innerHTML = t.total == null ? chip('total') : escapeHtml(money(t.total))
    if (v.checkout) {
      // an empty bag has nothing to check out: the link is dimmed and leaves the tab order
      if (lines.length) { v.checkout.removeAttribute('aria-disabled'); v.checkout.removeAttribute('tabindex') }
      else { v.checkout.setAttribute('aria-disabled', 'true'); v.checkout.tabIndex = -1 }
    }
    restoreFocus(v, keep)
  }
  document.dispatchEvent(new CustomEvent('bag:change', { detail: snapshot() }))
}

/* re-rendering replaces the controls, so put the keyboard back where it was */
function rememberFocus(v) {
  const a = document.activeElement
  if (!a || !v.lines.contains(a)) return null
  const li = a.closest('[data-line]'); if (!li) return null
  return { line: li.dataset.line, act: a.dataset.act || (a.classList.contains('qty-num') ? 'num' : null) }
}
function restoreFocus(v, k) {
  if (!k) return
  const li = v.lines.querySelector(`[data-line="${k.line}"]`)
  if (!li) { v.focusFallback && v.focusFallback.focus({ preventScroll: true }); return }
  const el = k.act === 'num' ? li.querySelector('.qty-num') : li.querySelector(`[data-act="${k.act}"]`)
  const target = el && !el.disabled ? el : li.querySelector('.qty-num')
  if (target) target.focus({ preventScroll: true })
}

function lineIndex(el) { const li = el.closest('[data-line]'); const i = li ? Number(li.dataset.line) : -1; return lines[i] ? i : -1 }

function bindLines(v) {
  v.lines.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return
    const i = lineIndex(btn); if (i < 0) return
    const act = btn.dataset.act
    if (act === 'inc') setQty(i, lines[i].qty + 1)
    else if (act === 'dec') setQty(i, lines[i].qty - 1)
    else if (act === 'remove') removeLine(i)
  })
  v.lines.addEventListener('change', e => {
    const inp = e.target.closest('.qty-num'); if (!inp) return
    const i = lineIndex(inp); if (i < 0) return
    const n = Math.floor(Number(inp.value))
    if (Number.isFinite(n) && n >= 1) setQty(i, n)
    else render()   // junk typed in: redraw the old value
  })
  v.lines.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('qty-num')) {
      e.preventDefault()
      e.target.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
}

/* ---------- a polite voice for screen readers ---------- */
let live = null
function announce(msg) {
  if (!live) {
    live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite')
    document.body.appendChild(live)
  }
  live.textContent = ''
  requestAnimationFrame(() => { live.textContent = msg })
}
function bump(el) {
  if (!el || !motion.active || typeof gsap === 'undefined') return
  gsap.fromTo(el, { scale: 1 }, { scale: 1.14, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: true, clearProps: 'scale' })
}

/* ---------- the drawer (index.html) ---------- */
function initDrawer() {
  const bag = $('#bag'); if (!bag) return null
  const toggle = $('#bag-toggle'), scrim = $('#scrim'), closeBtn = $('#bag-close'), openBtn = $('#open-bag'), checkout = $('#bag-checkout')
  bag.setAttribute('data-lenis-prevent', '')   // the wheel scrolls the lines, not the page behind them
  let opener = null
  const isOpen = () => bag.classList.contains('open')

  function markClosed() {
    bag.setAttribute('aria-hidden', 'true'); bag.inert = true
    if (toggle) toggle.setAttribute('aria-expanded', 'false')
    if (scrim) scrim.hidden = true
  }
  function open(from) {
    if (isOpen()) return
    opener = from || null
    bag.inert = false
    bag.classList.add('open'); bag.setAttribute('aria-hidden', 'false')
    if (toggle) toggle.setAttribute('aria-expanded', 'true')
    if (scrim) scrim.hidden = false
    ;(closeBtn || bag).focus({ preventScroll: true })
  }
  function close() {
    if (!isOpen()) return
    bag.classList.remove('open'); markClosed()
    const back = opener || toggle
    if (back) back.focus({ preventScroll: true })
    opener = null
  }

  // everything a keyboard can land on inside the drawer, in document order
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'
  const focusables = () => $$(FOCUSABLE, bag).filter(el =>
    !el.disabled && el.tabIndex >= 0 && !el.hidden && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0)
  // while the drawer is open, Tab and Shift+Tab stay inside it and wrap at the ends
  function trapTab(e) {
    const f = focusables()
    if (!f.length) { e.preventDefault(); return }
    const first = f[0], last = f[f.length - 1], a = document.activeElement
    if (!bag.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus() }
  }

  markClosed()
  if (toggle) toggle.addEventListener('click', () => (isOpen() ? close() : open(toggle)))
  if (openBtn) openBtn.addEventListener('click', () => open(openBtn))
  if (closeBtn) closeBtn.addEventListener('click', close)
  if (scrim) scrim.addEventListener('click', close)
  document.addEventListener('keydown', e => {
    if (!isOpen()) return
    if (e.key === 'Escape') close()
    else if (e.key === 'Tab') trapTab(e)
  })
  if (checkout) checkout.addEventListener('click', e => { if (checkout.getAttribute('aria-disabled') === 'true') e.preventDefault() })

  // a one-line explanation under the totals; the markup has no slot for it, so it is added here
  const foot = $('.bag-foot', bag)
  if (foot && !$('.bag-note', foot)) {
    const note = document.createElement('p')
    note.className = 'kicker soft bag-note'
    note.textContent = 'One bulk tier for the whole bag, picked by total units.'
    foot.appendChild(note)
  }

  addView({ lines: $('#bag-lines'), empty: $('#bag-empty'), units: $('#bag-units'), tier: $('#bag-tier'), total: $('#bag-total'), checkout, focusFallback: closeBtn })
  return { open, close, isOpen }
}

/* ---------- "Add to bag" buttons on the scent cards ---------- */
function initAddButtons() {
  const btns = $$('.add-to-bag[data-add]'); if (!btns.length) return
  const labels = new WeakMap(), timers = new WeakMap()
  btns.forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.add)
    if (!scents()[i]) return
    const picked = $(`input[name="format-${i}"]:checked`)
    const format = picked && isFormat(picked.value) ? picked.value : 'mirror'
    addToBag(i, format, 1)

    // the tiny acknowledgement: the button says "Added" for a moment
    if (!labels.has(btn)) labels.set(btn, btn.innerHTML)
    btn.innerHTML = 'Added <span class="dot">·</span>'
    btn.classList.add('is-added')
    clearTimeout(timers.get(btn))
    timers.set(btn, setTimeout(() => { btn.innerHTML = labels.get(btn); btn.classList.remove('is-added') }, 1200))

    const u = totals().units
    announce(`Added to the bag. ${u} ${u === 1 ? 'unit' : 'units'} in all.`)
    bump($('#bag-toggle'))
  }))
}

/* ---------- checkout.html ---------- */
function hostOf(url) { try { return new URL(url, location.href).host } catch { return url } }
function mailtoUrl(to, subject, body) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}
function scrollToEl(el) {
  if (lenis) {
    lenis.resize()   // the page just grew (the order appeared); Lenis clamps to its cached height otherwise
    lenis.scrollTo(el, { offset: -24, duration: 1.2, easing: t => 1 - Math.pow(1 - t, 4) })
  } else el.scrollIntoView({ behavior: motion.active ? 'smooth' : 'auto', block: 'start' })
}

/* the order, written out in plain text for an email, a clipboard or a gateway */
function orderText(d) {
  const t = totals()
  const L = [
    `Seed Scent order from ${d.firm}`, '',
    `Firm: ${d.firm}`, `Contact: ${d.name}`, `Email: ${d.email}`,
    `VE account or firm ID: ${d.account || 'not given'}`, '',
    'Order',
  ]
  lines.forEach(l => L.push(`${l.qty} x ${scentText(l.scentIndex)}, ${FORMATS[l.format].toLowerCase()}`))
  L.push('',
    `Units: ${t.units}`, `Tier: ${tierText(t.label)}`,
    `Each: ${t.unit == null ? 'price tbc' : money(t.unit)}`,
    `Total: ${t.total == null ? 'total tbc' : money(t.total)}`, '',
    'Delivery notes', d.notes || 'none', '',
    'Sent from the Seed Scent site.')
  return L.join('\n')
}

/* the final step follows the checkout mode the team picked. When the address that mode needs is
   missing, the primary is dimmed and a ghost button writes the order out on screen instead;
   the notes talk like a storefront, never about where the team sets things */
function finalHtml(mode, { email, market, gateway }) {
  const dot = '<span class="dot">·</span>'
  const writeOut = '<button class="pill ghost small" type="submit">Write out the order</button>'
  const off = label => `<span class="pill" aria-disabled="true" tabindex="-1">${label} ${dot}</span>`
  const note = text => `<p class="kicker soft co-note">${text}</p>`
  const copyIt = 'Write the order out below and copy it.'
  if (mode === 'marketplace') {
    return market
      ? `<a class="pill" id="co-go" href="${escapeHtml(market)}" target="_blank" rel="noopener" data-magnetic>Finish on the VE marketplace ${dot}</a>
         ${note('Opens the Seed Scent page on the VE marketplace in a new tab.')}${writeOut}`
      : `${off('Finish on the VE marketplace')}
         ${note(`The team has not published a marketplace link yet. ${copyIt}`)}${writeOut}`
  }
  if (mode === 'gateway') {
    return gateway
      ? `<button class="pill" type="submit" data-magnetic>Send the order ${dot}</button>
         ${note(`Posts the order to ${escapeHtml(hostOf(gateway))}.`)}`
      : `${off('Send the order')}
         ${note(`The team has not switched on online payment yet. ${copyIt}`)}${writeOut}`
  }
  return email
    ? `<button class="pill" type="submit" data-magnetic>Send the order ${dot}</button>
       ${note(`Opens an email to ${escapeHtml(email)}.`)}`
    : `${off('Send the order')}
       ${note(`The team has not published an order email yet. ${copyIt}`)}${writeOut}`
}

let lastMailto = null   // the last mailto: link we opened, for verification

function initCheckout() {
  const form = $('#co-form'); if (!form) return false
  let mode = String(cfg('checkout.mode') || 'email').toLowerCase().trim()
  if (!MODES.includes(mode)) {
    // an unknown word falls back to email, which only promises an email when there is an address
    console.warn(`Seed Scent: checkout.mode "${mode}" is not one of ${MODES.join(', ')}. Using "email".`)
    mode = 'email'
  }
  const email = str(cfg('contact.email')), market = str(cfg('marketplaceUrl')), gateway = str(cfg('checkout.gatewayUrl'))
  const finalEl = $('#co-final'), errEl = $('#co-error'), result = $('#co-result'), orderEl = $('#co-order')
  const noteEl = $('#co-result-note'), copyBtn = $('#co-copy')
  const fields = { firm: $('#co-firm'), name: $('#co-name'), email: $('#co-email'), account: $('#co-account'), notes: $('#co-notes') }
  let lastText = ''

  if (finalEl) finalEl.innerHTML = finalHtml(mode, { email, market, gateway })
  if (mode === 'gateway' && gateway) { form.action = gateway; form.method = 'post' }

  addView({ lines: $('#co-lines'), empty: $('#co-empty'), units: $('#co-units'), tier: $('#co-tier'), each: $('#co-each'), total: $('#co-total'), focusFallback: $('#co-add-more') })

  const read = () => Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el ? el.value.trim() : '']))
  // typing in a field clears its red line straight away
  Object.values(fields).forEach(el => el && el.addEventListener('input', () => el.removeAttribute('aria-invalid')))
  function validate(d) {
    if (!lines.length) return 'The bag is empty. Add a scent first.'
    Object.values(fields).forEach(el => el && el.removeAttribute('aria-invalid'))
    const bad = []
    if (!d.firm) bad.push(fields.firm)
    if (!d.name) bad.push(fields.name)
    if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) bad.push(fields.email)
    bad.forEach(el => el && el.setAttribute('aria-invalid', 'true'))
    if (bad.length) { bad[0] && bad[0].focus(); return 'Fill in your firm, a contact name and an email we can reply to.' }
    return ''
  }
  function showError(msg) { if (errEl) { errEl.textContent = msg; errEl.hidden = false } }
  function hideError() { if (errEl) errEl.hidden = true }
  function showResult(text, noteHtml) {
    lastText = text
    if (orderEl) orderEl.textContent = text
    if (noteEl) noteEl.innerHTML = noteHtml
    if (result) { result.hidden = false; scrollToEl(result) }
  }
  function fillHidden(d, text) {
    $$('.co-hidden', form).forEach(x => x.remove())
    const hidden = (name, value) => {
      const i = document.createElement('input')
      i.type = 'hidden'; i.name = name; i.value = value == null ? '' : String(value); i.className = 'co-hidden'
      form.appendChild(i)
    }
    const t = totals()
    hidden('units', t.units); hidden('tier', t.label); hidden('unit_price', t.unit); hidden('total', t.total); hidden('currency', cfg('currency') || 'USD')
    lines.forEach((l, i) => { hidden(`line_${i + 1}_scent`, scentText(l.scentIndex)); hidden(`line_${i + 1}_format`, l.format); hidden(`line_${i + 1}_qty`, l.qty) })
    hidden('order_text', text)
    hidden('order_json', JSON.stringify({ firm: d.firm, contact: d.name, email: d.email, account: d.account, notes: d.notes, lines, units: t.units, tier: t.label, unitPrice: t.unit, total: t.total }))
  }

  form.addEventListener('submit', e => {
    const d = read()
    const problem = validate(d)
    if (problem) { e.preventDefault(); showError(problem); return }
    hideError()
    const text = orderText(d)
    const fallback = 'Copy the order and send it to the team another way.'

    if (mode === 'gateway' && gateway) {
      fillHidden(d, text)   // the browser posts the form to the gateway
      showResult(text, `Sending the order to ${escapeHtml(hostOf(gateway))}. If nothing happened, copy it and send it by hand.`)
      return
    }
    e.preventDefault()
    let note
    if (mode === 'email' && email) {
      lastMailto = mailtoUrl(email, `Seed Scent order from ${d.firm}`, text)
      location.href = lastMailto
      note = `We opened your email app with this order, addressed to ${escapeHtml(email)}. If nothing opened, copy the order and send it yourself.`
    } else if (mode === 'email') {
      note = `The team has not published an order email yet. ${fallback}`
    } else if (mode === 'marketplace') {
      note = market ? 'Paste this into your marketplace order so the firm knows who you are.' : `The team has not published a marketplace link yet. ${fallback}`
    } else {
      note = `The team has not switched on online payment yet. ${fallback}`
    }
    showResult(text, note)
  })

  if (copyBtn) {
    const label = copyBtn.innerHTML
    let timer = 0
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(lastText)
      copyBtn.textContent = ok ? 'Copied' : 'Select the text and copy it'
      clearTimeout(timer); timer = setTimeout(() => { copyBtn.innerHTML = label }, 1600)
    })
  }
  return true
}

/* ---------- boot ---------- */
const drawer = initDrawer()
initAddButtons()
const isCheckout = initCheckout()
render()
if (isCheckout) initMagnetic()

// another tab changed the bag: follow it
addEventListener('storage', e => { if (e.key === KEY || e.key === null) { lines = load(); render() } })

// numbers for verification, next to the scene's own handle
const dbg = (window.__dbg = window.__dbg || {})
dbg.bag = snapshot
dbg.bagSet = arr => { lines = clean(arr); commit() }
dbg.bagClear = () => { lines = []; commit() }
dbg.mailto = () => lastMailto
if (drawer) { dbg.bagOpen = () => drawer.open(); dbg.bagClose = () => drawer.close() }
