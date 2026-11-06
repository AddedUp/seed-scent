/* Seed Scent · the planting stage (paired with planting.css)

   The photo frame in "How to plant it" becomes a small hands-on stage that
   mirrors the four steps: tear a disc of seed paper, press the pieces into
   soil, water them, give them sun, and the first sprouts come up.

   Canvas 2D, no imports, no libraries, no requests of its own beyond the two
   images named in opts. Colors are read from the page's custom properties.

   The tear is free. A rip follows the hand across the paper a moment behind
   it and opens as it goes; where it comes out, the piece becomes two polygons
   that share one roughened edge, and the last fibres across the gap stretch
   and snap as it opens. Every piece carries its own cut of the same printed
   sheet, so the paper and the mark stay stuck to it. A tap takes a bit about
   the size of a coin from the rim. A small piece torn off while the hand is
   still down stays in the hand and goes where it goes, and lands where it is
   let go; anything else flutters down and lies flat on the bed, which is seen
   from a little above.

     initPlanting(figure, { steps, reduced, paperSrc, markSrc }) -> { destroy(), reset() }
*/

const VW = 400                          // the stage is always 400 units wide; its height follows the frame
const TAU = Math.PI * 2
const STAGES = ['tear', 'press', 'water', 'sun', 'done']

/* the words: one line of instruction on the stage, one action on the button */
const ACTION = { tear: 'Tear the paper', press: 'Press them in', water: 'Water it', sun: 'Give it sun', done: 'Plant another' }
const HINT = { tear: 'Drag across the paper to tear it', again: 'Keep tearing', press: 'Press the pieces into the soil', water: 'Hold to water', sun: 'Wait for the first sprouts', held: 'Raise the sun' }
const SHOWS = {
  tear: 'A disc of seed paper held above a bed of soil',
  press: 'Torn pieces of seed paper lying on the soil',
  water: 'The torn paper pressed into the soil',
  sun: 'The sun over damp soil with the torn paper pressed in',
  done: 'The first sprouts coming up through the torn paper',
}
const SAYS = {
  tear: 'A fresh disc of seed paper is ready to tear.',
  press: 'The paper is torn. Next, press the pieces into the soil.',
  water: 'The pieces are in the soil. Next, water them.',
  sun: 'The soil is damp. Now it needs sun.',
  done: 'The first sprouts are up.',
  photo: 'The photo of the planted pot is back.',
}

/* the tear */
const HOLD_ABOVE = 0.21                 // a piece bigger than this share of the disc stays in the hand (about a coin)
const COIN = 0.15                       // the share a tap takes off: a bit about the size of a coin
const MIN_PART = 0.055                  // no tear leaves a piece smaller than this share
const MIN_PIECES = 4
const MAX_PIECES = 10
const ROUGH = 2.8                       // spacing of the points along a torn edge, in units
const JAG = 1.5                         // how far each of those points strays from the path
const LAST = 0x3fff                     // the name of the last stretch of a rip, the one that reaches the far edge
const CHASE = 15                        // how hard the tip of a rip runs after the hand (per second)

/* the paper once it is loose */
const DT = 1 / 120
const WALL = 5
const FLAT = 0.5                        // the share of its height a piece keeps once it lies on the bed
const TILT = Math.acos(FLAT)
const CAM = 0.2                         // share of the frame the view comes down by once paper is on the bed
const SINK = 2.4                        // how far a pressed piece goes down, in units
const M = 7                             // margin around a piece in its sprite, for the fibres

/* water and sun */
const NEED = 56                         // droplets that make the soil damp
const WET_COLS = 64                     // the damp patches: a coarse grid over the bed, drawn smooth
const WET_ROWS = 20
const SUN_ARC = 3.3                     // seconds for the sun to cross
const GROW_AT = 1.1                     // the sprouts start this long after sunrise
const GROW_FOR = 2.6
const BEAT = 4                          // the visitor's own sprouts stand this long before the photo returns

/* the button and the idle stage */
const LOCK = 350                        // ms after a stage change in which the button rests (a second press is taken for a slip)
const LOCK_DONE = 700                   // the same, once the sprouts are up, so a run of presses does not skip past them
const IDLE = 8                          // seconds without a pointer before paper in the hand stops swaying
const BRIDGE = 2                        // every second point of a running rip has a fibre bridge across the gap

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = t => 1 - Math.pow(1 - t, 3)
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function mulberry(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function parseColor(s) {
  if (!s) return null
  s = String(s).trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [...m[1]].map(h => parseInt(h + h, 16))
  m = /^#([0-9a-f]{6})/i.exec(s)
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s)
  if (m) return [+m[1], +m[2], +m[3]]
  return null
}
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(lerp(a[i], b[i], t)))

function polyArea(xs, ys) {
  let s = 0
  for (let i = 0, n = xs.length; i < n; i++) { const j = i + 1 === n ? 0 : i + 1; s += xs[i] * ys[j] - xs[j] * ys[i] }
  return s / 2
}
function insidePoly(px, py, xs, ys) {
  let inside = false
  for (let i = 0, n = xs.length, j = n - 1; i < n; j = i++) {
    if ((ys[i] > py) !== (ys[j] > py) && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside
  }
  return inside
}
/* where the stretch a to b crosses the stretch c to d: how far along a to b (0..1), or -1 */
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-9) return -1
  const qx = cx - ax, qy = cy - ay
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? t : -1
}
/* a point of a piece, measured from its centre, as the piece hangs or lies:
   turned in its own plane by a, then tipped about the line at angle b until only sq of its height is left */
function place(pose, dx, dy) {
  const c1 = Math.cos(pose.a - pose.b), s1 = Math.sin(pose.a - pose.b)
  const x = c1 * dx - s1 * dy, y = (s1 * dx + c1 * dy) * pose.sq
  const c2 = Math.cos(pose.b), s2 = Math.sin(pose.b)
  return [c2 * x - s2 * y, s2 * x + c2 * y]
}

export function initPlanting(figure, opts = {}) {
  const NOOP = { destroy() {}, reset() {} }
  if (!figure || figure.nodeType !== 1) return NOOP
  if (figure.__planting) return figure.__planting
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext ? canvas.getContext('2d') : null
  if (!ctx) return NOOP                 // no canvas: the photo stays as it is

  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  let reduced = !!opts.reduced || !!(mq && mq.matches)
  const rand = mulberry(opts.seed != null ? Number(opts.seed) >>> 0 : ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0))

  /* ==========================================================================
     The frame: the photo stays in the flow, the stage sits over it
     ========================================================================== */
  const photoImg = figure.querySelector('img')
  const cap = figure.querySelector('figcaption')
  const make = (tag, cls) => { const el = document.createElement(tag); el.className = cls; return el }

  const stage = make('div', 'plant-stage')
  stage.setAttribute('role', 'img')
  canvas.className = 'plant-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  stage.appendChild(canvas)

  /* the one line of instruction is for the hand; the button and the live line carry the same story for everyone else */
  const hint = make('p', 'kicker plant-hint')
  hint.setAttribute('aria-hidden', 'true')

  const btn = make('button', 'pill small plant-btn')
  btn.type = 'button'

  const live = make('p', 'plant-live')
  live.setAttribute('aria-live', 'polite')

  figure.insertBefore(stage, cap)
  figure.insertBefore(hint, cap)
  figure.insertBefore(btn, cap)
  figure.insertBefore(live, cap)
  figure.classList.add('plant-fig')
  figure.classList.toggle('is-reduced', reduced)
  const photoHidden = photoImg ? photoImg.getAttribute('aria-hidden') : null
  if (photoImg) photoImg.setAttribute('aria-hidden', 'true')

  const steps = Array.isArray(opts.steps) && opts.steps.length === 4 && opts.steps.every(li => li && li.nodeType === 1) ? opts.steps.slice() : null
  if (steps) steps.forEach(li => li.classList.add('plant-step'))

  /* everything that has to be undone */
  const offs = []
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); offs.push(() => target.removeEventListener(type, fn, o)) }
  const timers = new Set()
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn() }, ms); timers.add(id); return id }
  const drop = id => { clearTimeout(id); timers.delete(id) }

  /* ==========================================================================
     State
     ========================================================================== */
  let dead = false, inView = false, seen = false, raf = 0, inFrame = false, last = 0, clock = 0, acc = 0, cost = 0, frames = 0
  let W = 0, H = 0, k = 1, dpr = 1, S = 1, VH = 300     // S: canvas pixels per unit
  let pal = null
  let stageName = 'tear', stageAt = 0, lockFor = 0, peeking = -1
  let snappedTotal = 0
  let pieces = [], discArea = 1, discR = 60, discSeed = 1, cutCount = 0, laid = 0, lastCut = null
  let cam = 0, camTo = 0, camMax = 0                    // the view comes down to the bed once paper is on it
  let water = 0, fell = 0, growth = 0, sunT = 0, sunWait = false, sunFast = false, doneT = 0, beatOver = false, photo = false
  let wetMoving = false, pendingWater = false, wateredBy = 'hand'
  let intro = 1                                         // 0..1, the disc arriving
  let idle = 0, swayK = 1                               // paper in the hand sways until nobody has been near for a while
  let tight = false, stacked = false, capLow = 0     // capLow: the bottom of the caption when it sits in the top corner, in units
  let hintBox = null                                   // where the line of instruction sits, in units
  let rowTop = 0                                        // the top of the row with the button and the caption, in units
  let pour = null                                       // { x, y, n, auto, t }
  let sprouts = [], drops = [], bits = []
  const rips = new Map()                                // piece -> the rip running through it
  const wet = new Float32Array(WET_COLS * WET_ROWS), wetTmp = new Float32Array(WET_COLS * WET_ROWS)
  const wetLayer = { c: document.createElement('canvas'), mask: document.createElement('canvas'), stale: true }      // the damp soil, masked to where the water has reached
  const soil = { top: 0, topPx: 0, dry: document.createElement('canvas'), wet: document.createElement('canvas') }
  const sheet = document.createElement('canvas')        // the printed face of the disc
  const blurA = document.createElement('canvas'), blurB = document.createElement('canvas')
  const over = { c: null, mask: null, cam: -1, stale: true }      // sprout lines in the light tone, kept to where the ground is dark
  const art = { paper: null, mark: null, waiting: 0 }

  function readPalette() {
    const cs = getComputedStyle(stage)
    const get = (name, fallback) => parseColor(cs.getPropertyValue(name)) || parseColor(fallback)
    pal = {
      paper: get('--paper', '#fbf6e5'), paper2: get('--paper-2', '#f3ebd3'), paper3: get('--paper-3', '#e9dfc0'),
      ink: get('--ink', '#203419'), ink2: get('--ink-2', '#172610'),
      moss: get('--moss', '#587541'),
      sage: get('--sage', '#a8c88f'), sage3: get('--sage-3', '#8fb376'),
      jute: get('--plant-jute', '#b59a6b'),
    }
  }

  /* ==========================================================================
     Soil: a low mound across the bottom third. Its top edge is the far side of
     a bed that comes toward the viewer, so paper can lie on it.
     ========================================================================== */
  const soilLut = new Float32Array(VW + 2)
  function soilAt(x) {
    const u = clamp(x / VW, 0, 1)
    return VH - VH * (0.262 + 0.072 * (0.5 - 0.5 * Math.cos(u * TAU)))
      + 2.0 * Math.sin(x * 0.057 + 1.3) + 1.2 * Math.sin(x * 0.108 + 4.1) + 0.6 * Math.sin(x * 0.203 + 0.4)
  }
  function soilY(x) {
    if (x <= 0) return soilLut[0]
    if (x >= VW) return soilLut[VW]
    const i = x | 0
    return soilLut[i] + (soilLut[i + 1] - soilLut[i]) * (x - i)
  }
  const soilSlope = x => (soilY(x + 0.75) - soilY(x - 0.75)) / 1.5
  /* the lowest line paper may reach on the bed: clear of the row with the button and the caption */
  const bandLow = () => rowTop + Math.min(camMax, camCap()) - 4
  const headroom = () => (hintBox ? hintBox.y1 : 0) + 10 / k
  /* how far a piece reaches above and below its centre, and to either side, as it hangs */
  function hang(p) {
    if (p.topAt === p.ha0) return
    let up = 0, down = 0, side = 0
    const c = Math.cos(p.ha0), s = Math.sin(p.ha0)
    for (let i = 0; i < p.hx.length; i++) {
      const y = s * p.hx[i] + c * p.hy[i], x = c * p.hx[i] - s * p.hy[i]
      if (-y > up) up = -y; if (y > down) down = y; if (Math.abs(x) > side) side = Math.abs(x)
    }
    p.top = up + 3; p.bot = down + 3; p.half = side; p.topAt = p.ha0
  }
  /* where paper still in the hand hangs. As the view comes down to the bed the hand lifts it by as
     much, as far as the room under the words allows */
  function heldY(p) {
    hang(p)
    const room = Math.max(0, p.hy0 - p.top - headroom())
    return p.hy0 + cam - Math.min(cam, room)
  }
  /* and the view comes down only as far as keeps the bed clear of that paper; once the hand is empty it goes all the way */
  function camCap() {
    if (stageName !== 'tear') return camMax
    let cap = camMax
    for (const p of pieces) {
      if (!p.held) continue
      hang(p)
      const room = Math.max(0, p.hy0 - p.top - headroom())
      let ridge = Infinity
      for (let i = -2; i <= 2; i++) ridge = Math.min(ridge, soilY(p.hx0 + (i / 2) * p.half))
      cap = Math.min(cap, room + Math.max(0, ridge - 6 - p.hy0 - p.bot))
    }
    return Math.max(0, cap)
  }

  function buildSoil() {
    camMax = Math.round(VH * CAM)
    for (let i = 0; i <= VW + 1; i++) soilLut[i] = soilAt(i)
    let minY = Infinity
    for (let i = 0; i <= VW; i++) minY = Math.min(minY, soilLut[i])
    soil.top = Math.floor(minY - 9)
    soil.topPx = Math.round(soil.top * S)
    const floor = VH + camMax + 4
    const path = new Path2D()
    path.moveTo(-4, floor)
    path.lineTo(-4, soilY(0))
    for (let x = 0; x <= VW; x += 2) path.lineTo(x, soilY(x))
    path.lineTo(VW + 4, soilY(VW))
    path.lineTo(VW + 4, floor)
    path.closePath()
    for (const damp of [false, true]) {
      const c = damp ? soil.wet : soil.dry
      c.width = canvas.width
      c.height = Math.max(1, canvas.height - soil.topPx + Math.ceil((camMax + 2) * S))
      const g = c.getContext('2d')
      g.setTransform(S, 0, 0, S, 0, -soil.topPx)
      paintSoil(g, path, floor, damp)
    }
    over.stale = true
    wetLayer.stale = true
  }

  /* dry and damp are the same soil: same crumbs, same grain, a darker, quieter tone with glints when wet */
  function paintSoil(g, path, floor, damp) {
    const r = mulberry(7411)
    const top = damp ? mix(pal.ink, pal.ink2, 0.92) : pal.ink
    const grad = g.createLinearGradient(0, soil.top + 9, 0, floor)
    grad.addColorStop(0, css(top))
    grad.addColorStop(1, css(damp ? mix(pal.ink2, [0, 0, 0], 0.12) : pal.ink2))
    g.fillStyle = grad
    g.fill(path)
    /* crumbs on and just above the line make the edge irregular and soft */
    g.fillStyle = css(top)
    for (let x = -2; x < VW + 2; x += 1.0 + r() * 2.1) {
      const rad = 0.7 + r() * r() * 2.5
      g.beginPath(); g.arc(x, soilY(x) + rad * 0.25 - r() * 1.5, rad, 0, TAU); g.fill()
    }
    for (let i = 0; i < 46; i++) {
      const x = r() * VW, rad = 0.35 + r() * 0.7
      g.globalAlpha = 0.35 + r() * 0.5
      g.beginPath(); g.arc(x, soilY(x) - 1.6 - r() * 3.6, rad, 0, TAU); g.fill()
    }
    g.globalAlpha = 1
    /* grain: lighter flecks and darker specks, finer toward the far edge of the bed */
    for (let i = 0; i < 700; i++) {
      const x = r() * VW, sy = soilY(x)
      const t = Math.pow(r(), 1.5), y = sy + 1.5 + t * (floor - sy)
      const rad = (0.3 + r() * 0.8) * (0.75 + t * 1.1), pick = r(), a = r()
      if (pick < 0.44) g.fillStyle = rgba(pal.moss, damp ? 0.08 + a * 0.08 : 0.16 + a * 0.3)
      else if (pick < 0.78) g.fillStyle = rgba(pal.ink2, 0.5 + a * 0.4)
      else if (pick < 0.93) g.fillStyle = rgba(pal.jute, damp ? 0.05 + a * 0.05 : 0.1 + a * 0.16)
      else g.fillStyle = rgba(pal.paper, damp ? 0.03 : 0.05 + a * 0.08)
      g.beginPath(); g.ellipse(x, y, rad, rad * 0.66, 0, 0, TAU); g.fill()
    }
    /* a few clods on the bed, each with a little light on top */
    for (let i = 0; i < 22; i++) {
      const x = 6 + r() * (VW - 12), sy = soilY(x)
      const y = sy + 5 + r() * (floor - sy - 10), rad = 1.2 + r() * 1.9
      g.fillStyle = rgba(pal.ink2, 0.7)
      g.beginPath(); g.ellipse(x, y, rad, rad * 0.56, 0, 0, TAU); g.fill()
      g.fillStyle = rgba(pal.moss, damp ? 0.08 : 0.15)
      g.beginPath(); g.ellipse(x - rad * 0.1, y - rad * 0.24, rad * 0.8, rad * 0.26, 0, 0, TAU); g.fill()
    }
    if (damp) {
      /* glints where the water sits */
      for (let i = 0; i < 110; i++) {
        const x = r() * VW, sy = soilY(x)
        g.fillStyle = rgba(pal.sage, 0.2 + r() * 0.34)
        g.beginPath(); g.ellipse(x, sy + 1.5 + Math.pow(r(), 1.3) * (floor - sy) * 0.8, 0.4 + r() * 0.7, 0.25 + r() * 0.2, 0, 0, TAU); g.fill()
      }
    }
  }

  /* ==========================================================================
     The printed sheet every piece is cut from
     ========================================================================== */
  function bakeSheet() {
    const size = Math.max(8, Math.ceil(discR * 2 * S) + 2)
    sheet.width = sheet.height = size
    const g = sheet.getContext('2d')
    const r = mulberry(discSeed)
    const ox = r(), oy = r()
    if (art.paper) {
      const im = art.paper, side = Math.min(im.naturalWidth, im.naturalHeight) * 0.86
      g.drawImage(im, ox * (im.naturalWidth - side), oy * (im.naturalHeight - side), side, side, 0, 0, size, size)
    } else {
      /* no photo yet (or it failed): a deeper cream than the sky, with fibre and seed flecks in palette tones */
      const u = size / 100
      g.fillStyle = css(mix(pal.paper3, pal.jute, 0.1))
      g.fillRect(0, 0, size, size)
      for (let i = 0; i < 170; i++) {
        const x = r() * size, y = r() * size, a = r() * TAU, len = (1.5 + r() * 5) * u
        g.strokeStyle = r() < 0.6 ? rgba(pal.paper, 0.75) : rgba(pal.jute, 0.3)
        g.lineWidth = (0.25 + r() * 0.35) * u
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke()
      }
      for (let i = 0; i < 34; i++) {
        g.fillStyle = r() < 0.5 ? rgba(pal.ink, 0.5) : rgba(pal.jute, 0.8)
        g.beginPath(); g.ellipse(r() * size, r() * size, (0.7 + r() * 0.8) * u, (0.4 + r() * 0.3) * u, r() * TAU, 0, TAU); g.fill()
      }
    }
    if (art.mark) {
      /* printed the way the pendant shows it: centred, a little under half the width */
      const im = art.mark, mw = size * 0.46, mh = mw * (im.naturalHeight / im.naturalWidth)
      g.globalAlpha = 0.9
      g.globalCompositeOperation = 'multiply'
      g.drawImage(im, (size - mw) / 2, (size - mh) / 2, mw, mh)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
    }
  }

  /* each image is printed as it lands (the mark does not wait for the paper), with a short cross-fade */
  function reprint(fade) {
    if (!W) return
    bakeSheet()
    for (const p of pieces) {
      if (fade && !reduced && p.sprite) { p.prev = p.sprite; p.sprite = null; p.fade = 0; p.fadeOut = false }
      bakePiece(p)
    }
    for (const r of rips.values()) r.stale = true
    over.stale = true
  }
  function loadArt(src, key) {
    if (!src) return
    art.waiting++
    const im = new Image()
    const settle = ok => {
      if (dead) return
      art.waiting--
      if (ok) { art[key] = im; reprint(seen) }
      if (art.waiting === 0) stage.dataset.ready = '1'
      wake()
    }
    im.onload = () => settle(true)
    im.onerror = () => settle(false)
    im.src = src
  }

  /* ==========================================================================
     Pieces: a polygon in sheet units, a pose in stage units
     ========================================================================== */
  function makePiece(xs, ys, ty, fs) {
    const n = xs.length
    let a2 = 0, cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1, cr = xs[i] * ys[j] - xs[j] * ys[i]
      a2 += cr; cx += (xs[i] + xs[j]) * cr; cy += (ys[i] + ys[j]) * cr
    }
    const sgn = a2 < 0 ? -1 : 1
    cx /= 3 * a2; cy /= 3 * a2
    let sxx = 0, syy = 0, sxy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1
      const ax = xs[i] - cx, ay = ys[i] - cy, bx = xs[j] - cx, by = ys[j] - cy, cr = ax * by - bx * ay
      sxx += (ax * ax + ax * bx + bx * bx) * cr
      syy += (ay * ay + ay * by + by * by) * cr
      sxy += (ax * by + 2 * ax * ay + 2 * bx * by + bx * ay) * cr
      if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]
    }
    sxx = (sxx / 12) * sgn; syy = (syy / 12) * sgn; sxy = (sxy / 24) * sgn
    const area = Math.abs(a2) / 2
    /* its outline for measuring: the convex hull, relative to the centre */
    const pts = xs.map((x, i) => [x - cx, ys[i] - cy]).sort((p, q) => p[0] - q[0] || p[1] - q[1])
    const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    const lo = [], up = []
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p) }
    lo.pop(); up.pop()
    let hull = lo.concat(up)
    if (hull.length > 44) { const every = Math.ceil(hull.length / 44); hull = hull.filter((_, i) => i % every === 0) }
    let rad = 0
    for (const h of hull) rad = Math.max(rad, Math.hypot(h[0], h[1]))
    return {
      xs, ys, ty, fs, sgn, area, share: area / discArea, cx, cy, x0, y0, x1, y1,
      axis: 0.5 * Math.atan2(2 * sxy, sxx - syy),                  // the way its long side runs
      hx: hull.map(h => h[0]), hy: hull.map(h => h[1]), rad,
      x: 0, y: 0, a: 0, b: 0, sq: 1, vx: 0, vy: 0, w: 0,
      held: false, hx0: 0, hy0: 0, ha0: 0, top: 0, bot: 0, half: 0, topAt: NaN, tugx: 0, tugy: 0, phase: rand() * TAU, whole: false,
      loose: false, settling: false, asleep: false, hold: 0, ft: 0, st: 0, prog: 0, h0: 1, rockA: 0, rockW: 0, rockP: 0, from: null,
      lx: 0, ly: 0, ld: 0, la: 0, lb: 0, hw: 0, hh: 0, order: 0,
      press: 0, pressing: false, pt: 0, want: false, wantT: 0, wantAt: 0,
      carried: false, gx: 0, gy: 0, ga: 0,
      seed: (rand() * 0xffffffff) >>> 0,
      sprite: null, prev: null, fade: 1, fadeOut: false, fringe: 1, shadow: null, damp: null, bury: null,
      sx: 0, sy: 0, sw: 0, sh: 0, shx: 0, shy: 0, shw: 0, shh: 0, bx: 0, by: 0, bw: 0, bh: 0,
    }
  }
  function toLocal(p, wx, wy) {
    const dx = wx - p.x, dy = wy - p.y
    const c2 = Math.cos(p.b), s2 = Math.sin(p.b)
    const x = c2 * dx + s2 * dy, y = (-s2 * dx + c2 * dy) / p.sq
    const c1 = Math.cos(p.a - p.b), s1 = Math.sin(p.a - p.b)
    return [c1 * x + s1 * y + p.cx, -s1 * x + c1 * y + p.cy]
  }
  function toWorld(p, lx, ly) {
    const q = place(p, lx - p.cx, ly - p.cy)
    return [p.x + q[0], p.y + q[1]]
  }
  /* half the width and half the height a piece takes up in a given pose */
  function extents(p, a, b, sq) {
    const pose = { a, b, sq }
    let hw = 0, hh = 0
    for (let i = 0; i < p.hx.length; i++) {
      const q = place(pose, p.hx[i], p.hy[i])
      if (Math.abs(q[0]) > hw) hw = Math.abs(q[0])
      if (Math.abs(q[1]) > hh) hh = Math.abs(q[1])
    }
    return { hw, hh }
  }

  /* one path through every stretch of edges that pick() accepts */
  function edgePath(g, xs, ys, pick) {
    const n = xs.length
    g.beginPath()
    let start = 0
    while (start < n && pick((start + n - 1) % n) && pick(start)) start++
    let open = false
    for (let s = 0; s < n; s++) {
      const i = (start + s) % n, j = (i + 1) % n
      if (pick(i)) { if (!open) { g.moveTo(xs[i], ys[i]); open = true } g.lineTo(xs[j], ys[j]) } else open = false
    }
  }
  /* the face of a piece, cut from the sheet, with its edges dressed: the die-cut rim a touch darker,
     a torn edge lighter and fibrous. One side of every rip keeps the wider bevel, as torn paper does.
     g is already set so that sheet units land on the sprite. `fringe` is how much of the loose fibre
     past a torn edge shows: all of it in the hand and in the air, less once the piece lies on the
     soil (there it would read as frost), and hardly any once it is pressed in. */
  function paintPaper(g, o, fringe = 1) {
    const xs = o.xs, ys = o.ys, ty = o.ty, fs = o.fs, n = xs.length
    g.lineJoin = 'round'; g.lineCap = 'round'
    g.save()
    g.beginPath()
    g.moveTo(xs[0], ys[0])
    for (let i = 1; i < n; i++) g.lineTo(xs[i], ys[i])
    g.closePath()
    g.clip()
    g.drawImage(sheet, -discR, -discR, discR * 2, discR * 2)
    edgePath(g, xs, ys, i => ty[i] === 0)
    g.strokeStyle = rgba(pal.ink, 0.13); g.lineWidth = 1.7; g.stroke()
    /* the lighter inside of the sheet shows along a torn edge and feathers into the face: many thin
       steps of a little each, so the band fades smoothly (a few big steps read as stripes on the mark) */
    for (const wide of [1, 0]) {
      edgePath(g, xs, ys, i => ty[i] === 1 && (fs[i] & 1) === wide)
      const outer = wide ? 13 : 7, inner = wide ? 3 : 2.3, steps = wide ? 12 : 7
      for (let i = 0; i < steps; i++) {
        const f = i / (steps - 1)
        g.strokeStyle = rgba(pal.paper, 0.045 + 0.05 * f); g.lineWidth = lerp(outer, inner, f); g.stroke()
      }
      g.strokeStyle = rgba(pal.paper, 0.9); g.lineWidth = wide ? 2.8 : 2.2; g.stroke()
    }
    /* the bevel is ragged: short strands of the lighter inside reach into the face, in clumps,
       the way the pulp gives (strands, not dabs: dabs read as a row of scallops) */
    for (let i = 0; i < n; i++) {
      if (ty[i] !== 1) continue
      const wide = fs[i] & 1, r = mulberry((fs[i] ^ 0x5bd1e995) >>> 0)
      if (r() > (wide ? 0.7 : 0.35)) continue
      const j = (i + 1) % n, ex = xs[j] - xs[i], ey = ys[j] - ys[i], len = Math.hypot(ex, ey)
      if (len < 0.05) continue
      const nx = (ey / len) * o.sgn, ny = (-ex / len) * o.sgn
      for (let s = 0, m = 1 + ((r() * (wide ? 3 : 2)) | 0); s < m; s++) {
        const t = r(), deep = 1 + r() * (wide ? 4.6 : 2.2), ang = Math.atan2(-ny, -nx) + (r() - 0.5) * 1.5
        const x0 = xs[i] + ex * t - nx * 0.8, y0 = ys[i] + ey * t - ny * 0.8
        g.strokeStyle = rgba(pal.paper, 0.32 + r() * 0.36); g.lineWidth = 0.35 + r() * 0.55
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(ang) * deep, y0 + Math.sin(ang) * deep); g.stroke()
      }
    }
    g.restore()
    if (fringe <= 0) return
    /* fibres past a torn edge. They are seeded by the edge itself, so they are the same hairs
       while the rip is still running and after the piece has come away. */
    for (let i = 0; i < n; i++) {
      if (ty[i] !== 1) continue
      const j = (i + 1) % n, ex = xs[j] - xs[i], ey = ys[j] - ys[i], len = Math.hypot(ex, ey)
      if (len < 0.05) continue
      const wide = fs[i] & 1, r = mulberry(fs[i])
      const nx = (ey / len) * o.sgn, ny = (-ex / len) * o.sgn
      const count = Math.round(len * (wide ? 0.78 : 0.5) + r() * 0.8)
      for (let f = 0; f < count; f++) {
        const t = r(), bx = xs[i] + ex * t - nx * 0.6, by = ys[i] + ey * t - ny * 0.6
        const ang = Math.atan2(ny, nx) + (r() - 0.5) * 1.9
        const fl = (1.3 + r() * r() * 5.2) * (wide ? 1.15 : 0.85) * (0.35 + 0.65 * fringe), bend = (r() - 0.5) * fl * 0.7
        const tx = bx + Math.cos(ang) * fl, tyy = by + Math.sin(ang) * fl
        const light = r() < 0.78, a = light ? 0.6 + r() * 0.4 : 0.9, w = 0.32 + r() * 0.5
        if (r() > fringe) continue                      // on the bed most of the loose hairs are flattened into the soil
        g.strokeStyle = light ? rgba(pal.paper, a * (0.4 + 0.6 * fringe)) : rgba(pal.paper3, a * (0.5 + 0.5 * fringe))
        g.lineWidth = w
        g.beginPath()
        g.moveTo(bx, by)
        g.quadraticCurveTo((bx + tx) / 2 - Math.sin(ang) * bend, (by + tyy) / 2 + Math.cos(ang) * bend, tx, tyy)
        g.stroke()
      }
    }
  }
  function bakePiece(p) {
    if (!W) return
    const c = p.sprite || (p.sprite = document.createElement('canvas'))
    c.width = Math.max(1, Math.ceil((p.x1 - p.x0 + 2 * M) * S))
    c.height = Math.max(1, Math.ceil((p.y1 - p.y0 + 2 * M) * S))
    const g = c.getContext('2d')
    g.setTransform(S, 0, 0, S, (M - p.x0) * S, (M - p.y0) * S)
    paintPaper(g, p, p.fringe)
    p.sx = p.x0 - M - p.cx; p.sy = p.y0 - M - p.cy; p.sw = c.width / S; p.sh = c.height / S
    bakeShadow(p)
    p.damp = null
    if (p.pressing || p.press > 0) bakeBury(p)
  }
  /* the loose fibre past its torn edges lies down: the face is painted again with less of it, and the
     old face fades out over the new one (the new one has less, so nothing pops in) */
  function setFringe(p, f) {
    if (p.fringe === f) return
    p.fringe = f
    if (!W || !p.sprite) return
    const old = p.sprite
    p.sprite = document.createElement('canvas')
    p.sprite.width = old.width; p.sprite.height = old.height
    const g = p.sprite.getContext('2d')
    g.setTransform(S, 0, 0, S, (M - p.x0) * S, (M - p.y0) * S)
    paintPaper(g, p, f)
    p.damp = null
    if (reduced || !seen) { p.prev = null; p.fade = 1 } else { p.prev = old; p.fade = 0; p.fadeOut = true }
  }
  /* a soft ink shadow in the shape of the piece: its silhouette, drawn small and blurred by hand */
  function bakeShadow(p) {
    const c = p.sprite, q = Math.max(1.5, S * 1.5), pad = 5
    const w = Math.ceil(c.width / q) + pad * 2, h = Math.ceil(c.height / q) + pad * 2
    blurA.width = w; blurA.height = h
    let g = blurA.getContext('2d')
    g.drawImage(c, pad, pad, c.width / q, c.height / q)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = css(mix(pal.ink2, [0, 0, 0], 0.45))    // a shade under the soil's own depth, so it shows on the bed too
    g.fillRect(0, 0, w, h)
    const soften = (from, to, step) => {
      to.width = w; to.height = h
      const t = to.getContext('2d')
      t.globalCompositeOperation = 'lighter'
      t.globalAlpha = 1 / 9
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t.drawImage(from, dx * step, dy * step)
    }
    soften(blurA, blurB, 1.1)
    const sc = p.shadow || (p.shadow = document.createElement('canvas'))
    soften(blurB, sc, 1.9)
    p.shx = p.sx - (pad * q) / S; p.shy = p.sy - (pad * q) / S; p.shw = (w * q) / S; p.shh = (h * q) / S
  }
  /* wet paper is a shade darker: the same shape in a damp tone, laid over the piece as the water reaches it */
  function bakeDamp(p) {
    const c = p.damp = document.createElement('canvas')
    c.width = p.sprite.width; c.height = p.sprite.height
    const g = c.getContext('2d')
    g.drawImage(p.sprite, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = css(mix(pal.ink, pal.moss, 0.45))
    g.fillRect(0, 0, c.width, c.height)
  }
  /* what pressing does to a piece: its rim dips under, soil closes over the edge in runs, a few crumbs land on the face */
  function bakeBury(p) {
    if (!W) return
    const n = p.xs.length, ox = new Array(n), oy = new Array(n)
    const pose = { a: p.la, b: p.lb, sq: FLAT * 0.95 }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < n; i++) {
      const q = place(pose, p.xs[i] - p.cx, p.ys[i] - p.cy)
      ox[i] = q[0]; oy[i] = q[1]
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]
    }
    const pad = 8
    const c = p.bury || (p.bury = document.createElement('canvas'))
    c.width = Math.max(1, Math.ceil((x1 - x0 + 2 * pad) * S))
    c.height = Math.max(1, Math.ceil((y1 - y0 + 2 * pad) * S))
    const g = c.getContext('2d')
    g.setTransform(S, 0, 0, S, (pad - x0) * S, (pad - y0) * S)
    const r = mulberry((p.seed ^ 0x9e3779b9) >>> 0)
    const sgn = polyArea(ox, oy) < 0 ? -1 : 1
    const path = new Path2D()
    path.moveTo(ox[0], oy[0])
    for (let i = 1; i < n; i++) path.lineTo(ox[i], oy[i])
    path.closePath()
    g.save()
    g.clip(path)
    g.lineJoin = 'round'
    g.strokeStyle = rgba(pal.ink, 0.1); g.lineWidth = 9; g.stroke(path)
    g.strokeStyle = rgba(pal.ink, 0.17); g.lineWidth = 4; g.stroke(path)
    g.restore()
    const tones = [pal.ink, pal.ink, pal.ink2, mix(pal.ink, pal.moss, 0.28)]
    const ph1 = r() * TAU, ph2 = r() * TAU
    let s = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = ox[j] - ox[i], ey = oy[j] - oy[i], len = Math.hypot(ex, ey)
      if (len < 1e-4) continue
      const nx = (ey / len) * sgn, ny = (-ex / len) * sgn
      for (let d = r() * 1.4; d < len; d += 0.9 + r() * 1.3) {
        const cover = Math.sin((s + d) * 0.15 + ph1) + 0.55 * Math.sin((s + d) * 0.43 + ph2)
        if (cover < -0.3 + (r() - 0.5) * 0.6) continue
        const inset = r() * r() * 5 - 1.5              // mostly on the edge, some well onto the paper, a few just off it
        const rad = 0.55 + r() * r() * 2
        g.fillStyle = css(tones[(r() * tones.length) | 0])
        g.beginPath(); g.ellipse(ox[i] + ex * (d / len) - nx * inset, oy[i] + ey * (d / len) - ny * inset * 0.8, rad, rad * 0.8, 0, 0, TAU); g.fill()
      }
      s += len
    }
    for (let i = 0, tries = 0; i < 9 && tries < 60; tries++) {
      const x = lerp(x0, x1, r()), y = lerp(y0, y1, r())
      if (!insidePoly(x, y, ox, oy)) continue
      i++
      g.fillStyle = css(tones[(r() * tones.length) | 0])
      g.beginPath(); g.ellipse(x, y, 0.45 + r() * 0.9, 0.35 + r() * 0.5, 0, 0, TAU); g.fill()
    }
    p.bx = x0 - pad; p.by = y0 - pad; p.bw = c.width / S; p.bh = c.height / S
  }

  /* where the whole disc is held: centred over the soil, twelve pixels or more clear of the words */
  function discHome() {
    const ridge = soilY(VW / 2)
    const R0 = Math.min(VH * 0.22, VW * 0.185)
    let top = 12 / k
    if (hintBox && hintBox.x1 > VW / 2 - R0 * 0.7) top = hintBox.y1 + 12 / k
    const low = ridge - 14
    const r = Math.max(16, Math.min(R0, (low - top) / 2))
    return { x: VW / 2, y: top + r + Math.max(0, low - top - 2 * r) * 0.42, r }
  }

  function newDisc(arrive) {
    const home = discHome()
    discR = home.r
    const n = 84, xs = [], ys = [], ty = [], fs = []
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU; xs.push(Math.cos(t) * discR); ys.push(Math.sin(t) * discR); ty.push(0); fs.push(0) }
    discArea = Math.abs(polyArea(xs, ys))
    const p = makePiece(xs, ys, ty, fs)
    p.whole = true; p.held = true
    p.x = p.hx0 = home.x; p.y = p.hy0 = home.y
    p.a = p.ha0 = (mulberry(discSeed)() - 0.5) * 0.09
    pieces = [p]
    rips.clear()
    bakeSheet()
    bakePiece(p)
    intro = arrive && !reduced ? 0 : 1
  }
  const isWhole = () => stageName === 'tear' && pieces.length === 1 && pieces[0].whole

  /* ==========================================================================
     The tear
     ========================================================================== */
  /* where the segment a to b crosses the outline of p, nearest first (sheet units) */
  function crossings(p, ax, ay, bx, by) {
    const out = [], xs = p.xs, ys = p.ys, n = xs.length
    const rx = bx - ax, ry = by - ay
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1
      const sx = xs[j] - xs[i], sy = ys[j] - ys[i]
      const den = rx * sy - ry * sx
      if (Math.abs(den) < 1e-9) continue
      const qx = xs[i] - ax, qy = ys[i] - ay
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den
      if (t > 1e-6 && t <= 1 && u >= 0 && u < 1) out.push({ t, u, i, x: ax + rx * t, y: ay + ry * t })
    }
    return out.sort((m, q) => m.t - q.t)
  }
  /* the stretch of a line through (lx, ly) that lies inside p: the one that holds the point, else the longest */
  function chord(p, lx, ly, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang), far = 4000
    const hits = crossings(p, lx - dx * far, ly - dy * far, lx + dx * far, ly + dy * far)
    let best = null
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const a = hits[i], b = hits[i + 1]
      if (a.t <= 0.5 && b.t >= 0.5) return [a, b]
      if (!best || b.t - a.t > best[1].t - best[0].t) best = [a, b]
    }
    return best
  }
  /* how deep a point is inside the paper: its distance from the nearest edge */
  function depthIn(p, x, y) {
    let best = Infinity
    for (let i = 0, n = p.xs.length; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1
      const ex = p.xs[j] - p.xs[i], ey = p.ys[j] - p.ys[i], l2 = ex * ex + ey * ey || 1
      const t = clamp(((x - p.xs[i]) * ex + (y - p.ys[i]) * ey) / l2, 0, 1)
      const d = Math.hypot(x - p.xs[i] - ex * t, y - p.ys[i] - ey * t)
      if (d < best) best = d
    }
    return best
  }

  /* the polygon work: walk the outline from the entry to the exit one way for one side, the other way
     for the other, and close both along the same points q (each [x, y, name]). Every stretch of the new
     edge remembers the rip it came from, its place along it and which side kept the bevel.
     Returns the two outlines, 'tangled' if the line crosses itself, or null if a side is under `min`. */
  function carve(p, E, X, q, seed, wideA, min) {
    const xs = p.xs, ys = p.ys, ty = p.ty, fs = p.fs, n = xs.length, m = q.length
    const ei = E.i, ej = X.i
    if (ei === ej && Math.abs(E.u - X.u) < 1e-6) return null
    const A = { xs: [], ys: [], ty: [], fs: [], sgn: p.sgn }, B = { xs: [], ys: [], ty: [], fs: [], sgn: p.sgn }
    const add = (o, x, y, t, f) => { o.xs.push(x); o.ys.push(y); o.ty.push(t); o.fs.push(f) }
    const tag = (id, wide) => (((Math.imul(seed ^ (id * 2246822519), 2654435761) >>> 0) & ~1) | (wide ? 1 : 0)) >>> 0
    let cb = (ej - ei + n) % n
    if (cb === 0 && E.u > X.u) cb = n
    add(B, E.x, E.y, ty[ei], fs[ei])
    for (let s = 1; s <= cb; s++) { const v = (ei + s) % n; add(B, xs[v], ys[v], s < cb ? ty[v] : ty[ej], s < cb ? fs[v] : fs[ej]) }
    add(B, X.x, X.y, 1, tag(LAST, !wideA))
    for (let i = m - 1; i >= 0; i--) add(B, q[i][0], q[i][1], 1, tag(q[i][2], !wideA))
    let ca = (ei - ej + n) % n
    if (ca === 0 && X.u > E.u) ca = n
    add(A, X.x, X.y, ty[ej], fs[ej])
    for (let s = 1; s <= ca; s++) { const v = (ej + s) % n; add(A, xs[v], ys[v], s < ca ? ty[v] : ty[ei], s < ca ? fs[v] : fs[ei]) }
    add(A, E.x, E.y, 1, tag(m ? q[0][2] : LAST, wideA))
    for (let i = 0; i < m; i++) add(A, q[i][0], q[i][1], 1, tag(i + 1 < m ? q[i + 1][2] : LAST, wideA))
    const sa = polyArea(A.xs, A.ys), sb = polyArea(B.xs, B.ys)
    if (sa * p.sgn <= 0 || sb * p.sgn <= 0 || Math.abs(Math.abs(sa) + Math.abs(sb) - p.area) > p.area * 0.04) return 'tangled'
    if (Math.min(Math.abs(sa), Math.abs(sb)) < min) return null
    return { A, B, sa: Math.abs(sa), sb: Math.abs(sb) }
  }
  function split(p, E, X, q, seed, wideA) {
    const res = carve(p, E, X, q, seed, wideA, MIN_PART * discArea)
    if (!res || res === 'tangled') return res
    return [makePiece(res.A.xs, res.A.ys, res.A.ty, res.A.fs), makePiece(res.B.xs, res.B.ys, res.B.ty, res.B.fs)]
  }
  /* the smaller side if the paper were torn along q, or -1 if that line is no good */
  function smaller(p, E, X, q) {
    const res = carve(p, E, X, q, 0, true, 0)
    return res && res !== 'tangled' ? Math.min(res.sa, res.sb) : -1
  }
  /* a pull straight from E to X that would only shave a sliver off bends inward to where the paper
     will give a real piece. Returns how far (0 if the straight line is fine), or null if nothing will do. */
  function bowFor(p, E, X) {
    let dx = X.x - E.x, dy = X.y - E.y
    const L = Math.hypot(dx, dy)
    if (L < 12) return null
    dx /= L; dy /= L
    let nx = -dy, ny = dx
    if ((p.cx - (E.x + X.x) / 2) * nx + (p.cy - (E.y + X.y) / 2) * ny < 0) { nx = -nx; ny = -ny }
    const need = MIN_PART * discArea * 1.12
    const line = b => {
      const q = []
      for (let i = 1; i < 12; i++) {
        const f = i / 12, o = b * Math.sin(Math.PI * f), x = E.x + dx * L * f + nx * o, y = E.y + dy * L * f + ny * o
        if (insidePoly(x, y, p.xs, p.ys)) q.push([x, y, 0])
      }
      return q
    }
    if (smaller(p, E, X, line(0)) >= need) return { b: 0, L, nx, ny, at: null, d0: 0 }
    for (let b = L * 0.05; b <= L * 0.56; b += L * 0.03) if (smaller(p, E, X, line(b)) >= need) return { b, L, nx, ny, at: null, d0: 0 }
    return null
  }

  /* A rip. `raw` is the path the hand has drawn across the piece (sheet units) and `head` its length.
     `tip` is how far along it the paper has actually torn: it runs after the hand, catches on a knot of
     fibre now and then, and lays the roughened points of the new edge as it goes. Each point is knocked
     off the path once, so the edge it leaves is the edge both pieces keep. */
  function openRip(p, E) {
    const seed = (p.seed + (++cutCount) * 2654435761) >>> 0
    const rnd = mulberry(seed)
    return {
      p, E, X: null, raw: [[E.x, E.y]], cum: [0], head: 0, tip: 0, seg: 0,
      pts: [], ids: 0, lastX: E.x, lastY: E.y, acc: 0, drift: 0, ux: 0, uy: 0, rnd, seed, wideA: rnd() < 0.5,
      planned: false, bow: null, dead: false, tries: 0, auto: false, quiet: false, min: 0,
      stick: 0, knot: 9 + rnd() * 16, tens: 0, open: 0,
      gone: new Set(), snaps: [], live: 0,
      A: null, B: null, ca: null, cb: null, ok: false, stale: true,
    }
  }
  function feed(r, x, y) {
    const lastPt = r.raw[r.raw.length - 1], d = Math.hypot(x - lastPt[0], y - lastPt[1])
    if (d < 0.35) return
    r.raw.push([x, y]); r.head += d; r.cum.push(r.head)
  }
  function rawAt(r, s) {
    let i = Math.min(r.seg, r.raw.length - 2)
    if (i < 0) return r.raw[0]
    while (i > 0 && r.cum[i] > s) i--
    while (i + 2 < r.cum.length && r.cum[i + 1] < s) i++
    const a = r.raw[i], b = r.raw[i + 1], d = r.cum[i + 1] - r.cum[i] || 1
    const t = clamp((s - r.cum[i]) / d, 0, 1)
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  /* the path the paper tears along: the hand's path, bent inward where that was needed */
  function baseAt(r, s) {
    const pt = rawAt(r, s), bow = r.bow
    if (!bow || !bow.b) return pt
    const d = bow.at != null && s >= bow.at
      ? bow.d0 * clamp((r.head - s) / Math.max(1e-6, r.head - bow.at), 0, 1)
      : bow.b * Math.sin(Math.PI * clamp(s / bow.L, 0, 1))
    return [pt[0] + bow.nx * d, pt[1] + bow.ny * d]
  }
  /* the torn edge grows to (x, y) */
  function lay(r, x, y, s) {
    const pts = r.pts
    let ax = r.lastX, ay = r.lastY
    /* a path that crosses itself: the loop is let go and the rip carries straight on from the crossing */
    for (let j = pts.length - 3; j >= 0; j--) {
      const cx = j ? pts[j - 1].bx : r.E.x, cy = j ? pts[j - 1].by : r.E.y
      const t = segHit(ax, ay, x, y, cx, cy, pts[j].bx, pts[j].by)
      if (t < 0) continue
      pts.length = j
      ax += (x - ax) * t; ay += (y - ay) * t
      r.acc = Math.min(ROUGH - 0.05, Math.hypot(ax - cx, ay - cy))
      break
    }
    const dx = x - ax, dy = y - ay, L = Math.hypot(dx, dy)
    if (L < 1e-4) { r.lastX = x; r.lastY = y; return }
    const ux = dx / L, uy = dy / L
    let left = L
    while (r.acc + left >= ROUGH) {
      const d = ROUGH - r.acc
      ax += ux * d; ay += uy * d; left -= d; r.acc = 0
      r.drift = r.drift * 0.8 + (r.rnd() - 0.5) * 1.7
      const off = r.drift + (r.rnd() - 0.5) * 2 * JAG
      pts.push({ x: ax - uy * off, y: ay + ux * off, bx: ax, by: ay, id: ++r.ids, s: s - left })
      if (!r.quiet && !reduced && rand() < 0.3) {
        /* it sheds a fibre here and there as it goes */
        const [wx, wy] = toWorld(r.p, ax, ay)
        bits.push({ k: 1, x: wx, y: wy, fy: 0, vx: (rand() - 0.5) * 70, vy: -12 - rand() * 46, a: rand() * TAU, va: (rand() - 0.5) * 10, r: 1.2 + rand() * 2.6, life: 0, max: 0.4 + rand() * 0.5, col: rand() < 0.5 ? pal.jute : pal.paper3 })
      }
    }
    r.acc += left
    r.lastX = x; r.lastY = y
    if (!r.ux && !r.uy) { r.ux = ux; r.uy = uy } else {
      const mx = r.ux * 0.5 + ux * 0.5, my = r.uy * 0.5 + uy * 0.5, len = Math.hypot(mx, my)
      if (len > 1e-6) { r.ux = mx / len; r.uy = my / len }
    }
    r.stale = true
  }
  function moveTip(r, go) {
    const end = Math.min(r.head, r.tip + go)
    let s = r.tip
    while (s < end - 1e-6) {
      while (r.seg + 2 < r.cum.length && r.cum[r.seg + 1] <= s + 1e-6) r.seg++
      const corner = r.cum[Math.min(r.seg + 1, r.cum.length - 1)]
      const next = Math.min(end, corner > s + 1e-6 ? corner : end, s + 3)
      const pt = baseAt(r, next)
      lay(r, pt[0], pt[1], next)
      s = next
    }
    r.tip = end
  }
  /* before the first fibres give: would the line the hand is on only shave a sliver off? Then it is bent inward. */
  function plan(r) {
    r.planned = true
    const p = r.p, E = r.E
    let X = r.X
    if (!X) {
      const P = rawAt(r, Math.min(r.head, 10))
      const dx = P[0] - E.x, dy = P[1] - E.y, L0 = Math.hypot(dx, dy)
      if (L0 < 1e-3) return
      X = crossings(p, P[0], P[1], P[0] + (dx / L0) * 4000, P[1] + (dy / L0) * 4000)[0]
      if (!X) return
    }
    const bow = bowFor(p, E, X)
    if (bow && bow.b > 0) r.bow = bow
    else if (!bow && r.X) r.dead = true                 // across and out in one move, too near the rim to take anything off
  }
  function seal(r, X, vmin) {
    feed(r, X.x, X.y)
    r.X = X; r.min = vmin
    if (r.planned && r.bow && r.bow.at == null) {
      /* the hand is out: from where the tip is, the bend runs out at the edge */
      r.bow.at = r.tip
      r.bow.d0 = r.bow.b * Math.sin(Math.PI * clamp(r.tip / r.bow.L, 0, 1))
    }
    if (reduced) rush(r)
  }
  function advance(r, dt) {
    const stretch = r.head - r.tip
    r.tens += ((r.X ? 0 : clamp(stretch / 36, 0, 1)) - r.tens) * Math.min(1, dt * 14)
    if (stretch <= 0.01) { if (r.X) finishRip(r); return }
    if (!r.planned) {
      if (!r.X && stretch < 7) return                   // the paper holds for a moment before it gives
      plan(r)
    }
    if (r.dead) { finishRip(r); return }
    if (r.stick > 0) {
      r.stick -= dt * (1 + stretch / 22)                // a harder pull breaks the knot sooner
      if (r.stick > 0) return
    }
    /* in the hand it runs harder the further behind it is; let go, it runs out at its own pace */
    const speed = r.auto ? r.min : Math.max(stretch * CHASE, r.X ? r.min : 46)
    let go = Math.min(stretch, Math.min(speed, r.X ? 900 : 1600) * dt)
    if (r.tip + go >= r.knot && r.knot < r.head - 2) {
      go = Math.max(0, r.knot - r.tip)
      r.knot += 12 + r.rnd() * 26
      r.stick = (0.018 + r.rnd() * 0.06) * (r.X ? 0.35 : 1)
    }
    moveTip(r, go)
    if (r.X && r.head - r.tip <= 0.01) finishRip(r)
  }
  /* run a rip that has left the paper to its end, now */
  function rush(r) {
    for (let i = 0; i < 4 && rips.get(r.p) === r && r.X; i++) {
      if (!r.planned) plan(r)
      if (!r.dead) moveTip(r, r.head - r.tip)
      finishRip(r)
    }
  }
  /* the rip has reached the far edge: build the two pieces, or null if the line will not hold */
  function closeRip(r) {
    const p = r.p, E = r.E, X = r.X
    const pts = r.pts.slice()
    while (pts.length && Math.hypot(pts[pts.length - 1].bx - X.x, pts[pts.length - 1].by - X.y) < 1.3) pts.pop()
    while (pts.length && Math.hypot(pts[0].bx - E.x, pts[0].by - E.y) < 1.3) pts.shift()
    const n = pts.length, q = []
    for (let i = 0; i < n; i++) {
      const pt = pts[i], e = Math.min(1, (Math.min(i, n - 1 - i) + 1) / 3)      // the jitter eases out where the rip meets an edge
      let x = pt.bx + (pt.x - pt.bx) * e, y = pt.by + (pt.y - pt.by) * e
      if (!insidePoly(x, y, p.xs, p.ys)) { x = pt.bx; y = pt.by }
      if (!insidePoly(x, y, p.xs, p.ys)) continue
      q.push([x, y, pt.id])
    }
    let parts = split(p, E, X, q, r.seed, r.wideA)
    if (parts === 'tangled') {
      /* still knotted: the straight rip between the same two points */
      const L = Math.hypot(X.x - E.x, X.y - E.y), m = Math.floor(L / ROUGH), plain = []
      for (let i = 1; i < m; i++) { const f = i / m, x = lerp(E.x, X.x, f), y = lerp(E.y, X.y, f); if (insidePoly(x, y, p.xs, p.ys)) plain.push([x + (r.rnd() - 0.5) * JAG, y + (r.rnd() - 0.5) * JAG, i]) }
      parts = split(p, E, X, plain, r.seed, r.wideA)
    }
    return Array.isArray(parts) ? parts : null
  }
  /* the line it took will not hold a piece: try it another way, once or twice */
  function again(r) {
    const p = r.p, E = r.E, X = r.X
    r.tries++
    const span = Math.hypot(X.x - E.x, X.y - E.y)
    if (r.tries === 1 && span < 0.5 * r.head) {
      /* in and back out the same side: the paper goes on tearing the way it was pulled, from the deepest point */
      let deep = 0, at = -1
      for (let i = 1; i < r.raw.length - 1; i++) { const d = depthIn(p, r.raw[i][0], r.raw[i][1]); if (d > deep) { deep = d; at = i } }
      if (at > 0) {
        const D = r.raw[at], dx = D[0] - E.x, dy = D[1] - E.y, L = Math.hypot(dx, dy)
        const out = L > 6 ? crossings(p, D[0], D[1], D[0] + (dx / L) * 4000, D[1] + (dy / L) * 4000)[0] : null
        if (out) {
          const sD = r.cum[at]
          r.raw.length = at + 1; r.cum.length = at + 1; r.head = sD
          while (r.pts.length && r.pts[r.pts.length - 1].s > sD) r.pts.pop()
          const keep = r.pts[r.pts.length - 1]
          r.tip = Math.min(r.tip, sD); r.seg = 0; r.acc = 0; r.bow = null
          r.lastX = r.tip >= sD ? D[0] : keep ? keep.bx : E.x; r.lastY = r.tip >= sD ? D[1] : keep ? keep.by : E.y
          if (r.tip < sD && keep) r.tip = keep.s
          else if (r.tip < sD) r.tip = 0
          feed(r, out.x, out.y)
          r.X = out; r.min = 520; r.auto = true; r.stale = true
          return true
        }
      }
    }
    const bow = span >= 12 ? bowFor(p, E, X) : null
    if (!bow) return false
    r.tries = 2
    r.raw = [[E.x, E.y], [X.x, X.y]]; r.cum = [0, bow.L]; r.head = bow.L; r.tip = 0; r.seg = 0
    r.pts.length = 0; r.lastX = E.x; r.lastY = E.y; r.acc = 0; r.ux = r.uy = 0
    r.bow = bow.b > 0 ? bow : null; r.min = 620; r.auto = true; r.stale = true
    return true
  }
  function finishRip(r) {
    const p = r.p
    if (rips.get(p) === r) rips.delete(p)
    p.tugx = p.tugy = 0
    if (stageName !== 'tear' || !pieces.includes(p)) return
    const parts = r.dead ? null : closeRip(r)
    if (parts) { lastCut = { len: r.tip, span: Math.hypot(r.X.x - r.E.x, r.X.y - r.E.y), bent: !!r.bow, tries: r.tries }; commit(p, parts, r.E, r.X, { open: r.open, byHand: !r.auto }); return }
    if (!r.dead && r.tries < 2 && again(r)) { rips.set(p, r); return }
    nick(p)
  }
  /* a straight rip from E to X with the slight wander of a hand, run by itself (a tap) */
  function wander(r, E, X) {
    const L = Math.hypot(X.x - E.x, X.y - E.y), ux = (X.x - E.x) / L, uy = (X.y - E.y) / L
    const bow = (rand() - 0.5) * 0.08 * L, bow2 = (rand() - 0.5) * 0.04 * L
    const n = Math.max(4, Math.round(L / 8))
    for (let i = 1; i < n; i++) {
      const f = i / n, off = bow * Math.sin(Math.PI * f) + bow2 * Math.sin(TAU * f)
      feed(r, E.x + ux * L * f - uy * off, E.y + uy * L * f + ux * off)
    }
  }
  function ripLine(p, E, X, vmin) {
    const r = openRip(p, E)
    wander(r, E, X)
    r.auto = true; r.planned = true
    rips.set(p, r)
    seal(r, X, vmin)
  }
  /* the same rip, done at once (the button) */
  function lineParts(p, E, X) {
    if (Math.hypot(X.x - E.x, X.y - E.y) < 6) return null
    const r = openRip(p, E)
    r.quiet = true; r.planned = true
    wander(r, E, X)
    feed(r, X.x, X.y)
    r.X = X
    moveTip(r, r.head)
    const parts = closeRip(r)
    return parts ? { parts, entry: E } : null
  }

  const tearable = p => stageName === 'tear' && p.held && !rips.has(p) && pieces.length + rips.size < MAX_PIECES && p.share >= MIN_PART * 2

  /* the two pieces take the place of the one. A piece still bigger than a coin stays in
     the hand; the rest come loose and go down to the bed. */
  function commit(p, parts, E, X, opt = {}) {
    const at = pieces.indexOf(p)
    if (at < 0) return false
    const [ex, ey] = toWorld(p, E.x, E.y), [xx, xy] = toWorld(p, X.x, X.y)
    let dx = xx - ex, dy = xy - ey
    const L = Math.hypot(dx, dy) || 1
    dx /= L; dy /= L
    const mx = (ex + xx) / 2, my = (ey + xy) / 2
    const ca = Math.cos(p.ha0), sa = Math.sin(p.ha0)
    pieces.splice(at, 1, parts[0], parts[1])
    const full = pieces.length >= MAX_PIECES
    const pvx = clamp(ptr.down ? ptr.vx : 0, -240, 240), pvy = clamp(ptr.down ? ptr.vy : 0, -240, 240)
    for (const c of parts) {
      const ox = c.cx - p.cx, oy = c.cy - p.cy
      const q = place(p, ox, oy)
      c.x = p.x + q[0]; c.y = p.y + q[1]; c.a = p.a; c.b = p.b; c.sq = p.sq
      c.vx = p.vx; c.vy = p.vy; c.w = p.w
      const side = (c.x - mx) * -dy + (c.y - my) * dx >= 0 ? 1 : -1
      const nx = -dy * side, ny = dx * side
      if (opt.open && p.held) {
        /* the two sides had already swung apart about the tip of the rip: they start from there */
        const th = -side * opt.open * 0.5, ct = Math.cos(th), st = Math.sin(th), rx = c.x - xx, ry = c.y - xy
        c.x = xx + ct * rx - st * ry; c.y = xy + st * rx + ct * ry; c.a += th
      }
      if (p.held && !full && (opt.keep || c.share > HOLD_ABOVE)) {
        /* still in the hand: the two halves part by a few units so the torn edges show */
        c.held = true
        c.hx0 = p.hx0 + ca * ox - sa * oy + nx * 3.4
        c.hy0 = p.hy0 + sa * ox + ca * oy + ny * 3.4
        c.ha0 = p.ha0 + side * (0.025 + rand() * 0.03)
        c.vx += nx * 26; c.vy += ny * 26
      } else {
        const push = p.held ? 30 + rand() * 50 : 20 + rand() * 26
        c.vx += nx * push + pvx * 0.2
        c.vy += ny * push + pvy * 0.2 - (30 + rand() * 50)           // a small toss, then it flutters down
        c.w += side * (0.4 + rand() * 1.8) * (rand() < 0.8 ? 1 : -1)
      }
      bakePiece(c)
    }
    /* a small piece the hand tore off while it is still down stays in the hand: it goes where the
       hand goes and lands where it is let go */
    let carry = null
    if (opt.byHand && ptr.down && !ptr.lost && ptr.mode === 'tear' && !ptr.carry) {
      const free = parts.filter(c => !c.held)
      if (free.length) carry = free.reduce((a, b) => (b.area < a.area ? b : a))
    }
    if (full) {
      /* that is as many pieces as there will be: everything comes loose together */
      const going = pieces.filter(o => o.held)
      for (const o of going) o.held = false
      for (const c of parts) if (!going.includes(c) && c !== carry) release(c)
      letGoAll(going)
    } else for (const c of parts) if (!c.held && c !== carry) release(c)
    if (carry) take(carry)
    if (!opt.keep && stageName === 'tear' && pieces.some(o => o.held) && hint.textContent === HINT.tear) setHint(HINT.again)
    /* a puff of fibre and a seed or two from the new edge */
    if (!reduced) {
      const count = Math.round(clamp(L / 12, 3, 10))
      for (let i = 0; i < count; i++) {
        const f = rand()
        bits.push({ k: 1, x: lerp(ex, xx, f), y: lerp(ey, xy, f), fy: 0, vx: (rand() - 0.5) * 80 + pvx * 0.12, vy: -15 - rand() * 55, a: rand() * TAU, va: (rand() - 0.5) * 10, r: 1.4 + rand() * 3.2, life: 0, max: 0.45 + rand() * 0.6, col: rand() < 0.5 ? pal.jute : pal.paper3 })
      }
      for (let i = 0, m = 1 + ((rand() * 3) | 0); i < m; i++) {
        const f = rand(), x = lerp(ex, xx, f)
        bits.push({ k: 2, x, y: lerp(ey, xy, f), fy: soilY(x) + 4 + rand() * 30, vx: (rand() - 0.5) * 50, vy: -10 - rand() * 40, a: rand() * TAU, va: (rand() - 0.5) * 6, r: 0.9 + rand() * 0.6, life: 0, max: 4, col: pal.ink })
      }
      if (bits.length > 220) bits.splice(0, bits.length - 220)
    }
    if (!opt.keep) { if (reduced) settleNow(); checkTorn() }
    return true
  }
  /* the hand lets go: all of them leave it first, so each finds its place on the whole bed */
  function letGoAll(list) {
    for (const p of list) p.held = false
    for (const p of list) {
      rips.delete(p)
      p.vx += (rand() - 0.5) * 40; p.w += (rand() - 0.5) * 2
      release(p)
    }
  }
  function nick(p) {
    /* a rip that would not leave a real piece does not go through: the paper just shivers */
    if (!p.held || reduced) return
    p.vx += (rand() - 0.5) * 40; p.vy += (rand() - 0.5) * 24; p.w += (rand() - 0.5) * 0.9
  }
  function halve(p, opt) {
    const base = rand() * Math.PI
    for (let i = 0; i < 8; i++) {
      const pair = chord(p, p.cx, p.cy, base + (i * Math.PI) / 8)
      const res = pair && lineParts(p, pair[0], pair[1])
      if (res) return commit(p, res.parts, res.entry, pair[1], opt)
    }
    return false
  }
  /* a tap takes a bit about the size of a coin off the rim nearest the tap. The rip bows in toward
     the middle, so the bit comes away round, like a pinch of paper, not a thin slice off the edge.
     It runs by itself through the same rip as a drag, so its edges and fibres are the same. */
  function lensTap(p, lx, ly) {
    /* what is left after a coin: still more than a coin to hold, or else the piece is simply torn in two,
       across its long side, about where it was tapped */
    const halving = p.share < 2 * HOLD_ABOVE * 0.95
    const want = (halving ? p.share / 2 : COIN) * discArea
    let nx, ny, ox = 0, oy = 0
    if (halving) { nx = Math.cos(p.axis); ny = Math.sin(p.axis) } else {
      let best = Infinity
      for (let i = 0, n = p.xs.length; i < n; i++) {
        const j = i + 1 === n ? 0 : i + 1
        const ex = p.xs[j] - p.xs[i], ey = p.ys[j] - p.ys[i], l2 = ex * ex + ey * ey || 1
        const t = clamp(((lx - p.xs[i]) * ex + (ly - p.ys[i]) * ey) / l2, 0, 1)
        const x = p.xs[i] + ex * t, y = p.ys[i] + ey * t, d = Math.hypot(x - lx, y - ly)
        if (d < best) { best = d; ox = x; oy = y }
      }
      nx = ox - p.cx; ny = oy - p.cy
      const nl = Math.hypot(nx, ny)
      if (nl < 1e-3) { const a = rand() * TAU; nx = Math.cos(a); ny = Math.sin(a) } else { nx /= nl; ny /= nl }
    }
    let reach = 0, back = 0
    for (let i = 0; i < p.hx.length; i++) { const v = p.hx[i] * nx + p.hy[i] * ny; reach = Math.max(reach, v); back = Math.min(back, v) }
    if (reach < 4) return false
    const tapAt = (lx - p.cx) * nx + (ly - p.cy) * ny
    const ang = Math.atan2(ny, nx) + Math.PI / 2 + (rand() - 0.5) * (halving ? 0.3 : 0.5)
    const bowBy = halving ? 0.06 + rand() * 0.06 : 0.16 + rand() * 0.08
    const tx = ox - nx * 0.6, tyy = oy - ny * 0.6        // a point just inside the rim on the tapped side
    const from = halving ? back * 0.6 : reach * 0.02, to = halving ? reach * 0.6 : reach * 0.96
    let pick = null
    for (let k = 0; k <= 32; k++) {
      const o = from + ((to - from) * k) / 32
      const pair = chord(p, p.cx + nx * o, p.cy + ny * o, ang)
      if (!pair) continue
      const [E, X] = pair, L = Math.hypot(X.x - E.x, X.y - E.y)
      if (L < 8) continue
      /* bowed toward the middle of the piece */
      let bx = -(X.y - E.y) / L, by = (X.x - E.x) / L
      if ((p.cx - (E.x + X.x) / 2) * bx + (p.cy - (E.y + X.y) / 2) * by < 0) { bx = -bx; by = -by }
      const q = []
      for (let i = 1; i < 14; i++) {
        const f = i / 14, b = bowBy * L * Math.sin(Math.PI * f), x = lerp(E.x, X.x, f) + bx * b, y = lerp(E.y, X.y, f) + by * b
        if (insidePoly(x, y, p.xs, p.ys)) q.push([x, y, 0])
      }
      const res = carve(p, E, X, q, 0, true, 0)
      if (!res || res === 'tangled') continue
      const lens = halving ? Math.min(res.sa, res.sb) : insidePoly(tx, tyy, res.A.xs, res.A.ys) ? res.sa : res.sb, rest = p.area - lens
      if (lens < MIN_PART * discArea * 1.12 || rest < MIN_PART * discArea * 1.12) continue
      const score = Math.abs(lens - want) / want + (0.25 * Math.abs(o - tapAt)) / (reach - (halving ? back : 0))
      if (!pick || score < pick.score) pick = { score, E, X, q }
    }
    if (!pick) return false
    let { E, X, q } = pick
    if (rand() < 0.5) { const t = E; E = X; X = t; q = q.slice().reverse() }
    const r = openRip(p, E)
    for (const pt of q) feed(r, pt[0], pt[1])
    r.auto = true; r.planned = true
    rips.set(p, r)
    seal(r, X, 520)
    return true
  }
  function tapTear(p, lx, ly) {
    if (lensTap(p, lx, ly)) return true
    const base = rand() * Math.PI
    for (let i = 0; i < 8; i++) {
      const pair = chord(p, lx, ly, base + (i * Math.PI) / 8)
      if (!pair) continue
      const bow = bowFor(p, pair[0], pair[1])
      if (!bow || bow.b > 0) continue                  // only a line that needs no bending
      ripLine(p, pair[0], pair[1], 560)
      return true
    }
    nick(p)
    return false
  }
  /* the hand takes the piece it just tore off */
  function take(c) {
    c.held = false; c.loose = false; c.settling = false; c.asleep = false; c.carried = true
    c.tugx = c.tugy = 0
    ptr.carry = c
    c.gx = c.x - ptr.x; c.gy = c.y - ptr.y; c.ga = c.a; c.b = 0
    if (reduced) { c.gx = 0; c.gy = grip(c); c.x = ptr.x; c.y = ptr.y + c.gy }
    /* anything else this hand had begun to tear runs on to the edge by itself */
    for (const r of [...rips.values()]) if (!r.X) runOn(r)
    ptr.anchors.clear()
  }
  /* where the piece hangs from the hand: just under a mouse pointer, above a fingertip so the finger does not hide it */
  const grip = c => (ptr.touch ? -(c.rad * 0.9 + 12 / k) : c.rad * 0.3)
  /* the hand opens: the piece it carried comes down under that spot */
  function dropCarry() {
    const c = ptr.carry
    ptr.carry = null
    if (!c || !pieces.includes(c)) return
    c.carried = false
    release(c, { x: ptr.x, y: ptr.y })
    if (reduced) settleNow()
    checkTorn()
  }
  /* a rip the hand is no longer pulling runs on to the edge the way it was heading, or closes up if it had hardly begun */
  function runOn(r) {
    const p = r.p
    if (r.head >= 5) {
      const a = rawAt(r, Math.max(0, r.head - 9)), b = r.raw[r.raw.length - 1]
      const ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy)
      const out = L > 1e-6 ? crossings(p, b[0], b[1], b[0] + (ux / L) * 4000, b[1] + (uy / L) * 4000)[0] : null
      if (out) { r.auto = true; seal(r, out, 460); return true }
    }
    rips.delete(p); p.tugx = p.tugy = 0
    return false
  }
  function checkTorn() {
    if (stageName !== 'tear' || rips.size || pieces.some(p => p.held || p.carried)) return
    /* six pieces cannot all be a coin or under, so this never runs in practice; it keeps the promise anyway */
    for (let guard = 0; pieces.length < MIN_PIECES && guard < 6; guard++) {
      const big = pieces.reduce((a, b) => (a.area > b.area ? a : b))
      if (!halve(big, { keep: true })) break
    }
    if (reduced) settleNow()
    setStage('press')
  }

  /* the button: three rips across whatever is still in the hand, then anything still too big is halved */
  function autoTear() {
    if (ptr.carry) dropCarry()
    for (const r of [...rips.values()]) { if (r.X) rush(r); else { rips.delete(r.p); r.p.tugx = r.p.tugy = 0 } }
    rips.clear()
    if (stageName !== 'tear') return
    const a0 = rand() * Math.PI
    for (let pass = 0; pass < 3; pass++) {
      const inHand = pieces.filter(p => p.held)
      if (!inHand.length || pieces.length >= MAX_PIECES - 1) break
      const big = inHand.reduce((a, b) => (a.area > b.area ? a : b))
      const ang = a0 + pass * (Math.PI / 3) + (rand() - 0.5) * 0.45
      const wx = big.x + (rand() - 0.5) * big.rad * 0.24, wy = big.y + (rand() - 0.5) * big.rad * 0.24
      for (const p of inHand) {
        if (pieces.length >= MAX_PIECES - 1) break
        const [lx, ly] = toLocal(p, wx, wy)
        const pair = chord(p, lx, ly, ang - p.a)
        const res = pair && lineParts(p, pair[0], pair[1])
        if (res) commit(p, res.parts, res.entry, pair[1], { keep: true })
      }
    }
    for (let guard = 0; guard < 12; guard++) {
      const big = pieces.filter(p => p.held && p.share > HOLD_ABOVE).sort((a, b) => b.area - a.area)[0]
      if (!big || pieces.length >= MAX_PIECES) break
      if (!halve(big, { keep: true })) break
    }
    const hand = pieces.filter(p => p.held)
    letGoAll(hand)
    pieces.forEach((p, i) => { if (hand.includes(p)) { p.vy -= 20 + rand() * 30; p.hold = reduced ? 0 : 0.05 + i * 0.05 } })
    checkTorn()
  }

  /* ==========================================================================
     Loose paper: it flutters down and lies flat on the bed
     ========================================================================== */
  /* where a loose piece will lie: near where it comes down, in a gap between the others, its long
     side along the bed, all of it on the frame and clear of the row with the button */
  function landing(p, aim) {
    let a = -p.axis + (rand() - 0.5) * 0.6
    while (a - p.a > Math.PI / 2) a -= Math.PI
    while (a - p.a < -Math.PI / 2) a += Math.PI
    const flat = extents(p, a, 0, FLAT)
    const lo = WALL + flat.hw + 3, hi = VW - WALL - flat.hw - 3
    const others = pieces.filter(q => q !== p && !q.held && !q.carried && q.hw > 0)
    const n = hi > lo ? Math.max(1, Math.round((hi - lo) / 6)) : 0
    const cols = []
    for (let i = 0; i <= n; i++) cols.push(n ? lo + ((hi - lo) * i) / n : VW / 2)
    if (aim && n) cols.push(clamp(aim.x, lo, hi))        // let go here: here, if there is room
    let best = null
    for (const x of cols) {
      const b = Math.atan(soilSlope(x)) * 0.6            // it lies along the slope of the bed there
      const e = extents(p, a, b, FLAT)
      if (n && (x - e.hw < WALL || x + e.hw > VW - WALL)) continue
      const ridge = soilY(x), d0 = e.hh + 1.5, d1 = Math.max(d0, d0 + (bandLow() - ridge - 2 * e.hh - 3) * 0.8)
      const rows = [0, 1, 2, 3].map(j => d0 + (d1 - d0) * ((j + rand()) / 4))
      if (aim && aim.y > ridge) rows.push(clamp(aim.y - ridge, d0, d1))
      for (const d of rows) {
        const y = ridge + d
        /* near where it falls, toward the middle of the bed; or, carried, as near the spot it was let go as the others allow */
        let score = aim
          ? -Math.abs(x - aim.x) * 1.6 - (aim.y > ridge ? Math.abs(y - aim.y) * 0.9 : Math.abs(d - (d0 + d1) / 2) * 0.22) + rand()
          : -Math.abs(x - p.x) * 0.17 - Math.abs(d - (d0 + d1) / 2) * 0.22 + rand() * 6
        for (const q of others) {
          const o = 1 - Math.hypot((x - q.lx) / (e.hw + q.hw), (y - q.ly) / (e.hh + q.hh))
          if (o > 0) score -= o * (aim ? 90 : 140)
          if (!aim) score -= 15 * Math.exp(-(((x - q.lx) / 62) ** 2))         // and the paper spreads along the bed
        }
        if (!best || score > best.score) best = { x, y, d, b, hw: e.hw, hh: e.hh, score }
      }
    }
    if (!best) { const x = VW / 2, e = extents(p, a, 0, FLAT); best = { x, y: soilY(x) + e.hh + 1.5, d: e.hh + 1.5, b: 0, hw: e.hw, hh: e.hh } }
    return { x: best.x, y: best.y, d: best.d, a, b: best.b, hw: best.hw, hh: best.hh }
  }
  function release(p, aim) {
    p.held = false; p.loose = true; p.asleep = false; p.settling = false; p.carried = false
    p.tugx = p.tugy = 0
    const spot = landing(p, aim)
    p.lx = spot.x; p.ly = spot.y; p.ld = spot.d; p.la = spot.a; p.lb = spot.b; p.hw = spot.hw; p.hh = spot.hh
    p.h0 = Math.max(24, p.ly - p.y); p.ft = 0; p.prog = 0
    p.rockA = 0.5 + rand() * 0.35; p.rockW = 6.5 + rand() * 3.5; p.rockP = rand() * TAU
  }
  function stepFall(p, h) {
    if (p.hold > 0) { p.hold -= h; return }
    p.ft += h
    const ph = p.rockP + p.rockW * p.ft
    const air = 1 - p.prog
    p.vy += 400 * h
    p.vy *= Math.exp(-2.0 * h)                          // paper: the air holds it up
    p.vx += Math.cos(ph) * 560 * p.rockA * air * h      // it slides the way it tips
    p.vx += ((p.lx - p.x) * 26 - p.vx * 5) * h          // and drifts to where it will lie
    p.x += p.vx * h; p.y += p.vy * h
    const prog = p.prog = clamp(1 - (p.ly - p.y) / p.h0, 0, 1)
    const phi = Math.abs(TILT * easeInOut(clamp(prog * 1.12, 0, 1)) + Math.sin(ph) * p.rockA * (0.25 + 0.75 * (1 - prog)))
    p.sq = Math.cos(Math.min(phi, 1.43))
    p.b = p.lb * prog + Math.sin(ph * 0.5 + 1) * 0.7 * (1 - prog)
    p.w *= Math.exp(-1.4 * h)
    p.a += p.w * h * (1 - prog) + (p.la - p.a) * (1 - Math.exp(-h * 7 * prog * prog))
    if (p.y >= p.ly) land(p)
  }
  function land(p) {
    p.loose = false; p.settling = true; p.st = 0
    p.order = ++laid                                    // later pieces rest on earlier ones
    p.from = { x: p.x, y: Math.max(p.y, p.ly), a: p.a, b: p.b, sq: p.sq }      // carried in low, it slides back up to its place
    p.vx = p.vy = p.w = 0; p.prog = 1
    crumbs(p.lx, p.ly + p.hh * 0.5, p.hw * 1.5, 4, 0.36)
  }
  function stepSettle(p, h) {
    p.st = Math.min(1, p.st + h / 0.34)
    const e = easeOut(p.st), f = p.from
    p.x = lerp(f.x, p.lx, e); p.y = lerp(f.y, p.ly, e); p.a = lerp(f.a, p.la, e); p.b = lerp(f.b, p.lb, e)
    p.sq = lerp(f.sq, FLAT, e) - 0.05 * Math.sin(Math.PI * p.st)      // it slaps flat, then lifts a hair
    if (p.st >= 1) lie(p)
  }
  function lie(p) {
    if (!p.order) p.order = ++laid
    camTo = camMax
    p.loose = false; p.settling = false; p.asleep = true; p.hold = 0; p.prog = 1
    p.x = p.lx; p.y = p.ly; p.a = p.la; p.b = p.lb; p.sq = FLAT
    p.vx = p.vy = p.w = 0
    if (p.press < 1) setFringe(p, 0.4)
  }
  function sim(h) {
    for (const p of pieces) {
      if (p.held) {
        /* a damped spring to where the hand holds it, with a slow sway */
        const tx = p.hx0 + p.tugx, tyy = heldY(p) + p.tugy + Math.sin(clock * 1.25 + p.phase) * 1.5 * swayK
        const ta = p.ha0 + Math.sin(clock * 0.85 + p.phase * 1.7) * 0.02 * swayK
        p.vx += ((tx - p.x) * 190 - p.vx * 24) * h
        p.vy += ((tyy - p.y) * 190 - p.vy * 24) * h
        p.w += ((ta - p.a) * 150 - p.w * 20) * h
        p.x += p.vx * h; p.y += p.vy * h; p.a += p.w * h
      } else if (p.loose) stepFall(p, h)
      else if (p.settling) stepSettle(p, h)
      else if (p.pressing) {
        p.pt = Math.min(1, p.pt + h / 0.42)
        const t = p.pt - 1
        p.press = 1 + 2.3 * t * t * t + 1.3 * t * t     // a little past, then back: the soil gives
        if (p.pt >= 1) { p.pressing = false; p.press = 1; setFringe(p, 0.12) }
      } else if (p.carried) {
        /* in the hand that tore it: it follows a moment behind, swings with the pull, and over the
           bed it starts to lie down. The grip eases to where a hand would hold it. */
        const over = clamp((ptr.y - (soilY(ptr.x) - 30)) / 36, 0, 1)
        p.gx *= Math.exp(-h * 5); p.gy += (grip(p) - p.gy) * (1 - Math.exp(-h * 5))
        const tx = ptr.x + p.gx, tyy = ptr.y + p.gy
        p.vx += ((tx - p.x) * 240 - p.vx * 26) * h
        p.vy += ((tyy - p.y) * 240 - p.vy * 26) * h
        p.x += p.vx * h; p.y += p.vy * h
        const ta = p.ga + clamp(p.vx * 0.0024, -0.55, 0.55)
        p.w += ((ta - p.a) * 130 - p.w * 15) * h
        p.a += p.w * h
        p.b = 0
        p.sq += (lerp(1, 0.66, over) - p.sq) * Math.min(1, h * 9)
        p.prog = over * 0.6
      } else if (p.want && p.press < 1) {
        p.wantT += h
        if (p.wantT >= p.wantAt) startPress(p)
      }
    }
  }
  /* reduced motion, or a jump ahead: nothing tumbles. Everything is put where it was going. */
  function settleNow() {
    for (const r of [...rips.values()]) { if (r.X) rush(r); else rips.delete(r.p) }
    rips.clear()
    for (const p of pieces) {
      p.hold = 0; p.tugx = p.tugy = 0
      if (p.held) continue
      if (p.carried) { p.gx = 0; p.gy = grip(p); p.x = ptr.x; p.y = ptr.y + p.gy; p.a = p.ga; p.vx = p.vy = p.w = 0; continue }
      if (!p.asleep) lie(p)
      if (p.want || p.pressing) { if (!p.bury) bakeBury(p); endPress(p) }
    }
    cam = Math.min(camTo, camCap())                     // the view is down at the bed as soon as paper lies on it
    for (const p of pieces) if (p.held) { p.x = p.hx0; p.y = heldY(p); p.a = p.ha0; p.vx = p.vy = p.w = 0 }
    over.stale = true
    bits.length = 0; drops.length = 0
    intro = 1
  }

  /* ==========================================================================
     Press
     ========================================================================== */
  function crumbs(x, y, width, n, power) {
    if (reduced) return
    for (let i = 0; i < n; i++) {
      const px = clamp(x + (rand() - 0.5) * width, 2, VW - 2), py = Math.max(y + (rand() - 0.5) * 3, soilY(px) - 0.5)
      const tone = rand()
      bits.push({ k: 0, x: px, y: py, fy: py + 0.8, vx: (rand() - 0.5) * 90, vy: -(36 + rand() * 110) * power, a: 0, va: 0, r: 0.6 + rand() * 1.3, life: 0, max: 1.2, col: tone < 0.4 ? pal.ink : tone < 0.65 ? pal.ink2 : mix(pal.ink, pal.moss, 0.45) })
    }
  }
  function startPress(p) {
    p.want = false; p.pressing = true; p.pt = 0
    bakeBury(p)
    /* soil jumps from round its edge */
    if (!reduced) {
      for (let i = 0; i < 12; i++) {
        const v = (rand() * p.hx.length) | 0, q = place(p, p.hx[v], p.hy[v])
        crumbs(p.x + q[0], p.y + q[1], 5, 1, 0.75)
      }
    }
    over.stale = true
  }
  function endPress(p) {
    p.pressing = false; p.want = false; p.press = 1; p.pt = 1
    setFringe(p, 0.12)
    over.stale = true
  }
  const pressedCount = () => pieces.reduce((n, p) => n + (p.want || p.pressing || p.press >= 1 ? 1 : 0), 0)
  const bedded = () => pieces.every(p => p.press >= 1 && !p.pressing)
  function afterPress() {
    if (reduced) settleNow()
    if (stageName === 'press' && pressedCount() === pieces.length) setStage('water')
  }
  /* is (wx, wy) on this piece, or near enough for a fingertip? */
  function under(p, wx, wy) {
    const [lx, ly] = toLocal(p, wx, wy)
    if (insidePoly(lx, ly, p.xs, p.ys)) return true
    const cx = p.loose ? p.x : p.lx, cy = p.loose ? p.y : p.ly
    const dx = (wx - cx) / (p.hw + 7), dy = (wy - cy) / (p.hh + 7)
    return dx * dx + dy * dy < 1
  }
  function pressAt(wx, wy, dragging) {
    let hit = false
    for (const p of pieces) {
      if (p.want || p.pressing || p.press >= 1) continue
      if (under(p, wx, wy)) { p.want = true; p.wantT = 0; p.wantAt = 0; hit = true }
    }
    if (hit) afterPress()
    else if (!dragging && wy > soilY(wx) - 4) crumbs(wx, wy, 14, 4, 0.5)       // a press on bare soil only stirs it
  }
  function pressAll() {
    let i = 0
    for (const p of pieces.slice().sort((a, b) => a.lx - b.lx)) {
      if (p.want || p.pressing || p.press >= 1) continue
      p.want = true; p.wantT = 0; p.wantAt = i++ * 0.08
    }
    afterPress()
  }

  /* ==========================================================================
     Water
     ========================================================================== */
  /* the grid covers the soil layer: across the frame, and from the far edge of the bed to below the frame */
  const wetCol = x => (x / VW) * WET_COLS - 0.5
  const wetRow = y => ((y - soil.top) / Math.max(1, soil.wet.height / S)) * WET_ROWS - 0.5
  /* a drop darkens a soft patch round where it lands, wider than it is deep, as the bed is seen from above */
  function wetAt(x, y, amount) {
    const c0 = wetCol(x), r0 = wetRow(y), ci = Math.round(c0), ri = Math.round(r0)
    for (let r = ri - 2; r <= ri + 2; r++) {
      if (r < 0 || r >= WET_ROWS) continue
      for (let c = ci - 4; c <= ci + 4; c++) {
        if (c < 0 || c >= WET_COLS) continue
        const dc = c - c0, dr = r - r0, i = r * WET_COLS + c
        wet[i] = Math.min(1, wet[i] + amount * Math.exp(-(dc * dc) / 5 - (dr * dr) / 1.3))
      }
    }
    wetLayer.stale = true
  }
  const wetNear = (x, y) => wet[clamp(Math.round(wetRow(y)), 0, WET_ROWS - 1) * WET_COLS + clamp(Math.round(wetCol(x)), 0, WET_COLS - 1)]
  /* a droplet falls from (x, y) to a spot on the bed: near `floor` if the hand is on the soil, anywhere on the bed if not */
  function spawnDrop(x, y, floor) {
    x = clamp(x, 6, VW - 6)
    const ridge = soilY(x), room = Math.max(8, bandLow() - ridge)
    const fy = floor != null && floor > ridge + 2 ? clamp(floor + (rand() - 0.5) * 16, ridge + 2, ridge + room) : ridge + 3 + rand() * Math.min(46, room - 4)
    const top = fy - 46 - rand() * 36                   // never closer to the bed than this, so a drop is seen to fall
    drops.push({ x, y: Math.max(cam + 4, y == null ? top - 30 : Math.min(y, top)), vy: 80 + rand() * 90, r: 1.5 + rand() * 1.0, fy })
  }
  function soak(byButton) {
    /* the whole stage at once: reduced motion */
    pour = null; drops.length = 0
    water = 1; fell = NEED
    wet.fill(0.86); wetLayer.stale = true
    if (byButton != null) wateredBy = byButton ? 'button' : 'hand'
    if (stageName === 'water') setStage('sun')
  }
  function autoWater() {
    if (reduced) { soak(true); return }
    if (pour && pour.auto) return                       // already pouring
    wateredBy = 'button'
    pour = { x: VW * 0.14, y: 0, n: 0, auto: true, t: 0 }
  }

  /* ==========================================================================
     Sun and sprouts
     ========================================================================== */
  function cubic(p0, p1, p2, p3, n, out) {
    for (let i = out.length ? 1 : 0; i <= n; i++) {
      const t = i / n, m = 1 - t
      out.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]])
    }
    return out
  }
  function measureLine(pts) {
    const len = [0]
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return { pts, len }
  }
  /* one sprout in the hand of the story chapter's drawing: a stem with a slow S in it, two leaves
     that leave it at different heights, a vein in each, round caps, no fill. The leaf and vein curves
     are the ones in #sprout-svg. No two are alike: height, bend, lean, where the leaves sit and how
     big they are all vary, and a tall stem carries smaller leaves, as it does there. */
  function makeSprout(site, r, tall, seedling) {
    const ref = Math.min(VH, 340)
    /* the sun sets on the right: as they finish growing they lean a little toward it, those furthest from it more */
    const toSun = clamp((VW * 0.9 - site.x) / VW, -0.2, 0.75) * (tall ? 0.15 : 0.1)
    if (seedling) {
      /* a late one, just up: a short stem and its two seed leaves */
      const h = ref * (0.035 + r() * 0.02), lean = (r() - 0.5) * 0.2
      const stem = cubic([0, 1.2], [h * 0.12, -h * 0.4], [-h * 0.1, -h * 0.75], [0, -h], 12, [])
      const top = stem[stem.length - 1], L = Math.max(5.5, h * (0.55 + r() * 0.15))
      /* a seed leaf: narrow where it leaves the stem, round at the far end, opening upward in a shallow V */
      const round = (dir, rise) => {
        const ux = Math.cos(rise) * dir, uy = -Math.sin(rise), vx = -uy, vy = ux, pts = []
        const wid = t => L * 0.3 * Math.sin(Math.PI * Math.pow(t, 0.72))
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([top[0] + ux * L * t + vx * wid(t), top[1] + uy * L * t + vy * wid(t)]) }
        for (let i = 11; i >= 0; i--) { const t = i / 12; pts.push([top[0] + ux * L * t - vx * wid(t), top[1] + uy * L * t - vy * wid(t)]) }
        return pts
      }
      const c = Math.cos(lean), s = Math.sin(lean)
      const lineOf = pts => measureLine(pts.map(([px, py]) => [c * px - s * py, s * px + c * py]))
      return {
        x: site.x, y: site.y, tall: false, kind: 'seed', delay: 0.38 + r() * 0.12, toSun: toSun * 0.6,
        stem: lineOf(stem), leaves: [round(-1, 0.35 + r() * 0.3), round(1, 0.3 + r() * 0.3)].map(e => ({ edge: lineOf(e), vein: null })),
        sp: r() * TAU, sw: 0.9 + r() * 0.8, sa: 0.01,
      }
    }
    const roof = site.y - camMax - Math.max(capLow, hintBox ? hintBox.y1 : 0) - 10 / k      // the tip stays clear of the words in the top corner
    const h = Math.max(ref * 0.07, Math.min(roof, tall ? ref * (0.2 + r() * 0.1) : ref * (0.085 + r() * 0.055)))
    const kind = tall ? (r() < 0.3 ? 'three' : 'pair') : (r() < 0.38 ? 'bud' : 'pair')
    let lean = (r() - 0.5) * 0.26
    if (site.away) lean = Math.abs(lean) * 0.7 * site.away + lean * 0.3                         // away from its nearest neighbour
    if (site.x < 70) lean = Math.abs(lean); else if (site.x > VW - 70) lean = -Math.abs(lean)      // near an edge it leans in
    const bend = (r() - 0.5) * 0.3 * h
    let flip = r() < 0.5 ? -1 : 1
    if (site.away) flip = -site.away                    // the first, bigger leaf opens on the open side (a leaf of dir 1 points left)
    const top = kind === 'bud' ? [bend * 0.5, -h] : [bend * 0.12, -h]
    const stem = cubic([0, 1.5], [bend * 0.5, -h * 0.34], [-bend, -h * 0.7], top, 24, [])
    const L = h * (tall ? 0.27 + r() * 0.07 : 0.4 + r() * 0.1)
    const leaf = (dir, at, size, turn) => {
      const b = stem[Math.round(at * 24)], s = (L * size) / 103
      const P = (lx, ly) => { const x0 = lx * dir * s, y0 = ly * s, c = Math.cos(turn * dir), sn = Math.sin(turn * dir); return [b[0] + c * x0 - sn * y0, b[1] + sn * x0 + c * y0] }
      const edge = cubic(P(0, 0), P(-34, -4), P(-64, -30), P(-74, -72), 12, [])
      cubic(P(-74, -72), P(-28, -76), P(2, -44), P(0, 0), 12, edge)
      const vein = cubic(P(-2, -4), P(-20, -22), P(-42, -40), P(-62, -64), 10, [])
      return [edge, vein]
    }
    const leaves = []
    if (kind === 'bud') {
      /* just up: the pair still half closed at the tip of the stem */
      leaves.push(leaf(flip, 1, 0.9, 0.5 + r() * 0.25), leaf(-flip, 0.96, 0.8 + r() * 0.15, 0.45 + r() * 0.3))
    } else {
      const t1 = 0.7 + r() * 0.1, t2 = Math.min(0.95, t1 + 0.09 + r() * 0.09)
      leaves.push(leaf(flip, t1, 1, (r() - 0.5) * 0.5), leaf(-flip, t2, 0.8 + r() * 0.22, (r() - 0.5) * 0.5))
      if (kind === 'three') leaves.push(leaf(r() < 0.5 ? flip : -flip, 0.4 + r() * 0.12, 0.5 + r() * 0.14, -0.15 - r() * 0.3))
    }
    const c = Math.cos(lean), s = Math.sin(lean)
    const lineOf = pts => measureLine(pts.map(([px, py]) => [c * px - s * py, s * px + c * py]))
    return {
      x: site.x, y: site.y, tall, kind, delay: r() * 0.3, toSun,
      stem: lineOf(stem), leaves: leaves.map(l => ({ edge: lineOf(l[0]), vein: lineOf(l[1]) })),
      sp: r() * TAU, sw: 0.9 + r() * 0.8, sa: (0.016 + r() * 0.014) * (tall ? 1 : 0.7),
    }
  }
  /* the sprouts come up through the paper: each has its foot on a piece, the bigger pieces carry two */
  function plantSprouts() {
    const r = mulberry((discSeed ^ 0x51ed27) >>> 0)
    const sites = []
    const room = (x, y) => x > 26 && x < VW - 26 && sites.every(o => Math.abs(o.x - x) >= 34)
    for (const p of pieces.slice().sort((a, b) => b.area - a.area)) {
      const want = p.share > 0.22 ? 2 : 1
      for (let j = 0, tries = 0; j < want && tries < 24; tries++) {
        const lx = lerp(p.x0, p.x1, 0.15 + r() * 0.7), ly = lerp(p.y0, p.y1, 0.15 + r() * 0.7)
        if (!insidePoly(lx, ly, p.xs, p.ys) || depthIn(p, lx, ly) < 5) continue
        const q = place({ a: p.la, b: p.lb, sq: FLAT * 0.95 }, lx - p.cx, ly - p.cy)
        const x = p.lx + q[0], y = p.ly + SINK + q[1]
        if (!room(x, y)) continue
        sites.push({ x, y }); j++
      }
      if (sites.length >= 7) break
    }
    /* a seed or two always lands beside the paper */
    for (let tries = 0; sites.length < 5 && tries < 80; tries++) {
      const x = 30 + r() * (VW - 60), y = soilY(x) + 5 + r() * Math.max(4, (bandLow() - soilY(x)) * 0.6)
      if (room(x, y)) sites.push({ x, y })
    }
    sites.sort((a, b) => a.x - b.x)
    let lastTall = -Infinity
    const first = r() < 0.5 ? 0 : 1
    sprouts = sites.map((site, i) => {
      const prev = sites[i - 1], next = sites[i + 1]
      site.away = !prev ? -1 : !next ? 1 : site.x - prev.x < next.x - site.x ? 1 : -1
      const tall = (i + first) % 2 === 0 && site.x - lastTall >= 64
      if (tall) lastTall = site.x
      return makeSprout(site, r, tall)
    })
    if (!sprouts.some(s => s.tall) && sprouts.length) sprouts[(sprouts.length / 2) | 0] = makeSprout(sites[(sprouts.length / 2) | 0], r, true)
    /* and beside the bigger pieces a late seedling comes up, still on its two seed leaves. It keeps clear of
       the stems, so nothing crosses */
    const late = []
    for (const p of pieces.slice().sort((a, b) => b.area - a.area)) {
      if (p.share < 0.12 || late.length >= 3) continue
      const side = r() < 0.5 ? -1 : 1
      for (const sd of [side, -side]) {
        const x = p.lx + sd * (p.hw * (0.75 + r() * 0.3) + 4), y = p.ly + p.hh * (0.1 + r() * 0.4)
        if (x < 22 || x > VW - 22 || y > bandLow() - 3) continue
        if (sites.some(o => Math.abs(o.x - x) < 17) || late.some(o => Math.abs(o.x - x) < 17)) continue
        late.push({ x, y }); break
      }
    }
    for (const site of late) sprouts.push(makeSprout(site, r, false, true))
    sprouts.sort((a, b) => a.y - b.y)                   // the far ones first
    over.stale = true
  }
  /* the sun's place along its arc, in frame units: up from behind the bed on the left, over, down on the right */
  function sunAt(u) {
    const r = Math.max(13, VH * 0.062)
    const x0 = VW * 0.1, x1 = VW * 0.9
    const e = easeInOut(u) * 0.5 + u * 0.5
    const x = lerp(x0, x1, e)
    const base = lerp(soilY(x0), soilY(x1), e) - cam + r + 4
    const apex = Math.max(VH * 0.16, hintBox ? hintBox.y1 + r + 8 : 0)
    return { x, y: base - Math.sin(Math.PI * e) * (base - apex), r }
  }
  /* how far along the arc the sun is when it waits for its cue: most of the way over the edge of the bed */
  function sunPeek() {
    for (let u = 0.02; u < 0.3; u += 0.005) { const s = sunAt(u); if (s.y <= soilY(s.x) - cam - s.r * 0.25) return u }
    return 0.12
  }
  function sunNow() {
    if (stageName !== 'sun' && stageName !== 'done') return null
    if (sunWait) return sunAt(sunPeek())
    if (reduced) return sunAt(0.5)                      // reduced motion: the sun does not travel
    const u = clamp(sunT / SUN_ARC, 0, 1)
    return u >= 1 ? null : sunAt(u)
  }
  function startSun() {
    if (stageName !== 'sun' || !sunWait) return
    sunWait = false
    sunT = sunPeek() * SUN_ARC
    stage.classList.remove('is-waiting')
    setHint(HINT.sun)
    syncBtn()
    if (reduced) finishSun()
    wake()
  }
  function finishSun() {
    growth = 1; sunT = SUN_ARC + GROW_AT + GROW_FOR; sunWait = false
    stage.classList.remove('is-waiting')
    if (stageName === 'sun') setStage('done')
  }
  /* the visitor's own sprouts have stood their beat: the photo comes back if there is one to show.
     "Plant another" works all through the beat; it starts over at once. */
  function endBeat() {
    if (stageName !== 'done' || beatOver) return
    beatOver = true
    if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) showPhoto()
  }
  /* is the button ready for a press? Not for a moment after the stage changes (a second press is a
     slip), and not while the sun is crossing by itself */
  const btnReady = () => !(stageName === 'sun' && !sunWait) && (!stageAt || performance.now() - stageAt >= lockFor)
  function syncBtn() {
    if (dead) return
    if (btnReady()) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true')
  }
  function showPhoto() {
    if (photo || stageName !== 'done') return
    photo = true
    figure.classList.add('is-photo')
    stage.setAttribute('aria-hidden', 'true')
    if (photoImg) { if (photoHidden == null) photoImg.removeAttribute('aria-hidden'); else photoImg.setAttribute('aria-hidden', photoHidden) }
    live.textContent = SAYS.photo
    clearSelection(true)                                // a sloppy drag may have left the hidden photo selected
  }
  /* let go of a selection a drag made by accident: any at all, or only one that reaches into the frame */
  function clearSelection(onlyFrame) {
    const sel = typeof getSelection === 'function' ? getSelection() : null
    if (sel && sel.rangeCount && !sel.isCollapsed && (!onlyFrame || sel.containsNode(figure, true))) sel.removeAllRanges()
  }

  /* ==========================================================================
     Stages
     ========================================================================== */
  function setHint(text) {
    hint.textContent = text || ''
    if (text && !reduced && seen && hint.animate) hint.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
  }
  function setStage(s, quiet) {
    stageName = s
    stageAt = quiet ? 0 : performance.now()
    lockFor = s === 'done' ? LOCK_DONE : LOCK
    stage.dataset.stage = s
    stage.setAttribute('aria-label', SHOWS[s])
    btn.textContent = ACTION[s]
    figure.classList.toggle('is-done', s === 'done')
    stage.classList.remove('is-over')
    pendingWater = false
    if (s === 'sun') {
      plantSprouts()
      growth = 0; sunFast = false
      sunWait = wateredBy === 'button'                  // on the button's path the sun waits for its own press
      sunT = sunWait ? sunPeek() * SUN_ARC : 0
      if (reduced && !sunWait) later(() => { if (stageName === 'sun') finishSun() }, 1600)
    } else sunWait = false
    stage.classList.toggle('is-waiting', sunWait)
    setHint(s === 'done' ? '' : sunWait ? HINT.held : HINT[s])
    if (s === 'done') {
      doneT = 0; growth = 1; beatOver = false
      if (reduced) later(endBeat, BEAT * 1000)
    }
    syncBtn()
    if (!quiet) later(syncBtn, lockFor + 20)
    if (!quiet) live.textContent = SAYS[s]
    if (steps) {
      const at = STAGES.indexOf(s)
      steps.forEach((li, i) => {
        li.classList.toggle('is-done', i < at)
        if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current')
      })
    }
    /* a press that is still held when the last piece goes in carries on as watering */
    if (s === 'water' && ptr.down && !ptr.lost && ptr.mode === 'press' && !reduced) {
      ptr.mode = 'water'; wateredBy = 'hand'
      pour = { x: ptr.x, y: ptr.y, n: 0, auto: false, t: -0.3 }
    }
    if (!quiet) figure.dispatchEvent(new CustomEvent('planting:stage', { bubbles: true, detail: { stage: s } }))
    if (W) measure()                                    // the label changed, so the button did
    wake()
  }
  /* what the button does. Each press performs the stage in play; a press that comes before the paper
     is ready for it (water while pieces are still going in) waits its turn instead of running over it. */
  function act() {
    if (dead || !W || !pieces.length) return
    poke()
    endPeek()
    if (stageName === 'tear') autoTear()
    else if (stageName === 'press') pressAll()
    else if (stageName === 'water') { if (reduced || bedded()) autoWater(); else pendingWater = true }
    else if (stageName === 'sun') { if (sunWait) startSun(); else sunFast = true }       // already up: it hurries, it does not jump
    else reset()
    wake()
  }
  /* the button itself is a little more careful than act(): while it rests (just after a stage change,
     or while the sun crosses by itself) it says so, and a press does nothing */
  function onButton() {
    syncBtn()
    if (btn.getAttribute('aria-disabled') === 'true') return
    act()
  }
  function reset() {
    if (dead) return
    for (const id of [...timers]) drop(id)
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    ptr.down = false; ptr.late = false; ptr.id = -1; ptr.mode = ''; ptr.held.length = 0; ptr.anchors.clear(); ptr.carry = null
    rips.clear()
    stage.classList.remove('is-held', 'is-over')
    endPeek()
    photo = false
    figure.classList.remove('is-photo', 'was-peek')
    stage.removeAttribute('aria-hidden')
    if (photoImg) photoImg.setAttribute('aria-hidden', 'true')
    water = 0; fell = 0; growth = 0; sunT = 0; doneT = 0; pour = null; sunWait = false; sunFast = false; beatOver = false; snappedTotal = 0
    wateredBy = 'hand'; pendingWater = false
    cam = 0; camTo = 0; laid = 0; idle = 0; swayK = 1
    wet.fill(0); wetLayer.stale = true; sprouts = []; drops = []; bits = []
    over.stale = true
    discSeed = (rand() * 0xffffffff) >>> 0
    setStage('tear')
    if (W) newDisc(true)
    wake()
  }

  /* ==========================================================================
     Pointer: drag to tear, press to plant, hold to water
     ========================================================================== */
  const ptr = { down: false, id: -1, mode: '', touch: false, late: false, armed: false, lost: false, x: 0, y: 0, sx: 0, sy: 0, cx: 0, cy: 0, cx0: 0, cy0: 0, travel: 0, t0: 0, lt: 0, vx: 0, vy: 0, held: [], lastPress: null, anchors: new Map(), carry: null }
  function toStage(cx, cy) {
    const r = stage.getBoundingClientRect()
    return [((cx - r.left) / (r.width || 1)) * VW, ((cy - r.top) / (r.height || 1)) * VH + cam]
  }
  const stagePoint = e => toStage(e.clientX, e.clientY)
  /* somebody is here: paper in the hand sways again */
  function poke() { idle = 0; wake() }
  /* this was not a tear after all (a second finger came down, or the browser took the touch) */
  function dropGesture() {
    ptr.lost = true; ptr.held.length = 0; ptr.anchors.clear()
    for (const [p, r] of [...rips]) if (!r.X) { rips.delete(p); p.tugx = p.tugy = 0 }
    if (pour && !pour.auto) pour = null
    if (ptr.carry) dropCarry()                          // a piece in the hand comes down where it is
  }
  /* is a mouse over paper it can work on? Then, and only then, the cursor says so */
  function hover(x, y) {
    let over = false
    if (stageName === 'tear') {
      for (const p of pieces) {
        if (!p.held) continue
        const [lx, ly] = toLocal(p, x, y)
        if (insidePoly(lx, ly, p.xs, p.ys)) { over = true; break }
      }
    } else if (stageName === 'press') over = pieces.some(p => !p.want && !p.pressing && p.press < 1 && !p.loose && under(p, x, y))
    stage.classList.toggle('is-over', over)
  }
  /* the photo is back: press and hold on it to look at your own sprouts again */
  function onPeek(e) {
    if (!photo || dead || peeking >= 0 || e.target === btn || btn.contains(e.target)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    peeking = e.pointerId
    try { figure.setPointerCapture(e.pointerId) } catch { /* fine */ }
    figure.classList.add('is-peek', 'was-peek')
  }
  function endPeek(e) {
    if (peeking < 0 || (e && e.pointerId !== peeking)) return
    peeking = -1
    figure.classList.remove('is-peek')
  }
  function onDown(e) {
    if (dead || photo) return
    poke()
    if (ptr.down) {
      if (e.pointerId !== ptr.id) { dropGesture(); return }        // a second finger: this is not a tear
      dropGesture(); letUp()                                       // the same pointer again: its release never reached us
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    begin(e, false)
  }
  /* a gesture starts: on a press on the stage, or (late) when a mouse comes in from outside the frame
     with its button already down, the way a drag that starts a little wide of the paper does */
  function begin(e, late) {
    const [x, y] = stagePoint(e)
    ptr.down = true; ptr.id = e.pointerId; ptr.mode = stageName; ptr.touch = e.pointerType === 'touch'
    /* a mouse or a pen is ours from the first move. A finger has to show which way it is going first:
       sideways tears, presses and waters; up or down is the page scrolling and does nothing here. */
    ptr.armed = !ptr.touch; ptr.lost = false; ptr.held.length = 0; ptr.lastPress = null; ptr.anchors.clear()
    ptr.x = ptr.sx = x; ptr.y = ptr.sy = y; ptr.cx = ptr.cx0 = e.clientX; ptr.cy = ptr.cy0 = e.clientY
    ptr.late = late; ptr.travel = late ? 99 : 0; ptr.t0 = ptr.lt = performance.now(); ptr.vx = ptr.vy = 0
    try { stage.setPointerCapture(e.pointerId) } catch { /* fine */ }
    if (late) clearSelection(false)                        // whatever the drag began to select outside the frame is let go
    else if (!ptr.touch) e.preventDefault()             // a mouse drag selects nothing; a touch may still scroll
    stage.classList.add('is-held')
    if (ptr.mode === 'tear') {
      /* a drag that begins on the paper: the rip will come in from the edge behind it */
      for (const p of pieces) {
        if (!tearable(p)) continue
        const [lx, ly] = toLocal(p, x, y)
        if (insidePoly(lx, ly, p.xs, p.ys)) ptr.anchors.set(p, [lx, ly])
      }
    } else if (ptr.mode === 'press') {
      if (!ptr.touch) pressAt(x, y)                    // a finger presses when it lifts, once it is clearly not a scroll
    } else if (ptr.mode === 'water') {
      if (reduced) { if (!ptr.touch) soak(false) }     // reduced motion: a press waters it
      else { wateredBy = 'hand'; pour = { x, y, n: 0, auto: false, t: ptr.touch ? -0.09 : 0 } }
    } else if (ptr.mode === 'sun') {
      if (sunWait && !ptr.touch) startSun()
    }
    wake()
  }
  /* one stretch of a drag, from (px, py) to (x, y) in stage units */
  function work(px, py, x, y) {
    if (ptr.mode !== stageName) return                 // the stage moved on under this gesture
    if (ptr.mode === 'tear') { if (!ptr.carry) tearAlong(px, py, x, y) }      // a hand holding a piece tears nothing more
    else if (ptr.mode === 'press') {
      if (!ptr.lastPress || Math.hypot(x - ptr.lastPress[0], y - ptr.lastPress[1]) > 5) { ptr.lastPress = [x, y]; pressAt(x, y, true) }
    } else if (ptr.mode === 'water' && pour && !pour.auto) { pour.x = x; pour.y = y }
  }
  function onMove(e) {
    if (!photo && idle > 0.5) poke()
    if (!ptr.down && !dead && !photo && e.pointerType !== 'touch' && (e.buttons & 1) && (stageName === 'tear' || stageName === 'press' || stageName === 'water')) { begin(e, true); return }
    if (!ptr.down && !dead && !photo && e.pointerType !== 'touch') { const [hx, hy] = stagePoint(e); hover(hx, hy) }
    if (!ptr.down || e.pointerId !== ptr.id) return
    if (e.pointerType !== 'touch' && !(e.buttons & 1)) { onUp(e); return }       // let go somewhere we never heard about
    idle = 0
    const [x, y] = stagePoint(e)
    const now = performance.now(), dt = Math.max(1, now - ptr.lt) / 1000
    ptr.travel += Math.hypot(e.clientX - ptr.cx, e.clientY - ptr.cy)
    ptr.cx = e.clientX; ptr.cy = e.clientY
    ptr.vx += ((x - ptr.x) / dt - ptr.vx) * 0.5; ptr.vy += ((y - ptr.y) / dt - ptr.vy) * 0.5
    ptr.lt = now
    const px = ptr.x, py = ptr.y
    ptr.x = x; ptr.y = y
    if (ptr.lost) return
    if (ptr.carry && reduced) {
      /* nothing travels by itself under reduced motion, but a piece in the hand still goes where the hand goes */
      const c = ptr.carry
      c.x = x + c.gx; c.y = y + c.gy; c.sq = y > soilY(x) - 4 ? 0.7 : 1
    }
    if (!ptr.armed) {
      ptr.held.push([x, y])
      const dx = e.clientX - ptr.cx0, dy = e.clientY - ptr.cy0
      if (Math.hypot(dx, dy) < 9) return
      if (Math.abs(dy) > Math.abs(dx)) { dropGesture(); return }     // up or down: this is the page being scrolled
      ptr.armed = true
      let ax = ptr.sx, ay = ptr.sy
      for (const [hx, hy] of ptr.held) { work(ax, ay, hx, hy); ax = hx; ay = hy }
      ptr.held.length = 0
    } else work(px, py, x, y)
    wake()
  }
  function onUp(e) {
    if (!ptr.down || e.pointerId !== ptr.id) return
    if (ptr.mode === stageName && !ptr.lost) {
      const tap = performance.now() - ptr.t0 < 650 && ptr.travel < 7
      if (ptr.carry) dropCarry()                         // the hand opens over the bed: the piece comes down there
      else if (ptr.mode === 'tear') endTear(tap)
      else if (ptr.mode === 'press') { if (ptr.touch && !ptr.armed) pressAt(ptr.x, ptr.y) }
      else if (ptr.mode === 'water') { if (reduced && ptr.touch) soak(false) }
      else if (ptr.mode === 'sun') { if (sunWait && ptr.touch) startSun() }
    }
    letUp()
  }
  function onCancel(e) {
    if (ptr.carry && ptr.down && (!e || e.pointerId === ptr.id)) dropCarry()
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return
    dropGesture()                                      // the browser took the touch to scroll: nothing tears
    letUp()
  }
  function letUp() {
    if (ptr.late) clearSelection(false)
    ptr.late = false; ptr.down = false; ptr.id = -1; ptr.mode = ''; ptr.held.length = 0; ptr.anchors.clear()
    if (pour && !pour.auto) pour = null
    stage.classList.remove('is-held')
    wake()
  }
  function tearAlong(ax, ay, bx, by) {
    /* a rip the hand has already left is still running: if this move reaches its paper again, it is finished first */
    for (const r of [...rips.values()]) {
      if (!r.X || rips.get(r.p) !== r) continue
      const p = r.p
      const [lax, lay] = toLocal(p, ax, ay), [lbx, lby] = toLocal(p, bx, by)
      if (insidePoly(lbx, lby, p.xs, p.ys) || crossings(p, lax, lay, lbx, lby).length) rush(r)
    }
    for (const p of pieces.slice()) {
      if (stageName !== 'tear') return
      if (!p.held || !pieces.includes(p)) continue
      const [lbx, lby] = toLocal(p, bx, by)
      const r = rips.get(p)
      if (r) {
        if (r.X) continue
        const from = r.raw[r.raw.length - 1]
        const out = crossings(p, from[0], from[1], lbx, lby)[0]
        if (out) seal(r, out, 300)                     // out the far side: the rip runs after the hand and the paper gives
        else {
          feed(r, lbx, lby)
          if (reduced) { if (!r.planned && r.head >= 7) plan(r); if (r.planned && !r.dead) moveTip(r, r.head - r.tip) }
        }
        continue
      }
      const anchor = ptr.anchors.get(p)
      if (anchor) {
        /* it began on the paper: once the hand shows its way, the rip comes in from the edge behind it */
        const out = crossings(p, anchor[0], anchor[1], lbx, lby)[0]
        const dx = (out ? out.x : lbx) - anchor[0], dy = (out ? out.y : lby) - anchor[1], L = Math.hypot(dx, dy)
        if (!out && L < 5) continue
        ptr.anchors.delete(p)
        if (L < 1e-3 || !tearable(p)) continue
        const back = crossings(p, anchor[0], anchor[1], anchor[0] - (dx / L) * 4000, anchor[1] - (dy / L) * 4000)[0]
        if (!back) continue
        const fresh = openRip(p, back)
        feed(fresh, anchor[0], anchor[1])
        rips.set(p, fresh)
        if (out) seal(fresh, out, 380); else { feed(fresh, lbx, lby); if (reduced) { plan(fresh); if (!fresh.dead) moveTip(fresh, fresh.head) } }
        continue
      }
      if (!tearable(p)) continue
      const [lax, lay] = toLocal(p, ax, ay)
      const hits = crossings(p, lax, lay, lbx, lby)
      if (!hits.length) continue
      if (insidePoly(lbx, lby, p.xs, p.ys)) {
        /* the drag has come onto this piece: a rip opens at the edge */
        const fresh = openRip(p, hits[hits.length - 1])
        feed(fresh, lbx, lby)
        rips.set(p, fresh)
      } else if (hits.length >= 2) {
        /* fast enough to cross it in one move: the rip still has to run the whole way */
        const fresh = openRip(p, hits[hits.length % 2 ? 1 : 0])
        rips.set(p, fresh)
        seal(fresh, hits[hits.length - 1], 420)
      }
    }
  }
  function endTear(tap) {
    let torn = false
    for (const [p, r] of [...rips]) {
      if (r.X) { torn = true; continue }               // already on its way out
      /* let go part way across: the rip runs on to the edge the way it was heading */
      if (!tap) { if (runOn(r)) torn = true; continue }
      rips.delete(p); p.tugx = p.tugy = 0
    }
    if (torn || stageName !== 'tear' || !(tap || ptr.travel < 14)) return
    /* a tap: one rip through that spot, at whatever angle the paper gives */
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]
      if (!tearable(p)) continue
      const [lx, ly] = toLocal(p, ptr.x, ptr.y)
      if (insidePoly(lx, ly, p.xs, p.ys)) { tapTear(p, lx, ly); return }
    }
    /* a fingertip just off the edge still counts: the nearest paper in the hand within a few pixels */
    let near = null, best = 12 / k
    for (const p of pieces) {
      if (!tearable(p)) continue
      const [lx, ly] = toLocal(p, ptr.x, ptr.y), d = depthIn(p, lx, ly)
      if (d < best) { best = d; near = [p, lx, ly] }
    }
    if (near) {
      const [p, lx, ly] = near, dx = p.cx - lx, dy = p.cy - ly, L = Math.hypot(dx, dy) || 1
      tapTear(p, lx + (dx / L) * (best + 3), ly + (dy / L) * (best + 3))
    }
  }

  /* ==========================================================================
     The frame loop: it runs only while the stage is on screen and something moves.
     There is one chain of frames, never two: nothing can ask for a frame while one is running.
     ========================================================================== */
  function busy() {
    if (reduced) return false
    if (intro < 1 || pour || drops.length || bits.length || wetMoving || rips.size || pendingWater) return true
    if (Math.abs(Math.min(camTo, camCap()) - cam) > 0.01) return true
    if (stageName === 'sun' && !sunWait) return true
    if (stageName === 'done' && !photo && doneT < BEAT + 5) return true       // the sprouts sway, then stand still
    for (const p of pieces) {
      if (p.loose || p.settling || p.pressing || p.want || p.prev || p.carried) return true
      if (p.held && (swayK > 0.002 || idle < IDLE + 1.5 || Math.abs(p.vx) + Math.abs(p.vy) > 0.4 || Math.abs(p.w) > 0.004)) return true
    }
    return false
  }
  function wake() {
    if (raf || inFrame || dead || !inView) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function frame(now) {
    raf = 0
    if (dead) return
    inFrame = true
    try {
      const dt = clamp((now - last) / 1000, 0.001, 0.05)
      last = now
      const t0 = performance.now()
      if (!reduced) update(dt)
      draw()
      cost += (performance.now() - t0 - cost) * 0.1
      frames++
    } finally { inFrame = false }
    if (inView && !dead && busy()) raf = requestAnimationFrame(frame)
  }
  function update(dt) {
    clock += dt
    idle += dt
    /* a piece in the hand stays under the hand even while the view or the page moves under a still pointer */
    if (ptr.carry && ptr.down) { const q = toStage(ptr.cx, ptr.cy); ptr.x = q[0]; ptr.y = q[1] }
    swayK += ((idle < IDLE ? 1 : 0) - swayK) * Math.min(1, dt * 1.6)
    if (intro < 1) intro = Math.min(1, intro + dt / 0.75)
    /* the view follows the first loose paper down to the bed, and stays there */
    if (camTo < camMax) {
      let down = 0
      for (const p of pieces) if (!p.held && !p.carried && p.hold <= 0) down = Math.max(down, p.loose ? p.prog : 1)
      camTo = Math.max(camTo, camMax * easeInOut(clamp(down * 1.2, 0, 1)))
    }
    const aim = Math.min(camTo, camCap())
    if (cam !== aim) { cam += (aim - cam) * (1 - Math.exp(-dt * 7)); if (Math.abs(aim - cam) < 0.04) cam = aim; over.stale = true }

    /* the rips run after the hand; the paper is pulled toward it while they lag, and opens wider under the pull */
    for (const r of [...rips.values()]) {
      if (rips.get(r.p) !== r) continue
      advance(r, dt)
      const p = r.p
      if (rips.get(p) !== r) continue
      let tx = 0, ty = 0
      if (!r.X && ptr.down && !ptr.lost) {
        const [wx, wy] = toWorld(p, r.lastX, r.lastY)
        const dx = ptr.x - wx, dy = ptr.y - wy, d = Math.hypot(dx, dy)
        if (d > 0.5) { const pull = Math.min(8, d * 0.3); tx = (dx / d) * pull; ty = (dy / d) * pull }
      }
      p.tugx += (tx - p.tugx) * Math.min(1, dt * 16); p.tugy += (ty - p.tugy) * Math.min(1, dt * 16)
      const want = (0.08 + 0.12 * r.tens) * Math.min(1, r.tip / 12)
      r.open += (want - r.open) * Math.min(1, dt * 14)
      snapBridges(r)
    }

    acc += dt
    let n = 0
    while (acc >= DT && n < 8) { sim(DT); acc -= DT; n++ }
    if (n === 8) acc = 0
    for (const p of pieces) if (p.prev) { p.fade += dt / (p.fadeOut ? 0.5 : 0.22); if (p.fade >= 1) { p.fade = 1; p.prev = null; p.fadeOut = false } }

    /* water: droplets fall from the hand, or sweep across on their own for the button */
    if (pendingWater && stageName === 'water' && bedded()) { pendingWater = false; autoWater() }
    if (pour) {
      pour.t += dt
      const rate = pour.auto ? NEED / 0.95 : 42
      if (pour.t > 0) pour.n += rate * dt
      if (pour.auto) pour.x = VW * (0.14 + 0.72 * clamp(pour.t / 1.0, 0, 1))
      while (pour.n >= 1) { pour.n--; spawnDrop(pour.x + (rand() - 0.5) * (pour.auto ? 60 : 34), pour.auto ? null : pour.y - 8, pour.auto ? null : pour.y) }
      if (stageName !== 'water' || (pour.auto && pour.t > 1.0)) pour = null
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.vy += 760 * dt; d.y += d.vy * dt
      if (d.y < d.fy) continue
      drops.splice(i, 1)
      wetAt(d.x, d.fy, 0.24)
      bits.push({ k: 4, x: d.x, y: d.fy, fy: 0, vx: 0, vy: 0, a: 0, va: 0, r: 1.6 + rand() * 1.6, life: 0, max: 0.42, col: pal.sage })
      if (rand() < 0.6) bits.push({ k: 3, x: d.x, y: d.fy - 1, fy: d.fy, vx: (rand() - 0.5) * 70, vy: -50 - rand() * 60, a: 0, va: 0, r: 0.5 + rand() * 0.5, life: 0, max: 0.5, col: pal.sage3 })
      if (stageName === 'water') { fell++; water = Math.min(1, fell / NEED) }
    }
    if (stageName === 'water' && water >= 1) setStage('sun')

    /* damp patches spread; once the watering is done the whole bed evens out */
    let moving = false
    const even = stageName === 'sun' || stageName === 'done'
    if (water > 0 && (even || pour || drops.length)) {                // between pours the patches keep their shape
      wetTmp.set(wet)
      for (let i = 0; i < wet.length; i++) {
        const c = i % WET_COLS, r = (i - c) / WET_COLS
        const a = wetTmp[c > 0 ? i - 1 : i], b = wetTmp[c < WET_COLS - 1 ? i + 1 : i]
        const u = wetTmp[r > 0 ? i - WET_COLS : i], d = wetTmp[r < WET_ROWS - 1 ? i + WET_COLS : i]
        let v = wet[i] + ((a + b) * 0.3 + (u + d) * 0.2 - wet[i]) * Math.min(1, dt * 4)
        if (even) v += (0.86 - v) * Math.min(1, dt * 1.6)
        if (Math.abs(v - wet[i]) > 0.001) moving = true
        wet[i] = v
      }
    }
    wetMoving = moving
    if (moving) wetLayer.stale = true

    /* crumbs, fibres, seeds, splashes, rings */
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]
      b.life += dt
      if (b.k === 1) { b.vx *= Math.exp(-3 * dt); b.vy = b.vy * Math.exp(-3 * dt) + 150 * dt; b.a += b.va * dt }
      else if (b.k !== 4) { b.vy += (b.k === 0 ? 760 : b.k === 2 ? 620 : 700) * dt; b.a += b.va * dt }
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.life >= b.max || (b.k !== 1 && b.k !== 4 && b.vy > 0 && b.y > b.fy)) bits.splice(i, 1)
    }

    if (stageName === 'sun' && !sunWait) {
      /* a press while the sun is already up hurries it: the rest plays in about a second */
      const left = SUN_ARC + 0.4 - sunT
      sunT += dt * (sunFast ? Math.max(3.2, left / 0.9) : 1)
      growth = clamp((sunT - GROW_AT) / GROW_FOR, 0, 1)
      if (growth >= 1) setStage('done')
    } else if (stageName === 'done' && !photo) {
      doneT += dt
      if (doneT >= BEAT) endBeat()
    }
  }

  /* ---------- drawing ---------- */
  /* a piece's sprite, inside a transform whose origin is the centre of the piece */
  function sprite(p) {
    if (p.prev && p.fadeOut) {
      /* less loose fibre: the new face, and the old one fading off it */
      ctx.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh)
      const ga = ctx.globalAlpha
      ctx.globalAlpha = ga * clamp(1 - p.fade, 0, 1)
      ctx.drawImage(p.prev, p.sx, p.sy, p.sw, p.sh)
      ctx.globalAlpha = ga
    } else if (p.prev) {
      ctx.drawImage(p.prev, p.sx, p.sy, p.sw, p.sh)
      const ga = ctx.globalAlpha
      ctx.globalAlpha = ga * clamp(p.fade, 0, 1)
      ctx.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh)
      ctx.globalAlpha = ga
    } else ctx.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh)
  }
  const pose = p => { ctx.rotate(p.b); ctx.scale(1, p.sq); ctx.rotate(p.a - p.b) }

  /* Fibre bridges. Behind the tip of a running rip the gap opens a little more the further back it
     is, and every second point of the new edge has a fibre still reaching across it. Each has its own
     stretch: it thins as the gap widens, and past its limit it snaps and both ends curl back onto
     their lips (now and then a seed shakes loose). */
  const bridgeHash = (r, id) => (((Math.imul((id + 1) ^ r.seed, 2654435761) >>> 0) % 1000) / 1000)
  const bridgeLim = (r, id) => 1.1 + bridgeHash(r, id) * 3
  function behind(r, pt) { return (r.lastX - pt.x) * r.ux + (r.lastY - pt.y) * r.uy }
  function snapBridges(r) {
    if (!r.open || r.X && r.head - r.tip < 0.01) return
    const pts = r.pts
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i]
      if (pt.id % BRIDGE || r.gone.has(pt.id)) continue
      const sa = behind(r, pt)
      if (sa < 0.5) continue
      const gap = r.open * sa
      if (gap < bridgeLim(r, pt.id)) continue
      r.gone.add(pt.id)
      snappedTotal++
      r.snaps.push({ id: pt.id, t: clock })
      if (r.snaps.length > 24) r.snaps.shift()
      if (!reduced && !r.quiet) {
        const [wx, wy] = toWorld(r.p, pt.x, pt.y)
        if (rand() < 0.35) bits.push({ k: 1, x: wx, y: wy, fy: 0, vx: (rand() - 0.5) * 40, vy: -8 - rand() * 26, a: rand() * TAU, va: (rand() - 0.5) * 8, r: 1 + rand() * 1.8, life: 0, max: 0.35 + rand() * 0.35, col: rand() < 0.5 ? pal.jute : pal.paper3 })
        if (rand() < 0.16) bits.push({ k: 2, x: wx, y: wy, fy: soilY(wx) + 4 + rand() * 30, vx: (rand() - 0.5) * 30, vy: -6 - rand() * 20, a: rand() * TAU, va: (rand() - 0.5) * 6, r: 0.9 + rand() * 0.5, life: 0, max: 4, col: pal.ink })
      }
    }
  }
  function drawBridges(p, r) {
    const pts = r.pts, sideA = r.A.side, nx = -r.uy, ny = r.ux, hx = r.ux, hy = r.uy
    const stroke = (x0, y0, cx, cy, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke() }
    let live = 0
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i]
      if (pt.id % BRIDGE) continue
      const sa = behind(r, pt)
      if (sa < 0.5) continue
      const half = (r.open * sa) / 2, lim = bridgeLim(r, pt.id), hsh = bridgeHash(r, pt.id)
      const ax = pt.x - p.cx + nx * half * sideA, ay = pt.y - p.cy + ny * half * sideA
      const slide = (hsh - 0.5) * 2.4                     // a fibre never crosses square to the edge
      const bx = pt.x - p.cx - nx * half * sideA + hx * slide, by = pt.y - p.cy - ny * half * sideA + hy * slide
      if (!r.gone.has(pt.id)) {
        const u = clamp((2 * half) / lim, 0, 1)
        if (2 * half < 0.15) continue
        live++
        const w = (0.55 + 0.45 * hsh) * (1 - 0.6 * u), sag = (1 - u) * 0.5
        const mx = (ax + bx) / 2 + hx * sag, my = (ay + by) / 2 + hy * sag
        stroke(ax + 0.3, ay + 0.6, mx + 0.3, my + 0.6, bx + 0.3, by + 0.6, w + 0.35, rgba(pal.ink, 0.36 * (1 - 0.4 * u)))
        stroke(ax, ay, mx, my, bx, by, w, hsh < 0.7 ? rgba(pal.paper, 0.95) : rgba(pal.paper3, 0.95))
        continue
      }
      /* snapped: the two ends spring back and curl onto their lips, then lie down among the edge's own fibres */
      const sn = r.snaps.find(o => o.id === pt.id)
      if (!sn) continue
      const age = clock - sn.t
      if (age > 0.6) continue
      const e = easeOut(clamp(age / 0.16, 0, 1)), fade = clamp((0.6 - age) / 0.3, 0, 1)
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d
      const len = lim * 0.5 * (1 - 0.55 * e), curl = (hsh - 0.5) * 2.2 * e
      const col = rgba(pal.paper, 0.9 * fade), w = 0.36 + 0.3 * hsh
      stroke(ax, ay, ax + ux * len * 0.6 + hx * curl, ay + uy * len * 0.6 + hy * curl, ax + ux * len + hx * curl * 1.6, ay + uy * len + hy * curl * 1.6, w, col)
      stroke(bx, by, bx - ux * len * 0.6 - hx * curl, by - uy * len * 0.6 - hy * curl, bx - ux * len - hx * curl * 1.6, by - uy * len - hy * curl * 1.6, w, col)
    }
    r.live = live
  }

  /* a rip in progress is drawn as what it is: the two sides of the paper, each cut from the sheet
     and dressed like a finished torn edge, swung apart about the tip. Ahead of the tip the sheet is whole. */
  function prepRip(r) {
    r.stale = false; r.ok = false
    const p = r.p
    if (r.tip < 1.2 || !p.sprite) return
    const tx = r.lastX, ty = r.lastY
    let X = r.X && r.head - r.tip < 0.6 ? r.X : crossings(p, tx, ty, tx + r.ux * 4000, ty + r.uy * 4000)[0]
    if (!X) X = r.X
    if (!X) return
    const q = [], n = r.pts.length
    for (let i = 0; i < n; i++) {
      const pt = r.pts[i], e = Math.min(1, (i + 1) / 3)
      let x = pt.bx + (pt.x - pt.bx) * e, y = pt.by + (pt.y - pt.by) * e
      if (!insidePoly(x, y, p.xs, p.ys)) { x = pt.bx; y = pt.by }
      if (!insidePoly(x, y, p.xs, p.ys)) continue
      q.push([x, y, pt.id])
    }
    const lastQ = q[q.length - 1]
    if (insidePoly(tx, ty, p.xs, p.ys) && (!lastQ || Math.hypot(lastQ[0] - tx, lastQ[1] - ty) > 0.7) && Math.hypot(X.x - tx, X.y - ty) > 0.7) q.push([tx, ty, LAST - 1])
    const res = carve(p, r.E, X, q, r.seed, r.wideA, 0)
    if (!res || res === 'tangled') return
    const halves = [res.A, res.B], keys = ['ca', 'cb']
    for (let h = 0; h < 2; h++) {
      const half = halves[h]
      const c = r[keys[h]] || (r[keys[h]] = document.createElement('canvas'))
      if (c.width !== p.sprite.width || c.height !== p.sprite.height) { c.width = p.sprite.width; c.height = p.sprite.height }
      const g = c.getContext('2d')
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, c.width, c.height)
      g.setTransform(S, 0, 0, S, (M - p.x0) * S, (M - p.y0) * S)
      paintPaper(g, half)
      let mx = 0, my = 0
      for (let i = 0; i < half.xs.length; i++) { mx += half.xs[i]; my += half.ys[i] }
      mx /= half.xs.length; my /= half.xs.length
      half.side = (mx - tx) * -r.uy + (my - ty) * r.ux >= 0 ? 1 : -1
    }
    if (res.A.side === res.B.side) res.B.side = -res.A.side
    r.A = res.A; r.B = res.B; r.ok = true
  }
  function drawRip(p, r) {
    if (r.stale) prepRip(r)
    if (!r.ok) { sprite(p); return }
    const tx = r.lastX - p.cx, ty = r.lastY - p.cy, hx = r.ux, hy = r.uy, nx = -hy, ny = hx, F = 900
    const halfPlane = (sign, lap) => {
      /* everything ahead of (sign 1) or behind (sign -1) the line across the tip */
      const bx = tx - hx * lap * sign, by = ty - hy * lap * sign
      ctx.beginPath()
      ctx.moveTo(bx + nx * F, by + ny * F); ctx.lineTo(bx - nx * F, by - ny * F)
      ctx.lineTo(bx - nx * F + hx * F * sign, by - ny * F + hy * F * sign); ctx.lineTo(bx + nx * F + hx * F * sign, by + ny * F + hy * F * sign)
      ctx.closePath()
      ctx.clip()
    }
    ctx.save()
    halfPlane(1, 0.7)
    sprite(p)
    ctx.restore()
    const hT = hx * tx + hy * ty
    /* the side that kept the bevel lies under; the other has lifted a little and throws a thin shade on it */
    const halves = r.wideA ? [r.A, r.B] : [r.B, r.A], cs = r.wideA ? [r.ca, r.cb] : [r.cb, r.ca]
    for (let h = 0; h < 2; h++) {
      const kq = (halves[h].side * r.open) / 2
      ctx.save()
      halfPlane(-1, 0)
      ctx.transform(1 - kq * nx * hx, -kq * ny * hx, -kq * nx * hy, 1 - kq * ny * hy, kq * nx * hT, kq * ny * hT)
      if (h === 1) { ctx.shadowColor = rgba(pal.ink, 0.34); ctx.shadowBlur = 2.4 * S; ctx.shadowOffsetX = 0.6 * S; ctx.shadowOffsetY = 1.6 * S }
      ctx.drawImage(cs[h], p.sx, p.sy, p.sw, p.sh)
      ctx.restore()
    }
    /* behind the tip the last fibres still reach across, stretching, and snap one after another */
    drawBridges(p, r)
  }
  function drawHeld(p) {
    if (!p.sprite || !p.shadow) return
    const f = p.whole ? easeOut(intro) : 1
    const lift = p.whole ? (1 - f) * -14 : 0, sc = p.whole ? 0.92 + 0.08 * f : 1
    ctx.save()
    ctx.translate(p.x + 3.5, p.y + lift + 9.5)
    ctx.rotate(p.a)
    if (sc !== 1) ctx.scale(sc, sc)
    ctx.globalAlpha = 0.3 * f
    ctx.drawImage(p.shadow, p.shx, p.shy, p.shw, p.shh)
    ctx.restore()
    ctx.save()
    ctx.translate(p.x, p.y + lift)
    ctx.rotate(p.a)
    if (sc !== 1) ctx.scale(sc, sc)
    ctx.globalAlpha = f
    const r = rips.get(p)
    if (r) drawRip(p, r); else sprite(p)
    ctx.restore()
  }
  function drawFalling(p) {
    if (!p.sprite || !p.shadow) return
    const g = p.prog
    ctx.save()
    ctx.translate(p.x + lerp(3.5, 1.2, g), p.y + lerp(9.5, 2, g))
    pose(p)
    ctx.globalAlpha = lerp(0.3, 0.55, g)
    ctx.drawImage(p.shadow, p.shx, p.shy, p.shw, p.shh)
    ctx.restore()
    ctx.save()
    ctx.translate(p.x, p.y)
    pose(p)
    sprite(p)
    ctx.restore()
  }
  function drawLying(p) {
    if (!p.sprite || !p.shadow) return
    const e = clamp(p.press, 0, 1), sink = SINK * p.press
    if (e < 1) {
      /* on the bed its shadow is close under it; pressed in, there is none */
      ctx.save()
      ctx.translate(p.x + 1.2, p.y + 2 + sink)
      pose(p)
      ctx.globalAlpha = 0.55 * (1 - e)
      ctx.drawImage(p.shadow, p.shx, p.shy, p.shw, p.shh)
      ctx.restore()
    }
    ctx.save()
    ctx.translate(p.x, p.y + sink)
    ctx.rotate(p.b); ctx.scale(1, p.sq * (1 - 0.05 * e)); ctx.rotate(p.a - p.b)
    sprite(p)
    const damp = water > 0 ? wetNear(p.x, p.y) : 0
    if (damp > 0.02) {
      if (!p.damp) bakeDamp(p)
      ctx.globalAlpha = damp * 0.24
      ctx.drawImage(p.damp, p.sx, p.sy, p.sw, p.sh)
    }
    ctx.restore()
    if (e > 0 && p.bury) {
      ctx.globalAlpha = e
      ctx.drawImage(p.bury, p.x + p.bx, p.y + SINK + p.by, p.bw, p.bh)
      ctx.globalAlpha = 1
    }
  }
  function strokePart(g, line, frac) {
    if (frac <= 0) return
    const pts = line.pts, len = line.len, lim = len[len.length - 1] * Math.min(1, frac)
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) {
      if (len[i] <= lim) { g.lineTo(pts[i][0], pts[i][1]); continue }
      const t = (lim - len[i - 1]) / (len[i] - len[i - 1] || 1)
      g.lineTo(lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t))
      break
    }
    g.stroke()
  }
  /* sprouts: drawn on, stem first, then the leaves, then their veins; once up they sway a degree or two */
  function drawSprouts(g, col) {
    g.lineCap = 'round'; g.lineJoin = 'round'
    g.strokeStyle = css(col)
    const lean = easeInOut(clamp((growth - 0.5) / 0.5, 0, 1))
    for (const s of sprouts) {
      const t = clamp((growth - s.delay) / Math.min(0.7, 1 - s.delay), 0, 1)
      if (t <= 0) continue
      const thin = s.tall ? 1 : s.kind === 'seed' ? 0.72 : 0.8
      g.save()
      g.translate(s.x, s.y)
      const sway = reduced ? 0 : (Math.sin(clock * s.sw + s.sp) + 0.4 * Math.sin(clock * s.sw * 2.3 + s.sp * 2)) * s.sa * t * swayOut()
      g.rotate(sway + s.toSun * lean)
      g.lineWidth = 1.9 * thin
      strokePart(g, s.stem, easeOut(clamp(t / 0.62, 0, 1)))
      s.leaves.forEach((leaf, i) => {
        g.lineWidth = 1.55 * thin
        strokePart(g, leaf.edge, easeInOut(clamp((t - 0.42 - i * 0.09) / 0.4, 0, 1)))
        if (!leaf.vein) return
        g.lineWidth = 0.95 * thin
        strokePart(g, leaf.vein, clamp((t - 0.8 - i * 0.05) / 0.15, 0, 1))
      })
      g.restore()
    }
  }
  /* if the photo never comes, the sprouts settle and the loop can rest */
  const swayOut = () => (stageName === 'done' ? clamp((BEAT + 5 - doneT) / 2, 0, 1) : 1)
  /* where the ground behind the sprouts is dark: the soil, less the paper lying on it */
  function darkGround(camPx) {
    if (!over.c) { over.c = document.createElement('canvas'); over.mask = document.createElement('canvas') }
    const m = over.mask
    if (m.width !== canvas.width || m.height !== canvas.height) { m.width = canvas.width; m.height = canvas.height; over.c.width = canvas.width; over.c.height = canvas.height }
    const g = m.getContext('2d')
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
    g.clearRect(0, 0, m.width, m.height)
    g.drawImage(soil.dry, 0, soil.topPx - camPx)
    g.setTransform(S, 0, 0, S, 0, -camPx)
    for (const p of lying()) {
      if (!p.sprite) continue
      g.globalCompositeOperation = 'destination-out'
      g.save()
      g.translate(p.x, p.y + SINK * p.press)
      g.rotate(p.b); g.scale(1, p.sq * (1 - 0.05 * clamp(p.press, 0, 1))); g.rotate(p.a - p.b)
      g.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh)
      g.restore()
      g.globalCompositeOperation = 'source-over'
      if (p.press > 0 && p.bury) g.drawImage(p.bury, p.x + p.bx, p.y + SINK + p.by, p.bw, p.bh)
    }
    over.cam = camPx; over.stale = false
  }
  const lying = () => pieces.filter(p => !p.held && !p.loose && !p.carried).sort((a, b) => a.order - b.order)

  function paintDamp() {
    const m = wetLayer.mask
    if (m.width !== WET_COLS || m.height !== WET_ROWS) { m.width = WET_COLS; m.height = WET_ROWS }
    const mg = m.getContext('2d'), im = mg.createImageData(WET_COLS, WET_ROWS)
    for (let i = 0; i < wet.length; i++) im.data[i * 4 + 3] = Math.round(clamp(wet[i], 0, 1) * 255)
    mg.putImageData(im, 0, 0)
    const c = wetLayer.c
    if (c.width !== soil.wet.width || c.height !== soil.wet.height) { c.width = soil.wet.width; c.height = soil.wet.height }
    const g = c.getContext('2d')
    g.globalCompositeOperation = 'copy'
    g.drawImage(soil.wet, 0, 0)
    g.globalCompositeOperation = 'destination-in'
    g.imageSmoothingEnabled = true
    g.drawImage(m, 0, 0, WET_COLS, WET_ROWS, 0, 0, c.width, c.height)
    g.globalCompositeOperation = 'source-over'
    wetLayer.stale = false
  }
  function draw() {
    if (!W || !pal) return
    const cw = canvas.width, ch = canvas.height, camPx = Math.round(cam * S)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, cw, ch)
    ctx.imageSmoothingQuality = 'high'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'

    /* the sun, behind everything: it rises and sets behind the bed */
    ctx.setTransform(S, 0, 0, S, 0, 0)
    const sun = sunNow()
    if (sun) {
      ctx.fillStyle = rgba(pal.paper3, 0.75)
      ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r * 1.7, 0, TAU); ctx.fill()
      ctx.fillStyle = css(pal.jute)
      ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r, 0, TAU); ctx.fill()
    }

    /* the bed */
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(soil.dry, 0, soil.topPx - camPx)
    if (water > 0) {
      /* the damp soil, let through a mask that is smooth from side to side, so a damp patch has soft edges */
      if (wetLayer.stale || wetLayer.c.width !== soil.wet.width || wetLayer.c.height !== soil.wet.height) paintDamp()
      ctx.drawImage(wetLayer.c, 0, soil.topPx - camPx)
    }

    /* paper on the bed, in the order it landed */
    ctx.setTransform(S, 0, 0, S, 0, -camPx)
    const down = lying()
    for (const p of down) drawLying(p)

    /* sprouts: moss where the ground behind them is light, sage where it is dark, the way the
       story chapter draws its sprout in cream on soil */
    if (growth > 0 && sprouts.length) {
      drawSprouts(ctx, pal.moss)
      if (over.stale || over.cam !== camPx || !over.c) darkGround(camPx)
      const g = over.c.getContext('2d')
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalCompositeOperation = 'source-over'
      g.clearRect(0, 0, cw, ch)
      g.setTransform(S, 0, 0, S, 0, -camPx)
      drawSprouts(g, pal.sage3)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(over.mask, 0, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(over.c, 0, 0)
      ctx.setTransform(S, 0, 0, S, 0, -camPx)
    }

    /* paper in the hand, then paper in the air */
    for (const p of pieces) if (p.held) drawHeld(p)
    for (const p of pieces) if (p.loose) drawFalling(p)
    for (const p of pieces) if (p.carried) drawFalling(p)

    /* droplets: a round belly and a tip that stretches with the fall, sage with a moss line so they read on sky and soil */
    ctx.fillStyle = css(pal.sage3)
    ctx.strokeStyle = css(pal.moss)
    ctx.lineWidth = 0.7
    for (const d of drops) {
      const r = d.r, tip = r * (2.1 + clamp(d.vy * 0.004, 0, 1.6))
      ctx.beginPath()
      ctx.moveTo(d.x, d.y - tip)
      ctx.quadraticCurveTo(d.x + r * 1.05, d.y - r * 0.75, d.x + r, d.y)
      ctx.arc(d.x, d.y, r, 0, Math.PI)
      ctx.quadraticCurveTo(d.x - r * 1.05, d.y - r * 0.75, d.x, d.y - tip)
      ctx.fill()
      ctx.stroke()
    }
    for (const b of bits) {
      const fade = 1 - b.life / b.max
      if (b.k === 1) {
        ctx.strokeStyle = rgba(b.col, clamp(fade * 1.6, 0, 1)); ctx.lineWidth = 0.6
        ctx.beginPath(); ctx.moveTo(b.x - Math.cos(b.a) * b.r, b.y - Math.sin(b.a) * b.r); ctx.lineTo(b.x + Math.cos(b.a) * b.r, b.y + Math.sin(b.a) * b.r); ctx.stroke()
      } else if (b.k === 2) {
        ctx.fillStyle = css(b.col)
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.6, b.a, 0, TAU); ctx.fill()
      } else if (b.k === 4) {
        /* where a drop lands the water spreads in a ring, flat on the bed */
        const g = b.life / b.max
        ctx.strokeStyle = rgba(b.col, clamp(fade * 0.9, 0, 1)); ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * (0.6 + g * 2.2), b.r * (0.6 + g * 2.2) * FLAT, 0, 0, TAU); ctx.stroke()
      } else {
        ctx.fillStyle = b.k === 3 ? rgba(b.col, clamp(fade * 2, 0, 1)) : css(b.col)
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill()
      }
    }
  }

  /* ==========================================================================
     Size
     ========================================================================== */
  function measure() {
    const w = stage.clientWidth, h = stage.clientHeight
    if (w < 8 || h < 8) return false
    /* a small frame gets a smaller button and caption, set before anything is measured */
    const nowTight = w < 392
    if (nowTight !== tight) { tight = nowTight; figure.classList.toggle('is-tight', tight) }
    /* the caption shares the bottom row with the button at the end. Where the two would not fit side by
       side on one line, the caption takes the top corner instead (it never wraps into a fat pill).
       Measured with the last label, so the bed does not change size from one stage to the next. */
    if (cap) {
      const label = btn.textContent, ws = cap.style.whiteSpace, mw = cap.style.maxWidth
      btn.textContent = ACTION.done
      const bw = btn.offsetWidth
      btn.textContent = label
      cap.style.whiteSpace = 'nowrap'; cap.style.maxWidth = 'none'
      const cw = cap.offsetWidth
      cap.style.whiteSpace = ws; cap.style.maxWidth = mw
      if (cap.getAttribute('style') === '') cap.removeAttribute('style')
      const edge = tight ? 12 : 16
      const nowStacked = cw + bw + edge * 2 + 32 > w        // side by side only with a clear gap between them
      if (nowStacked !== stacked) { stacked = nowStacked; figure.classList.toggle('is-stack', stacked) }
    }
    const d = Math.min(2, window.devicePixelRatio || 1)
    const sized = w !== W || h !== H || d !== dpr
    let moved = false
    if (sized) {
      const vh = (VW * h) / w
      const reshaped = W > 0 && Math.abs(vh - VH) > 0.01
      const ridgeWas = reshaped ? soilY(VW / 2) : 0
      W = w; H = h; dpr = d; k = w / VW; S = k * dpr; VH = vh
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      buildSoil()
      if (camTo > 0) { camTo = camMax; cam = Math.min(camMax, camCap()) }
      if (reshaped) for (const p of pieces) if (p.held) { const f = soilY(VW / 2) / ridgeWas; p.hy0 *= f; p.y = heldY(p) }
    }
    const k1 = 1 / k
    hintBox = hint.offsetWidth ? { x0: hint.offsetLeft * k1, x1: (hint.offsetLeft + hint.offsetWidth) * k1, y1: (hint.offsetTop + hint.offsetHeight) * k1 } : null
    /* the bottom row: the button, and the caption beside it unless it has taken the top corner */
    const row = Math.min(btn.offsetHeight ? btn.offsetTop : h, !stacked && cap && cap.offsetHeight ? cap.offsetTop : h) * k1
    capLow = stacked && cap && cap.offsetHeight ? (cap.offsetTop + cap.offsetHeight) * k1 : 0
    if (Math.abs(row - rowTop) > 0.5 || sized) {
      rowTop = row
      /* paper on the bed keeps its place along it and stays clear of the row with the button */
      for (const p of pieces) {
        if (p.held || !p.hw) continue
        const ridge = soilY(p.lx)
        p.ld = clamp(p.ld, Math.min(p.hh + 1.5, bandLow() - ridge), Math.max(p.hh + 1.5, bandLow() - ridge - p.hh - 1.5))
        p.ly = ridge + p.ld
        if (!p.loose) p.y = p.ly
      }
      if (sprouts.length) plantSprouts()
      over.stale = true
      moved = true
    }
    let fresh = false
    if (!pieces.length) { newDisc(false); fresh = true }
    else if (isWhole() && !rips.size) {
      /* the untouched disc keeps clear of the words as the frame changes */
      const home = discHome(), p = pieces[0]
      if (Math.abs(home.r - discR) > 0.4) { newDisc(false); fresh = true }
      else if (Math.abs(home.x - p.hx0) > 0.4 || Math.abs(home.y - p.hy0) > 0.4) {
        p.hx0 = home.x; p.hy0 = home.y; moved = true
        if (reduced || !seen) { p.x = home.x; p.y = home.y }
      }
    }
    if (sized && !fresh) reprint(false)
    return sized || moved || fresh
  }

  /* ==========================================================================
     Wiring
     ========================================================================== */
  on(stage, 'pointerdown', onDown)
  on(stage, 'pointermove', onMove)
  on(stage, 'pointerup', onUp)
  on(stage, 'pointercancel', onCancel)
  on(stage, 'lostpointercapture', onCancel)
  on(stage, 'contextmenu', e => { if (ptr.down || e.pointerType === 'touch') e.preventDefault() })
  on(btn, 'click', onButton)
  /* the photo is back: press and hold on it to look at your own sprouts again */
  on(figure, 'pointerdown', onPeek)
  on(figure, 'pointerup', endPeek)
  on(figure, 'pointercancel', endPeek)
  on(figure, 'lostpointercapture', endPeek)
  on(figure, 'contextmenu', e => { if (peeking >= 0) e.preventDefault() })
  on(stage, 'pointerleave', () => { if (!ptr.down) stage.classList.remove('is-over') })
  /* a photo that arrives late still gets its turn */
  if (photoImg) on(photoImg, 'load', () => { if (beatOver && stageName === 'done' && !photo) showPhoto() })

  function setReduced(v) {
    v = !!v
    if (v === reduced) return
    reduced = v
    figure.classList.toggle('is-reduced', v)
    if (v) {
      if (pour) soak(null)
      settleNow()
      checkTorn()
      if (stageName === 'press' && pressedCount() === pieces.length) setStage('water')
      for (const p of pieces) { p.prev = null; p.fade = 1; p.fadeOut = false }
      if (stageName === 'sun' && !sunWait) later(() => { if (stageName === 'sun') finishSun() }, 1600)
      else if (stageName === 'done' && !beatOver) later(endBeat, Math.max(600, (BEAT - doneT) * 1000))
    }
    wake()
  }
  /* the site's own "Pause motion" control announces itself with this event */
  on(window, 'motion:toggle', e => setReduced(e.detail && typeof e.detail.paused === 'boolean' ? e.detail.paused : !reduced))
  if (mq) {
    const onMq = () => setReduced(!!opts.reduced || mq.matches)
    if (mq.addEventListener) on(mq, 'change', onMq)
  }

  let io = null, ro = null
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      inView = entries[entries.length - 1].isIntersecting
      if (!inView) return
      idle = 0
      if (!seen) { seen = true; if (!reduced && isWhole()) intro = 0 }      // the disc arrives the first time it is seen
      wake()
    }, { rootMargin: '8% 0px' })
    io.observe(stage)
  } else { inView = true; seen = true }
  const onSize = () => { if (!dead && measure()) wake() }
  if ('ResizeObserver' in window) { ro = new ResizeObserver(onSize); ro.observe(stage); ro.observe(btn); ro.observe(hint) }
  on(window, 'resize', onSize)
  /* a late typeface changes the size of the words and the button: measure again when the fonts are in */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) onSize() }, () => {})

  /* ==========================================================================
     Go
     ========================================================================== */
  readPalette()
  discSeed = (rand() * 0xffffffff) >>> 0
  setStage('tear', true)
  measure()
  loadArt(opts.markSrc, 'mark')
  loadArt(opts.paperSrc, 'paper')
  if (!art.waiting) stage.dataset.ready = '1'
  wake()

  const state = () => ({ stage: stageName, pieces: pieces.length, pressed: pressedCount(), water, growth })
  /* for tests: where things are on the page, and whether anything is still moving */
  const peek = () => {
    const r = stage.getBoundingClientRect(), ux = r.width / VW, uy = r.height / (VH || 1)
    return {
      ready: stage.dataset.ready === '1', inView, reduced, looping: !!raf, photo, frames, cost, cam, tight, stacked, peeking: peeking >= 0, carrying: !!ptr.carry,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      soilY: r.top + (soilY(VW / 2) - cam) * uy,
      pieces: pieces.map(p => {
        const e = p.held ? { hw: p.rad, hh: p.rad } : extents(p, p.a, p.b, p.sq)
        return {
          x: r.left + p.x * ux, y: r.top + (p.y - cam) * uy, r: p.rad * ux, hw: e.hw * ux, hh: e.hh * uy,
          ridge: r.top + (soilY(p.x) - cam) * uy, turn: p.a, flat: p.sq, share: p.share,
          held: p.held, carried: p.carried, asleep: p.asleep, pressed: p.press >= 1, pressing: p.pressing || p.want, torn: p.ty.some(t => t === 1), points: p.xs.length,
          land: p.hw ? { x: r.left + p.lx * ux, y: r.top + (p.ly - cam) * uy } : null, fringe: p.fringe,
        }
      }),
      rips: [...rips.values()].map(q => ({ tip: q.tip, head: q.head, out: !!q.X, open: q.open, bridges: q.live, snapped: q.gone.size })), lastCut, snapped: snappedTotal,
      drops: drops.length, bits: bits.length, sun: !!sunNow(), sunWait,
      sprouts: sprouts.length, sproutKinds: [...new Set(sprouts.map(s => s.kind + (s.tall ? '-tall' : '-small')))],
      hint: hintBox ? { x: r.left + hintBox.x0 * ux, right: r.left + hintBox.x1 * ux, bottom: r.top + hintBox.y1 * uy } : null,
    }
  }
  const hooks = { state, act, reset, peek }

  function destroy() {
    if (dead) return
    dead = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    for (const id of timers) clearTimeout(id)
    timers.clear()
    for (const off of offs) off()
    offs.length = 0
    if (io) io.disconnect()
    if (ro) ro.disconnect()
    stage.remove(); hint.remove(); btn.remove(); live.remove()
    figure.classList.remove('plant-fig', 'is-photo', 'is-reduced', 'is-tight', 'is-done', 'is-stack', 'is-peek', 'was-peek')
    if (!figure.getAttribute('style')) figure.removeAttribute('style')
    if (photoImg) { if (photoHidden == null) photoImg.removeAttribute('aria-hidden'); else photoImg.setAttribute('aria-hidden', photoHidden) }
    if (steps) steps.forEach(li => { li.classList.remove('plant-step', 'is-done'); li.removeAttribute('aria-current') })
    pieces = []; sprouts = []; drops = []; bits = []
    rips.clear()
    delete figure.__planting
    if (window.__planting === hooks) delete window.__planting
  }

  const api = { destroy, reset }
  figure.__planting = api
  window.__planting = hooks
  return api
}
