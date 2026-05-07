// SKC Chapel 3D Viewer
// Custom Three.js scene with wireframe-default rendering and a three-way
// toggle (wireframe / wireframe + textured overlay / textured).
// Lazy-loaded via IntersectionObserver so the 27 MB GLB only downloads
// when a visitor scrolls into the chapel section.

import * as THREE from 'https://esm.sh/three@0.169.0';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js';

const MODES = ['wireframe', 'overlay', 'textured'];
const MODE_LABELS = {
  wireframe: 'Wireframe',
  overlay: 'Overlay',
  textured: 'Textured'
};

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

    // Lights for the textured view
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.directionalLight.position.set(60, 100, 80);
    this.scene.add(this.ambientLight);
    this.scene.add(this.directionalLight);

    // Resize handling
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();

    // Mode toggle wiring
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

    modelRoot.traverse((child) => {
      if (!child.isMesh) return;

      // Replace the PBR material with MeshBasicMaterial. Photogrammetry
      // textures already bake all lighting and shading into the diffuse,
      // so no scene lighting is needed and the result reads exactly like
      // the source capture instead of going dark in low-key environments.
      const originalMaterial = child.material;
      const map = originalMaterial?.map || null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
      }
      child.material = new THREE.MeshBasicMaterial({
        map,
        side: THREE.DoubleSide,
        color: 0xffffff
      });
      this.texturedMeshes.push(child);

      // Build a wireframe overlay using WireframeGeometry on the same mesh
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
    this.applyMode();
  }

  frameModel() {
    if (!this.modelRoot) return;
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    this.controls.target.copy(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.6; // a little headroom

    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    this.camera.near = dist / 200;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setMode(mode) {
    if (!MODES.includes(mode) || mode === this.mode) return;
    this.mode = mode;
    this.modeButtons.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.chapelMode === mode);
    });
    this.applyMode();
  }

  applyMode() {
    if (!this.texturedMeshes || !this.wireframeLines) return;
    const showTextured = this.mode === 'textured' || this.mode === 'overlay';
    const showWireframe = this.mode === 'wireframe' || this.mode === 'overlay';

    this.texturedMeshes.forEach(m => { m.visible = showTextured; });
    this.wireframeLines.forEach(w => {
      w.visible = showWireframe;
      // Slightly thinner lines when overlayed on textured surface
      w.material.opacity = this.mode === 'overlay' ? 0.4 : 0.55;
    });

    // Slightly different background to suit the mode
    if (this.mode === 'textured') {
      this.scene.background = new THREE.Color(0x14201f);
    } else {
      this.scene.background = new THREE.Color(0x0B1416);
    }
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
