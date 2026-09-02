import * as THREE from 'three';
import { ENEMY_DEFS, LEVEL, overSolid } from './level.js';

const TYPE_COLOR = {
  untier: 0xFF5A36,
  swapper: 0xFF4FA0,
  flicker: 0xFFC145,
  gnawer: 0x6FCF7B,
  smudge: 0x9C8CA8
};

function devilMesh(color, scale = 1) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.55, emissive: color, emissiveIntensity: 0.25
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5 * scale, 18, 16), bodyMat);
  body.scale.y = 1.15;
  body.position.y = 0.55 * scale;
  body.castShadow = true;
  g.add(body);

  const hornMat = new THREE.MeshStandardMaterial({ color: 0x1A0E1E, roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.36 * scale, 10), hornMat);
    horn.position.set(sx * 0.24 * scale, 1.05 * scale, 0);
    horn.rotation.z = sx * -0.3;
    g.add(horn);
  }

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xFFF3E6, emissive: 0xFFF3E6, emissiveIntensity: 0.8
  });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09 * scale, 10, 10), eyeMat);
    eye.position.set(sx * 0.17 * scale, 0.62 * scale, 0.42 * scale);
    g.add(eye);
  }

  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03 * scale, 0.06 * scale, 0.7 * scale, 6),
    bodyMat
  );
  tail.position.set(0, 0.4 * scale, -0.4 * scale);
  tail.rotation.x = 0.7;
  g.add(tail);

  g.userData.body = body;
  return g;
}

export function buildEnemies(scene) {
  const list = [];
  for (const def of ENEMY_DEFS) {
    const color = TYPE_COLOR[def.type];
    const mesh = devilMesh(color);
    const baseY = def.y != null ? def.y : 0;
    mesh.position.set(def.x, baseY, def.type === 'smudge' ? 1.5 : 0);
    scene.add(mesh);
    list.push({
      id: def.id, type: def.type, mesh,
      anchorX: def.x, baseY,
      range: def.range || 4,
      phase: Math.random() * Math.PI * 2,
      alive: true, solid: true, dying: 0,
      x: def.x, y: baseY
    });
  }
  return list;
}

// time-based motion — deterministic enough that every client stays visually aligned
export function updateEnemies(list, t, dt, players) {
  for (const e of list) {
    if (!e.alive) {
      if (e.dying > 0) {
        e.dying -= dt;
        const s = Math.max(0.001, e.dying / 0.4);
        e.mesh.scale.setScalar(s);
        e.mesh.position.y += dt * 3;
        e.mesh.rotation.y += dt * 12;
        if (e.dying <= 0) e.mesh.visible = false;
      }
      continue;
    }

    const nearest = closestPlayer(players, e.x, e.y);
    const toward = nearest ? Math.sign(nearest.x - e.x) || 1 : 1;

    if (e.type === 'untier') {
      e.x = e.anchorX + Math.sin(t * 1.1 + e.phase) * e.range;
      e.y = e.baseY;
      e.mesh.rotation.y = Math.cos(t * 1.1 + e.phase) > 0 ? 0.4 : -0.4;
      e.solid = true;

    } else if (e.type === 'gnawer') {
      const hop = Math.abs(Math.sin(t * 2.4 + e.phase));
      e.y = e.baseY + hop * 1.7;
      e.x = e.anchorX + Math.sin(t * 0.7 + e.phase) * 2.5 + toward * hop * 0.4;
      e.mesh.rotation.z = Math.sin(t * 2.4 + e.phase) * 0.2;
      e.solid = true;

    } else if (e.type === 'swapper') {
      const cycle = (t * 0.5 + e.phase) % (Math.PI * 2);
      const phasing = Math.sin(cycle * 2) > 0.75;
      e.solid = !phasing;
      const seg = Math.floor((t * 0.5 + e.phase) / 1.4);
      const jitter = mulhash(seg + e.id.length * 7);
      e.x = e.anchorX + (jitter - 0.5) * 6 + toward * 1.5;
      e.y = e.baseY;
      e.mesh.userData.body.material.opacity = phasing ? 0.2 : 1;
      e.mesh.userData.body.material.transparent = phasing;

    } else if (e.type === 'flicker') {
      const vis = Math.sin(t * 3.0 + e.phase) > -0.15;
      e.solid = vis;
      e.mesh.visible = vis || Math.sin(t * 30) > 0.6;
      e.x = e.anchorX + (vis ? toward * ((t * 0.6) % 3) : 0) - 1.5;
      e.y = e.baseY;

    } else if (e.type === 'smudge') {
      e.y = e.baseY + Math.sin(t * 1.6 + e.phase) * 1.1;
      e.x = e.anchorX + Math.sin(t * 0.4 + e.phase) * 4 + toward * 0.6;
      e.mesh.position.z = 1.2 + Math.sin(t * 0.9 + e.phase) * 0.6;
      e.solid = true;
    }

    e.mesh.position.x = e.x;
    e.mesh.position.y = e.y;
    e.mesh.userData.body.rotation.y = t * 2 + e.phase;
  }
}

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  e.solid = false;
  e.dying = 0.4;
}

/** returns 'stomp' | 'hit' | null for a hero vs one enemy */
export function testEnemy(h, e) {
  if (!e.alive || !e.solid) return null;
  const dx = Math.abs(h.x - e.x);
  const dz = Math.abs((h.z || 0) - e.mesh.position.z);
  if (dx > 0.85 || dz > 1.3) return null;

  const heroFeet = h.y;
  const enemyTop = e.y + (e.type === 'gnawer' ? 0.9 : 1.15);
  const enemyMid = e.y + 0.55;

  if (h.vy < 0 && heroFeet <= enemyTop + 0.35 && heroFeet >= enemyMid) {
    return 'stomp';
  }
  if (heroFeet < enemyTop && h.y + 1.7 > e.y) {
    return h.invuln > 0 ? null : 'hit';
  }
  return null;
}

// ---------------------------------------------------------------- boss
export function makeBoss(scene) {
  const g = devilMesh(0xFF5A36, 2.4);
  g.userData.body.material.emissiveIntensity = 0.4;
  // crown of remote controls
  const crown = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.5, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1A0E1E })
    );
    const a = (i / 7) * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.9, 2.7, Math.sin(a) * 0.9);
    r.lookAt(0, 2.7, 0);
    crown.add(r);
  }
  g.add(crown);
  g.position.set(LEVEL.bossX, 0, 0);
  g.visible = false;
  scene.add(g);

  return {
    mesh: g, x: LEVEL.bossX, y: 0, hp: 3,
    active: false, state: 'gloat', timer: 2.2, vulnerable: false, flash: 0
  };
}

export function updateBoss(boss, t, dt, players) {
  if (!boss.active) return null;
  boss.mesh.visible = true;
  boss.timer -= dt;

  const nearest = closestPlayer(players, boss.x, boss.y);
  const toward = nearest ? Math.sign(nearest.x - boss.x) || -1 : -1;

  if (boss.state === 'chase') {
    boss.vulnerable = false;
    boss.x += toward * 2.6 * dt;
    boss.x = THREE.MathUtils.clamp(boss.x, LEVEL.bossX - 10, LEVEL.bossX + 6);
    boss.mesh.position.y = Math.abs(Math.sin(t * 6)) * 0.5;
    if (boss.timer <= 0) { boss.state = 'gloat'; boss.timer = 1.6; }
  } else {
    // gloating: stops, tips head back, wide open for a stomp
    boss.vulnerable = true;
    boss.mesh.position.y = 0;
    boss.mesh.userData.body.rotation.x = -0.5 + Math.sin(t * 4) * 0.1;
    if (boss.timer <= 0) {
      boss.state = 'chase';
      boss.timer = 2.4;
      boss.mesh.userData.body.rotation.x = 0;
    }
  }

  boss.mesh.position.x = boss.x;
  if (boss.flash > 0) {
    boss.flash -= dt;
    boss.mesh.userData.body.material.emissiveIntensity = 0.4 + boss.flash * 4;
  }
  boss.mesh.rotation.y = toward === 1 ? -0.4 : 0.4;

  // contact
  for (const p of players) {
    const dx = Math.abs(p.x - boss.x);
    if (dx < 2.0 && p.y < 2.4) {
      if (p.vy < 0 && p.y > 1.1 && boss.vulnerable) return { who: p, result: 'stomp' };
      if (p.invuln <= 0 && !boss.vulnerable) return { who: p, result: 'hit' };
    }
  }
  return null;
}

export function hitBoss(boss) {
  boss.hp -= 1;
  boss.flash = 0.4;
  boss.state = 'chase';
  boss.timer = 1.4;
  boss.vulnerable = false;
}

// ---------------------------------------------------------------- helpers
function closestPlayer(players, x, y) {
  let best = null, bd = Infinity;
  for (const p of players) {
    const d = Math.abs(p.x - x) + Math.abs((p.y || 0) - y) * 0.3;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function mulhash(n) {
  let t = (n + 0x9E3779B9) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}
