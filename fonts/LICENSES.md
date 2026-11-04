# Fonts used on the Seed Scent site

The brand deck uses three typefaces that are not free to redistribute: Margin,
Kawaii RT and HK Gothic. The website uses free lookalikes instead, so the site
can be copied, hosted and handed over without buying or sharing licences.

| On the deck | On the site | Where the site uses it | Files in this folder |
|---|---|---|---|
| Margin | Fraunces (variable, weights 100 to 900, SOFT axis) | headings, the tagline, the giant chapter words | `fraunces-normal-100-900.woff2` |
| Kawaii RT | Sniglet (400 and 800) | a few single-word punches | `sniglet-normal-400.woff2`, `sniglet-normal-800.woff2` |
| HK Gothic | Hanken Grotesk (variable, weights 300 to 800) | body text and the small uppercase labels | `hanken-normal-300-800.woff2` |

`fonts.css` declares the three families. `fraunces.css`, `sniglet.css` and
`hanken.css` are the original stylesheets the files were taken from, kept for
reference.

## Licence

All three fonts are published under the SIL Open Font License, Version 1.1
(OFL 1.1). The full licence text and each font's licence page are here:

- Fraunces: https://fonts.google.com/specimen/Fraunces (licence on the About tab)
- Sniglet: https://fonts.google.com/specimen/Sniglet
- Hanken Grotesk: https://fonts.google.com/specimen/Hanken+Grotesk
- The OFL 1.1 text: https://openfontlicense.org/open-font-license-official-text/

In plain words, the OFL lets us:

- use the fonts on a website and ship the font files with it (what we do here),
- host them ourselves so the site works offline,
- use them in print and in the brand deck if the team ever wants to.

It does not let anyone sell the font files on their own. If someone modifies
the font files themselves (not the CSS, the actual .woff2 files), the licence's
Reserved Font Name rules apply, so read the licence before doing that. Copying
the files as they are is fine.

## Credits

- Fraunces: Undercase Type (Phaedra Charles and Flavia Zimbardi)
- Sniglet: Haley Fiege
- Hanken Grotesk: Hanken Design Co. (Alfredo Marco Pradil)

The JavaScript libraries in `vendor/` have their own licence file, `vendor/LICENSE`.
