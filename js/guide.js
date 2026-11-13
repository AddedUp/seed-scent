/* Planting guide page: placeholders, the menu, the motion toggle, the bag count, the print
   button and a gentle rise-in. Shares scroll.js and ui.js with the other pages. The guide's
   words are in planting-guide.html itself. */
import { lenis, motion, prefersReduced } from './scroll.js'
import { fillPlaceholders, initSplit, fontsSettled, resplitWhenFontsArrive, initMagnetic, initMotionToggle, initMenu } from './ui.js'

/* the bag lives on the shop and the home page; only its count shows here, read from the saved bag */
const BAG_KEY = 'seedscent.bag'
function bagUnits() {
  try {
    const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]')
    if (!Array.isArray(raw)) return 0
    return raw.reduce((s, l) => {
      const q = l && typeof l === 'object' ? Math.floor(Number(l.qty)) : NaN
      return Number.isFinite(q) && q >= 1 ? s + q : s
    }, 0)
  } catch { return 0 }
}
function initBagCount() {
  const count = document.getElementById('bag-count')
  if (!count) return
  const render = () => { count.textContent = String(bagUnits()) }
  render()
  addEventListener('storage', e => { if (e.key === BAG_KEY || e.key === null) render() })
}

/* the in-page link scrolls smoothly when Lenis is running */
function initSkip() {
  document.querySelectorAll('a[href^="#part-"]').forEach(a => a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'))
    if (!target || !lenis) return
    e.preventDefault()
    lenis.scrollTo(target, { offset: -90, duration: 1.1 })
    history.replaceState(null, '', a.getAttribute('href'))
  }))
}

let revealed = 0, revealTotal = 0
function initReveal() {
  const els = [...document.querySelectorAll('.guide-steps li, .care, .guide-next')]
  const hero = [...document.querySelectorAll('.guide-hero .team-hero-top > *, .guide-hero .team-hero-copy > :not(h1)')]
  revealTotal = els.length
  if (prefersReduced || motion.paused) { revealed = revealTotal; return }
  gsap.from(hero, { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.15 })
  els.forEach(el => gsap.from(el, {
    y: 26, opacity: 0, duration: 0.9, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 94%', once: true },
    onComplete: () => { revealed++ }, onInterrupt: () => { revealed++ },
  }))
}

/* ---------- boot ---------- */
fillPlaceholders()
initMagnetic()
initMotionToggle()
initMenu()
initBagCount()
initSkip()
initReveal()
const printBtn = document.getElementById('print-guide')
if (printBtn) printBtn.addEventListener('click', () => window.print())

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

/* numbers for verification */
window.__guide = {
  ready: true,
  steps: () => document.querySelectorAll('.guide-steps li').length,
  revealed: () => revealed,
  revealTotal: () => revealTotal,
  bagUnits,
  hasLenis: !!lenis,
}
