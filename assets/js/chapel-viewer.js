// SKC Chapel 3D Viewer
// Custom Three.js scene with wireframe / overlay / textured rendering
// and a cinematic auto-tour: when scrolled into view, the camera slowly
// orbits the model and the render mode cycles through wireframe ->
// overlay -> textured. As soon as the user touches the canvas or clicks
// a mode button, the tour eases out and control hands over to them.

import * as THREE from 'https://esm.sh/three@0.169.0';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js';

const MODES = ['wireframe', 'overlay', 'textured'];

// Tour parameters
const TOUR_START_DELAY = 800;          // ms after load before tour begins
const TOUR_MODE_DURATION = 8000;       // ms each mode holds before cycling
const TOUR_RAMP_UP = 2.0;              // seconds for orbit speed to reach full
const TOUR_RAMP_DOWN = 1.4;            // seconds for orbit speed to ease to zero
const TOUR_AUTO_ROTATE_SPEED = 0.85;   // OrbitControls units; lower = slower (default 2.0 = 30s/orbit, so 0.85 ~ 70s/orbit)
const FADE_RATE = 0.09;                // per frame, how fast opacities lerp to targets (0-1)

class ChapelViewer {
  constructor(container) {
    this.container = container;
    this.canvas = container.querySelector('[data-chapel-canvas]');
    this.modeButtons = container.querySelectorAll('[data-chapel-mode]');
    this.loadingEl = container.querySelector('[data-chapel-loading]');
    this.progressEl = container.querySelector('[data-chapel-progress]');
    this.statusEl = container.querySelector('[data-chapel-status]');

    this.mode = 'wireframe';
    this.initialized = false;
    this.loaded = false;

    // Auto-tour state
    this.tourActive = false;
    this.tourSpeed = 0;
    this.tourSpeedTarget = 0;
    this.tourModeIndex = 0;
    this.tourModeStartTime = 0;
    this.tourCycleStartedFromIndex = 0;
    this.lastFrameTime = 0;

    // Fade targets (instant by default; overridden during transitions)
    this.texturedTargetOpacity = 0;
    this.wireframeTargetOpacity = 0.55;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0B1416);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.5,
      2000
    );
    this.camera.position.set(120, 80, 160);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    // Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.7;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 600;
    this.controls.target.set(0, 0, 0);

    // Any user input on the canvas ends the auto-tour
    this.controls.addEventListener('start', () => this.endAutoTour());

    // Resize handling
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();

    // Mode toggle wiring (clicks count as user interaction)
    this.modeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.chapelMode));
    });

    this.loadModel();
    this.animate();
  }

  loadModel() {
    const loader = new GLTFLoader();
    const url = '/assets/models/skc-chapel.glb';
    this.setStatus('Loading model...');

    loader.load(
      url,
      (gltf) => {
        this.gltf = gltf;
        this.processModel(gltf.scene);
        this.loaded = true;
        this.hideLoading();
        this.frameModel();
        // Kick off the cinematic tour shortly after the model lands
        setTimeout(() => this.startAutoTour(), TOUR_START_DELAY);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          this.setProgress(pct);
        } else if (xhr.loaded) {
          const mb = (xhr.loaded / 1024 / 1024).toFixed(1);
          this.setStatus(`Loading model... ${mb} MB`);
        }
      },
      (err) => {
        this.setStatus('Could not load 3D model.');
        console.error('GLB load failed:', err);
      }
    );
  }

  processModel(modelRoot) {
    this.modelRoot = modelRoot;
    this.texturedMeshes = [];
    this.wireframeLines = [];

    // RealityScan exports OBJ with Z-up (elevation in Z), but trimesh's
    // OBJ -> GLB conversion did not apply the Z-up to Y-up swap that
    // GLTF expects, so Three.js was treating the north-south axis as
    // vertical. Rotate -90 degrees around X so the model's elevation
    // axis aligns with Three.js's up-axis. After this, the bounding
    // box reads as roughly 115m wide x 22m tall x 190m deep, which is
    // what we want for a sensible orbit and frame.
    modelRoot.rotation.x = -Math.PI / 2;

    modelRoot.traverse((child) => {
      if (!child.isMesh) return;

      // Replace the PBR material with MeshBasicMaterial. Photogrammetry
      // textures already bake all lighting and shading into the diffuse,
      // so no scene lighting is needed and the result reads exactly like
      // the source capture.
      const originalMaterial = child.material;
      const map = originalMaterial?.map || null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
      }
      child.material = new THREE.MeshBasicMaterial({
        map,
        side: THREE.DoubleSide,
        color: 0xffffff,
        transparent: true,
        opacity: 0
      });
      this.texturedMeshes.push(child);

      // Wireframe overlay built from the same geometry
      const wireGeom = new THREE.WireframeGeometry(child.geometry);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xf7f6f1,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      const wire = new THREE.LineSegments(wireGeom, wireMat);
      wire.position.copy(child.position);
      wire.rotation.copy(child.rotation);
      wire.scale.copy(child.scale);
      child.parent.add(wire);
      this.wireframeLines.push(wire);
    });

    this.scene.add(modelRoot);
    this.applyMode({ instant: true });
  }

  frameModel() {
    if (!this.modelRoot) return;
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // The chapel site is roughly 115m wide x 190m deep with only ~22m
    // of vertical extent. Sizing camera distance from the largest
    // dimension treats the long horizontal axis as if it were "height,"
    // which lifts the camera too far above the property and makes the
    // auto-orbit dip below the ground plane visually. We base distance
    // on the horizontal footprint instead and place the camera at an
    // altitude proportional to the vertical extent, which gives a
    // drone-flying-the-perimeter feel during the auto-tour.
    const horizontal = Math.max(size.x, size.z);
    const vertical = Math.max(size.y, 1);

    const fov = this.camera.fov * (Math.PI / 180);
    const dist = (horizontal / 2) / Math.tan(fov / 2) * 1.45;

    // Pivot the orbit slightly above ground so the camera sweeps the
    // chapel rooftops rather than rotating around something below them.
    this.controls.target.copy(center);
    this.controls.target.y = center.y + vertical * 0.45;

    // Place the camera at a 3/4 corner of the property, at a moderate
    // altitude relative to the model height. minimum 30m so the angle
    // still reads as aerial on very short structures.
    const startAngle = Math.PI / 4;
    const camOffsetX = Math.cos(startAngle) * dist;
    const camOffsetZ = Math.sin(startAngle) * dist;
    const camOffsetY = Math.max(vertical * 1.4, 30);
    this.camera.position.set(
      center.x + camOffsetX,
      center.y + camOffsetY,
      center.z + camOffsetZ
    );

    this.camera.near = dist / 200;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();

    // Keep the orbit above the horizon line. Without this, both
    // auto-rotate and user dragging can flip the camera below the
    // ground plane, and the model is one-sided so it disappears.
    this.controls.maxPolarAngle = Math.PI * 0.48;

    this.controls.update();
  }

  setMode(mode, opts = {}) {
    if (!MODES.includes(mode) || mode === this.mode) return;
    this.mode = mode;
    this.modeButtons.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.chapelMode === mode);
    });
    this.applyMode();
    if (!opts.silent) this.endAutoTour();
  }

  applyMode(opts = {}) {
    if (!this.texturedMeshes || !this.wireframeLines) return;

    const showTextured = this.mode === 'textured' || this.mode === 'overlay';
    const showWireframe = this.mode === 'wireframe' || this.mode === 'overlay';

    this.texturedTargetOpacity = showTextured ? 1 : 0;
    this.wireframeTargetOpacity = showWireframe
      ? (this.mode === 'overlay' ? 0.42 : 0.6)
      : 0;

    if (opts.instant) {
      this.texturedMeshes.forEach(m => { m.material.opacity = this.texturedTargetOpacity; });
      this.wireframeLines.forEach(w => { w.material.opacity = this.wireframeTargetOpacity; });
    }

    // Slightly different background per mode for added contrast
    if (this.mode === 'textured') {
      this.scene.background = new THREE.Color(0x14201f);
    } else {
      this.scene.background = new THREE.Color(0x0B1416);
    }
  }

  startAutoTour() {
    if (this.tourActive) return;
    this.tourActive = true;
    this.tourSpeedTarget = 1;
    this.tourModeIndex = 0;
    this.tourModeStartTime = performance.now();
    this.controls.autoRotate = true;
    this.setMode(this.tourModeOrder()[0], { silent: true });
    this.container.classList.add('chapel-viewer-touring');
  }

  endAutoTour() {
    if (!this.tourActive && this.tourSpeed === 0) return;
    this.tourActive = false;
    this.tourSpeedTarget = 0;
    this.container.classList.remove('chapel-viewer-touring');
    // The animate loop will ramp tourSpeed -> 0 and disable autoRotate
    // when it reaches zero, so the orbit eases to a stop.
  }

  tourModeOrder() {
    return MODES;
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setProgress(pct) {
    if (this.progressEl) this.progressEl.style.transform = `scaleX(${pct / 100})`;
    if (this.statusEl) this.statusEl.textContent = `Loading model · ${pct}%`;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  hideLoading() {
    if (this.loadingEl) {
      this.loadingEl.classList.add('is-hidden');
      setTimeout(() => { this.loadingEl.style.display = 'none'; }, 500);
    }
    this.container.classList.add('is-loaded');
  }

  animate() {
    if (!this.initialized) return;
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = this.lastFrameTime ? Math.min(0.05, (now - this.lastFrameTime) / 1000) : 1 / 60;
    this.lastFrameTime = now;

    // Auto-tour: ramp the orbit speed up while active, ramp it down when ended
    if (this.tourSpeedTarget !== this.tourSpeed) {
      const rampPerSec = this.tourSpeedTarget > this.tourSpeed
        ? 1 / TOUR_RAMP_UP
        : 1 / TOUR_RAMP_DOWN;
      const delta = rampPerSec * dt;
      if (this.tourSpeedTarget > this.tourSpeed) {
        this.tourSpeed = Math.min(this.tourSpeedTarget, this.tourSpeed + delta);
      } else {
        this.tourSpeed = Math.max(this.tourSpeedTarget, this.tourSpeed - delta);
      }
    }

    if (this.controls) {
      if (this.tourSpeed > 0) {
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = TOUR_AUTO_ROTATE_SPEED * this.tourSpeed;
      } else {
        this.controls.autoRotate = false;
      }
    }

    // While the tour is active, advance the mode cycle on a schedule
    if (this.tourActive && this.tourModeStartTime) {
      const elapsed = now - this.tourModeStartTime;
      if (elapsed >= TOUR_MODE_DURATION) {
        this.tourModeIndex = (this.tourModeIndex + 1) % this.tourModeOrder().length;
        this.tourModeStartTime = now;
        this.setMode(this.tourModeOrder()[this.tourModeIndex], { silent: true });
      }
    }

    // Smoothly fade the textured + wireframe opacities toward their targets
    if (this.texturedMeshes) {
      this.texturedMeshes.forEach(m => {
        const cur = m.material.opacity;
        const target = this.texturedTargetOpacity;
        if (Math.abs(cur - target) < 0.005) {
          m.material.opacity = target;
        } else {
          m.material.opacity = cur + (target - cur) * FADE_RATE;
        }
        m.visible = m.material.opacity > 0.01;
      });
    }
    if (this.wireframeLines) {
      this.wireframeLines.forEach(w => {
        const cur = w.material.opacity;
        const target = this.wireframeTargetOpacity;
        if (Math.abs(cur - target) < 0.005) {
          w.material.opacity = target;
        } else {
          w.material.opacity = cur + (target - cur) * FADE_RATE;
        }
        w.visible = w.material.opacity > 0.01;
      });
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Lazy-init viewers when scrolled into view
function bootChapelViewers() {
  const containers = document.querySelectorAll('[data-chapel-viewer]');
  if (!containers.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const viewer = new ChapelViewer(entry.target);
        viewer.init();
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '200px' });

  containers.forEach(el => observer.observe(el));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootChapelViewers);
} else {
  bootChapelViewers();
}
