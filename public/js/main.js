import * as THREE from 'three';
import { createScene } from './scene.js';
import { LEVEL, buildLevelMeshes } from './level.js';
import {
  makeHero, makeGhost, updateHero, updateGhost
} from './player.js';
import {
  buildEnemies, updateEnemies, killEnemy, testEnemy,
  makeBoss, updateBoss, hitBoss
} from './enemies.js';
import { Dialog } from './dialog.js';
import { STORY, ENDING_BEATS } from './story.js';
import { Net } from './net.js';

const canvas = document.getElementById('game');
const { renderer, scene, camera, updateCamera, shake, setTheme } = createScene(canvas);

const level = buildLevelMeshes(scene);
const hero = makeHero(scene);
const enemies = buildEnemies(scene);
const boss = makeBoss(scene);

const ghosts = new Map();          // id -> ghost
let state = 'title';               // title | playing | won
let currentStage = 0;
let expectedBeat = 0;              // next story beat allowed to fire
let sentBeat = -1;                 // last beat id we asked the server to fire
let clock = 0;                     // seconds since play began (drives enemy motion)
let heartRegen = 0;
let score = 0;
let devilsCaught = 0;

// ---------------------------------------------------------------- input
const input = { left: false, right: false, jumpHeld: false, jumpPressed: false };
const keydownKeys = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
};

function typing() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

addEventListener('keydown', (e) => {
  if (typing()) {
    if (e.code === 'Enter') submitChat();
    if (e.code === 'Escape') closeChat();
    return;
  }
  if (Dialog.isOpen && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
    e.preventDefault();
    Dialog.advance();
    return;
  }
  if (state === 'title' && e.code === 'Enter') { start(); return; }

  if (keydownKeys[e.code]) { input[keydownKeys[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    if (!input.jumpHeld) input.jumpPressed = true;
    input.jumpHeld = true;
    e.preventDefault();
  }
  if (e.code === 'KeyT') { e.preventDefault(); openChat(); }
  if (e.code === 'KeyR') { Net.reset(); }
});

addEventListener('keyup', (e) => {
  if (keydownKeys[e.code]) input[keydownKeys[e.code]] = false;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') input.jumpHeld = false;
});

// touch
document.querySelectorAll('#touch button').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => {
    e.preventDefault();
    if (k === 'jump') { if (!input.jumpHeld) input.jumpPressed = true; input.jumpHeld = true; }
    else input[k] = true;
  };
  const off = (e) => { e.preventDefault(); if (k === 'jump') input.jumpHeld = false; else input[k] = false; };
  btn.addEventListener('touchstart', on, { passive: false });
  btn.addEventListener('touchend', off, { passive: false });
  btn.addEventListener('touchcancel', off, { passive: false });
  btn.addEventListener('mousedown', on);
  btn.addEventListener('mouseup', off);
  btn.addEventListener('mouseleave', off);
});

// ---------------------------------------------------------------- chat
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
function openChat() { if (!Net.online) return; chatInput.hidden = false; chatInput.focus(); }
function closeChat() { chatInput.hidden = true; chatInput.value = ''; chatInput.blur(); }
function submitChat() {
  const v = chatInput.value.trim();
  if (v) Net.chat(v);
  closeChat();
}
function pushChat(name, text) {
  const d = document.createElement('div');
  d.className = 'm';
  d.innerHTML = `<b></b> <span></span>`;
  d.querySelector('b').textContent = name + ':';
  d.querySelector('span').textContent = text;
  chatLog.appendChild(d);
  while (chatLog.children.length > 6) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => d.remove(), 12000);
}

// ---------------------------------------------------------------- particles
const particles = [];
const pGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
for (let i = 0; i < 60; i++) {
  const m = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({
    emissive: 0xffffff, emissiveIntensity: 1.4, color: 0x000000
  }));
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
}
function burst(x, y, z, color, n = 10) {
  let spawned = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.mesh.material.emissive.set(color);
    p.mesh.position.set(x, y + 0.6, z);
    p.mesh.visible = true;
    p.life = 0.4 + Math.random() * 0.3;
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = Math.random() * 6 + 1;
    p.vz = (Math.random() - 0.5) * 4;
    if (++spawned >= n) break;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy -= 16 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 8;
    p.mesh.scale.setScalar(Math.max(0.01, p.life * 2.5));
    if (p.life <= 0) p.mesh.visible = false;
  }
}

// ---------------------------------------------------------------- HUD
const el = {
  hearts: document.getElementById('hud-hearts'),
  socks: document.querySelector('#hud-socks span'),
  stage: document.getElementById('hud-stage'),
  bar: document.getElementById('hud-bar-fill'),
  net: document.getElementById('hud-net'),
  players: document.getElementById('hud-players'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayText: document.getElementById('overlay-text'),
  overlayForm: document.getElementById('overlay-form'),
  bossbar: document.getElementById('bossbar'),
  bossFill: document.getElementById('bossbar-fill'),
  toasts: document.getElementById('toasts')
};

function renderHUD() {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span>${i < hero.hearts ? '❤️' : '🖤'}</span>`;
  el.hearts.innerHTML = h;
  el.socks.textContent = hero.socks;
  el.stage.textContent = LEVEL.stageThemes[currentStage].name;
  el.bar.style.width = Math.min(100, (hero.x / LEVEL.goalX) * 100) + '%';

  if (boss.active && state === 'playing') {
    el.bossbar.hidden = false;
    el.bossFill.style.width = Math.max(0, (boss.hp / 3) * 100) + '%';
  } else {
    el.bossbar.hidden = true;
  }
}

function renderPlayers(list) {
  el.players.innerHTML = '';
  for (const p of list) {
    if (p.id === Net.selfId) continue;
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<b></b>`;
    d.querySelector('b').textContent = p.name;
    el.players.appendChild(d);
  }
}

function toast(text) {
  const d = document.createElement('div');
  d.className = 't';
  d.textContent = text;
  el.toasts.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

// ---------------------------------------------------------------- net events
Net.on('welcome', (m) => {
  expectedBeat = m.nextBeat || 0;
  currentStage = m.stage || 0;
  for (const id of m.killed || []) {
    const e = enemies.find((x) => x.id === id);
    if (e) killEnemy(e);
  }
  if (m.bossSpawned) boss.active = true;
  boss.hp = m.bossHp ?? 3;
  if (m.won) { state = 'won'; showEndCard(); }
  for (const p of m.players || []) ensureGhost(p);
});

Net.on('players', (m) => {
  const seen = new Set();
  for (const p of m.list) {
    if (p.id === Net.selfId) continue;
    seen.add(p.id);
    const g = ensureGhost(p);
    g.target = { x: p.x, y: p.y, face: p.face, anim: p.anim };
  }
  for (const [id, g] of ghosts) {
    if (!seen.has(id)) { scene.remove(g.mesh); ghosts.delete(id); }
  }
  renderPlayers(m.list);
});

Net.on('peerJoin', (m) => toast(`${m.name} entered the house`));
Net.on('peerLeave', (m) => {
  const g = ghosts.get(m.id);
  if (g) { scene.remove(g.mesh); ghosts.delete(m.id); }
});

Net.on('stomp', (m) => {
  const e = enemies.find((x) => x.id === m.id);
  if (e && e.alive) {
    killEnemy(e);
    burst(e.x, e.y, e.mesh.position.z, e.mesh.userData.body.material.color.getHex(), 12);
  }
});

Net.on('dialog', (m) => {
  const beat = STORY.find((b) => b.id === m.id);
  expectedBeat = Math.max(expectedBeat, m.id + 1);
  if (!beat) return;
  Dialog.play(m.id);
});

Net.on('stage', (m) => {
  currentStage = m.stage;
  toast('— ' + LEVEL.stageThemes[currentStage].name + ' —');
});

Net.on('bossSpawn', () => {
  boss.active = true;
  boss.mesh.visible = true;
  toast('Baron Marrow blocks the way');
});

Net.on('bossHp', (m) => { boss.hp = m.hp; });

Net.on('win', () => {
  if (state === 'won') return;
  state = 'won';
  boss.active = false;
  boss.mesh.visible = false;
  burst(boss.x, 1.5, 0, 0xFFC145, 30);
  shake(1.2);
  Dialog.play(ENDING_BEATS, showEndCard);
});

Net.on('chat', (m) => pushChat(m.name, m.text));
Net.on('offline', () => { el.net.textContent = 'offline — solo'; });
Net.on('roomReset', () => resetRoom());

function ensureGhost(p) {
  let g = ghosts.get(p.id);
  if (!g) {
    const palette = [0xFF4FA0, 0x6FCF7B, 0x8fdcff, 0xFFC145, 0xc79bff];
    g = makeGhost(scene, palette[p.id % palette.length], p.name);
    ghosts.set(p.id, g);
  }
  return g;
}

// ---------------------------------------------------------------- flow
function start() {
  const name = (document.getElementById('in-name').value || 'Detail').trim();
  const room = (document.getElementById('in-room').value || 'house').trim();
  el.net.textContent = 'connecting…';
  Net.connect(name, room).then((online) => {
    el.net.textContent = online ? `online · room “${Net.room}”` : 'offline — solo';
    if (online) toast(`Joined room “${Net.room}”`);
  });
  el.overlay.classList.add('is-hidden');
  el.overlay.classList.remove('end-card');
  state = 'playing';
  clock = 0;
}

document.getElementById('btn-start').addEventListener('click', start);

function showEndCard() {
  el.overlayTitle.textContent = 'YOU NOTICED HER HOME';
  el.overlayText.innerHTML =
    `Cora is out. The socks are, regrettably, alphabetised.<br><br>` +
    `Devils caught: <b>${devilsCaught}</b> &nbsp;·&nbsp; Socks recovered: <b>${hero.socks}</b> &nbsp;·&nbsp; Score: <b>${score}</b>`;
  el.overlayForm.innerHTML = `<button id="btn-again" class="btn-primary">Run it again</button>`;
  document.getElementById('btn-again').addEventListener('click', () => {
    Net.reset();
    el.overlay.classList.add('is-hidden');
  });
  el.overlay.classList.add('end-card');
  el.overlay.classList.remove('is-hidden');
}

function resetRoom() {
  for (const e of enemies) {
    e.alive = true; e.solid = true; e.dying = 0;
    e.mesh.visible = true;
    e.mesh.scale.setScalar(1);
    e.mesh.rotation.set(0, 0, 0);
  }
  for (const m of level.sockMeshes) { m.userData.taken = false; m.visible = true; }
  boss.active = false;
  boss.hp = 3;
  boss.mesh.visible = false;
  boss.mesh.position.set(LEVEL.bossX, 0, 0);
  boss.x = LEVEL.bossX;
  boss.state = 'gloat';
  hero.x = 0; hero.y = 6; hero.vx = 0; hero.vy = 0; hero.hearts = 3; hero.socks = 0;
  hero.invuln = 0;
  expectedBeat = 0; sentBeat = -1; currentStage = 0; score = 0; devilsCaught = 0; clock = 0;
  state = 'playing';
  el.overlay.classList.add('is-hidden');
  el.overlay.classList.remove('end-card');
}

let lastCheckpoint = 0;
function respawn(loseHeart) {
  if (loseHeart) hero.hearts = Math.max(1, hero.hearts - 1);
  hero.x = LEVEL.checkpoints[lastCheckpoint];
  hero.y = 6;
  hero.vx = 0; hero.vy = 0;
  hero.invuln = 1.4;
}

function damage(source) {
  if (hero.invuln > 0) return;
  hero.hearts -= 1;
  hero.invuln = 1.5;
  hero.vy = 7;
  hero.vx = (hero.x < source.x ? -1 : 1) * 8;
  burst(hero.x, hero.y, 0, 0xFFF3E6, 8);
  shake(0.5);
  if (hero.hearts <= 0) { hero.hearts = 3; respawn(false); }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;

  Dialog.tick(dt);
  clock += dt;

  if (state === 'playing') {
    // checkpoints
    for (let i = LEVEL.checkpoints.length - 1; i >= 0; i--) {
      if (hero.x >= LEVEL.checkpoints[i] - 1) { lastCheckpoint = i; break; }
    }

    const frozen = Dialog.isOpen;
    const activeInput = frozen
      ? { left: false, right: false, jumpHeld: false, jumpPressed: false }
      : input;

    const res = updateHero(hero, activeInput, dt, () => shake(0.12));
    input.jumpPressed = false;
    if (res === 'fell') respawn(true);

    // heart regen
    heartRegen += dt;
    if (heartRegen > 14 && hero.hearts < 3) { hero.hearts++; heartRegen = 0; }

    updateEnemies(enemies, clock, dt, [hero]);
    const br = updateBoss(boss, clock, dt, [hero]);

    // no combat while a cutscene is up
    if (!frozen) {
      for (const e of enemies) {
        const r = testEnemy(hero, e);
        if (r === 'stomp') {
          killEnemy(e);
          Net.stomp(e.id);
          hero.vy = 8.5;
          score += 150;
          devilsCaught++;
          burst(e.x, e.y, e.mesh.position.z, e.mesh.userData.body.material.color.getHex(), 12);
          shake(0.35);
        } else if (r === 'hit') {
          damage(e);
        }
      }

      if (br && br.result === 'stomp') {
        hitBoss(boss);
        Net.bossHit();
        hero.vy = 9;
        score += 300;
        burst(boss.x, 1.6, 0, 0xFF5A36, 16);
        shake(0.7);
      } else if (br && br.result === 'hit') {
        damage(boss);
      }

      for (const m of level.sockMeshes) {
        if (m.userData.taken) continue;
        m.rotation.y += dt * 3;
        m.position.y += Math.sin(clock * 3 + m.userData.i) * dt * 0.3;
        if (Math.abs(m.position.x - hero.x) < 0.8 && Math.abs(m.position.y - (hero.y + 0.9)) < 1.1) {
          m.userData.taken = true;
          m.visible = false;
          hero.socks++;
          score += 25;
          Net.sock();
          burst(m.position.x, m.position.y, 0, 0xFFC145, 6);
        }
      }
    }

    // story triggers — strictly in order, fire once
    const nextBeat = STORY.find((b) => b.id === expectedBeat && b.x != null);
    if (nextBeat && hero.x >= nextBeat.x && sentBeat < nextBeat.id) {
      sentBeat = nextBeat.id;
      Net.trigger(nextBeat.id, { stage: nextBeat.stage, spawnBoss: nextBeat.spawnBoss });
    }

    Net.sendState(hero, dt);
  } else {
    // keep the world alive behind menus / the end card
    updateEnemies(enemies, clock, dt, [hero]);
  }

  if (level.cora) level.cora.position.y = state === 'won' ? Math.sin(clock * 5) * 0.06 : 0;

  for (const [, g] of ghosts) updateGhost(g, dt);
  updateParticles(dt);
  setTheme(LEVEL.stageThemes[currentStage], dt);
  updateCamera(hero.x, hero.y, hero.face, dt);
  renderHUD();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// prefill a friendly random name
document.getElementById('in-name').value =
  'Detail-' + Math.random().toString(36).slice(2, 5);
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) document.getElementById('in-room').value = urlRoom;

requestAnimationFrame(frame);
