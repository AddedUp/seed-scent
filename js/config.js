/* ------------------------------------------------------------------
   Seed Scent site data.

   This is the ONE file to edit when facts change. Anything set to null
   shows on the site as a visible [PLACEHOLDER] chip until you fill it in.
   Photos are plain files: drop them into images/ with the names below
   and they replace the placeholders automatically.
   ------------------------------------------------------------------ */
/* The five signature scents, offered in the scent picker on The Vine and The Dandelion. */
const signatureScents = ["Citrus Grove", "Lavender", "Vanilla", "Linen", "Wildflowers"];   // keep in step with the scents list below

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

  /* The five signature scents, as the home page shows them. Each card links to the Shop page.
     image: the photo of the hanging version. imageVent: the photo of the vent clip version.
     The card shows whichever the visitor picks. blend: the three oils and roughly what share each is, from the
     firm's scent profiles (leave it out and the card shows no blend). notes: one short line about the smell (null
     hides the line). The product photos are shared between scents until each has its own. */
  scents: [
    { id: "scent-1", name: "Citrus Grove", image: "images/product-studio-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "ink",
      notes: "Cool citrus blend with lemon, orange, and grapefruit.",
      blend: [{ share: 60, oil: "Lemon" }, { share: 25, oil: "Orange" }, { share: 15, oil: "Grapefruit" }] },
    { id: "scent-2", name: "Lavender", image: "images/product-mirror-2.jpg", imageVent: "images/product-vent-clip.jpg", accent: "moss",
      notes: "Soft lavender with calming floral and herbal notes. A fresh, relaxing car scent.",
      blend: [{ share: 60, oil: "Lavender" }, { share: 25, oil: "Rosemary" }, { share: 15, oil: "Roman chamomile" }] },
    { id: "scent-3", name: "Vanilla", image: "images/product-mirror-1.jpg", imageVent: "images/product-vent-clip.jpg", accent: "sage",
      notes: "Soft, creamy vanilla with warm and comforting sweet notes. A smooth, cozy car scent.",
      blend: [{ share: 60, oil: "Vanilla" }, { share: 25, oil: "Benzoin" }, { share: 15, oil: "Tonka bean" }] },
    { id: "scent-4", name: "Linen", image: "images/product-studio-2.jpg", imageVent: "images/product-vent-clip.jpg", accent: "ink",
      notes: "Bright, clean citrus with soft lavender and a cool herbal finish. Like freshly washed laundry.",
      blend: [{ share: 60, oil: "Lemon" }, { share: 25, oil: "Lavender" }, { share: 15, oil: "Eucalyptus" }] },
    { id: "scent-5", name: "Wildflowers", image: "images/product-mirror-2.jpg", imageVent: "images/product-vent-clip.jpg", accent: "moss",
      notes: "Sweet, rosy florals with green herbs and a soft floral sweetness. Like an open meadow.",
      blend: [{ share: 60, oil: "Geranium" }, { share: 25, oil: "Clary sage" }, { share: 15, oil: "Roman chamomile" }] },
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
       goesWith  the id of another product to suggest on this card ("Goes well with ..."), and
                 goesWithNote, a few words about why
       veUrls    a buy button link for each option of the choice, when the marketplace has one
                 per option: { "Lavender": "https://...", ... }. The button follows the pick;
                 an option without a link of its own uses veUrl.
     To sell something new, copy an entry, give it a new id and change the rest. */
  shop: [
    { id: "the-vine", goesWith: "the-releaf", goesWithNote: "Refills for when the scent fades.",
      veUrls: {
        "Citrus Grove": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-vine-citrus-grove-11011/",
        "Lavender": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-vine-lavender-11012/",
        "Vanilla": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-vine-vanilla-11013/",
        "Linen": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-vine-linen-11014/",
        "Wildflowers": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-vine-wildflowers-11015/",
      },
      name: "The Vine", kicker: "The First Sprout · hanging edition",
      notes: "A premium starter kit for those who want to make a change. This classic hangs from your rearview mirror.",
      contents: ["1 reusable wooden box, hanging", "3 seed papers in the scent you pick"],
      price: 8.99, image: "images/product-mirror-1.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-dandelion", goesWith: "the-releaf", goesWithNote: "Refills for when the scent fades.",
      veUrls: {
        "Citrus Grove": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-dandelion-citrus-grove-12011/",
        "Lavender": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-dandelion-lavender-12012/",
        "Vanilla": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-dandelion-vanilla-12013/",
        "Linen": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-dandelion-linen-12014/",
        "Wildflowers": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-dandelion-wildflowers-12015/",
      },
      name: "The Dandelion", kicker: "The First Sprout · vent clip edition",
      notes: "A premium starter kit for those who want to make a change. This classic clips on to your interior car vents.",
      contents: ["1 reusable wooden box, vent clip", "3 seed papers in the scent you pick"],
      price: 8.99, image: "images/product-first-sprout-vent.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-releaf", goesWith: "subscription-5", goesWithNote: "Refills every month.",
      veUrls: {
        "Citrus Grove": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-citrus-grove-16011/",
        "Lavender": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-lavender-16012/",
        "Vanilla": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-vanilla-16013/",
        "Linen": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-linen-16014/",
        "Wildflowers": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-releaf-wildflowers-16015/",
      },
      name: "The Releaf", kicker: "Custom refill pack",
      notes: "Refills only. Buy a set of seed paper with the scent of your choice. The sustainable option.",
      contents: ["3 seed papers in the scent you pick"],
      price: 5.99, image: "images/product-releaf.jpg", choice: { label: "Scent", options: signatureScents } },
    { id: "the-bloom", goesWith: "the-garden", goesWithNote: "Two wooden boxes and six seed papers.",
      veUrls: { "Hanging": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-bloom-hanging-13011/", "Vent clip": "https://portal.veinternational.org/buybuttons/us0111040/btn/the-bloom-vent-clip-13012/" },
      name: "The Bloom", kicker: "Grow kit",
      notes: "Everything you need, start to finish. Complete with planting essentials, including a Seed Scent brand pot, quality soil, and shovels.",
      contents: ["1 reusable wooden box, hanging or vent clip", "3 seed papers, scents chosen for you", "Terracotta planting pot", "Soil", "Mini shovels"],
      price: 18.99, image: "images/product-bloom-vent.jpg", choice: { label: "Edition", options: ["Vent clip", "Hanging"] },
      images: { "Hanging": "images/product-bloom-hanging.jpg", "Vent clip": "images/product-bloom-vent.jpg" } },
    { id: "the-garden", goesWith: "subscription-10", goesWithNote: "Ten seed papers every month.",
      veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/the-garden-4040404/",
      name: "The Garden", kicker: "Deluxe bundle",
      notes: "Everything you need and more. Includes two boxes, six seed papers, and a complete planting kit.",
      contents: ["2 reusable wooden boxes: 1 hanging, 1 vent clip", "6 seed papers, scents chosen for you", "Terracotta planting pot", "Mini shovels", "Scratch and smell stickers"],
      price: 28.99, image: "images/product-garden.jpg" },
    { id: "limited-5", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/limited-edition-seed-pack-14011/",
      name: "Bake and Bloom Collection *LIMITED EDITION*", kicker: "Limited edition · 5 pack",
      notes: "Five bakery scents in one limited edition pack. You get five seed papers, one in each scent of the collection, to use in your wooden box and plant when the scent fades.",
      contents: [
        "Chocolate Chip Cookie: warm brown sugar and melted chocolate over a buttery vanilla dough base",
        "Brownie: rich dark cocoa and fudge with hints of toasted walnut and caramel",
        "Cake Batter: sweet vanilla buttercream and fresh batter with a light note of rainbow sprinkles and sugar",
        "Cinnamon: spiced cinnamon and clove wrapped in warm brown sugar and soft vanilla",
        "Cupcake: fluffy vanilla sponge topped with whipped frosting and a touch of strawberry",
      ],
      price: 12.99, image: "images/product-bake-and-bloom.jpg" },
    { id: "wooden-box", goesWith: "the-releaf", goesWithNote: "Seed paper to fill it.",
      veUrls: { "Hanging": "https://portal.veinternational.org/buybuttons/us0111040/btn/wooden-box-hanging-15011/", "Vent clip": "https://portal.veinternational.org/buybuttons/us0111040/btn/wooden-box-vent-clip-15012/" },
      name: "Wooden Box", kicker: "On its own",
      notes: null,
      contents: ["1 reusable wooden box, hanging or vent clip"],
      price: 3.99, image: "images/product-studio-1.jpg", choice: { label: "Edition", options: ["Hanging", "Vent clip"] },
      images: { "Hanging": "images/product-studio-1.jpg", "Vent clip": "images/product-vent-studio.jpg" } },
    { id: "subscription-5", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/refill-subscription-5-a-month-90234/",
      name: "Refill Subscription, 5 a Month", kicker: "Subscription",
      notes: null,
      contents: ["5 seed papers every month", "3 classic scents", "2 limited edition or scent of the month"],
      price: 7.99, per: "month", image: "images/refills-flatlay.jpg" },
    { id: "subscription-10", veUrl: "https://portal.veinternational.org/buybuttons/us0111040/btn/refill-subscription-10-a-month-95821/",
      name: "Refill Subscription, 10 a Month", kicker: "Subscription",
      notes: null,
      contents: ["10 seed papers every month", "6 classic scents", "4 limited edition"],
      price: 12.99, per: "month", image: "images/refills-flatlay.jpg" },
  ],

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
  tiersConfirmed: true,

  leadTime: null,           // e.g. "Ships in 5 school days"
  paymentTerms: null,       // e.g. "Invoice through the VE bank"

  product: {
    seeds: "wildflower mix",
    seedsConfirmed: true,   // set true once the mix is final
    formatConfirmed: true,  // set true once the holder, refills and mirror cord / vent clip formats are final
    scentDuration: "about a month",
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

  /* Team page (team.html), from the firm's org chart. One entry per person, in order.
       name, role   as they should read on the card
       dept         the department heading the card sits under (cards with the same dept stay together)
       photo        the photo file; leave the line out and the card shows the person's initials
       bio          optional: one line about them. Leave it out for no bio line. */
  team: [
    { name: "Jack Monteforte", role: "CEO", dept: "Executive", photo: "images/team/jack-monteforte.jpg" },
    { name: "Maya Knobloch", role: "CBO", dept: "Executive", photo: "images/team/maya-knobloch.jpg" },
    { name: "Saanvi Sanghavi", role: "COO", dept: "Executive", photo: "images/team/saanvi-sanghavi.jpg" },
    { name: "Jacob Epstein", role: "CFO", dept: "Finance", photo: "images/team/jacob-epstein.jpg" },
    { name: "Ateeq Panjwani", role: "VP of Finance", dept: "Finance", photo: "images/team/ateeq-panjwani.jpg" },
    { name: "Kaylea Chen", role: "VP of Accounting", dept: "Finance", photo: "images/team/kaylea-chen.jpg" },
    { name: "Elva Chen", role: "Associate", dept: "Finance", photo: "images/team/elva-chen.jpg" },
    { name: "Jacob Marin", role: "Associate", dept: "Finance", photo: "images/team/jacob-marin.jpg" },
    { name: "Felix Yan", role: "Associate", dept: "Finance", photo: "images/team/felix-yan.jpg" },
    { name: "Joe Cascon", role: "Associate", dept: "Finance" },
    { name: "Waney Kim", role: "CMO", dept: "Marketing", photo: "images/team/waney-kim.jpg" },
    { name: "Nora Young", role: "VP of Social Media", dept: "Marketing", photo: "images/team/nora-young.jpg" },
    { name: "Rachel Hui", role: "Associate", dept: "Marketing", photo: "images/team/rachel-hui.jpg" },
    { name: "Shubhu Pradhan", role: "Associate", dept: "Marketing", photo: "images/team/shubhu-pradhan.jpg" },
    { name: "Lily Silveira", role: "Associate", dept: "Marketing", photo: "images/team/lily-silveira.jpg" },
    { name: "Max Wolkoff", role: "CHRO", dept: "Human Resources", photo: "images/team/max-wolkoff.jpg" },
    { name: "Jonah Han", role: "Associate", dept: "Human Resources", photo: "images/team/jonah-han.jpg" },
    { name: "Hailey Cohen", role: "Associate", dept: "Human Resources", photo: "images/team/hailey-cohen.jpg" },
    { name: "Savir Peri", role: "Associate", dept: "Human Resources", photo: "images/team/savir-peri.jpg" },
    { name: "Ryan Sakhai", role: "CSO", dept: "Sales", photo: "images/team/ryan-sakhai.jpg" },
    { name: "Sam Goldberg", role: "Associate", dept: "Sales", photo: "images/team/sam-goldberg.jpg" },
    { name: "Zachary Yedvarb", role: "Associate", dept: "Sales", photo: "images/team/zachary-yedvarb.jpg" },
    { name: "Liam Urrutia", role: "Associate", dept: "Sales", photo: "images/team/liam-urrutia.jpg" },
    { name: "Sahil Shah", role: "Associate", dept: "Sales", photo: "images/team/sahil-shah.jpg" },
  ],
};
