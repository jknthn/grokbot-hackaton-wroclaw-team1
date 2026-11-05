/**
 * 3D dining hall. Procedural low-poly guests sit around a round table.
 * The page imports Three from /vendor/three (no build step).
 */
import * as THREE from "three";

const LOOKS = [
  { skin: 0xf0c7a0, hair: 0x1a120c, hairStyle: "short", shirt: 0x7a1e2c, pants: 0x241810, shoes: 0x100c0a, eyes: 0x3d5c3a, extra: "tie", accent: 0x1a120c },
  { skin: 0xc68642, hair: 0x0e0e0e, hairStyle: "long", shirt: 0x1e3d34, pants: 0x2a2418, shoes: 0x14110e, eyes: 0x6a3a1c, extra: "none", accent: 0x8a3030 },
  { skin: 0x8d5524, hair: 0x3a2412, hairStyle: "bun", shirt: 0xc4a15a, pants: 0x3a2418, shoes: 0x1a120c, eyes: 0x2a2418, extra: "glasses", accent: 0x222222 },
  { skin: 0xf3d2b5, hair: 0xb5812f, hairStyle: "bob", shirt: 0x243044, pants: 0x1c1814, shoes: 0x111111, eyes: 0x3a6a8a, extra: "none", accent: 0xc9a227 },
  { skin: 0xe0ac69, hair: 0x2a2a2a, hairStyle: "crop", shirt: 0x8a3030, pants: 0x2c241c, shoes: 0x1a140f, eyes: 0x4a6a32, extra: "mustache", accent: 0x1a120c },
  { skin: 0xa86b3c, hair: 0x141414, hairStyle: "wavy", shirt: 0x3d4a32, pants: 0x241c16, shoes: 0x120e0c, eyes: 0x2c2418, extra: "vest", accent: 0x6e2a28 },
  { skin: 0xd9a066, hair: 0x4a3020, hairStyle: "side", shirt: 0x4a2c38, pants: 0x1e2933, shoes: 0x101010, eyes: 0x6a4a2a, extra: "beard", accent: 0x3a2414 },
  { skin: 0x6b3e26, hair: 0x111111, hairStyle: "bald", shirt: 0x1a2744, pants: 0x2a2118, shoes: 0x0c0c0c, eyes: 0x3a2a1a, extra: "glasses", accent: 0x1a1a1a },
];

const ROOM = { width: 15, depth: 14, height: 4.8 };
const CAM_POS = [0.1, 2.42, 5.35];
const CAM_LOOK = [0, 1.0, -0.45];
const CAM_FOV = 42;

const DAY = { hemi: 0.58, key: 2.7, fill: 1.05, chandelier: 7, fire: 4.5, exposure: 1.12, fog: 0.012 };
const NIGHT = { hemi: 0.045, key: 0.08, fill: 0.12, chandelier: 22, fire: 28, exposure: 0.62, fog: 0.038 };

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 8, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  blob: new THREE.CircleGeometry(0.46, 14),
  youRing: new THREE.TorusGeometry(0.38, 0.015, 6, 24),
  speakerRing: new THREE.TorusGeometry(0.5, 0.022, 6, 28),
  voteRing: new THREE.TorusGeometry(0.6, 0.018, 6, 28),
};

function stub() {
  return {
    available: false,
    sync() {},
    debug() {
      return { available: false, seatCount: 0, seats: [], triangles: 0 };
    },
    projectSeat() {
      return null;
    },
    destroy() {},
  };
}

function makeCanvas(w, h, draw, repeat) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function shade(hex, f) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const s = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${s(r)},${s(g)},${s(b)})`;
}

function woodTexture(baseHex, plankPx, vertical) {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = shade(baseHex, 0.8);
    g.fillRect(0, 0, w, h);
    const span = vertical ? w : h;
    const count = Math.ceil(span / plankPx);
    for (let i = 0; i < count; i++) {
      g.fillStyle = shade(baseHex, 0.75 + ((i * 17) % 7) * 0.045);
      if (vertical) g.fillRect(i * plankPx, 0, plankPx - 3, h);
      else g.fillRect(0, i * plankPx, w, plankPx - 3);
      g.strokeStyle = "rgba(40,22,10,0.35)";
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const o = i * plankPx + 8 + k * (plankPx / 4);
        g.beginPath();
        if (vertical) {
          g.moveTo(o, 0);
          g.bezierCurveTo(o + 3, h * 0.33, o - 3, h * 0.66, o, h);
        } else {
          g.moveTo(0, o);
          g.bezierCurveTo(w * 0.33, o + 3, w * 0.66, o - 2, w, o);
        }
        g.stroke();
      }
    }
  }, true);
}

function panelTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = "#4a3828";
    g.fillRect(0, 0, w, h * 0.52);
    g.fillStyle = "#2c1e14";
    g.fillRect(0, h * 0.52, w, h * 0.48);
    g.strokeStyle = "#8a6a42";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, h * 0.52);
    g.lineTo(w, h * 0.52);
    g.stroke();
    g.lineWidth = 6;
    for (let c = 0; c < 3; c++) {
      const x = 16 + c * (w / 3);
      const pw = w / 3 - 28;
      g.strokeStyle = "#1a100c";
      g.strokeRect(x, h * 0.58, pw, h * 0.34);
      g.strokeStyle = "#6d543c";
      g.lineWidth = 3;
      g.strokeRect(x + 7, h * 0.58 + 7, pw - 14, h * 0.34 - 14);
      g.lineWidth = 6;
    }
    for (let c = 0; c < 4; c++) {
      const x = 14 + c * (w / 4);
      g.strokeStyle = "#2a1c12";
      g.lineWidth = 5;
      g.strokeRect(x, 16, w / 4 - 26, h * 0.52 - 36);
    }
  }, true);
}

function roundWoodTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = "#6b4428";
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(50,24,10,${0.1 + (i % 3) * 0.05})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(cx, cy, 18 + i * 15, 14 + i * 14, 0.15, 0, Math.PI * 2);
      g.stroke();
    }
  }, false);
}

function rugTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = "#6e1e2c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a227";
    g.lineWidth = 16;
    g.strokeRect(36, 36, w - 72, h - 72);
    g.strokeStyle = "#3d1018";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(w / 2, 78);
    g.lineTo(w - 78, h / 2);
    g.lineTo(w / 2, h - 78);
    g.lineTo(78, h / 2);
    g.closePath();
    g.stroke();
  }, false);
}

function skyTexture(night) {
  return makeCanvas(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (night) {
      grd.addColorStop(0, "#070b16");
      grd.addColorStop(1, "#243456");
    } else {
      grd.addColorStop(0, "#7eafd4");
      grd.addColorStop(1, "#f3e4c6");
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    if (night) {
      g.fillStyle = "#f6f1e2";
      g.beginPath();
      g.arc(w * 0.72, h * 0.3, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#e8eef8";
      for (let i = 0; i < 16; i++) {
        g.fillRect((i * 47) % w, (i * 29) % (h * 0.75), 2, 2);
      }
    } else {
      g.fillStyle = "rgba(255,244,210,0.95)";
      g.beginPath();
      g.arc(w * 0.78, h * 0.28, 22, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
}

function paintingTexture() {
  return makeCanvas(256, 320, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#1a3048");
    grd.addColorStop(0.5, "#3d4e3a");
    grd.addColorStop(1, "#1a120c");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#efe6c4";
    g.beginPath();
    g.arc(w * 0.68, h * 0.26, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0d1410";
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(24 + i * 46, h * 0.8);
      g.lineTo(44 + i * 46, h * 0.46);
      g.lineTo(64 + i * 46, h * 0.8);
      g.fill();
    }
  }, false);
}

function std(color, opts = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: opts.map || null,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  material.userData.base = material.color.clone();
  material.userData.baseEmissive = material.emissive.clone();
  material.userData.baseEmissiveIntensity = material.emissiveIntensity;
  return material;
}

function meshBox(parent, w, h, d, x, y, z, material, opts = {}) {
  const mesh = new THREE.Mesh(geo.box, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

function meshCyl(parent, radius, height, x, y, z, material, opts = {}) {
  const mesh = new THREE.Mesh(opts.geometry || geo.cyl, material);
  mesh.scale.set(radius, height, radius);
  mesh.position.set(x, y, z);
  if (opts.rot) mesh.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

function meshSphere(parent, radius, x, y, z, material, opts = {}) {
  const mesh = new THREE.Mesh(geo.sphere, material);
  mesh.scale.setScalar(radius);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function radii(n) {
  if (!n) return { tableR: 1.35, seatR: 1.85, rugR: 2.35 };
  const tableR = n <= 4 ? 1.22 + (n - 1) * 0.08 : 1.12 + n * 0.1;
  return { tableR, seatR: tableR + 0.36, rugR: tableR + 0.92 };
}

function seatAngle(index, count) {
  if (count <= 1) return -Math.PI / 2;
  return -Math.PI / 2 + Math.PI / count + (index / count) * Math.PI * 2;
}

function isNightPhase(phase) {
  return String(phase || "").toLowerCase() === "night";
}

function labelMode(rec) {
  if (!rec.alive) return rec.vote ? "dead-vote" : "dead";
  if (rec.speaker) return "speaker";
  if (rec.vote) return "vote";
  if (rec.you) return "you";
  return "normal";
}

function drawLabel(label, text, mode) {
  const { ctx, canvas, tex } = label;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const dead = mode === "dead" || mode === "dead-vote";
  const bg = mode === "speaker" ? "#e2b84a" : mode === "vote" || mode === "dead-vote" ? "#6e2430" : "#140e0a";
  const edge =
    mode === "speaker" ? "#fff4cc" : mode === "vote" || mode === "dead-vote" ? "#ffb4c0" : mode === "you" ? "#c9a227" : "#5a4030";
  ctx.fillStyle = bg;
  ctx.fillRect(8, 18, w - 16, h - 36);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 24, w - 28, h - 48);
  ctx.fillStyle = mode === "speaker" ? "#1a1008" : dead ? "#9a948c" : "#f5ecd9";
  const name = String(text || "?").trim() || "?";
  let size = 52;
  do {
    ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`;
    if (ctx.measureText(name).width <= w - 72) break;
    size -= 2;
  } while (size > 18);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, w / 2, h / 2 + 2);
  tex.needsUpdate = true;
}

function makeLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  material.userData.ownsMap = true;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.74, 0.185, 1);
  sprite.position.y = 1.68;
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 3;
  return { canvas, ctx, tex, sprite, mode: "" };
}

function paintDead(root, dead) {
  root.traverse((obj) => {
    const material = obj.material;
    if (!material || !material.userData || !material.userData.base || material.userData.noGrey) return;
    if (dead) {
      const hsl = { h: 0, s: 0, l: 0 };
      material.userData.base.getHSL(hsl);
      material.color.setHSL(0, 0, hsl.l * 0.42);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    } else {
      material.color.copy(material.userData.base);
      material.emissive.copy(material.userData.baseEmissive);
      material.emissiveIntensity = material.userData.baseEmissiveIntensity || 0;
    }
  });
}

function addHair(head, style, hairMat) {
  if (style === "long") {
    meshBox(head, 0.32, 0.12, 0.3, 0, 0.16, 0, hairMat);
    meshBox(head, 0.3, 0.4, 0.08, 0, -0.04, -0.16, hairMat);
    return;
  }
  if (style === "bun") {
    meshBox(head, 0.32, 0.08, 0.28, 0, 0.16, 0, hairMat);
    meshSphere(head, 0.09, 0, 0.14, -0.14, hairMat);
    return;
  }
  if (style === "bob") {
    meshBox(head, 0.34, 0.1, 0.3, 0, 0.15, -0.01, hairMat);
    meshBox(head, 0.07, 0.2, 0.22, -0.15, -0.02, -0.02, hairMat);
    meshBox(head, 0.07, 0.2, 0.22, 0.15, -0.02, -0.02, hairMat);
    return;
  }
  if (style === "crop") {
    meshBox(head, 0.31, 0.06, 0.29, 0, 0.17, 0, hairMat);
    return;
  }
  if (style === "wavy") {
    meshBox(head, 0.32, 0.1, 0.3, 0, 0.16, 0, hairMat);
    meshSphere(head, 0.075, -0.14, 0.02, 0.02, hairMat);
    meshSphere(head, 0.075, 0.14, 0.02, 0.02, hairMat);
    return;
  }
  if (style === "side") {
    const swept = meshBox(head, 0.32, 0.09, 0.3, 0.02, 0.16, 0, hairMat);
    swept.rotation.z = -0.35;
    return;
  }
  if (style === "bald") {
    meshBox(head, 0.05, 0.12, 0.16, -0.15, -0.02, 0, hairMat, { cast: false });
    meshBox(head, 0.05, 0.12, 0.16, 0.15, -0.02, 0, hairMat, { cast: false });
    return;
  }
  meshBox(head, 0.32, 0.1, 0.3, 0, 0.16, -0.01, hairMat);
  meshBox(head, 0.3, 0.06, 0.06, 0, 0.1, 0.13, hairMat, { cast: false });
}

function addGlasses(head, material) {
  const group = new THREE.Group();
  group.position.set(0, 0.035, 0.155);
  head.add(group);
  const rimGeo = new THREE.TorusGeometry(0.046, 0.006, 5, 10);
  const left = new THREE.Mesh(rimGeo, material);
  left.position.x = -0.07;
  left.castShadow = false;
  const right = new THREE.Mesh(rimGeo, material);
  right.position.x = 0.07;
  right.castShadow = false;
  group.add(left, right);
  meshBox(group, 0.05, 0.012, 0.012, 0, 0, 0, material, { cast: false });
  meshBox(group, 0.07, 0.01, 0.012, -0.13, 0.01, -0.04, material, { cast: false });
  meshBox(group, 0.07, 0.01, 0.012, 0.13, 0.01, -0.04, material, { cast: false });
}

function seatIdFromObject(obj) {
  let current = obj;
  while (current) {
    if (current.userData && current.userData.seatId != null) return current.userData.seatId;
    current = current.parent;
  }
  return null;
}

export function createTableScene(canvas, hooks = {}) {
  if (!canvas) {
    hooks.onUnavailable?.();
    return stub();
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    console.error(err);
    hooks.onUnavailable?.();
    return stub();
  }
  if (!renderer.getContext()) {
    hooks.onUnavailable?.();
    return stub();
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAY.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a221c);
  scene.fog = new THREE.FogExp2(0x2a221c, DAY.fog);

  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.08, 40);
  camera.position.set(CAM_POS[0], CAM_POS[1], CAM_POS[2]);
  camera.lookAt(CAM_LOOK[0], CAM_LOOK[1], CAM_LOOK[2]);
  let camY = CAM_POS[1];
  let camZ = CAM_POS[2];
  let camLookY = CAM_LOOK[1];

  const floorTex = woodTexture(0x7a5434, 56, false);
  floorTex.repeat.set(4, 3);
  const wallTex = panelTexture();
  wallTex.repeat.set(2, 1);
  const tableTex = roundWoodTexture();
  const rugTex = rugTexture();
  const daySky = skyTexture(false);
  const nightSky = skyTexture(true);
  const artTex = paintingTexture();

  const floorMat = std(0xffffff, { map: floorTex, roughness: 0.78, metalness: 0.04 });
  const wallMat = std(0xffffff, { map: wallTex, roughness: 0.88 });
  const ceilingMat = std(0x3a322a, { roughness: 0.92 });
  const beamMat = std(0x2a1c14, { roughness: 0.8 });
  const baseMat = std(0x1a100c, { roughness: 0.8 });
  const tableSide = std(0x4e301c, { roughness: 0.58 });
  const tableTopMat = std(0xffffff, { map: tableTex, roughness: 0.4, metalness: 0.06 });
  const tableBottom = std(0x3a2418, { roughness: 0.75 });
  const gold = std(0xc9a227, { roughness: 0.32, metalness: 0.78 });
  const drapeMat = std(0x6e1e2c, { roughness: 0.84 });
  const frameMat = std(0x2a1c12, { roughness: 0.7 });
  const stoneMat = std(0x6a645c, { roughness: 0.9 });
  const chainMat = std(0x6a5a40, { roughness: 0.35, metalness: 0.8 });
  const waxMat = std(0xe6d5b4, { roughness: 0.65 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe7b0 });
  bulbMat.userData.noGrey = true;
  const logMat = std(0x3a2414, { roughness: 0.92 });
  const paintingMat = std(0xffffff, { map: artTex, roughness: 0.9 });
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: daySky,
    emissive: 0xffffff,
    emissiveMap: daySky,
    emissiveIntensity: 0.55,
    roughness: 0.15,
    metalness: 0,
  });
  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  blobMat.userData.noGrey = true;
  const youRingMat = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
  const speakerRingMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const voteRingMat = new THREE.MeshBasicMaterial({ color: 0xc4364a });
  youRingMat.userData.noGrey = true;
  speakerRingMat.userData.noGrey = true;
  voteRingMat.userData.noGrey = true;

  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x2a1a12, DAY.hemi);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xfff3dc, DAY.key);
  keyLight.position.set(-2.2, 6.4, -2.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 28;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.03;
  scene.add(keyLight);
  scene.add(keyLight.target);
  keyLight.target.position.set(0, 0.5, -0.4);
  const fillLight = new THREE.DirectionalLight(0xffe6c4, DAY.fill);
  fillLight.position.set(3.2, 3.4, 5.2);
  scene.add(fillLight);
  const fireLight = new THREE.PointLight(0xff6a2a, DAY.fire, 7, 2);
  fireLight.position.set(0, 0.7, -6.15);
  scene.add(fireLight);
  const chandelierLight = new THREE.PointLight(0xffd7a1, DAY.chandelier, 9, 2);

  const hw = ROOM.width / 2;
  const hd = ROOM.depth / 2;
  const H = ROOM.height;

  function addWall(w, h, x, y, z, rotY) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  addWall(ROOM.width + 0.2, H, 0, H / 2, -hd, 0);
  addWall(ROOM.width + 0.2, H, 0, H / 2, hd, Math.PI);
  addWall(ROOM.depth + 0.2, H, -hw, H / 2, 0, Math.PI / 2);
  addWall(ROOM.depth + 0.2, H, hw, H / 2, 0, -Math.PI / 2);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);
  for (let i = -1; i <= 1; i++) {
    meshBox(scene, ROOM.width - 0.6, 0.14, 0.18, 0, H - 0.08, i * 2.15, beamMat);
  }
  meshBox(scene, ROOM.width, 0.16, 0.08, 0, 0.08, -hd + 0.05, baseMat, { cast: false });
  meshBox(scene, ROOM.width, 0.16, 0.08, 0, 0.08, hd - 0.05, baseMat, { cast: false });
  meshBox(scene, 0.08, 0.16, ROOM.depth, -hw + 0.05, 0.08, 0, baseMat, { cast: false });
  meshBox(scene, 0.08, 0.16, ROOM.depth, hw - 0.05, 0.08, 0, baseMat, { cast: false });

  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 28), std(0xffffff, { map: rugTex, roughness: 0.92 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.02;
  rug.receiveShadow = true;
  scene.add(rug);

  const tableGeo = new THREE.CylinderGeometry(1, 1, 1, 28);
  const tableTop = new THREE.Mesh(tableGeo, [tableSide, tableTopMat, tableBottom]);
  tableTop.position.y = 0.74;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);
  const pedestal = meshCyl(scene, 0.18, 0.64, 0, 0.38, 0, tableSide);
  const tableFoot = meshCyl(scene, 0.42, 0.08, 0, 0.06, 0, tableSide);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 32), gold);
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.79;
  inlay.receiveShadow = true;
  scene.add(inlay);

  const candleGroup = new THREE.Group();
  scene.add(candleGroup);
  for (let i = 0; i < 3; i++) {
    const candle = new THREE.Group();
    meshCyl(candle, 0.035, 0.14, 0, 0.1, 0, waxMat, { cast: false });
    meshSphere(candle, 0.03, 0, 0.2, 0, bulbMat, { cast: false });
    candleGroup.add(candle);
  }

  function addWindow(x) {
    const group = new THREE.Group();
    group.position.set(x, 2.2, -hd + 0.12);
    scene.add(group);
    const w = 1.28;
    const h = 1.9;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h - 0.12), paneMat);
    pane.position.z = 0.02;
    pane.castShadow = false;
    group.add(pane);
    meshBox(group, w + 0.08, 0.1, 0.08, 0, h / 2, 0.05, frameMat);
    meshBox(group, w + 0.08, 0.1, 0.08, 0, -h / 2, 0.05, frameMat);
    meshBox(group, 0.1, h, 0.08, -w / 2, 0, 0.05, frameMat);
    meshBox(group, 0.1, h, 0.08, w / 2, 0, 0.05, frameMat);
    meshBox(group, 0.06, h - 0.12, 0.05, 0, 0, 0.06, frameMat, { cast: false });
    meshBox(group, w - 0.12, 0.06, 0.05, 0, 0, 0.06, frameMat, { cast: false });
    meshBox(group, 0.22, h + 0.25, 0.08, -w / 2 - 0.12, 0.05, 0.08, drapeMat);
    meshBox(group, 0.22, h + 0.25, 0.08, w / 2 + 0.12, 0.05, 0.08, drapeMat);
  }
  addWindow(-3.35);
  addWindow(3.35);

  const fireplace = new THREE.Group();
  fireplace.position.set(0, 0, -hd + 0.16);
  scene.add(fireplace);
  meshBox(fireplace, 2.35, 1.7, 0.32, 0, 0.95, 0, stoneMat);
  meshBox(fireplace, 1.15, 0.82, 0.16, 0, 0.62, 0.14, std(0x140c08, { roughness: 1, emissive: 0x2a0c06, emissiveIntensity: 0.4 }));
  meshBox(fireplace, 2.7, 0.12, 0.5, 0, 1.84, 0.08, std(0x3a2414, { roughness: 0.6 }));
  meshBox(fireplace, 2.5, 0.08, 0.72, 0, 0.05, 0.28, stoneMat, { cast: false });
  meshCyl(fireplace, 0.08, 0.7, 0, 0.32, 0.22, logMat, { rot: [0, 0, Math.PI / 2] });
  meshCyl(fireplace, 0.065, 0.58, 0.04, 0.42, 0.24, logMat, { rot: [0.3, 0.2, Math.PI / 2] });

  const flames = [];
  const flameColors = [0xff5a14, 0xffb03a, 0xff6a22];
  flameColors.forEach((color, i) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    material.userData.noGrey = true;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09 - i * 0.012, 0.32, 6), material);
    flame.position.set((i - 1) * 0.16, 0.5, 0.22);
    flame.userData.baseY = flame.scale.y;
    fireplace.add(flame);
    flames.push(flame);
  });

  const frameGroup = new THREE.Group();
  frameGroup.position.set(0, 2.78, -hd + 0.18);
  scene.add(frameGroup);
  meshBox(frameGroup, 1.2, 1.35, 0.06, 0, 0, 0, gold);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.15), paintingMat);
  art.position.z = 0.04;
  frameGroup.add(art);

  const chandelier = new THREE.Group();
  chandelier.position.set(0, 1.78, 0);
  scene.add(chandelier);
  meshCyl(chandelier, 0.02, 3.05, 0, 1.52, 0, chainMat, { cast: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.032, 6, 20), gold);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  chandelier.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.42;
    const z = Math.sin(a) * 0.42;
    meshCyl(chandelier, 0.018, 0.12, x, -0.02, z, waxMat, { cast: false });
    meshSphere(chandelier, 0.032, x, 0.07, z, bulbMat, { cast: false });
  }
  chandelier.add(chandelierLight);
  chandelierLight.position.set(0, -0.05, 0);

  const sideboard = new THREE.Group();
  sideboard.position.set(hw - 0.32, 0, 0.4);
  sideboard.rotation.y = -Math.PI / 2;
  scene.add(sideboard);
  meshBox(sideboard, 2.2, 0.78, 0.48, 0, 0.42, 0, std(0x3a2418, { roughness: 0.62 }));
  meshCyl(sideboard, 0.05, 0.26, -0.45, 0.94, 0.12, std(0x1a3a28, { roughness: 0.35, metalness: 0.15 }), { cast: false });
  meshCyl(sideboard, 0.045, 0.22, -0.2, 0.92, 0.12, std(0x6e1e2c, { roughness: 0.4 }), { cast: false });
  meshCyl(sideboard, 0.04, 0.2, 0.15, 0.91, 0.1, std(0xc9a227, { roughness: 0.3, metalness: 0.5 }), { cast: false });

  const keyDay = new THREE.Color(0xfff3dc);
  const keyNight = new THREE.Color(0x9eb0cc);
  const fillDay = new THREE.Color(0xffe6c4);
  const fillNight = new THREE.Color(0xffb07a);
  const fogDay = new THREE.Color(0x2a221c);
  const fogNight = new THREE.Color(0x07060b);
  const records = new Map();
  const pickRoots = [];
  let phase = "lobby";
  let interactive = false;
  let blend = 0;
  let skyIsNight = false;
  let stopped = false;
  let lastT = 0;
  const t0 = performance.now();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const proj = new THREE.Vector3();

  function placeCandleAndTable(count) {
    const { tableR, rugR } = radii(count);
    tableTop.scale.set(tableR, 0.09, tableR);
    inlay.scale.set(tableR * 0.66, tableR * 0.66, 1);
    rug.scale.set(rugR, rugR, 1);
    tableFoot.scale.set(Math.max(0.38, tableR * 0.32), 0.08, Math.max(0.38, tableR * 0.32));
    candleGroup.children.forEach((candle, i) => {
      const a = (i / candleGroup.children.length) * Math.PI * 2 + 0.4;
      candle.position.set(Math.cos(a) * tableR * 0.42, 0.78, Math.sin(a) * tableR * 0.42);
    });
  }

  function makeRing(parent, geometry, material, y) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  function createCharacter(seatId) {
    const look = LOOKS[Math.abs(seatId) % LOOKS.length];
    const root = new THREE.Group();
    root.userData.seatId = seatId;
    scene.add(root);

    const blob = new THREE.Mesh(geo.blob, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.018;
    blob.castShadow = false;
    root.add(blob);

    const chairWood = std(0x3a2414, { roughness: 0.62 });
    const cushion = std(0x6e1e2c, { roughness: 0.86 });
    meshBox(root, 0.5, 0.07, 0.48, 0, 0.46, 0, chairWood);
    meshBox(root, 0.42, 0.05, 0.4, 0, 0.51, 0.02, cushion);
    meshBox(root, 0.5, 0.62, 0.06, 0, 0.86, -0.24, chairWood);
    meshBox(root, 0.4, 0.4, 0.05, 0, 0.92, -0.2, cushion);
    [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.16],
      [0.18, 0.16],
    ].forEach(([x, z]) => meshBox(root, 0.05, 0.42, 0.05, x, 0.21, z, chairWood));

    const skin = std(look.skin, { roughness: 0.62 });
    const hairMat = std(look.hair, { roughness: 0.55 });
    const shirtMat = std(look.shirt, { roughness: 0.82 });
    const pants = std(look.pants, { roughness: 0.88 });
    const shoes = std(look.shoes, { roughness: 0.5, metalness: 0.08 });
    const mouthMat = std(0x6e3030, { roughness: 0.55 });
    const sclera = std(0xf4f1ea, { roughness: 0.35 });
    const iris = std(look.eyes, { roughness: 0.3 });
    const pupil = std(0x0a0a0a, { roughness: 0.2 });

    const upper = new THREE.Group();
    upper.position.set(0, 0.62, 0.02);
    root.add(upper);
    meshBox(upper, 0.4, 0.44, 0.24, 0, 0.24, 0.02, shirtMat);
    meshCyl(upper, 0.055, 0.1, 0, 0.48, 0.02, skin, { cast: false });
    if (look.extra === "tie") {
      meshBox(upper, 0.055, 0.24, 0.02, 0, 0.16, 0.15, std(look.accent, { roughness: 0.5 }), { cast: false });
    }
    if (look.extra === "vest") {
      meshBox(upper, 0.34, 0.3, 0.03, 0, 0.18, 0.15, std(look.accent, { roughness: 0.78 }), { cast: false });
    }

    function addArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.24 * side, 0.36, 0.02);
      upper.add(shoulder);
      meshBox(shoulder, 0.09, 0.26, 0.09, 0, -0.12, 0.02, shirtMat);
      meshBox(shoulder, 0.075, 0.075, 0.32, 0.01 * side, -0.24, 0.2, skin);
      meshBox(shoulder, 0.08, 0.055, 0.08, 0.01 * side, -0.24, 0.38, skin);
    }
    addArm(-1);
    addArm(1);

    const head = new THREE.Group();
    head.position.set(0, 0.68, 0.02);
    upper.add(head);
    meshBox(head, 0.3, 0.34, 0.28, 0, 0, 0, skin);
    meshBox(head, 0.045, 0.08, 0.05, -0.17, 0, 0, skin, { cast: false });
    meshBox(head, 0.045, 0.08, 0.05, 0.17, 0, 0, skin, { cast: false });
    meshBox(head, 0.05, 0.07, 0.055, 0, -0.01, 0.17, skin, { cast: false });
    const mouth = meshBox(head, 0.11, 0.024, 0.02, 0, -0.09, 0.155, mouthMat, { cast: false });
    mouth.userData.baseY = mouth.scale.y;
    meshBox(head, 0.07, 0.018, 0.02, -0.07, 0.095, 0.15, hairMat, { cast: false, rot: [0, 0, 0.15] });
    meshBox(head, 0.07, 0.018, 0.02, 0.07, 0.095, 0.15, hairMat, { cast: false, rot: [0, 0, -0.15] });
    const eyes = new THREE.Group();
    head.add(eyes);
    [-0.07, 0.07].forEach((x) => {
      meshSphere(eyes, 0.036, x, 0.03, 0.145, sclera, { cast: false });
      meshSphere(eyes, 0.02, x, 0.03, 0.17, iris, { cast: false });
      meshSphere(eyes, 0.01, x, 0.03, 0.186, pupil, { cast: false });
    });
    addHair(head, look.hairStyle, hairMat);
    if (look.extra === "glasses") addGlasses(head, std(look.accent, { roughness: 0.25, metalness: 0.65 }));
    if (look.extra === "mustache") meshBox(head, 0.12, 0.028, 0.03, 0, -0.065, 0.175, hairMat, { cast: false });
    if (look.extra === "beard") meshBox(head, 0.14, 0.08, 0.06, 0, -0.16, 0.12, hairMat, { cast: false });

    [-1, 1].forEach((side) => {
      meshBox(root, 0.13, 0.13, 0.34, 0.09 * side, 0.48, 0.16, pants);
      meshBox(root, 0.12, 0.4, 0.12, 0.09 * side, 0.26, 0.34, pants);
      meshBox(root, 0.12, 0.06, 0.18, 0.09 * side, 0.05, 0.4, shoes);
    });

    const label = makeLabel();
    root.add(label.sprite);
    const rings = {
      you: makeRing(root, geo.youRing, youRingMat, 0.03),
      speaker: makeRing(root, geo.speakerRing, speakerRingMat, 0.034),
      vote: makeRing(root, geo.voteRing, voteRingMat, 0.038),
    };

    return {
      seatId,
      group: root,
      upper,
      head,
      eyes,
      mouth,
      rings,
      label,
      name: null,
      alive: true,
      you: false,
      speaker: false,
      vote: false,
      blinkAt: 0.8 + (seatId % 5) * 0.45,
      blinkUntil: 0,
    };
  }

  function disposeRecord(rec) {
    rec.group.removeFromParent();
    rec.group.traverse((obj) => {
      const material = obj.material;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      list.forEach((entry) => {
        if (entry.userData && entry.userData.ownsMap && entry.map) entry.map.dispose();
        if (entry.userData && entry.userData.base) entry.dispose();
      });
    });
    rec.label.tex.dispose();
  }

  function applyFlags(rec, flags) {
    const nameChanged = rec.name !== flags.name;
    const aliveChanged = rec.alive !== flags.alive;
    rec.name = flags.name;
    rec.alive = flags.alive;
    rec.you = flags.you;
    rec.speaker = flags.speaker;
    rec.vote = flags.vote;
    if (aliveChanged) paintDead(rec.group, !rec.alive);
    const mode = labelMode(rec);
    if (nameChanged || mode !== rec.label.mode) {
      rec.label.mode = mode;
      drawLabel(rec.label, rec.name, mode);
    }
  }

  function placeCharacter(rec, index, count) {
    const { seatR } = radii(count);
    const theta = seatAngle(index, count);
    const x = Math.cos(theta) * seatR;
    const z = Math.sin(theta) * seatR;
    rec.group.position.set(x, 0, z);
    rec.group.rotation.y = Math.atan2(-x, -z);
  }

  function sync(state) {
    phase = state?.phase || "lobby";
    interactive = Boolean(state?.interactive);
    const seats = state?.seats || [];
    const nextIds = new Set(seats.map((seat) => seat.seatId));
    for (const [id, rec] of records) {
      if (!nextIds.has(id)) {
        disposeRecord(rec);
        records.delete(id);
      }
    }
    seats.forEach((seat, index) => {
      let rec = records.get(seat.seatId);
      if (!rec) {
        rec = createCharacter(seat.seatId);
        records.set(seat.seatId, rec);
      }
      placeCharacter(rec, index, seats.length);
      applyFlags(rec, {
        name: seat.name,
        alive: seat.alive !== false,
        you: state.youSeatId === seat.seatId,
        speaker: state.speakerSeatId === seat.seatId,
        vote: state.voteSeatId === seat.seatId,
      });
    });
    placeCandleAndTable(seats.length);
    pickRoots.length = 0;
    for (const rec of records.values()) pickRoots.push(rec.group);
  }

  function damp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
  }

  function updateCharacter(rec, t, dt) {
    const slump = rec.alive ? Math.sin(t * 1.3 + rec.seatId) * 0.02 : 1.05;
    rec.upper.rotation.x = damp(rec.upper.rotation.x, slump, 8, dt);
    const headTilt = rec.alive ? Math.sin(t * 0.8 + rec.seatId) * 0.04 : 0.45;
    rec.head.rotation.x = damp(rec.head.rotation.x, headTilt, 8, dt);

    let eyeScale = 1;
    if (!rec.alive) eyeScale = 0.12;
    else if (t < rec.blinkUntil) eyeScale = 0.1;
    else if (t > rec.blinkAt) {
      rec.blinkUntil = t + 0.12;
      rec.blinkAt = t + 2.6 + (rec.seatId % 4) * 0.5;
    }
    rec.eyes.scale.y = eyeScale;

    const open = rec.speaker && rec.alive ? 1.8 + Math.sin(t * 9) * 0.55 : 1;
    rec.mouth.scale.y = rec.mouth.userData.baseY * open;

    rec.rings.you.visible = Boolean(rec.you);
    rec.rings.vote.visible = Boolean(rec.vote);
    rec.rings.speaker.visible = Boolean(rec.speaker && rec.alive);
    if (rec.rings.speaker.visible) {
      const pulse = 1 + Math.sin(t * 4.5) * 0.07;
      rec.rings.speaker.scale.set(pulse, pulse, pulse);
    } else {
      rec.rings.speaker.scale.set(1, 1, 1);
    }
  }

  function mix(a, b) {
    return a + (b - a) * blend;
  }

  function tick(t) {
    const dt = lastT ? Math.min(0.5, Math.max(0.001, t - lastT)) : 0.016;
    lastT = t;
    const target = isNightPhase(phase) ? 1 : 0;
    blend += (target - blend) * (1 - Math.exp(-6 * dt));
    hemi.intensity = mix(DAY.hemi, NIGHT.hemi);
    keyLight.intensity = mix(DAY.key, NIGHT.key);
    fillLight.intensity = mix(DAY.fill, NIGHT.fill);
    chandelierLight.intensity = mix(DAY.chandelier, NIGHT.chandelier);
    fireLight.intensity = mix(DAY.fire, NIGHT.fire) * (0.88 + Math.sin(t * 11) * 0.12);
    renderer.toneMappingExposure = mix(DAY.exposure, NIGHT.exposure);
    keyLight.color.copy(keyDay).lerp(keyNight, blend);
    fillLight.color.copy(fillDay).lerp(fillNight, blend);
    scene.fog.color.copy(fogDay).lerp(fogNight, blend);
    scene.fog.density = mix(DAY.fog, NIGHT.fog);
    scene.background.copy(scene.fog.color);
    const wantNight = blend > 0.5;
    if (wantNight !== skyIsNight) {
      skyIsNight = wantNight;
      paneMat.map = skyIsNight ? nightSky : daySky;
      paneMat.emissiveMap = paneMat.map;
      paneMat.needsUpdate = true;
    }
    paneMat.emissiveIntensity = mix(0.22, 0.4);
    chandelier.rotation.z = Math.sin(t * 0.55) * 0.012;
    chandelier.rotation.x = Math.cos(t * 0.37) * 0.008;
    flames.forEach((flame, i) => {
      const s = 0.8 + Math.sin(t * 10 + i * 2.1) * 0.22;
      flame.scale.y = flame.userData.baseY * s;
      flame.material.opacity = 0.55 + Math.sin(t * 13 + i) * 0.25;
    });
    for (const rec of records.values()) updateCharacter(rec, t, dt);
    camera.position.x = CAM_POS[0] + Math.sin(t * 0.15) * 0.04;
    camera.position.y = camY + Math.sin(t * 0.11) * 0.015;
    camera.position.z = camZ;
    camera.lookAt(CAM_LOOK[0], camLookY, CAM_LOOK[2]);
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    pointer.x = ((event.clientX - rect.left) / width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  function pick(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickRoots, true);
    if (!hits.length) return null;
    return seatIdFromObject(hits[0].object);
  }

  function onDown(event) {
    if (!interactive) return;
    if (event.button != null && event.button !== 0) return;
    const id = pick(event);
    if (id != null) hooks.onSeatClick?.(id);
  }

  function onMove(event) {
    const id = pick(event);
    canvas.style.cursor = id != null && interactive ? "pointer" : "default";
  }

  function frameCamera(width, height) {
    const aspect = width / Math.max(1, height);
    const short = height < 760;
    const narrow = aspect < 1.15;
    const wide = aspect > 1.6;
    let fov = CAM_FOV;
    camZ = CAM_POS[2];
    camY = CAM_POS[1];
    camLookY = CAM_LOOK[1];
    if (short) {
      fov += 10;
      camZ += 1.05;
      camY += 0.18;
      camLookY -= 0.08;
    } else if (wide) {
      fov += 4;
      camZ += 0.45;
    }
    if (narrow) {
      fov += 6;
      camZ += 0.55;
    }
    camera.fov = fov;
    camera.aspect = aspect;
    camera.position.set(CAM_POS[0], camY, camZ);
    camera.lookAt(CAM_LOOK[0], camLookY, CAM_LOOK[2]);
    camera.updateProjectionMatrix();
  }

  function onResize() {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    frameCamera(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
  }

  function onContextLost(event) {
    event.preventDefault();
    stopped = true;
    hooks.onUnavailable?.();
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("resize", onResize);
  canvas.addEventListener("webglcontextlost", onContextLost);
  onResize();
  placeCandleAndTable(0);

  function frame() {
    if (stopped) return;
    requestAnimationFrame(frame);
    tick((performance.now() - t0) / 1000);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function sampleBrightness() {
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const buf = new Uint8Array(4);
    let bright = 0;
    for (let iy = 1; iy <= 3; iy++) {
      for (let ix = 1; ix <= 3; ix++) {
        gl.readPixels(
          Math.floor((width * ix) / 4),
          Math.floor((height * iy) / 4),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buf
        );
        if (buf[0] + buf[1] + buf[2] > 30) bright += 1;
      }
    }
    return bright;
  }

  function debug() {
    renderer.render(scene, camera);
    const seats = [];
    for (const rec of records.values()) {
      seats.push({
        seatId: rec.seatId,
        name: rec.name,
        alive: rec.alive,
        speaker: rec.speaker,
        vote: rec.vote,
        you: rec.you,
        slump: Number(rec.upper.rotation.x.toFixed(3)),
      });
    }
    return {
      available: true,
      phase,
      night: isNightPhase(phase),
      blend: Number(blend.toFixed(3)),
      seatCount: records.size,
      seats,
      triangles: renderer.info.render.triangles,
      lights: {
        key: Number(keyLight.intensity.toFixed(3)),
        fire: Number(fireLight.intensity.toFixed(3)),
        chandelier: Number(chandelierLight.intensity.toFixed(3)),
        exposure: Number(renderer.toneMappingExposure.toFixed(3)),
      },
      brightSamples: sampleBrightness(),
    };
  }

  function projectSeat(seatId) {
    const rec = records.get(seatId);
    if (!rec) return null;
    rec.head.getWorldPosition(proj);
    proj.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (proj.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-proj.y * 0.5 + 0.5) * rect.height,
      behind: proj.z > 1,
    };
  }

  function destroy() {
    stopped = true;
    window.removeEventListener("resize", onResize);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    renderer.dispose();
  }

  return { available: true, sync, debug, projectSeat, destroy };
}
