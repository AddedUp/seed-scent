/* Renderer, camera, lights, procedural textures and the pendant mesh.
   World units: the viewport is always 10 units tall at z = 0. */
import * as THREE from 'three'

export const WORLD_H = 10
export const canvas = document.getElementById('gl')
/* no WebGL (old booth laptop, locked-down browser): the page still works, just without the pendant */
export let renderer = null
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.localClippingEnabled = true
} catch (err) {
  console.warn('[seed scent] WebGL is not available, running without the 3D pendant', err)
  document.body.classList.add('no-webgl')
}

export const scene = new THREE.Scene()
export const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
export const view = { w: innerWidth, h: innerHeight, wpp: WORLD_H / innerHeight, halfW: 0 }

/* the whole scene leans a little with the pointer (parallax); never the objects themselves */
export const rig = new THREE.Group()
scene.add(rig)

export function resize() {
  view.w = innerWidth; view.h = innerHeight
  view.wpp = WORLD_H / view.h
  if (renderer) renderer.setSize(view.w, view.h, false)
  camera.aspect = view.w / view.h
  camera.position.z = (WORLD_H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.updateProjectionMatrix()
  view.halfW = (WORLD_H / 2) * camera.aspect
}
resize()
addEventListener('resize', resize)

/* screen px -> world (z = 0 plane) */
export function toWorldX(px) { return (px - view.w / 2) * view.wpp }
export function toWorldY(py) { return (view.h / 2 - py) * view.wpp }
export function rectAnchor(el) {
  const r = el.getBoundingClientRect()
  return { x: toWorldX(r.left), y: toWorldY(r.top), visible: r.top > -view.h * 2 && r.top < view.h * 3 }
}
const _p = new THREE.Vector3()
/* world -> screen px */
export function project(v3) {
  _p.copy(v3).project(camera)
  return { x: (_p.x * 0.5 + 0.5) * view.w, y: (-_p.y * 0.5 + 0.5) * view.h, z: _p.z }
}

/* ---------- lights: one warm key, soft fill ---------- */
const hemi = new THREE.HemisphereLight(0xfff6e2, 0xa8c88f, 0.85)
scene.add(hemi)
const key = new THREE.DirectionalLight(0xfff2d8, 1.35)
key.position.set(-5, 7, 9)
scene.add(key)
const fill = new THREE.DirectionalLight(0xdfe8cf, 0.35)
fill.position.set(6, -2, 6)
scene.add(fill)

/* ---------- procedural textures ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

/* walnut: layered grain lines with a slow wobble */
export function woodTexture() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), r = rnd(7)
  g.fillStyle = '#6a4324'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 160; i++) {
    const y0 = r() * S, amp = 6 + r() * 14, freq = 0.004 + r() * 0.01, phase = r() * 6.28
    const dark = r() < 0.5
    g.strokeStyle = dark ? `rgba(60,34,16,${0.12 + r() * 0.25})` : `rgba(150,100,55,${0.08 + r() * 0.2})`
    g.lineWidth = 0.6 + r() * 2.2
    g.beginPath()
    for (let x = 0; x <= S; x += 4) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * 0.05 + phase * 2) * 1.5
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.stroke()
  }
  // fine noise
  const img = g.getImageData(0, 0, S, S), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 18; d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.6 }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/* seed paper: cream sheet, fibre flecks, seeds, the brand mark printed in the middle */
export function paperTexture({ markImg, photo = null, faded = false, seed = 3 } = {}) {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), r = rnd(seed)
  g.fillStyle = faded ? '#f4eedb' : '#efe5cb'
  g.fillRect(0, 0, S, S)
  if (photo) {
    // a real macro of seed paper, cropped square from a random spot so the three discs differ
    const side = Math.min(photo.width, photo.height)
    const sx = Math.floor(r() * (photo.width - side)), sy = Math.floor(r() * (photo.height - side))
    g.drawImage(photo, sx, sy, side, side, 0, 0, S, S)
    if (faded) { g.fillStyle = 'rgba(248,243,226,0.55)'; g.fillRect(0, 0, S, S) }
  }
  // fibres
  for (let i = 0; i < (photo ? 120 : 900); i++) {
    const x = r() * S, y = r() * S, len = 6 + r() * 26, a = r() * Math.PI
    g.strokeStyle = r() < 0.5 ? `rgba(190,176,138,${0.25 + r() * 0.35})` : `rgba(140,150,110,${0.15 + r() * 0.3})`
    g.lineWidth = 0.8 + r() * 1.4
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke()
  }
  // seeds
  for (let i = 0; i < (photo ? 24 : 110); i++) {
    const x = r() * S, y = r() * S, w = 5 + r() * 7, h = 3 + r() * 4, a = r() * Math.PI
    g.save(); g.translate(x, y); g.rotate(a)
    g.fillStyle = r() < 0.6 ? `rgba(80,62,40,${0.55 + r() * 0.35})` : `rgba(130,118,80,${0.5 + r() * 0.4})`
    g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill()
    g.restore()
  }
  // soft paper noise
  const img = g.getImageData(0, 0, S, S), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8 }
  g.putImageData(img, 0, 0)
  // printed mark
  if (markImg) {
    const mw = S * 0.42, mh = mw * (markImg.height / markImg.width)
    g.globalAlpha = faded ? 0.32 : 0.92
    g.drawImage(markImg, (S - mw) / 2, (S - mh) / 2, mw, mh)
    g.globalAlpha = 1
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* soft round blob: used for the contact shadow and the scent wisps */
export function blobTexture(inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)') {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d')
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, inner); grad.addColorStop(0.55, inner.replace(/,1\)$/, ',0.55)')); grad.addColorStop(1, outer)
  g.fillStyle = grad; g.fillRect(0, 0, S, S)
  return new THREE.CanvasTexture(c)
}

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

/* ---------- the pendant: wooden ring + seed paper disc + bead ---------- */
export function pendantMesh({ R, wood, paper, paperFaded }) {
  const group = new THREE.Group()
  const Rin = R * 0.82, depth = R * 0.13

  const shape = new THREE.Shape(); shape.absarc(0, 0, R, 0, Math.PI * 2, false)
  const hole = new THREE.Path(); hole.absarc(0, 0, Rin, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const ringGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.22, bevelSize: depth * 0.22, bevelSegments: 3, curveSegments: 72 })
  ringGeo.translate(0, 0, -depth / 2)
  // planar UVs so the grain runs across the ring
  const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) / R) * 0.5 + 0.5, (pos.getY(i) / R) * 0.5 + 0.5)
  ringGeo.computeVertexNormals()
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.58, metalness: 0 })
  const ring = new THREE.Mesh(ringGeo, woodMat)
  group.add(ring)

  // the disc sits in the ring; caps carry the paper texture
  const discR = Rin * 0.985, discT = depth * 0.34
  const discGeo = new THREE.CylinderGeometry(discR, discR, discT, 72)
  discGeo.rotateX(Math.PI / 2)
  const paperSide = new THREE.MeshStandardMaterial({ color: 0xe6dcc0, roughness: 1 })
  const paperMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.95, metalness: 0 })
  const disc = new THREE.Mesh(discGeo, [paperSide, paperMat, paperMat])
  disc.name = 'disc'
  group.add(disc)

  let fade = null
  if (paperFaded) {
    const fadeMat = new THREE.MeshStandardMaterial({ map: paperFaded, roughness: 0.95, transparent: true, opacity: 0, depthWrite: false })
    const fadeGeo = new THREE.CylinderGeometry(discR, discR, discT * 1.04, 72); fadeGeo.rotateX(Math.PI / 2)
    fade = new THREE.Mesh(fadeGeo, [new THREE.MeshStandardMaterial({ visible: false }), fadeMat, fadeMat])
    fade.name = 'fade'
    disc.add(fade)
  }

  // a slot for where the cord meets the ring (local top)
  const top = new THREE.Object3D(); top.position.set(0, R, 0); top.name = 'top'
  group.add(top)
  return { group, ring, disc, fade, woodMat, paperMat }
}

/* a thin cylinder placed between two world points (cord strands) */
const _dir = new THREE.Vector3(), _mid = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0)
export function placeBetween(mesh, a, b) {
  _dir.subVectors(b, a)
  const len = _dir.length()
  if (len < 1e-5) { mesh.visible = false; return }
  mesh.visible = true
  _mid.addVectors(a, b).multiplyScalar(0.5)
  mesh.position.copy(_mid)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(_up, _dir.normalize())
}
