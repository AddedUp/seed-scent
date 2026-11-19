/* The startup animation's switch (the drawing and its timing are in css/intro.css).
   It plays once per visit on the home page: not again when you come back to the page in the same
   tab, never when the device asks for reduced motion, and not for automated browsers.
   ?intro=1 plays it anyway, ?intro=0 skips it, ?intro=hold plays it and leaves it up.
   Loaded in <head> so the decision is made before the first paint; window.__intro.done resolves
   when the curtain starts to lift (straight away when there is no intro), so the headline reveal
   and the pendant can wait for it. A tap, a click, any key or the Skip button ends it early. */
(function () {
  var root = document.documentElement, q = location.search, KEY = 'seedscent.intro'
  var LENGTH = 4300, LIFT = 700
  var on = true
  try { on = !sessionStorage.getItem(KEY) } catch (e) {}
  if (navigator.webdriver) on = false
  if (/[?&]intro=(1|hold)\b/.test(q)) on = true
  if (/[?&]intro=0\b/.test(q)) on = false
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) on = false
  var hold = on && /[?&]intro=hold\b/.test(q)

  var finish
  var api = window.__intro = { on: on, over: !on, done: new Promise(function (r) { finish = r }) }
  if (!on) { finish(); return }
  root.classList.add('intro-on')
  try { sessionStorage.setItem(KEY, '1') } catch (e) {}

  var timer = 0
  function end() {
    if (api.over) return
    api.over = true
    clearTimeout(timer)
    removeEventListener('keydown', end)
    root.classList.add('intro-out')
    finish()
    setTimeout(function () {
      var el = document.getElementById('intro')
      if (el) el.remove()
      root.classList.remove('intro-on', 'intro-out')
    }, LIFT)
  }
  api.end = end

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('intro')
    if (!el) { end(); return }
    el.addEventListener('click', end)
    addEventListener('keydown', end)
    // the page underneath stays put while the cartoon plays
    var still = function (e) { e.preventDefault(); e.stopPropagation() }
    el.addEventListener('wheel', still, { passive: false })
    el.addEventListener('touchmove', still, { passive: false })
    if (!hold) timer = setTimeout(end, LENGTH)
  })
})()
