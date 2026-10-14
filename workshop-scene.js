import * as THREE from './vendor/three/three.module.min.js';

// A small, entirely procedural room. The portfolio UI owns navigation and panels;
// this module owns only the canvas, its objects, and their camera interactions.
export function createWorkshopScene({ canvas, onSelect = () => {}, onProject = () => {}, reducedMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 7, -7, 0.1, 100);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const interactive = [];
  const stations = new Map();
  const hoverLights = new Map();
  const animations = [];
  const projection = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3(0, 1.9, 0);
  const desiredTarget = cameraTarget.clone();
  const homeTarget = cameraTarget.clone();
  let width = 1;
  let height = 1;
  let disposed = false;
  let animationFrame = 0;
  let motionPaused = false;
  let yaw = Math.atan2(12, 15);
  let desiredYaw = yaw;
  let zoom = 1;
  let desiredZoom = 1;
  let hoverId = null;
  let selectedId = null;
  let pointerDown = null;
  let previousTime = 0;
  let elapsed = 0;
  let companionReaction = 0;

  function material(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...options });
    resources.materials.add(value);
    return value;
  }

  const palette = {
    base: material('#192522'),
    edge: material('#101917'),
    wall: material('#35453e'),
    wallTrim: material('#516358'),
    floor: material('#a39477'),
    floorAlt: material('#998c72'),
    wood: material('#bd9870'),
    woodDark: material('#80664d'),
    woodLight: material('#d1b48c'),
    cream: material('#e3dfcc'),
    paper: material('#f5efda'),
    gray: material('#687970'),
    dark: material('#24332e'),
    black: material('#14201b'),
    mint: material('#a8e9af'),
    green: material('#78c587'),
    bright: material('#b3f6bd', { emissive: '#7fdb94', emissiveIntensity: 0.16 }),
    orange: material('#d49b75'),
    pink: material('#c7a2a0'),
    lavender: material('#a3a8c5'),
    blue: material('#82a7ac'),
    leaf: material('#598467'),
    leafLight: material('#8eaa75'),
    rug: material('#61776b'),
    rugStripe: material('#9fa58c'),
    warmLight: material('#ffe1a4', { emissive: '#ffce83', emissiveIntensity: 0.7 }),
  };

  function ownGeometry(geometry) {
    resources.geometries.add(geometry);
    return geometry;
  }

  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
    const object = new THREE.Mesh(ownGeometry(geometry), mat);
    object.position.set(x, y, z);
    object.castShadow = shadow;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
  }

  function softBox(parent, w, h, d, mat, x = 0, y = 0, z = 0, radius = 0.045) {
    const r = Math.min(radius, w / 4, h / 4, d / 4);
    const shape = new THREE.Shape();
    const a = w / 2 - r;
    const b = h / 2 - r;
    shape.moveTo(-a, -b);
    shape.lineTo(a, -b);
    shape.lineTo(a, b);
    shape.lineTo(-a, b);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - 2 * r, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: r, bevelThickness: r,
    });
    geometry.translate(0, 0, -(d - 2 * r) / 2);
    return mesh(geometry, mat, parent, x, y, z);
  }

  function cylinder(parent, top, bottom, h, mat, x = 0, y = 0, z = 0, segments = 16) {
    return mesh(new THREE.CylinderGeometry(top, bottom, h, segments), mat, parent, x, y, z);
  }

  function sphere(parent, radius, mat, x = 0, y = 0, z = 0) {
    return mesh(new THREE.SphereGeometry(radius, 12, 8), mat, parent, x, y, z);
  }

  function group(parent, x = 0, y = 0, z = 0) {
    const value = new THREE.Group();
    value.position.set(x, y, z);
    parent.add(value);
    return value;
  }

  function texture(draw, w = 768, h = 512) {
    const element = document.createElement('canvas');
    element.width = w;
    element.height = h;
    const context = element.getContext('2d');
    draw(context, w, h);
    const value = new THREE.CanvasTexture(element);
    value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    resources.textures.add(value);
    return value;
  }

  function flatTexture(parent, w, h, map, x, y, z, opacity = 1) {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: opacity < 1, opacity, toneMapped: false });
    resources.materials.add(mat);
    return mesh(new THREE.PlaneGeometry(w, h), mat, parent, x, y, z, false);
  }

  function roundedRect(ctx, x, y, w, h, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }

  function words(ctx, content, x, y, size = 32, color = '#e7eadc', weight = 500) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px monospace`;
    ctx.fillText(content, x, y);
  }

  function labelTexture(title, subtitle) {
    return texture((ctx, w, h) => {
      ctx.fillStyle = '#34463b';
      ctx.fillRect(0, 0, w, h);
      words(ctx, title, 40, 86, 44, '#dee8ce', 600);
      words(ctx, subtitle, 42, 136, 19, '#aebda4');
    }, 768, 180);
  }

  function station(id, x, z, anchor, target) {
    const value = group(scene, x, 0, z);
    value.userData.stationId = id;
    interactive.push(value);
    const anchorObject = new THREE.Object3D();
    anchorObject.position.set(...anchor);
    value.add(anchorObject);
    const lampMat = material('#b5f1ba', { emissive: '#80db8c', emissiveIntensity: 0.25 });
    const [footprintW, footprintD] = {
      profile: [4, 1.6], rew: [2.9, 2.0], taskseal: [3.3, 2.1],
      projects: [2.5, 1.1], skills: [2.0, 1.4],
    }[id];
    const outlineMaterial = new THREE.LineBasicMaterial({ color: '#c0f0ba', transparent: true, opacity: 0.85 });
    resources.materials.add(outlineMaterial);
    const outlineGeometry = ownGeometry(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-footprintW / 2, 0.125, -footprintD / 2),
      new THREE.Vector3(footprintW / 2, 0.125, -footprintD / 2),
      new THREE.Vector3(footprintW / 2, 0.125, footprintD / 2),
      new THREE.Vector3(-footprintW / 2, 0.125, footprintD / 2),
    ]));
    const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
    outline.visible = false;
    // This is visual feedback only, not a larger invisible click target.
    outline.raycast = () => {};
    value.add(outline);
    hoverLights.set(id, lampMat);
    stations.set(id, {
      object: value,
      anchor: anchorObject,
      target: new THREE.Vector3(x + target[0], target[1], z + target[2]),
      lampMat,
      outline,
    });
    return value;
  }

  // Light comes from the open side of the room, with a warmer pool at the desks.
  scene.add(new THREE.HemisphereLight('#e2eee0', '#6e725b', 2.5));
  const sun = new THREE.DirectionalLight('#fff0d3', 4.1);
  sun.position.set(3, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 35;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#b7d5c4', 1.1);
  fill.position.set(-6, 5, -4);
  scene.add(fill);

  // Raised foundation, inset timber floor, and an open front make the room read
  // as an architectural model rather than a camera placed inside a full room.
  const room = group(scene);
  softBox(room, 12.4, 0.52, 9.4, palette.base, 0, -0.32, 0, 0.13);
  softBox(room, 12.1, 0.13, 9.1, palette.woodDark, 0, -0.04, 0, 0.025);
  for (let i = 0; i < 19; i += 1) {
    const plank = box(room, 0.619, 0.075, 8.9, i % 4 === 0 ? palette.floorAlt : palette.floor, -5.62 + i * 0.625, 0.035, 0);
    plank.castShadow = false;
    for (let joint = 0; joint < 2; joint += 1) {
      const z = -2.5 + joint * 4.1 + (i % 3) * 0.45;
      box(room, 0.619, 0.002, 0.014, palette.woodDark, plank.position.x, 0.074, z).castShadow = false;
    }
  }
  box(room, 12.05, 4.3, 0.17, palette.wall, 0, 2.16, -4.45);
  box(room, 0.17, 4.3, 9.05, palette.wall, -5.95, 2.16, 0);
  box(room, 12.2, 0.13, 0.25, palette.wallTrim, 0, 4.34, -4.45);
  box(room, 0.25, 0.13, 9.18, palette.wallTrim, -5.95, 4.34, 0);
  box(room, 11.9, 0.16, 0.12, palette.wallTrim, 0, 0.18, -4.32);
  box(room, 0.12, 0.16, 8.95, palette.wallTrim, -5.82, 0.18, 0);
  // Thin vertical seams give the otherwise quiet walls an intentional scale.
  for (let i = 0; i < 9; i += 1) {
    box(room, 0.018, 4.08, 0.012, palette.wallTrim, -5.45 + i * 1.32, 2.18, -4.353).castShadow = false;
  }
  const frontPlaque = labelTexture('ERNST’S WORKSHOP', 'INDEPENDENT DEVELOPER  /  PHILIPPINES');
  flatTexture(room, 2.88, 0.36, frontPlaque, 2.5, -0.27, 4.706);
  // Quiet brass corner fasteners on the front face of the base.
  [ -5.65, 5.65 ].forEach((x) => {
    const fastener = cylinder(room, 0.045, 0.045, 0.018, palette.woodLight, x, -0.27, 4.715, 12);
    fastener.rotation.x = Math.PI / 2;
  });

  // Woven rug and its inset border, visible in the central breathing space.
  softBox(room, 4.45, 0.025, 3.55, palette.rug, -0.15, 0.095, 1.14, 0.008);
  for (const x of [-2.25, 1.95]) box(room, 0.035, 0.008, 3.3, palette.rugStripe, x, 0.112, 1.14);
  for (const z of [-0.4, 2.68]) box(room, 4.23, 0.008, 0.035, palette.rugStripe, -0.15, 0.112, z);
  for (let i = 0; i < 13; i += 1) {
    for (const z of [-0.68, 2.97]) box(room, 0.045, 0.015, 0.16, palette.cream, -2.07 + i * 0.32, 0.101, z);
  }

  function plant(parent, x, y, z, size = 1, pot = palette.orange) {
    const value = group(parent, x, y, z);
    value.scale.setScalar(size);
    cylinder(value, 0.29, 0.22, 0.46, pot, 0, 0.25, 0);
    cylinder(value, 0.3, 0.3, 0.06, pot, 0, 0.48, 0);
    cylinder(value, 0.255, 0.255, 0.025, palette.woodDark, 0, 0.505, 0);
    cylinder(value, 0.025, 0.035, 0.86, palette.leaf, 0, 0.88, 0, 8);
    for (let i = 0; i < 9; i += 1) {
      const angle = i * 2.4;
      const leaf = sphere(value, 0.24, i % 3 ? palette.leaf : palette.leafLight,
        Math.cos(angle) * 0.24, 0.67 + i * 0.085, Math.sin(angle) * 0.24);
      leaf.scale.set(0.48, 1.15, 0.8);
      leaf.rotation.z = Math.cos(angle) * 0.7;
      leaf.rotation.x = Math.sin(angle) * 0.7;
    }
    return value;
  }

  function desk(parent, w, depth, x = 0, z = 0) {
    softBox(parent, w, 0.17, depth, palette.wood, x, 1.65, z, 0.05);
    box(parent, w - 0.18, 0.11, depth - 0.12, palette.woodDark, x, 1.51, z);
    for (const dx of [-w / 2 + 0.21, w / 2 - 0.21]) {
      for (const dz of [-depth / 2 + 0.17, depth / 2 - 0.17]) {
        box(parent, 0.12, 1.42, 0.12, palette.dark, x + dx, 0.8, z + dz);
      }
    }
    box(parent, w - 0.4, 0.08, 0.08, palette.dark, x, 0.48, z - depth / 2 + 0.17);
  }

  function notebook(parent, x, y, z, color = palette.orange, rotation = 0) {
    const value = group(parent, x, y, z);
    value.rotation.y = rotation;
    softBox(value, 0.48, 0.065, 0.65, color, 0, 0, 0, 0.018);
    box(value, 0.41, 0.035, 0.58, palette.paper, 0.022, 0, 0);
    box(value, 0.032, 0.006, 0.58, palette.cream, 0.14, 0.037, 0);
    return value;
  }

  function mug(parent, x, y, z, color = palette.cream) {
    cylinder(parent, 0.14, 0.12, 0.23, color, x, y + 0.115, z);
    cylinder(parent, 0.115, 0.115, 0.01, palette.woodDark, x, y + 0.235, z);
    const handle = mesh(new THREE.TorusGeometry(0.09, 0.026, 6, 12), color, parent, x + 0.155, y + 0.135, z);
    handle.rotation.y = 0.3;
  }

  function deskLamp(parent, x, z) {
    cylinder(parent, 0.19, 0.22, 0.045, palette.dark, x, 1.77, z);
    const lowerArm = box(parent, 0.055, 0.63, 0.055, palette.dark, x + 0.08, 2.08, z);
    lowerArm.rotation.z = -0.25;
    const upperArm = box(parent, 0.055, 0.46, 0.055, palette.dark, x - 0.03, 2.56, z);
    upperArm.rotation.z = 0.7;
    const shade = cylinder(parent, 0.1, 0.26, 0.28, palette.orange, x - 0.2, 2.69, z);
    shade.rotation.z = -0.15;
    cylinder(parent, 0.218, 0.218, 0.01, palette.warmLight, x - 0.18, 2.55, z);
  }

  function indicator(parent, id, x, y, z) {
    const value = stations.get(id);
    cylinder(parent, 0.1, 0.1, 0.055, palette.dark, x, y, z);
    cylinder(parent, 0.065, 0.065, 0.012, value.lampMat, x, y + 0.032, z);
  }

  // Profile: a generous dual-screen desk, mechanical keyboard, and worn chair.
  const profile = station('profile', 0.2, -2.9, [0, 3.55, 0.1], [0, 1.8, 0.3]);
  desk(profile, 3.7, 1.28);
  const codeScreen = texture((ctx, w, h) => {
    ctx.fillStyle = '#1c2b27'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#33483d'; ctx.fillRect(0, 0, w, 43);
    ['#d49b75', '#d4c48d', '#92b89a'].forEach((color, i) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(25 + i * 24, 22, 6, 0, Math.PI * 2); ctx.fill();
    });
    words(ctx, 'hello, I’m Ernst.', 42, 123, 43, '#d5e8c7', 700);
    words(ctx, 'I build things that help.', 44, 171, 25, '#92b19c');
    words(ctx, 'const developer = {', 44, 243, 24, '#b9c3dd');
    words(ctx, '  craft: "thoughtful software",', 44, 284, 22, '#b1d5ac');
    words(ctx, '  basedIn: "Philippines",', 44, 325, 22, '#b1d5ac');
    words(ctx, '  always: "building"', 44, 366, 22, '#b1d5ac');
    words(ctx, '};', 44, 407, 24, '#b9c3dd');
    roundedRect(ctx, 45, 453, 11, 11, 5, '#9bddaa');
    words(ctx, 'OPEN TO GOOD CONVERSATIONS', 71, 464, 17, '#9db29f');
  });
  const screenBody = softBox(profile, 1.97, 1.34, 0.12, palette.black, -0.25, 2.58, -0.23, 0.04);
  flatTexture(profile, 1.82, 1.2, codeScreen, -0.25, 2.6, -0.163);
  box(profile, 0.12, 0.29, 0.1, palette.dark, -0.25, 1.83, -0.25);
  softBox(profile, 0.65, 0.04, 0.35, palette.dark, -0.25, 1.76, -0.2, 0.01);
  screenBody.rotation.y = 0;
  const miniScreen = group(profile, 1.04, 2.34, -0.13);
  miniScreen.rotation.y = -0.19;
  softBox(miniScreen, 0.7, 0.97, 0.1, palette.black, 0, 0, 0, 0.025);
  const sideTexture = texture((ctx, w, h) => {
    ctx.fillStyle = '#a1bb9e'; ctx.fillRect(0, 0, w, h);
    words(ctx, 'BUILD.', 28, 90, 49, '#263c30', 700);
    words(ctx, 'SHIP.', 28, 150, 49, '#263c30', 700);
    words(ctx, 'REPEAT.', 28, 210, 40, '#263c30', 700);
    for (let i = 0; i < 7; i += 1) roundedRect(ctx, 30, 270 + i * 24, 70 + ((i * 33) % 160), 9, 4, '#799e7f');
  }, 320, 480);
  flatTexture(miniScreen, 0.6, 0.85, sideTexture, 0, 0.01, 0.056);
  box(profile, 0.08, 0.2, 0.08, palette.dark, 1.04, 1.82, -0.13);
  softBox(profile, 1.0, 0.055, 0.34, palette.cream, -0.25, 1.77, 0.35, 0.018);
  for (let row = 0; row < 3; row += 1) {
    for (let key = 0; key < 11; key += 1) {
      box(profile, 0.061, 0.017, 0.057, (row === 0 && key === 0) ? palette.orange : palette.gray,
        -0.65 + key * 0.08, 1.806, 0.255 + row * 0.085);
    }
  }
  box(profile, 0.28, 0.017, 0.04, palette.gray, -0.24, 1.806, 0.46);
  softBox(profile, 0.19, 0.07, 0.27, palette.cream, 0.49, 1.79, 0.37, 0.025);
  mug(profile, 1.5, 1.74, 0.36, palette.orange);
  plant(profile, -1.5, 1.73, -0.17, 0.55, palette.cream);
  indicator(profile, 'profile', 1.5, 1.75, -0.3);
  // An understated workstation tower beneath the desk.
  softBox(profile, 0.49, 1.08, 0.72, palette.dark, 1.24, 0.64, 0.02, 0.04);
  box(profile, 0.025, 0.74, 0.018, palette.green, 1.41, 0.68, 0.389);
  for (let slot = 0; slot < 6; slot += 1) box(profile, 0.2, 0.015, 0.012, palette.gray, 1.17, 0.34 + slot * 0.065, 0.39);
  const chair = group(profile, -0.12, 0, 1.48);
  chair.rotation.y = -0.2;
  cylinder(chair, 0.07, 0.09, 0.65, palette.dark, 0, 0.58, 0);
  softBox(chair, 0.93, 0.18, 0.86, palette.gray, 0, 0.97, 0, 0.07);
  softBox(chair, 0.94, 0.97, 0.18, palette.gray, 0, 1.52, 0.38, 0.08);
  softBox(chair, 0.72, 0.08, 0.16, palette.rug, 0, 1.3, 0.266, 0.025);
  for (let i = 0; i < 5; i += 1) {
    const arm = group(chair, 0, 0.22, 0);
    arm.rotation.y = (i / 5) * Math.PI * 2;
    box(arm, 0.085, 0.07, 0.55, palette.dark, 0, 0, 0.2);
    sphere(arm, 0.09, palette.black, 0, -0.035, 0.46);
  }
  for (const x of [-0.52, 0.52]) {
    box(chair, 0.065, 0.28, 0.065, palette.dark, x, 1.18, 0.09);
    softBox(chair, 0.14, 0.07, 0.46, palette.black, x, 1.34, 0.04, 0.02);
  }

  // Rew: a phone and three hovering study cards above a little writing desk.
  const rew = station('rew', -3.88, 1.0, [0, 3.7, 0], [0, 1.9, 0]);
  desk(rew, 2.58, 1.65);
  const studyMat = softBox(rew, 1.56, 0.025, 0.97, palette.rug, 0.14, 1.75, 0.12, 0.008);
  studyMat.rotation.y = -0.05;
  const phone = group(rew, 0.03, 2.44, -0.03);
  phone.rotation.x = -0.1;
  phone.rotation.y = 0.22;
  softBox(phone, 0.68, 1.25, 0.11, palette.black, 0, 0, 0, 0.055);
  const rewScreen = texture((ctx, w, h) => {
    ctx.fillStyle = '#f1f1df'; ctx.fillRect(0, 0, w, h);
    words(ctx, 'rew', 33, 87, 56, '#29483c', 700);
    words(ctx, 'A little every day.', 33, 123, 17, '#657b66');
    roundedRect(ctx, 26, 158, w - 52, 183, 18, '#c8dfac');
    words(ctx, 'Keep curious.', 44, 210, 23, '#344f35', 600);
    words(ctx, 'What will you', 44, 254, 18, '#4d684b');
    words(ctx, 'learn today?', 44, 280, 18, '#4d684b');
    roundedRect(ctx, 28, 364, w - 56, 49, 12, '#36583f');
    words(ctx, 'Start studying →', 48, 396, 19, '#eff3dc');
    words(ctx, '12 cards • 5 min', 39, 452, 16, '#798b71');
  }, 320, 560);
  flatTexture(phone, 0.586, 1.12, rewScreen, 0, 0, 0.06);
  softBox(phone, 0.18, 0.032, 0.01, palette.black, 0, 0.528, 0.068, 0.003);
  box(rew, 0.2, 0.11, 0.23, palette.woodDark, 0.03, 1.81, -0.03);
  const flashcards = group(rew, -0.04, 2.85, -0.38);
  for (let i = 0; i < 3; i += 1) {
    const card = group(flashcards, -0.77 + i * 0.72, i === 1 ? 0.47 : 0.18, -0.06);
    card.rotation.z = (1 - i) * 0.14;
    card.rotation.y = 0.1;
    softBox(card, 0.54, 0.36, 0.025, i === 1 ? palette.mint : palette.paper, 0, 0, 0, 0.008);
    for (let line = 0; line < 2; line += 1) box(card, 0.32 - line * 0.09, 0.018, 0.006, palette.gray, -0.03, 0.06 - line * 0.08, 0.018);
    box(card, 0.055, 0.045, 0.007, i === 1 ? palette.leaf : palette.orange, 0.17, -0.09, 0.019);
    animations.push({ kind: 'card', object: card, y: card.position.y, offset: i * 1.9 });
  }
  notebook(rew, -0.7, 1.78, 0.31, palette.orange, -0.2);
  notebook(rew, -0.73, 1.85, 0.33, palette.paper, -0.12);
  const pencil = cylinder(rew, 0.015, 0.015, 0.5, palette.woodDark, -0.69, 1.91, 0.34, 6);
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = 0.25;
  mug(rew, 0.88, 1.74, 0.5);
  deskLamp(rew, 0.93, -0.48);
  indicator(rew, 'rew', -0.94, 1.75, -0.54);
  const stool = group(rew, -0.12, 0, 1.4);
  cylinder(stool, 0.43, 0.43, 0.15, palette.wood, 0, 0.9, 0, 24);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    cylinder(stool, 0.045, 0.05, 0.78, palette.dark, Math.cos(angle) * 0.29, 0.48, Math.sin(angle) * 0.29, 8);
  }

  // TaskSeal: an angled tablet, stacked job folders, a clipboard, and a task pinboard.
  const taskseal = station('taskseal', 3.35, 1.77, [0, 3.35, 0], [0, 1.75, 0]);
  desk(taskseal, 3.0, 1.75);
  softBox(taskseal, 1.72, 0.022, 1.15, palette.dark, -0.15, 1.75, 0.04, 0.008);
  const tablet = group(taskseal, -0.25, 2.34, -0.18);
  tablet.rotation.x = -0.23;
  tablet.rotation.y = -0.13;
  softBox(tablet, 1.31, 0.94, 0.09, palette.black, 0, 0, 0, 0.04);
  const taskScreen = texture((ctx, w, h) => {
    ctx.fillStyle = '#f3ecdd'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8e4d1'; ctx.fillRect(0, 0, w, 91);
    words(ctx, 'TaskSeal', 33, 60, 39, '#2e4539', 700);
    words(ctx, 'Good work. Well documented.', 33, 128, 20, '#7a826f');
    ['Site inspection', 'Capture the details', 'Seal the task'].forEach((label, i) => {
      const y = 169 + i * 79;
      roundedRect(ctx, 29, y, w - 58, 62, 9, '#fffaf0');
      roundedRect(ctx, 44, y + 17, 27, 27, 5, i < 2 ? '#71956c' : '#e4e5d8');
      if (i < 2) words(ctx, '✓', 47, y + 39, 25, '#ffffff');
      words(ctx, label, 89, y + 38, 24, '#465443');
    });
    words(ctx, '2 of 3 complete', 34, 444, 18, '#8a927e');
  }, 640, 480);
  flatTexture(tablet, 1.18, 0.81, taskScreen, 0, 0, 0.051);
  const stand = box(taskseal, 0.28, 0.29, 0.12, palette.gray, -0.25, 1.89, -0.28);
  stand.rotation.x = -0.25;
  notebook(taskseal, 0.98, 1.78, 0.3, palette.orange, 0.1);
  notebook(taskseal, 1.0, 1.85, 0.31, palette.cream, 0.16);
  const clipboard = group(taskseal, -0.68, 1.79, 0.54);
  clipboard.rotation.x = -Math.PI / 2;
  clipboard.rotation.z = -0.1;
  softBox(clipboard, 0.52, 0.66, 0.045, palette.woodDark, 0, 0, 0, 0.015);
  box(clipboard, 0.43, 0.55, 0.008, palette.paper, 0, -0.01, 0.027);
  box(clipboard, 0.18, 0.06, 0.02, palette.gray, 0, 0.28, 0.034);
  for (let i = 0; i < 4; i += 1) {
    box(clipboard, 0.04, 0.04, 0.007, palette.green, -0.14, 0.14 - i * 0.11, 0.034);
    box(clipboard, 0.19, 0.012, 0.007, palette.gray, 0.035, 0.14 - i * 0.11, 0.034);
  }
  // A miniature camera provides a tactile nod to documenting on-site work.
  softBox(taskseal, 0.33, 0.22, 0.18, palette.gray, 0.57, 1.87, 0.58, 0.02);
  const lens = cylinder(taskseal, 0.075, 0.075, 0.08, palette.black, 0.57, 1.87, 0.71, 16);
  lens.rotation.x = Math.PI / 2;
  plant(taskseal, 1.1, 1.73, -0.49, 0.52, palette.cream);
  indicator(taskseal, 'taskseal', -1.16, 1.75, -0.55);
  // Storage under the right-hand desk, with real drawer pulls.
  softBox(taskseal, 0.7, 1.15, 1.0, palette.cream, 1.02, 0.69, 0.04, 0.025);
  for (let i = 0; i < 3; i += 1) {
    box(taskseal, 0.63, 0.31, 0.025, palette.paper, 1.02, 0.33 + i * 0.35, 0.556);
    box(taskseal, 0.2, 0.035, 0.05, palette.woodDark, 1.02, 0.37 + i * 0.35, 0.58);
  }

  // Project shelf: small builds, books, and a collection of ideas in progress.
  const projects = station('projects', 4.14, -3.28, [0.2, 3.78, 0.12], [0, 1.9, 0]);
  const shelfWidth = 2.25;
  for (const x of [-1.03, 1.03]) box(projects, 0.11, 3.22, 0.72, palette.woodDark, x, 1.7, 0);
  for (const y of [0.24, 1.28, 2.32, 3.34]) softBox(projects, shelfWidth, 0.1, 0.78, palette.wood, 0, y, 0, 0.025);
  box(projects, 2.15, 3.1, 0.06, palette.wallTrim, 0, 1.75, -0.37);
  const bookColors = [palette.mint, palette.orange, palette.cream, palette.lavender, palette.gray];
  for (let i = 0; i < 7; i += 1) {
    const book = group(projects, -0.81 + i * 0.16, 0.7, 0.02);
    book.rotation.z = i > 4 ? -0.12 : 0;
    box(book, 0.12, 0.72 + (i % 3) * 0.08, 0.4, bookColors[i % bookColors.length]);
    box(book, 0.075, 0.025, 0.01, palette.paper, 0, 0.17, 0.206);
    box(book, 0.075, 0.014, 0.01, palette.paper, 0, -0.22, 0.206);
  }
  const storage = softBox(projects, 0.54, 0.33, 0.51, palette.gray, 0.66, 0.46, 0.01, 0.025);
  box(projects, 0.16, 0.07, 0.013, palette.paper, 0.66, 0.5, 0.273);
  storage.rotation.y = 0.04;
  // Tiny house on a landscaped plinth.
  softBox(projects, 0.84, 0.07, 0.57, palette.leafLight, -0.52, 1.37, 0, 0.02);
  box(projects, 0.42, 0.33, 0.32, palette.paper, -0.55, 1.56, -0.02);
  const roof = mesh(new THREE.ConeGeometry(0.36, 0.22, 4), palette.orange, projects, -0.55, 1.83, -0.02);
  roof.rotation.y = Math.PI / 4;
  box(projects, 0.11, 0.19, 0.012, palette.woodDark, -0.55, 1.49, 0.147);
  box(projects, 0.07, 0.07, 0.012, palette.blue, -0.41, 1.62, 0.147);
  sphere(projects, 0.12, palette.leaf, -0.2, 1.55, 0.05);
  cylinder(projects, 0.025, 0.025, 0.16, palette.woodDark, -0.2, 1.46, 0.05, 6);
  // Little abstract orbital sculpture, accompanied by a labeled sketch box.
  softBox(projects, 0.55, 0.06, 0.45, palette.cream, 0.56, 1.37, 0.0, 0.015);
  sphere(projects, 0.15, palette.orange, 0.56, 1.68, 0);
  const orbit = mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 28), palette.lavender, projects, 0.56, 1.68, 0);
  orbit.rotation.set(0.2, 0.6, -0.3);
  sphere(projects, 0.065, palette.cream, 0.79, 1.82, 0.01);
  const terminalModel = group(projects, -0.56, 2.41, 0.02);
  softBox(terminalModel, 0.63, 0.45, 0.35, palette.cream, 0, 0.25, 0, 0.025);
  box(terminalModel, 0.48, 0.29, 0.018, palette.dark, 0, 0.26, 0.188);
  box(terminalModel, 0.17, 0.025, 0.01, palette.mint, -0.1, 0.3, 0.2);
  box(terminalModel, 0.09, 0.025, 0.01, palette.mint, -0.14, 0.24, 0.2);
  softBox(terminalModel, 0.62, 0.07, 0.43, palette.gray, 0, 0, 0.07, 0.015);
  plant(projects, 0.55, 2.37, 0.01, 0.57, palette.orange);
  indicator(projects, 'projects', 0.76, 3.41, 0.13);

  // Skills: a practical little rack. Front panels suggest backend and AI tooling.
  const skills = station('skills', -4.45, -2.7, [0.1, 3.78, 0.08], [0, 1.85, 0]);
  softBox(skills, 1.67, 2.89, 1.04, palette.dark, 0, 1.59, 0, 0.065);
  box(skills, 1.48, 2.66, 0.025, palette.black, 0, 1.59, 0.533);
  for (let unit = 0; unit < 4; unit += 1) {
    const y = 0.71 + unit * 0.55;
    softBox(skills, 1.26, 0.4, 0.15, unit === 3 ? palette.rug : palette.gray, 0, y, 0.55, 0.025);
    for (let slit = 0; slit < 5; slit += 1) box(skills, 0.025, 0.18, 0.012, palette.dark, -0.45 + slit * 0.085, y, 0.637);
    for (let light = 0; light < 3; light += 1) box(skills, 0.042, 0.042, 0.016, light === 2 ? palette.orange : palette.bright, 0.22 + light * 0.13, y, 0.64);
    box(skills, 0.48, 0.035, 0.015, palette.cream, -0.13, y + 0.14, 0.64);
  }
  const aiTile = group(skills, -0.15, 3.32, 0.02);
  softBox(aiTile, 0.63, 0.48, 0.58, palette.mint, 0, 0, 0, 0.045);
  const chip = texture((ctx, w, h) => {
    ctx.fillStyle = '#b2d6a8'; ctx.fillRect(0, 0, w, h);
    words(ctx, 'AI', 48, 125, 90, '#2b4935', 700);
  }, 220, 180);
  flatTexture(aiTile, 0.48, 0.33, chip, 0, 0.02, 0.296);
  for (let i = 0; i < 4; i += 1) {
    for (const x of [-0.36, 0.36]) box(aiTile, 0.13, 0.035, 0.035, palette.woodLight, x, -0.1 + i * 0.07, 0);
  }
  indicator(skills, 'skills', 0.52, 3.06, 0.24);
  // A pair of cables falls down the side of the rack.
  [0, 1].forEach((i) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 2.55 - i * 0.3, 0.69),
      new THREE.Vector3(0.95 + i * 0.1, 2.25, 0.7),
      new THREE.Vector3(1.0 + i * 0.08, 0.3, 0.45),
      new THREE.Vector3(0.6, 0.2, 0.1),
    ]);
    mesh(new THREE.TubeGeometry(curve, 18, 0.022, 5, false), i ? palette.orange : palette.woodDark, skills);
  });

  // Objects on the wall make this feel inhabited, without competing with the work.
  const wallArt = group(room, -2.25, 3.18, -4.33);
  softBox(wallArt, 1.08, 1.3, 0.065, palette.woodLight, 0, 0, 0, 0.025);
  const poster = texture((ctx, w, h) => {
    ctx.fillStyle = '#e3dfc9'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#708d70'; ctx.beginPath(); ctx.arc(w / 2, 160, 94, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#bf9875'; ctx.fillRect(66, 161, 188, 52);
    ctx.fillStyle = '#385447'; ctx.fillRect(66, 220, 188, 46);
    words(ctx, 'MAKE SMALL', 49, 319, 27, '#354b3c', 700);
    words(ctx, 'THINGS MATTER.', 37, 353, 23, '#354b3c', 700);
  }, 320, 400);
  flatTexture(wallArt, 0.93, 1.15, poster, 0, 0, 0.039);
  const wallSign = labelTexture('THE WORKSHOP', 'A FEW THINGS I’M BUILDING');
  flatTexture(room, 2.65, 0.62, wallSign, 0.45, 3.72, -4.343);
  const clock = group(room, 2.52, 3.49, -4.28);
  const clockBody = cylinder(clock, 0.32, 0.32, 0.08, palette.wood, 0, 0, 0, 32);
  clockBody.rotation.x = Math.PI / 2;
  const clockFace = cylinder(clock, 0.275, 0.275, 0.012, palette.cream, 0, 0, 0.05, 32);
  clockFace.rotation.x = Math.PI / 2;
  box(clock, 0.025, 0.2, 0.016, palette.dark, 0, 0.075, 0.063);
  const hourHand = box(clock, 0.15, 0.025, 0.016, palette.dark, 0.05, 0.015, 0.066);
  hourHand.rotation.z = -0.45;
  for (const x of [-4.5, 4.5]) {
    box(room, 0.25, 0.4, 0.1, palette.dark, x, 3.95, -4.31);
    box(room, 0.35, 0.09, 0.23, palette.woodLight, x, 3.82, -4.23);
    box(room, 0.25, 0.025, 0.16, palette.warmLight, x, 3.765, -4.2);
  }
  plant(room, -5.08, 0.1, 3.57, 1.3, palette.orange);
  plant(room, 5.19, 0.1, -0.9, 1.15, palette.cream);

  // A real wall-mounted control keeps the way back to the normal portfolio
  // inside the room. Its separate anchor also supports a keyboard-accessible UI.
  const portfolioSwitch = group(room, -5.81, 3.25, 2.6);
  portfolioSwitch.rotation.y = Math.PI / 2;
  portfolioSwitch.userData.stationId = 'portfolio-switch';
  interactive.push(portfolioSwitch);
  const switchFrame = material('#a8d7ad', { emissive: '#7fdb94', emissiveIntensity: 0.12 });
  softBox(portfolioSwitch, 1.9, 1.1, 0.1, switchFrame, 0, 0, 0, 0.045);
  softBox(portfolioSwitch, 1.73, 0.93, 0.04, palette.dark, 0, 0, 0.06, 0.025);
  const switchLabel = texture((ctx, w, h) => {
    ctx.fillStyle = '#24332e';
    ctx.fillRect(0, 0, w, h);
    roundedRect(ctx, 35, 136, 139, 80, 40, '#a8e9af');
    ctx.fillStyle = '#24332e';
    ctx.beginPath();
    ctx.arc(75, 176, 27, 0, Math.PI * 2);
    ctx.fill();
    words(ctx, 'NORMAL', 205, 171, 77, '#eff3dc', 700);
    words(ctx, 'PORTFOLIO', 209, 230, 46, '#a8e9af', 600);
  }, 640, 352);
  flatTexture(portfolioSwitch, 1.66, 0.86, switchLabel, 0, 0, 0.084);
  const switchAnchor = new THREE.Object3D();
  switchAnchor.position.set(0, 0, 0.09);
  portfolioSwitch.add(switchAnchor);

  // The little green companion is a separate click target and has a shy idle hop.
  const companion = group(scene, -0.15, 0.47, 2.1);
  companion.userData.stationId = 'companion';
  interactive.push(companion);
  softBox(companion, 0.6, 0.6, 0.6, palette.green, 0, 0, 0, 0.07);
  softBox(companion, 0.12, 0.16, 0.035, palette.black, -0.135, 0.065, 0.302, 0.01);
  softBox(companion, 0.12, 0.16, 0.035, palette.black, 0.135, 0.065, 0.302, 0.01);
  box(companion, 0.035, 0.045, 0.012, palette.paper, -0.146, 0.102, 0.326);
  box(companion, 0.035, 0.045, 0.012, palette.paper, 0.124, 0.102, 0.326);
  box(companion, 0.12, 0.027, 0.025, palette.dark, 0, -0.11, 0.316);
  softBox(companion, 0.2, 0.08, 0.27, palette.dark, -0.19, -0.3, 0.06, 0.025);
  softBox(companion, 0.2, 0.08, 0.27, palette.dark, 0.19, -0.3, 0.06, 0.025);
  companion.rotation.y = 0.35;

  function updateCamera() {
    const radius = Math.hypot(12, 15);
    camera.position.set(cameraTarget.x + Math.sin(yaw) * radius, cameraTarget.y + 11, cameraTarget.z + Math.cos(yaw) * radius);
    camera.lookAt(cameraTarget);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function projectStations() {
    const entries = [];
    function projectAnchor(anchor, id) {
      anchor.getWorldPosition(projection);
      projection.project(camera);
      entries.push({
        id, x: (projection.x * 0.5 + 0.5) * width,
        y: (-projection.y * 0.5 + 0.5) * height,
        visible: projection.z > -1 && projection.z < 1 && Math.abs(projection.x) < 1.12 && Math.abs(projection.y) < 1.12,
      });
    }
    stations.forEach((value, id) => projectAnchor(value.anchor, id));
    projectAnchor(switchAnchor, 'portfolio-switch');
    onProject(entries);
  }

  function render() {
    if (disposed) return;
    updateCamera();
    renderer.render(scene, camera);
    projectStations();
  }

  function tick(time) {
    animationFrame = 0;
    if (disposed || document.hidden) return;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.06) : 0.016;
    previousTime = time;
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 8);
    cameraTarget.lerp(desiredTarget, smoothing);
    zoom += (desiredZoom - zoom) * smoothing;
    yaw += (desiredYaw - yaw) * smoothing;
    let moving = cameraTarget.distanceToSquared(desiredTarget) > 0.000002 || Math.abs(zoom - desiredZoom) > 0.0002 || Math.abs(yaw - desiredYaw) > 0.0002;
    if (!motionPaused && !reducedMotion) {
      elapsed += delta;
      for (const entry of animations) entry.object.position.y = entry.y + Math.sin(elapsed * 0.95 + entry.offset) * 0.035;
      const idle = Math.max(0, Math.sin(elapsed * 0.7)) ** 9;
      companionReaction = Math.max(0, companionReaction - delta * 1.3);
      companion.position.y = 0.47 + idle * 0.065 + Math.sin(companionReaction * Math.PI) * 0.65;
      companion.rotation.y = 0.35 + Math.sin(elapsed * 0.5) * 0.12 + companionReaction * Math.PI * 2;
      moving = true;
    }
    render();
    if (moving) animationFrame = requestAnimationFrame(tick);
  }

  function requestRender() {
    if (!disposed && !document.hidden && !animationFrame) animationFrame = requestAnimationFrame(tick);
  }

  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const span = Math.max(12.8, 16.65 / aspect);
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    render();
    requestRender();
  }

  function setHighlight(id) {
    hoverId = id;
    switchFrame.emissiveIntensity = id === 'portfolio-switch' ? 0.85 : 0.12;
    hoverLights.forEach((mat, stationId) => {
      mat.emissiveIntensity = stationId === hoverId ? 1.4 : stationId === selectedId ? 0.9 : 0.25;
      stations.get(stationId).outline.visible = stationId === hoverId || stationId === selectedId;
    });
    canvas.style.cursor = pointerDown && pointerDown.dragged ? 'grabbing' : id ? 'pointer' : 'grab';
    requestRender();
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactive, true);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && !object.userData.stationId) object = object.parent;
    return object ? object.userData.stationId : null;
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || pointerDown) return;
    pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, startYaw: desiredYaw, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (pointerDown && pointerDown.id === event.pointerId) {
      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      if (Math.hypot(dx, dy) > 6) pointerDown.dragged = true;
      if (pointerDown.dragged) {
        desiredYaw = THREE.MathUtils.clamp(pointerDown.startYaw - dx * 0.004, 0.18, 1.25);
        setHighlight(null);
        requestRender();
      }
    } else if (event.pointerType !== 'touch') {
      const id = pick(event);
      if (id !== hoverId) setHighlight(id);
    }
  }

  function handlePointerUp(event) {
    if (!pointerDown || pointerDown.id !== event.pointerId) return;
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    // A device may coalesce the whole gesture into down/up, so the release
    // position must also distinguish dragging from selecting a station.
    const wasDragged = pointerDown.dragged || Math.hypot(dx, dy) > 6;
    if (wasDragged) {
      desiredYaw = THREE.MathUtils.clamp(pointerDown.startYaw - dx * 0.004, 0.18, 1.25);
    }
    pointerDown = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!wasDragged) {
      const id = pick(event);
      if (id === 'companion') {
        companionReaction = 1;
        if (reducedMotion || motionPaused) companion.rotation.y += Math.PI / 4;
        onSelect('companion');
      } else if (id === 'portfolio-switch') {
        onSelect(id);
      } else if (id) {
        focusStation(id);
        onSelect(id);
      }
    }
    // Switching views may dispose the canvas synchronously inside onSelect.
    if (disposed) return;
    setHighlight(event.pointerType === 'touch' ? null : pick(event));
    requestRender();
  }

  function handlePointerCancel(event) {
    if (pointerDown && event.pointerId === pointerDown.id) pointerDown = null;
    setHighlight(null);
  }

  function handlePointerLeave() {
    if (!pointerDown) setHighlight(null);
  }

  function handleWheel(event) {
    event.preventDefault();
    desiredZoom = THREE.MathUtils.clamp(desiredZoom - event.deltaY * 0.0012, 0.82, 1.85);
    requestRender();
  }

  function handleVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previousTime = 0;
    } else {
      requestRender();
    }
  }

  function focusStation(id) {
    const value = stations.get(id);
    if (!value) return;
    selectedId = id;
    desiredTarget.copy(homeTarget).lerp(value.target, 0.44);
    desiredZoom = width < 700 ? 1.23 : 1.3;
    setHighlight(hoverId);
    if (reducedMotion) {
      cameraTarget.copy(desiredTarget);
      zoom = desiredZoom;
    }
    requestRender();
  }

  function resetView() {
    selectedId = null;
    desiredTarget.copy(homeTarget);
    desiredZoom = 1;
    desiredYaw = Math.atan2(12, 15);
    setHighlight(null);
    if (reducedMotion) {
      cameraTarget.copy(desiredTarget);
      zoom = desiredZoom;
      yaw = desiredYaw;
    }
    requestRender();
  }

  function setMotionPaused(value) {
    motionPaused = Boolean(value);
    // The UI also calls this when the OS motion preference changes, and offers
    // an explicit Resume control. Keep camera and idle motion in agreement.
    reducedMotion = motionPaused;
    previousTime = 0;
    if (motionPaused) {
      animations.forEach((entry) => { entry.object.position.y = entry.y; });
      companion.position.y = 0.47;
      companion.rotation.y = 0.35;
      companionReaction = 0;
    }
    requestRender();
  }

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('lostpointercapture', handlePointerCancel);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('visibilitychange', handleVisibility);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(canvas);
  else window.addEventListener('resize', resize);
  canvas.style.cursor = 'grab';
  resize();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handleVisibility);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', handlePointerCancel);
    canvas.removeEventListener('lostpointercapture', handlePointerCancel);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
    canvas.removeEventListener('wheel', handleWheel);
    resources.geometries.forEach((value) => value.dispose());
    resources.materials.forEach((value) => value.dispose());
    resources.textures.forEach((value) => value.dispose());
    sun.dispose();
    scene.clear();
    renderer.dispose();
    canvas.style.cursor = '';
  }

  return { focusStation, resetView, setMotionPaused, resize, dispose };
}
