/* Smooth scroll bridge, master progress and the chapter map.
   gsap, ScrollTrigger, SplitText and Lenis are UMD globals (vendor/). */

gsap.registerPlugin(ScrollTrigger, SplitText)

export const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches
export const isCoarse = matchMedia('(pointer: coarse)').matches

export const motion = {
  paused: prefersReduced,        // "Pause motion" toggle + reduced-motion preference
  get active() { return !this.paused },
}

/* ---------- Lenis + ScrollTrigger (exactly this wiring) ---------- */
export let lenis = null
export const scroll = { y: 0, vel: 0, progress: 0, max: 1 }

if (!prefersReduced) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  lenis.on('scroll', e => { scroll.vel = e.velocity })
  gsap.ticker.add(t => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
}

let lastY = window.scrollY
export function readScroll(dt) {
  const y = lenis ? lenis.scroll : window.scrollY
  if (!lenis) {
    // native scrolling: derive a velocity in px/frame-ish units
    const v = (y - lastY)
    scroll.vel += (v - scroll.vel) * Math.min(1, dt * 12)
  }
  lastY = y
  scroll.y = y
  scroll.max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  scroll.progress = Math.min(1, Math.max(0, y / scroll.max))
  if (lenis) scroll.vel *= 0.9   // lenis only reports on scroll events; decay between them
}

/* ---------- Chapter map: ranges come from the live section heights ---------- */
export const chapters = []
const byName = new Map()

export function buildChapters() {
  const sections = [...document.querySelectorAll('.ch[data-ch]')]
  chapters.length = 0; byName.clear()
  const total = scroll.max
  for (const el of sections) {
    const top = el.offsetTop
    const h = el.offsetHeight
    // A chapter owns the scroll from the moment its section's top enters at the bottom of the
    // viewport (start) until its bottom reaches the bottom of the viewport (end). In between,
    // pinStart is when the section's top reaches the top of the viewport, i.e. when its sticky
    // stage is pinned. So: `enter` runs 0..1 while the previous stage slides away and this one
    // arrives, `pin` runs 0..1 while the stage is pinned. Chapters tile the page with no gaps.
    const start = Math.max(0, (top - innerHeight) / total)
    const pinStart = Math.min(1, Math.max(start, top / total))
    const end = Math.min(1, Math.max(pinStart + 0.0001, (top + h - innerHeight) / total))
    const c = { name: el.dataset.ch, el, start, pinStart, end, enterFrac: 0, local: 0, enter: 0, pin: 0, top, h }
    chapters.push(c); byName.set(c.name, c)
  }
  if (chapters[0]) { chapters[0].start = 0; chapters[0].pinStart = 0 }
  if (chapters.length) chapters[chapters.length - 1].end = 1
  for (const c of chapters) c.enterFrac = (c.pinStart - c.start) / Math.max(1e-6, c.end - c.start)
}

export function updateChapters() {
  const p = scroll.progress
  for (const c of chapters) {
    c.local = Math.min(1, Math.max(0, (p - c.start) / (c.end - c.start)))
    c.enter = c.enterFrac > 0 ? Math.min(1, c.local / c.enterFrac) : 1
    c.pin = c.enterFrac < 1 ? Math.min(1, Math.max(0, (c.local - c.enterFrac) / (1 - c.enterFrac))) : 0
  }
}

export const ch = name => byName.get(name)

/* which chapter owns the viewport right now (last one whose start <= p) */
export function activeChapter() {
  const p = scroll.progress
  let a = chapters[0]
  for (const c of chapters) if (p >= c.start) a = c
  return a
}

/* ---------- small math helpers shared by the choreography ---------- */
export const clamp01 = v => Math.min(1, Math.max(0, v))
export const lerp = (a, b, t) => a + (b - a) * t
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
/* window of a sub-beat inside a chapter: returns local 0..1 for [a,b] */
export const span = (v, a, b) => clamp01((v - a) / (b - a))
