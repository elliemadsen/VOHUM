/* VOHUM — collection data (placeholder content) */

var VOHUM = window.VOHUM || {};

VOHUM.LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem.",
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto.",
  "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam.",
  "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui.",
  "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati.",
  "Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat.",
  "Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum rerum hic tenetur.",
  "Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Nam libero tempore soluta.",
  "Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est omnis dolor."
];

/* Per-look image zoom, keyed by look id. This is independent of the
   spatial "scale" below — it zooms the image content itself (some source
   photos are shot tighter/looser than others), so tune per look here. */
VOHUM.LOOK_IMAGE_SCALE = {
  1: 1.2, // long sleeve
  2: 1.2, // strappy top
  3: 0.8, // gray plain top
  4: 1.5, // full body
  5: 0.8, // denim vest
  6: 1.4, // strappy top long
  7: 1.6, // pants
  8: 1.2 // orange top
};

/* Left-to-right order for the grid view. */
VOHUM.GRID_ORDER = [6, 4, 8, 7, 5, 2, 1, 3];

/* Tunable knobs for the spatial-view ghost effects (js/effects.js) and
   motion (js/main.js, js/layouts.js). Edit and reload to see changes. */
VOHUM.TUNING = {
  CONTRAST: 1,              // ghost-effect light/dark punch (1 = neutral, higher = more posterized)
  MIN_DARKNESS: 0.15,       // opacity of the far (background) ghost layer — kept low on purpose: the far
                             // layer is a second, lower-res copy offset from the near one, so the more
                             // visible it is, the more "doubled/blurry" the pair reads as a whole. Faint
                             // here lets the near layer (crisp, high opacity) read as the actual text.
  MAX_DARKNESS: 0.7,       // opacity of the near (foreground) ghost layer — how strong the darkest layer gets
  CHARACTERS: {
    ASCII: " .:-+*v#%@",     // used by ASCII Ghost + Scanline ASCII, light -> dark
    DITHER: "&#%*+=-.!:;"   // used by Bitmap Dither
  },
  GLITCH_FREQUENCY: 0,      // multiplies how often the glitch flash fires (higher = more frequent)
  SHADOW_DISPLACEMENT: 1, // multiplies how far the ghost layers drift/offset from the image — was 2
                             // originally, which is most of why the ghost layers read as "blurry": at
                             // 2x the far/near copies sit far enough apart that their semi-transparent
                             // offset silhouettes look like a double-exposure smear rather than a tight
                             // shadow behind clear text. Keep this low (with MIN_DARKNESS above) for
                             // "as clear as plain text"; turn it back up for a more obvious ghost/glitch.
  ROTATION_SPEED: 0.001,   // FX 03 (Sphere) auto-rotation speed, radians/frame
  IMAGE_SATURATION: 0.7       // real image color: 1 = normal, 0 = grayscale, >1 = boosted
};

/* left/top are % positions of the item's center within the spatial canvas.
   scale = relative size multiplier,
   depth = parallax strength (0 = still, 1 = most responsive to pointer).
   letters = image suffixes for this look (Images/<id><letter>.png); the
   first letter is the cover shown on the thumbnail, all of them are
   browsable as a closeup gallery inside the modal. */
VOHUM.ITEMS = [
  { id: 1, left: 11, top: 9,  scale: 1.05, depth: 0.50, letters: ["A", "B", "C", "D", "E"] },
  { id: 2, left: 34, top: 6,  scale: 0.92, depth: 0.80, letters: ["A", "B", "C", "D", "E", "F"] },
  { id: 3, left: 60, top: 11, scale: 1.12, depth: 0.35, letters: ["A", "B"] },
  { id: 4, left: 85, top: 8,  scale: 0.90, depth: 0.70, letters: [""] },
  { id: 5, left: 14, top: 46, scale: 0.95, depth: 0.60, letters: [""] },
  { id: 6, left: 41, top: 42, scale: 1.15, depth: 0.30, letters: ["A", "B", "C", "D", "E", "F", "G"] },
  { id: 7, left: 68, top: 47, scale: 0.98, depth: 0.90, letters: ["A", "B", "C", "D"] },
  { id: 8, left: 26, top: 78, scale: 1.00, depth: 0.55, letters: ["A", "B"] }
].map(function (pos, i) {
  var n = String(pos.id).padStart(2, "0");
  var images = pos.letters.map(function (letter) { return "Images/" + pos.id + letter + ".png"; });
  return Object.assign({}, pos, {
    title: "LOOK " + n,
    image: images[0],
    images: images,
    imgScale: VOHUM.LOOK_IMAGE_SCALE[pos.id] || 1,
    desc: VOHUM.LOREM[i],
    soldOut: true
  });
});

VOHUM.ABOUT_TEXT =
  "As a Desi American raised in Azusa and living in Bushwick, Ari Arya is primarily concerned with connecting 'what's here' and 'what's there.' In VOHUM, they inventively embed South Asian garment technology in American streetwear with a diligence stemming from their background as a scientist. These functional garments, alongside their massive sculptural couture, explore questions of identity, conflict, belonging, and our politically fraught contemporary culture. They put forth a vision of the present that calls on us to make change, incite collective refusal, and make our world one we can be proud of — both here and in the homeland — not for ourselves, but for each other.";

window.VOHUM = VOHUM;
