/* VOHUM — spatial-view distributions. Each FX variant pairs a ghost
   effect (effects.js) with a distinct way the 12 items sit in space. */

var VOHUM = window.VOHUM || {};

(function () {
  "use strict";

  var threeModPromise = null;
  function loadThree() {
    if (!threeModPromise) {
      threeModPromise = Promise.all([
        import("three"),
        import("three/addons/renderers/CSS3DRenderer.js")
      ]).then(function (mods) {
        return { THREE: mods[0], CSS3DRenderer: mods[1].CSS3DRenderer, CSS3DObject: mods[1].CSS3DObject };
      });
    }
    return threeModPromise;
  }

  function clearInline(items) {
    items.forEach(function (el) {
      el.style.left = "";
      el.style.top = "";
      el.style.transform = "";
    });
  }

  /* Sizing is handled entirely by CSS now (.spatial-canvas min-height,
     using dvh) — an inline style set here would win over that CSS
     regardless of specificity and silently reintroduce the JS-side
     window.innerHeight staleness dvh was specifically chosen to avoid.
     Kept as a no-op so existing start()/stop() call sites don't need to
     change. */
  function useViewportHeight() {}
  function restoreCanvasHeight() {}

  /* FX 01 — Orbit: items travel in two slow concentric rings, staying upright.

     Positions are computed in pixels, with the X and Y radius each scaled
     against their OWN safe range (maxRadiusX from actual canvas width,
     maxRadiusY from actual canvas height — both already accounting for
     the largest item's real rendered size, so nothing can push past the
     edge and cause a scrollbar). Scaling independently per axis means the
     ellipse naturally elongates along whichever dimension has more room
     — wide on desktop, tall on phone — without a manual aspect multiplier,
     and each axis uses its own full available space rather than being
     capped by whichever axis happens to be tighter. A wide radius gap
     between rings and a per-item radius "breathe" out of phase with every
     other item round it out. */
  var orbitLayout = {
    running: false,
    raf: null,
    onResize: null,
    start: function (items, canvas) {
      this.running = true;
      useViewportHeight(canvas);
      var self = this;
      var n = items.length;
      // Positioned with left/top(0) once, then moved every frame purely
      // via `transform` — animating left/top forces a synchronous layout
      // reflow on every single frame, which is expensive enough on a
      // phone CPU to visibly stutter. transform is GPU-composited and
      // doesn't touch layout at all, so 60fps stays smooth. The item's
      // own --scale (CSS) is read once and baked into that same string.
      items.forEach(function (el) {
        el.style.left = "0";
        el.style.top = "0";
      });
      var state = items.map(function (el, i) {
        var ring = i % 2;
        return {
          el: el,
          ring: ring,
          scale: parseFloat(getComputedStyle(el).getPropertyValue("--scale")) || 1,
          baseRadius: ring === 0 ? 0.34 : 0.96, // fraction of the SAFE range on each axis (see maxRadiusX/Y below) — use nearly all of it
          breatheAmp: 0.012 + (i % 3) * 0.006, // smaller than before: less chance of shrinking into the other ring's space
          breathePhase: i * 1.7,
          breatheSpeed: 0.09 + (i % 4) * 0.015,
          angle: (i / n) * Math.PI * 2,
          speed: ring === 0 ? 0.038 : -0.026
        };
      });

      var dims = { w: 0, h: 0 };
      function measure() {
        var rect = canvas.getBoundingClientRect();
        dims.w = rect.width;
        dims.h = rect.height;
      }
      measure();
      // iOS Safari fires repeated resize events as its address bar
      // hides/shows during ordinary scrolling/touch interaction, each
      // with a slightly different window.innerHeight — re-measuring (and
      // snapping every item to the recalculated center/radius) on every
      // one of those reads as a jittery, "glitchy" rotation. A tiny
      // real-viewport change isn't worth reacting to; only re-measure
      // past a threshold that means an actual resize/orientation change.
      function onResize() {
        var prevW = dims.w, prevH = dims.h;
        var rect = canvas.getBoundingClientRect();
        if (Math.abs(rect.width - prevW) < 40 && Math.abs(rect.height - prevH) < 80) return;
        measure();
      }
      window.addEventListener("resize", onResize);
      self.onResize = onResize;

      /* The X/Y margins below used to be flat guesses (-40, -70) that
         didn't account for how big an item actually renders (which
         varies — mobile vs desktop, --img-scale). Too small a guess lets
         an item's real edge push past the canvas bottom/top, which (since
         nothing clips vertically) shows up as a page scrollbar; too big a
         guess wastes screen the layout could otherwise use. Measuring the
         actual largest rendered item once and using that instead sizes
         the margin exactly, so it fills the available space without
         needing a scrollbar. */
      var maxHalfW = 60, maxHalfH = 80;
      items.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.width / 2 > maxHalfW) maxHalfW = rect.width / 2;
        if (rect.height / 2 > maxHalfH) maxHalfH = rect.height / 2;
      });

      /* X and Y radius are each computed against their OWN available
         space (maxRadiusX from width, maxRadiusY from height) rather than
         both being derived from one shared reference dimension with an
         aesthetic multiplier applied afterward. That coupling was the
         actual bug behind "doesn't span the screen on mobile": on a tall
         narrow phone, radius was sized as a fraction of the (large)
         HEIGHT, then the X axis got clamped down to whatever tiny
         fraction of THAT happened to fit the (much smaller) width —
         collapsing horizontal spread to a sliver regardless of how much
         width was actually available. Scaling radiusFrac against each
         axis's own max instead means both independently use their full
         safe range — the shape naturally elongates along whichever
         dimension has more room, no manual aspect-ratio-driven multiplier
         needed at all. */
      var start = performance.now();
      function tick(now) {
        if (!self.running) return;
        var t = (now - start) / 1000;
        var w = dims.w, h = dims.h;
        var centerX = w / 2, centerY = h / 2;
        var maxRadiusX = Math.max(30, centerX - maxHalfW - 12);
        var maxRadiusY = Math.max(40, centerY - maxHalfH - 12);
        state.forEach(function (s) {
          var radiusFrac = s.baseRadius + Math.sin(t * s.breatheSpeed + s.breathePhase) * s.breatheAmp;
          var angle = s.angle + t * s.speed;
          var x = centerX + Math.cos(angle) * radiusFrac * maxRadiusX;
          var y = centerY + Math.sin(angle) * radiusFrac * maxRadiusY;
          s.el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%) scale(" + s.scale + ")";
        });
        self.raf = requestAnimationFrame(tick);
      }
      self.raf = requestAnimationFrame(tick);
    },
    stop: function (items, canvas) {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.onResize) { window.removeEventListener("resize", this.onResize); this.onResize = null; }
      clearInline(items);
      restoreCanvasHeight(canvas);
    }
  };

  /* FX 02 — Sphere: items evenly distributed over an ellipsoid, each
     drifting toward the pointer.

     The ellipsoid's ORIENTATION is fixed — always a landscape oval facing
     the camera on desktop (a vertical one on phone, see axisScale) — it
     never tumbles. Only each item's own angular position (theta) animates
     over time, "spin" is a plain shared radians value baked into every
     item's theta every frame, not a transform on a parent group. Dragging
     adjusts that same shared value by hand instead of resuming auto-spin.
     (Previously the whole ellipsoid — including its elongation — rotated
     as a THREE.Group, so which way it faced tumbled continuously; the
     landscape/portrait shape was only true some of the time.) */
  var sphereLayout = {
    running: false,
    raf: null,
    stage: null,
    start: function (items) {
      this.running = true;
      var self = this;

      var spatialView = document.getElementById("spatialView");
      var stage = document.createElement("div");
      stage.className = "sphere-stage";
      spatialView.appendChild(stage);
      self.stage = stage;

      loadThree().then(function (mod) {
        if (!self.running || self.stage !== stage) return;
        var THREE = mod.THREE, CSS3DRenderer = mod.CSS3DRenderer, CSS3DObject = mod.CSS3DObject;

        var w = stage.clientWidth || window.innerWidth;
        var h = stage.clientHeight || (window.innerHeight - 140);

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(50, w / h, 1, 5000);
        camera.position.z = 900;

        var renderer = new CSS3DRenderer();
        renderer.setSize(w, h);
        stage.appendChild(renderer.domElement);

        var group = new THREE.Group();
        scene.add(group);

        var radius = w >= 768
          ? Math.max(180, Math.min(w, h) * 0.36) // web
          : Math.max(220, Math.min(w, h) * 0.46); // mobile
        var itemPx = w >= 768
          ? Math.min(260, Math.min(w, h) * 0.28) // web
          : Math.max(170, Math.min(w, h) * 0.36); // mobile

        /* Ellipsoid axis scale: wide viewports (web) read as a horizontal
           oval, narrow/tall viewports (phone) as a vertical oval. Depth
           (z) stays circular so the spin still reads as a spin. */
        function axisScale(rw, rh) {
          var aspect = rw / rh;
          if (aspect >= 1) {
            return { x: Math.min(2.2, 1 + aspect * 0.5), y: 0.6 };
          }
          return { x: 0.6, y: Math.min(1.8, 1 + (1 / aspect) * 0.1) }; //mobile
        }
        var axes = axisScale(w, h);

        /* Fibonacci sphere: evenly spaces N points over the sphere surface,
           stretched into a fixed-orientation ellipsoid by axes.x / axes.y. */
        var n = items.length;
        var goldenAngle = Math.PI * (3 - Math.sqrt(5));
        var sockets = items.map(function (el, i) {
          el.classList.add("in-sphere");
          el.style.width = itemPx + "px";

          var socket = document.createElement("div");
          socket.className = "sphere-socket";
          socket.appendChild(el);

          var obj = new CSS3DObject(socket);
          var yPos = 1 - (i + 0.5) / n * 2;
          var ringRadius = Math.sqrt(1 - yPos * yPos);
          group.add(obj);
          return { obj: obj, el: el, base: new THREE.Vector3(), yPos: yPos, ringRadius: ringRadius, baseTheta: goldenAngle * i };
        });

        var mouse = { x: 0, y: 0 };
        function onMove(e) {
          var rect = stage.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        }
        window.addEventListener("pointermove", onMove, { passive: true });
        self._onMove = onMove;

        // iOS Safari fires repeated resize events as its address bar
        // hides/shows during ordinary scrolling — each one recomputing
        // radius/itemPx/axes and snapping every item to it reads as a
        // jittery, "glitchy" rotation. Same fix as Orbit: ignore changes
        // too small to be an actual resize/orientation change.
        function onResize() {
          if (!self.running || self.stage !== stage) return;
          var rw = stage.clientWidth || window.innerWidth;
          var rh = stage.clientHeight || h;
          if (Math.abs(rw - w) < 40 && Math.abs(rh - h) < 80) return;
          w = rw; h = rh;
          camera.aspect = rw / rh;
          camera.updateProjectionMatrix();
          renderer.setSize(rw, rh);

          radius = rw >= 768
            ? Math.max(180, Math.min(rw, rh) * 0.36)
            : Math.max(220, Math.min(rw, rh) * 0.46);
          itemPx = rw >= 768
            ? Math.min(260, Math.min(rw, rh) * 0.28) // web
            : Math.max(170, Math.min(rw, rh) * 0.36); // mobile
          axes = axisScale(rw, rh);
          sockets.forEach(function (s) { s.el.style.width = itemPx + "px"; });
        }
        window.addEventListener("resize", onResize);
        self._onResize = onResize;

        /* Dragging spins the item wheel by hand (horizontal only, so the
           ellipsoid's fixed orientation is never disturbed); auto-spin
           resumes once the drag ends. Starting a drag from a transparent
           part of a look's own bounding box works too — only an actual
           solid pixel blocks it (VOHUM.spatialHit, js/main.js). */
        var dragging = false;
        var lastX = 0;
        var spin = 0;

        function onPointerDown(e) {
          if (VOHUM.spatialHit && VOHUM.spatialHit.isOverSolidItem(e.clientX, e.clientY)) return;
          dragging = true;
          lastX = e.clientX;
          stage.classList.add("dragging");
        }
        function onPointerMoveDrag(e) {
          if (!dragging) return;
          var dx = e.clientX - lastX;
          lastX = e.clientX;
          spin += dx * 0.006;
        }
        function onPointerUp() {
          dragging = false;
          stage.classList.remove("dragging");
        }
        stage.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMoveDrag, { passive: true });
        // On mobile, if the browser decides this gesture is an attempt to
        // scroll/pan the page, it can interrupt the pointer sequence with
        // "pointercancel" instead of ever firing "pointerup" — leaving
        // `dragging` stuck true forever, which is exactly why auto-spin
        // (only resumes when !dragging) never restarted. Treat cancel the
        // same as up. touch-action:none on .sphere-stage (CSS) additionally
        // stops the browser from trying to pan/scroll from this element in
        // the first place, so the gesture reaches us as a normal drag
        // instead of being taken over.
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        self._onPointerDown = onPointerDown;
        self._onPointerMoveDrag = onPointerMoveDrag;
        self._onPointerUp = onPointerUp;

        var mouseTarget = new THREE.Vector3();
        var tmp = new THREE.Vector3();

        function tick() {
          if (!self.running || self.stage !== stage) return;
          if (!dragging) spin += (VOHUM.TUNING && VOHUM.TUNING.ROTATION_SPEED) || 0.0016;
          mouseTarget.set(mouse.x * radius * 0.85, mouse.y * radius * 0.85, radius * 0.5);
          // This lerp toward the target position is a deliberately slow,
          // ambient ease for the idle "drift toward the pointer" behavior
          // — but drag input already moves `spin` instantly with the
          // mouse, so applying that same slow ease to a drag makes the
          // items barely visibly move DURING the gesture, then keep
          // catching up to where the drag already left off well after
          // you've let go — reading as "frozen, then suddenly spins".
          // While actively dragging, snap close to the target instead.
          var posLerp = dragging ? 0.5 : 0.035;
          sockets.forEach(function (s) {
            var theta = s.baseTheta + spin;
            s.base.set(
              Math.cos(theta) * s.ringRadius * radius * axes.x,
              s.yPos * radius * axes.y,
              Math.sin(theta) * s.ringRadius * radius
            );
            tmp.copy(s.base).lerp(mouseTarget, 0.12);
            s.obj.position.lerp(tmp, posLerp);
            s.obj.lookAt(camera.position);
          });
          renderer.render(scene, camera);
          self.raf = requestAnimationFrame(tick);
        }
        tick();
      });
    },
    stop: function (items, canvas) {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this._onMove) window.removeEventListener("pointermove", this._onMove);
      if (this._onResize) window.removeEventListener("resize", this._onResize);
      if (this._onPointerDown && this.stage) this.stage.removeEventListener("pointerdown", this._onPointerDown);
      if (this._onPointerMoveDrag) window.removeEventListener("pointermove", this._onPointerMoveDrag);
      if (this._onPointerUp) {
        window.removeEventListener("pointerup", this._onPointerUp);
        window.removeEventListener("pointercancel", this._onPointerUp);
      }
      items.forEach(function (el) {
        el.classList.remove("in-sphere");
        el.style.width = "";
        canvas.appendChild(el);
      });
      if (this.stage) { this.stage.remove(); this.stage = null; }
    }
  };

  var LAYOUTS = [orbitLayout, sphereLayout];
  var current = null;
  var currentIndex = -1;

  function switchTo(index, items, canvas) {
    if (current && current.stop) current.stop(items, canvas);
    current = LAYOUTS[index] || orbitLayout;
    currentIndex = index;
    current.start(items, canvas);
  }

  function stopCurrent(items, canvas) {
    if (current && current.stop) current.stop(items, canvas);
    current = null;
  }

  function resume(items, canvas) {
    if (currentIndex >= 0) switchTo(currentIndex, items, canvas);
  }

  VOHUM.layouts = { switchTo: switchTo, stopCurrent: stopCurrent, resume: resume };
  window.VOHUM = VOHUM;
})();
