# Seed Scent website

This folder is the whole Seed Scent website. Nothing needs installing, building
or logging into. Copy the folder and you have copied the site.

**What it is:** one long home page that tells the story of the plantable car
air freshener (hang it, breathe, it fades, plant it), shows the three scents,
the spec sheet, bulk tiers and three ways for other VE firms to order, plus a
Team page (`team.html`) and a checkout page (`checkout.html`). It is built for
other Virtual Enterprise firms first, and for competition judges second.

**One rule:** the site never invents facts. Anything the team has not decided
yet shows as a dashed chip like `[ PRICE ]`. You fill those in from one file,
`js/config.js`, and the chips disappear.

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
- `name`: the company name as written on the site.
- `tagline`: the small line under the name. Keep the period.
- `descriptor`: the one-line description used in the hero kicker.

**contact**
- `email`: where the order-request form and the email checkout send orders. The single most important field.
- `phone`: a phone number, if the team wants one shown.
- `instagram`: the handle without the @. Shown on the business card.
- `tiktok`: the handle, for when a TikTok link is added.
- `linkedin`: the profile or page link, for when a LinkedIn link is added.

**school**
- `name`: the school. Shown in About, on the business card and in the footer.
- `city`: the city, shown next to the school.
- `state`: the state, shown next to the city.

**marketplaceUrl**: the web address of the firm's store on the VE marketplace. Powers the "Shop on the VE marketplace" button. Leave `null` if there is no store yet.

**checkout**
- `mode`: how the site's own checkout finishes. One of three words:
  - `"email"`: opens a prefilled order email to `contact.email` and shows the order summary on screen. The default. Works with no setup.
  - `"marketplace"`: sends the buyer to `marketplaceUrl` to finish there.
  - `"gateway"`: sends the order to `gatewayUrl`, the payment address VE gives the firm.
- `gatewayUrl`: the VE payment address. Only used when `mode` is `"gateway"`.

**currency**: the three-letter code used to format prices, normally `"USD"`.

**scents** (three entries, one per scent)
- `id`: an internal name, leave it alone.
- `name`: the scent's name, for example the one printed on the pack.
- `notes`: one short line describing the smell.
- `price`: price for one unit, as a number.
- `packSize`: what one unit is, for example "1 disc and holder" or "3 refill discs".
- `image`: the photo file for this scent's card. See section 3.
- `accent`: which brand colour tints this scent's 3D tag: `"ink"`, `"moss"` or `"sage"`.

**bulkTiers** (four entries, for firm orders)
- `min`: the quantity where this tier starts. Leave as is unless the tiers change.
- `label`: the text shown for the tier, for example "10+".
- `price`: the per-unit price at that quantity, as a number.

**leadTime**: how long an order takes, for example "Ships in 5 school days".

**paymentTerms**: how firms pay, for example "Invoice through the VE bank".

**product**
- `seeds`: what is in the paper. Currently "wildflower mix".
- `seedsConfirmed`: set to `true` once the seed mix is final. Removes the "tbc" tag next to it.
- `scentDuration`: how long the scent lasts, for example "about three weeks".
- `daysToSprout`: how long until the first sprouts, for example "7 to 14 days".
- `paperSource`: what the paper is made from, for example "recycled cotton fibre".
- `fixativeName`: the fixative ingredient, if the team decides to name it. Leave `null` to keep "a natural, plant-based fixative".
- `plantingSteps`: the four planting instructions, one per line in quotes. Edit the words, keep the quotes and commas.
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

Scent photos: the three scent cards read their file names from `js/config.js`
(`scents[0].image`, `scents[1].image`, `scents[2].image`). Right now they
point at three generated mock-up images:

- `images/product-studio-1.jpg`
- `images/product-mirror-2.jpg`
- `images/product-mirror-1.jpg`

### Swap the generated product photos for real ones

When the real product is photographed, either:

1. Keep the file names. Save your real photo over the old file with the same
   name, then reload. Nothing else changes.
2. Or use new names. Drop the new files into `images/` (say `scent-1.jpg`,
   `scent-2.jpg`, `scent-3.jpg`) and change the `image:` value of each scent
   in `js/config.js` to match. Delete the old mock-ups when you are done.

Photo tips: JPG, landscape or square, about 1600 pixels on the long side,
under 500 KB each if you can. Big files make the page slow on booth wifi.

---

## 4. Put it online for free

Everything the site needs is in this folder, so hosting is drag and drop.
The `tools/` folder is only for checks and screenshots; you can leave it out
of what you upload.

### Netlify Drop (fastest, no account to start)

1. Go to https://app.netlify.com/drop
2. Drag this whole folder (the one containing `index.html`) onto the page.
3. You get a link like `https://something-random.netlify.app` within a minute.
4. To keep the site longer than a day or rename it, make a free Netlify
   account, then Site settings, Change site name.

To update the site, open the site in Netlify, go to Deploys, and drag the
folder again.

### GitHub Pages

1. Make a free GitHub account and a new repository, for example `seed-scent`.
2. Push this folder to it (GitHub Desktop is the easiest way: add the folder,
   commit, publish).
3. In the repository, open Settings, then Pages. Under "Build and deployment"
   choose Source: Deploy from a branch, Branch: `main`, Folder: `/ (root)`. Save.
4. After a minute the site is live at `https://YOUR-NAME.github.io/seed-scent/`.

Every later push updates the site automatically.

---

## 5. The placeholder report

The report lists everything still marked as a placeholder, every photo the
config expects but cannot find, and every fact still marked unconfirmed.

It needs Node.js (free, from https://nodejs.org). Open Terminal (Mac) or
Command Prompt (Windows), go to this folder, and run:

    node tools/placeholders.mjs

Tip for going to the folder: type `cd ` with a space, drag the folder into the
window, press Return.

If you do not have Node, the site itself is the report: every dashed chip on
the page is a value still set to `null` in `js/config.js`.

---

## 6. Before the trade show

- [ ] Fill every placeholder in `js/config.js`. Run the report and get it to "0 placeholders to fill".
- [ ] Set `seedsConfirmed` and `plantingConfirmed` to `true` once those are final.
- [ ] Put the real product photos and team photos in `images/`.
- [ ] Pick the `checkout.mode` you will use at the show and test it once end to end.
- [ ] Send one test order from the order form and check it reaches `contact.email`.
- [ ] Add one scent to the bag, open the bag, check the tier and total look right.
- [ ] Turn off wifi, double-click the start file, and scroll the whole page once. Everything should still load.
- [ ] Do that on the actual booth laptop, not just your own.
- [ ] Set the booth laptop so the screen does not sleep, and bring the charger.
- [ ] Keep a copy of the folder on a USB stick, and the public link on a card, in case the laptop dies.
- [ ] Try the public link (Netlify or GitHub Pages) on a phone.

---

## What is in the folder

- `index.html`, `team.html`, `checkout.html`: the pages.
- `js/config.js`: the facts. The only file most people ever edit.
- `images/`: photos. Drop files in, see section 3.
- `brand/`: logo cut-outs from the brand deck. Do not recolour or stretch them.
- `css/`, `js/`: the design and the moving parts. Edit only if you know what you are doing.
- `fonts/`: self-hosted fonts and their licence notes (`fonts/LICENSES.md`).
- `vendor/`: the animation, 3D and physics libraries, stored locally so the site runs offline.
- `tools/`: the placeholder report and screenshot scripts. Not needed to run the site.
- `docs/`: the original design spec.
- `start.command`, `start.bat`: double-click to run the site on a Mac or on Windows.
