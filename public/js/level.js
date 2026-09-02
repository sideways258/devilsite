import * as THREE from 'three';

// World units are roughly metres. The hero is ~1.8 tall.
// The camera looks at the XY plane from +Z: X = run, Y = jump, Z = depth (locked).

export const LEVEL = {
  length: 250,
  // solid floor spans on the X axis; gaps between them are pits
  segs: [
    [-8, 58],
    [63, 96],
    [101, 250]
  ],
  platforms: [
    { x: 18, y: 2.6, w: 6 }, { x: 30, y: 4.6, w: 5 }, { x: 42, y: 3.0, w: 5 },
    { x: 68, y: 3.2, w: 6 }, { x: 82, y: 4.8, w: 5 }, { x: 90, y: 2.6, w: 4 },
    { x: 112, y: 3.2, w: 6 }, { x: 124, y: 5.4, w: 5 }, { x: 136, y: 3.2, w: 5 },
    { x: 160, y: 3.6, w: 6 }, { x: 174, y: 5.4, w: 5 }, { x: 188, y: 3.4, w: 5 }
  ],
  socks: [
    { x: 12, y: 2 }, { x: 30, y: 6 }, { x: 42, y: 4.4 }, { x: 55, y: 2 },
    { x: 68, y: 4.6 }, { x: 82, y: 6.2 }, { x: 108, y: 2 }, { x: 124, y: 6.8 },
    { x: 136, y: 4.6 }, { x: 150, y: 2 }, { x: 174, y: 6.8 }, { x: 188, y: 4.8 },
    { x: 205, y: 2 }
  ],
  checkpoints: [0, 82, 152],
  // X thresholds where the stage (and lighting/theme) changes
  stageBounds: [80, 150],
  stageThemes: [
    { name: 'The Living Room', fog: 0x2a1236, floor: 0x3d1f47, rim: 0xFF5A36, sky: 0x241128 },
    { name: 'The Kitchen', fog: 0x123033, floor: 0x1d3b3f, rim: 0xFFC145, sky: 0x0f2a2c },
    { name: 'The Basement', fog: 0x160b1c, floor: 0x241028, rim: 0xFF4FA0, sky: 0x0b0610 }
  ],
  bossX: 214,
  coraX: 236,
  goalX: 240
};

// enemy roster — stable ids so kills sync cleanly across clients
export const ENEMY_DEFS = [
  { id: 'e0', type: 'untier', x: 16, range: 5 },
  { id: 'e1', type: 'gnawer', x: 27 },
  { id: 'e2', type: 'smudge', x: 39, y: 3.6 },
  { id: 'e3', type: 'untier', x: 50, range: 4 },
  { id: 'e4', type: 'flicker', x: 71 },
  { id: 'e5', type: 'swapper', x: 88 },
  { id: 'e6', type: 'gnawer', x: 108 },
  { id: 'e7', type: 'smudge', x: 120, y: 4.2 },
  { id: 'e8', type: 'untier', x: 132, range: 5 },
  { id: 'e9', type: 'flicker', x: 145 },
  { id: 'e10', type: 'swapper', x: 162 },
  { id: 'e11', type: 'gnawer', x: 178 },
  { id: 'e12', type: 'smudge', x: 190, y: 4.6 },
  { id: 'e13', type: 'untier', x: 200, range: 4 },
  { id: 'e14', type: 'flicker', x: 208 }
];

export function stageForX(x) {
  if (x < LEVEL.stageBounds[0]) return 0;
  if (x < LEVEL.stageBounds[1]) return 1;
  return 2;
}

/** Height of the nearest solid surface at column x that the feet at `feetY`
 *  can land on when moving down. Returns -Infinity if nothing is under x. */
export function surfaceUnder(x, feetY, prevFeetY) {
  let best = -Infinity;
  for (const [a, b] of LEVEL.segs) {
    if (x >= a && x <= b) { best = Math.max(best, 0); break; }
  }
  for (const p of LEVEL.platforms) {
    if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2) {
      if (prevFeetY >= p.y - 0.001 && feetY <= p.y + 0.6) best = Math.max(best, p.y);
    }
  }
  return best;
}

export function overSolid(x) {
  for (const [a, b] of LEVEL.segs) if (x >= a && x <= b) return true;
  return false;
}

// ---------------------------------------------------------------- meshes
function boxMesh(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.0,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function buildLevelMeshes(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // floor spans
  for (let i = 0; i < LEVEL.segs.length; i++) {
    const [a, b] = LEVEL.segs[i];
    const w = b - a;
    const themeIdx = Math.min(2, stageForX((a + b) / 2));
    const floor = boxMesh(w, 4, 14, LEVEL.stageThemes[themeIdx].floor, { rough: 0.95 });
    floor.position.set(a + w / 2, -2, 0);
    group.add(floor);

    // glowing rim strip along the front edge
    const rim = boxMesh(w, 0.16, 0.4, LEVEL.stageThemes[themeIdx].rim, {
      emissive: LEVEL.stageThemes[themeIdx].rim, emissiveIntensity: 1.4, cast: false
    });
    rim.position.set(a + w / 2, 0.02, 6.9);
    group.add(rim);

    // back wall
    const wall = boxMesh(w, 26, 1, LEVEL.stageThemes[themeIdx].floor, { rough: 1, cast: false });
    wall.position.set(a + w / 2, 6, -6.5);
    group.add(wall);
  }

  // platforms
  for (const p of LEVEL.platforms) {
    const themeIdx = Math.min(2, stageForX(p.x));
    const m = boxMesh(p.w, 0.8, 4, 0x5c2f68, { rough: 0.8 });
    m.position.set(p.x, p.y - 0.4, 0);
    group.add(m);
    const glow = boxMesh(p.w, 0.1, 0.3, LEVEL.stageThemes[themeIdx].rim, {
      emissive: LEVEL.stageThemes[themeIdx].rim, emissiveIntensity: 1.4, cast: false
    });
    glow.position.set(p.x, p.y + 0.06, 1.9);
    group.add(glow);
  }

  // scattered furniture-ish props for parallax depth
  const rng = mulberry32(9012);
  for (let x = -4; x < LEVEL.length; x += 7) {
    const themeIdx = Math.min(2, stageForX(x));
    const h = 1.5 + rng() * 5;
    const prop = boxMesh(1 + rng() * 2.5, h, 1 + rng() * 2, LEVEL.stageThemes[themeIdx].floor, {
      rough: 1, cast: false
    });
    prop.position.set(x + rng() * 3, h / 2 - 4, -4 - rng() * 2.5);
    group.add(prop);
  }

  // socks (collectibles)
  const sockMeshes = [];
  const sockGeo = new THREE.CapsuleGeometry(0.22, 0.4, 4, 8);
  for (let i = 0; i < LEVEL.socks.length; i++) {
    const s = LEVEL.socks[i];
    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFC145, emissive: 0xFFC145, emissiveIntensity: 0.5, roughness: 0.4
    });
    const mesh = new THREE.Mesh(sockGeo, mat);
    mesh.position.set(s.x, s.y, 0);
    mesh.rotation.z = 0.5;
    mesh.userData = { taken: false, i };
    group.add(mesh);
    sockMeshes.push(mesh);
  }

  // Cora at the end — waiting, tied to a chair of remote controls
  const cora = new THREE.Group();
  const body = boxMesh(0.7, 1.2, 0.5, 0xFF4FA0, { emissive: 0xFF4FA0, emissiveIntensity: 0.25 });
  body.position.y = 0.9;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xFFF3E6, roughness: 0.6 })
  );
  head.position.y = 1.75;
  const chair = boxMesh(1.1, 0.3, 1.1, 0x1A0E1E);
  chair.position.y = 0.15;
  cora.add(chair, body, head);
  cora.position.set(LEVEL.coraX, 0, 0);
  cora.visible = true;
  group.add(cora);

  return { group, sockMeshes, cora };
}

// tiny deterministic RNG so every client builds identical decor
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
