// Duplain Aerials — 404 mini-game.
// Side-scrolling drone flight. Hold to ascend, release to descend.
// Vanilla module. No deps. Canvas + RAF.

const BRAND = {
  paper: '#F7F6F1',
  paperWarm: '#EFEDE4',
  ink: '#0B1416',
  inkSoft: '#1B2528',
  gulf: '#1D6A7A',
  gulfDeep: '#134350',
  shallow: '#7CC4C9',
  estuary: '#2E4F3F',
  sawgrass: '#8FA37F',
  sand: '#E8DFCF',
  sandDeep: '#C9B99A',
  rule: 'rgba(11, 20, 22, 0.18)',
  muted: 'rgba(11, 20, 22, 0.55)',
};

const BEST_KEY = 'duplainAerials.notfoundBest';

const root = document.querySelector('[data-notfound-game]');
if (root) initGame(root);

function initGame(root) {
  const canvas = root.querySelector('[data-game-canvas]');
  const overlay = root.querySelector('[data-game-overlay]');
  const startBtn = root.querySelector('[data-game-start]');
  const altEl = root.querySelector('[data-hud-alt]');
  const scoreEl = root.querySelector('[data-hud-score]');
  const bestEl = root.querySelector('[data-hud-best]');
  const overlayTitle = root.querySelector('[data-overlay-title]');
  const overlayKicker = root.querySelector('[data-overlay-kicker]');
  const overlayLede = root.querySelector('[data-overlay-lede]');
  const overlayControls = root.querySelector('[data-overlay-controls]');

  const ctx = canvas.getContext('2d');
  const flash = document.createElement('div');
  flash.className = 'notfound-game-flash';
  root.appendChild(flash);

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;   // CSS pixels (logical)
  let H = 0;
  let groundY = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width));
    H = Math.max(220, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H - Math.max(36, H * 0.14);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---------- game state ----------
  const state = {
    mode: 'idle', // idle | playing | over
    t: 0,
    speed: 180,         // px/s base
    speedMax: 460,
    accel: 6.0,         // speed gain per second
    spawnTimer: 0,
    spawnInterval: 1.35,
    minSpawn: 0.55,
    distance: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0) | 0,
    obstacles: [],
    birds: [],
    helicopters: [],
    clouds: [],
    sawgrass: [],
    contours: [],
    gust: 0,           // active gust impulse, decays
    gustTimer: 5,
  };

  bestEl.textContent = pad(state.best, 4);

  // Drone (player)
  const drone = {
    x: 0,
    y: 0,
    vy: 0,
    gravity: 720,
    thrust: -1280,
    maxFall: 520,
    maxRise: -360,
    w: 64,
    h: 26,
    tilt: 0,        // radians, based on vy
    rotor: 0,       // rotor angle (cosmetic)
  };

  function resetWorld() {
    drone.x = Math.max(80, W * 0.22);
    drone.y = H * 0.42;
    drone.vy = 0;
    drone.tilt = 0;
    state.t = 0;
    state.speed = 180;
    state.spawnTimer = 0.6;
    state.spawnInterval = 1.35;
    state.distance = 0;
    state.score = 0;
    state.obstacles.length = 0;
    state.birds.length = 0;
    state.helicopters.length = 0;
    state.gust = 0;
    state.gustTimer = 5;
    initBackground();
  }

  function initBackground() {
    state.clouds = [];
    for (let i = 0; i < 5; i++) {
      state.clouds.push({
        x: Math.random() * W,
        y: 20 + Math.random() * (H * 0.30),
        r: 18 + Math.random() * 22,
        s: 14 + Math.random() * 10,
      });
    }
    state.contours = [];
    for (let i = 0; i < 4; i++) {
      state.contours.push({ x: Math.random() * W, y: groundY - 90 - i * 12, w: 420 + Math.random() * 200, amp: 14 + i * 3 });
    }
    state.sawgrass = [];
    for (let i = 0; i < 60; i++) {
      state.sawgrass.push({
        x: Math.random() * W,
        h: 6 + Math.random() * 14,
        b: 0.6 + Math.random() * 0.6,
      });
    }
  }
  initBackground();

  // ---------- input ----------
  let holding = false;
  const setHold = (v) => { holding = v; };

  canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onPress(); });
  canvas.addEventListener('mouseup',   () => setHold(false));
  canvas.addEventListener('mouseleave',() => setHold(false));

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPress(); }, { passive: false });
  canvas.addEventListener('touchend',   (e) => { e.preventDefault(); setHold(false); }, { passive: false });
  canvas.addEventListener('touchcancel',() => setHold(false));

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      onPress();
    } else if (e.code === 'Escape' && state.mode === 'playing') {
      gameOver(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') setHold(false);
  });

  startBtn.addEventListener('click', startGame);

  function onPress() {
    if (state.mode === 'idle' || state.mode === 'over') {
      startGame();
      return;
    }
    setHold(true);
  }

  function startGame() {
    resetWorld();
    state.mode = 'playing';
    overlay.hidden = true;
    canvas.focus({ preventScroll: true });
  }

  function gameOver(escaped = false) {
    if (state.mode !== 'playing') return;
    state.mode = 'over';
    holding = false;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
      bestEl.textContent = pad(state.best, 4);
    }
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');

    overlayKicker.textContent = escaped ? 'Aborted' : 'Signal lost';
    overlayTitle.innerHTML = escaped
      ? 'Brought it <em>home.</em>'
      : 'Drone <em>down.</em>';
    overlayLede.textContent = state.score >= state.best && state.score > 0
      ? `New personal best of ${state.score} feet. Send it again.`
      : `You held the signal for ${state.score} feet. Best so far: ${state.best}.`;
    overlayControls.textContent = 'SPACE · TAP · CLICK TO RETRY';
    startBtn.textContent = 'Press space to fly again';
    overlay.hidden = false;
  }

  // ---------- loop ----------
  let last = performance.now();
  let rafId = 0;
  let running = true;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.045, (now - last) / 1000);
    last = now;
    if (!running) return;

    if (state.mode === 'playing') update(dt);
    draw(dt);
  }
  rafId = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  // ---------- update ----------
  function update(dt) {
    state.t += dt;
    state.speed = Math.min(state.speedMax, state.speed + state.accel * dt);
    state.spawnInterval = Math.max(state.minSpawn, 1.35 - state.t * 0.018);

    // Drone physics
    const wind = state.gust;
    drone.vy += drone.gravity * dt + wind * dt;
    if (holding) drone.vy += drone.thrust * dt;
    drone.vy = clamp(drone.vy, drone.maxRise, drone.maxFall);
    drone.y += drone.vy * dt;
    drone.tilt = clamp(drone.vy / 700, -0.35, 0.35);
    drone.rotor += dt * 40;

    // Floor / ceiling crash
    if (drone.y + drone.h * 0.5 >= groundY - 4) {
      drone.y = groundY - 4 - drone.h * 0.5;
      gameOver(false);
      return;
    }
    if (drone.y < 10) { drone.y = 10; drone.vy = Math.max(drone.vy, 60); }

    // Distance / score
    state.distance += state.speed * dt;
    state.score = Math.floor(state.distance / 5);

    // Gusts (after a warmup)
    state.gust *= Math.max(0, 1 - dt * 2.2);
    if (state.t > 14) {
      state.gustTimer -= dt;
      if (state.gustTimer <= 0) {
        state.gustTimer = 4 + Math.random() * 5;
        state.gust = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 160);
      }
    }

    // Spawning
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = state.spawnInterval * (0.85 + Math.random() * 0.35);
    }

    // Move + cull obstacles
    for (const o of state.obstacles) o.x -= state.speed * dt;
    state.obstacles = state.obstacles.filter(o => o.x + o.w > -40);

    for (const b of state.birds) {
      b.x -= (state.speed + b.relSpeed) * dt;
      b.flap += dt * 8;
      b.y += Math.sin(state.t * 1.4 + b.phase) * 14 * dt;
    }
    state.birds = state.birds.filter(b => b.x + b.w > -40);

    for (const h of state.helicopters) {
      h.x -= (state.speed + h.relSpeed) * dt;
      h.rotor += dt * 38;
      h.tailRotor += dt * 80;
      h.bob += dt * 1.6;
      h.y = h.yBase + Math.sin(h.bob) * 10;
    }
    state.helicopters = state.helicopters.filter(h => h.x + h.w > -60);

    // Background motion
    for (const c of state.clouds) {
      c.x -= c.s * dt;
      if (c.x + c.r < -10) { c.x = W + c.r + Math.random() * 80; c.y = 20 + Math.random() * (H * 0.30); }
    }
    for (const k of state.contours) {
      k.x -= state.speed * 0.18 * dt;
      if (k.x + k.w < -20) k.x = W + Math.random() * 60;
    }
    for (const g of state.sawgrass) {
      g.x -= state.speed * 1.1 * dt;
      if (g.x < -4) g.x = W + Math.random() * 30;
    }

    // Collisions
    if (collides()) gameOver(false);

    // HUD
    altEl.textContent = pad(Math.max(0, Math.round(groundY - drone.y)), 4);
    scoreEl.textContent = pad(state.score, 4);
  }

  function spawnObstacle() {
    const t = state.t;
    // Helicopters fade in after a warm-up, then ramp toward common
    const heliChance = t < 16 ? 0 : Math.min(0.32, (t - 16) * 0.011);
    const birdChance = Math.min(0.34, 0.10 + t * 0.0045);
    const poleChance = 0.22;
    const r = Math.random();
    if (r < heliChance) {
      spawnHelicopter();
    } else if (r < heliChance + birdChance) {
      spawnBird();
    } else if (r < heliChance + birdChance + poleChance) {
      spawnPole();
    } else {
      spawnTree();
    }
    // Occasional double trees for variety
    if (t > 10 && Math.random() < 0.18) {
      setTimeout(() => { if (state.mode === 'playing') spawnTree(180); }, 0);
    }
  }

  function spawnTree(offset = 0) {
    const variant = Math.random() < 0.55 ? 'palm' : 'mangrove';
    const h = variant === 'palm'
      ? 110 + Math.random() * 70
      : 70 + Math.random() * 60;
    const w = variant === 'palm' ? 26 : 50;
    state.obstacles.push({
      type: 'tree', variant,
      x: W + 40 + offset,
      y: groundY - h,
      w, h,
      // hitbox tighter than visual
      hb: { x: 6, y: 6, w: w - 12, h: h - 8 },
      seed: Math.random() * 1000,
    });
  }

  function spawnPole() {
    const poleH = 130 + Math.random() * 50;
    const armY = 30 + Math.random() * 20;
    const wireSag = 12 + Math.random() * 10;
    state.obstacles.push({
      type: 'pole',
      x: W + 60,
      y: groundY - poleH,
      w: 32,
      h: poleH,
      armY,
      wireSag,
      hb: { x: 13, y: 0, w: 6, h: poleH - 6 },          // mast
      hbArm: { x: -2, y: armY - 3, w: 36, h: 5 },        // crossbar
    });
  }

  function spawnBird() {
    const w = 38;
    const h = 18;
    const yMin = 30;
    const yMax = groundY - 80;
    const y = yMin + Math.random() * (yMax - yMin);
    state.birds.push({
      x: W + 30,
      y,
      w, h,
      flap: Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
      relSpeed: 30 + Math.random() * 40,
    });
  }

  function spawnHelicopter() {
    const w = 92;
    const h = 30;
    const yMin = 38;
    const yMax = groundY - 110;
    const yBase = yMin + Math.random() * (yMax - yMin);
    state.helicopters.push({
      x: W + 50,
      y: yBase,
      yBase,
      w, h,
      relSpeed: 50 + Math.random() * 80,
      rotor: Math.random() * Math.PI * 2,
      tailRotor: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
    });
  }

  // ---------- collisions ----------
  function droneRect() {
    // Tight hitbox inside drawn silhouette
    return {
      x: drone.x - drone.w * 0.36,
      y: drone.y - drone.h * 0.32,
      w: drone.w * 0.72,
      h: drone.h * 0.64,
    };
  }

  function rectsHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function collides() {
    const dr = droneRect();
    for (const o of state.obstacles) {
      if (o.type === 'pole') {
        const mast = { x: o.x + o.hb.x, y: o.y + o.hb.y, w: o.hb.w, h: o.hb.h };
        const arm  = { x: o.x + o.hbArm.x, y: o.y + o.hbArm.y, w: o.hbArm.w, h: o.hbArm.h };
        if (rectsHit(dr, mast) || rectsHit(dr, arm)) return true;
      } else {
        const r = { x: o.x + o.hb.x, y: o.y + o.hb.y, w: o.hb.w, h: o.hb.h };
        if (rectsHit(dr, r)) return true;
      }
    }
    for (const b of state.birds) {
      const r = { x: b.x + 4, y: b.y + 3, w: b.w - 8, h: b.h - 6 };
      if (rectsHit(dr, r)) return true;
    }
    for (const h of state.helicopters) {
      // Body + cockpit
      const body = { x: h.x + 14, y: h.y + 8, w: 42, h: h.h - 12 };
      // Tail boom
      const tail = { x: h.x + 50, y: h.y + 14, w: 32, h: 4 };
      if (rectsHit(dr, body) || rectsHit(dr, tail)) return true;
    }
    return false;
  }

  // ---------- drawing ----------
  function draw() {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, BRAND.paper);
    sky.addColorStop(0.55, BRAND.paperWarm);
    sky.addColorStop(1, BRAND.sand);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawTopoBackground();
    drawClouds();
    drawDistantContours();
    drawGround();
    drawObstacles();
    drawBirds();
    drawHelicopters();
    drawDrone();
    drawHUDMarkers();
  }

  function drawTopoBackground() {
    ctx.save();
    ctx.strokeStyle = BRAND.estuary;
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 0.6;
    const baseY = H * 0.28;
    for (let i = 0; i < 6; i++) {
      const yy = baseY + i * 16;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 24) {
        const y = yy + Math.sin((x + state.t * 18 + i * 40) * 0.012) * 14;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawClouds() {
    ctx.save();
    ctx.strokeStyle = BRAND.gulfDeep;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    for (const c of state.clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r, c.r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c.x + c.r * 0.5, c.y + 4, c.r * 0.7, c.r * 0.30, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDistantContours() {
    ctx.save();
    ctx.strokeStyle = BRAND.sawgrass;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (const k of state.contours) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = k.x + t * k.w;
        const y = k.y + Math.sin(t * Math.PI * 2 + k.x * 0.01) * k.amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround() {
    // Sand fill below ground line
    ctx.fillStyle = BRAND.sand;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Soft horizon band
    ctx.save();
    ctx.fillStyle = BRAND.sandDeep;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 16) {
      const y = groundY + Math.sin((x + state.t * 60) * 0.022) * 1.6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, groundY + 6);
    ctx.lineTo(0, groundY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Surveyor ground line
    ctx.save();
    ctx.strokeStyle = BRAND.ink;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    // Tick marks
    ctx.strokeStyle = BRAND.inkSoft;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.7;
    const tickSpacing = 24;
    const offset = (state.distance * 0.2) % tickSpacing;
    for (let x = -offset; x < W; x += tickSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, groundY + 4);
      ctx.stroke();
    }
    ctx.restore();

    // Sawgrass tufts
    ctx.save();
    ctx.strokeStyle = BRAND.estuary;
    ctx.lineWidth = 1;
    for (const g of state.sawgrass) {
      const bx = g.x;
      const by = groundY;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - g.b, by - g.h);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + g.b, by - g.h * 0.85);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - g.h * 1.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of state.obstacles) {
      if (o.type === 'tree' && o.variant === 'palm') drawPalm(o);
      else if (o.type === 'tree' && o.variant === 'mangrove') drawMangrove(o);
      else if (o.type === 'pole') drawPole(o);
    }
  }

  function drawPalm(o) {
    ctx.save();
    ctx.strokeStyle = BRAND.ink;
    ctx.fillStyle = BRAND.estuary;
    ctx.lineWidth = 1.4;
    const trunkX = o.x + o.w * 0.5;
    const trunkTop = o.y + 14;
    // Trunk (slight curve)
    ctx.beginPath();
    ctx.moveTo(trunkX - 2, groundY);
    ctx.quadraticCurveTo(trunkX + Math.sin(o.seed) * 4, (groundY + trunkTop) / 2, trunkX, trunkTop);
    ctx.lineTo(trunkX + 2, trunkTop);
    ctx.quadraticCurveTo(trunkX + 2 + Math.sin(o.seed) * 4, (groundY + trunkTop) / 2, trunkX + 2, groundY);
    ctx.closePath();
    ctx.fillStyle = BRAND.inkSoft;
    ctx.fill();

    // Trunk segment lines
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 7; i++) {
      const y = trunkTop + (groundY - trunkTop) * (i / 7) + 4;
      ctx.beginPath();
      ctx.moveTo(trunkX - 3, y);
      ctx.quadraticCurveTo(trunkX, y + 1, trunkX + 5, y);
      ctx.stroke();
    }

    // Fronds — radial line-art
    ctx.strokeStyle = BRAND.estuary;
    ctx.lineWidth = 1.2;
    const cx = trunkX;
    const cy = trunkTop;
    const fronds = 9;
    for (let i = 0; i < fronds; i++) {
      const a = -Math.PI / 2 + (i - (fronds - 1) / 2) * 0.32 + Math.sin(o.seed + i) * 0.05;
      const len = 22 + Math.sin(o.seed + i * 2) * 6;
      const ex = cx + Math.cos(a) * len;
      const ey = cy + Math.sin(a) * len;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo((cx + ex) / 2, cy - 4 + i, ex, ey);
      ctx.stroke();
      // Leaflets
      for (let j = 1; j <= 4; j++) {
        const t = j / 4;
        const mx = cx + (ex - cx) * t;
        const my = cy + (ey - cy) * t;
        const nx = Math.cos(a + Math.PI / 2) * 3;
        const ny = Math.sin(a + Math.PI / 2) * 3;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + nx, my + ny);
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - nx, my - ny);
        ctx.stroke();
      }
    }

    // Coconut cluster
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.arc(cx - 2, cy + 3, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + 2, cy + 4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMangrove(o) {
    ctx.save();
    ctx.fillStyle = BRAND.estuary;
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1;
    // Cluster of overlapping ovals = canopy
    const baseX = o.x + o.w * 0.5;
    const baseY = groundY;
    const top = o.y;
    const canopyH = (baseY - top) * 0.75;

    // Roots (prop-root lines)
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const rx = baseX + i * 6;
      ctx.moveTo(rx, baseY);
      ctx.lineTo(baseX + i * 2, baseY - 14);
    }
    ctx.stroke();

    // Canopy shapes
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - canopyH * 0.5 - 10, o.w * 0.42, canopyH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(baseX - o.w * 0.18, baseY - canopyH * 0.75 - 6, o.w * 0.28, canopyH * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(baseX + o.w * 0.20, baseY - canopyH * 0.72 - 4, o.w * 0.28, canopyH * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Texture flecks
    ctx.fillStyle = BRAND.ink;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + o.seed;
      const rx = baseX + Math.cos(a) * (o.w * 0.32);
      const ry = baseY - canopyH * 0.55 + Math.sin(a) * (canopyH * 0.40);
      ctx.beginPath();
      ctx.arc(rx, ry, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPole(o) {
    ctx.save();
    const cx = o.x + o.w * 0.5;
    const top = o.y;
    const armY = top + o.armY;

    // Mast
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(cx - 2, top, 4, o.h);

    // Crossbar
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(cx - 16, armY - 1.5, 32, 3);

    // Insulator pegs
    ctx.fillStyle = BRAND.inkSoft;
    ctx.fillRect(cx - 14, armY - 5, 2, 4);
    ctx.fillRect(cx - 1, armY - 5, 2, 4);
    ctx.fillRect(cx + 12, armY - 5, 2, 4);

    // Wires (hanging catenary) — to neighbor edges
    ctx.strokeStyle = BRAND.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.7;
    for (const dx of [-14, 0, 14]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 80, armY - 4 + o.wireSag);
      ctx.quadraticCurveTo(cx + dx - 40, armY - 4 + o.wireSag + 14, cx + dx, armY - 4);
      ctx.moveTo(cx + dx, armY - 4);
      ctx.quadraticCurveTo(cx + dx + 40, armY - 4 + o.wireSag + 14, cx + dx + 80, armY - 4 + o.wireSag);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBirds() {
    ctx.save();
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (const b of state.birds) {
      const flap = Math.sin(b.flap) * 6;
      ctx.beginPath();
      // Left wing
      ctx.moveTo(b.x, b.y + b.h * 0.5);
      ctx.quadraticCurveTo(b.x + b.w * 0.25, b.y + b.h * 0.5 - 8 - flap, b.x + b.w * 0.5, b.y + b.h * 0.5);
      // Right wing
      ctx.quadraticCurveTo(b.x + b.w * 0.75, b.y + b.h * 0.5 - 8 - flap, b.x + b.w, b.y + b.h * 0.5);
      ctx.stroke();
      // Body dot
      ctx.fillStyle = BRAND.ink;
      ctx.beginPath();
      ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.5 + 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHelicopters() {
    for (const h of state.helicopters) drawHelicopter(h);
  }

  function drawHelicopter(h) {
    // Helicopter faces left (nose toward the drone)
    ctx.save();
    const x = h.x;
    const y = h.y;

    // Main rotor blur disc (drawn first so body sits in front)
    ctx.fillStyle = BRAND.gulfDeep;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(x + 28, y + 4, 50, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Rotor mast
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(x + 27, y + 4, 2, 6);

    // Body (nose-left teardrop: rounded front, tapered back)
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 18);                       // nose tip
    ctx.quadraticCurveTo(x + 8, y + 12, x + 18, y + 10);
    ctx.lineTo(x + 48, y + 10);
    ctx.quadraticCurveTo(x + 56, y + 10, x + 56, y + 16);
    ctx.lineTo(x + 56, y + 22);
    ctx.quadraticCurveTo(x + 50, y + 26, x + 38, y + 26);
    ctx.lineTo(x + 18, y + 26);
    ctx.quadraticCurveTo(x + 10, y + 24, x + 12, y + 18);
    ctx.closePath();
    ctx.fill();

    // Cockpit window (gulf tint)
    ctx.fillStyle = BRAND.gulf;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 16);
    ctx.quadraticCurveTo(x + 12, y + 13, x + 20, y + 12);
    ctx.lineTo(x + 26, y + 12);
    ctx.lineTo(x + 26, y + 18);
    ctx.lineTo(x + 16, y + 18);
    ctx.closePath();
    ctx.fill();
    // Window highlight
    ctx.fillStyle = BRAND.paper;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + 17, y + 13, 6, 1.2);
    ctx.globalAlpha = 1;

    // Body stripe (shallow accent)
    ctx.fillStyle = BRAND.shallow;
    ctx.fillRect(x + 30, y + 18, 22, 1.6);

    // Tail boom
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(x + 54, y + 14, 28, 3.5);

    // Tail fin
    ctx.beginPath();
    ctx.moveTo(x + 78, y + 14);
    ctx.lineTo(x + 84, y + 10);
    ctx.lineTo(x + 84, y + 18);
    ctx.closePath();
    ctx.fill();

    // Tail rotor (spinning crosshair)
    ctx.save();
    ctx.translate(x + 84, y + 14);
    ctx.rotate(h.tailRotor);
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
    ctx.moveTo(0, -5); ctx.lineTo(0, 5);
    ctx.stroke();
    // Faint blur ring
    ctx.fillStyle = BRAND.gulfDeep;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Main rotor crossed blades (rotates above)
    ctx.save();
    ctx.translate(x + 28, y + 3);
    ctx.rotate(h.rotor);
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-44, 0); ctx.lineTo(44, 0);
    ctx.moveTo(0, -3); ctx.lineTo(0, 3);
    ctx.stroke();
    ctx.restore();

    // Skids
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 28); ctx.lineTo(x + 18, y + 32);
    ctx.moveTo(x + 46, y + 28); ctx.lineTo(x + 46, y + 32);
    ctx.moveTo(x + 14, y + 32); ctx.lineTo(x + 50, y + 32);
    ctx.stroke();

    // Navigation light
    ctx.fillStyle = BRAND.gulfDeep;
    ctx.beginPath();
    ctx.arc(x + 12, y + 19, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawDrone() {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(drone.tilt);

    // Subtle shadow on ground
    ctx.save();
    ctx.fillStyle = BRAND.ink;
    ctx.globalAlpha = 0.10;
    const distToGround = Math.max(0, groundY - drone.y);
    const shadowScale = clamp(1 - distToGround / (H * 1.2), 0.25, 1);
    ctx.setTransform(dpr, 0, 0, dpr, drone.x * dpr, (groundY - 2) * dpr);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Arms (4 visible, side-perspective compressed)
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-2, -2);
    ctx.moveTo(22, 0);  ctx.lineTo(2, -2);
    ctx.stroke();

    // Body (hex puck silhouette, front-quarter)
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(-9, -6);
    ctx.lineTo(9, -6);
    ctx.lineTo(12, -2);
    ctx.lineTo(9, 4);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    ctx.fill();

    // Top highlight
    ctx.fillStyle = BRAND.inkSoft;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(8, -5);
    ctx.lineTo(6, -2.5);
    ctx.lineTo(-6, -2.5);
    ctx.closePath();
    ctx.fill();

    // LED stripe
    ctx.fillStyle = BRAND.shallow;
    ctx.fillRect(-7, -0.5, 14, 1.2);

    // Gimbal sphere
    ctx.fillStyle = BRAND.inkSoft;
    ctx.beginPath();
    ctx.arc(0, 7, 4, 0, Math.PI * 2);
    ctx.fill();
    // Lens
    ctx.fillStyle = BRAND.gulf;
    ctx.beginPath();
    ctx.arc(0, 7, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BRAND.paper;
    ctx.beginPath();
    ctx.arc(0.8, 6.4, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Motor pods
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.arc(-22, 0, 3, 0, Math.PI * 2);
    ctx.arc(22, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Spinning rotor blur (ellipses) + crosshair lines that rotate
    const rotorAlpha = state.mode === 'playing' ? 0.6 : 0.25;
    ctx.fillStyle = BRAND.gulfDeep;
    ctx.globalAlpha = rotorAlpha * 0.35;
    ctx.beginPath();
    ctx.ellipse(-22, -1, 14, 2.6, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -1, 14, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Rotor crosshairs (visible at slower phase for charm)
    ctx.strokeStyle = BRAND.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9;
    drawRotorCross(-22, -1, drone.rotor);
    drawRotorCross(22, -1, -drone.rotor * 1.1);
    ctx.globalAlpha = 1;

    // Antennas
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-4, -6); ctx.lineTo(-4, -10);
    ctx.moveTo(4, -6);  ctx.lineTo(4, -10);
    ctx.stroke();
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.arc(-4, -10, 0.9, 0, Math.PI * 2);
    ctx.arc(4, -10, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawRotorCross(cx, cy, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
    ctx.moveTo(0, -2.5); ctx.lineTo(0, 2.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawHUDMarkers() {
    if (state.mode !== 'playing') return;
    // Subtle crosshair on left edge above drone — surveyor reticle
    ctx.save();
    ctx.strokeStyle = BRAND.gulf;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 0.8;
    const rx = 22;
    const ry = drone.y;
    ctx.beginPath();
    ctx.moveTo(rx - 6, ry); ctx.lineTo(rx + 6, ry);
    ctx.moveTo(rx, ry - 6); ctx.lineTo(rx, ry + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Gust indicator
    if (Math.abs(state.gust) > 30) {
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'center';
      const arrow = state.gust > 0 ? '↓' : '↑';
      ctx.fillText(`GUST ${arrow}`, W / 2, 22);
      ctx.restore();
    }
  }

  // ---------- utils ----------
  function pad(n, w) { return String(n).padStart(w, '0'); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Initial idle pose: draw a static frame
  drone.x = Math.max(80, W * 0.22);
  drone.y = H * 0.45;
  draw();
}
