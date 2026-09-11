/* VOHUM — spatial-view ghost effects
   Ghost renderers for the spatial view. Each item gets two offset ghost
   copies (far / near) built from the same source image; switch between
   them live with the FX control. Tunable knobs live in VOHUM.TUNING
   (js/data.js) — CONTRAST, CHARACTERS, MIN_DARKNESS, MAX_DARKNESS. */

var VOHUM = window.VOHUM || {};

(function () {
  "use strict";

  function tuning() {
    return VOHUM.TUNING || {};
  }

  /* Contrast applied to every ghost effect's sampled luminance (>1 sharpens
     the light/dark split, 1 = unchanged). VOHUM.TUNING.CONTRAST. */
  function applyContrast(l) {
    var contrast = tuning().CONTRAST || 1;
    var v = 0.5 + (l - 0.5) * contrast;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /* Sample an <img> down to a small luminance grid via an offscreen canvas.
     Falls back to a procedural pattern if the canvas is tainted (this can
     happen when the page is opened directly via file:// instead of a local
     server) so the ghost layers still render something. */
  function sampleImage(img, cols) {
    var ratio = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 1.3;
    var rows = Math.max(1, Math.round(cols * ratio));
    var c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cols, rows);

    var lum = new Float32Array(cols * rows);
    var rawLum = new Float32Array(cols * rows);
    var alpha = new Float32Array(cols * rows);
    try {
      var data = ctx.getImageData(0, 0, cols, rows).data;
      for (var i = 0; i < cols * rows; i++) {
        var o = i * 4;
        var l = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
        rawLum[i] = l;
        lum[i] = applyContrast(l);
        alpha[i] = data[o + 3] / 255;
      }
    } catch (e) {
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          rawLum[y * cols + x] = lum[y * cols + x] = n - Math.floor(n);
          alpha[y * cols + x] = 1;
        }
      }
    }
    return { cols: cols, rows: rows, lum: lum, rawLum: rawLum, alpha: alpha };
  }

  function hash(x, y, m) {
    return Math.abs((x * 131 + y * 977) * 37) % m;
  }

  /* THE actual reason the ghost text read as low-res no matter what else
     changed: these canvases were created with canvas.width/height set to
     a small LOGICAL pixel count (e.g. 200), then stretched via CSS to
     fill the item (which can be 300-500px+ CSS-wide) — and on any HiDPI
     screen (iPhone: devicePixelRatio 2-3), the browser must additionally
     multiply that CSS size by the device pixel ratio to get the actual
     physical pixels it has to fill. A 200px-wide canvas shown at 350 CSS
     px on a DPR-3 phone is being stretched to 1050 DEVICE pixels — a
     5.25x upscale, not the ~1.75x it looks like from CSS alone.
     image-rendering:pixelated only changes HOW that stretch interpolates
     (blocky vs smooth); it can't add detail the canvas never had. This
     creates the canvas's actual pixel buffer at devicePixelRatio, then
     scales the drawing context so every draw call below still uses plain
     logical coordinates — same code, several times sharper source. */
  function createCanvas(logicalW, logicalH) {
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement("canvas");
    // The physical pixel buffer is DPR times bigger than the logical size
    // used for drawing below. The CSS display size stays governed by
    // .ghost-canvas { width:100%; height:100% } (unset here on purpose —
    // that's what lets it scale responsively to whatever size the item
    // itself ends up rendering at).
    canvas.width = Math.max(1, Math.round(logicalW * dpr));
    canvas.height = Math.max(1, Math.round(logicalH * dpr));
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return { canvas: canvas, ctx: ctx };
  }

  /* Variant 0 — Bitmap Dither: ordered (Bayer 4x4) dither, drawn as ASCII
     glyphs (rather than solid squares) picked from a small symbol set.
     Characters: VOHUM.TUNING.CHARACTERS.DITHER */
  var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  var DITHER_COLORS = ["#0a0a0a", "#0a0a0a", "#0a0a0a", "#3d3b38", "#3d3b38", "#8f8c86", "#b53304"];

  function renderDither(sample, opts) {
    var cell = opts.cell;
    var chars = (tuning().CHARACTERS && tuning().CHARACTERS.DITHER) || "&#%*+=-.!:;";
    var made = createCanvas(sample.cols * cell, sample.rows * cell);
    var canvas = made.canvas, ctx = made.ctx;
    ctx.font = cell + 'px "Courier New", monospace';
    ctx.textBaseline = "top";

    for (var y = 0; y < sample.rows; y++) {
      for (var x = 0; x < sample.cols; x++) {
        var idx = y * sample.cols + x;
        if (sample.alpha[idx] < 0.1) continue;
        var l = sample.lum[idx];
        var threshold = (BAYER[y % 4][x % 4] + 0.5) / 16;
        if (l < threshold) {
          var ch = chars[hash(x, y, 41) % chars.length];
          ctx.fillStyle = DITHER_COLORS[hash(x, y, 29) % DITHER_COLORS.length];
          ctx.fillText(ch, x * cell, y * cell);
        }
      }
    }
    return canvas;
  }

  /* Variant 1 — Scanline ASCII: solid ASCII glyphs, one per sampled pixel
     — no dropped rows, no lightened banding. Both of those were there for
     a CRT-tear look, but half the text sitting at a lighter grey and a
     third of the rows missing entirely reads as "blurry/faded" rather
     than as scanlines at normal viewing size, which fights directly
     against wanting the characters to read as clearly as plain text.
     Characters: VOHUM.TUNING.CHARACTERS.ASCII

     Contrast (VOHUM.TUNING.CONTRAST) decides whether a pixel is "inked"
     at all (drawn vs. left blank) — at a high setting that's a near-binary
     split, which is the point (a punchy silhouette). But picking the GLYPH
     from that same contrast-boosted value would collapse almost every
     inked pixel onto the ramp's single darkest character. So the glyph is
     chosen from the pixel's original, un-boosted tone instead, spread
     across the ramp's non-space characters — keeping full character
     variety regardless of how extreme the contrast setting is. */
  function renderScanlineAscii(sample, opts) {
    var cellW = opts.cellW, cellH = opts.cellH;
    var ramp = (tuning().CHARACTERS && tuning().CHARACTERS.ASCII) || " .:-=+*#%@";
    var inkChars = ramp.length > 1 ? ramp.slice(1) : ramp;
    var made = createCanvas(sample.cols * cellW, sample.rows * cellH);
    var canvas = made.canvas, ctx = made.ctx;
    ctx.font = (cellH - 2) + 'px "Courier New", monospace';
    ctx.textBaseline = "top";

    for (var y = 0; y < sample.rows; y++) {
      for (var x = 0; x < sample.cols; x++) {
        var idx = y * sample.cols + x;
        if (sample.alpha[idx] < 0.1) continue;
        var inked = Math.floor((1 - sample.lum[idx]) * ramp.length) > 0;
        if (!inked) continue;
        var raw = sample.rawLum[idx];
        var ci = Math.min(inkChars.length - 1, Math.floor((1 - raw) * inkChars.length));
        var ch = inkChars[ci];
        var h = hash(x, y, 23);
        ctx.fillStyle = h === 0 ? "#ff5a1f" : "#0a0a0a";
        ctx.fillText(ch, x * cellW, y * cellH);
      }
    }
    return canvas;
  }

  function buildLayers(itemEl, variant) {
    var img = itemEl.querySelector(".item-image");
    if (!img) return;

    var farHolder = itemEl.querySelector(".ghost-far");
    var nearHolder = itemEl.querySelector(".ghost-near");
    if (!farHolder || !nearHolder) return;

    var far, near;
    switch (variant) {
      case 0:
        far = renderDither(sampleImage(img, 26), { cell: 7 });
        near = renderDither(sampleImage(img, 44), { cell: 4 });
        break;
      case 1:
        far = renderScanlineAscii(sampleImage(img, 20), { cellW: 10, cellH: 14 });
        near = renderScanlineAscii(sampleImage(img, 30), { cellW: 7, cellH: 11 });
        break;
      default:
        return;
    }

    farHolder.innerHTML = "";
    nearHolder.innerHTML = "";
    far.className = "ghost-canvas";
    near.className = "ghost-canvas";
    farHolder.appendChild(far);
    nearHolder.appendChild(near);
    itemEl.dataset.fx = String(variant);
  }

  function applyEffect(itemEl, variant) {
    var img = itemEl.querySelector(".item-image");
    if (!img) return;
    if (img.complete && img.naturalWidth) {
      buildLayers(itemEl, variant);
    } else {
      img.addEventListener("load", function () { buildLayers(itemEl, variant); }, { once: true });
    }
  }

  VOHUM.effects = {
    VARIANT_COUNT: 2,
    VARIANT_NAMES: ["BITMAP DITHER", "SCANLINE ASCII"],
    applyEffect: applyEffect
  };

  window.VOHUM = VOHUM;
})();
