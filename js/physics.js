/* Rapier physics: pendants hanging on cords, a cursor that shoves them,
   grab-and-throw, scroll impulses. Every hanger is a kinematic anchor,
   a chain of rope segments and the pendant body (a thin cylinder).

   The cord never breaks. A held pendant goes wherever its cord reaches; past
   that the cord goes taut, gives a little like a rubber band, and letting go
   snaps the pendant back. The cord is drawn joint to joint, so it is one
   unbroken line whatever the solver is doing, and after every step a watchdog
   pulls back any pendant that something has dragged past the end of its cord. */
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { rig, camera, view, pendantMesh, placeBetween, blobTexture, toWorldX, toWorldY } from './scene.js'
import { lenis, isCoarse } from './scroll.js'

export let world = null
export const hangers = []
export const tune = {
  gravity: -30,
  scrollImpulse: 0.02,     // per px/frame of scroll velocity, times mass
  scrollZ: 0.009,
  breeze: 1.6,             // idle/touch breeze strength
  cursorRadius: 0.4,
  throw: 0.8,
  maxSpeed: 7.5,           // a nudge should swing it, never launch it into orbit
  maxSpin: 10,
  stretchMax: 0.14,        // how far a taut cord gives, as a share of its reach
  stretchEase: 0.5,        // how soon that give runs out as the pull grows
  recoil: 34,              // snap-back speed per world unit of stretch
  recoilMax: 16,
  snapSpeed: 17,           // speed cap for the half second after a stretched release
  yawSpring: 25,           // the two strands resist twisting: how firmly the face turns back to the front
  yawDamp: 6,
}

let cursorBody = null
let walls = null
let boxNow = null
let shadowTex = null
export const cursor = { x: 999, y: 999, active: false, over: false }
export const grab = { held: null, offset: new THREE.Vector3(), want: new THREE.Vector3(), vel: new THREE.Vector3(), prevC: new THREE.Vector3() }
export const stats = { interactions: 0, lastInteraction: 0 }

const Q_X90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const DOWN = new THREE.Vector3(0, -1, 0)

export async function initPhysics() {
  await RAPIER.init()
  world = new RAPIER.World({ x: 0, y: tune.gravity, z: 0 })
  // chains of joints need a few more solver passes than a pile of boxes
  world.integrationParameters.numSolverIterations = 8
  shadowTex = blobTexture('rgba(0,0,0,1)', 'rgba(0,0,0,0)')

  cursorBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(999, 999, 0))
  world.createCollider(RAPIER.ColliderDesc.ball(tune.cursorRadius).setFriction(0.9), cursorBody)

  // keep everything near the z = 0 plane and inside a box the choreography sizes each frame
  const big = 80
  world.createCollider(RAPIER.ColliderDesc.cuboid(big, big, 0.5).setTranslation(0, 0, -2.2))
  world.createCollider(RAPIER.ColliderDesc.cuboid(big, big, 0.5).setTranslation(0, 0, 2.2))
  walls = {
    left: world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, big, 3).setTranslation(-big, 0, 0)),
    right: world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, big, 3).setTranslation(big, 0, 0)),
    floor: world.createCollider(RAPIER.ColliderDesc.cuboid(big, 0.5, 3).setTranslation(0, -big, 0)),
  }
  bindPointer()
  return world
}

/* the invisible box the pendants live in (world units). Pass null to open it up. */
export function setBox(box) {
  if (!walls) return
  boxNow = box || null
  const big = 80
  if (!box) {
    walls.left.setTranslation({ x: -big, y: 0, z: 0 })
    walls.right.setTranslation({ x: big, y: 0, z: 0 })
    walls.floor.setTranslation({ x: 0, y: -big, z: 0 })
    return
  }
  walls.left.setTranslation({ x: box.xMin - 0.5, y: 0, z: 0 })
  walls.right.setTranslation({ x: box.xMax + 0.5, y: 0, z: 0 })
  walls.floor.setTranslation({ x: 0, y: box.yMin - 0.5, z: 0 })
}

export class Hanger {
  constructor({ name, R, L, segs = 8, beadAt = 0.68, textures }) {
    this.name = name; this.R = R; this.L = L; this.segs = segs
    this.enabled = true
    this.target = { x: 0, y: 60 }
    const segLen = L / segs
    this.segLen = segLen
    // the give of a taut cord: only drawn, the bodies never stretch
    this.stretch = 0; this.stretchVel = 0; this.boostUntil = 0

    this.anchor = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 60, 0))
    this.ropeBodies = []
    let prev = this.anchor
    for (let i = 0; i < segs; i++) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 60 - segLen * (i + 0.5), 0)
          .setLinearDamping(1.6).setAngularDamping(2.0)
          .setCanSleep(false))
      // a real capsule so the segment has mass AND angular inertia (a chain of
      // inertia-less bodies cannot bend and the solver blows up to NaN);
      // collision group 2 with an empty filter: the rope touches nothing
      world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0.01, segLen / 2 - 0.03), 0.03)
          .setDensity(14).setCollisionGroups((0x0002 << 16) | 0x0000),
        b)
      const j = RAPIER.JointData.spherical({ x: 0, y: i === 0 ? 0 : -segLen / 2, z: 0 }, { x: 0, y: segLen / 2, z: 0 })
      world.createImpulseJoint(j, prev, b, true)
      this.ropeBodies.push(b); prev = b
    }
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 60 - L - R, 0)
        .setLinearDamping(0.9).setAngularDamping(2.4)
        .setCanSleep(false).setCcdEnabled(true))
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cylinder(R * 0.08, R)
        .setRotation({ x: Q_X90.x, y: Q_X90.y, z: Q_X90.z, w: Q_X90.w })
        .setDensity(0.08).setRestitution(0.25).setFriction(0.7),
      this.body)
    world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: -segLen / 2, z: 0 }, { x: 0, y: R, z: 0 }), prev, this.body, true)
    this.mass = this.body.mass()

    // meshes
    const pm = pendantMesh({ R, ...textures })
    this.mesh = pm.group; this.disc = pm.disc; this.fade = pm.fade; this.paperMat = pm.paperMat; this.woodMat = pm.woodMat
    this.mesh.userData.hanger = this
    rig.add(this.mesh)
    const cordMat = new THREE.MeshStandardMaterial({ color: 0xb59a6b, roughness: 1 })
    this.cordMat = cordMat
    const cyl = new THREE.CylinderGeometry(R * 0.018, R * 0.018, 1, 8)
    this.cordMeshes = this.ropeBodies.map(() => { const m = new THREE.Mesh(cyl, cordMat); rig.add(m); return m })
    this.strandA = new THREE.Mesh(cyl, cordMat); this.strandB = new THREE.Mesh(cyl, cordMat)
    rig.add(this.strandA, this.strandB)
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(R * 0.09, 24, 16), pm.woodMat)
    rig.add(this.bead)
    this.beadIndex = Math.max(1, Math.min(segs - 1, Math.round(segs * beadAt)))
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 3.0, R * 3.0),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.2, depthWrite: false, color: 0x203419 }))
    rig.add(this.shadow)

    this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._e = new THREE.Vector3(); this._q = new THREE.Quaternion()
    // the cord's joints, top to bottom: the hang point, then the bottom end of every segment
    this._pts = Array.from({ length: segs + 1 }, () => new THREE.Vector3())
    this.setEnabled(false)
    hangers.push(this)
  }

  setEnabled(on) {
    if (this.enabled === on) return
    this.enabled = on
    this.anchor.setEnabled(on)
    for (const b of this.ropeBodies) b.setEnabled(on)
    this.body.setEnabled(on)
    this.mesh.visible = on; this.bead.visible = on; this.shadow.visible = on
    this.strandA.visible = on; this.strandB.visible = on
    for (const m of this.cordMeshes) m.visible = on
    if (!on) { this.stretch = 0; this.stretchVel = 0 }
  }

  /* teleport the whole chain to hang straight down from (x, y), at rest */
  reset(x, y) {
    this.target.x = x; this.target.y = y
    this.anchor.setTranslation({ x, y, z: 0 }, true)
    const zero = { x: 0, y: 0, z: 0 }, id = { x: 0, y: 0, z: 0, w: 1 }
    this.ropeBodies.forEach((b, i) => {
      b.setTranslation({ x, y: y - this.segLen * (i + 0.5), z: 0 }, true)
      b.setRotation(id, true); b.setLinvel(zero, true); b.setAngvel(zero, true)
    })
    this.body.setTranslation({ x, y: y - this.L - this.R, z: 0 }, true)
    this.body.setRotation(id, true); this.body.setLinvel(zero, true); this.body.setAngvel(zero, true)
    this.stretch = 0; this.stretchVel = 0
  }

  setTarget(x, y) { this.target.x = x; this.target.y = y }

  /* world position of the pendant centre */
  position() { const t = this.body.translation(); return this._v.set(t.x, t.y, t.z) }

  /* the cord's joints in world space, into this._pts */
  joints() {
    const P = this._pts, at = this.anchor.translation(), n = this.ropeBodies.length
    P[0].set(at.x, at.y, at.z)
    for (let i = 0; i < n; i++) {
      const b = this.ropeBodies[i], bt = b.translation(), bq = b.rotation()
      P[i + 1].set(0, -this.segLen / 2, 0).applyQuaternion(this._q.set(bq.x, bq.y, bq.z, bq.w))
      P[i + 1].x += bt.x; P[i + 1].y += bt.y; P[i + 1].z += bt.z
    }
    return P
  }

  /* numbers for verification: how long the cord is against its real length, and how far its
     end is from the pendant's ring. Both are 1 and 0 on a healthy cord. */
  measure() {
    const P = this.joints(), n = this.ropeBodies.length
    let len = 0
    for (let i = 0; i < n; i++) len += P[i].distanceTo(P[i + 1])
    const t = this.body.translation(), r = this.body.rotation()
    this._a.set(0, this.R, 0).applyQuaternion(this._q.set(r.x, r.y, r.z, r.w))
    this._a.x += t.x; this._a.y += t.y; this._a.z += t.z
    return {
      length: +(len / this.L).toFixed(3), end: +(P[0].distanceTo(this._a) / this.L).toFixed(3), gap: +P[n].distanceTo(this._a).toFixed(3),
      stretch: +this.stretch.toFixed(3), reach: +(this.L + this.R).toFixed(3), dist: +Math.hypot(t.x - P[0].x, t.y - P[0].y, t.z - P[0].z).toFixed(3),
      x: +t.x.toFixed(3), y: +t.y.toFixed(3), R: +this.R.toFixed(3),
    }
  }

  /* Make the cord whole again when the solver has let it stretch or come away from the ring
     (a fast hand, a jump of the page): walk the joints back onto a chain of the right length
     between the hang point and the top of the ring, then lay the segments along it.
     vx, vy: the pendant's speed, shared out along the cord so it does not whip. */
  mend(vx = 0, vy = 0) {
    const P = this.joints(), n = this.ropeBodies.length, d = this.segLen
    const t = this.body.translation(), r = this.body.rotation()
    const E = this._e.set(0, this.R, 0).applyQuaternion(this._q.set(r.x, r.y, r.z, r.w))
    E.x += t.x; E.y += t.y; E.z += t.z
    let len = 0
    for (let i = 0; i < n; i++) len += P[i].distanceTo(P[i + 1])
    if (len <= this.L * 1.03 && P[n].distanceTo(E) <= d * 0.15) return false
    for (let it = 0; it < 8; it++) {
      P[n].copy(E)
      for (let i = n - 1; i >= 1; i--) { this._b.subVectors(P[i], P[i + 1]); const l = this._b.length() || 1e-6; P[i].copy(P[i + 1]).addScaledVector(this._b, d / l) }
      for (let i = 1; i <= n; i++) { this._b.subVectors(P[i], P[i - 1]); const l = this._b.length() || 1e-6; P[i].copy(P[i - 1]).addScaledVector(this._b, d / l) }
      if (P[n].distanceTo(E) < d * 0.02) break
    }
    const zero = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < n; i++) {
      const b = this.ropeBodies[i], a = P[i], c = P[i + 1]
      this._b.subVectors(c, a)
      if (this._b.lengthSq() < 1e-10) this._b.copy(DOWN); else this._b.normalize()
      this._q.setFromUnitVectors(DOWN, this._b)
      b.setTranslation({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 }, true)
      b.setRotation({ x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w }, true)
      const k = (i + 0.5) / n
      b.setLinvel({ x: vx * k, y: vy * k, z: 0 }, true); b.setAngvel(zero, true)
    }
    return true
  }

  sync() {
    const t = this.body.translation(), r = this.body.rotation()
    const P = this.joints(), n = this.ropeBodies.length
    // a taut cord gives a little: slide the pendant and the cord's joints along the pull
    const s = this.stretch
    let ux = 0, uy = 0
    if (s !== 0) {
      const dx = t.x - P[0].x, dy = t.y - P[0].y, d = Math.hypot(dx, dy)
      if (d > 1e-4) { ux = dx / d; uy = dy / d }
      for (let i = 1; i <= n; i++) { const k = s * i / n; P[i].x += ux * k; P[i].y += uy * k }
    }
    // the cord runs just behind the ring, so a slack cord folds out of sight instead of over the paper
    const back = this.R * 0.2
    for (let i = 0; i <= n; i++) P[i].z -= back
    this.mesh.position.set(t.x + ux * s, t.y + uy * s, t.z)
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    this.mesh.updateMatrixWorld(true)
    // a stretched cord thins as it lengthens
    const thin = s > 0 ? 1 / Math.sqrt(1 + s / this.L) : 1
    for (let i = 0; i < n; i++) {
      const m = this.cordMeshes[i]
      if (i >= this.beadIndex) { m.visible = false; continue }
      placeBetween(m, P[i], P[i + 1])
      m.scale.x = m.scale.z = thin
    }
    // bead at the bottom end of the last drawn segment
    this._a.copy(P[this.beadIndex])
    this.bead.position.copy(this._a)
    // two strands from the bead to the top of the ring
    const pa = this._b.set(-this.R * 0.26, this.R * 0.985, 0); this.mesh.localToWorld(pa)
    placeBetween(this.strandA, this._a, pa)
    const pb = this._b.set(this.R * 0.26, this.R * 0.985, 0); this.mesh.localToWorld(pb)
    placeBetween(this.strandB, this._a, pb)
    // soft contact shadow, offset down-right, behind the object
    this.shadow.position.set(this.mesh.position.x + this.R * 0.32, this.mesh.position.y - this.R * 0.42, t.z - 0.75)
    this.shadow.material.opacity = 0.2 * Math.max(0, 1 - Math.abs(t.z) * 0.35)
  }
}

/* ---------- pointer: cursor collider, hover cursor, grab and throw ---------- */
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2(-9, -9)
const planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const pt = new THREE.Vector3()
let pointerOnPage = false

function pointerToWorld(e) {
  ndc.set((e.clientX / view.w) * 2 - 1, -(e.clientY / view.h) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  ray.ray.intersectPlane(planeZ0, pt)
  return pt
}
function hitHanger() {
  ray.setFromCamera(ndc, camera)
  const meshes = hangers.filter(h => h.enabled).map(h => h.mesh)
  const hit = ray.intersectObjects(meshes, true)[0]
  if (!hit) return null
  let o = hit.object
  while (o && !o.userData.hanger) o = o.parent
  return o ? o.userData.hanger : null
}
function noteInteraction() {
  stats.interactions++; stats.lastInteraction = performance.now()
  if (stats.interactions === 1) dispatchEvent(new CustomEvent('pendant:interact'))
}

function bindPointer() {
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && !grab.held) return
    pointerOnPage = true
    const p = pointerToWorld(e)
    cursor.x = p.x; cursor.y = p.y; cursor.active = true
    // the held pendant is moved in step(), where the cord's reach is enforced
    if (grab.held) { grab.want.set(p.x + grab.offset.x, p.y + grab.offset.y, 0); return }
    const over = !!hitHanger()
    if (over !== cursor.over) { cursor.over = over; document.body.style.cursor = over ? 'grab' : '' }
  }, { passive: true })

  addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (e.target.closest('a, button, input, select, textarea, label, .bag')) return
    pointerToWorld(e)
    const h = hitHanger()
    stats.lastDown = { x: e.clientX, y: e.clientY, hit: !!h, target: e.target.tagName + (e.target.className ? '.' + e.target.className : ''), type: e.pointerType }
    if (!h) return
    e.preventDefault()
    grab.held = h
    h.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    const b = h.body.translation()
    grab.offset.set(b.x - pt.x, b.y - pt.y, 0)
    grab.want.set(b.x, b.y, 0); grab.prevC.set(b.x, b.y, 0); grab.vel.set(0, 0, 0)
    h.stretchVel = 0; h.boostUntil = 0
    document.body.style.cursor = 'grabbing'
    lenis && lenis.stop()
    noteInteraction()
  })

  const release = () => {
    const h = grab.held
    if (!h) return
    grab.held = null
    h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    const v = grab.vel.clone().multiplyScalar(tune.throw)
    const cap = 18
    if (v.length() > cap) v.setLength(cap)
    if (h.stretch > 0.01) {
      // a stretched cord snaps the pendant back toward its hang point
      const t = h.body.translation(), dx = h.target.x - t.x, dy = h.target.y - t.y, d = Math.hypot(dx, dy) || 1
      const out = -(v.x * dx + v.y * dy) / d
      if (out > 0) { v.x += dx / d * out; v.y += dy / d * out }   // a taut cord cannot be thrown outward
      const s = Math.min(tune.recoilMax, h.stretch * tune.recoil)
      v.x += dx / d * s; v.y += dy / d * s
      h.boostUntil = performance.now() + 500
    }
    h.body.setLinvel({ x: v.x, y: v.y, z: 0 }, true)
    h.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    document.body.style.cursor = cursor.over ? 'grab' : ''
    lenis && lenis.start()
  }
  // while a finger holds the pendant, the page must not scroll under it
  addEventListener('touchmove', e => { if (grab.held) e.preventDefault() }, { passive: false })
  addEventListener('pointerup', release)
  addEventListener('pointercancel', release)
  addEventListener('blur', release)
  addEventListener('pointerleave', () => { cursor.active = false })
  document.addEventListener('mouseleave', () => { cursor.active = false })
}

/* ---------- the held pendant: follow the hand as far as the cord allows ---------- */
const _qt = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _up = new THREE.Vector3()
function hold(h, dt) {
  const ax = h.target.x, ay = h.target.y
  let cx = grab.want.x, cy = grab.want.y
  if (boxNow) {   // a pendant let go outside the box would be shut out of it
    cx = Math.min(Math.max(cx, boxNow.xMin + h.R * 0.95), boxNow.xMax - h.R * 0.95)
    cy = Math.max(cy, boxNow.yMin + h.R * 0.95)
  }
  const dx = ax - cx, dy = ay - cy, d = Math.hypot(dx, dy) || 1e-6
  const taut = h.L * 0.992, reach = taut + h.R
  const toward = Math.atan2(-dx, dy)     // the turn that points the top of the ring at the hang point
  let phi = 0, give = 0
  if (d > reach) {
    // past the cord's reach: stay on the end of the cord and let it give like a rubber band
    const over = d - reach, max = tune.stretchMax * reach
    give = max * (1 - 1 / (1 + over * tune.stretchEase / max))
    cx = ax - dx / d * reach; cy = ay - dy / d * reach
    phi = toward
  } else {
    // within reach: lean the ring toward the hang point only as far as the cord needs
    const fits = a => Math.hypot(cx - Math.sin(a) * h.R - ax, cy + Math.cos(a) * h.R - ay) <= taut
    if (!fits(0)) {
      let lo = 0, hi = 1
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (fits(toward * mid)) hi = mid; else lo = mid }
      phi = toward * Math.min(1, hi + 0.03)
    }
  }
  const r = h.body.rotation()
  _qc.set(r.x, r.y, r.z, r.w).slerp(_qt.setFromAxisAngle(Z_AXIS, phi), 1 - Math.exp(-dt * 16))
  // while the ring is still turning, its top may be past the cord: bring the pendant in by the difference
  _up.set(0, h.R, 0).applyQuaternion(_qc)
  const ex = cx + _up.x - ax, ey = cy + _up.y - ay, el = Math.hypot(ex, ey, _up.z)
  if (el > taut) { const k = (el - taut) / el; cx -= ex * k; cy -= ey * k }
  h.body.setNextKinematicTranslation({ x: cx, y: cy, z: 0 })
  h.body.setNextKinematicRotation({ x: _qc.x, y: _qc.y, z: _qc.z, w: _qc.w })
  // what gets thrown is the pendant's own motion, not the hand's
  _c.set((cx - grab.prevC.x) / dt, (cy - grab.prevC.y) / dt, 0)
  grab.vel.lerp(_c, 0.4); grab.prevC.set(cx, cy, 0)
  h.stretch += (give - h.stretch) * (1 - Math.exp(-dt * 28)); h.stretchVel = 0
}

/* ---------- step ---------- */
let breezeT = Math.random() * 10
const prevCursor = new THREE.Vector3(999, 999, 0)
const cursorVel = new THREE.Vector3()
const _c = new THREE.Vector3()
const _wq = new THREE.Quaternion(), _we = new THREE.Vector3()
export function step(dt, { vel = 0, active = true } = {}) {
  if (!world) return
  breezeT += dt
  // cursor body (parked far away when the pointer is off the page or on touch)
  if (cursor.active && !grab.held) cursorBody.setNextKinematicTranslation({ x: cursor.x, y: cursor.y, z: 0 })
  else cursorBody.setNextKinematicTranslation({ x: 999, y: 999, z: 0 })
  // cursor velocity (world units per second), smoothed
  if (cursor.active && prevCursor.x < 900) {
    _c.set(cursor.x, cursor.y, 0).sub(prevCursor).divideScalar(Math.max(dt, 1 / 240))
    cursorVel.lerp(_c, 0.5)
  } else cursorVel.set(0, 0, 0)
  prevCursor.set(cursor.active ? cursor.x : 999, cursor.active ? cursor.y : 999, 0)

  const v = Math.max(-90, Math.min(90, vel))
  const idle = performance.now() - stats.lastInteraction > 5000
  const speedBefore = new Map()
  const sdt = Math.min(Math.max(dt, 1 / 120), 1 / 30)
  for (const h of hangers) {
    if (!h.enabled) continue
    // a big jump of the hang point (anchor links, instant scrolls) would yank the chain apart:
    // snap the whole hanger to the new place instead and let it settle from there
    const at = h.anchor.translation()
    if (Math.hypot(h.target.x - at.x, h.target.y - at.y) > 1.0) {
      if (grab.held === h) { grab.want.set(h.target.x, h.target.y - h.L - h.R, 0); grab.prevC.copy(grab.want) }
      h.reset(h.target.x, h.target.y); continue
    }
    h.anchor.setNextKinematicTranslation({ x: h.target.x, y: h.target.y, z: 0 })
    if (grab.held === h) { hold(h, sdt); continue }
    // the give of a let-go cord rings out like a plucked string
    if (h.stretch !== 0 || h.stretchVel !== 0) {
      h.stretchVel += (-700 * h.stretch - 20 * h.stretchVel) * sdt
      h.stretch += h.stretchVel * sdt
      if (Math.abs(h.stretch) < 0.002 && Math.abs(h.stretchVel) < 0.05) { h.stretch = 0; h.stretchVel = 0 }
    }
    const m = h.mass
    const lv0 = h.body.linvel(); speedBefore.set(h, Math.hypot(lv0.x, lv0.y, lv0.z))
    if (active && Math.abs(v) > 1.5) {
      // scrolling is driving: the pendant swings back as the car corners
      h.body.applyImpulse({ x: -v * tune.scrollImpulse * m * dt * 60 * 0.25, y: 0, z: v * tune.scrollZ * m * dt * 60 * 0.25 }, true)
    }
    if (active && cursor.active) {
      // the moving cursor pushes air: a soft wind that falls off with distance, so a wiggle anywhere near counts
      const p = h.position()
      const d = Math.hypot(p.x - cursor.x, p.y - cursor.y)
      const reach = h.R + 2.6
      if (d < reach && d > h.R * 0.2) {
        const w = (1 - d / reach) * 0.012 * m
        h.body.applyImpulse({ x: cursorVel.x * w, y: cursorVel.y * w * 0.4, z: 0 }, true)
      }
    }
    if (active && (isCoarse || idle)) {
      const f = tune.breeze * m * dt
      h.body.applyImpulse({ x: Math.sin(breezeT * 0.9 + h.R) * f, y: 0, z: Math.cos(breezeT * 0.55) * f * 0.5 }, true)
    }
  }
  world.timestep = sdt
  world.step()
  const now = performance.now()
  for (const h of hangers) {
    if (!h.enabled || grab.held === h) continue
    const t = h.body.translation()
    // a chain that has blown up starts again from rest
    if (!Number.isFinite(t.x + t.y + t.z)) { h.reset(h.target.x, h.target.y); continue }
    let lv = h.body.linvel()
    // the watchdog: nothing may leave the pendant past the end of its cord. If the top of the
    // ring is further from the hang point than the cord is long, bring the pendant back in and
    // take away the part of its speed that points outward.
    const r = h.body.rotation(), at = h.anchor.translation()
    _we.set(0, h.R, 0).applyQuaternion(_wq.set(r.x, r.y, r.z, r.w))
    const ex = t.x + _we.x - at.x, ey = t.y + _we.y - at.y, ez = t.z + _we.z - at.z, el = Math.hypot(ex, ey, ez)
    if (el > h.L * 1.015) {
      const k = (el - h.L) / el
      h.body.setTranslation({ x: t.x - ex * k, y: t.y - ey * k, z: t.z - ez * k }, true)
      const out = (lv.x * ex + lv.y * ey + lv.z * ez) / el
      if (out > 0) { h.body.setLinvel({ x: lv.x - ex / el * out, y: lv.y - ey / el * out, z: lv.z - ez / el * out }, true); lv = h.body.linvel() }
    }
    const sp = Math.hypot(lv.x, lv.y, lv.z)
    // soft speed caps: paper on a string swings, it does not get launched
    // (a little more for the half second after a stretched cord is let go)
    const cap = now < h.boostUntil ? tune.snapSpeed : tune.maxSpeed
    if (sp > cap) { const k = cap / sp; h.body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true) }
    const av = h.body.angvel(), an = Math.hypot(av.x, av.y, av.z)
    let wx = av.x, wy = av.y, wz = av.z
    if (an > tune.maxSpin) { const k = tune.maxSpin / an; wx *= k; wy *= k; wz *= k }
    // The ring hangs on two strands, which resist twisting; the simulation hangs it from one
    // point, so nothing would ever turn it back. A weak spring about the vertical does: after a
    // rough ride the pendant comes to rest facing the visitor, never edge on.
    const yaw = Math.atan2(2 * (r.x * r.z + r.w * r.y), 1 - 2 * (r.x * r.x + r.y * r.y))
    wy += (-tune.yawSpring * yaw - tune.yawDamp * wy) * sdt
    // motion paused: bleed energy fast so it comes to rest within a second
    if (!active) { h.body.setLinvel({ x: lv.x * 0.9, y: lv.y * 0.9, z: lv.z * 0.9 }, true); wx *= 0.9; wy *= 0.9; wz *= 0.9 }
    h.body.setAngvel({ x: wx, y: wy, z: wz }, true)
    // a sudden change of speed while the cursor is close means the visitor touched it
    const before = speedBefore.get(h)
    if (before !== undefined && cursor.active) {
      const p = h.position()
      if (Math.abs(sp - before) > 0.25 && Math.hypot(p.x - cursor.x, p.y - cursor.y) < h.R + 0.8) noteInteraction()
    }
  }
  // and the cord itself: whole after every step, whoever is holding the pendant
  for (const h of hangers) {
    if (!h.enabled) continue
    if (grab.held === h) h.mend(grab.vel.x, grab.vel.y)
    else { const lv = h.body.linvel(); h.mend(lv.x, lv.y) }
  }
  for (const h of hangers) if (h.enabled) h.sync()
}

/* numbers for verification: every enabled cord, measured */
if (typeof window !== 'undefined') {
  window.__dbg = Object.assign(window.__dbg || {}, {
    cord: () => hangers.filter(h => h.enabled).map(h => ({ name: h.name, ...h.measure() })),
  })
}
