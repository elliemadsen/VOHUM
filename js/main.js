/* VOHUM — view rendering, spatial parallax, modals, fx switcher */

(function () {
  "use strict";

  var currentView = "spatial";
  var currentFx = 1; // FX02 (Sphere) — the FX switcher UI is disabled (index.html), FX01 stays in code unused
  var spatialItemEls = [];
  var spatialCanvasEl = null;
  var itemsById = {};

  /* Click only counts as hitting the item if it lands on a non-transparent
     pixel — otherwise clicking a look's empty corner (or, in the sphere,
     clicking "through" to whatever's behind it) would wrongly open it. */
  function bindItemClick(wrap, img, item) {
    wrap.querySelector(".item-hit").addEventListener("click", function (e) {
      var rect = wrap.getBoundingClientRect();
      var nx = (e.clientX - rect.left) / rect.width;
      var ny = (e.clientY - rect.top) / rect.height;
      if (!hitTestMask(img.src, nx, ny)) return;
      openItemModal(item);
    });
  }

  function buildSpatialItem(item) {
    var wrap = document.createElement("div");
    wrap.className = "spatial-item";
    wrap.style.setProperty("--left", item.left + "%");
    wrap.style.setProperty("--top", item.top + "%");
    wrap.style.setProperty("--scale", item.scale);
    wrap.style.setProperty("--depth", item.depth);
    wrap.style.setProperty("--img-scale", item.imgScale || 1);
    wrap.dataset.id = item.id;

    // `|| 1` would silently discard an explicit GLITCH_FREQUENCY: 0 (0 is
    // falsy in JS), and dividing by 0 below would produce "Infinity" as a
    // CSS duration (invalid, ignored) rather than actually stopping the
    // glitch — so 0 is handled as its own case: disable the animation.
    var glitchFreqSet = VOHUM.TUNING && typeof VOHUM.TUNING.GLITCH_FREQUENCY === "number";
    var glitchFreq = glitchFreqSet ? VOHUM.TUNING.GLITCH_FREQUENCY : 1;
    var noGlitch = glitchFreqSet && glitchFreq <= 0;
    var farDur = ((6.5 + Math.random() * 5) / (noGlitch ? 1 : glitchFreq)).toFixed(2);
    var farDelay = (Math.random() * 6).toFixed(2);
    var nearDur = (farDur * 0.75).toFixed(2);
    var nearDelay = (farDelay * 0.5).toFixed(2);

    wrap.innerHTML =
      '<div class="ghost-layer ghost-far" style="--glitch-dur:' + farDur + "s;--glitch-delay:" + farDelay + 's;"></div>' +
      '<div class="ghost-layer ghost-near" style="--glitch-dur:' + nearDur + "s;--glitch-delay:" + nearDelay + 's;"></div>' +
      '<button class="item-hit" type="button" aria-label="View ' + item.title + ', sold out">' +
        '<img class="item-image" src="' + item.image + '" alt="' + item.title + '" loading="lazy">' +
      "</button>";
    if (noGlitch) wrap.classList.add("no-glitch");

    bindItemClick(wrap, wrap.querySelector(".item-image"), item);
    return wrap;
  }

  function buildGridItem(item) {
    var wrap = document.createElement("div");
    wrap.className = "grid-item";
    wrap.style.setProperty("--img-scale", item.imgScale || 1);
    wrap.innerHTML =
      '<button class="item-hit" type="button" aria-label="View ' + item.title + ', sold out">' +
        '<img class="item-image" src="' + item.image + '" alt="' + item.title + '" loading="lazy">' +
      "</button>";
    bindItemClick(wrap, wrap.querySelector(".item-image"), item);
    return wrap;
  }

  function renderItems() {
    var gridCanvas = document.getElementById("gridCanvas");
    var items = [];
    VOHUM.ITEMS.forEach(function (item) { itemsById[item.id] = item; });
    var gridItems = (VOHUM.GRID_ORDER || VOHUM.ITEMS.map(function (i) { return i.id; }))
      .map(function (id) { return itemsById[id]; })
      .filter(Boolean);

    VOHUM.ITEMS.forEach(function (item) {
      var sEl = buildSpatialItem(item);
      spatialCanvasEl.appendChild(sEl);
      items.push(sEl);
      ensureHitMask(sEl.querySelector(".item-image"));
    });
    gridItems.forEach(function (item) {
      var gEl = buildGridItem(item);
      gridCanvas.appendChild(gEl);
      initHoverMask(gEl);
    });
    items.forEach(function (itemEl) { VOHUM.effects.applyEffect(itemEl, currentFx); });
    return items;
  }

  /* Hover should only register over the visible (non-transparent) part of
     an image, not the whole rectangular box — object-fit:contain letterbox
     padding and transparent PNG corners shouldn't trigger a hover state. */
  var hitMaskCache = {};

  function buildHitMask(img) {
    var cols = 36;
    var rows = Math.round(cols * 4 / 3);
    var canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    var boxRatio = cols / rows;
    var imgRatio = iw / ih;
    var dw, dh, dx, dy;
    if (imgRatio > boxRatio) {
      dw = cols; dh = cols / imgRatio; dx = 0; dy = (rows - dh) / 2;
    } else {
      dh = rows; dw = rows * imgRatio; dy = 0; dx = (cols - dw) / 2;
    }
    var data = null;
    try {
      ctx.drawImage(img, dx, dy, dw, dh);
      data = ctx.getImageData(0, 0, cols, rows).data;
    } catch (e) { data = null; }
    return { cols: cols, rows: rows, data: data };
  }

  function ensureHitMask(img) {
    var src = img.src;
    if (hitMaskCache[src]) return;
    var compute = function () { hitMaskCache[img.src] = buildHitMask(img); };
    if (img.complete && img.naturalWidth) compute();
    else img.addEventListener("load", compute, { once: true });
  }

  function hitTestMask(src, nx, ny) {
    var mask = hitMaskCache[src];
    if (!mask || !mask.data) return true;
    var x = Math.min(mask.cols - 1, Math.max(0, Math.floor(nx * mask.cols)));
    var y = Math.min(mask.rows - 1, Math.max(0, Math.floor(ny * mask.rows)));
    return mask.data[(y * mask.cols + x) * 4 + 3] > 20;
  }

  /* Grid items have no tilt, just a plain alpha-gated hover class. */
  function initHoverMask(itemEl) {
    var img = itemEl.querySelector(".item-image");
    if (!img) return;
    itemEl.addEventListener("pointermove", function (e) {
      var rect = itemEl.getBoundingClientRect();
      var nx = (e.clientX - rect.left) / rect.width;
      var ny = (e.clientY - rect.top) / rect.height;
      itemEl.classList.toggle("is-hovering", hitTestMask(img.src, nx, ny));
    }, { passive: true });
    itemEl.addEventListener("pointerleave", function () {
      itemEl.classList.remove("is-hovering");
    }, { passive: true });
  }

  /* A per-item click listener (bindItemClick) only ever sees whichever
     element the browser's native hit-testing picked — always the topmost
     one at that point, regardless of whether ITS pixel there is
     transparent. So in FX01 (Orbit) or FX02 (Sphere), when a transparent
     part of a foreground look overlaps a background one, a click on that
     spot never reaches the item behind it — the topmost item's own
     handler just sees its alpha test fail and does nothing.

     This scans every item directly instead of trusting the browser's
     paint-order stack (elementsFromPoint), which turned out unreliable
     here — FX02 (Sphere) renders items inside a CSS3D (three.js)
     hierarchy, and three.js's CSS3DRenderer maintains its OWN front-to-
     back order by writing a z-index style on each item's wrapper every
     frame; that's the authoritative order for what's actually on top,
     so reading it directly avoids any mismatch with the DOM's own paint-
     order hit-testing for 3D-transformed content. Every item whose
     rendered box contains the point and whose actual pixel there is
     solid is a candidate; the one with the highest z-index (frontmost)
     wins. Outside the sphere (no z-index applied), this still works —
     it just falls back to "the only/first matching candidate". */
  function findSolidItemAtPoint(clientX, clientY) {
    var best = null;
    var bestZ = -Infinity;
    spatialItemEls.forEach(function (container) {
      var img = container.querySelector(".item-image");
      if (!img) return;
      var rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
      var nx = (clientX - rect.left) / rect.width;
      var ny = (clientY - rect.top) / rect.height;
      if (!hitTestMask(img.src, nx, ny)) return;
      var zSource = container.parentElement || container;
      var z = parseFloat(getComputedStyle(zSource).zIndex);
      if (isNaN(z)) z = 0;
      if (!best || z >= bestZ) {
        bestZ = z;
        best = container;
      }
    });
    return best ? itemsById[best.dataset.id] : null;
  }

  function initSpatialClickThrough() {
    var spatialView = document.getElementById("spatialView");
    spatialView.addEventListener("click", function (e) {
      var item = findSolidItemAtPoint(e.clientX, e.clientY);
      if (item) openItemModal(item);
    });
  }

  /* Shared with js/layouts.js so FX02 (Sphere)'s drag-to-rotate can start
     from anywhere that isn't an actual look — including a transparent
     part of a look's own bounding box, not just space between looks. */
  VOHUM.spatialHit = {
    isOverSolidItem: function (clientX, clientY) {
      return !!findSolidItemAtPoint(clientX, clientY);
    }
  };

  /* Ghost layers drift opposite/with the pointer for a spatial parallax feel.
     VOHUM.TUNING.SHADOW_DISPLACEMENT multiplies how far they offset. */
  function initParallax() {
    var px = 0.5, py = 0.5;
    var raf = null;
    var disp = (VOHUM.TUNING && VOHUM.TUNING.SHADOW_DISPLACEMENT) || 1;

    function update() {
      raf = null;
      var dx = (px - 0.5) * 46;
      var dy = (py - 0.5) * 30;
      spatialItemEls.forEach(function (itemEl) {
        var depth = parseFloat(itemEl.style.getPropertyValue("--depth")) || 0.5;
        // The ghost layers are a sibling of .item-image, not scaled by
        // its CSS transform — without baking the same scale in here too,
        // a look tuned below 1x (its real photo shrinks inside its box)
        // gets a ghost silhouette that stays full-box-size, so it reads
        // larger than the photo it's meant to shadow.
        var imgScale = Math.min(1, parseFloat(itemEl.style.getPropertyValue("--img-scale")) || 1);
        var far = itemEl.querySelector(".ghost-far");
        var near = itemEl.querySelector(".ghost-near");
        if (far) far.style.transform = "translate(" + ((14 + dx * depth * 1.5) * disp) + "px," + ((10 + dy * depth * 1.5) * disp) + "px) scale(" + imgScale + ")";
        if (near) near.style.transform = "translate(" + ((7 + dx * depth * 0.8) * disp) + "px," + ((5 + dy * depth * 0.8) * disp) + "px) scale(" + imgScale + ")";
      });
    }

    window.addEventListener("pointermove", function (e) {
      var rect = spatialCanvasEl.getBoundingClientRect();
      px = e.clientX / window.innerWidth;
      py = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });

    update();
  }

  /* Subtle pseudo-3D tilt per item, driven only by pointer position (2D input).
     Gated by the alpha hit-test so hovering a transparent corner doesn't count. */
  function initTilt() {
    spatialItemEls.forEach(function (itemEl) {
      var img = itemEl.querySelector(".item-image");
      if (!img) return;
      itemEl.addEventListener("pointermove", function (e) {
        var rect = itemEl.getBoundingClientRect();
        var nx = (e.clientX - rect.left) / rect.width;
        var ny = (e.clientY - rect.top) / rect.height;
        var hit = hitTestMask(img.src, nx, ny);
        itemEl.classList.toggle("is-hovering", hit);
        if (!hit) {
          img.style.transform = "";
          return;
        }
        var ex = nx - 0.5, ey = ny - 0.5;
        // Bug: this used the raw --img-scale (up to 1.6x for some looks)
        // as the hover scale directly — on top of a box that's *already*
        // that many times bigger (see .spatial-item width, CSS), so
        // hovering a zoomed-in look jumped to img-scale squared. Base is
        // capped at 1 (matching the resting-state transform) with a
        // small hover bump on top instead.
        var baseScale = Math.min(1, parseFloat(getComputedStyle(itemEl).getPropertyValue("--img-scale")) || 1);
        var inSphere = itemEl.classList.contains("in-sphere");
        var scale = baseScale * (inSphere ? 1.4 : 1.02);
        img.style.transform = "perspective(600px) rotateX(" + (ey * -8) + "deg) rotateY(" + (ex * 8) + "deg) scale(" + scale + ")";
      }, { passive: true });
      itemEl.addEventListener("pointerleave", function () {
        itemEl.classList.remove("is-hovering");
        img.style.transform = "";
      }, { passive: true });
    });
  }

  function initViewToggle() {
    var toggleBtn = document.getElementById("viewToggle");
    var spatialView = document.getElementById("spatialView");
    var gridView = document.getElementById("gridView");
    var options = toggleBtn.querySelectorAll(".toggle-option");

    toggleBtn.addEventListener("click", function (e) {
      var opt = e.target.closest(".toggle-option");
      if (!opt || opt.dataset.view === currentView) return;
      currentView = opt.dataset.view;
      options.forEach(function (o) { o.classList.toggle("active", o === opt); });
      spatialView.classList.toggle("active", currentView === "spatial");
      gridView.classList.toggle("active", currentView === "grid");
      if (currentView === "spatial") {
        VOHUM.layouts.resume(spatialItemEls, spatialCanvasEl);
      } else {
        VOHUM.layouts.stopCurrent(spatialItemEls, spatialCanvasEl);
      }
    });
  }

  function initFxSwitcher() {
    var switcher = document.getElementById("fxSwitcher");
    if (!switcher) return;
    switcher.addEventListener("click", function (e) {
      var btn = e.target.closest(".fx-btn");
      if (!btn) return;
      var variant = parseInt(btn.dataset.fx, 10);
      if (variant === currentFx) return;
      currentFx = variant;
      switcher.querySelectorAll(".fx-btn").forEach(function (b) { b.classList.toggle("active", b === btn); });
      spatialItemEls.forEach(function (itemEl) { VOHUM.effects.applyEffect(itemEl, currentFx); });
      VOHUM.layouts.switchTo(currentFx, spatialItemEls, spatialCanvasEl);
    });
  }

  var itemModal;
  var galleryImages = [];
  var galleryIndex = 0;

  function renderGalleryImage() {
    var img = document.getElementById("modalImage");
    img.src = galleryImages[galleryIndex];
    var dots = document.getElementById("modalDots");
    dots.querySelectorAll(".modal-dot").forEach(function (dot, i) {
      dot.classList.toggle("active", i === galleryIndex);
    });
  }

  function showGalleryImage(index) {
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    renderGalleryImage();
  }

  function openItemModal(item) {
    galleryImages = item.images && item.images.length ? item.images : [item.image];
    galleryIndex = 0;

    var multi = galleryImages.length > 1;
    document.getElementById("modalPrev").hidden = !multi;
    document.getElementById("modalNext").hidden = !multi;
    var dots = document.getElementById("modalDots");
    dots.hidden = !multi;
    dots.innerHTML = multi
      ? galleryImages.map(function (_, i) {
          return '<button type="button" class="modal-dot" data-index="' + i + '" aria-label="Image ' + (i + 1) + '"></button>';
        }).join("")
      : "";

    document.getElementById("modalImage").alt = item.title;
    document.getElementById("modalDialog").setAttribute("aria-label", item.title + ", sold out");
    renderGalleryImage();
    openOverlay(itemModal);
  }

  function openOverlay(overlay) {
    overlay.classList.add("open");
    document.body.classList.add("modal-open");
    var closeBtn = overlay.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeOverlay(overlay) {
    overlay.classList.remove("open");
    if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
  }

  function initModals() {
    itemModal = document.getElementById("itemModal");

    document.getElementById("modalClose").addEventListener("click", function () { closeOverlay(itemModal); });

    document.getElementById("modalPrev").addEventListener("click", function () { showGalleryImage(galleryIndex - 1); });
    document.getElementById("modalNext").addEventListener("click", function () { showGalleryImage(galleryIndex + 1); });
    document.getElementById("modalDots").addEventListener("click", function (e) {
      var dot = e.target.closest(".modal-dot");
      if (dot) showGalleryImage(parseInt(dot.dataset.index, 10));
    });

    itemModal.addEventListener("click", function (e) {
      if (e.target === itemModal) closeOverlay(itemModal);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.open").forEach(closeOverlay);
      } else if (itemModal.classList.contains("open") && galleryImages.length > 1) {
        if (e.key === "ArrowLeft") showGalleryImage(galleryIndex - 1);
        else if (e.key === "ArrowRight") showGalleryImage(galleryIndex + 1);
      }
    });
  }

  /* Push VOHUM.TUNING's darkness/saturation knobs into CSS custom
     properties once at startup, so the stylesheet can consume them. */
  function applyTuning() {
    var t = VOHUM.TUNING || {};
    var root = document.documentElement.style;
    if (t.MIN_DARKNESS != null) root.setProperty("--ghost-far-opacity", t.MIN_DARKNESS);
    if (t.MAX_DARKNESS != null) root.setProperty("--ghost-near-opacity", t.MAX_DARKNESS);
    if (t.IMAGE_SATURATION != null) root.setProperty("--img-saturation", t.IMAGE_SATURATION);
  }

  function init() {
    applyTuning();
    spatialCanvasEl = document.getElementById("spatialCanvas");
    spatialItemEls = renderItems();
    initParallax();
    initTilt();
    initSpatialClickThrough();
    initViewToggle();
    initFxSwitcher();
    initModals();
    VOHUM.layouts.switchTo(currentFx, spatialItemEls, spatialCanvasEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
