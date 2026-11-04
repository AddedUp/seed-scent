/* Team page: cards from config, placeholders, photo slots, hover tilt, rise-in.
   Shares scroll.js (Lenis + GSAP plugins) and ui.js with the home page. */
import { lenis, motion, prefersReduced, isCoarse } from './scroll.js'
import { cfg, fillPlaceholders, fillSlots, initSplit, initMagnetic, initMotionToggle } from './ui.js'

const pad = n => String(n).padStart(2, '0')

/* ---------- cards from window.SEED_SCENT.team ---------- */
function renderTeam(team) {
  const list = document.getElementById('team-grid')
  if (!list) return []
  if (!team.length) {
    list.innerHTML = '<li class="team-empty"><p class="kicker">No team members in js/config.js yet. Add them under <code>team</code>.</p></li>'
    return []
  }
  // Values are never written into the markup here: the chips carry a config
  // path and fillPlaceholders() sets the text, so nothing needs escaping.
  list.innerHTML = team.map((m, i) => `
    <li class="card team-card" data-tilt data-index="${i}">
      <span class="ghost-num" aria-hidden="true">${pad(i + 1)}</span>
      <figure class="card-media team-photo">
        <img class="slot" data-slot="team.${i}.photo" alt="" hidden>
        <span class="slot-label">[Photo]</span>
      </figure>
      <h2 class="card-title"><span class="ph" data-ph="team.${i}.name">name</span></h2>
      <p class="kicker team-role"><span class="ph" data-ph="team.${i}.role">role</span></p>
      <p class="team-bio"><span class="ph" data-ph="team.${i}.bio">bio</span></p>
    </li>`).join('')
  // a photo gets the person's name as alt text once there is one
  list.querySelectorAll('img.slot').forEach((img, i) => {
    const name = team[i] && team[i].name
    if (name) img.alt = String(name)
  })
  return [...list.querySelectorAll('.team-card')]
}

/* the note under the grid shows only while chips remain */
function noteMissing(team) {
  const note = document.getElementById('team-note')
  if (!note) return
  const missing = team.some(m => !m || m.name == null || m.role == null || m.bio == null)
  note.hidden = !missing
}

/* ---------- hover tilt: small, lerped, pointer only ---------- */
const tilts = []
function initTilt(cards) {
  if (isCoarse || !cards.length) return
  const MAX = 5 // degrees at the card's edge
  cards.forEach(card => {
    gsap.set(card, { transformPerspective: 900 })
    const t = {
      card, rx: 0, ry: 0, tx: 0, ty: 0,
      setX: gsap.quickSetter(card, 'rotationX', 'deg'),
      setY: gsap.quickSetter(card, 'rotationY', 'deg'),
    }
    card.addEventListener('pointermove', e => {
      if (!motion.active) { t.tx = 0; t.ty = 0; return }
      const r = card.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      t.ty = px * MAX * 2
      t.tx = -py * MAX * 2
    })
    card.addEventListener('pointerleave', () => { t.tx = 0; t.ty = 0 })
    tilts.push(t)
  })
  gsap.ticker.add(() => {
    for (const t of tilts) {
      if (!motion.active) { t.tx = 0; t.ty = 0 }
      let nx = t.rx + (t.tx - t.rx) * 0.14
      let ny = t.ry + (t.ty - t.ry) * 0.14
      if (t.tx === 0 && Math.abs(nx) < 0.002) nx = 0
      if (t.ty === 0 && Math.abs(ny) < 0.002) ny = 0
      if (nx === t.rx && ny === t.ry) continue
      t.rx = nx; t.ry = ny
      t.setX(t.rx); t.setY(t.ry)
    }
  })
}

/* ---------- gentle rise-in on first view ---------- */
let revealed = 0
let revealTotal = 0
function initReveal(cards) {
  const how = [...document.querySelectorAll('.how li')]
  const hero = [...document.querySelectorAll('.team-hero-top > *, .team-hero-copy > :not(h1)')]
  revealTotal = cards.length + how.length
  if (prefersReduced || motion.paused) { revealed = revealTotal; return }
  gsap.from(hero, { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.15 })
  ;[cards, how].forEach(group => group.forEach((el, i) => {
    gsap.from(el, {
      y: 34, opacity: 0, duration: 1.0, ease: 'power3.out', delay: (i % 3) * 0.08,
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      onComplete: () => { revealed++ },
    })
  }))
}

/* ---------- the bag lives on the home page ---------- */
function initBagLink() {
  const bag = document.getElementById('bag-toggle')
  if (bag) bag.addEventListener('click', () => { location.href = 'index.html#firms' })
}

/* ---------- boot ---------- */
const team = Array.isArray(cfg('team')) ? cfg('team') : []
const cards = renderTeam(team)
noteMissing(team)
fillPlaceholders()
fillSlots()
initMagnetic()
initMotionToggle()
initBagLink()
initSplit()
initTilt(cards)
initReveal(cards)

const refresh = () => ScrollTrigger.refresh()
addEventListener('load', refresh)
addEventListener('resize', refresh)
document.fonts && document.fonts.ready.then(refresh)

/* ---------- numbers for verification ---------- */
window.__team = {
  count: () => document.querySelectorAll('.team-card').length,
  chips: () => document.querySelectorAll('.team-card .ph').length,
  photos: () => ({
    shown: document.querySelectorAll('.team-card img.slot:not([hidden])').length,
    labels: document.querySelectorAll('.team-card .slot-label').length,
  }),
  revealed: () => revealed,
  revealTotal: () => revealTotal,
  tilt: () => tilts.map(t => ({ rx: +t.rx.toFixed(3), ry: +t.ry.toFixed(3) })),
  scrollTo: y => { lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y) },
  hasLenis: !!lenis,
  motion,
}
