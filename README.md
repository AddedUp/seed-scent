# Seed Scent website

This folder is the whole Seed Scent website. Nothing needs installing, building
or logging into. Copy the folder and you have copied the site.

**Live site:** https://seedscent.com (GitHub Pages, served from the `main`
branch of https://github.com/AddedUp/seed-scent; every push updates it within
about a minute, see section 4). The old address
https://addedup.github.io/seed-scent/ and www.seedscent.com both forward to it.

**What it is:** one long home page that tells the story of the plantable car
air freshener (hang it, breathe, it fades, plant it), shows the three scents,
the spec sheet, bulk tiers and three ways for other VE firms to order, plus a
Shop page (`shop.html`) with every product in one place, a Team page
(`team.html`) and a checkout page (`checkout.html`). It is built for
other Virtual Enterprise firms first, and for competition judges second.

**One rule:** the site never invents facts. Anything the team has not decided
yet shows as a dashed chip like `[ PRICE ]`. You fill those in from one file,
`js/config.js`, and the chips disappear.

**What the chips mean:** a dashed `[ chip ]` is a value that is still `null`
in `js/config.js`, or one the page cannot use as typed (a price in quotes, an
Instagram handle with a space in it, an email address that is not one); fill
it in properly and the chip goes. A small `tbc` tag is a fact
the team has not confirmed yet (the seed mix, the holder and mount formats,
the planting steps, the bulk tiers). Each tag is tied to a `...Confirmed`
flag in the same file; set the flag to `true` and the tag goes.

---

## 1. Open the site

### On a Mac

Double-click `start.command`. A Terminal window opens, starts a tiny web
server, and your browser opens the site at `http://127.0.0.1:3001/`.
Keep the Terminal window open while you use the site. Close it to stop.

If the Mac says the file cannot be opened:

- "cannot be executed because you do not have permission": open Terminal,
  type `chmod +x ` (with a space after it), drag `start.command` into the
  window, press Return, then double-click the file again.
- "from an unidentified developer": right-click the file, choose Open.
- It asks to install "command line developer tools": say yes. That installs
  Python, which the server uses. Internet is needed once for that.

### On Windows

Double-click `start.bat`. A black window opens, starts the server, and your
browser opens the site. Keep the window open while you use the site.

If Windows shows "Windows protected your PC", click "More info", then
"Run anyway". If the window says Python was not found, install Python 3 from
python.org (keep "py launcher" ticked in the installer) and try again.

### Any other way

The site is plain files, so any static web server works. Serve this folder
and open its address. Opening `index.html` directly by double-clicking does
not work: browsers block the moving parts when there is no server.

Both start files work with no internet connection. Everything the site needs
(fonts, 3D engine, animation libraries) is inside this folder.

---

## 2. Edit the facts: `js/config.js`

Open `js/config.js` in any text editor (TextEdit in plain-text mode, Notepad,
or better, VS Code). Change a value, save, then reload the page in the browser
(hold Shift while clicking reload if the old value sticks).

Rules of the file:

- Text goes in double quotes: `name: "Sea Mist",`
- Numbers do not: `price: 4.5,` means $4.50
- `null` means "not decided yet" and shows a dashed chip on the site
- `true` and `false` have no quotes
- Every line inside the braces ends with a comma. A missing comma breaks the
  whole page, so if the site goes blank, check the last thing you typed.

What each field does:

**brand**
- `name`: the company name.
- `tagline`: the small line under the name. Keep the period.
- `descriptor`: a one-line description of the product.
- Note: the home page has these three typeset into its design, so editing them here does not rewrite the home page. They live here so every page and future edit agrees on the spelling.

**contact**
- `email`: where the order-request form and the email checkout send orders. The single most important field. Type the address on its own, like `"orders@school.org"`. On the business card it becomes a link that opens an email. If the chip stays after you fill it in, the value is not an address an email app can use, and no order email is sent until it is; the report (section 5) says so under Looks wrong.
- `phone`: a phone number, if the team wants one shown.
- `instagram`: the handle, for example `"seedscent.ve"`. An @ in front or a pasted profile link works too. Shown on the business card as a link that opens the profile in a new tab. If the chip stays after you fill it in, the value is not a handle Instagram accepts (letters, numbers, dots and underscores, 30 at most), or the link is to a post and not to the profile; the report says so under Looks wrong.
- `tiktok`: the handle, for when a TikTok link is added.
- `linkedin`: the profile or page link, for when a LinkedIn link is added.

**school**
- `name`: the school. Shown in About, on the business card and in the footer.
- `city`: the city, shown next to the school.
- `state`: the state, shown next to the city.

**marketplaceUrl**: the web address of the firm's store on the VE marketplace, starting with `https://`. Powers the "Shop on the VE marketplace" button on the home page, and the checkout when `checkout.mode` is `"marketplace"`. Leave `null` if there is no store yet; the button stays greyed out.

**checkout**: how the checkout page (`checkout.html`) finishes an order. The buyer fixes the quantities, fills in their firm, a contact name and an email, and presses one button. What that button does is set by `mode`, one of three words:

- `mode: "email"`: the default. The button opens the buyer's email app with the order written out and addressed to `contact.email`, and the same text stays on screen with a Copy button. Needs: `contact.email`. While that is still `null`, the order is written out on screen for the buyer to copy and the page says so.
- `mode: "marketplace"`: the button sends the buyer to the firm's VE marketplace store in a new tab, and a second button writes the order out so they can paste it there. Needs: `marketplaceUrl`. While that is `null`, the button is greyed out and the page says the link is not set.
- `mode: "gateway"`: the button posts the order (lines, quantities, tier, total, the buyer's details) to the payment address VE gives the firm. Needs: `gatewayUrl`. While that is `null`, the button is greyed out.
- Any other word is a mistake. Use exactly one of the three; the placeholder report flags anything else.
- `gatewayUrl`: the VE payment address, starting with `https://`. Only used when `mode` is `"gateway"`.

**currency**: the three-letter code used to format prices, normally `"USD"`.

**scents** (exactly three entries, one per scent; the home page is typeset for three cards)
- `id`: an internal name, leave it alone.
- `name`: the scent's name, for example the one printed on the pack.
- `notes`: one short line describing the smell.
- `price`: price for one unit, as a number without quotes: `price: 4.5`, not `price: "4.50"`.
- `packSize`: what one unit is, for example "1 disc and holder" or "3 refill discs".
- `image`: the photo of this scent's mirror cord version, starting with `images/`. See section 3.
- `imageVent`: the photo of this scent's vent clip version. The card shows `image` while Mirror cord is picked and switches to `imageVent` when the visitor picks Vent clip. If that file is missing, the card keeps the mirror cord photo.
- `accent`: a brand colour name for the scent, `"ink"`, `"moss"` or `"sage"`, kept with the scent so anything that colour-codes the three agrees on it.

**shop** (one entry per card on the Shop page, `shop.html`, shown in this order)
- It starts with six entries: each scent on a mirror cord and on a vent clip. Those look like `{ id: "scent-1-mirror", scent: 0, format: "mirror" }`, where `scent: 0` is the first scent in `scents` above and `format` is `"mirror"` or `"vent"`. The card takes the scent's name, notes, pack size, price and photo (`image` for mirror, `imageVent` for vent), so there is nothing to fill in here for them.
- To sell something else, add an entry with its own details and a new `id`, for example `{ id: "refill-pack", name: "Refill discs", notes: "One line about it", packSize: "What is in the pack", price: 5, image: "images/refill-pack.jpg" },`. It gets its own card, goes in the bag as its own line, and is priced at its own `price`. Only the air fresheners count toward the bulk tiers; the bag says so when the shop sells anything else.
- Every `id` must be different. To take a product off the shop, delete its line. A shopper who already had it in their bag simply sees it drop out.
- The bag is shared: something added on the Shop page is in the bag on the home page and at checkout, and the other way round.

**bulkTiers** (four entries, for firm orders)
- `min`: the quantity where this tier starts. Leave as is unless the tiers change.
- `label`: the text for the tier, for example "10+". The home page tier list is typeset to match these four (1 to 9, 10+, 50+, 100+), so if the tiers themselves change, the words in `index.html` need changing too.
- `price`: the per-unit price at that quantity, as a number. This is the value the dashed `[ PRICE ]` chips are waiting for.

**tiersConfirmed**: `false` while the four quantity breakpoints are still a draft, which shows a small "tiers tbc" tag next to the quantity slider in the firms section. Set it to `true` once the team fixes the tiers and the tag goes.

**leadTime**: how long an order takes, for example "Ships in 5 school days".

**paymentTerms**: how firms pay, for example "Invoice through the VE bank".

**product**
- `seeds`: what is in the paper. Currently "wildflower mix". The home page has those words typeset, so if the mix changes, the words in `index.html` need changing too.
- `seedsConfirmed`: set to `true` once the seed mix is final. Removes the "tbc" tag next to it.
- `formatConfirmed`: set to `true` once the holder, the refill discs and the two mounts (mirror cord, vent clip) are final. Until then a "tbc" tag sits on the format picker of each scent card, on the Holder, Mounts and End of life rows of the spec sheet, on the plant-it step of the story and on the two photo captions in the Inside section.
- `scentDuration`: how long the scent lasts, for example "about three weeks".
- `daysToSprout`: how long until the first sprouts, for example "7 to 14 days".
- `paperSource`: what the paper is made from, for example "recycled cotton fibre".
- `fixativeName`: the fixative ingredient, if the team decides to name it. Leave `null` to keep "a natural, plant-based fixative".
- `plantingSteps`: the four planting instructions, one per line in quotes. Edit the words, keep the quotes and commas. The small stage beside them (tear the paper, press it into the soil, water it, give it sun) lights each step up as the visitor does it, so keep four steps in that order: tear, press, water, sun. With any other number of steps the stage still works but leaves the list alone.
- `plantingConfirmed`: set to `true` once the steps are checked. Removes the "draft" note above them.

**team** (one entry per person, add or remove entries freely)
- `name`: the person's name.
- `role`: their job title in the firm.
- `bio`: one line about them.
- `photo`: their photo file, `images/team-1.jpg`, `images/team-2.jpg` and so on.

---

## 3. Add photos

All photos live in the `images/` folder. The site shows a photo only if the
file is actually there; otherwise it shows a labelled empty slot. No code
changes are needed, just the right file name.

Team photos: `team-1.jpg`, `team-2.jpg`, `team-3.jpg` ... matching the order
of the `team` list in `js/config.js`. Square or portrait works best. Any JPG
around 800 to 1200 pixels wide is plenty.

Scent photos: each scent card has two photos, one per format, and reads
their file names from `js/config.js`: `image` is the mirror cord version and
`imageVent` is the vent clip version. The card shows the one that matches
the format the visitor picks. Right now they point at generated mock-up
images. The three cards share one vent clip photo, so they all show the same
vent clip design:

| Card | Mirror cord (`image`) | Vent clip (`imageVent`) |
| --- | --- | --- |
| Scent one | `images/product-studio-1.jpg` | `images/product-vent-clip.jpg` |
| Scent two | `images/product-mirror-2.jpg` | `images/product-vent-clip.jpg` |
| Scent three | `images/product-mirror-1.jpg` | `images/product-vent-clip.jpg` |

`image` and `imageVent` must be different files; the report flags a scent
whose two photos are the same file, because the card would label a mirror
cord photo "Vent clip".

File names must match exactly, capitals included. A Mac will find
`Product-Studio-1.jpg` when the config says `product-studio-1.jpg`; a web
host will not, and the slot stays empty online. The placeholder report
(section 5) checks the exact name for you.

### The rest of the images folder

- `product-mirror-1.jpg` and `product-vent-clip.jpg`: besides their scent cards, these are the two photos in the Inside section (mirror cord version, vent clip version). That use is fixed in `index.html`, not in the config. The mirror photo is also the preview image when the link is shared.
- `product-studio-2.jpg`: a spare studio shot of the mirror cord version, not shown at the moment.
- `product-vent-studio.jpg`: a studio shot of a vent clip, kept in the folder but not shown: its holes are laid out differently from `product-vent-clip.jpg`, and the cards should agree on one design.
- `planted-pot.jpg`: the photo in the "How to plant it" block. The block opens as a small stage where the visitor tears a paper disc, presses the pieces into soil, waters them and gives them sun; this photo fades in when they finish, and it is what shows in place of the stage if scripts are off. Fixed in `index.html`.
- `paper-texture.jpg`: the paper grain on the 3D pendants and on the disc in the planting stage. Loaded by the site code.
- `refills-flatlay.jpg`: kept in the folder but not shown: the flat lay shows a different holder design from the one in the other photos.
- `three-scents-unused.jpg`: kept in the folder but not shown: a row of three discs implies three scent names, and the team has not chosen them.
- `team-1.jpg` and up: team photos, not in the folder yet (see above).

### Swap the generated product photos for real ones

When the real product is photographed, either:

1. Keep the file names. Save your real photo over the old file with the same
   name, then reload. Nothing else changes.
2. Or use new names. Drop the new files into `images/` (say `scent-1.jpg`
   and `scent-1-vent.jpg`, and so on) and change the `image:` and
   `imageVent:` values of each scent in `js/config.js` to match. Delete the
   old mock-ups when you are done.

Photo tips: JPG, landscape or square, about 1600 pixels on the long side,
under 500 KB each if you can. Big files make the page slow on booth wifi.

---

## 4. The site online

The site is live at **https://seedscent.com**. It is served by
GitHub Pages straight from the `main` branch of the repository
https://github.com/AddedUp/seed-scent (Settings, Pages: Deploy from a branch,
`main`, `/ (root)`). The `.nojekyll` file in the folder tells GitHub to serve
the files exactly as they are; keep it.

### The domain

`seedscent.com` was registered through Cloudflare on 2026-11-09, and Cloudflare
runs its DNS. These records send it to GitHub Pages; leave them as they are:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| A | `seedscent.com` | `185.199.108.153` | DNS only |
| A | `seedscent.com` | `185.199.109.153` | DNS only |
| A | `seedscent.com` | `185.199.110.153` | DNS only |
| A | `seedscent.com` | `185.199.111.153` | DNS only |
| CNAME | `www` | `addedup.github.io` | DNS only |
| TXT | `_github-pages-challenge-AddedUp` | (GitHub's verification code) | |

- Keep every record **DNS only** (grey cloud). Switched to Proxied, GitHub can no
  longer renew the site's HTTPS certificate.
- The `CNAME` file in this folder holds the domain name. GitHub Pages reads it;
  keep it, and keep it to the one line `seedscent.com`.
- The TXT record proves to GitHub that the domain belongs to the AddedUp account
  (GitHub, profile picture, Settings, Pages: "seedscent.com Verified"), so no other
  GitHub site can take the name. Leave it in place.
- The certificate for https://seedscent.com is issued and renewed by GitHub on its
  own; "Enforce HTTPS" is on in the repository's Settings, Pages.
- Cloudflare renews the domain once a year. Check that its auto-renew stays on
  (Cloudflare, Domains, Registrations), or the site goes dark when the year runs out.

The repository is public, which is what GitHub Pages needs on a free account.
Everything in this folder is therefore readable by anyone, so never put
passwords, personal addresses or unreleased numbers in it. The site itself
only shows what is in `js/config.js`.

### Updating the live site

Whatever lands on `main` is live about a minute later. Three ways to get a
change there, easiest first:

1. **In the browser.** Open the file on GitHub (for example
   https://github.com/AddedUp/seed-scent/blob/main/js/config.js), click the
   pencil, edit, then "Commit changes". Good for filling in the facts. For
   photos, open the `images` folder on GitHub, "Add file", "Upload files".
2. **GitHub Desktop.** Add this folder as a repository, make your edits, write
   a one-line summary, Commit, then Push.
3. **Terminal**, from inside this folder:

   ```
   git add -A
   git commit -m "Fill in the scent names and prices"
   git push
   ```

If a change does not show up, hard-refresh the page (Shift and Reload) or add
`?v=2` to the address; the browser may be holding the old copy. The build
log is under the repository's Actions tab, "pages build and deployment".

To check the live site the way the local checks do, from `tools/playwright`:
`SITE_BASE=https://seedscent.com/ node review-net.mjs`
(zero external requests, no 404s), `... node tour.mjs all` (the scroll
tour at desktop and phone sizes), `... node check-facts.mjs` (every fact
filled in so far shows where it should, and the Instagram link opens the
profile by click, tap and keyboard), `... node check-cord.mjs` (the pendants'
cords hold under every kind of pull), `... node check-format.mjs` (the card
photos follow the format picker) and `... node check-planting.mjs` (the
tear-and-plant stage by mouse, finger and keyboard).

### Backup: Netlify Drop

If GitHub is ever a problem, go to https://app.netlify.com/drop and drag this
whole folder (the one containing `index.html`) onto the page. You get a link
like `https://something-random.netlify.app` within a minute. To keep it longer
than a day, make a free Netlify account, then Site settings, Change site name.

---

## 5. The placeholder report

The report reads `js/config.js` and prints, in this order:

- **Still null**: every value still `null`, one per line. These are the dashed chips on the site. A line you deleted from a scent, tier or team entry is listed here too, with a note to add it back.
- **Optional, fine to leave null**: the handful that may stay empty (phone, TikTok, LinkedIn, the marketplace link, the gateway address when the mode does not use it, the fixative name).
- **Looks wrong**: values the page cannot use as they are: a price in quotes (`"4.50"` or `"abc"`), a `checkout.mode` that is not one of the three words, a store or gateway address the mode needs but is not set, a currency that is not a 3-letter code, a `...Confirmed` flag in quotes, the wrong number of scents or tiers, an empty team, an email address or an Instagram handle that is not one. Each line says what to change.
- **Photos the config points at**: each photo file with "ok" and its size, "MISSING", "must start with images/", or "found as ...: fix the capitals, web hosts care" when the only difference is capital letters.
- **Still marked to be confirmed**: every `...Confirmed` flag still `false` and what setting it to `true` removes.
- A summary line: "N placeholders to fill, M photos missing, K facts to confirm".

It needs Node.js (free, from https://nodejs.org). Open Terminal (Mac) or
Command Prompt (Windows), go to this folder, and run:

    node tools/placeholders.mjs

To check a copy of the config before you paste it over the real one:

    node tools/placeholders.mjs path/to/the-copy.js

Tip for going to the folder: type `cd ` with a space, drag the folder into the
window, press Return.

The report is a checklist, not a test: it prints and exits normally even when
things look wrong. If you do not have Node, the site itself is the report:
every dashed chip on the page is a value still set to `null` in `js/config.js`,
or one that is not usable as typed.

---

## 6. Before the trade show

- [ ] Fill every placeholder in `js/config.js`. Run the report and get it to "0 placeholders to fill" with nothing under Looks wrong.
- [ ] Set `seedsConfirmed`, `plantingConfirmed`, `formatConfirmed` and `tiersConfirmed` to `true` once those are final. The report should say "0 facts to confirm".
- [ ] Put the real product photos and team photos in `images/`.
- [ ] Pick the `checkout.mode` you will use at the show and test it once end to end.
- [ ] Send one test order from the order form and check it reaches `contact.email`.
- [ ] Add one scent to the bag, open the bag, check the tier and total look right.
- [ ] Turn off wifi, double-click the start file, and scroll the whole page once. Everything should still load.
- [ ] Do that on the actual booth laptop, not just your own.
- [ ] Set the booth laptop so the screen does not sleep, and bring the charger.
- [ ] Keep a copy of the folder on a USB stick, and the public link on a card, in case the laptop dies.
- [ ] Try the live link https://seedscent.com on a phone.

---

## What is in the folder

- `index.html`, `shop.html`, `team.html`, `checkout.html`: the pages.
- `js/config.js`: the facts. The only file most people ever edit.
- `images/`: photos. Drop files in, see section 3.
- `brand/`: logo cut-outs from the brand deck. Do not recolour or stretch them.
- `css/`, `js/`: the design and the moving parts. Edit only if you know what you are doing.
- `fonts/`: self-hosted fonts and their licence notes (`fonts/LICENSES.md`).
- `vendor/`: the animation, 3D and physics libraries, stored locally so the site runs offline.
- `tools/`: the placeholder report and screenshot scripts. Not needed to run the site.
- `docs/`: the original design spec.
- `start.command`, `start.bat`: double-click to run the site on a Mac or on Windows.
