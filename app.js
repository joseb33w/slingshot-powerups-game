(() => {
  'use strict';

  const STORAGE_KEY = 'slingbloom-save-v1';
  const WORLD = { w: 1200, h: 680 };
  const MAX_PULL = 170;
  const BASE_POWER = 4.6;
  const GRAVITY = 1120;
  const DRAG = 0.996;

  const POWERUPS = [
    { key: 'rocket_petal', name: 'Rocket Petal', icon: '🚀', cost: 90, a: '#ff5aa7', b: '#ffb86b', description: 'Adds extra release velocity for one round.' },
    { key: 'giant_bloom', name: 'Giant Bloom', icon: '🌼', cost: 120, a: '#ffe873', b: '#76ffd2', description: 'Makes targets larger and easier to tag.' },
    { key: 'slow_cloud', name: 'Slow Cloud', icon: '☁️', cost: 100, a: '#75d6ff', b: '#ab7cff', description: 'Slows target drift for calmer aiming.' },
    { key: 'double_seed', name: 'Double Seed', icon: '✦', cost: 150, a: '#a8ff7b', b: '#ffe873', description: 'Doubles the points when you bank this run.' }
  ];

  const $ = (id) => document.getElementById(id);
  const els = {};
  const ids = ['gameCanvas', 'canvasNote', 'pointsText', 'bestText', 'shotsText', 'runScoreText', 'shotsLeftText', 'accuracyText', 'boostText', 'boostStrip', 'walletText', 'shopGrid', 'profilePointsText', 'profileBestText', 'profileShotsText', 'historyList', 'toast', 'newRoundBtn', 'bankBtn', 'resetBtn'];

  const state = {
    save: {
      points: 0,
      best: 0,
      totalShots: 0,
      inventory: {},
      equipped: null,
      history: []
    },
    runScore: 0,
    shotsLeft: 8,
    shotsTaken: 0,
    hits: 0,
    target: null,
    sling: { x: 190, y: 535 },
    dragging: false,
    pointerId: null,
    dragPoint: null,
    lastDragPoint: null,
    projectile: null,
    particles: [],
    flowers: [],
    clouds: [],
    time: 0,
    last: performance.now(),
    animationId: null,
    messageTimer: 0
  };

  function init() {
    try {
      ids.forEach((id) => { els[id] = $(id); });
      loadSave();
      setupTabs();
      setupButtons();
      setupCanvasEvents();
      seedDecor();
      newRound(false);
      renderAll();
      state.animationId = requestAnimationFrame(loop);
      window.gameState = state;
      window.slingTest = { fireAuto, newRound, save: () => state.save };
    } catch (error) {
      console.error('Init error:', error.message, error.stack);
      toast('The game could not start. I logged details in the console.');
    }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.save = {
        points: Number(parsed.points || 0),
        best: Number(parsed.best || 0),
        totalShots: Number(parsed.totalShots || 0),
        inventory: parsed.inventory && typeof parsed.inventory === 'object' ? parsed.inventory : {},
        equipped: parsed.equipped || null,
        history: Array.isArray(parsed.history) ? parsed.history.slice(0, 8) : []
      };
    } catch (error) {
      console.warn('Save load failed:', error.message);
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.save));
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el === tab));
        document.querySelectorAll('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === view));
        if (view === 'play') resizeCanvas();
      });
    });
  }

  function setupButtons() {
    els.newRoundBtn.addEventListener('click', () => newRound(true));
    els.bankBtn.addEventListener('click', bankScore);
    els.resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state.save = { points: 0, best: 0, totalShots: 0, inventory: {}, equipped: null, history: [] };
      newRound(false);
      renderAll();
      toast('Save reset. Fresh bloom ready.');
    });
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
  }

  function setupCanvasEvents() {
    const canvas = els.gameCanvas;
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
    canvas.addEventListener('lostpointercapture', finishDragSafely);
    window.addEventListener('pointerup', finishDragSafely, { passive: true });
    window.addEventListener('blur', finishDragSafely);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('touchmove', (event) => {
      if (state.dragging) event.preventDefault();
    }, { passive: false });
  }

  function resizeCanvas() {
    const canvas = els.gameCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    canvas.height = Math.max(280, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cssToWorld(point) {
    const rect = els.gameCanvas.getBoundingClientRect();
    return {
      x: ((point.clientX - rect.left) / Math.max(1, rect.width)) * WORLD.w,
      y: ((point.clientY - rect.top) / Math.max(1, rect.height)) * WORLD.h
    };
  }

  function worldToCssScale() {
    const rect = els.gameCanvas.getBoundingClientRect();
    return { sx: rect.width / WORLD.w, sy: rect.height / WORLD.h };
  }

  function onPointerDown(event) {
    try {
      event.preventDefault();
      if (state.projectile || state.shotsLeft <= 0) return;
      const p = cssToWorld(event);
      const nearSling = distance(p, state.sling) <= 150;
      const inLaunchZone = p.x < WORLD.w * 0.42 && p.y > WORLD.h * 0.36;
      if (!nearSling && !inLaunchZone) return;
      state.dragging = true;
      state.pointerId = event.pointerId;
      state.dragPoint = clampPull(p);
      state.lastDragPoint = state.dragPoint;
      els.gameCanvas.classList.add('dragging');
      els.gameCanvas.setPointerCapture?.(event.pointerId);
      setNote('Release to launch. Pull farther for more power.');
    } catch (error) {
      console.error('Pointer down error:', error.message, error.stack);
    }
  }

  function onPointerMove(event) {
    try {
      if (!state.dragging || event.pointerId !== state.pointerId) return;
      event.preventDefault();
      const p = cssToWorld(event);
      state.dragPoint = clampPull(p);
      state.lastDragPoint = state.dragPoint;
    } catch (error) {
      console.error('Pointer move error:', error.message, error.stack);
    }
  }

  function onPointerUp(event) {
    try {
      if (!state.dragging || event.pointerId !== state.pointerId) return;
      event.preventDefault();
      const p = cssToWorld(event);
      state.lastDragPoint = clampPull(p);
      finishDragSafely();
    } catch (error) {
      console.error('Pointer up error:', error.message, error.stack);
    }
  }

  function onPointerCancel(event) {
    if (state.dragging && event.pointerId === state.pointerId) finishDragSafely();
  }

  function finishDragSafely() {
    if (!state.dragging) return;
    const releasePoint = state.lastDragPoint || state.dragPoint || state.sling;
    state.dragging = false;
    state.pointerId = null;
    state.dragPoint = null;
    els.gameCanvas.classList.remove('dragging');
    launch(releasePoint);
  }

  function clampPull(point) {
    const dx = point.x - state.sling.x;
    const dy = point.y - state.sling.y;
    const len = Math.hypot(dx, dy);
    if (len <= MAX_PULL) return { x: point.x, y: point.y };
    const scale = MAX_PULL / len;
    return { x: state.sling.x + dx * scale, y: state.sling.y + dy * scale };
  }

  function launch(point) {
    if (state.projectile || state.shotsLeft <= 0) return;
    const dx = state.sling.x - point.x;
    const dy = state.sling.y - point.y;
    const pull = Math.hypot(dx, dy);
    if (pull < 12) {
      setNote('Pull back a little farther before releasing.');
      return;
    }
    const boost = equippedPowerup();
    const powerMultiplier = boost?.key === 'rocket_petal' ? 1.28 : 1;
    const velocityScale = BASE_POWER * powerMultiplier;
    state.projectile = {
      x: state.sling.x,
      y: state.sling.y,
      vx: dx * velocityScale,
      vy: dy * velocityScale,
      r: 16,
      trail: [],
      spin: 0
    };
    state.shotsLeft -= 1;
    state.shotsTaken += 1;
    state.save.totalShots += 1;
    state.save.best = Math.max(state.save.best, state.runScore);
    if (boost) state.save.inventory[boost.key] = Math.max(0, Number(state.save.inventory[boost.key] || 0) - 1);
    if (boost && state.save.inventory[boost.key] === 0) state.save.equipped = null;
    burst(state.sling.x, state.sling.y, '#ffe873', 15, 320);
    setNote('Shot released instantly. Watch the bloom fly!');
    persist();
    renderAll();
  }

  function fireAuto() {
    if (state.projectile) return false;
    const p = { x: state.sling.x - 125, y: state.sling.y + 82 };
    state.lastDragPoint = p;
    launch(p);
    return true;
  }

  function newRound(showToast = true) {
    state.runScore = 0;
    state.shotsLeft = 8;
    state.shotsTaken = 0;
    state.hits = 0;
    state.projectile = null;
    state.dragging = false;
    state.pointerId = null;
    state.dragPoint = null;
    state.particles.length = 0;
    state.target = makeTarget();
    seedDecor();
    setNote('Grab the glowing pouch, pull back, then release.');
    renderAll();
    if (showToast) toast('New round ready. Pull the sling!');
  }

  function makeTarget() {
    const boost = equippedPowerup();
    const r = boost?.key === 'giant_bloom' ? 64 : 48;
    const speed = boost?.key === 'slow_cloud' ? 62 : 108;
    return {
      x: 850,
      y: 210,
      r,
      vx: speed,
      vy: speed * 0.63,
      phase: Math.random() * Math.PI * 2
    };
  }

  function equippedPowerup() {
    return POWERUPS.find((item) => item.key === state.save.equipped && Number(state.save.inventory[item.key] || 0) > 0) || null;
  }

  function bankScore() {
    if (state.shotsTaken <= 0) {
      toast('Take a shot before banking.');
      return;
    }
    const double = state.save.equipped === 'double_seed' && Number(state.save.inventory.double_seed || 0) > 0;
    const banked = Math.round(state.runScore * (double ? 2 : 1));
    if (double) {
      state.save.inventory.double_seed = Math.max(0, Number(state.save.inventory.double_seed || 0) - 1);
      if (state.save.inventory.double_seed === 0) state.save.equipped = null;
    }
    state.save.points += banked;
    state.save.best = Math.max(state.save.best, state.runScore);
    state.save.history.unshift({ score: state.runScore, points: banked, accuracy: accuracy(), date: new Date().toLocaleDateString() });
    state.save.history = state.save.history.slice(0, 8);
    persist();
    toast(`Banked ${banked} points.`);
    newRound(false);
    renderAll();
  }

  function buyPowerup(key) {
    const item = POWERUPS.find((p) => p.key === key);
    if (!item) return;
    if (state.save.points < item.cost) {
      toast('Not enough points yet. Bank a bigger run.');
      return;
    }
    state.save.points -= item.cost;
    state.save.inventory[key] = Number(state.save.inventory[key] || 0) + 1;
    if (!state.save.equipped) state.save.equipped = key;
    persist();
    renderAll();
    toast(`${item.name} added to your pouch.`);
  }

  function equipPowerup(key) {
    if (Number(state.save.inventory[key] || 0) <= 0) return;
    state.save.equipped = key;
    persist();
    renderAll();
    const item = POWERUPS.find((p) => p.key === key);
    toast(`${item?.name || 'Boost'} equipped.`);
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - state.last) / 1000 || 0.016);
    state.last = now;
    state.time += dt;
    try {
      update(dt);
      draw();
    } catch (error) {
      console.error('Loop error:', error.message, error.stack);
    }
    state.animationId = requestAnimationFrame(loop);
  }

  function update(dt) {
    updateTarget(dt);
    updateProjectile(dt);
    updateParticles(dt);
    updateDecor(dt);
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) setNote('Grab the glowing pouch, pull back, then release.');
    }
  }

  function updateTarget(dt) {
    const t = state.target;
    t.phase += dt * 2.1;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    if (t.x < WORLD.w * 0.56 || t.x > WORLD.w - 110) t.vx *= -1;
    if (t.y < 92 || t.y > WORLD.h - 165) t.vy *= -1;
  }

  function updateProjectile(dt) {
    const p = state.projectile;
    if (!p) return;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 20) p.trail.shift();
    p.vy += GRAVITY * dt;
    p.vx *= Math.pow(DRAG, dt * 60);
    p.vy *= Math.pow(DRAG, dt * 60);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += dt * 12;

    const d = distance(p, state.target);
    if (d <= p.r + state.target.r) {
      const center = Math.max(0, 1 - d / state.target.r);
      const gained = 40 + Math.round(center * 120);
      state.runScore += gained;
      state.hits += 1;
      burst(state.target.x, state.target.y, '#76ffd2', 34, 520);
      state.target = makeTarget();
      state.target.x = 720 + Math.random() * 340;
      state.target.y = 100 + Math.random() * 360;
      state.projectile = null;
      setNote(`Bloom hit! +${gained}`);
      toast(`Bloom hit! +${gained}`);
      renderAll();
      return;
    }

    if (p.x < -90 || p.x > WORLD.w + 120 || p.y > WORLD.h + 120 || p.y < -220) {
      state.projectile = null;
      setNote(state.shotsLeft > 0 ? 'Missed. Pull again.' : 'Round over. Bank your score or start over.');
      renderAll();
    }
  }

  function seedDecor() {
    state.flowers = Array.from({ length: 22 }, (_, i) => ({
      x: 40 + i * 55 + Math.random() * 20,
      y: WORLD.h - 38 - Math.random() * 22,
      s: 0.55 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      color: ['#ff5aa7', '#ffe873', '#76ffd2', '#75d6ff'][i % 4]
    }));
    state.clouds = Array.from({ length: 8 }, (_, i) => ({
      x: Math.random() * WORLD.w,
      y: 65 + Math.random() * 180,
      s: 0.7 + Math.random() * 1.5,
      v: 8 + Math.random() * 18,
      alpha: 0.08 + Math.random() * 0.12
    }));
  }

  function updateDecor(dt) {
    state.clouds.forEach((c) => {
      c.x += c.v * dt;
      if (c.x > WORLD.w + 90) c.x = -140;
    });
    state.flowers.forEach((f) => { f.phase += dt * (1.4 + f.s); });
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        state.particles.splice(i, 1);
        continue;
      }
      p.vy += 360 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 130,
        size: 4 + Math.random() * 8,
        color,
        life: 0.45 + Math.random() * 0.45,
        age: 0,
        rot: Math.random() * 6,
        spin: -5 + Math.random() * 10
      });
    }
  }

  function draw() {
    const canvas = els.gameCanvas;
    const ctx = canvas.getContext('2d');
    const { sx, sy } = worldToCssScale();
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.scale(sx, sy);
    drawBackdrop(ctx);
    drawClouds(ctx);
    drawTarget(ctx);
    drawTrajectory(ctx);
    drawSling(ctx);
    drawProjectile(ctx);
    drawParticles(ctx);
    drawForeground(ctx);
    ctx.restore();
  }

  function drawBackdrop(ctx) {
    const g = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    g.addColorStop(0, '#2b1351');
    g.addColorStop(0.45, '#523083');
    g.addColorStop(1, '#ff8dbd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    const sun = ctx.createRadialGradient(950, 140, 20, 950, 140, 170);
    sun.addColorStop(0, 'rgba(255, 232, 115, .96)');
    sun.addColorStop(0.36, 'rgba(255, 184, 107, .38)');
    sun.addColorStop(1, 'rgba(255, 184, 107, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(760, -50, 380, 360);

    for (let i = 0; i < 34; i += 1) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = i % 2 ? '#fffaf7' : '#76ffd2';
      ctx.beginPath();
      ctx.arc((i * 97 + 50) % WORLD.w, (i * 57 + 38) % 320, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawHill(ctx, WORLD.h - 92, '#25143f', 0.011, 26);
    drawHill(ctx, WORLD.h - 55, '#1b0d2f', 0.018, 20);
    ctx.fillStyle = '#1a0b2c';
    ctx.fillRect(0, WORLD.h - 48, WORLD.w, 48);
  }

  function drawHill(ctx, baseY, color, freq, amp) {
    ctx.beginPath();
    ctx.moveTo(0, WORLD.h);
    for (let x = 0; x <= WORLD.w; x += 24) {
      const y = baseY + Math.sin(x * freq + state.time) * amp + Math.cos(x * freq * 0.6) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WORLD.w, WORLD.h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawClouds(ctx) {
    state.clouds.forEach((c) => {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#fffaf7';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 60 * c.s, 22 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 48 * c.s, c.y + 7 * c.s, 42 * c.s, 18 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - 42 * c.s, c.y + 5 * c.s, 40 * c.s, 17 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawTarget(ctx) {
    const t = state.target;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.sin(t.phase) * 0.12);
    ctx.shadowColor = '#76ffd2';
    ctx.shadowBlur = 30;
    const rings = [1, 0.72, 0.46, 0.22];
    const colors = ['#ff5aa7', '#ffe873', '#76ffd2', '#fffaf7'];
    rings.forEach((scale, index) => {
      ctx.fillStyle = colors[index];
      ctx.beginPath();
      ctx.arc(0, 0, t.r * scale, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, t.r + 8 + Math.sin(state.time * 5) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSling(ctx) {
    const s = state.sling;
    const pull = state.dragging && state.dragPoint ? state.dragPoint : s;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.32)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#6d3f31';
    ctx.beginPath();
    ctx.moveTo(s.x - 58, s.y + 104);
    ctx.lineTo(s.x - 26, s.y + 18);
    ctx.moveTo(s.x + 58, s.y + 104);
    ctx.lineTo(s.x + 26, s.y + 18);
    ctx.stroke();

    ctx.lineWidth = 14;
    ctx.strokeStyle = '#b96b43';
    ctx.beginPath();
    ctx.moveTo(s.x - 58, s.y + 104);
    ctx.lineTo(s.x - 26, s.y + 18);
    ctx.moveTo(s.x + 58, s.y + 104);
    ctx.lineTo(s.x + 26, s.y + 18);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffe873';
    ctx.beginPath();
    ctx.moveTo(s.x - 25, s.y + 18);
    ctx.lineTo(pull.x, pull.y);
    ctx.lineTo(s.x + 25, s.y + 18);
    ctx.stroke();

    ctx.fillStyle = '#ff5aa7';
    ctx.shadowColor = '#ff5aa7';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(pull.x, pull.y, state.dragging ? 20 : 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffaf7';
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(pull.x - 5, pull.y - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTrajectory(ctx) {
    if (!state.dragging || !state.dragPoint) return;
    const dx = state.sling.x - state.dragPoint.x;
    const dy = state.sling.y - state.dragPoint.y;
    const boost = equippedPowerup();
    const mult = boost?.key === 'rocket_petal' ? 1.28 : 1;
    let x = state.sling.x;
    let y = state.sling.y;
    let vx = dx * BASE_POWER * mult;
    let vy = dy * BASE_POWER * mult;
    ctx.save();
    for (let i = 0; i < 20; i += 1) {
      vx *= DRAG;
      vy = vy * DRAG + GRAVITY * 0.055;
      x += vx * 0.055;
      y += vy * 0.055;
      ctx.globalAlpha = Math.max(0, 0.72 - i * 0.033);
      ctx.fillStyle = i % 2 ? '#76ffd2' : '#ffe873';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, 8 - i * 0.26), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectile(ctx) {
    const p = state.projectile;
    if (!p) return;
    ctx.save();
    p.trail.forEach((dot, i) => {
      ctx.globalAlpha = (i + 1) / p.trail.length * 0.55;
      ctx.fillStyle = '#ff5aa7';
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 4 + i * 0.42, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.shadowColor = '#ffe873';
    ctx.shadowBlur = 24;
    const grad = ctx.createRadialGradient(-6, -8, 3, 0, 0, p.r + 8);
    grad.addColorStop(0, '#fffaf7');
    grad.addColorStop(0.45, '#ffe873');
    grad.addColorStop(1, '#ff5aa7');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = i / 10 * Math.PI * 2;
      const rad = i % 2 ? p.r * 0.64 : p.r;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(ctx) {
    state.particles.forEach((p) => {
      const alpha = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
  }

  function drawForeground(ctx) {
    state.flowers.forEach((f) => {
      const sway = Math.sin(f.phase) * 5;
      ctx.save();
      ctx.translate(f.x + sway, f.y);
      ctx.scale(f.s, f.s);
      ctx.strokeStyle = '#76ffd2';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.quadraticCurveTo(-6, 0, 0, -16);
      ctx.stroke();
      ctx.fillStyle = f.color;
      for (let i = 0; i < 6; i += 1) {
        const a = i / 6 * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 10, -18 + Math.sin(a) * 10, 8, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe873';
      ctx.beginPath();
      ctx.arc(0, -18, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function renderAll() {
    const save = state.save;
    const boost = equippedPowerup();
    els.pointsText.textContent = fmt(save.points);
    els.bestText.textContent = fmt(save.best);
    els.shotsText.textContent = fmt(save.totalShots);
    els.runScoreText.textContent = fmt(state.runScore);
    els.shotsLeftText.textContent = String(state.shotsLeft);
    els.accuracyText.textContent = `${accuracy()}%`;
    els.boostText.textContent = boost ? boost.name : 'None';
    els.walletText.textContent = fmt(save.points);
    els.profilePointsText.textContent = fmt(save.points);
    els.profileBestText.textContent = fmt(save.best);
    els.profileShotsText.textContent = fmt(save.totalShots);
    renderBoostStrip();
    renderShop();
    renderHistory();
  }

  function renderBoostStrip() {
    const owned = POWERUPS.filter((item) => Number(state.save.inventory[item.key] || 0) > 0);
    if (!owned.length) {
      els.boostStrip.innerHTML = '<div class="boost-pill"><span>No boosts yet</span><button type="button" data-open-shop>Shop</button></div>';
    } else {
      els.boostStrip.innerHTML = owned.map((item) => `<div class="boost-pill"><span>${item.icon} ${escapeHtml(item.name)} × ${Number(state.save.inventory[item.key] || 0)}</span><button type="button" data-equip="${item.key}">${state.save.equipped === item.key ? 'Equipped' : 'Equip'}</button></div>`).join('');
    }
    els.boostStrip.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', () => equipPowerup(button.dataset.equip)));
    els.boostStrip.querySelectorAll('[data-open-shop]').forEach((button) => button.addEventListener('click', () => document.querySelector('[data-view="shop"]').click()));
  }

  function renderShop() {
    els.shopGrid.innerHTML = POWERUPS.map((item) => {
      const owned = Number(state.save.inventory[item.key] || 0);
      const canBuy = state.save.points >= item.cost;
      const equipped = state.save.equipped === item.key;
      return `<article class="shop-card" style="--card-a:${item.a};--card-b:${item.b}">
        <div class="shop-icon">${item.icon}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="shop-meta"><span>${item.cost} pts</span><span>Owned ${owned}</span></div>
        <div class="shop-actions">
          <button type="button" data-buy="${item.key}" ${canBuy ? '' : 'disabled'}>Buy</button>
          <button type="button" data-equip="${item.key}" ${owned > 0 ? '' : 'disabled'}>${equipped ? 'Equipped' : 'Equip'}</button>
        </div>
      </article>`;
    }).join('');
    els.shopGrid.querySelectorAll('[data-buy]').forEach((button) => button.addEventListener('click', () => buyPowerup(button.dataset.buy)));
    els.shopGrid.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', () => equipPowerup(button.dataset.equip)));
  }

  function renderHistory() {
    if (!state.save.history.length) {
      els.historyList.innerHTML = '<div class="history-row"><span>No banked runs yet.</span><strong>Play now</strong></div>';
      return;
    }
    els.historyList.innerHTML = state.save.history.map((run) => `<div class="history-row"><span>${escapeHtml(run.date)} · Score ${fmt(run.score)} · ${run.accuracy}% accuracy</span><strong>+${fmt(run.points)}</strong></div>`).join('');
  }

  function setNote(message) {
    els.canvasNote.textContent = message;
    state.messageTimer = 2.8;
  }

  let toastTimer = 0;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function accuracy() {
    return state.shotsTaken ? Math.round((state.hits / state.shotsTaken) * 100) : 0;
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function fmt(n) { return new Intl.NumberFormat('en-US').format(Number(n || 0)); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
