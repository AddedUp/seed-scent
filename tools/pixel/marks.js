// Produce derived brand assets: the SS-with-sprout mark without its string,
// a favicon, and a square paper-print version of the mark.
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const root = path.resolve(__dirname, '../..')
const load = rel => PNG.sync.read(fs.readFileSync(path.join(root, rel)))
const save = (png, rel) => fs.writeFileSync(path.join(root, rel), PNG.sync.write(png))

function rowWidth(png, y) {
  // filled pixel COUNT per row (the string is two thin strands, the knot is a lump)
  let n = 0
  for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3] > 128) n++
  return n
}
function crop(png, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * png.width + (x0 + x)) * 4, di = (y * w + x) * 4
    out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1]
    out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3]
  }
  return out
}
function bbox(png) {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}
// box-filter downscale with premultiplied alpha
function resize(png, w, h) {
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx0 = Math.floor(x * png.width / w), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * png.width / w))
    const sy0 = Math.floor(y * png.height / h), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * png.height / h))
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const i = (sy * png.width + sx) * 4, al = png.data[i + 3] / 255
      r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al; a += al; n++
    }
    const di = (y * w + x) * 4
    if (a > 0) { out.data[di] = r / a; out.data[di + 1] = g / a; out.data[di + 2] = b / a }
    out.data[di + 3] = Math.round((a / n) * 255)
  }
  return out
}
function pad(png, size, fill) {
  const out = new PNG({ width: size, height: size })
  if (fill) for (let i = 0; i < size * size; i++) { out.data[i * 4] = fill[0]; out.data[i * 4 + 1] = fill[1]; out.data[i * 4 + 2] = fill[2]; out.data[i * 4 + 3] = 255 }
  const ox = Math.floor((size - png.width) / 2), oy = Math.floor((size - png.height) / 2)
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const si = (y * png.width + x) * 4, di = ((y + oy) * size + (x + ox)) * 4
    const a = png.data[si + 3] / 255
    if (fill) {
      out.data[di] = png.data[si] * a + out.data[di] * (1 - a)
      out.data[di + 1] = png.data[si + 1] * a + out.data[di + 1] * (1 - a)
      out.data[di + 2] = png.data[si + 2] * a + out.data[di + 2] * (1 - a)
    } else { out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1]; out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3] }
  }
  return out
}

// 1. SS-with-sprout mark without the string: find where the string ends (row width jumps)
const ss = load('brand/mark-ss-sprout.png')
let cutY = 0
for (let y = 0; y < ss.height; y++) { if (rowWidth(ss, y) > 90) { cutY = y; break } }
console.log('string ends at row', cutY, 'of', ss.height)
const body = crop(ss, 0, cutY, ss.width, ss.height - cutY)
const bb = bbox(body)
const tight = crop(body, bb.minX, bb.minY, bb.maxX - bb.minX + 1, bb.maxY - bb.minY + 1)
save(tight, 'brand/mark-ss-sprout-nostring.png')
console.log('nostring size', tight.width, tight.height)

// 2. Square version for printing on the paper disc (mark centered on transparent square)
const sq = Math.max(tight.width, tight.height) + 40
save(pad(tight, sq, null), 'brand/mark-print.png')

// 3. Favicon 64x64 on cream
const small = resize(tight, Math.round(52 * tight.width / Math.max(tight.width, tight.height)), Math.round(52 * tight.height / Math.max(tight.width, tight.height)))
save(pad(small, 64, [0xfb, 0xf6, 0xe5]), 'brand/favicon.png')
console.log('favicon written')
