import * as THREE from 'three';
import { LEVEL, surfaceUnder } from './level.js';

const GRAVITY = 30;
const MOVE_SPEED = 7.2;
const ACCEL = 70;
const FRICTION = 55;
const JUMP_VEL = 12.6;
const COYOTE = 0.1;
const BUFFER = 0.12;

// ---------------------------------------------------------------- hero mesh
function buildFigure(coatColor, accent, skin = 0xFFF3E6) {
  const g = new THREE.Group();

  const coat = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.8, 6, 12),
    new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.7 })
  );
  coat.position.y = 0.95;
  coat.castShadow = true;
  g.add(coat);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.9, 0.05),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 })
  );
  stripe.position.set(0, 0.95, 0.4);
  g.add(stripe);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 16),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 })
  );
  head.position.y = 1.75;
  head.castShadow = true;
  g.add(head);

  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.4, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: 0x1A0E1E, roughness: 0.8 })
  );
  hat.position.y = 2.0;
  g.add(hat);

  // legs (animated)
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1A0E1E, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.24), legMat);
  const legR = legL.clone();
  legL.position.set(-0.18, 0.28, 0);
  legR.position.set(0.18, 0.28, 0);
  legL.castShadow = legR.castShadow = true;
  g.add(legL, legR);

  // magnifying glass, held forward
  const arm = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.05, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0xFFC145, metalness: 0.6, roughness: 0.3 })
  );
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshStandardMaterial({
      color: 0x8fdcff, transparent: true, opacity: 0.35, roughness: 0.1
    })
  );
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b3a20 })
  );
  handle.position.set(0, -0.32, 0);
  arm.add(ring, glass, handle);
  arm.position.set(0.55, 1.0, 0.25);
  g.add(arm);

  g.userData.parts = { legL, legR, arm, coat, head };
  return g;
}

export function makeHero(scene) {
  const mesh = buildFigure(0xFFF3E6, 0xFF5A36);
  scene.add(mesh);
  return {
    mesh,
    x: 0, y: 6, z: 0,
    vx: 0, vy: 0,
    face: 1,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    hearts: 3,
    invuln: 0,
    socks: 0,
    anim: 'idle',
    walkPhase: 0,
    squash: 1
  };
}

export function makeGhost(scene, color, name) {
  const mesh = buildFigure(color, 0xFFFFFF, 0xEcd9ff);
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
    }
  });
  scene.add(mesh);
  return { mesh, name, x: 0, y: 0, face: 1, anim: 'idle', walkPhase: 0, target: { x: 0, y: 0 } };
}

// ---------------------------------------------------------------- physics
export function updateHero(h, input, dt, onLand) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (dir !== 0) {
    h.vx += dir * ACCEL * dt;
    h.vx = THREE.MathUtils.clamp(h.vx, -MOVE_SPEED, MOVE_SPEED);
    h.face = dir;
  } else {
    const f = FRICTION * dt;
    if (h.vx > f) h.vx -= f; else if (h.vx < -f) h.vx += f; else h.vx = 0;
  }

  // jump with coyote time + input buffering
  if (input.jumpPressed) h.jumpBuffer = BUFFER;
  h.jumpBuffer = Math.max(0, h.jumpBuffer - dt);
  h.coyote = h.onGround ? COYOTE : Math.max(0, h.coyote - dt);

  if (h.jumpBuffer > 0 && h.coyote > 0) {
    h.vy = JUMP_VEL;
    h.onGround = false;
    h.coyote = 0;
    h.jumpBuffer = 0;
    h.squash = 1.35;
  }
  if (!input.jumpHeld && h.vy > 4) h.vy = 4; // variable height

  h.vy -= GRAVITY * dt;
  h.vy = Math.max(h.vy, -32);

  const prevY = h.y;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.x = THREE.MathUtils.clamp(h.x, -4, LEVEL.length - 2);

  // land on floor / platforms
  const surf = surfaceUnder(h.x, h.y, prevY);
  const wasAir = !h.onGround;
  h.onGround = false;
  if (h.vy <= 0 && surf > -Infinity && h.y <= surf + 0.001) {
    h.y = surf;
    h.vy = 0;
    h.onGround = true;
    if (wasAir && onLand) onLand();
    if (wasAir) h.squash = 0.7;
  }

  // fell off the world
  if (h.y < -14) return 'fell';

  if (h.invuln > 0) h.invuln -= dt;

  // animation state
  if (!h.onGround) h.anim = h.vy > 0 ? 'jump' : 'fall';
  else if (Math.abs(h.vx) > 0.5) h.anim = 'run';
  else h.anim = 'idle';

  h.squash += (1 - h.squash) * Math.min(1, dt * 12);
  applyPose(h, dt);
  return null;
}

export function applyPose(h, dt) {
  const m = h.mesh;
  m.position.set(h.x, h.y, h.z || 0);
  m.rotation.y = h.face === 1 ? 0.35 : -0.35;
  m.scale.set(1 / Math.sqrt(h.squash || 1), h.squash || 1, 1 / Math.sqrt(h.squash || 1));

  const p = m.userData.parts;
  if (h.anim === 'run') {
    h.walkPhase += dt * 14;
    const s = Math.sin(h.walkPhase) * 0.5;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.arm.position.y = 1.0 + Math.abs(Math.sin(h.walkPhase)) * 0.05;
  } else if (h.anim === 'idle') {
    h.walkPhase += dt * 3;
    p.legL.rotation.x *= 0.8;
    p.legR.rotation.x *= 0.8;
    p.arm.position.y = 1.0 + Math.sin(h.walkPhase) * 0.03;
  } else {
    p.legL.rotation.x = -0.5;
    p.legR.rotation.x = 0.4;
  }
}

// remote player smoothing
export function updateGhost(gh, dt) {
  gh.x += (gh.target.x - gh.x) * Math.min(1, dt * 12);
  gh.y += (gh.target.y - gh.y) * Math.min(1, dt * 12);
  gh.face = gh.target.face || 1;
  gh.anim = gh.target.anim || 'idle';
  applyPose(gh, dt);
}
