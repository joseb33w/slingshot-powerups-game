import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xhhmxabftbyxrirvvihn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NZHoIxqqpSvVBP8MrLHCYA_gmg1AbN-';
const PROFILE_TABLE = 'uNMexs7BYTXQ2_slingshot_game_player_profiles';
const RUNS_TABLE = 'uNMexs7BYTXQ2_slingshot_game_game_runs';
const PURCHASES_TABLE = 'uNMexs7BYTXQ2_slingshot_game_store_purchases';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const POWERUPS = [
  { key: 'power_band', name: 'Power Band', icon: '💥', cost: 75, color: '#ff4d8d', description: 'Adds 35% extra launch velocity for harder shots.' },
  { key: 'magnet_orb', name: 'Magnet Orb', icon: '🧲', cost: 110, color: '#5ff1d2', description: 'Makes the target easier to hit by expanding scoring rings.' },
  { key: 'double_spark', name: 'Double Spark', icon: '✦', cost: 145, color: '#ffd166', description: 'Doubles your next banked run score.' },
  { key: 'steady_hand', name: 'Steady Hand', icon: '🎯', cost: 95, color: '#67d4ff', description: 'Slows target movement for more accurate aiming.' }
];

const state = {
  user: null,
  profile: null,
  runs: [],
  activeTab: 'game',
  runScore: 0,
  shotsLeft: 10,
  shotsTaken: 0,
  hits: 0,
  projectile: null,
  dragging: false,
  dragPoint: null,
  animationId: null,
  target: { x: 760, y: 210, r: 42, vx: 1.25, vy: 0.85 },
  sling: { x: 150, y: 355 },
  usedPowerups: []
};

const els = {};
const ids = [
  'authPanel', 'workspace', 'authForm', 'displayNameInput', 'emailInput', 'passwordInput', 'signInBtn', 'signUpBtn', 'signOutBtn',
  'pointsText', 'bestScoreText', 'shotsText', 'storePointsText', 'profilePointsText', 'profileBestText', 'profileShotsText',
  'profileNameText', 'profileEmailText', 'runScoreText', 'shotsLeftText', 'accuracyText', 'equippedText', 'inventoryStrip',
  'storeGrid', 'runHistory', 'gameCanvas', 'canvasHint', 'newRoundBtn', 'saveRunBtn', 'refreshProfileBtn', 'toast'
];

function init() {
  try {
    ids.forEach((id) => { els[id] = document.getElementById(id); });
    bindEvents();
    renderStore();
    syncAuth();
    startGameLoop();
  } catch (error) {
    showToast('The game could not start. Check the console for details.');
    console.error('Init error:', error.message, error.stack);
  }
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.user) return;
      setTab(button.dataset.tab);
    });
  });

  els.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await signUp();
  });
  els.signInBtn.addEventListener('click', signIn);
  els.signOutBtn.addEventListener('click', signOut);
  els.newRoundBtn.addEventListener('click', newRound);
  els.saveRunBtn.addEventListener('click', bankScore);
  els.refreshProfileBtn.addEventListener('click', loadProfileAndRuns);

  const canvas = els.gameCanvas;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', drawGame);
}

async function syncAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await handleSession(session);
    supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSession(session);
    });
  } catch (error) {
    showToast('Auth setup failed. Please refresh.');
    console.error('Auth error:', error.message, error.stack);
  }
}

async function handleSession(session) {
  state.user = session?.user || null;
  if (state.user) {
    document.body.classList.remove('auth-lock');
    els.authPanel.classList.add('hidden');
    els.workspace.classList.remove('hidden');
    els.signOutBtn.hidden = false;
    await loadProfileAndRuns();
    newRound(false);
  } else {
    document.body.classList.add('auth-lock');
    state.profile = null;
    els.authPanel.classList.remove('hidden');
    els.workspace.classList.add('hidden');
    els.signOutBtn.hidden = true;
    setTab('game');
    renderProfile();
  }
}

async function signUp() {
  try {
    setAuthBusy(true);
    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;
    const displayName = els.displayNameInput.value.trim() || email.split('@')[0] || 'Spark Player';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: 'https://sling-gogiapp.web.app/email-confirmed.html'
      }
    });
    if (error) throw error;
    if (data.user) showToast('Account created. If email confirmation is enabled, check your inbox.');
    if (data.session) await handleSession(data.session);
  } catch (error) {
    showToast(error.message || 'Sign up failed.');
    console.error('Sign up error:', error.message, error.stack);
  } finally {
    setAuthBusy(false);
  }
}

async function signIn() {
  try {
    setAuthBusy(true);
    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await handleSession(data.session);
    showToast('Signed in. Welcome back to the range.');
  } catch (error) {
    showToast(error.message || 'Sign in failed.');
    console.error('Sign in error:', error.message, error.stack);
  } finally {
    setAuthBusy(false);
  }
}

async function signOut() {
  try {
    await supabase.auth.signOut();
    state.profile = null;
    state.runs = [];
    showToast('Signed out.');
  } catch (error) {
    showToast('Sign out failed.');
    console.error('Sign out error:', error.message, error.stack);
  }
}

function setAuthBusy(isBusy) {
  els.signUpBtn.disabled = isBusy;
  els.signInBtn.disabled = isBusy;
}

async function loadProfileAndRuns() {
  if (!state.user) return;
  try {
    let { data: profile, error } = await supabase.from(PROFILE_TABLE).select('*').limit(1).maybeSingle();
    if (error) throw error;
    if (!profile) {
      const displayName = state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'Spark Player';
      const created = await supabase.from(PROFILE_TABLE).insert({
        email: state.user.email,
        display_name: displayName,
        points: 0,
        best_score: 0,
        total_shots: 0,
        inventory: {},
        equipped_powerup: null,
        last_played_at: new Date().toISOString()
      }).select('*').single();
      if (created.error) throw created.error;
      profile = created.data;
    }
    state.profile = normalizeProfile(profile);
    const runs = await supabase.from(RUNS_TABLE).select('*').order('created_at', { ascending: false }).limit(6);
    if (runs.error) throw runs.error;
    state.runs = runs.data || [];
    renderProfile();
    renderStore();
  } catch (error) {
    showToast('Could not load your saved profile.');
    console.error('Profile load error:', error.message, error.stack);
  }
}

function normalizeProfile(profile) {
  return {
    ...profile,
    points: Number(profile.points || 0),
    best_score: Number(profile.best_score || 0),
    total_shots: Number(profile.total_shots || 0),
    inventory: profile.inventory && typeof profile.inventory === 'object' ? profile.inventory : {},
    equipped_powerup: profile.equipped_powerup || null
  };
}

async function updateProfile(patch) {
  if (!state.profile) return;
  try {
    const { data, error } = await supabase.from(PROFILE_TABLE).update(patch).eq('id', state.profile.id).select('*').single();
    if (error) throw error;
    state.profile = normalizeProfile(data);
    renderProfile();
    renderStore();
  } catch (error) {
    showToast('Progress could not be saved.');
    console.error('Profile update error:', error.message, error.stack);
  }
}

function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
}

function renderProfile() {
  const p = state.profile;
  const points = p?.points || 0;
  const best = p?.best_score || 0;
  const totalShots = p?.total_shots || 0;
  els.pointsText.textContent = formatNumber(points);
  els.bestScoreText.textContent = formatNumber(best);
  els.shotsText.textContent = formatNumber(totalShots);
  els.storePointsText.textContent = formatNumber(points);
  els.profilePointsText.textContent = formatNumber(points);
  els.profileBestText.textContent = formatNumber(best);
  els.profileShotsText.textContent = formatNumber(totalShots);
  els.profileNameText.textContent = p?.display_name || 'Player';
  els.profileEmailText.textContent = state.user?.email || 'Signed out';
  const equipped = POWERUPS.find((item) => item.key === p?.equipped_powerup);
  els.equippedText.textContent = equipped ? equipped.name : 'None';
  renderInventory();
  renderRunStats();
  renderRunHistory();
}

function renderInventory() {
  const inventory = state.profile?.inventory || {};
  const owned = POWERUPS.filter((item) => Number(inventory[item.key] || 0) > 0);
  if (!owned.length) {
    els.inventoryStrip.innerHTML = '<div class="power-pill"><span>No boosts yet</span><button type="button" data-open-store>Store</button></div>';
  } else {
    els.inventoryStrip.innerHTML = owned.map((item) => `
      <div class="power-pill">
        <span>${item.icon} ${escapeHtml(item.name)} × ${Number(inventory[item.key] || 0)}</span>
        <button type="button" data-equip="${escapeHtml(item.key)}">Equip</button>
      </div>
    `).join('');
  }
  els.inventoryStrip.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', () => equipPowerup(button.dataset.equip)));
  els.inventoryStrip.querySelectorAll('[data-open-store]').forEach((button) => button.addEventListener('click', () => setTab('store')));
}

function renderStore() {
  const points = state.profile?.points || 0;
  const inventory = state.profile?.inventory || {};
  els.storeGrid.innerHTML = POWERUPS.map((item) => {
    const owned = Number(inventory[item.key] || 0);
    const equipped = state.profile?.equipped_powerup === item.key;
    return `
      <article class="store-card" style="--card-color:${item.color}; --card-glow:${item.color}22">
        <div class="store-icon">${item.icon}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="store-meta"><span>${item.cost} pts</span><span>Owned: ${owned}</span></div>
        <div class="store-actions">
          <button class="btn primary" type="button" data-buy="${escapeHtml(item.key)}" ${points < item.cost ? 'disabled' : ''}>Buy</button>
          <button class="btn ghost" type="button" data-equip="${escapeHtml(item.key)}" ${owned <= 0 ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>
        </div>
      </article>
    `;
  }).join('');
  els.storeGrid.querySelectorAll('[data-buy]').forEach((button) => button.addEventListener('click', () => buyPowerup(button.dataset.buy)));
  els.storeGrid.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', () => equipPowerup(button.dataset.equip)));
}

async function buyPowerup(key) {
  const item = POWERUPS.find((powerup) => powerup.key === key);
  if (!item || !state.profile) return;
  if (state.profile.points < item.cost) {
    showToast('Not enough points yet. Bank a bigger score first.');
    return;
  }
  const inventory = { ...(state.profile.inventory || {}) };
  inventory[key] = Number(inventory[key] || 0) + 1;
  const newPoints = state.profile.points - item.cost;
  try {
    const { error } = await supabase.from(PURCHASES_TABLE).insert({ powerup_key: item.key, powerup_name: item.name, cost: item.cost, quantity: 1 });
    if (error) throw error;
    await updateProfile({ points: newPoints, inventory, equipped_powerup: state.profile.equipped_powerup || item.key });
    showToast(`${item.name} added to your kit.`);
  } catch (error) {
    showToast('Purchase failed.');
    console.error('Purchase error:', error.message, error.stack);
  }
}

async function equipPowerup(key) {
  const inventory = state.profile?.inventory || {};
  if (!inventory[key]) return;
  await updateProfile({ equipped_powerup: key });
  const item = POWERUPS.find((powerup) => powerup.key === key);
  showToast(`${item?.name || 'Power-up'} equipped.`);
}

function newRound(showMessage = true) {
  state.runScore = 0;
  state.shotsLeft = 10;
  state.shotsTaken = 0;
  state.hits = 0;
  state.projectile = null;
  state.dragging = false;
  state.usedPowerups = [];
  state.target = { x: 760, y: 210, r: getTargetRadius(), vx: getTargetSpeed(), vy: getTargetSpeed() * 0.68 };
  renderRunStats();
  if (showMessage) showToast('New round ready. Pull the sling.');
}

function getTargetRadius() {
  return state.profile?.equipped_powerup === 'magnet_orb' ? 62 : 42;
}

function getTargetSpeed() {
  return state.profile?.equipped_powerup === 'steady_hand' ? 0.7 : 1.25;
}

function onPointerDown(event) {
  if (!state.user || state.shotsLeft <= 0 || state.projectile) return;
  const point = canvasPoint(event);
  const d = distance(point, state.sling);
  if (d < 92) {
    state.dragging = true;
    state.dragPoint = point;
    els.gameCanvas.setPointerCapture(event.pointerId);
  }
}

function onPointerMove(event) {
  if (!state.dragging) return;
  state.dragPoint = canvasPoint(event);
}

function onPointerUp(event) {
  if (!state.dragging) return;
  const point = canvasPoint(event);
  state.dragging = false;
  launch(point);
}

function launch(point) {
  if (state.shotsLeft <= 0) return;
  const power = state.profile?.equipped_powerup === 'power_band' ? 0.22 : 0.165;
  const vx = (state.sling.x - point.x) * power;
  const vy = (state.sling.y - point.y) * power;
  state.projectile = { x: state.sling.x, y: state.sling.y, vx, vy, r: 11, trail: [] };
  state.shotsLeft -= 1;
  state.shotsTaken += 1;
  if (state.profile?.equipped_powerup) state.usedPowerups.push(state.profile.equipped_powerup);
  renderRunStats();
}

function startGameLoop() {
  const loop = () => {
    try {
      updateGame();
      drawGame();
    } catch (error) {
      console.error('Game loop error:', error.message, error.stack);
    }
    state.animationId = requestAnimationFrame(loop);
  };
  loop();
}

function updateGame() {
  const canvas = els.gameCanvas;
  state.target.x += state.target.vx;
  state.target.y += state.target.vy;
  if (state.target.x < canvas.width * 0.52 || state.target.x > canvas.width - 70) state.target.vx *= -1;
  if (state.target.y < 80 || state.target.y > canvas.height - 95) state.target.vy *= -1;

  const p = state.projectile;
  if (!p) return;
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > 16) p.trail.shift();
  p.x += p.vx;
  p.y += p.vy;
  p.vy += 0.33;
  p.vx *= 0.995;

  const d = distance(p, state.target);
  if (d < state.target.r + p.r) {
    const centerBonus = Math.max(0, Math.round((1 - d / state.target.r) * 75));
    const gained = 25 + centerBonus;
    state.runScore += gained;
    state.hits += 1;
    state.projectile = null;
    state.target.x = 620 + Math.random() * 250;
    state.target.y = 95 + Math.random() * 310;
    renderRunStats();
    showToast(`Hit! +${gained} score.`);
  } else if (p.x < -50 || p.x > canvas.width + 50 || p.y > canvas.height + 70) {
    state.projectile = null;
    renderRunStats();
    if (state.shotsLeft <= 0) showToast('Round over. Bank your score!');
  }
}

function drawGame() {
  const canvas = els.gameCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#190b2d');
  bg.addColorStop(0.48, '#122645');
  bg.addColorStop(1, '#2a1238');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 26; i += 1) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = i % 2 ? '#5ff1d2' : '#ffd166';
    ctx.beginPath();
    ctx.arc((i * 83) % w, (i * 47) % h, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawTarget(ctx);
  drawSling(ctx);
  drawProjectile(ctx);
}

function drawTarget(ctx) {
  const t = state.target;
  ctx.save();
  ctx.shadowColor = '#5ff1d2';
  ctx.shadowBlur = 26;
  const rings = [1, 0.72, 0.43, 0.18];
  const colors = ['#ff4d8d', '#ffd166', '#5ff1d2', '#fff8ef'];
  rings.forEach((scale, index) => {
    ctx.fillStyle = colors[index];
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawSling(ctx) {
  const s = state.sling;
  ctx.lineCap = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#6b3f23';
  ctx.beginPath();
  ctx.moveTo(s.x - 34, s.y + 74);
  ctx.lineTo(s.x - 12, s.y + 8);
  ctx.moveTo(s.x + 34, s.y + 74);
  ctx.lineTo(s.x + 12, s.y + 8);
  ctx.stroke();

  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  const pull = state.dragging && state.dragPoint ? state.dragPoint : s;
  ctx.moveTo(s.x - 13, s.y + 8);
  ctx.lineTo(pull.x, pull.y);
  ctx.lineTo(s.x + 13, s.y + 8);
  ctx.stroke();

  if (state.dragging && state.dragPoint) {
    ctx.fillStyle = '#fff8ef';
    ctx.beginPath();
    ctx.arc(state.dragPoint.x, state.dragPoint.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProjectile(ctx) {
  const p = state.projectile;
  if (!p) return;
  p.trail.forEach((dot, index) => {
    ctx.globalAlpha = index / p.trail.length;
    ctx.fillStyle = '#ff4d8d';
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 4 + index * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff8ef';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function canvasPoint(event) {
  const rect = els.gameCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * els.gameCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * els.gameCanvas.height
  };
}

function renderRunStats() {
  const accuracy = state.shotsTaken ? Math.round((state.hits / state.shotsTaken) * 100) : 0;
  els.runScoreText.textContent = formatNumber(state.runScore);
  els.shotsLeftText.textContent = state.shotsLeft;
  els.accuracyText.textContent = `${accuracy}%`;
}

async function bankScore() {
  if (!state.profile) return;
  if (state.shotsTaken === 0) {
    showToast('Take at least one shot before banking.');
    return;
  }
  const doubleSpark = state.profile.equipped_powerup === 'double_spark';
  const pointsEarned = Math.round(state.runScore * (doubleSpark ? 2 : 1));
  const accuracy = state.shotsTaken ? state.hits / state.shotsTaken : 0;
  const bestScore = Math.max(state.profile.best_score, state.runScore);
  const totalShots = state.profile.total_shots + state.shotsTaken;
  let inventory = { ...(state.profile.inventory || {}) };
  const equipped = state.profile.equipped_powerup;
  let nextEquipped = equipped;
  if (equipped && inventory[equipped]) {
    inventory[equipped] = Math.max(0, Number(inventory[equipped]) - 1);
    if (inventory[equipped] === 0) nextEquipped = null;
  }
  try {
    const { error } = await supabase.from(RUNS_TABLE).insert({
      score: state.runScore,
      points_earned: pointsEarned,
      shots_used: state.shotsTaken,
      accuracy,
      powerups_used: unique(state.usedPowerups)
    });
    if (error) throw error;
    await updateProfile({
      points: state.profile.points + pointsEarned,
      best_score: bestScore,
      total_shots: totalShots,
      inventory,
      equipped_powerup: nextEquipped,
      last_played_at: new Date().toISOString()
    });
    await loadProfileAndRuns();
    showToast(`Banked ${pointsEarned} points.`);
    newRound(false);
  } catch (error) {
    showToast('Could not bank this run.');
    console.error('Bank score error:', error.message, error.stack);
  }
}

function renderRunHistory() {
  if (!state.runs.length) {
    els.runHistory.innerHTML = '<div class="history-row"><span>No saved runs yet.</span><strong>Play now</strong></div>';
    return;
  }
  els.runHistory.innerHTML = state.runs.map((run) => `
    <div class="history-row">
      <span>Score ${formatNumber(run.score)} • ${Math.round(Number(run.accuracy || 0) * 100)}% accuracy</span>
      <strong>+${formatNumber(run.points_earned)}</strong>
    </div>
  `).join('');
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
