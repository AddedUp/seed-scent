/* Choreography: everything that moves with the scroll is a pure function of
   chapter progress here (enter = arriving, pin = pinned), so nothing can drift. */
import * as THREE from 'three'
import { scene, rig, view, rectAnchor, project, toWorldX, toWorldY, WORLD_H, blobTexture } from './scene.js'
import { hangers, setBox, cursor, grab, stats } from './physics.js'
import { chapters, ch, activeChapter, scroll, motion, isCoarse, clamp01, lerp, smoothstep, span } from './scroll.js'
import { setNavActive, cfg, money, maxNumberIn, navHeight } from './ui.js'

const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]

const dom = {
  body: document.body,
  card: $('#card-panel'),
  soil: $('#soil'),
  hangDrive: $('#hang-drive'), hangPlant: $('#hang-plant'),
  hangScents: $$('.hang-row .hang'), hangFinale: $('#hang-finale'),
  giants: $$('.giant'), beats: $$('.beat'),
  sprout: { stem: $('#stem'), leafL: $('#leaf-l'), leafR: $('#leaf-r'), veinL: $('#vein-l'), veinR: $('#vein-r'), ext: $('#stem-ext'), day: $('#day-num'), dayWord: $('.day-word'), copy: $('.sprout-copy'), svg: $('#sprout-svg') },
  labels: $('#labels'),
  meterStem: $('#meter-stem'), meterLeaves: $('#meter-leaves'),
  cue: $('#cue'),
  heroLogo: $('.hero-logo'),
  heroStage: $('.ch-hero .stage'),
}
;[dom.sprout.stem, dom.sprout.leafL, dom.sprout.leafR, dom.sprout.veinL, dom.sprout.veinR, dom.sprout.ext].forEach(p => p && p.setAttribute('pathLength', '1'))
dom.meterStem && dom.meterStem.setAttribute('pathLength', '1')

/* the hangers, created by main.js */
export const H = { hero: null, scents: [], finale: null }

/* the soil surface as a clipping plane: keeps y >= soilY */
export const soilPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100)

/* scent wisps: a few soft sprites rising from the hero disc */
const wisps = []
export function initWisps() {
  const tex = blobTexture('rgba(251,246,229,1)', 'rgba(251,246,229,0)')
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0xfbf6e5, transparent: true, opacity: 0, depthWrite: false })
    const s = new THREE.Sprite(m)
    s.scale.setScalar(0.5 + Math.random() * 0.5)
    s.userData = { t: Math.random(), speed: 0.12 + Math.random() * 0.1, drift: Math.random() * Math.PI * 2, size: s.scale.x }
    rig.add(s)
    wisps.push(s)
  }
}
let wispLevel = 0

/* ---------- css numbers, read once ---------- */
const px = { navH: 76, inset: 22, radius: 28 }
function readCss() {
  const cs = getComputedStyle(document.documentElement)
  px.navH = parseFloat(cs.getPropertyValue('--nav-h')) || 76
  px.inset = parseFloat(cs.getPropertyValue('--card-inset')) || 22
  px.radius = parseFloat(cs.getPropertyValue('--radius')) || 28
}
readCss()
addEventListener('resize', readCss)

export const state = {
  theme: 'cream', soil: 0, cardOpen: 0, cardOpacity: 1,
  plant: 0, fade: 0, detached: false, holder: 1,
  chips: [], scentsVisible: false,
}

/* the day counter: counts to the configured sprout time, or tells the story in words */
const DAYS = maxNumberIn(cfg('product.daysToSprout'))
const dayCap = DAYS ? Math.max(3, Math.min(60, Math.round(DAYS))) : null

/* chips under the three scents */
export function initChips() {
  const scents = cfg('scents') || []
  const compact = innerWidth < 760
  state.chips = scents.map((s, i) => {
    const el = document.createElement('span')
    el.className = 'chip'
    const name = s.name ? s.name : `<span class="ph">scent name</span>`
    const m = money(s.price)
    const price = m != null ? m : `<span class="ph">price</span>`
    el.innerHTML = compact ? `${String(i + 1).padStart(2, '0')} · ${name}` : `${String(i + 1).padStart(2, '0')} · ${name} · ${price}`
    dom.labels.appendChild(el)
    return el
  })
}

const _slot = new THREE.Vector3(), _slotQ = new THREE.Quaternion(), _plantPos = new THREE.Vector3(), _tmpQ = new THREE.Quaternion(), _off = new THREE.Vector3()
const PLANT_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, 0.25, 0.35))
const CREAM = new THREE.Color('#fbf6e5'), JUTE = new THREE.Color('#b59a6b'), _col = new THREE.Color()

let lastTheme = ''
function setTheme(t) { if (t !== lastTheme) { lastTheme = t; dom.body.dataset.theme = t } }
let lastChapter = ''
let lastCardCss = ''
let cueOff = false

/* ---------- the per-frame update, before physics ---------- */
export function update(dt, time) {
  const hero = ch('hero'), drive = ch('drive'), sprout = ch('sprout'), scents = ch('scents')
  if (!drive || !sprout || !scents) return
  const act = activeChapter()
  if (act.name !== lastChapter) { lastChapter = act.name; dom.body.dataset.chapter = act.name; setNavActive(act.name) }

  /* --- the card opens into the world while the hero slides away (drive.enter) --- */
  const open = smoothstep(0, 1, drive.enter) * (drive.local > 0 ? 1 : 0)
  state.cardOpen = open
  const top = lerp(px.navH + 6, 0, open), side = lerp(px.inset, 0, open), rad = lerp(px.radius, 0, open)
  const cardOpacity = scents.local > 0 ? 0 : 1          // the soil has covered it by then; it returns on the way back
  const cardCss = `${top.toFixed(1)}|${side.toFixed(1)}|${rad.toFixed(1)}|${cardOpacity}`
  if (cardCss !== lastCardCss) {
    lastCardCss = cardCss
    dom.card.style.inset = `${top}px ${side}px ${side}px`
    dom.card.style.borderRadius = `${rad}px`
    dom.card.style.opacity = cardOpacity
    dom.card.style.setProperty('--reg-o', String(1 - open))
  }
  // the hero copy fades as the card opens, so nothing scrolls under the nav or behind the pendant
  if (dom.heroStage) dom.heroStage.style.opacity = (1 - smoothstep(0.05, 0.45, drive.enter) * (drive.local > 0 ? 1 : 0)).toFixed(3)
  if (dom.cue) {
    const off = hero.pin > 0.25 || drive.local > 0
    if (off !== cueOff) { cueOff = off; dom.cue.classList.toggle('off', off) }
  }

  /* --- beats inside the drive (drive.pin) --- */
  const dp = drive.pin
  const pu = span(dp, 0.74, 1.0)
  const soilRise = smoothstep(0.2, 0.95, pu)
  const beatWin = [[0, 0.26], [0.26, 0.5], [0.5, 0.74], [0.74, 1.0]]
  beatWin.forEach(([a, b], i) => {
    const u = span(dp, a, b)
    const inside = drive.local > 0 && drive.local < 1 && dp > a && dp < b
    const g = dom.giants[i], be = dom.beats[i]
    // ink text must leave before the ink soil reaches it
    const soilGate = i === 3 ? 1 - smoothstep(0.1, 0.5, soilRise) : 1
    if (g) {
      const o = inside ? smoothstep(0, 0.14, u) * (1 - smoothstep(0.86, 1, u)) * soilGate : 0
      g.style.opacity = o.toFixed(3)
      g.style.transform = `translate(calc(-50% + ${lerp(55, -55, u).toFixed(2)}vw), -50%)`
    }
    if (be) {
      const o = inside ? smoothstep(0, 0.16, u) * (1 - smoothstep(0.84, 1, u)) * soilGate : 0
      const y = (1 - smoothstep(0, 0.16, u)) * 26 - smoothstep(0.84, 1, u) * 26
      be.style.opacity = o.toFixed(3)
      be.style.transform = `translateY(${y.toFixed(1)}px)`
      be.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    }
  })
  // "It fades": the paper pales and the wisps die
  state.fade = smoothstep(0.12, 0.85, span(dp, 0.5, 0.74))
  wispLevel = smoothstep(0.02, 0.2, dp) * (1 - state.fade) * (dp < 0.76 ? 1 : 0) * (drive.local < 1 ? 1 : 0)

  /* --- "Plant it": the disc leaves the holder, the soil rises --- */
  state.plant = drive.local > 0 ? pu : 0
  let soil
  if (scents.local > 0) soil = 1 - smoothstep(0, 0.75, scents.enter)    // drains before the scents' title arrives
  else if (sprout.local > 0) soil = 1                                     // full through the sprout chapter
  else soil = soilRise
  if (soil !== state.soil) {
    state.soil = soil
    dom.soil.style.clipPath = `inset(${((1 - soil) * 100).toFixed(2)}% 0 0 0)`
  }
  const soilY = -WORLD_H / 2 + soil * WORLD_H
  soilPlane.constant = -soilY + (soil <= 0 ? 100 : 0)
  // the nav lives at the top edge: flip the theme when the soil reaches the nav's own text line
  setTheme(soil > 1 - (px.navH * 0.5) / view.h ? 'soil' : 'cream')

  /* --- the sprout: starts as its stage arrives, draws while pinned, leaves before the wipe --- */
  const sp = dom.sprout
  const s = Math.max(sprout.pin, span(sprout.enter, 0.6, 1) * 0.1 * (sprout.local > 0 && sprout.pin === 0 ? 1 : 0))
  if (sp.stem) {
    const setDraw = (el, v) => { el.style.strokeDashoffset = (1 - v).toFixed(4); el.style.opacity = v > 0.002 ? 1 : 0 }
    const draw = (el, a, b) => setDraw(el, smoothstep(a, b, s))
    draw(sp.stem, 0.02, 0.5); draw(sp.leafL, 0.3, 0.62); draw(sp.leafR, 0.4, 0.72)
    draw(sp.veinL, 0.55, 0.8); draw(sp.veinR, 0.62, 0.86)
    // the stem keeps growing into a string as the stage leaves and the scents arrive
    const ext = Math.max(smoothstep(0.7, 1, s), smoothstep(0, 0.6, scents.enter) * (scents.local > 0 ? 1 : 0))
    setDraw(sp.ext, ext)
    // the drawing turns from cream to jute as the soil drains past it, so it reads on both grounds
    _col.copy(CREAM).lerp(JUTE, 1 - smoothstep(0.6, 0.95, soil))
    sp.svg.style.color = '#' + _col.getHexString()
    if (dayCap) {
      const day = 1 + Math.round((dayCap - 1) * smoothstep(0.02, 0.86, s))
      const dayStr = String(day).padStart(2, '0')
      if (sp.day.textContent !== dayStr) sp.day.textContent = dayStr
    } else {
      // no confirmed sprout time yet: tell it in words instead of inventing a number
      const word = s < 0.35 ? 'one' : s < 0.72 ? 'after day' : 'sprouts'
      const prefix = s < 0.72 ? 'Day' : 'First'
      if (sp.day.textContent !== word) { sp.day.textContent = word; sp.day.classList.toggle('word', true) }
      if (sp.dayWord && sp.dayWord.textContent !== prefix) sp.dayWord.textContent = prefix
    }
    const copyIn = smoothstep(0, 0.1, s)
    const copyOut = 1 - smoothstep(0, 0.2, scents.local > 0 ? scents.enter : 0)
    sp.copy.style.opacity = (copyIn * copyOut).toFixed(3)
    if (motion.active && cursor.active) {
      const lean = THREE.MathUtils.clamp((cursor.x / view.halfW) * 6, -6, 6)
      sp._lean = lerp(sp._lean || 0, lean, Math.min(1, dt * 4))
    } else sp._lean = lerp(sp._lean || 0, 0, Math.min(1, dt * 4))
    sp.svg.style.transform = `translateX(-50%) rotate(${(sp._lean || 0).toFixed(2)}deg)`
  }

  /* --- hangers --- */
  const cardRect = dom.card.getBoundingClientRect()
  if (H.hero) {
    const hd = rectAnchor(dom.hangDrive), hp = rectAnchor(dom.hangPlant)
    let ax, ay
    if (drive.local <= 0 || drive.enter < 1) { ax = toWorldX(cardRect.left + cardRect.width * 0.66); ay = toWorldY(cardRect.top) }
    else { ax = hd.x; ay = hd.y }
    const t2 = smoothstep(0, 0.35, pu) * (drive.local > 0 ? 1 : 0)
    ax = lerp(ax, hp.x, t2)
    // the holder stays while the disc goes in, hands over to the plant, then fades
    const holder = drive.local <= 0 ? 1 : 1 - smoothstep(0.3, 0.9, sprout.enter) * (sprout.local > 0 ? 1 : 0)
    state.holder = holder
    const on = holder > 0.02 && !['scents', 'cards', 'inside', 'firms', 'about', 'finale'].includes(act.name)
    if (on && !H.hero.enabled) { H.hero.setEnabled(true); H.hero.reset(ax, ay) }
    if (!on && H.hero.enabled) H.hero.setEnabled(false)
    H.hero.setTarget(ax, ay)
    H.hero.woodMat.transparent = holder < 1; H.hero.woodMat.opacity = clamp01(holder)
    H.hero.cordMat.transparent = holder < 1; H.hero.cordMat.opacity = clamp01(holder)
    if (H.hero.fade) H.hero.fade.material[1].opacity = H.hero.fade.material[2].opacity = state.fade
    // the physics box only exists for the hero: the card while it is a card, then the viewport
    if (!H.hero.enabled) setBox(null)
    else if (open < 1 && cardOpacity > 0) setBox({ xMin: toWorldX(cardRect.left), xMax: toWorldX(cardRect.right), yMin: toWorldY(cardRect.bottom) })
    else setBox({ xMin: -view.halfW, xMax: view.halfW, yMin: -WORLD_H / 2 })
  }

  /* --- three scents: slide down their strings while arriving, then hang from the stage --- */
  if (H.scents.length) {
    H.scents.forEach((h, i) => {
      const a = rectAnchor(dom.hangScents[i])
      let ax = a.x, ay = a.y
      if (scents.local > 0 && scents.enter < 1) {
        // the stage is still rising from below: hang from the top edge instead and lower in,
        // parked just above the frame so the first disc appears while the stem line is still on screen
        const drop = 1 - smoothstep(0, 1, scents.enter)
        ay = WORLD_H / 2 + drop * (h.L + h.R + 0.6)
      }
      const on = scents.local > 0 && ay > -WORLD_H * 1.2 && ay < WORLD_H * 2.5
      if (on && !h.enabled) { h.setEnabled(true); h.reset(ax, ay) }
      if (!on && h.enabled) h.setEnabled(false)
      h.setTarget(ax, ay)
    })
    state.scentsVisible = scents.pin > 0 || (scents.local > 0 && scents.enter > 0.2) || (scents.local >= 1)
  }

  /* --- the finale card --- */
  if (H.finale) {
    const a = rectAnchor(dom.hangFinale)
    const on = a.y > -WORLD_H * 1.5 && a.y < WORLD_H * 1.6
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

  /* --- parallax: the whole rig leans and slides a touch toward the pointer --- */
  const k = Math.min(1, dt * 3)
  if (motion.active && cursor.active && !isCoarse) {
    rig.rotation.y = lerp(rig.rotation.y, (cursor.x / view.halfW) * 0.05, k)
    rig.rotation.x = lerp(rig.rotation.x, -(cursor.y / (WORLD_H / 2)) * 0.03, k)
    rig.position.x = lerp(rig.position.x, (cursor.x / view.halfW) * 0.08, k)
    rig.position.y = lerp(rig.position.y, (cursor.y / (WORLD_H / 2)) * 0.05, k)
  } else {
    rig.rotation.y = lerp(rig.rotation.y, 0, k)
    rig.rotation.x = lerp(rig.rotation.x, 0, k)
    rig.position.x = lerp(rig.position.x, 0, k)
    rig.position.y = lerp(rig.position.y, 0, k)
  }
}

/* ---------- after physics: things that follow the simulated objects ---------- */
export function afterPhysics(dt, time) {
  const h = H.hero
  if (h && h.enabled) {
    const pu = state.plant
    if (pu > 0) {
      if (!state.detached) { scene.attach(h.disc); state.detached = true }
      h.mesh.updateMatrixWorld(true)
      _slot.set(0, 0, 0); h.mesh.localToWorld(_slot); h.mesh.getWorldQuaternion(_slotQ)
      const plant = rectAnchor(dom.hangPlant)
      _plantPos.set(plant.x, plant.y - 0.2, 0.2)
      // first it pops out through the face of the ring (in the ring's own frame), then it drops
      const pop = smoothstep(0, 0.3, pu), down = smoothstep(0.25, 0.92, pu)
      const ease = down * down * (3 - 2 * down)
      _off.set(0, 0.1 * pop, 1.25 * pop).applyQuaternion(_slotQ)
      h.disc.position.set(
        lerp(_slot.x + _off.x, _plantPos.x, ease),
        lerp(_slot.y + _off.y, _plantPos.y, ease),
        lerp(_slot.z + _off.z, _plantPos.z, ease))
      // it only tilts once it is clear of the ring
      _tmpQ.copy(_slotQ).slerp(PLANT_TILT, smoothstep(0.4, 0.85, pu))
      h.disc.quaternion.copy(_tmpQ)
    } else if (state.detached) {
      h.mesh.attach(h.disc); state.detached = false
      h.disc.position.set(0, 0, 0); h.disc.quaternion.identity()
    }
    const src = state.detached ? h.disc.position : h.mesh.position
    for (const s of wisps) {
      const u = s.userData
      if (motion.active) u.t += dt * u.speed
      if (u.t > 1) { u.t = 0; u.drift = Math.random() * Math.PI * 2 }
      const rise = u.t
      s.position.set(src.x + Math.sin(rise * 4 + u.drift) * 0.35 + Math.cos(u.drift) * 0.3, src.y + h.R * 0.1 + rise * h.R * 1.9, src.z + 0.2)
      s.scale.setScalar(u.size * (0.4 + rise * 1.4))
      s.material.opacity = wispLevel * 0.42 * Math.sin(rise * Math.PI)
    }
  } else {
    if (h && state.detached) { h.mesh.attach(h.disc); state.detached = false; h.disc.position.set(0, 0, 0); h.disc.quaternion.identity() }
    for (const s of wisps) s.material.opacity = 0
  }

  // chips under the three scents: they belong to their disc, so they follow it in and out of the frame
  if (state.chips.length) {
    H.scents.forEach((hg, i) => {
      const el = state.chips[i]
      if (!el) return
      if (!hg.enabled || !state.scentsVisible) { el.style.opacity = 0; return }
      const p = hg.position()
      const disc = project(_slot.set(p.x, p.y, p.z))
      const sc = project(_slot.set(p.x, p.y - hg.R - 0.55, p.z))
      const rPx = hg.R / view.wpp
      const onScreen = smoothstep(-rPx, rPx * 0.2, disc.y) * (1 - smoothstep(view.h - 10, view.h + 40, sc.y))
      // on narrow screens the three chips would touch: the middle one sits a row lower
      const stagger = view.w < 760 && i % 2 === 1 ? 36 : 0
      el.style.left = sc.x + 'px'; el.style.top = (sc.y + stagger) + 'px'
      el.style.opacity = ((1 - state.soil) * onScreen).toFixed(3)
    })
  }
}

/* for the debug handle */
export function snapshot() {
  const act = activeChapter()
  return {
    progress: +scroll.progress.toFixed(4),
    chapter: act.name,
    locals: Object.fromEntries(chapters.map(c => [c.name, { local: +c.local.toFixed(3), enter: +c.enter.toFixed(3), pin: +c.pin.toFixed(3) }])),
    soil: +state.soil.toFixed(3), cardOpen: +state.cardOpen.toFixed(3), fade: +state.fade.toFixed(3), plant: +state.plant.toFixed(3), holder: +state.holder.toFixed(3),
    theme: lastTheme, interactions: stats.interactions, held: !!grab.held,
    hero: H.hero && H.hero.enabled ? (() => { const t = H.hero.body.translation(), v = H.hero.body.linvel(), r = H.hero.body.rotation(); return { x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3), vx: +v.x.toFixed(3), vy: +v.y.toFixed(3), rz: +(2 * Math.atan2(r.z, r.w)).toFixed(3), anchor: { ...H.hero.target } } })() : null,
    scents: H.scents.map(h => h.enabled ? (() => { const t = h.body.translation(); return { x: +t.x.toFixed(2), y: +t.y.toFixed(2) } })() : null),
    finale: H.finale && H.finale.enabled ? (() => { const t = H.finale.body.translation(); return { x: +t.x.toFixed(2), y: +t.y.toFixed(2) } })() : null,
  }
}
