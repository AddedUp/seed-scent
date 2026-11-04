/* Choreography: everything that moves with the scroll is a pure function of
   chapter-local progress here, so nothing can drift out of sync. */
import * as THREE from 'three'
import { scene, rig, view, rectAnchor, project, toWorldX, toWorldY, WORLD_H, blobTexture } from './scene.js'
import { hangers, setBox, cursor, grab, stats } from './physics.js'
import { chapters, ch, activeChapter, scroll, motion, isCoarse, clamp01, lerp, smoothstep, span } from './scroll.js'
import { setNavActive, cfg, money } from './ui.js'

const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]

const dom = {
  body: document.body,
  card: $('#card-panel'),
  soil: $('#soil'),
  hangHero: $('#hang-hero'), hangDrive: $('#hang-drive'), hangPlant: $('#hang-plant'),
  hangScents: $$('.hang-row .hang'), hangFinale: $('#hang-finale'),
  giants: $$('.giant'), beats: $$('.beat'),
  sprout: { stem: $('#stem'), leafL: $('#leaf-l'), leafR: $('#leaf-r'), veinL: $('#vein-l'), veinR: $('#vein-r'), ext: $('#stem-ext'), day: $('#day-num'), copy: $('.sprout-copy'), svg: $('#sprout-svg') },
  labels: $('#labels'),
  meterStem: $('#meter-stem'), meterLeaves: $('#meter-leaves'),
  cue: $('#cue'),
  heroLogo: $('.hero-logo'),
}
;[dom.sprout.stem, dom.sprout.leafL, dom.sprout.leafR, dom.sprout.veinL, dom.sprout.veinR, dom.sprout.ext].forEach(p => p && p.setAttribute('pathLength', '1'))
dom.meterStem && dom.meterStem.setAttribute('pathLength', '1')

/* the hangers, created by main.js */
export const H = { hero: null, scents: [], finale: null }

/* scent wisps: a few soft sprites rising from the hero disc */
const wisps = []
let wispTex = null
export function initWisps() {
  wispTex = blobTexture('rgba(251,246,229,1)', 'rgba(251,246,229,0)')
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: wispTex, color: 0xfbf6e5, transparent: true, opacity: 0, depthWrite: false })
    const s = new THREE.Sprite(m)
    s.scale.setScalar(0.5 + Math.random() * 0.5)
    s.userData = { t: Math.random(), speed: 0.12 + Math.random() * 0.1, drift: Math.random() * Math.PI * 2, size: s.scale.x }
    rig.add(s)
    wisps.push(s)
  }
}
let wispLevel = 0  // 0..1, set by the choreography

/* ---------- derived numbers, read once per frame ---------- */
const px = { navH: 76, inset: 22, radius: 28 }
function readCss() {
  const cs = getComputedStyle(document.documentElement)
  px.navH = parseFloat(cs.getPropertyValue('--nav-h')) || 76
  px.inset = parseFloat(cs.getPropertyValue('--card-inset')) || 22
  px.radius = parseFloat(cs.getPropertyValue('--radius')) || 28
}
readCss()
addEventListener('resize', readCss)

const soilPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100)   // keeps y >= -constant
export const state = {
  theme: 'cream', soil: 0, cardOpen: 0, cardOpacity: 1,
  plant: 0, fade: 0, detached: false,
  chips: [], scentsVisible: false, finaleVisible: false,
}

/* chips under the three scents */
export function initChips() {
  const scents = cfg('scents') || []
  state.chips = scents.map((s, i) => {
    const el = document.createElement('span')
    el.className = 'chip'
    const name = s.name ? s.name : `<span class="ph">scent name</span>`
    const price = s.price != null ? money(s.price) : `<span class="ph">price</span>`
    el.innerHTML = `${String(i + 1).padStart(2, '0')} · ${name} · ${price}`
    dom.labels.appendChild(el)
    return el
  })
}

/* keep the hero disc's "slot" so the detached disc can start from it */
const _slot = new THREE.Vector3(), _slotQ = new THREE.Quaternion(), _plantPos = new THREE.Vector3(), _tmpQ = new THREE.Quaternion()
const PLANT_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, 0.25, 0.35))

let lastTheme = ''
function setTheme(t) { if (t !== lastTheme) { lastTheme = t; dom.body.dataset.theme = t } }
let lastChapter = ''

/* ---------- the per-frame update, before physics ---------- */
export function update(dt, time) {
  const hero = ch('hero'), drive = ch('drive'), sprout = ch('sprout'), scents = ch('scents'), cards = ch('cards'), finale = ch('finale'), about = ch('about')
  if (!drive) return
  const d = drive.local, s = sprout.local, w = scents.local
  const act = activeChapter()
  if (act.name !== lastChapter) { lastChapter = act.name; dom.body.dataset.chapter = act.name; setNavActive(act.name) }

  /* --- the card opens into the world (drive 0 .. 0.1) --- */
  const open = smoothstep(0, 1, span(d, 0, 0.1))
  state.cardOpen = open
  const top = lerp(px.navH + 6, 0, open), side = lerp(px.inset, 0, open), rad = lerp(px.radius, 0, open)
  // the card is gone once the soil has covered it; it returns on the way back up
  const cardOpacity = s > 0.5 || (scents && w > 0) ? 0 : 1
  if (cardOpacity !== state.cardOpacity || open !== state._lastOpen) {
    dom.card.style.inset = `${top}px ${side}px ${side}px`
    dom.card.style.borderRadius = `${rad}px`
    dom.card.style.opacity = cardOpacity
    state.cardOpacity = cardOpacity; state._lastOpen = open
  }
  // registration marks and logo fade as the card opens
  dom.card.style.setProperty('--reg-o', String(1 - open))
  if (dom.heroLogo) dom.heroLogo.style.opacity = String(1 - smoothstep(0, 0.6, open))
  if (dom.cue) dom.cue.style.opacity = String(0.65 * (1 - smoothstep(0, 0.5, hero.local * 2)))

  /* --- beats inside the drive --- */
  const beatWin = [[0.10, 0.32], [0.32, 0.54], [0.54, 0.76], [0.76, 1.0]]
  beatWin.forEach(([a, b], i) => {
    const u = span(d, a, b)
    const inside = d > a && d < b
    const g = dom.giants[i], be = dom.beats[i]
    if (g) {
      const o = inside ? smoothstep(0, 0.14, u) * (1 - smoothstep(0.86, 1, u)) : 0
      const x = lerp(55, -55, u)
      g.style.opacity = o.toFixed(3)
      g.style.transform = `translate(calc(-50% + ${x}vw), -50%)`
    }
    if (be) {
      const o = inside ? smoothstep(0, 0.16, u) * (1 - smoothstep(0.84, 1, u)) : 0
      const y = (1 - smoothstep(0, 0.16, u)) * 26 - smoothstep(0.84, 1, u) * 26
      be.style.opacity = o.toFixed(3)
      be.style.transform = `translateY(${y.toFixed(1)}px)`
      be.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    }
  })
  // wisps breathe during beats 1-2 and die during "It fades"
  const fadeU = span(d, 0.54, 0.76)
  state.fade = smoothstep(0.12, 0.85, fadeU)
  wispLevel = smoothstep(0.08, 0.3, d) * (1 - state.fade) * (d < 0.78 ? 1 : 0)

  /* --- plant it: the disc leaves the holder and the soil rises --- */
  const pu = span(d, 0.76, 1.0)
  state.plant = pu
  const soilRise = smoothstep(0.22, 0.95, pu)
  // soil stays up through the sprout chapter, then drains at the start of scents
  const soilDrain = smoothstep(0, 0.22, w)
  const soil = s > 0 || d >= 1 ? Math.max(soilRise, 1 - soilDrain) * (w > 0 ? (1 - soilDrain) : 1) : soilRise
  if (soil !== state.soil) {
    state.soil = soil
    dom.soil.style.clipPath = `inset(${((1 - soil) * 100).toFixed(2)}% 0 0 0)`
  }
  const soilY = -WORLD_H / 2 + soil * WORLD_H    // top of the soil in world units
  soilPlane.constant = -(soilY) + (soil <= 0 ? -100 : 0)   // nothing clipped when there is no soil
  setTheme(soil > 0.55 ? 'soil' : 'cream')

  /* --- sprout drawing --- */
  const sp = dom.sprout
  if (sp.stem) {
    const draw = (el, a, b) => { el.style.strokeDashoffset = (1 - smoothstep(a, b, s)).toFixed(4) }
    draw(sp.stem, 0.02, 0.5); draw(sp.leafL, 0.3, 0.62); draw(sp.leafR, 0.4, 0.72)
    draw(sp.veinL, 0.55, 0.8); draw(sp.veinR, 0.62, 0.86); draw(sp.ext, 0.52, 0.9)
    const day = 1 + Math.round(13 * smoothstep(0.02, 0.86, s))
    const dayStr = String(day).padStart(2, '0')
    if (sp.day.textContent !== dayStr) sp.day.textContent = dayStr
    sp.copy.style.opacity = smoothstep(0, 0.1, s).toFixed(3)
    // the leaves lean toward the pointer (cursor-follow: time-smoothed is fine here)
    if (motion.active && cursor.active) {
      const lean = THREE.MathUtils.clamp((cursor.x / view.halfW) * 6, -6, 6)
      sp._lean = lerp(sp._lean || 0, lean, Math.min(1, dt * 4))
    } else sp._lean = lerp(sp._lean || 0, 0, Math.min(1, dt * 4))
    sp.svg.style.transform = `translateX(-50%) rotate(${(sp._lean || 0).toFixed(2)}deg)`
  }

  /* --- hangers: where each one hangs from, and whether it exists --- */
  if (H.hero) {
    const hh = rectAnchor(dom.hangHero), hd = rectAnchor(dom.hangDrive), hp = rectAnchor(dom.hangPlant)
    // the hero pendant moves from the card's top edge to the drive position as the card opens,
    // then drifts to the centre while the paper is planted
    const t1 = open, t2 = smoothstep(0, 0.35, pu)
    let ax = lerp(hh.x, hd.x, t1), ay = lerp(hh.y, hd.y, t1)
    ax = lerp(ax, hp.x, t2)
    const on = s < 0.25 && !(d >= 1 && s >= 0.25)
    if (on && !H.hero.enabled) { H.hero.setEnabled(true); H.hero.reset(ax, ay) }
    if (!on && H.hero.enabled) H.hero.setEnabled(false)
    H.hero.setTarget(ax, ay)
    // the holder fades out once the paper is in the ground
    const holderFade = 1 - smoothstep(0.9, 1, pu) * (s > 0 ? 1 : 0) - smoothstep(0, 0.2, s)
    H.hero.mesh.visible = H.hero.enabled && holderFade > 0.02
    H.hero.woodMat.transparent = true; H.hero.woodMat.opacity = clamp01(holderFade)
    H.hero.cordMat.transparent = true; H.hero.cordMat.opacity = clamp01(holderFade)
    H.hero.shadow.material.opacity = 0.2 * clamp01(holderFade)
    ;[H.hero.bead, H.hero.strandA, H.hero.strandB, ...H.hero.cordMeshes].forEach(m => { if (m.visible !== undefined) m.visible = H.hero.enabled && holderFade > 0.02 && m.visible !== false })
    // paper fade (It fades) and the disc detaching (Plant it)
    if (H.hero.fade) H.hero.fade.material[1].opacity = H.hero.fade.material[2].opacity = state.fade
    H.hero.paperMat.clippingPlanes = [soilPlane]
    H.hero.disc.material.forEach(m => { m.clippingPlanes = [soilPlane] })
    if (H.hero.fade) H.hero.fade.material.forEach(m => { if (m) m.clippingPlanes = [soilPlane] })
    // physics box: the card while it is a card, then the viewport
    const r = dom.card.getBoundingClientRect()
    if (open < 1 && cardOpacity > 0) setBox({ xMin: toWorldX(r.left), xMax: toWorldX(r.right), yMin: toWorldY(r.bottom) })
    else setBox({ xMin: -view.halfW, xMax: view.halfW, yMin: -WORLD_H / 2 })
  }

  /* --- three scents: slide down their strings, then hang in a row --- */
  if (H.scents.length) {
    const vis = s > 0.8 || (w >= 0 && act.name !== 'hero' && act.name !== 'drive' && act.name !== 'sprout')
    H.scents.forEach((h, i) => {
      const a = rectAnchor(dom.hangScents[i])
      // before the scents chapter begins, the anchor waits above the viewport and lowers in
      const drop = s > 0.8 && w === 0 ? 1 - smoothstep(0.8, 1, s) : 0
      const ay = a.y + drop * (h.L + h.R * 2 + 3)
      const on = vis && a.visible && ay > -WORLD_H * 1.2 && ay < WORLD_H * 2.5
      if (on && !h.enabled) { h.setEnabled(true); h.reset(a.x, ay) }
      if (!on && h.enabled) h.setEnabled(false)
      h.setTarget(a.x, ay)
    })
    state.scentsVisible = H.scents.some(h => h.enabled)
  }

  /* --- the finale card --- */
  if (H.finale) {
    const a = rectAnchor(dom.hangFinale)
    const on = a.visible && a.y > -WORLD_H * 1.5 && a.y < WORLD_H * 1.6
    if (on && !H.finale.enabled) { H.finale.setEnabled(true); H.finale.reset(a.x, a.y) }
    if (!on && H.finale.enabled) H.finale.setEnabled(false)
    H.finale.setTarget(a.x, a.y)
  }

  /* --- progress stem --- */
  if (dom.meterStem) {
    dom.meterStem.style.strokeDashoffset = (1 - scroll.progress).toFixed(4)
    const leaf = smoothstep(0.955, 0.995, scroll.progress)
    dom.meterLeaves.style.opacity = leaf.toFixed(3)
    dom.meterLeaves.style.transform = `scale(${(0.2 + 0.8 * leaf).toFixed(3)})`
  }

  /* --- parallax: the whole rig leans a touch toward the pointer --- */
  if (motion.active && cursor.active && !isCoarse) {
    rig.rotation.y = lerp(rig.rotation.y, (cursor.x / view.halfW) * 0.05, Math.min(1, dt * 3))
    rig.rotation.x = lerp(rig.rotation.x, -(cursor.y / (WORLD_H / 2)) * 0.03, Math.min(1, dt * 3))
  } else {
    rig.rotation.y = lerp(rig.rotation.y, 0, Math.min(1, dt * 3))
    rig.rotation.x = lerp(rig.rotation.x, 0, Math.min(1, dt * 3))
  }
}

/* ---------- after physics: things that follow the simulated objects ---------- */
export function afterPhysics(dt, time) {
  const h = H.hero
  if (h && h.enabled) {
    // the disc: in its slot, or on its way into the ground
    const pu = state.plant
    if (pu > 0) {
      if (!state.detached) { scene.attach(h.disc); state.detached = true }
      h.mesh.updateMatrixWorld(true)
      _slot.set(0, 0, 0); h.mesh.localToWorld(_slot); h.mesh.getWorldQuaternion(_slotQ)
      const plant = rectAnchor(dom.hangPlant)
      _plantPos.set(plant.x, plant.y - 0.2, 0.2)
      // pop toward the viewer first, then down
      const pop = smoothstep(0, 0.28, pu), down = smoothstep(0.2, 0.92, pu)
      const ease = down * down * (3 - 2 * down)
      h.disc.position.set(
        lerp(_slot.x, _plantPos.x, ease),
        lerp(_slot.y + pop * 0.15, _plantPos.y, ease),
        lerp(_slot.z + pop * 0.9, _plantPos.z, ease))
      _tmpQ.copy(_slotQ).slerp(PLANT_TILT, smoothstep(0.05, 0.6, pu))
      h.disc.quaternion.copy(_tmpQ)
      // a little gravity-free tumble as it goes down
      h.disc.rotation.z += Math.sin(time * 0.8) * 0.0
    } else if (state.detached) {
      h.mesh.attach(h.disc); state.detached = false
      h.disc.position.set(0, 0, 0); h.disc.quaternion.identity()
    }
    // wisps rise from the disc
    const src = state.detached ? h.disc.position : h.mesh.position
    for (const s of wisps) {
      const u = s.userData
      u.t += dt * u.speed * (motion.active ? 1 : 0.4)
      if (u.t > 1) { u.t = 0; u.drift = Math.random() * Math.PI * 2 }
      const rise = u.t
      s.position.set(src.x + Math.sin(rise * 4 + u.drift) * 0.35 + Math.cos(u.drift) * 0.3, src.y + h.R * 0.1 + rise * h.R * 1.9, src.z + 0.2)
      s.scale.setScalar(u.size * (0.4 + rise * 1.4))
      s.material.opacity = wispLevel * 0.42 * Math.sin(rise * Math.PI)
    }
  } else {
    for (const s of wisps) s.material.opacity = 0
  }

  // chips under the three scents
  if (state.chips.length) {
    H.scents.forEach((hg, i) => {
      const el = state.chips[i]
      if (!el) return
      if (!hg.enabled || !state.scentsVisible) { el.style.opacity = 0; return }
      const p = hg.position()
      const sc = project(_slot.set(p.x, p.y - hg.R - 0.55, p.z))
      el.style.left = sc.x + 'px'; el.style.top = sc.y + 'px'
      el.style.opacity = (1 - state.soil) * (sc.y < view.h + 40 ? 1 : 0)
    })
  }
}

/* for the debug handle */
export function snapshot() {
  const act = activeChapter()
  return {
    progress: +scroll.progress.toFixed(4),
    chapter: act.name,
    locals: Object.fromEntries(chapters.map(c => [c.name, +c.local.toFixed(3)])),
    soil: +state.soil.toFixed(3), cardOpen: +state.cardOpen.toFixed(3), fade: +state.fade.toFixed(3), plant: +state.plant.toFixed(3),
    theme: lastTheme, interactions: stats.interactions, held: !!grab.held,
    hero: H.hero && H.hero.enabled ? (() => { const t = H.hero.body.translation(), v = H.hero.body.linvel(), r = H.hero.body.rotation(); return { x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3), vx: +v.x.toFixed(3), vy: +v.y.toFixed(3), rz: +(2 * Math.atan2(r.z, r.w)).toFixed(3), anchor: { ...H.hero.target } } })() : null,
    scents: H.scents.map(h => h.enabled ? (() => { const t = h.body.translation(); return { x: +t.x.toFixed(2), y: +t.y.toFixed(2) } })() : null),
    finale: H.finale && H.finale.enabled ? (() => { const t = H.finale.body.translation(); return { x: +t.x.toFixed(2), y: +t.y.toFixed(2) } })() : null,
  }
}
