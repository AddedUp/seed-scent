// Analyze the logo cutouts: connected components of the alpha channel.
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const root = path.resolve(__dirname, '../..')
function load(rel) {
  return PNG.sync.read(fs.readFileSync(path.join(root, rel)))
}
function components(png, thresh = 128) {
  const { width: w, height: h, data } = png
  const label = new Int32Array(w * h).fill(-1)
  const comps = []
  const stack = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (label[i] !== -1 || data[i * 4 + 3] < thresh) continue
    const id = comps.length
    const c = { id, n: 0, minX: x, maxX: x, minY: y, maxY: y, sumX: 0, sumY: 0 }
    comps.push(c)
    stack.push(i); label[i] = id
    while (stack.length) {
      const j = stack.pop()
      const jx = j % w, jy = (j / w) | 0
      c.n++; c.sumX += jx; c.sumY += jy
      if (jx < c.minX) c.minX = jx; if (jx > c.maxX) c.maxX = jx
      if (jy < c.minY) c.minY = jy; if (jy > c.maxY) c.maxY = jy
      const nb = [j - 1, j + 1, j - w, j + w]
      for (const k of nb) {
        if (k < 0 || k >= w * h) continue
        if (Math.abs((k % w) - jx) > 1) continue
        if (label[k] === -1 && data[k * 4 + 3] >= thresh) { label[k] = id; stack.push(k) }
      }
    }
  }
  return { comps: comps.sort((a, b) => b.n - a.n), label }
}

for (const rel of ['brand/logo-primary.png', 'brand/mark-s-hanging.png', 'brand/mark-ss-sprout.png']) {
  const png = load(rel)
  const { comps } = components(png)
  console.log(`\n== ${rel} ${png.width}x${png.height}: ${comps.length} components`)
  comps.slice(0, 12).forEach(c => console.log(
    `  #${c.id} px=${c.n} bbox=(${c.minX},${c.minY})-(${c.maxX},${c.maxY}) size=${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} centroid=(${(c.sumX / c.n).toFixed(0)},${(c.sumY / c.n).toFixed(0)})`))
}
