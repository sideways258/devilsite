import * as THREE from 'three';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x241128);
  scene.fog = new THREE.Fog(0x2a1236, 22, 60);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, 4, 15);

  // lights
  const hemi = new THREE.HemisphereLight(0xffd9c0, 0x2a1236, 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe6c0, 1.5);
  key.position.set(6, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.PointLight(0xFF5A36, 0.6, 40, 2);
  rim.position.set(0, 3, 4);
  scene.add(rim);

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const camState = { x: 0, y: 4, shake: 0 };

  function updateCamera(targetX, targetY, face, dt) {
    const lookAhead = face * 2.2;
    camState.x += (targetX + lookAhead - camState.x) * Math.min(1, dt * 4);
    camState.y += (Math.max(3.2, targetY + 2.5) - camState.y) * Math.min(1, dt * 3);

    camState.shake = Math.max(0, camState.shake - dt * 3);
    const s = camState.shake;
    const sx = (Math.random() - 0.5) * s;
    const sy = (Math.random() - 0.5) * s;

    camera.position.set(camState.x + sx, camState.y + 3 + sy, 16);
    camera.lookAt(camState.x, camState.y + 0.5, 0);

    key.position.set(camState.x + 6, 16, 12);
    key.target.position.set(camState.x, 0, 0);
    rim.position.set(camState.x, 3, 5);
  }

  function shake(amount) {
    camState.shake = Math.min(1.4, camState.shake + amount);
  }

  function setTheme(theme, dt) {
    const targetFog = new THREE.Color(theme.fog);
    const targetBg = new THREE.Color(theme.sky);
    scene.fog.color.lerp(targetFog, Math.min(1, dt * 1.5));
    scene.background.lerp(targetBg, Math.min(1, dt * 1.5));
    rim.color.lerp(new THREE.Color(theme.rim), Math.min(1, dt * 1.5));
  }

  return { renderer, scene, camera, updateCamera, shake, setTheme, resize };
}
