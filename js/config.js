/* ------------------------------------------------------------------
   Seed Scent site data.

   This is the ONE file to edit when facts change. Anything set to null
   shows on the site as a visible [PLACEHOLDER] chip until you fill it in.
   Photos are plain files: drop them into images/ with the names below
   and they replace the placeholders automatically.
   ------------------------------------------------------------------ */
window.SEED_SCENT = {
  brand: {
    name: "Seed Scent",
    tagline: "from scent to sprout.",
    descriptor: "A plantable car air freshener",
  },

  /* Who to contact. The order form and checkout email go to contact.email. */
  contact: {
    email: null,            // e.g. "orders@seedscent.com"
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

  /* The three scents. Prices are numbers, e.g. 4.5 for $4.50. */
  scents: [
    /* image: the photo of the mirror cord version. imageVent: the photo of the vent clip version.
       The card shows whichever format the visitor picks. The three cards share one vent clip
       mock-up so they all show the same design; give each scent its own photos when the product
       shots are final. */
    { id: "scent-1", name: null, notes: null, price: null, packSize: null, image: "images/product-studio-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "ink" },
    { id: "scent-2", name: null, notes: null, price: null, packSize: null, image: "images/product-mirror-2.jpg", imageVent: "images/product-vent-clip.jpg", accent: "moss" },
    { id: "scent-3", name: null, notes: null, price: null, packSize: null, image: "images/product-mirror-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "sage" },
  ],

  /* The Shop page (shop.html). One card per line, shown in this order.
     A line with scent and format takes its name, notes, pack size, price and photo from that
     scent above (scent: 0 is the first scent). Those count toward the bulk tiers below.
     To sell something else later, add a line with its own details and a new id, like this:
       { id: "new-product", name: "Product name", notes: "One line about it", packSize: "What is in the pack", price: 5, image: "images/new-product.jpg" },
     That kind of line is priced at its own price, one each. Every id must be different. */
  shop: [
    { id: "scent-1-mirror", scent: 0, format: "mirror" },
    { id: "scent-1-vent",   scent: 0, format: "vent" },
    { id: "scent-2-mirror", scent: 1, format: "mirror" },
    { id: "scent-2-vent",   scent: 1, format: "vent" },
    { id: "scent-3-mirror", scent: 2, format: "mirror" },
    { id: "scent-3-vent",   scent: 2, format: "vent" },
  ],

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
