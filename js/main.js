/* Bootstrap: shell first, then the scene, then physics a beat later. */
import * as THREE from 'three'
import { renderer, scene, camera, rig, woodTexture, paperTexture, loadImage, view } from './scene.js'
import { initPhysics, Hanger, step as physicsStep, hangers, tune, stats, grab } from './physics.js'
import { buildChapters, updateChapters, readScroll, scroll, motion, lenis, chapters, ch } from './scroll.js'
import { fillPlaceholders, fillSlots, initSplit, initMagnetic, initAnchors, initHint, initMotionToggle } from './ui.js'
import * as chap from './chapters.js'

/* ---------- shell ---------- */
fillPlaceholders()
fillSlots()
initAnchors()
initMagnetic()
initHint()
initMotionToggle()
initSplit()

/* chapter ranges from the live layout */
function layout() { readScroll(0); buildChapters(); updateChapters() }
layout()
addEventListener('resize', () => { layout(); ScrollTrigger.refresh() })
addEventListener('load', () => { layout(); ScrollTrigger.refresh() })
document.fonts && document.fonts.ready.then(() => { layout(); ScrollTrigger.refresh() })

/* ---------- scene + physics ---------- */
const isSmall = Math.min(innerWidth, innerHeight) < 700
const scale = isSmall ? 0.78 : 1

let ready = false
async function boot() {
  const [markImg, photo] = await Promise.all([
    loadImage('brand/mark-print.png').catch(() => null),
    loadImage('images/paper-texture.jpg').catch(() => null),
    initPhysics(),
  ])
  const wood = woodTexture()
  const paper = paperTexture({ markImg, photo, seed: 3 })
  const paperFaded = paperTexture({ markImg, photo, faded: true, seed: 3 })
  const paper2 = paperTexture({ markImg, photo, seed: 11 })
  const paper3 = paperTexture({ markImg, photo, seed: 19 })

  chap.H.hero = new Hanger({ name: 'hero', R: 1.35 * scale, L: 2.5, segs: 8, textures: { wood, paper, paperFaded } })
  chap.H.scents = [
    new Hanger({ name: 'scent-0', R: 1.05 * scale, L: 3.3, segs: 7, textures: { wood, paper } }),
    new Hanger({ name: 'scent-1', R: 1.05 * scale, L: 3.3, segs: 7, textures: { wood, paper: paper2 } }),
    new Hanger({ name: 'scent-2', R: 1.05 * scale, L: 3.3, segs: 7, textures: { wood, paper: paper3 } }),
  ]
  chap.H.finale = new Hanger({ name: 'finale', R: 1.2 * scale, L: 2.4, segs: 8, textures: { wood, paper } })
  // the planted disc sinks below the soil surface
  const clip = m => { if (m) m.clippingPlanes = [chap.soilPlane] }
  chap.H.hero.disc.material.forEach(clip)
  if (chap.H.hero.fade) chap.H.hero.fade.material.forEach(clip)
  chap.initWisps()
  chap.initChips()
  ready = true
}
boot().catch(err => { console.error('[seed scent] scene failed to start', err); document.body.classList.add('no-webgl') })

/* ---------- one loop ---------- */
let last = performance.now()
let frames = 0
gsap.ticker.add(() => {
  const now = performance.now()
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
  last = now
  frames++
  readScroll(dt)
  updateChapters()
  if (!ready) return
  const t = now / 1000
  chap.update(dt, t)
  physicsStep(dt, { vel: scroll.vel, active: motion.active })
  chap.afterPhysics(dt, t)
  renderer.render(scene, camera)
})

/* ---------- numbers for verification ---------- */
window.__dbg = {
  state: () => ({ ready, frames, ...chap.snapshot() }),
  hangers: () => hangers.map(h => ({ name: h.name, enabled: h.enabled, target: { ...h.target }, pos: h.enabled ? h.body.translation() : null })),
  tune,
  scrollTo: p => { const y = p * scroll.max; lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y) },
  shove: (x = 6, y = 0) => { const h = hangers.find(h => h.enabled); if (h) h.body.applyImpulse({ x: x * h.mass, y: y * h.mass, z: 0 }, true) },
  chapters: () => chapters.map(c => ({ name: c.name, start: +c.start.toFixed(4), end: +c.end.toFixed(4), local: +c.local.toFixed(3) })),
  motion,
}
