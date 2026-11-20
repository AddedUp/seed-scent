/* Find your scent: three taps on the home page, then one of the scents in the config with a link
   to the shop. Each answer gives points to scents by their place in the scents list
   (0 Citrus Grove, 1 Lavender, 2 Vanilla, 3 Linen, 4 Wildflowers); the highest total wins,
   the earlier answer breaking a tie. Nothing is stored or sent anywhere. */
const CFG = window.SEED_SCENT || {}
const scents = (Array.isArray(CFG.scents) ? CFG.scents : []).map((s, i) => (s && s.name ? String(s.name) : `Scent ${i + 1}`))
const notes = (Array.isArray(CFG.scents) ? CFG.scents : []).map(s => (s && s.notes ? String(s.notes) : ''))

const QUESTIONS = [
  { ask: 'How should the drive feel?', answers: [
    ['Bright and awake', { 0: 2 }], ['Calm and quiet', { 1: 2, 3: 1 }], ['Warm and cozy', { 2: 2 }], ['Fresh and clean', { 3: 2, 0: 1 }], ['Like being outside', { 4: 2, 1: 1 }],
  ] },
  { ask: 'Pick a place.', answers: [
    ['An orange grove at noon', { 0: 2 }], ['A field of lavender', { 1: 2 }], ['A bakery in the morning', { 2: 2 }], ['Sheets fresh off the line', { 3: 2 }], ['A meadow in spring', { 4: 2 }],
  ] },
  { ask: 'Pick a color.', answers: [
    ['Orange', { 0: 1 }], ['Purple', { 1: 1 }], ['Cream', { 2: 1 }], ['White', { 3: 1 }], ['Green', { 4: 1 }],
  ] },
]

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const root = document.getElementById('scent-quiz')

if (root && scents.length >= 5) {
  const stage = root.querySelector('.quiz-stage')
  let step = 0, picks = []

  function result() {
    const score = scents.map(() => 0)
    picks.forEach((a, q) => { for (const [i, pts] of Object.entries(QUESTIONS[q].answers[a][1])) score[i] += pts + (QUESTIONS.length - q) * 0.01 })
    return score.indexOf(Math.max(...score))
  }
  function draw(focus) {
    if (step < QUESTIONS.length) {
      const q = QUESTIONS[step]
      stage.innerHTML = `
        <p class="kicker quiz-count">Question ${step + 1} of ${QUESTIONS.length}</p>
        <h3 class="quiz-ask" tabindex="-1">${esc(q.ask)}</h3>
        <div class="quiz-answers" role="group" aria-label="${esc(q.ask)}">
          ${q.answers.map((a, i) => `<button class="pill ghost small quiz-answer" type="button" data-answer="${i}">${esc(a[0])}</button>`).join('')}
        </div>
        ${step ? '<button class="text-btn quiz-back" type="button" data-back>Back</button>' : ''}`
    } else {
      const won = result(), name = scents[won]
      stage.innerHTML = `
        <p class="kicker quiz-count">Your scent</p>
        <h3 class="quiz-ask quiz-result" tabindex="-1">${esc(name)}.</h3>
        ${notes[won] ? `<p class="quiz-notes">${esc(notes[won])}</p>` : ''}
        <div class="quiz-answers">
          <a class="pill small" href="shop.html?scent=${encodeURIComponent(name)}#products">Shop ${esc(name)} <span class="dot">·</span></a>
          <button class="pill ghost small" type="button" data-again>Start again</button>
        </div>`
      root.dataset.result = name
    }
    root.dataset.step = String(step)
    if (focus) { const h = stage.querySelector('.quiz-ask'); if (h) h.focus({ preventScroll: true }) }
  }
  stage.addEventListener('click', e => {
    const a = e.target.closest('[data-answer]')
    if (a) { picks[step] = Number(a.dataset.answer); step++; draw(true); return }
    if (e.target.closest('[data-back]')) { step = Math.max(0, step - 1); picks.length = step; draw(true); return }
    if (e.target.closest('[data-again]')) { step = 0; picks = []; delete root.dataset.result; draw(true) }
  })
  draw(false)
  root.hidden = false
  window.__quiz = { step: () => step, result: () => (step >= QUESTIONS.length ? scents[result()] : null), questions: QUESTIONS.length }
}
