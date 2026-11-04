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
    instagram: null,        // handle without the @
    tiktok: null,
    linkedin: null,
  },

  school: {
    name: null,             // e.g. "Lincoln High School"
    city: null,
    state: null,
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
    /* image: replace with your own photo file when the product shots are final */
    { id: "scent-1", name: null, notes: null, price: null, packSize: null, image: "images/product-studio-1.jpg", accent: "ink" },
    { id: "scent-2", name: null, notes: null, price: null, packSize: null, image: "images/product-mirror-2.jpg", accent: "moss" },
    { id: "scent-3", name: null, notes: null, price: null, packSize: null, image: "images/product-mirror-1.jpg", accent: "sage" },
  ],

  /* Bulk pricing for other firms. price is the per-unit price at that quantity. */
  bulkTiers: [
    { min: 1,   label: "1 to 9",  price: null },
    { min: 10,  label: "10+",     price: null },
    { min: 50,  label: "50+",     price: null },
    { min: 100, label: "100+",    price: null },
  ],

  leadTime: null,           // e.g. "Ships in 5 school days"
  paymentTerms: null,       // e.g. "Invoice through the VE bank"

  product: {
    seeds: "wildflower mix",
    seedsConfirmed: false,  // set true once the mix is final
    scentDuration: null,    // e.g. "about three weeks"
    daysToSprout: null,     // e.g. "7 to 14 days"
    paperSource: null,      // e.g. "recycled cotton fibre"
    fixativeName: null,     // leave null to keep "a natural, plant-based fixative"
    plantingSteps: [
      "Tear the paper into pieces about the size of a coin.",
      "Press them into a pot or a patch of soil, no deeper than a fingertip.",
      "Water well and keep the soil damp.",
      "Give it sun and wait for the first sprouts.",
    ],
    plantingConfirmed: false,
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
