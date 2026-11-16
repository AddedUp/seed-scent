/* ------------------------------------------------------------------
   Seed Scent site data.

   This is the ONE file to edit when facts change. Anything set to null
   shows on the site as a visible [PLACEHOLDER] chip until you fill it in.
   Photos are plain files: drop them into images/ with the names below
   and they replace the placeholders automatically.
   ------------------------------------------------------------------ */
/* The five signature scents, offered in the scent picker on The Vine and The Dandelion. */
const signatureScents = ["Citrus Grove", "Lavender", "Vanilla", "Linen", "Wildflowers"];

window.SEED_SCENT = {
  brand: {
    name: "Seed Scent",
    tagline: "from scent to sprout.",
    descriptor: "A plantable car air freshener",
  },

  /* Who to contact. The order form and checkout email go to contact.email. */
  contact: {
    email: "seedscent.ny@gmail.com",
    phone: null,
    instagram: "seedscent.ve",   // the handle; the business card links it to instagram.com/<handle>/
    tiktok: null,
    linkedin: null,
  },

  school: {
    name: "Syosset Senior High School",
    city: "Syosset",
    state: "New York",
  },

  /* Your store on the Virtual Enterprise marketplace, if you have one. */
  marketplaceUrl: null,

  /* How the site's own checkout finishes.
       "email"       -> opens a prefilled order email to contact.email and shows the summary
       "marketplace" -> sends the buyer to marketplaceUrl
       "gateway"     -> sends the order to gatewayUrl (the URL VE gives you)  */
  checkout: {
    mode: "email",
    gatewayUrl: null,
  },

  currency: "USD",

  /* The three scents. The team is using these names for now.
     image: the photo of the hanging version. imageVent: the photo of the vent clip version.
     The home page card shows whichever the visitor picks. price and packSize describe the refill
     pack a scent card adds to the bag (see scentRefill below). */
  scents: [
    { id: "scent-1", name: "Lavender",   notes: null, price: 5.99, packSize: "3 seed papers", image: "images/product-studio-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "ink" },
    { id: "scent-2", name: "Mint",       notes: null, price: 5.99, packSize: "3 seed papers", image: "images/product-mirror-2.jpg", imageVent: "images/product-vent-clip.jpg", accent: "moss" },
    { id: "scent-3", name: "Wildflower", notes: null, price: 5.99, packSize: "3 seed papers", image: "images/product-mirror-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "sage" },
  ],

  /* The Shop page (shop.html). One card per entry, shown in this order.
       id        its own short name, different for every entry
       name      the product's name            kicker   the small line above it
       notes     one or two sentences          contents what is in the box, one line each
       price     a number, 8.99 for $8.99      per      "month" makes it "$7.99 a month"
       image     the photo
       choice    one thing the buyer picks on the card:
                   { label: "Edition", options: ["Hanging", "Vent clip"] }
                   { label: "Scent", from: "scents" }     (the names in the scents list above)
       images    a photo for each option, when they differ: { "Hanging": "...", "Vent clip": "..." }
       veUrl     the shopper's link to this product's buy button on the VE marketplace (starts with
                 https://). With one, the card's button becomes "Buy on the VE marketplace" and the
                 product is not added to the bag here. Leave it out to keep Add to bag.
     To sell something new, copy an entry, give it a new id and change the rest. */
  shop: [
    { id: "the-vine", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-first-sprout-1010101/",
      name: "The Vine", kicker: "The First Sprout · hanging edition",
      notes: "A premium starter kit for those who want to make a change. This classic hangs from your rearview mirror.",
      contents: ["1 reusable wooden box, hanging", "3 seed papers in the scent you pick"],
      price: 8.99, image: "images/product-mirror-1.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-dandelion", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-first-sprout-1010101/",
      name: "The Dandelion", kicker: "The First Sprout · vent clip edition",
      notes: "A premium starter kit for those who want to make a change. This classic clips on to your interior car vents.",
      contents: ["1 reusable wooden box, vent clip", "3 seed papers in the scent you pick"],
      price: 8.99, image: "images/product-vent-clip.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-releaf", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-2020202/",
      name: "The Releaf", kicker: "Custom refill pack",
      notes: "Refills only. Buy a set of seed paper with the scent of your choice. The sustainable option.",
      contents: ["3 seed papers in the scent you pick"],
      price: 5.99, image: "images/product-releaf.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-releaf-monthly", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-2525252/",
      name: "The Releaf, Monthly", kicker: "Monthly refill plan",
      notes: "The Releaf on a monthly plan. Paid monthly on the VE marketplace, 12 payments in all.",
      contents: ["The Releaf every month for 12 months"],
      price: 5.99, per: "month", image: "images/product-releaf.jpg" },
    { id: "the-bloom", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-bloom-3030303/",
      name: "The Bloom", kicker: "Grow kit",
      notes: "Everything you need, start to finish. Complete with planting essentials, including a Seed Scent brand pot, quality soil, and shovels.",
      contents: ["1 reusable wooden box, hanging or vent clip", "3 seed papers, scents chosen for you", "Terracotta planting pot", "Soil", "Mini shovels"],
      price: 18.99, image: "images/product-bloom-hanging.jpg", choice: { label: "Edition", options: ["Hanging", "Vent clip"] },
      images: { "Hanging": "images/product-bloom-hanging.jpg", "Vent clip": "images/product-bloom-vent.jpg" } },
    { id: "the-garden", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-garden-4040404/",
      name: "The Garden", kicker: "Deluxe bundle",
      notes: "Everything you need and more. Includes two boxes, six seed papers, and a complete planting kit.",
      contents: ["2 reusable wooden boxes: 1 hanging, 1 vent clip", "6 seed papers, scents chosen for you", "Terracotta planting pot", "Mini shovels", "Scratch and smell stickers"],
      price: 28.99, image: "images/product-garden.jpg" },
    { id: "seed-paper-10", name: "Seed Paper 10 Pack", kicker: "Refills",
      notes: null,
      contents: ["10 seed papers"],
      price: 16.99, image: "images/product-seed-paper-10.jpg" },
    { id: "limited-5", name: "Limited Edition Seed Pack", kicker: "Limited edition · 5 pack",
      notes: null,
      contents: ["5 limited edition seed papers"],
      price: 12.99, image: "images/product-limited-edition.jpg" },
    { id: "wooden-box", name: "Wooden Box", kicker: "On its own",
      notes: null,
      contents: ["1 reusable wooden box, hanging or vent clip"],
      price: 3.99, image: "images/product-studio-1.jpg", choice: { label: "Edition", options: ["Hanging", "Vent clip"] },
      images: { "Hanging": "images/product-studio-1.jpg", "Vent clip": "images/product-vent-studio.jpg" } },
    { id: "subscription-5", name: "Refill Subscription, 5 a Month", kicker: "Subscription",
      notes: null,
      contents: ["5 seed papers every month", "3 classic scents", "2 limited edition or scent of the month"],
      price: 7.99, per: "month", image: "images/refills-flatlay.jpg" },
    { id: "subscription-10", name: "Refill Subscription, 10 a Month", kicker: "Subscription",
      notes: null,
      contents: ["10 seed papers every month", "6 classic scents", "4 limited edition"],
      price: 12.99, per: "month", image: "images/refills-flatlay.jpg" },
  ],

  /* The id of the shop product a home page scent card adds to the bag, in that card's scent. */
  scentRefill: "the-releaf",

  /* Every order is delivered in a recycled cardboard box. */
  packaging: "recycled cardboard boxes",

  /* Bulk pricing for other firms. price is the per-unit price at that quantity.
     The quantity breakpoints are a draft too: set tiersConfirmed to true once they are final. */
  bulkTiers: [
    { min: 1,   label: "1 to 9",  price: null },
    { min: 10,  label: "10+",     price: null },
    { min: 50,  label: "50+",     price: null },
    { min: 100, label: "100+",    price: null },
  ],
  tiersConfirmed: false,

  leadTime: null,           // e.g. "Ships in 5 school days"
  paymentTerms: null,       // e.g. "Invoice through the VE bank"

  product: {
    seeds: "wildflower mix",
    seedsConfirmed: false,  // set true once the mix is final
    formatConfirmed: false, // set true once the holder, refills and mirror cord / vent clip formats are final
    scentDuration: null,    // e.g. "about three weeks"
    daysToSprout: "10 to 14 days",   // from the Planting Guide
    paperSource: null,      // e.g. "recycled cotton fibre"
    fixativeName: null,     // leave null to keep "a natural, plant-based fixative"
    /* The short version on the home page, taken from the Planting Guide (planting-guide.html).
       Keep four steps in this order: tear, cover, water, sun. */
    plantingSteps: [
      "Tear the paper into smaller pieces if your pot is small.",
      "Lay it flat on damp soil and cover it with about 1/8 inch of loose soil.",
      "Mist or water gently so it stays damp, never soggy, for the first 10 to 14 days.",
      "Give it a warm, sunny spot and watch for the first sprouts.",
    ],
    plantingConfirmed: true,
  },

  /* Team page. Photos go in images/team-1.jpg, team-2.jpg ... */
  team: [
    { name: null, role: null, bio: null, photo: "images/team-1.jpg" },
    { name: null, role: null, bio: null, photo: "images/team-2.jpg" },
    { name: null, role: null, bio: null, photo: "images/team-3.jpg" },
    { name: null, role: null, bio: null, photo: "images/team-4.jpg" },
    { name: null, role: null, bio: null, photo: "images/team-5.jpg" },
    { name: null, role: null, bio: null, photo: "images/team-6.jpg" },
  ],
};
