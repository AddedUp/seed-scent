/* The blank template for the check-*.mjs suites.

   The suites assert how the pages behave: chips for unknown values, chips going
   away when values arrive, tbc tags, the bag, the forms. They must keep passing
   while the real js/config.js fills up with the firm's facts, so they never read
   it. Each browser context is handed fixtures/config.blank.js instead: the
   config exactly as it shipped, with every unknown still null.

   check-facts.mjs is the one check that reads the real config.

   Use:
     import { blankConfig, BLANK } from './fixture.mjs'
     const ctx = await browser.newContext(...)
     await blankConfig(ctx)                                  // the shipped template
     await blankConfig(ctx, 'window.SEED_SCENT.x = 1;')      // template plus test-only values

   Calling blankConfig again on the same context replaces the earlier answer
   (the newest route wins). If config.js gains or loses a line, copy the change
   into fixtures/config.blank.js with its value set back to null. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/* the text of the blank config, for suites that parse it (photo paths and the like) */
export const BLANK = fs.readFileSync(path.join(here, 'fixtures', 'config.blank.js'), 'utf8')

/* answer every request for js/config.js in this context with the blank template, plus `append` */
export async function blankConfig(ctx, append = '') {
  await ctx.route('**/js/config.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    body: append ? `${BLANK}\n${append}\n` : BLANK,
  }))
}
