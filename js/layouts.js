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
    });
  }

  function useViewportHeight(canvas) {
    canvas.style.minHeight = Math.max(560, window.innerHeight - 150) + "px";
  }
  function restoreCanvasHeight(canvas) {
    canvas.style.minHeight = "";
  }

  /* FX 01 — Orbit: items travel in two slow concentric rings, staying upright.

     Positions are computed in pixels from a single reference dimension
     (canvas width on wide viewports, height on narrow ones) rather than
     as a % of the container for both axes — a "circle" defined by equal
     x%/y% is only actually round if the container is square, and this
     canvas isn't. A wide radius gap between rings, a per-item radius
     "breathe" out of phase with every other item, and a radius clamped
     to the container's actual size (with margin) round it out. */
  var orbitLayout = {
    running: false,
    raf: null,
    onResize: null,
    start: function (items, canvas) {
      this.running = true;
      useViewportHeight(canvas);
      var self = this;
      var n = items.length;
      var state = items.map(function (el, i) {
        var ring = i % 2;
        return {
          el: el,
          ring: ring,
          baseRadius: ring === 0 ? 0.09 : 0.46, // fraction of canvas WIDTH — wider ring gap, less crossing
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
      function onResize() { measure(); }
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

      /* Wide viewports (web): spread mainly horizontally, referenced off
         canvas width. Narrow/tall viewports (phone): swap to a vertical
         spread referenced off canvas height instead — same idea as FX02
         (Sphere)'s axisScale, so the shape actually uses the screen it's
         given rather than staying a small circle lost in a tall, mostly
         empty mobile canvas. 0.85 (not the ~0.6 this used to be) so it
         actually fills most of the available cross-axis room instead of
         leaving roughly half the canvas unused on that axis. */
      function axisScale(w, h) {
        var aspect = w / h;
        if (aspect >= 1) return { ref: w, xMul: 1, yMul: 0.85 };
        return { ref: h, xMul: 0.85, yMul: 1 };
      }

      var start = performance.now();
      function tick(now) {
        if (!self.running) return;
        var t = (now - start) / 1000;
        var w = dims.w, h = dims.h;
        var centerX = w / 2, centerY = h / 2;
        var axes = axisScale(w, h);
        var maxRadiusX = Math.max(30, centerX - maxHalfW - 16);
        var maxRadiusY = Math.max(40, centerY - maxHalfH - 16);
        state.forEach(function (s) {
          var radiusFrac = s.baseRadius + Math.sin(t * s.breatheSpeed + s.breathePhase) * s.breatheAmp;
          var angle = s.angle + t * s.speed;
          var radiusPx = radiusFrac * axes.ref;
          var xMul = Math.min(axes.xMul, maxRadiusX / Math.max(1, radiusPx));
          var yMul = Math.min(axes.yMul, maxRadiusY / Math.max(1, radiusPx));
          var x = centerX + radiusPx * xMul * Math.cos(angle);
          var y = centerY + radiusPx * yMul * Math.sin(angle);
          s.el.style.left = x + "px";
          s.el.style.top = y + "px";
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

        var radius = Math.max(150, Math.min(w, h) * 0.34);
        var itemPx = Math.max(130, Math.min(w, h) * 0.28);

        /* Ellipsoid axis scale: wide viewports (web) read as a horizontal
           oval, narrow/tall viewports (phone) as a vertical oval. Depth
           (z) stays circular so the spin still reads as a spin. */
        function axisScale(rw, rh) {
          var aspect = rw / rh;
          if (aspect >= 1) {
            return { x: Math.min(1.7, 1 + aspect * 0.4), y: 0.62 };
          }
          return { x: 0.62, y: Math.min(1.7, 1 + (1 / aspect) * 0.4) };
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

        function onResize() {
          if (!self.running || self.stage !== stage) return;
          var rw = stage.clientWidth || window.innerWidth;
          var rh = stage.clientHeight || h;
          camera.aspect = rw / rh;
          camera.updateProjectionMatrix();
          renderer.setSize(rw, rh);

          radius = Math.max(150, Math.min(rw, rh) * 0.34);
          itemPx = Math.max(130, Math.min(rw, rh) * 0.28);
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
        window.addEventListener("pointerup", onPointerUp);
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
      if (this._onPointerUp) window.removeEventListener("pointerup", this._onPointerUp);
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
