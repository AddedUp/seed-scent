/* Wholesale page: the firms section that used to sit on the home page. The tier slider and the
   order request form are sections.js, the bag drawer is cart.js; this file is the page shell. */
import { prefersReduced } from './scroll.js'
import { fillPlaceholders, initSplit, fontsSettled, resplitWhenFontsArrive, initMagnetic, initMotionToggle, initMenu } from './ui.js'

fillPlaceholders()
initMagnetic()
initMotionToggle()
initMenu()
await import('./sections.js')
await import('./cart.js')

const splitEls = [...document.querySelectorAll('[data-split]')]
if (!prefersReduced) splitEls.forEach(el => { el.style.visibility = 'hidden' })
fontsSettled(splitEls).then(how => {
  splitEls.forEach(el => { el.style.visibility = '' })
  initSplit()
  ScrollTrigger.refresh()
  if (how === 'timeout') resplitWhenFontsArrive(() => ScrollTrigger.refresh())
})
addEventListener('load', () => ScrollTrigger.refresh())
window.__wholesale = { ready: true }
