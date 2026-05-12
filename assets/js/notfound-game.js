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

function boot() {
  try {
    const root = document.querySelector('[data-notfound-game]');
    if (root) initGame(root);
  } catch (err) {
    console.error('[notfound-game] init failed:', err);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

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
    const cssW = rect.width || canvas.clientWidth || canvas.offsetWidth || 320;
    const cssH = rect.height || canvas.clientHeight || canvas.offsetHeight || 220;
    W = Math.max(320, Math.floor(cssW));
    H = Math.max(220, Math.floor(cssH));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H - Math.max(36, H * 0.14);
  }
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }
  // iOS Safari sometimes finalises layout after first paint; re-measure shortly
  setTimeout(resize, 200);
  setTimeout(resize, 800);

  // ---------- game state ----------
  const state = {
    mode: 'idle', // idle | playing | over
    t: 0,
    speed: 180,         // current px/s, smoothed toward speedTarget
    speedTarget: 180,   // natural ramp target
    speedMax: 460,
    accel: 6.0,         // speed gain per second
    returnRate: 110,    // px/s² when catching back up after respawn
    spawnTimer: 0,
    spawnInterval: 1.35,
    minSpawn: 0.55,
    pondTimer: 6,
    updraftTimer: 22,
    distance: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0) | 0,
    obstacles: [],
    birds: [],
    helicopters: [],
    ponds: [],
    extras: [],
    updrafts: [],
    clouds: [],
    sawgrass: [],
    contours: [],
    gust: 0,
    gustTimer: 5,
    snapStreak: 0,
    snapFlash: 0,
    lives: 0,
    livesMax: 3,
    invulnTimer: 0,
    boostTimer: 0,
    shake: 0,
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
    state.speedTarget = 180;
    state.spawnTimer = 0.6;
    state.spawnInterval = 1.35;
    state.pondTimer = 6;
    state.updraftTimer = 22;
    state.distance = 0;
    state.score = 0;
    state.obstacles.length = 0;
    state.birds.length = 0;
    state.helicopters.length = 0;
    state.ponds.length = 0;
    state.extras.length = 0;
    state.updrafts.length = 0;
    state.gust = 0;
    state.gustTimer = 5;
    state.snapStreak = 0;
    state.snapFlash = 0;
    state.lives = 0;
    state.invulnTimer = 0;
    state.boostTimer = 0;
    state.shake = 0;
    initBackground();
  }

  function respawnAfterCrash() {
    drone.x = Math.max(80, W * 0.22);
    drone.y = H * 0.40;
    drone.vy = 0;
    drone.tilt = 0;
    // Clear nearby threats so respawn isn't instant death
    state.obstacles = state.obstacles.filter(o => o.x > W * 0.6);
    state.birds = state.birds.filter(b => b.x > W * 0.6);
    state.helicopters = state.helicopters.filter(h => h.x > W * 0.6);
    // Speed dip with quick ramp back
    state.speed = Math.max(160, state.speedTarget * 0.55);
    state.invulnTimer = 1.6;
    state.boostTimer = 0;
    state.shake = 8;
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
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (e.repeat) return;
      onPress();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (state.mode === 'playing') tryPhotoSnap();
      else if (state.mode === 'idle' || state.mode === 'over') startGame();
    } else if (e.code === 'Escape' && state.mode === 'playing') {
      gameOver(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      setHold(false);
    }
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

  let loopErrors = 0;
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.045, (now - last) / 1000);
    last = now;
    if (!running) return;
    try {
      if (state.mode === 'playing') update(dt);
      draw(dt);
    } catch (err) {
      loopErrors++;
      if (loopErrors < 3) console.error('[notfound-game] loop error:', err);
      if (loopErrors > 10) { cancelAnimationFrame(rafId); console.error('[notfound-game] too many errors — stopping loop'); }
    }
  }
  rafId = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  // ---------- update ----------
  function update(dt) {
    state.t += dt;

    // Natural ramp on target, current speed catches up
    state.speedTarget = Math.min(state.speedMax, state.speedTarget + state.accel * dt);
    if (state.speed < state.speedTarget) {
      state.speed = Math.min(state.speedTarget, state.speed + state.returnRate * dt);
    } else {
      state.speed = state.speedTarget;
    }
    state.spawnInterval = Math.max(state.minSpawn, 1.35 - state.t * 0.018);

    // Boost / invuln timers
    const boostWasActive = state.boostTimer > 0;
    if (state.boostTimer > 0) state.boostTimer = Math.max(0, state.boostTimer - dt);
    if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    if (state.snapFlash > 0) state.snapFlash = Math.max(0, state.snapFlash - dt);
    state.shake *= Math.max(0, 1 - dt * 6);

    // When boost just ended, extend invulnerability for 2 seconds
    if (boostWasActive && state.boostTimer === 0) {
      state.invulnTimer = Math.max(state.invulnTimer, 2.0);
    }

    const boostMult = state.boostTimer > 0 ? 3 : 1;
    const moveSpeed = state.speed * boostMult;

    // Drone physics — during boost, lock altitude (no gravity, thrust, or wind)
    if (state.boostTimer > 0) {
      drone.vy = 0;
      drone.tilt = 0;
    } else {
      const wind = state.gust;
      drone.vy += drone.gravity * dt + wind * dt;
      if (holding) drone.vy += drone.thrust * dt;
      drone.vy = clamp(drone.vy, drone.maxRise, drone.maxFall);
      drone.tilt = clamp(drone.vy / 700, -0.35, 0.35);
    }
    drone.y += drone.vy * dt;
    drone.rotor += dt * (40 + boostMult * 20);

    // Floor / ceiling
    if (drone.y + drone.h * 0.5 >= groundY - 4) {
      drone.y = groundY - 4 - drone.h * 0.5;
      handleCrash();
      if (state.mode !== 'playing') return;
    }
    if (drone.y < 10) { drone.y = 10; drone.vy = Math.max(drone.vy, 60); }

    // Distance / score (boost contributes triple)
    state.distance += moveSpeed * dt;
    state.score = Math.floor(state.distance / 5);

    // Gusts (after a warmup; pause during boost)
    state.gust *= Math.max(0, 1 - dt * 2.2);
    if (state.t > 14 && state.boostTimer === 0) {
      state.gustTimer -= dt;
      if (state.gustTimer <= 0) {
        state.gustTimer = 4 + Math.random() * 5;
        state.gust = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 160);
      }
    }

    // Obstacle spawning
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = state.spawnInterval * (0.85 + Math.random() * 0.35);
    }

    // Pond spawning
    state.pondTimer -= dt;
    if (state.pondTimer <= 0) {
      spawnPond();
      state.pondTimer = 9 + Math.random() * 7;
    }

    // Updraft spawning (rare; only after the first 12s and never during boost)
    state.updraftTimer -= dt;
    if (state.updraftTimer <= 0) {
      if (state.t > 12 && state.boostTimer === 0) spawnUpdraft();
      state.updraftTimer = 18 + Math.random() * 16;
    }

    // Move + cull obstacles
    for (const o of state.obstacles) o.x -= moveSpeed * dt;
    state.obstacles = state.obstacles.filter(o => o.x + o.w > -40);

    for (const b of state.birds) {
      b.x -= (moveSpeed + b.relSpeed) * dt;
      b.flap += dt * 8;
      b.y += Math.sin(state.t * 1.4 + b.phase) * 14 * dt;
    }
    state.birds = state.birds.filter(b => b.x + b.w > -40);

    for (const h of state.helicopters) {
      h.x -= (moveSpeed + h.relSpeed) * dt;
      h.rotor += dt * 38;
      h.tailRotor += dt * 80;
      h.bob += dt * 1.6;
      h.y = h.yBase + Math.sin(h.bob) * 10;
    }
    state.helicopters = state.helicopters.filter(h => h.x + h.w > -60);

    // Ponds: move + missed-streak tracking
    for (const p of state.ponds) p.x -= moveSpeed * dt;
    const passed = state.ponds.filter(p => p.x + p.w <= drone.x - drone.w * 0.5);
    for (const p of passed) {
      if (!p.snapped) state.snapStreak = 0;
      p.done = true;
    }
    state.ponds = state.ponds.filter(p => p.x + p.w > -40 && !p.done);

    // Extras (life balloons)
    for (const e of state.extras) {
      e.x -= (moveSpeed + e.relSpeed) * dt;
      e.bob += dt * 1.4;
      e.y = e.yBase + Math.sin(e.bob) * 12;
      e.rot += dt * 0.6;
    }
    state.extras = state.extras.filter(e => e.x + e.r > -40);

    // Updrafts
    for (const u of state.updrafts) {
      u.x -= moveSpeed * dt;
      u.phase += dt;
    }
    state.updrafts = state.updrafts.filter(u => u.x + u.w > -20);

    // Pickups (extras, updrafts) — always available even during invuln
    pickups();

    // Collisions (skip during boost or invuln)
    if (state.boostTimer === 0 && state.invulnTimer === 0 && collides()) {
      handleCrash();
    }

    // HUD
    altEl.textContent = pad(Math.max(0, Math.round(groundY - drone.y)), 4);
    scoreEl.textContent = pad(state.score, 4);
  }

  function handleCrash() {
    if (state.mode !== 'playing') return;
    if (state.lives > 0) {
      state.lives--;
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      respawnAfterCrash();
      return;
    }
    gameOver(false);
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

  function spawnPond() {
    const w = 130 + Math.random() * 50;
    const h = 22;
    state.ponds.push({
      x: W + 80,
      y: groundY - h * 0.4,
      w, h,
      snapped: false,
      done: false,
      ripple: Math.random() * Math.PI * 2,
    });
  }

  function spawnExtraLife() {
    const r = 26;
    const yMin = 70;
    const yMax = groundY - 120;
    const yBase = yMin + Math.random() * (yMax - yMin);
    state.extras.push({
      x: W + 60,
      y: yBase,
      yBase,
      r,
      bob: Math.random() * Math.PI * 2,
      rot: 0,
      relSpeed: -30,  // drifts a touch slower than world
    });
  }

  function spawnUpdraft() {
    const w = 46;
    const bubbleR = 14;
    const yMin = 70;
    const yMax = groundY - 90;
    state.updrafts.push({
      x: W + 40,
      y: 0,
      w,
      h: groundY - 10,
      phase: Math.random() * Math.PI * 2,
      consumed: false,
      bubbleY: yMin + Math.random() * (yMax - yMin),
      bubbleR,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function tryPhotoSnap() {
    // Snap any pond currently aligned beneath the drone
    let snapped = false;
    for (const p of state.ponds) {
      if (p.snapped) continue;
      const droneCenterX = drone.x;
      if (droneCenterX > p.x + 6 && droneCenterX < p.x + p.w - 6) {
        p.snapped = true;
        snapped = true;
        state.snapStreak++;
        state.snapFlash = 0.35;
        if (state.snapStreak >= 3) {
          spawnExtraLife();
          state.snapStreak = 0;
        }
        break;
      }
    }
    return snapped;
  }

  function pickups() {
    const dr = droneRect();
    // Extra-life balloons
    for (const e of state.extras) {
      const r = { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 };
      if (rectsHit(dr, r)) {
        if (state.lives < state.livesMax) state.lives++;
        e.x = -9999;  // mark for cleanup
      }
    }
    // Updrafts — only the small bubble at u.bubbleY counts as the pickup
    for (const u of state.updrafts) {
      if (u.consumed) continue;
      const bx = u.x + u.w * 0.5;
      const by = u.bubbleY;
      const dx = drone.x - bx;
      const dy = drone.y - by;
      const reach = u.bubbleR + 14;
      if (dx * dx + dy * dy <= reach * reach) {
        u.consumed = true;
        state.boostTimer = 5;
        state.shake = 6;
        u.x = -9999;
      }
    }
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
    // Optional camera shake (during crash flash / boost entry)
    const shakeX = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

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
    drawPonds();
    drawObstacles();
    drawBirds();
    drawHelicopters();
    drawUpdrafts();
    drawExtras();
    if (state.boostTimer > 0) drawBoostTrail();
    drawDrone();
    drawHUDMarkers();
    drawCanvasOverlays();

    // Snap flash (shallow blue full-canvas)
    if (state.snapFlash > 0) {
      ctx.fillStyle = BRAND.shallow;
      ctx.globalAlpha = state.snapFlash * 0.45;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
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

  function drawPonds() {
    for (const p of state.ponds) {
      ctx.save();
      const cx = p.x + p.w * 0.5;
      const cy = p.y + p.h * 0.5;

      // Concentric rings (littoral zones)
      ctx.strokeStyle = BRAND.sandDeep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.w * 0.5, p.h * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Water body
      ctx.fillStyle = BRAND.shallow;
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.w * 0.46, p.h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep center
      ctx.fillStyle = BRAND.gulf;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.w * 0.30, p.h * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Ripple animation (a faint expanding ring)
      const rt = (state.t + p.ripple) % 2;
      ctx.strokeStyle = BRAND.paper;
      ctx.globalAlpha = Math.max(0, 1 - rt / 2) * 0.4;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.w * 0.18 + rt * p.w * 0.18, (p.h * 0.18 + rt * p.h * 0.18) * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Snapped state: photo-frame brackets and check
      if (p.snapped) {
        ctx.strokeStyle = BRAND.ink;
        ctx.lineWidth = 1.2;
        const bx = p.x;
        const by = p.y - 14;
        const bw = p.w;
        const bh = p.h + 28;
        const t = 6;
        ctx.beginPath();
        ctx.moveTo(bx, by + t); ctx.lineTo(bx, by); ctx.lineTo(bx + t, by);
        ctx.moveTo(bx + bw - t, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + t);
        ctx.moveTo(bx + bw, by + bh - t); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - t, by + bh);
        ctx.moveTo(bx + t, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - t);
        ctx.stroke();
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = BRAND.gulfDeep;
        ctx.textAlign = 'center';
        ctx.fillText('CAPTURED', cx, by - 4);
      } else {
        // "POND" pin label above
        ctx.font = '500 8px "JetBrains Mono", monospace';
        ctx.fillStyle = BRAND.muted;
        ctx.textAlign = 'center';
        ctx.fillText('POND', cx, p.y - 6);
      }

      ctx.restore();
    }
  }

  function drawUpdrafts() {
    for (const u of state.updrafts) {
      ctx.save();
      // 5 rising wisps (background atmospheric effect, slightly subtler now)
      ctx.strokeStyle = BRAND.shallow;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const baseX = u.x + 6 + i * (u.w - 12) / 4;
        const off = ((state.t * 80 + i * 35) % 60) - 60;
        ctx.globalAlpha = 0.32 + Math.sin(state.t * 4 + i) * 0.10;
        ctx.beginPath();
        for (let yy = groundY - 6; yy > 6; yy -= 12) {
          const x = baseX + Math.sin((yy + off) * 0.06 + i) * 6;
          if (yy === groundY - 6) ctx.moveTo(x, yy + off);
          else ctx.lineTo(x, yy + off);
        }
        ctx.stroke();
      }
      // Small rising particles, denser near the bubble
      ctx.fillStyle = BRAND.gulf;
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < 10; i++) {
        const px = u.x + ((u.w * (i / 10) + state.t * 8 * i) % u.w);
        const py = groundY - ((state.t * 60 + i * 40) % (groundY - 20));
        ctx.beginPath();
        ctx.arc(px, py, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Bubble — the actual pickup target
      const bx = u.x + u.w * 0.5;
      const by = u.bubbleY;
      const pulse = Math.sin(state.t * 4 + u.pulse) * 0.18 + 1;
      const r = u.bubbleR * pulse;

      // Soft halo
      ctx.fillStyle = BRAND.shallow;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(bx, by, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Outer ring (gulf)
      ctx.strokeStyle = BRAND.gulfDeep;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.stroke();

      // Inner fill (shallow)
      ctx.fillStyle = BRAND.shallow;
      ctx.beginPath();
      ctx.arc(bx, by, r - 2, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = BRAND.paper;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(bx - r * 0.32, by - r * 0.32, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Tiny up-arrow inside
      ctx.strokeStyle = BRAND.gulfDeep;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by + r * 0.42);
      ctx.lineTo(bx, by - r * 0.42);
      ctx.moveTo(bx - r * 0.32, by - r * 0.10);
      ctx.lineTo(bx, by - r * 0.42);
      ctx.lineTo(bx + r * 0.32, by - r * 0.10);
      ctx.stroke();

      // Mono label at top of column
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.textAlign = 'center';
      ctx.fillText('UPDRAFT', u.x + u.w * 0.5, 14);
      ctx.restore();
    }
  }

  function drawExtras() {
    for (const e of state.extras) {
      ctx.save();
      const cx = e.x;
      const cy = e.y;
      // Bubble (dashed shallow ring)
      ctx.strokeStyle = BRAND.shallow;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, e.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Inner faint fill
      ctx.fillStyle = BRAND.paper;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, e.r - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Highlight crescent
      ctx.strokeStyle = BRAND.shallow;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx - e.r * 0.25, cy - e.r * 0.25, e.r * 0.55, Math.PI * 1.0, Math.PI * 1.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Mini drone inside (re-uses player draw at small scale)
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(e.rot) * 0.18);
      const s = 0.55;
      ctx.scale(s, s);
      drawMiniDrone();
      ctx.restore();
      // Label
      ctx.save();
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.textAlign = 'center';
      ctx.fillText('+1 LIFE', cx, cy + e.r + 12);
      ctx.restore();
    }
  }

  function drawMiniDrone() {
    // Stripped-down drone for the bubble
    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-2, -2);
    ctx.moveTo(22, 0);  ctx.lineTo(2, -2);
    ctx.stroke();
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.lineTo(-9, -6); ctx.lineTo(9, -6); ctx.lineTo(12, -2); ctx.lineTo(9, 4); ctx.lineTo(-9, 4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = BRAND.shallow;
    ctx.fillRect(-7, -0.5, 14, 1.2);
    ctx.fillStyle = BRAND.gulf;
    ctx.beginPath(); ctx.arc(0, 7, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BRAND.ink;
    ctx.beginPath(); ctx.arc(-22, 0, 3, 0, Math.PI * 2); ctx.arc(22, 0, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawBoostTrail() {
    // Streaks behind the drone
    ctx.save();
    ctx.strokeStyle = BRAND.shallow;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const len = 30 + Math.random() * 90;
      const yOff = (Math.random() - 0.5) * 30;
      const startX = drone.x - 10 - Math.random() * 40;
      const alpha = 0.15 + Math.random() * 0.5;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(startX, drone.y + yOff);
      ctx.lineTo(startX - len, drone.y + yOff);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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

  function drawCanvasOverlays() {
    if (state.mode !== 'playing') return;

    // Lives indicator (top-left): tiny drone glyphs
    if (state.lives > 0) {
      ctx.save();
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.textAlign = 'left';
      ctx.fillText('LIVES', 14, 18);
      for (let i = 0; i < state.lives; i++) {
        const lx = 50 + i * 16;
        const ly = 14;
        ctx.fillStyle = BRAND.ink;
        ctx.beginPath();
        ctx.moveTo(lx - 5, ly); ctx.lineTo(lx - 4, ly - 2); ctx.lineTo(lx + 4, ly - 2); ctx.lineTo(lx + 5, ly); ctx.lineTo(lx + 4, ly + 2); ctx.lineTo(lx - 4, ly + 2); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = BRAND.shallow;
        ctx.fillRect(lx - 3, ly - 0.4, 6, 0.9);
      }
      ctx.restore();
    }

    // Photo streak dots (bottom-left of HUD area, top center-left)
    if (state.snapStreak > 0) {
      ctx.save();
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.textAlign = 'left';
      ctx.fillText('PHOTOS', 14, 36);
      for (let i = 0; i < 3; i++) {
        const dx = 60 + i * 11;
        const dy = 33;
        ctx.beginPath();
        ctx.arc(dx, dy, 3, 0, Math.PI * 2);
        if (i < state.snapStreak) {
          ctx.fillStyle = BRAND.gulf;
          ctx.fill();
        } else {
          ctx.strokeStyle = BRAND.muted;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Boost timer banner across the top
    if (state.boostTimer > 0) {
      ctx.save();
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillStyle = BRAND.gulfDeep;
      ctx.textAlign = 'center';
      ctx.fillText(`BOOST ${state.boostTimer.toFixed(1)}s`, W / 2, 18);
      // thin progress bar
      const barW = 120;
      const barX = W / 2 - barW / 2;
      const barY = 24;
      ctx.fillStyle = BRAND.rule;
      ctx.fillRect(barX, barY, barW, 2);
      ctx.fillStyle = BRAND.shallow;
      ctx.fillRect(barX, barY, barW * (state.boostTimer / 5), 2);
      ctx.restore();
    }

    // Invuln shimmer around drone after respawn
    if (state.invulnTimer > 0) {
      ctx.save();
      const a = Math.sin(state.t * 30) * 0.5 + 0.5;
      ctx.strokeStyle = BRAND.shallow;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.45 + a * 0.35;
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, 22, 0, Math.PI * 2);
      ctx.stroke();
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
