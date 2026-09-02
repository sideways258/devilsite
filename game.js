/* =====================================================================
   Details Runs the House — a side-scroller for "Devils in the Details"
   Plain canvas, no dependencies. Hero: Details. Five kinds of devils.
   ===================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width;   // 960
  const VIEW_H = canvas.height;  // 540

  const C = {
    sky: '#241128', skyLo: '#341a3d',
    hillFar: '#2f1638', hillNear: '#3d1f47',
    ground: '#3d1f47', groundTop: '#5c2f68',
    cream: '#FFF3E6', ink: '#1A0E1E',
    flame: '#FF5A36', gold: '#FFC145', pink: '#FF4FA0',
    green: '#6FCF7B', smoke: '#9C8CA8'
  };

  // --- world constants --------------------------------------------------
  const GRAVITY = 2400;
  const RUN_ACCEL = 2800;
  const RUN_MAX = 330;
  const FRICTION = 2200;
  const JUMP_V = 790;
  const LEVEL_W = 7400;
  const GROUND_Y = 468;          // y of the walkable floor surface
  const GOAL_X = 7150;

  // Solid floor spans; gaps between them are pits.
  const groundSegs = [
    [-40, 1580], [1750, 3180], [3350, 4620], [4790, 6200], [6370, LEVEL_W + 60]
  ];

  const platforms = [
    { x: 780, y: 380, w: 150, h: 18 },
    { x: 1080, y: 300, w: 140, h: 18 },
    { x: 1340, y: 372, w: 130, h: 18 },
    { x: 2020, y: 360, w: 170, h: 18 },
    { x: 2380, y: 286, w: 140, h: 18 },
    { x: 2760, y: 356, w: 130, h: 18 },
    { x: 3560, y: 344, w: 160, h: 18 },
    { x: 3900, y: 272, w: 150, h: 18 },
    { x: 4180, y: 356, w: 140, h: 18 },
    { x: 4980, y: 360, w: 150, h: 18 },
    { x: 5320, y: 292, w: 140, h: 18 },
    { x: 5680, y: 356, w: 150, h: 18 },
    { x: 6520, y: 348, w: 150, h: 18 },
    { x: 6820, y: 292, w: 140, h: 18 }
  ];

  // --- input ----------------------------------------------------------
  const held = { left: false, right: false, jump: false };
  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump'
  };
  let jumpQueued = false;

  addEventListener('keydown', function (e) {
    if (keyMap[e.code]) {
      if (keyMap[e.code] === 'jump' && !held.jump) jumpQueued = true;
      held[keyMap[e.code]] = true;
      e.preventDefault();
    } else if (e.code === 'KeyP') {
      if (game.state === 'playing') game.state = 'paused';
      else if (game.state === 'paused') game.state = 'playing';
    } else if (e.code === 'KeyR') {
      reset();
      game.state = 'playing';
    } else if (e.code === 'Enter') {
      if (game.state === 'title') { reset(); game.state = 'playing'; }
      else if (game.state === 'won' || game.state === 'lost') { reset(); game.state = 'playing'; }
    }
  });
  addEventListener('keyup', function (e) {
    if (keyMap[e.code]) { held[keyMap[e.code]] = false; e.preventDefault(); }
  });

  // touch buttons
  document.querySelectorAll('.touch__btn').forEach(function (btn) {
    const k = btn.getAttribute('data-key');
    const on = function (e) {
      e.preventDefault();
      if (k === 'jump' && !held.jump) jumpQueued = true;
      held[k] = true;
    };
    const off = function (e) { e.preventDefault(); held[k] = false; };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
    btn.addEventListener('mousedown', on);
    btn.addEventListener('mouseup', off);
    btn.addEventListener('mouseleave', off);
  });

  // click / tap the canvas to start or restart
  canvas.addEventListener('pointerdown', function () {
    if (game.state === 'title' || game.state === 'won' || game.state === 'lost') {
      reset();
      game.state = 'playing';
    }
  });

  // --- entities -----------------------------------------------------
  const player = {
    x: 60, y: GROUND_Y - 46, w: 30, h: 46,
    vx: 0, vy: 0, onGround: false, face: 1,
    invuln: 0, prevBottom: 0
  };

  let enemies = [];
  let coins = [];
  let particles = [];

  const game = {
    state: 'title',
    lives: 3,
    score: 0,
    time: 0,
    caught: 0,
    totalDevils: 0,
    checkpoint: { x: 60, y: GROUND_Y - 46 }
  };

  const ENEMY_DEFS = {
    untier: { w: 32, h: 40, color: C.flame, label: 'The Untier' },
    swapper: { w: 32, h: 40, color: C.pink, label: 'The Swapper' },
    flicker: { w: 30, h: 40, color: C.gold, label: 'The Flicker' },
    gnawer: { w: 30, h: 30, color: C.green, label: 'The Gnawer' },
    smudge: { w: 40, h: 34, color: C.smoke, label: 'The Smudge' }
  };

  function makeEnemy(type, x, opts) {
    const d = ENEMY_DEFS[type];
    opts = opts || {};
    const e = {
      type: type, w: d.w, h: d.h, color: d.color,
      x: x, y: GROUND_Y - d.h,
      vx: 0, vy: 0, dead: false, deadT: 0, t: Math.random() * 6,
      dir: opts.dir || -1,
      homeX: x, range: opts.range || 120,
      timer: 0.6 + Math.random() * 1.4, phase: 'solid', alpha: 1,
      onGround: true
    };
    if (type === 'smudge') { e.baseY = opts.y || 300; e.y = e.baseY; }
    return e;
  }

  function buildLevel() {
    enemies = [
      makeEnemy('untier', 640, { range: 120 }),
      makeEnemy('gnawer', 1050),
      makeEnemy('untier', 1420, { range: 90 }),
      makeEnemy('smudge', 1980, { y: 300 }),
      makeEnemy('flicker', 2360),
      makeEnemy('swapper', 2820),
      makeEnemy('gnawer', 3020),
      makeEnemy('untier', 3520, { range: 140 }),
      makeEnemy('smudge', 4020, { y: 270 }),
      makeEnemy('flicker', 4360),
      makeEnemy('swapper', 4900),
      makeEnemy('gnawer', 5240),
      makeEnemy('smudge', 5680, { y: 320 }),
      makeEnemy('untier', 6000, { range: 120 }),
      makeEnemy('flicker', 6480),
      makeEnemy('swapper', 6820)
    ];
    game.totalDevils = enemies.length;

    coins = [];
    for (let x = 360; x < GOAL_X - 120; x += 250) {
      if (!onSolidGround(x) && !platformAt(x)) continue;
      const y = GROUND_Y - 70 - (Math.sin(x * 0.017) * 60 + 60);
      coins.push({ x: x, y: y, w: 16, h: 16, got: false, t: Math.random() * 6 });
    }
  }

  function reset() {
    player.x = 60; player.y = GROUND_Y - player.h;
    player.vx = 0; player.vy = 0; player.onGround = false;
    player.face = 1; player.invuln = 0;
    game.lives = 3; game.score = 0; game.time = 0; game.caught = 0;
    game.checkpoint = { x: 60, y: GROUND_Y - player.h };
    particles = [];
    buildLevel();
  }

  // --- helpers ----------------------------------------------------
  function onSolidGround(x) {
    for (let i = 0; i < groundSegs.length; i++) {
      if (x >= groundSegs[i][0] && x <= groundSegs[i][1]) return true;
    }
    return false;
  }
  function platformAt(x) {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (x >= p.x && x <= p.x + p.w) return p;
    }
    return null;
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 320,
        vy: -Math.random() * 320 - 40,
        life: 0.5 + Math.random() * 0.3, age: 0,
        color: color
      });
    }
  }

  // --- update ---------------------------------------------------
  function update(dt) {
    game.time += dt;

    // ---- player horizontal ----
    const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (dir !== 0) {
      player.vx += dir * RUN_ACCEL * dt;
      player.face = dir;
    } else {
      const f = FRICTION * dt;
      if (player.vx > f) player.vx -= f;
      else if (player.vx < -f) player.vx += f;
      else player.vx = 0;
    }
    if (player.vx > RUN_MAX) player.vx = RUN_MAX;
    if (player.vx < -RUN_MAX) player.vx = -RUN_MAX;

    // ---- jump ----
    if ((jumpQueued || held.jump) && player.onGround) {
      player.vy = -JUMP_V;
      player.onGround = false;
    }
    jumpQueued = false;
    // variable jump height
    if (!held.jump && player.vy < -260) player.vy = -260;

    // ---- player vertical ----
    player.vy += GRAVITY * dt;
    if (player.vy > 1400) player.vy = 1400;

    player.prevBottom = player.y + player.h;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.x + player.w > LEVEL_W) { player.x = LEVEL_W - player.w; player.vx = 0; }

    // ---- floor + platform collision ----
    player.onGround = false;
    const footX = player.x + player.w / 2;
    if (player.vy >= 0 && player.prevBottom <= GROUND_Y + 2 &&
        player.y + player.h >= GROUND_Y && onSolidGround(footX)) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.onGround = true;
      game.checkpoint = { x: player.x, y: player.y };
    }
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (player.vy >= 0 &&
          player.prevBottom <= p.y + 2 &&
          player.y + player.h >= p.y &&
          player.x + player.w > p.x + 4 &&
          player.x < p.x + p.w - 4) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    // ---- fell in a pit ----
    if (player.y > VIEW_H + 120) {
      loseLife(true);
    }

    if (player.invuln > 0) player.invuln -= dt;

    // ---- enemies ----
    for (let i = 0; i < enemies.length; i++) {
      updateEnemy(enemies[i], dt);
    }
    enemies = enemies.filter(function (e) { return !(e.dead && e.deadT > 0.35); });

    // ---- coins ----
    for (let i = 0; i < coins.length; i++) {
      const co = coins[i];
      if (co.got) continue;
      co.t += dt;
      if (aabb(player, co)) {
        co.got = true;
        game.score += 25;
        burst(co.x + 8, co.y + 8, C.gold, 8);
      }
    }

    // ---- particles ----
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      pt.age += dt;
      pt.vy += 900 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    particles = particles.filter(function (p) { return p.age < p.life; });

    // ---- reached the goal ----
    if (player.x + player.w > GOAL_X) {
      game.score += 500 + Math.max(0, Math.round(120 - game.time) * 5);
      game.state = 'won';
    }
  }

  function updateEnemy(e, dt) {
    if (e.dead) { e.deadT += dt; return; }
    e.t += dt;

    if (e.type === 'untier') {
      e.x += e.dir * 62 * dt;
      if (e.x < e.homeX - e.range || e.x > e.homeX + e.range) e.dir *= -1;
      if (!onSolidGround(e.x + e.w / 2)) { e.x -= e.dir * 62 * dt; e.dir *= -1; }

    } else if (e.type === 'gnawer') {
      e.timer -= dt;
      if (e.onGround && e.timer <= 0) {
        e.vy = -640;
        e.vx = (player.x > e.x ? 1 : -1) * 150;
        e.onGround = false;
        e.timer = 1.3 + Math.random() * 0.6;
      }
      e.vy += GRAVITY * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.vy >= 0 && e.y + e.h >= GROUND_Y && onSolidGround(e.x + e.w / 2)) {
        e.y = GROUND_Y - e.h; e.vy = 0; e.vx = 0; e.onGround = true;
      }
      if (e.y > VIEW_H + 200) e.dead = true, e.deadT = 1;

    } else if (e.type === 'swapper') {
      e.timer -= dt;
      if (e.phase === 'solid') {
        e.alpha = 1;
        if (e.timer <= 0) { e.phase = 'phasing'; e.timer = 0.5; }
      } else {
        e.alpha = 0.18;
        if (e.timer <= 0) {
          e.phase = 'solid'; e.timer = 1.8 + Math.random() * 0.8;
          const toward = player.x > e.x ? 1 : -1;
          let nx = e.x + toward * (120 + Math.random() * 80);
          nx = Math.max(e.homeX - 260, Math.min(e.homeX + 260, nx));
          if (onSolidGround(nx + e.w / 2)) e.x = nx;
          burst(e.x + e.w / 2, e.y + e.h / 2, C.pink, 10);
        }
      }

    } else if (e.type === 'flicker') {
      // visible on a sine beat; slides toward the player while visible
      const vis = Math.sin(e.t * 3.1);
      e.alpha = vis > -0.15 ? 1 : 0.1;
      if (e.alpha === 1) {
        e.x += (player.x > e.x ? 1 : -1) * 45 * dt;
      }

    } else if (e.type === 'smudge') {
      e.y = e.baseY + Math.sin(e.t * 2) * 42;
      e.x += (player.x > e.x ? 1 : -1) * 46 * dt;
      e.alpha = 0.85;
    }

    // ---- collision with player ----
    if (e.dead) return;
    const solid = (e.type === 'swapper' && e.phase === 'phasing') ? false :
                  (e.type === 'flicker' && e.alpha < 0.5) ? false : true;
    if (!solid) return;

    if (aabb(player, e)) {
      const stomp = player.vy > 0 && player.prevBottom <= e.y + 12;
      if (stomp) {
        e.dead = true; e.deadT = 0;
        player.vy = -430;
        game.caught += 1;
        game.score += 150;
        burst(e.x + e.w / 2, e.y + e.h / 2, e.color, 14);
      } else if (player.invuln <= 0) {
        hitPlayer(e);
      }
    }
  }

  function hitPlayer(e) {
    game.lives -= 1;
    player.invuln = 1.5;
    player.vy = -360;
    player.vx = (player.x < e.x ? -1 : 1) * 280;
    burst(player.x + player.w / 2, player.y + player.h / 2, C.cream, 12);
    if (game.lives <= 0) game.state = 'lost';
  }

  function loseLife(fell) {
    game.lives -= 1;
    burst(player.x + player.w / 2, VIEW_H - 40, C.flame, 16);
    if (game.lives <= 0) { game.state = 'lost'; return; }
    player.x = game.checkpoint.x;
    player.y = game.checkpoint.y - 4;
    player.vx = 0; player.vy = 0;
    player.invuln = 1.2;
  }

  // --- camera -------------------------------------------------
  let camX = 0;
  function updateCamera() {
    const target = player.x + player.w / 2 - VIEW_W * 0.42;
    camX += (target - camX) * 0.12;
    if (camX < 0) camX = 0;
    if (camX > LEVEL_W - VIEW_W) camX = LEVEL_W - VIEW_W;
  }

  // --- render -------------------------------------------------
  function render() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, C.sky);
    g.addColorStop(1, C.skyLo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    drawStars();
    drawHills(0.25, C.hillFar, 150, 70);
    drawHills(0.5, C.hillNear, 90, 110);

    ctx.save();
    ctx.translate(-camX, 0);

    drawGround();
    platforms.forEach(drawPlatform);
    coins.forEach(drawCoin);
    enemies.forEach(drawEnemy);
    drawGoal();
    drawPlayer();
    drawParticles();

    ctx.restore();

    drawHUD();

    if (game.state === 'title') overlayTitle();
    else if (game.state === 'paused') overlayCenter('Paused', 'Press P to resume');
    else if (game.state === 'won') overlayCenter('House cleared!', 'Score ' + game.score + ' — press Enter to play again');
    else if (game.state === 'lost') overlayCenter('The mischief won', 'You caught ' + game.caught + '/' + game.totalDevils + ' — press Enter to retry');
  }

  const starField = [];
  for (let i = 0; i < 70; i++) {
    starField.push({ x: Math.random() * LEVEL_W, y: Math.random() * VIEW_H * 0.6, r: Math.random() * 1.6 + 0.4 });
  }
  function drawStars() {
    ctx.fillStyle = 'rgba(255,243,230,0.35)';
    for (let i = 0; i < starField.length; i++) {
      const s = starField[i];
      const sx = s.x - camX * 0.1;
      const wrapped = ((sx % LEVEL_W) + LEVEL_W) % LEVEL_W;
      if (wrapped < VIEW_W) {
        ctx.beginPath();
        ctx.arc(wrapped, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawHills(factor, color, amp, base) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    const off = camX * factor;
    for (let x = 0; x <= VIEW_W; x += 20) {
      const wx = x + off;
      const y = VIEW_H - base - Math.sin(wx * 0.005) * amp * 0.5 - Math.sin(wx * 0.013) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    for (let i = 0; i < groundSegs.length; i++) {
      const s = groundSegs[i];
      const x = s[0], w = s[1] - s[0];
      if (x + w < camX || x > camX + VIEW_W) continue;
      ctx.fillStyle = C.ground;
      ctx.fillRect(x, GROUND_Y, w, VIEW_H - GROUND_Y);
      ctx.fillStyle = C.groundTop;
      ctx.fillRect(x, GROUND_Y, w, 8);
    }
  }

  function drawPlatform(p) {
    if (p.x + p.w < camX || p.x > camX + VIEW_W) return;
    ctx.fillStyle = C.hillNear;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = C.groundTop;
    ctx.fillRect(p.x, p.y, p.w, 5);
  }

  function drawCoin(co) {
    if (co.got) return;
    if (co.x < camX - 40 || co.x > camX + VIEW_W + 40) return;
    const bob = Math.sin(co.t * 4) * 3;
    ctx.save();
    ctx.translate(co.x + 8, co.y + 8 + bob);
    ctx.rotate(Math.sin(co.t * 3) * 0.3);
    ctx.fillStyle = C.gold;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-7, -7, 5, 5);
    ctx.restore();
  }

  function drawGoal() {
    if (GOAL_X < camX - 40 || GOAL_X > camX + VIEW_W + 80) return;
    ctx.fillStyle = C.cream;
    ctx.fillRect(GOAL_X, GROUND_Y - 150, 6, 150);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(GOAL_X + 6, GROUND_Y - 150);
    ctx.lineTo(GOAL_X + 60, GROUND_Y - 132);
    ctx.lineTo(GOAL_X + 6, GROUND_Y - 114);
    ctx.closePath();
    ctx.fill();
  }

  // little horned devil silhouette used for every enemy
  function drawDevilBody(x, y, w, h, color, alpha, eyeGlow) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const r = Math.min(w, h) * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    // horns
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 2);
    ctx.lineTo(x + w * 0.28, y + 2);
    ctx.lineTo(x + w * 0.14, y - h * 0.3);
    ctx.closePath();
    ctx.moveTo(x + w - 3, y + 2);
    ctx.lineTo(x + w * 0.72, y + 2);
    ctx.lineTo(x + w * 0.86, y - h * 0.3);
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.fillStyle = eyeGlow ? C.gold : C.ink;
    const ey = y + h * 0.4;
    ctx.beginPath();
    ctx.arc(x + w * 0.33, ey, w * 0.09, 0, Math.PI * 2);
    ctx.arc(x + w * 0.67, ey, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.x + e.w < camX - 60 || e.x > camX + VIEW_W + 60) return;

    if (e.dead) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - e.deadT / 0.35);
      const s = 1 - e.deadT / 0.35;
      ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
      ctx.scale(s, s);
      drawDevilBody(-e.w / 2, -e.h / 2, e.w, e.h, e.color, 1, false);
      ctx.restore();
      return;
    }

    const bob = e.type === 'smudge' ? 0 : Math.sin(e.t * 4) * 2;

    if (e.type === 'smudge') {
      // soft smoky blob + little wings
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = C.smoke;
      ctx.beginPath();
      ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2 + Math.sin(e.t * 8) * 3, e.w * 0.66, e.h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(e.x + e.w * 0.38, e.y + e.h * 0.45, 2.4, 0, Math.PI * 2);
      ctx.arc(e.x + e.w * 0.62, e.y + e.h * 0.45, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    drawDevilBody(e.x, e.y + bob, e.w, e.h, e.color, e.alpha, e.type === 'flicker');

    // per-type flourish
    ctx.save();
    ctx.globalAlpha = e.alpha;
    if (e.type === 'untier') {
      ctx.strokeStyle = C.cream;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const yy = e.y + e.h + 2 + bob;
      ctx.moveTo(e.x - 4, yy);
      ctx.quadraticCurveTo(e.x + e.w / 2, yy + 8, e.x + e.w + 4, yy);
      ctx.stroke();
    } else if (e.type === 'swapper') {
      ctx.strokeStyle = C.cream;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x + e.w / 2, e.y - 8 + bob, 6, 0.3, Math.PI * 1.7);
      ctx.stroke();
    } else if (e.type === 'gnawer' && !e.onGround) {
      ctx.strokeStyle = 'rgba(255,243,230,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.y + e.h + 4);
      ctx.lineTo(e.x + e.w / 2, e.y + e.h + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const blink = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0;
    if (blink) return;

    const x = player.x, y = player.y, w = player.w, h = player.h;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(player.face, 1);
    ctx.translate(-w / 2, -h / 2);

    // legs
    const stride = player.onGround ? Math.sin(game.time * 16) * 4 : 3;
    ctx.fillStyle = C.ink;
    ctx.fillRect(4, h - 12, 8, 12 + stride);
    ctx.fillRect(w - 12, h - 12, 8, 12 - stride);

    // coat / body
    ctx.fillStyle = C.cream;
    ctx.fillRect(2, 12, w - 4, h - 20);
    ctx.fillStyle = C.flame;
    ctx.fillRect(w / 2 - 2, 14, 4, h - 24); // buttons stripe

    // head
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.arc(w / 2, 9, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(w / 2 + 3, 8, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // magnifying glass held forward
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w - 2, h / 2 - 2, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 7, h / 2 + 3);
    ctx.lineTo(w - 12, h / 2 + 9);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    // hearts
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < game.lives ? C.flame : 'rgba(255,243,230,0.2)';
      const hx = 18 + i * 26, hy = 20;
      ctx.beginPath();
      ctx.moveTo(hx + 8, hy + 14);
      ctx.bezierCurveTo(hx - 4, hy + 4, hx + 2, hy - 4, hx + 8, hy + 3);
      ctx.bezierCurveTo(hx + 14, hy - 4, hx + 20, hy + 4, hx + 8, hy + 14);
      ctx.fill();
    }

    ctx.fillStyle = C.cream;
    ctx.font = '600 20px Fredoka, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Score ' + game.score, VIEW_W - 18, 30);
    ctx.textAlign = 'left';
    ctx.font = '500 15px Karla, sans-serif';
    ctx.fillStyle = 'rgba(255,243,230,0.75)';
    ctx.fillText('Devils caught ' + game.caught + '/' + game.totalDevils, 18, 52);

    // progress bar
    const pw = 200, px = VIEW_W / 2 - pw / 2, py = 22;
    ctx.fillStyle = 'rgba(255,243,230,0.18)';
    ctx.fillRect(px, py, pw, 6);
    ctx.fillStyle = C.gold;
    ctx.fillRect(px, py, pw * Math.min(1, player.x / GOAL_X), 6);
  }

  function overlayTitle() {
    dim();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.cream;
    ctx.font = '700 46px Fredoka, sans-serif';
    ctx.fillText('DETAILS RUNS THE HOUSE', VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.font = '500 18px Karla, sans-serif';
    ctx.fillStyle = 'rgba(255,243,230,0.85)';
    ctx.fillText('Five kinds of devil between you and the far door. Land on each one to catch it.', VIEW_W / 2, VIEW_H / 2 + 2);
    ctx.fillStyle = C.gold;
    ctx.font = '600 20px Fredoka, sans-serif';
    ctx.fillText('Press Enter or tap to start', VIEW_W / 2, VIEW_H / 2 + 44);
    ctx.textAlign = 'left';
  }

  function overlayCenter(title, sub) {
    dim();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.cream;
    ctx.font = '700 40px Fredoka, sans-serif';
    ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 10);
    ctx.font = '500 18px Karla, sans-serif';
    ctx.fillStyle = 'rgba(255,243,230,0.85)';
    ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 28);
    ctx.textAlign = 'left';
  }

  function dim() {
    ctx.fillStyle = 'rgba(26,14,30,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // --- main loop ---------------------------------------------
  const STEP = 1 / 120;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (game.state === 'playing') {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard < 8) {
        update(STEP);
        acc -= STEP;
        guard++;
        if (game.state !== 'playing') { acc = 0; break; }
      }
    } else {
      acc = 0;
    }

    updateCamera();
    render();
    requestAnimationFrame(frame);
  }

  buildLevel();
  requestAnimationFrame(frame);
})();
