import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const out = fileURLToPath(new URL('./out/', import.meta.url))
const stops = process.argv.slice(2).length ? process.argv.slice(2).map(s => s.split(':')) : [['drive', 0.92], ['sprout', 0.45], ['sprout', 0.96], ['scents', 0.1], ['scents', 0.22], ['scents', 0.36], ['scents', 0.7], ['inside', 0.12], ['finale', 1]]
const browser = await chromium.launch()
for (const vp of [{ w: 1440, h: 900, tag: 'd' }, { w: 390, h: 844, tag: 'p', mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:3001/index.html?bust=' + Date.now())
  await page.waitForFunction(() => window.__dbg && __dbg.state().ready, null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  for (const [c, l] of stops) {
    await page.evaluate(([c, l]) => { const ch = __dbg.chapters().find(x => x.name === c); __dbg.scrollTo(ch.start + Number(l) * (ch.end - ch.start)) }, [c, l])
    await page.waitForTimeout(1100)
    await page.screenshot({ path: `${out}f-${vp.tag}-${c}-${l}.png` })
  }
  await ctx.close()
}
await browser.close()
console.log('frames done')
