// Continuous-scroll probe for the physics-driven moments: instead of instant jumps, scroll like a
// person (wheel ticks through Lenis on desktop, native momentum-style scrollTo on the phone) and
// sample the live physics (rope joint error, ring tilt, disc/ring pose) while taking frames.
// Read-only. Usage: node review-smooth.mjs [desktop|phone|all] [scenario,...]
import { chromium } from 'playwright'
import fs from 'fs'
import { fileURLToPath } from 'url'

const base = 'http://127.0.0.1:3001/index.html'
const out = fileURLToPath(new URL('./out/', import.meta.url))
const which = process.argv[2] || 'all'
const only = process.argv[3] ? process.argv[3].split(',') : null
const sizes = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}

/* physics probe: runs in the page, reads the live module instances */
const PROBE = `(async () => {
  if (!window.__phys) {
    const [phys, three] = await Promise.all([import('/js/physics.js'), import('three')])
    window.__phys = { phys, THREE: three }
  }
  const { phys, THREE } = window.__phys
  const s = __dbg.state()
  const w = innerWidth, h = innerHeight, wpp = 10 / h
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3()
  const rot = r => q.set(r.x, r.y, r.z, r.w)
  const res = { p: s.progress, chapter: s.chapter, locals: s.locals, soil: s.soil, plant: s.plant, holder: s.holder, hangers: {} }
  for (const hg of phys.hangers) {
    if (!hg.enabled) continue
    // joint errors along the chain
    const errs = []
    let prevPt = (() => { const t = hg.anchor.translation(); return new THREE.Vector3(t.x, t.y, t.z) })()
    hg.ropeBodies.forEach((rb, i) => {
      const t = rb.translation(); rot(rb.rotation())
      const top = a.set(0, hg.segLen / 2, 0).applyQuaternion(q).add(b.set(t.x, t.y, t.z))
      errs.push(top.distanceTo(prevPt))
      prevPt = v.set(0, -hg.segLen / 2, 0).applyQuaternion(q).add(b.set(t.x, t.y, t.z)).clone()
    })
    const bt = hg.body.translation(); rot(hg.body.rotation())
    const bodyTop = a.set(0, hg.R, 0).applyQuaternion(q).add(b.set(bt.x, bt.y, bt.z))
    errs.push(bodyTop.distanceTo(prevPt))
    const maxErr = Math.max(...errs)
    // ring facing: local +z is the ring normal
    const n = v.set(0, 0, 1).applyQuaternion(q)
    const tilt = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(n.z))))
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(n.x, n.z))
    const pitch = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, n.y))))
    const at = hg.anchor.translation()
    const info = { maxJointErr: +maxErr.toFixed(3), maxJointErrSeg: +(maxErr / hg.segLen).toFixed(2), tilt: +tilt.toFixed(1), yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1),
      anchor: { x: +at.x.toFixed(2), y: +at.y.toFixed(2) }, target: { x: +hg.target.x.toFixed(2), y: +hg.target.y.toFixed(2) },
      body: { x: +bt.x.toFixed(2), y: +bt.y.toFixed(2), z: +bt.z.toFixed(2) },
      screen: { x: +(w / 2 + bt.x / wpp).toFixed(0), y: +(h / 2 - bt.y / wpp).toFixed(0), r: +(hg.R / wpp).toFixed(0) },
      chainLen: +Math.hypot(bt.x - at.x, bt.y - at.y, bt.z).toFixed(2), restLen: +(hg.L + hg.R).toFixed(2) }
    if (hg.name === 'hero' && hg.disc) {
      // disc pose relative to the ring (only meaningful while detached)
      hg.mesh.updateMatrixWorld(true)
      const dp = new THREE.Vector3(); hg.disc.getWorldPosition(dp)
      const local = hg.mesh.worldToLocal(dp.clone())
      const dq = new THREE.Quaternion(); hg.disc.getWorldQuaternion(dq)
      const dn = new THREE.Vector3(0, 0, 1).applyQuaternion(dq)
      const ang = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(dn.dot(n)))))
      info.disc = { detached: hg.disc.parent !== hg.mesh, local: { x: +local.x.toFixed(2), y: +local.y.toFixed(2), z: +local.z.toFixed(2) }, angleToRing: +ang.toFixed(1),
        screen: { x: +(w / 2 + dp.x / wpp).toFixed(0), y: +(h / 2 - dp.y / wpp).toFixed(0) } }
      // a disc whose centre sits within the ring's thickness band while tilted against it will show the ring cutting through it
      info.disc.likelyIntersect = info.disc.detached && Math.abs(local.z) < hg.R * 0.9 && Math.hypot(local.x, local.y) < hg.R * 1.1 && ang > 12
    }
    res.hangers[hg.name] = info
  }
  return res
})()`

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function chapterMap(page) {
  return page.evaluate(() => {
    const total = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    return Object.fromEntries(__dbg.chapters().map(c => {
      const el = document.querySelector(`.ch[data-ch="${c.name}"]`)
      const pinStart = Math.min(1, Math.max(c.start, el.offsetTop / total))
      return [c.name, { ...c, pinStart, enterFrac: (pinStart - c.start) / Math.max(1e-6, c.end - c.start), total }]
    }))
  })
}

/* scroll from progress a to b at px/s. desktop: wheel ticks (Lenis smooths). phone: native scrollTo in rAF. */
async function scrollLike(page, name, a, b, pxPerSec, onTick) {
  const total = await page.evaluate(() => Math.max(1, document.documentElement.scrollHeight - innerHeight))
  const y0 = a * total, y1 = b * total
  if (name === 'phone') {
    await page.evaluate(([y0, y1, v]) => new Promise(res => {
      window.scrollTo(0, y0)
      let y = y0, last = performance.now()
      const step = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; y += v * dt; if (y >= y1) { window.scrollTo(0, y1); return res() } window.scrollTo(0, y); requestAnimationFrame(step) }
      requestAnimationFrame(step)
      window.__scrollDone = false
    }).then(() => { window.__scrollDone = true }), [y0, y1, pxPerSec])
    // the promise above resolves only when done; run the ticker concurrently instead
  }
}

async function run(name, opts) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.goto(base + '?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const ch = await chapterMap(page)
  const total = ch.drive.total
  const at = (c, local) => ch[c].start + local * (ch[c].end - ch[c].start)
  const pinP = (c, pin) => at(c, ch[c].enterFrac + pin * (1 - ch[c].enterFrac))
  const { width, height } = opts.viewport
  const log = { viewport: opts.viewport, scenarios: {} }

  // scenario: [from, to, px/s, frame interval ms]
  const scenarios = {
    'plant': [pinP('drive', 0.66), at('sprout', 0.5 * ch.sprout.enterFrac), name === 'phone' ? 1100 : 900, 180],
    'scents-in': [pinP('sprout', 0.9), pinP('scents', 0.15), name === 'phone' ? 1100 : 900, 180],
    'scents-out': [pinP('scents', 0.9), at('cards', 0.35), name === 'phone' ? 1300 : 1000, 160],
    'finale': [at('about', 0.4), at('finale', 0.75), name === 'phone' ? 1200 : 900, 160],
    'finale-fast': [at('about', 0.3), at('finale', 0.8), name === 'phone' ? 3000 : 2400, 90],
  }
  for (const [sc, [a, b, v, every]] of Object.entries(scenarios)) {
    if (only && !only.includes(sc)) continue
    // land a little before the start and let things settle, the way a real visitor arrives
    await page.evaluate(p => __dbg.scrollTo(p), Math.max(0, a - 0.004))
    await page.waitForTimeout(1200)
    const frames = []
    const t0 = Date.now()
    let k = 0
    const y0 = a * total, y1 = b * total
    const durMs = (y1 - y0) / v * 1000
    if (name === 'phone') {
      await page.evaluate(([y0, y1, v]) => {
        window.__scrollDone = false
        window.scrollTo(0, y0)
        let y = y0, last = performance.now()
        const step = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; y += v * dt; if (y >= y1) { window.scrollTo(0, y1); window.__scrollDone = true; return } window.scrollTo(0, y); requestAnimationFrame(step) }
        requestAnimationFrame(step)
      }, [y0, y1, v])
      while (true) {
        const done = await page.evaluate(() => window.__scrollDone)
        const m = await page.evaluate(PROBE)
        const file = `sm-${name}-${sc}-${String(k).padStart(2, '0')}.png`
        await page.screenshot({ path: out + file })
        frames.push({ k, t: Date.now() - t0, file, m }); k++
        if (done) break
        await sleep(every)
      }
    } else {
      // wheel ticks every 16 ms; a frame every `every` ms
      await page.mouse.move(width * 0.5, height * 0.6)
      const perTick = v / 60
      let sent = 0, nextFrame = 0
      const need = y1 - y0
      while (sent < need) {
        const t = Date.now() - t0
        if (t >= nextFrame) {
          const m = await page.evaluate(PROBE)
          const file = `sm-${name}-${sc}-${String(k).padStart(2, '0')}.png`
          await page.screenshot({ path: out + file })
          frames.push({ k, t, file, m }); k++
          nextFrame = t + every
        }
        await page.mouse.wheel(0, perTick); sent += perTick
        await sleep(16)
      }
      // let Lenis finish easing, grabbing a few more frames
      for (let i = 0; i < 4; i++) { await sleep(every); const m = await page.evaluate(PROBE); const file = `sm-${name}-${sc}-${String(k).padStart(2, '0')}.png`; await page.screenshot({ path: out + file }); frames.push({ k, t: Date.now() - t0, file, m }); k++ }
    }
    // summary
    const sum = {}
    for (const f of frames) for (const [hn, hi] of Object.entries(f.m.hangers)) {
      const s = sum[hn] || (sum[hn] = { maxJointErrSeg: 0, maxTilt: 0, maxYaw: 0, frames: 0, intersectFrames: [], errFrames: [] })
      s.frames++
      if (hi.maxJointErrSeg > s.maxJointErrSeg) s.maxJointErrSeg = hi.maxJointErrSeg
      if (hi.tilt > s.maxTilt) s.maxTilt = hi.tilt
      if (Math.abs(hi.yaw) > s.maxYaw) s.maxYaw = Math.abs(hi.yaw)
      if (hi.maxJointErrSeg > 0.5) s.errFrames.push(`${f.file}:${hi.maxJointErrSeg}`)
      if (hi.disc && hi.disc.likelyIntersect) s.intersectFrames.push(`${f.file}(ang ${hi.disc.angleToRing}, lz ${hi.disc.local.z})`)
    }
    console.log(`\n[${name} ${sc}] ${(y1 - y0).toFixed(0)}px at ${v}px/s (${(durMs / 1000).toFixed(1)}s), ${frames.length} frames`)
    for (const [hn, s] of Object.entries(sum)) console.log(`  ${hn.padEnd(8)} maxJointErr=${s.maxJointErrSeg}seg maxTilt=${s.maxTilt}° maxYaw=${s.maxYaw}° ${s.errFrames.length ? 'torn:' + s.errFrames.join(' ') : ''} ${s.intersectFrames.length ? 'disc/ring:' + s.intersectFrames.join(' ') : ''}`)
    for (const f of frames) {
      const hh = f.m.hangers.hero
      console.log(`   ${f.file} t=${f.t}ms p=${f.m.p} ${f.m.chapter} soil=${f.m.soil} plant=${f.m.plant}` + (hh ? ` hero tilt=${hh.tilt} yaw=${hh.yaw} pitch=${hh.pitch} err=${hh.maxJointErrSeg} chain=${hh.chainLen}/${hh.restLen}` + (hh.disc && hh.disc.detached ? ` disc ang=${hh.disc.angleToRing} lz=${hh.disc.local.z} X=${hh.disc.likelyIntersect}` : '') : '') + Object.entries(f.m.hangers).filter(([n]) => n !== 'hero').map(([n, x]) => ` ${n}:err=${x.maxJointErrSeg},tilt=${x.tilt}`).join(''))
    }
    log.scenarios[sc] = { a, b, v, frames }
  }

  // idle yaw statistics at drive pin 0.4: how often is the product face turned away?
  if (!only || only.includes('yaw')) {
    await page.evaluate(p => __dbg.scrollTo(p), pinP('drive', 0.4))
    await page.mouse.move(width * 0.1, height * 0.9)
    await page.waitForTimeout(800)
    const samples = []
    const T = 10000
    const t0 = Date.now()
    while (Date.now() - t0 < T) { const m = await page.evaluate(PROBE); if (m.hangers.hero) samples.push({ t: Date.now() - t0, tilt: m.hangers.hero.tilt, yaw: m.hangers.hero.yaw, pitch: m.hangers.hero.pitch }); await sleep(100) }
    const over = th => +(samples.filter(s => s.tilt > th).length / samples.length).toFixed(2)
    const mean = +(samples.reduce((a, s) => a + s.tilt, 0) / samples.length).toFixed(1)
    console.log(`\n[${name} yaw @drive pin 0.4, ${T / 1000}s idle] mean tilt=${mean}° frac>30°=${over(30)} frac>45°=${over(45)} frac>60°=${over(60)} max=${Math.max(...samples.map(s => s.tilt))}°`)
    await page.screenshot({ path: out + `sm-${name}-yaw-end.png` })
    log.yaw = samples
  }
  fs.writeFileSync(out + `sm-${name}-log.json`, JSON.stringify(log, null, 1))
  console.log(name, 'page errors:', errors.length ? errors : 'none')
  await browser.close()
}

for (const [name, opts] of Object.entries(sizes)) { if (which === 'all' || which === name) await run(name, opts) }
