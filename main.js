import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls;
let planetGroup, planet, innerCore, currentPlanetType;
let stars;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isLeftMouseDown = false;
let currentTool = 'missile';
let shakeIntensity = 0;
let flashOpacity = 0;
let debrisField = []; // Fixed: Added missing global variable

// Destruction system variables
let damagedVertices = new Set();
let totalVertexCount = 0;

const planetData = {
  earth: {
    name: '지구',
    texture: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    size: 5,
    color: 0x2233ff,
    type: 'rocky',
    atmsColor: 0x0088ff,
    hasClouds: true
  },
  mars: {
    name: '화성',
    texture: 'public/textures/mars_new.png',
    size: 4,
    color: 0xff4422,
    type: 'rocky',
    atmsColor: 0xff4400,
    hasClouds: false
  },
  jupiter: {
    name: '목성',
    texture: 'public/textures/jupiter.png',
    size: 7.5, // Slightly reduced to avoid weird appearance
    color: 0xffaa88,
    type: 'gas',
    atmsColor: 0xaa6644,
    hasClouds: false
  },
  sun: {
    name: '태양',
    texture: 'public/textures/sun.png', // Lava texture for better sun look
    size: 10,
    color: 0xff4400,
    type: 'star',
    atmsColor: 0xffaa00,
    hasClouds: false
  }
};

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

  renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Optimization: lower pixel ratio
  renderer.setSize(window.innerWidth, window.innerHeight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(10, 10, 10);
  scene.add(sunLight);

  addStars();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousedown', (e) => { if (e.button === 0) isLeftMouseDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) isLeftMouseDown = false; });
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('click', onMouseClick);
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  setupUI();
  animate();
}

function addStars() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  for (let i = 0; i < 1500; i++) { // Optimization: fewer stars
    const x = THREE.MathUtils.randFloatSpread(1500);
    const y = THREE.MathUtils.randFloatSpread(1500);
    const z = THREE.MathUtils.randFloatSpread(1500);
    vertices.push(x, y, z);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8 }));
  scene.add(stars);
}

function createPlanet(type) {
  if (planetGroup) {
    planetGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    scene.remove(planetGroup);
  }

  currentPlanetType = type;
  planetGroup = new THREE.Group();
  damagedVertices.clear();

  const data = planetData[type];
  // Performance: Reduced segments for faster calculations
  const geometry = new THREE.SphereGeometry(data.size, 64, 64);
  totalVertexCount = geometry.attributes.position.count;

  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(totalVertexCount * 3), 3));
  const colors = geometry.attributes.color;
  for (let i = 0; i < totalVertexCount; i++) {
    colors.setXYZ(i, 1, 1, 1);
  }

  const textureLoader = new THREE.TextureLoader();
  const material = new THREE.MeshStandardMaterial({
    map: (type === 'sun') ? null : textureLoader.load(data.texture),
    color: (type === 'sun') ? 0xffaa00 : 0xffffff,
    vertexColors: true,
    emissive: new THREE.Color(type === 'sun' ? 0xff4400 : 0x111111),
    emissiveIntensity: type === 'sun' ? 1.0 : 0.3,
    roughness: 0.8,
    metalness: 0.1,
    transparent: true
  });

  planet = new THREE.Mesh(geometry, material);
  planetGroup.add(planet);

  if (data.hasClouds) {
    const cloudMat = new THREE.MeshStandardMaterial({
      map: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_2048.png'),
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(data.size * 1.02, 64, 64), cloudMat);
    clouds.name = 'clouds';
    planetGroup.add(clouds);
  }

  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(type === 'sun' ? 0xff2200 : 0xff4400) },
      color2: { value: new THREE.Color(type === 'sun' ? 0xffaa00 : 0xffaa00) }
    },
    vertexShader: `varying vec3 vPosition; void main() { vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec3 vPosition;
      float noise(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        float n = noise(vPosition * 0.5 + time * 0.1);
        gl_FragColor = vec4(mix(color1, color2, sin(n * 10.0 + time) * 0.5 + 0.5), 1.0);
      }
    `
  });
  innerCore = new THREE.Mesh(new THREE.SphereGeometry(data.size * 0.96, 32, 32), coreMat);
  planetGroup.add(innerCore);

  const atmsMat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(data.atmsColor) }, viewVector: { value: camera.position } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vViewPosition;
      void main() {
        float intensity = pow(0.7 - dot(vNormal, normalize(vViewPosition)), 6.0);
        gl_FragColor = vec4(glowColor, intensity);
      }
    `,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(data.size * 1.15, 32, 32), atmsMat);
  atmosphere.name = 'atmosphere';
  planetGroup.add(atmosphere);

  scene.add(planetGroup);
  camera.position.set(0, 0, data.size * 3.5);
  controls.target.set(0, 0, 0);
  controls.update();

  document.getElementById('current-planet-name').innerText = data.name;
  updateDestructionRate();
}

function updateDestructionRate() {
  const rateText = document.getElementById('destruction-rate');
  const statusText = document.getElementById('planet-status');
  if (rateText && totalVertexCount > 0) {
    const rate = (damagedVertices.size / totalVertexCount) * 100;
    rateText.innerText = `파괴율: ${rate.toFixed(2)}%`;
    if (rate > 80) statusText.innerText = '상태: 붕괴 임박';
    else if (rate > 50) statusText.innerText = '상태: 심각';
    else if (rate > 10) statusText.innerText = '상태: 손상됨';
    else statusText.innerText = '상태: 안정';
  }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (isLeftMouseDown && currentTool === 'laser') {
    handleToolInteraction(false);
  }
}

function onMouseClick(event) {
  if (event.button === 0) handleToolInteraction(true);
}

function handleToolInteraction(isClick) {
  if (!planet) return;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(planet);
  if (intersects.length > 0) {
    const point = intersects[0].point;
    if (currentTool === 'missile') launchNuclearMissile(point);
    else if (currentTool === 'laser') applyMegaLaser(point);
    else if (currentTool === 'meteors') launchMeteorShower(point);
    else if (currentTool === 'blackhole') createBlackHole(point);
    else if (currentTool === 'moon') initiateMoonCrash(point);
  }
}

function launchNuclearMissile(point) {
  const missile = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x444444 }));
  missile.position.copy(camera.position).add(new THREE.Vector3(5, 5, 0));
  missile.lookAt(point); missile.rotateX(Math.PI / 2);
  scene.add(missile);

  const start = missile.position.clone();
  let t = 0;
  const move = () => {
    t += 0.05;
    missile.position.lerpVectors(start, point, t);
    if (t < 1) requestAnimationFrame(move);
    else {
      scene.remove(missile);
      bigExplosion(point, 3.0);
      deformPlanet(point, 2.5, -0.8);
      createDebris(point, 8, planet.material.color);
      triggerShake(1.0); triggerFlash(0.4);
    }
  };
  move();
}

function applyMegaLaser(point) {
  const laser = new THREE.Group();
  laser.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 200), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 })));
  laser.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 200), new THREE.MeshBasicMaterial({ color: 0xffffff })));

  const dir = new THREE.Vector3().subVectors(point, camera.position).normalize();
  laser.position.copy(camera.position).add(dir.clone().multiplyScalar(100));
  laser.lookAt(point); laser.rotateX(Math.PI / 2);
  scene.add(laser);
  setTimeout(() => scene.remove(laser), 50);

  createFlameEffect(point);
  deformPlanet(point, 1.2, -0.15);
}

function createFlameEffect(point) {
  const g = new THREE.SphereGeometry(0.2, 4, 4), m = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(g, m);
    p.position.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    scene.add(p);
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
    let l = 1.0;
    const move = () => {
      p.position.add(v); l -= 0.05; p.scale.setScalar(l * 1.5);
      if (l > 0) requestAnimationFrame(move);
      else { scene.remove(p); }
    };
    move();
  }
}

function launchMeteorShower(target) {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const off = new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      launchSmallMeteor(target.clone().add(off));
    }, i * 120);
  }
}

function launchSmallMeteor(pt) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), new THREE.MeshStandardMaterial({ color: 0x663300, emissive: 0xff4411 }));
  const start = camera.position.clone().add(new THREE.Vector3(Math.random() * 20 - 10, 20, 0));
  m.position.copy(start);
  scene.add(m);
  let t = 0;
  const move = () => {
    t += 0.06;
    m.position.lerpVectors(start, pt, t);
    if (t < 1) requestAnimationFrame(move);
    else { scene.remove(m); createExplosion(pt); deformPlanet(pt, 1.4, -0.4); }
  };
  move();
}

function createBlackHole(pt) {
  const bh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0x0 }));
  bh.position.copy(pt);
  scene.add(bh);
  let f = 0;
  const suck = () => {
    bh.scale.multiplyScalar(1.05); deformPlanet(pt, 2.5, -0.1);
    if (f < 30) requestAnimationFrame(suck);
    else scene.remove(bh);
  };
  suck();
}

function initiateMoonCrash(pt) {
  const moonSize = 3;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(moonSize, 32, 32), new THREE.MeshStandardMaterial({ color: 0x999999 }));
  const start = camera.position.clone().add(new THREE.Vector3(0, 40, -10));
  moon.position.copy(start);
  scene.add(moon);
  let t = 0;
  const move = () => {
    t += 0.012; moon.position.lerpVectors(start, pt, t);
    if (t < 1) requestAnimationFrame(move);
    else {
      scene.remove(moon); bigExplosion(pt, 10); deformPlanet(pt, 6, -3);
      triggerShake(3.0); triggerFlash(0.8);
    }
  };
  move();
}

function deformPlanet(point, radius, strength) {
  if (!planet) return;
  const pData = planetData[currentPlanetType];
  const posAttr = planet.geometry.getAttribute('position');
  const colorAttr = planet.geometry.getAttribute('color');
  const worldMatrix = planet.matrixWorld;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    const worldV = vertex.clone().applyMatrix4(worldMatrix);
    const dist = worldV.distanceTo(point);

    if (dist < radius) {
      const lerpVal = 1 - (dist / radius);
      damagedVertices.add(i);

      const dir = vertex.clone().normalize();
      // Enhanced: stronger deformation for all types
      const s = (pData.type === 'rocky') ? strength : strength * 0.7;
      vertex.addScaledVector(dir, s * lerpVal);

      // Delayed core exposure: minimum radius is now smaller
      const minR = pData.size * 0.85;
      if (vertex.length() < minR) vertex.setLength(minR);
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);

      const color = new THREE.Color().fromBufferAttribute(colorAttr, i);
      let target;
      if (pData.type === 'rocky') target = new THREE.Color(0xff8800);
      else if (pData.type === 'gas') target = new THREE.Color(0x221100);
      else target = new THREE.Color(0x110000);

      // Make transparent only when very deep
      if (vertex.length() < pData.size * 0.90) {
        // planet.material.transparent = true; is already set in createPlanet
      }

      color.lerp(target, lerpVal);
      colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
  }
  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  updateDestructionRate();
}

function animate() {
  requestAnimationFrame(animate);

  if (planet && planetGroup) {
    planetGroup.rotation.y += 0.0004;
    if (innerCore) innerCore.material.uniforms.time.value += 0.01;

    planetGroup.children.forEach(c => {
      if (c.name === 'clouds') c.rotation.y += 0.0006;
      if (c.name === 'atmosphere') {
        if (currentPlanetType === 'sun') c.scale.setScalar(1 + Math.sin(Date.now() * 0.002) * 0.02);
        if (c.material.uniforms && c.material.uniforms.viewVector) c.material.uniforms.viewVector.value.copy(camera.position);
      }
    });

    if (currentPlanetType === 'jupiter' && planet.material.map) planet.material.map.offset.x += 0.0001;

    // Optimized Cooling: only update if damaged
    if (damagedVertices.size > 0 && Math.random() < 0.2) {
      const colors = planet.geometry.getAttribute('color');
      for (let i = 0; i < colors.count; i++) {
        let r = colors.getX(i);
        if (r < 1) {
          const s = 0.002;
          colors.setXYZ(i, Math.min(1, r + s), Math.min(1, colors.getY(i) + s), Math.min(1, colors.getZ(i) + s));
        }
      }
      colors.needsUpdate = true;
    }

    if (shakeIntensity > 0.8) planetGroup.position.set((Math.random() - 0.5) * shakeIntensity * 0.03, (Math.random() - 0.5) * shakeIntensity * 0.03, (Math.random() - 0.5) * shakeIntensity * 0.03);
    else planetGroup.position.set(0, 0, 0);
  }

  if (shakeIntensity > 0.01) { camera.position.x += (Math.random() - 0.5) * shakeIntensity * 0.02; shakeIntensity *= 0.94; }

  const flash = document.getElementById('screen-flash');
  if (flash && flashOpacity > 0) { flash.style.opacity = flashOpacity; flashOpacity *= 0.85; }

  for (let i = debrisField.length - 1; i >= 0; i--) {
    const d = debrisField[i]; d.mesh.position.add(d.velocity); d.life -= 0.025; d.mesh.scale.setScalar(d.life);
    if (d.life <= 0) { scene.remove(d.mesh); debrisField.splice(i, 1); }
  }

  if (stars) stars.rotation.y += 0.00002;

  if (currentPlanetType === 'sun' && Math.random() < 0.05) {
    createSolarFlare();
  }

  controls.update();
  renderer.render(scene, camera);
}

function createSolarFlare() {
  const flareGeo = new THREE.TorusGeometry(planetData.sun.size * 0.95, 0.1, 8, 32, Math.PI);
  const flareMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
  const flare = new THREE.Mesh(flareGeo, flareMat);

  flare.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  planetGroup.add(flare);

  let scale = 1.0;
  const anim = () => {
    scale += 0.01; flare.scale.setScalar(scale); flareMat.opacity -= 0.02;
    if (flareMat.opacity > 0) requestAnimationFrame(anim);
    else { planetGroup.remove(flare); flareGeo.dispose(); flareMat.dispose(); }
  };
  anim();
}

function bigExplosion(pt, s) {
  const l = new THREE.PointLight(0xff6600, 30, s * 3); l.position.copy(pt); scene.add(l);
  setTimeout(() => scene.remove(l), 200);
  for (let i = 0; i < 20; i++) createExplosion(pt.clone().add(new THREE.Vector3((Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s * 0.5)));
}

function createExplosion(pt) {
  const g = new THREE.SphereGeometry(0.1, 4, 4), m = new THREE.MeshBasicMaterial({ color: 0xff4422 });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(g, m); p.position.copy(pt); scene.add(p);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.4);
    let l = 1.0;
    const move = () => {
      p.position.add(v); l -= 0.05; p.scale.setScalar(l);
      if (l > 0) requestAnimationFrame(move);
      else { scene.remove(p); }
    };
    move();
  }
}

function createDebris(pt, count, col) {
  const g = new THREE.IcosahedronGeometry(0.12, 0);
  const m = new THREE.MeshStandardMaterial({ color: col || 0x888888 });
  for (let i = 0; i < count; i++) {
    const d = new THREE.Mesh(g, m);
    d.position.copy(pt).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)));
    const vel = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.5);
    scene.add(d);
    debrisField.push({ mesh: d, velocity: vel, life: 1.0 });
  }
}

function setupUI() {
  const lobby = document.getElementById('lobby'), gameUI = document.getElementById('game-ui');
  document.querySelectorAll('.planet-card').forEach(c => {
    c.onclick = () => { createPlanet(c.dataset.planet); lobby.classList.remove('active'); gameUI.classList.add('active'); };
  });
  document.getElementById('back-to-lobby').onclick = () => { gameUI.classList.remove('active'); lobby.classList.add('active'); if (planetGroup) scene.remove(planetGroup); };
  document.getElementById('reset-planet').onclick = () => { if (currentPlanetType) createPlanet(currentPlanetType); };
  document.querySelectorAll('.control-item').forEach(i => {
    i.onclick = () => { document.querySelectorAll('.control-item').forEach(x => x.classList.remove('active')); i.classList.add('active'); currentTool = i.dataset.tool; };
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
