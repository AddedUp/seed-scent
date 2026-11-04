# Seed Scent website: design and storyboard

Date: 2026-11-04. Status: draft for approval.

## 1. What this is for

Seed Scent is a Virtual Enterprise (student-run) company selling a biodegradable
car air freshener made of plantable seed paper. The paper is scented with
natural essential oils plus a plant-derived fixative that makes the scent last.
When the scent fades, you plant the paper and it grows.

The site is seen by trade-show and competition judges and by buyers on the VE
marketplace, but it is built first for **other VE firms we want to do business
with**. A firm landing on the site should, within a minute:

1. understand the product and the "scent to sprout" idea,
2. trust that Seed Scent is an organized, professional company,
3. know exactly how to order (bulk tiers, order form, cart, marketplace link).

The one thing to remember: **the product doesn't end when the scent does.**

Facts come only from the brand deck and the owner's answers. Anything unknown
is a visible `[PLACEHOLDER]`, never an invented number, review or claim.

## 2. Decisions from the question round

| Topic | Decision |
|---|---|
| Pages | One long home page + a separate Team page |
| Ordering | Order-request form **and** VE marketplace link **and** a cart with checkout |
| Checkout | Final "pay" step is swappable (email summary now; marketplace redirect or VE gateway later) |
| Bulk pricing | Yes, tiers shown with `[PRICE]` placeholders |
| Scents | Three scents, placeholder names and prices |
| Seeds | Wildflower mix (planting steps marked as placeholder until confirmed) |
| Fixative | Described as "a natural, plant-based fixative"; an `[INGREDIENT]` slot exists if they decide to name it |
| Company details | Placeholders now; real team, school, city, email, socials sent after the build |
| VE rules | None known, beyond "A Virtual Enterprise company" in the footer |
| Visuals | Product photos not final: every photo is a named, swappable slot. 3D uses the logo cutouts |
| Fonts | Free lookalikes: Fraunces (for Margin), Sniglet (for Kawaii RT), Hanken Grotesk (for HK Gothic) |
| Name | "Seed Scent" in text; mission statement adjusted to match |
| Hosting | Plain static files. Must work from a free public link **and** offline on a booth laptop |

## 3. Brand

Colors (exact, from the deck). No new hues; lighter or darker tints of these are allowed.

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#fbf6e5` cream | page background, type on dark |
| `--ink` | `#203419` deep forest | logo, body text, buttons, "soil" |
| `--moss` | `#587541` | headings, tagline, links, accents, registration marks |
| `--sage` | `#a8c88f` | alternate section surfaces, the "card" panel |

Readability rules: ink or moss on cream; ink on sage; cream on ink. Cream on
sage only for very large display type.

Type (self-hosted woff2, OFL licensed):

- **Fraunces** (variable: wght 300 to 900, SOFT axis near 100) stands in for
  Margin: headings, the tagline, the giant chapter words.
- **Sniglet** 800 stands in for Kawaii RT: two or three single-word punches only.
- **Hanken Grotesk** stands in for HK Gothic: body text and the utility layer
  (10 to 12 px caps, tracking 0.08em, moss).

Logo assets (transparent PNG, cut from the deck, in `brand/`):
`logo-primary.png`, `logo-on-sage.png` (cream-outlined), `mark-s-hanging.png`,
`mark-ss-sprout.png`, `mark-ss.png`. Never redrawn, recolored or stretched.

Tagline: "from scent to sprout." (lowercase, with the period.)

Mission (adjusted spelling only): "At Seed Scent, our mission is to redefine
everyday freshness by creating innovative, plantable air fresheners that reduce
waste, inspire sustainable choices, and turn small everyday actions into
lasting environmental impact."

## 4. Art direction

**Material world: paper cutouts.** The product is die-cut seed paper and the
logo is drawn as flat, bubbly shapes, so the whole 3D world is made of flat
paper shapes in the brand colors: the S on its twine, the leaves, the sprout.
No photoreal plastic, no glow, no particles beyond a few scent wisps.

- **Light, warm page.** Cream paper. Sage is the "card" surface. Deep forest
  appears once, as soil, in the middle of the story. Moss is punctuation.
- **Two-scale typography.** Huge soft Fraunces headings in sentence case
  against tiny moss caps labels. Numbers are design elements: chapter indices
  ("01 HANG IT"), day counters, tier quantities.
- **The card motif.** The brand deck's business card (sage rounded rectangle,
  hanging logo) becomes the site's frame: the page opens on it and closes on it.
- **Registration marks** (`+`, moss, 10 px) on panel corners. Pill buttons in
  ink with cream text and a moss dot. Rounded geometry everywhere (24 px).
- **Copy voice:** warm, droll, sensory. Short sentences. Fragments as chapter
  titles. No em dashes, no "elevate", no filler.
- **Scroll cue:** "SCROLL TO DRIVE". Scrolling swings the freshener the way
  cornering swings one on a mirror.

Positioning against the references: light and warm where Oryzo is dark and
warm; paper and twine where Lusion is glossy plastic. Mechanics borrowed
(pinned object, text behind object, a line-drawing transition, a card that
becomes the world) are all recostumed in paper.

## 5. The signature interaction

The hero is **the logo come alive.** The big S from the wordmark hangs on a
real simulated twine string (Rapier physics: rope joints, gravity, damping).
The letters "eed" and "cent" and the leaves stay printed in place next to it,
so the S swings away from its own word and back.

- Cursor is a physical object: brushing the S shoves it; a fast flick sends
  it swinging and twisting (the twist shows the paper is flat).
- Scroll velocity acts like the car cornering: the S swings with every scroll.
- Grab and throw: drag the S and let go. Lenis is paused while dragging.
- Touch: tap or drag does the same; when idle, a slow breeze keeps it moving.
- Reduced motion: static pose, no swing, no scrubbed choreography.

The same S-shaped paper tag is the **stand-in for the product** in 3D. Its
silhouette comes from one alpha mask file (`brand/product-shape.png`,
defaulting to the S cutout). If the real product is a different shape, that
one file is swapped and every 3D freshener follows.

## 6. Page map and storyboard

One persistent transparent canvas fixed over the page. One master scroll
progress, split into chapters whose ranges come from spacer heights. Every
boundary names its match-cut anchor and bridges the background.

### Persistent UI

- Nav: small SS mark + "Seed Scent", links (How it works, Scents, Inside,
  For firms, Team, Contact), "Order ·" pill, "Bag (0)". Colors follow the
  chapter (ink on cream and sage, cream on soil).
- Sprout meter: a thin stem on the right edge that grows with scroll and
  unfolds two tiny leaves at the end. This is the progress indicator.
- Scroll cue pill bottom center on the hero only.

### Chapter 1: The card (3D establish)

Cream page. A sage rounded panel, inset from the edges, with `+` marks. The
logo hangs inside it: the S on its twine, the printed letters beside it. Kicker
top left: "SEED SCENT · A PLANTABLE CAR AIR FRESHENER". Bottom left, in
Fraunces: "The air freshener that doesn't end when the scent does." Under it
one line of body: "Seed paper, natural essential oils, a plant-based fixative.
Hang it, breathe it, then plant it." Pills: "Order for your firm ·" and
"How it works".

Alive: physics S, magnetic pills, masked headline reveal.

**Cut to 2:** the sage panel grows until it fills the viewport (radius and
inset tween to zero). Anchor: the S stays exactly where it is while the card
becomes the world. Background bridges cream to sage.

### Chapter 2: The drive (hybrid, pinned, four beats)

Full-bleed sage. The S is pinned on the right third. Giant Fraunces words slide
behind it, one per beat, with a kicker and a short paragraph on the left:

- 01 HANG IT. "Loop it over the mirror. Seed paper weighs almost nothing, so
  it swings when you corner."
- 02 BREATHE. "Natural essential oils, held in the paper by a plant-based
  fixative so the scent lasts [SCENT DURATION]."
- 03 IT FADES. "Every air freshener fades. Most go in the trash. This one is
  just getting started." During this beat the S drains from deep forest to
  pale seed paper with visible seed flecks, and the few scent wisps thin out.
- 04 PLANT IT. "Tear it, press it into soil, water it. The paper breaks down
  and the seeds take over." The background darkens from the bottom as a soil
  line rises; the string lowers the paper S into it until it is gone.

Alive: physics still running (cursor and scroll), pointer parallax on the
background words, the words drift with the pointer.

**Cut to 3:** anchor is the soil line and the point where the S went under.

### Chapter 3: The sprout (vector)

Deep forest (soil) background. From the burial point, a cream line drawing of
a sprout draws upward (stroke scrub), two leaves unfolding in the shape of the
logo's leaves. A day counter ticks in tiny caps: "DAY 01" to "DAY [N]"
alongside "[SEED TYPE: WILDFLOWER MIX]". Kicker: "FROM SCENT TO SPROUT."

Alive: the drawing scrubs with scroll direction; leaves lean toward the
pointer.

**Cut to 4:** the stem keeps growing until it reaches the top of the screen,
light returns (soil bridges to cream from the top down), and the line becomes
a string: three paper fresheners slide down three strings into view.

### Chapter 4: Three scents (3D row + 2D cards)

Cream. Three seed-paper S tags hang in a row and bump into each other; poke,
swing, drag them. Under each, a label projected from 3D: "01 [SCENT NAME] ·
[PRICE]". Title: "Three scents, one happy ending." Below the row, three detail
cards (photo slot, notes placeholder, pack size placeholder, "Add to bag").

Alive: three-body physics, projected labels, hover-tilt cards, add-to-bag
micro animation.

**Cut to 5:** the fresheners drift up and out as the spec table slides in with
the same motion; cream continues.

### Chapter 5: What's inside (2D spec)

"What's in the paper." A spec table in the warm-technical voice:

| Row | Value |
|---|---|
| Paper | plantable seed paper, [PAPER SOURCE] |
| Seeds | wildflower mix |
| Scent | natural essential oils |
| Fixative | plant-based, [INGREDIENT] |
| Lasts | [SCENT DURATION] |
| After | plant it; sprouts in [DAYS TO SPROUT] |
| End of life | biodegradable |

Beside it, an interactive cross-section of the paper: fibres, seeds and oil
droplets drawn in SVG; seeds jiggle under the cursor. Below, "How to plant it"
in four numbered steps (placeholder until confirmed).

Alive: cross-section reacts to pointer, velocity skew on rows, hover reveals.

### Chapter 6: For VE firms (2D, the business section)

"Stock it in your store." A quantity slider that lights up the matching bulk
tier (10+, 50+, 100+ units, prices as `[PRICE]`), a note on lead time
`[LEAD TIME]`, and three ways to order side by side:

1. Order-request form (firm, contact name, email, scent, quantity, notes).
   Submitting opens a prefilled email to `[CONTACT EMAIL]` and shows the
   summary on screen with a copy button.
2. "Shop on the VE marketplace" button to `[MARKETPLACE URL]`.
3. "Add to bag" and check out on the site.

Alive: slider, magnetic buttons, live tier highlight, form validation.

### Chapter 7: About (2D)

The mission statement set large, "[SCHOOL] · [CITY, STATE]", a short line on
the team with a link to the Team page, and social placeholders.

**Cut to 8:** the About section ends in a sage business-card block (DOM). Its
rectangle is measured and becomes the 3D panel: the card from chapter 1 is back.

### Chapter 8: The business card (3D finale)

Sage card, inset again. The SS-with-sprout mark hangs inside it on its string,
swinging, with the contact details typeset on the card like the deck's business
card: "Seed Scent · from scent to sprout. · [CONTACT EMAIL] · [SCHOOL] ·
[CITY, STATE]" and the "Order ·" pill.

Footer, tiny caps, three fragments: "A VIRTUAL ENTERPRISE COMPANY" ·
"[SCHOOL] · [CITY, STATE]" · "SMELLS GREAT. LEAVES EVENTUALLY."

### Team page (`team.html`)

Same shell and nav. Small sage panel with the hanging S (same physics module).
Title: "The people behind the paper." Grid of team cards: photo slot, `[NAME]`,
`[ROLE]`, one-line bio placeholder. Hover tilt. Footer as above.

### Bag and checkout

- Bag drawer slides in from the right: line items, quantities, bulk tier
  applied automatically, totals shown as `[TOTAL]` until prices exist.
- `checkout.html`: firm details form + order summary. The final button reads
  from config: `email` (opens a prefilled order email and shows the summary),
  `marketplace` (redirects to the marketplace URL), or `gateway` (posts to a
  URL VE provides). Default: `email`.
- Bag persists in localStorage.

## 7. Swappable data: one config file

`js/config.js` holds every fact that can change: scent names, notes, prices,
pack sizes, bulk tiers, lead time, contact email, marketplace URL, checkout
mode, school, city, state, socials, team members, seed type, planting steps,
scent duration. A `null` value renders as a visible `[PLACEHOLDER]` chip.
Photo slots are fixed file names in `images/` (`scent-1.jpg`, `scent-2.jpg`,
`scent-3.jpg`, `product-hero.jpg`, `team-1.jpg` ...); dropping a file in
replaces the placeholder with no code change.

## 8. Technical plan

- Plain HTML, CSS and ES modules. No framework, no build step.
- Vendored locally for offline use: three 0.170, GSAP 3.13 (ScrollTrigger,
  SplitText), Lenis 1.1, Rapier 3d-compat 0.14. Fonts self-hosted. Zero
  network requests at runtime.
- `start.command` (Mac) and `start.bat` (Windows) start a local server and
  open the site for the booth laptop. Deploy by dragging the folder into
  Netlify Drop or pushing to GitHub Pages.
- Files: `index.html`, `team.html`, `checkout.html`, `css/tokens.css`,
  `css/site.css`, `js/config.js`, `js/main.js`, `js/scroll.js` (Lenis +
  ScrollTrigger bridge, chapter map), `js/scene.js` (renderer, environment,
  paper materials, texture from mask), `js/physics.js` (rope + paper tag,
  cursor body, grab), `js/chapters.js` (choreography), `js/sections.js`
  (2D interactivity), `js/cart.js`, `js/ui.js` (nav, cue, sprout meter,
  magnetic, split reveals), `vendor/`, `fonts/`, `brand/`, `images/`.
- Debug handle `window.__dbg` exposes progress, chapter, S pose and bag state
  so behavior can be verified with numbers.

## 9. Performance and accessibility

- Device pixel ratio capped at 2; one scene, under 10 physics bodies at any
  time; textures downscaled to 1024 px.
- Phones: same experience with smaller type, the three-scent row scaled down,
  touch drag on the paper tags.
- `prefers-reduced-motion`: Lenis off, physics posed statically, every
  section visible without scrub, no auto motion. A "Pause motion" toggle in
  the nav does the same on demand.
- Semantic sections, labelled form fields, focus states, 4.5:1 contrast on
  all body text.

## 10. Verification before it is called done

1. Shell screenshot with the canvas hidden reads as a finished brand site.
2. Hero physics checked with numbers: the S settles under the anchor, cursor
   contact changes its velocity, scroll impulse changes its angle.
3. Every chapter boundary scrubbed slowly; no seam without its named anchor.
4. Wiggle test at every scroll position: something moves.
5. Screenshots at six scroll positions on desktop and phone widths, light and
   reduced-motion.
6. Copy sweep against the ban list (em dashes, filler, invented facts).
7. Network panel shows zero external requests; site runs from the start
   script with wifi off.
8. Placeholder report generated and handed over.

## 11. Build log (what changed after approval)

- **The product is not the S.** During the build the owner shared two mockups: a
  round walnut wood holder with a seed paper disc inside, hanging from the mirror on
  a jute cord with a wooden bead, and a vent-clip version with a ring of holes. The 3D
  object is now that pendant (ring, paper disc, cord, bead), built procedurally. The
  logo stays printed beside it in the hero and as the mark printed on the paper disc.
- **The story adapted:** on "Plant it" the disc pops out of the holder and sinks
  into the soil; the holder stays (refills slot in). Copy and the spec table say so,
  with "tbc" chips on the holder, refill and vent-clip claims until the team confirms.
- **Photos:** eight product photos were generated to match the mockups and live in
  `images/` (mirror hanger, studio shots, vent clip, refill flat lay, sprouting pot,
  a seed paper macro used as the 3D paper texture, and a three-scents row that is
  not shown because it would imply lavender, orange and mint as the scents).
- **Chapter model:** each chapter has `enter` (its stage arriving while the previous
  one leaves) and `pin` (its stage pinned). Transitions run on `enter`, content on
  `pin`, so chapters tile the page with no gaps and every cut has both frames on screen.
- **Hero tuning:** paper and wood are light, so the cursor is a small ball, speeds
  are capped, and a big jump of a hang point snaps the chain instead of tearing it.

- **Review round.** Six independent reviewers (copy and claims, interactions, chapter
  seams, config swap, resilience, design) ran against the finished build. What changed as
  a result: tier breakpoints and the holder/refill/vent-clip claims now carry "tbc" chips
  bound to `tiersConfirmed` and `product.formatConfirmed`; the sprout chapter counts days
  only when `product.daysToSprout` is set (otherwise it says "Day one, Day after day,
  First sprouts"); "Three scents, one happy ending" became "Three scents. All of them
  grow."; the end-of-life row no longer says "biodegradable" as a blanket claim; the
  finale pendant no longer gets trapped under the hero's physics floor; the hero copy
  fades as the card opens; ink text leaves before the ink soil reaches it; the sprout
  copy exits before the wipe; chips follow their discs in and out of the frame; a
  cursor "wind" and a small scene slide mean a wiggle anywhere near the pendant counts;
  the nav gets a cream scrim over the flat sections; prices typed as text ("4.50") work
  everywhere and bad values keep their chip; the site boots without WebGL; the skip
  link, anchor offsets, menu focus and contrast on sage were fixed; the buyer-facing
  checkout no longer talks about config files; the placeholder report checks types,
  photo paths and checkout modes.

## 12. Open assumptions to confirm

- The S-shaped tag stands in for the product in 3D until photos arrive (one
  mask file to swap).
- Sage is the dominant background through the story chapter; deep forest
  appears only during the planting and sprout beats.
- The footer joke line and all sample copy are drafts the team can edit.
