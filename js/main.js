/* Bootstrap: the shell first (light modules only), then the scene and physics
   arrive a beat later through dynamic imports, so a slow connection or a
   browser without WebGL still gets a complete, working page. */
import { buildChapters, updateChapters, readScroll, scroll, motion, lenis, chapters, prefersReduced } from './scroll.js'
import { fillPlaceholders, fillSlots, initSplit, fontsSettled, initMagnetic, initAnchors, initHint, initMotionToggle, initMenu } from './ui.js'

/* ---------- shell ---------- */
fillPlaceholders()
fillSlots()
initAnchors()
initMagnetic()
initHint()
initMotionToggle()
initMenu()

/* the room the hero copy leaves above it, for the logo (see .hero-logo in css/site.css) */
const heroArea = document.querySelector('.ch-hero .card-area'), heroCopy = document.querySelector('.hero-copy')
function heroRoom() {
  if (!heroArea || !heroCopy) return
  const room = heroCopy.getBoundingClientRect().top - heroArea.getBoundingClientRect().top
  heroArea.style.setProperty('--hero-room', Math.max(0, Math.round(room)) + 'px')
  heroArea.classList.toggle('tight', room < 110)
}

/* chapter ranges from the live layout */
function layout() { readScroll(0); buildChapters(); updateChapters(); heroRoom() }
layout()

/* Headlines are cut into lines once their fonts are in, so the breaks are measured in the real
   typeface; they hide for those few milliseconds so the reveal is the first thing you see. */
const splitEls = [...document.querySelectorAll('[data-split]')]
if (!prefersReduced) splitEls.forEach(el => { el.style.visibility = 'hidden' })
const fontsIn = fontsSettled(splitEls).then(() => {
  splitEls.forEach(el => { el.style.visibility = '' })
  initSplit()
  layout(); ScrollTrigger.refresh()
}).catch(err => { splitEls.forEach(el => { el.style.visibility = '' }); console.error('[seed scent] headline reveal failed', err) })
addEventListener('resize', () => { layout(); ScrollTrigger.refresh() })
addEventListener('load', () => { layout(); ScrollTrigger.refresh() })
document.fonts && document.fonts.ready.then(() => { layout(); ScrollTrigger.refresh() })

/* ---------- scene + physics ---------- */
const isSmall = Math.min(innerWidth, innerHeight) < 700
const scale = isSmall ? 0.62 : 1
const scentScale = isSmall ? 0.55 : 1
const ropes = isSmall ? { hero: 1.9, scents: 2.6, finale: 2.0 } : { hero: 2.5, scents: 3.3, finale: 2.4 }

/* On a short phone screen the hero copy climbs up toward the pendant, which hangs a fixed share
   of the screen's height below the card's top edge. Give the cord the room that is really
   there: a shorter cord first, then a smaller pendant. Measured once the headline has its
   final lines; only words that lie under the pendant count, so wide screens are untouched. */
function heroFit(L, R) {
  const area = heroArea, copy = heroCopy
  if (!area || !copy) return { L, R }
  const unit = innerHeight / 10
  const a = area.getBoundingClientRect()
  const x = a.left + a.width * 0.66, half = (R + 0.5) * unit      // where it hangs, the disc and a little swing
  let top = Infinity
  const see = r => { if (r.width > 0 && r.height > 0 && r.right > x - half && r.left < x + half) top = Math.min(top, r.top) }
  for (const el of copy.children) {
    const lines = el.querySelectorAll('.split-line')
    if (lines.length) lines.forEach(l => {   // a masked headline line: the mask's top, the width of its ink
      const box = l.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(l)
      for (const q of range.getClientRects()) see({ width: q.width, height: q.height, left: q.left, right: q.right, top: box.top })
    })
    else if (el.classList.contains('actions')) [...el.children].forEach(b => see(b.getBoundingClientRect()))
    else { const range = document.createRange(); range.selectNodeContents(el); [...range.getClientRects()].forEach(see) }
  }
  if (top === Infinity) return { L, R }
  const room = (top - a.top) / unit - 0.3                          // world units from the hang point to the words, less a margin
  const MIN = 0.9
  if (room - 2 * R >= L) return { L, R }
  if (room - 2 * R >= MIN) return { L: room - 2 * R, R }
  return { L: MIN, R: Math.max(R * 0.7, Math.min(R, (room - MIN) / 2)) }
}

let ready = false, hasScene = false
let S = null, P = null, chap = null   // scene, physics and chapters modules
const hangersList = () => (P ? P.hangers : [])

async function boot() {
  const [scene, physics, chapters] = await Promise.all([import('./scene.js'), import('./physics.js'), import('./chapters.js')])
  S = scene; P = physics; chap = chapters
  if (!S.renderer) { ready = true; return }   // no WebGL: the DOM choreography still runs
  const [markImg, photo] = await Promise.all([
    S.loadImage('brand/mark-print.png').catch(() => null),
    S.loadImage('images/paper-texture.jpg').catch(() => null),
    P.initPhysics(),
    fontsIn,                                   // the hero copy has its final lines before the cord is cut to length
  ])
  const wood = S.woodTexture()
  const paper = S.paperTexture({ markImg, photo, seed: 3 })
  const paperFaded = S.paperTexture({ markImg, photo, faded: true, seed: 3 })
  const paper2 = S.paperTexture({ markImg, photo, seed: 11 })
  const paper3 = S.paperTexture({ markImg, photo, seed: 19 })

  const hero = heroFit(ropes.hero, 1.35 * scale)
  chap.H.hero = new P.Hanger({ name: 'hero', R: hero.R, L: hero.L, segs: 8, textures: { wood, paper, paperFaded } })
  chap.H.scents = [
    new P.Hanger({ name: 'scent-0', R: 1.05 * scentScale, L: ropes.scents, segs: 7, textures: { wood, paper } }),
    new P.Hanger({ name: 'scent-1', R: 1.05 * scentScale, L: ropes.scents, segs: 7, textures: { wood, paper: paper2 } }),
    new P.Hanger({ name: 'scent-2', R: 1.05 * scentScale, L: ropes.scents, segs: 7, textures: { wood, paper: paper3 } }),
  ]
  chap.H.finale = new P.Hanger({ name: 'finale', R: 1.2 * scale, L: ropes.finale, segs: 8, textures: { wood, paper } })
  // the planted disc sinks below the soil surface
  const clip = m => { if (m) m.clippingPlanes = [chap.soilPlane] }
  chap.H.hero.disc.material.forEach(clip)
  if (chap.H.hero.fade) chap.H.hero.fade.material.forEach(clip)
  chap.initWisps()
  chap.initChips()
  hasScene = true
  ready = true
}
boot().catch(err => { console.error('[seed scent] scene failed to start', err); document.body.classList.add('no-webgl'); ready = true })

/* ---------- one loop ---------- */
let last = performance.now()
let frames = 0
let kicked = false
gsap.ticker.add(() => {
  const now = performance.now()
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
  last = now
  frames++
  readScroll(dt)
  updateChapters()
  if (!ready || !chap) return
  const t = now / 1000
  chap.update(dt, t)
  if (!hasScene) return
  // the first thing the visitor sees is a pendant already in motion, as if just hung up
  if (!kicked && chap.H.hero && chap.H.hero.enabled) {
    kicked = true
    if (motion.active) chap.H.hero.body.applyImpulse({ x: 1.6 * chap.H.hero.mass, y: 0, z: 0.6 * chap.H.hero.mass }, true)
  }
  P.step(dt, { vel: scroll.vel, active: motion.active })
  chap.afterPhysics(dt, t)
  S.renderer.render(S.scene, S.camera)
})

/* ---------- numbers for verification ---------- */
window.__dbg = Object.assign(window.__dbg || {}, {
  state: () => ({ ready, hasScene, frames, ...(chap ? chap.snapshot() : {}) }),
  hangers: () => hangersList().map(h => ({ name: h.name, enabled: h.enabled, target: { ...h.target }, pos: h.enabled ? h.body.translation() : null })),
  get tune() { return P ? P.tune : null },
  get stats() { return P ? P.stats : null },
  scrollTo: p => { const y = p * scroll.max; lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y) },
  shove: (x = 6, y = 0) => { const h = hangersList().find(h => h.enabled); if (h) h.body.applyImpulse({ x: x * h.mass, y: y * h.mass, z: 0 }, true) },
  chapters: () => chapters.map(c => ({ name: c.name, start: +c.start.toFixed(4), end: +c.end.toFixed(4), local: +c.local.toFixed(3) })),
  motion,
})
