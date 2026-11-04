/* Rapier physics: pendants hanging on cords, a cursor that shoves them,
   grab-and-throw, scroll impulses. Every hanger is a kinematic anchor,
   a chain of rope segments and the pendant body (a thin cylinder). */
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
  maxSpeed: 9,             // a nudge should swing it, never launch it into orbit
  maxSpin: 10,
}

let cursorBody = null
let walls = null
let shadowTex = null
export const cursor = { x: 999, y: 999, active: false, over: false }
export const grab = { held: null, offset: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(), lastT: 0 }
export const stats = { interactions: 0, lastInteraction: 0 }

const Q_X90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))

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

    this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._q = new THREE.Quaternion()
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
  }

  setTarget(x, y) { this.target.x = x; this.target.y = y }

  /* world position of the pendant centre */
  position() { const t = this.body.translation(); return this._v.set(t.x, t.y, t.z) }

  sync() {
    const t = this.body.translation(), r = this.body.rotation()
    this.mesh.position.set(t.x, t.y, t.z)
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    this.mesh.updateMatrixWorld(true)
    for (let i = 0; i < this.ropeBodies.length; i++) {
      const m = this.cordMeshes[i]
      if (i >= this.beadIndex) { m.visible = false; continue }
      const b = this.ropeBodies[i], bt = b.translation(), bq = b.rotation()
      m.visible = true
      m.position.set(bt.x, bt.y, bt.z)
      m.quaternion.set(bq.x, bq.y, bq.z, bq.w)
      m.scale.set(1, this.segLen * 1.04, 1)
    }
    // bead at the bottom end of the last drawn segment
    const lb = this.ropeBodies[this.beadIndex - 1], lt = lb.translation(), lq = lb.rotation()
    this._q.set(lq.x, lq.y, lq.z, lq.w)
    this._a.set(0, -this.segLen / 2, 0).applyQuaternion(this._q).add(this._b.set(lt.x, lt.y, lt.z))
    this.bead.position.copy(this._a)
    // two strands from the bead to the top of the ring
    const pa = this._b.set(-this.R * 0.26, this.R * 0.985, 0); this.mesh.localToWorld(pa)
    placeBetween(this.strandA, this._a, pa)
    const pb = this._b.set(this.R * 0.26, this.R * 0.985, 0); this.mesh.localToWorld(pb)
    placeBetween(this.strandB, this._a, pb)
    // soft contact shadow, offset down-right, behind the object
    this.shadow.position.set(t.x + this.R * 0.32, t.y - this.R * 0.42, t.z - 0.75)
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
    if (grab.held) {
      const now = performance.now(), dt = Math.max(1, now - grab.lastT) / 1000
      grab.vel.lerp(new THREE.Vector3().subVectors(p, grab.prev).divideScalar(dt), 0.5)
      grab.prev.copy(p); grab.lastT = now
      const tgt = new THREE.Vector3().addVectors(p, grab.offset)
      grab.held.body.setNextKinematicTranslation({ x: tgt.x, y: tgt.y, z: 0 })
      return
    }
    const over = !!hitHanger()
    if (over !== cursor.over) { cursor.over = over; document.body.style.cursor = over ? 'grab' : '' }
  }, { passive: true })

  addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (e.target.closest('a, button, input, select, textarea, label, .bag')) return
    pointerToWorld(e)
    const h = hitHanger()
    if (!h) return
    e.preventDefault()
    grab.held = h
    h.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    const b = h.body.translation()
    grab.offset.set(b.x - pt.x, b.y - pt.y, 0)
    grab.prev.copy(pt); grab.vel.set(0, 0, 0); grab.lastT = performance.now()
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
    h.body.setLinvel({ x: v.x, y: v.y, z: 0 }, true)
    document.body.style.cursor = cursor.over ? 'grab' : ''
    lenis && lenis.start()
  }
  addEventListener('pointerup', release)
  addEventListener('pointercancel', release)
  addEventListener('blur', release)
  addEventListener('pointerleave', () => { cursor.active = false })
  document.addEventListener('mouseleave', () => { cursor.active = false })
}

/* ---------- step ---------- */
let breezeT = Math.random() * 10
let prevCursor = { x: 999, y: 999 }
export function step(dt, { vel = 0, active = true } = {}) {
  if (!world) return
  breezeT += dt
  // cursor body (parked far away when the pointer is off the page or on touch)
  if (cursor.active && !grab.held) cursorBody.setNextKinematicTranslation({ x: cursor.x, y: cursor.y, z: 0 })
  else cursorBody.setNextKinematicTranslation({ x: 999, y: 999, z: 0 })
  if (cursor.active && (Math.abs(cursor.x - prevCursor.x) > 0.3 || Math.abs(cursor.y - prevCursor.y) > 0.3)) {
    // a moving cursor near a pendant counts as play
    for (const h of hangers) if (h.enabled && h.position().distanceTo(new THREE.Vector3(cursor.x, cursor.y, 0)) < h.R + 0.6) { noteInteraction(); break }
  }
  prevCursor.x = cursor.x; prevCursor.y = cursor.y

  const v = Math.max(-90, Math.min(90, vel))
  const idle = performance.now() - stats.lastInteraction > 5000
  for (const h of hangers) {
    if (!h.enabled) continue
    h.anchor.setNextKinematicTranslation({ x: h.target.x, y: h.target.y, z: 0 })
    if (grab.held === h) continue
    const m = h.mass
    if (active && Math.abs(v) > 1.5) {
      // scrolling is driving: the pendant swings back as the car corners
      h.body.applyImpulse({ x: -v * tune.scrollImpulse * m * dt * 60 * 0.25, y: 0, z: v * tune.scrollZ * m * dt * 60 * 0.25 }, true)
    }
    if (active && (isCoarse || idle)) {
      const f = tune.breeze * m * dt
      h.body.applyImpulse({ x: Math.sin(breezeT * 0.9 + h.R) * f, y: 0, z: Math.cos(breezeT * 0.55) * f * 0.5 }, true)
    }
  }
  world.timestep = Math.min(Math.max(dt, 1 / 120), 1 / 30)
  world.step()
  // soft speed caps: paper on a string swings, it does not get launched
  for (const h of hangers) {
    if (!h.enabled || grab.held === h) continue
    const lv = h.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z)
    if (sp > tune.maxSpeed) { const k = tune.maxSpeed / sp; h.body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true) }
    const av = h.body.angvel(), an = Math.hypot(av.x, av.y, av.z)
    if (an > tune.maxSpin) { const k = tune.maxSpin / an; h.body.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true) }
  }
  for (const h of hangers) if (h.enabled) h.sync()
}
