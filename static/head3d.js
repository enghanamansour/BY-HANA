// 3D mirror: the "Angelica" head by NikZava284 (Sketchfab, CC BY 4.0), recoloured and made up live.
// app.js calls window.Head3D.update(look); this module paints skin, brows, lips and makeup into the
// head texture, recolours hair and irises, and renders with three.js. If WebGL is missing or the model
// fails to load, it reports "failed" and the SVG face stays in place.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_URL = "models/head.glb";
const container = document.getElementById("mirror3d");

// ---------- Where things are on the head texture (1024 x 1024, stored upside down) ----------
const TEX = {
  lips: { x0: 400, y0: 370, x1: 625, y1: 485, cx: 512, cy: 430, rx: 96, ry: 40 },
  brows: [{ x0: 290, y0: 692, x1: 480, y1: 742 }, { x0: 544, y0: 692, x1: 734, y1: 742 }],
  skinRef: [[300, 560], [724, 560]],      // cheek samples for the model's own skin colour
  eyes: [{ cx: 388, cy: 660, outer: -1 }, { cx: 636, cy: 660, outer: 1 }],  // outer: which way the outer corner is
  cheeks: [[302, 560], [722, 560]],
  cheekbones: [[300, 612], [724, 612]],
};

const state = { look: null, ready: false };
let renderer, scene, camera, controls, mats = {}, head = {}, hair = {}, iris = {};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Copy a texture's image into a canvas we can repaint, and swap the material to a CanvasTexture. */
function canvasFor(material) {
  const img = material.map.image;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;                       // glTF UV convention
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  material.map = tex;
  material.needsUpdate = true;
  return { canvas, ctx, tex, base: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

function averageAt(data, w, points, r = 10) {
  const sum = [0, 0, 0];
  let n = 0;
  for (const [cx, cy] of points) {
    for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
      const i = (y * w + x) * 4;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
    }
  }
  return sum.map((v) => v / n);
}

/** Soft elliptical blob of colour, used for blush, eyeshadow and highlighter. */
function blob(ctx, x, y, rx, ry, rgb, alpha, mode, rotate = 0) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.6})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Painting ----------

function paintHead(look) {
  const { ctx, canvas, base, tex, skinRef, lipLum } = head;
  const w = canvas.width;
  const out = new ImageData(new Uint8ClampedArray(base.data), w, canvas.height);
  const d = out.data, src = base.data;

  // 1) Skin tone: scale the whole texture toward the chosen tone.
  const target = hexToRgb(look.skin);
  const ratio = target.map((v, i) => Math.min(1.35, Math.max(0.25, v / skinRef[i])));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = src[i] * ratio[0]; d[i + 1] = src[i + 1] * ratio[1]; d[i + 2] = src[i + 2] * ratio[2];
  }

  // 2) Lips: found by redness on the original texture, recoloured with their own light and shade.
  const lip = look.makeup?.lips ? hexToRgb(look.makeup.lips) : null;
  if (lip) {
    const b = TEX.lips;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const i = (y * w + x) * 4;
      const r = src[i], g = src[i + 1], bl = src[i + 2];
      // Red enough to be lip, and inside the lip oval (keeps stray pink skin pixels out).
      const inside = 1 - smooth(0.75, 1, Math.hypot((x - b.cx) / b.rx, (y - b.cy) / b.ry));
      const m = smooth(44, 62, r - (g + bl) / 2) * inside;
      if (!m) continue;
      const shade = Math.min(1, Math.max(0.72, ((r + g + bl) / 3) / lipLum));
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m) + lip[c] * shade * m;
    }
  }

  // 3) Brows: the darker hairs inside the brow boxes take the brow colour.
  const brow = hexToRgb(look.brow);
  for (const b of TEX.brows) {
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const i = (y * w + x) * 4;
      const lum = (src[i] + src[i + 1] + src[i + 2]) / 3;
      // Only clearly darker hairs, not the soft socket shadow around them.
      const m = smooth(30, 62, head.skinLum - lum) * 0.7;
      if (!m) continue;
      const shade = 0.75 + lum / 255;
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m) + Math.min(255, brow[c] * shade + 18) * m;
    }
  }
  ctx.putImageData(out, 0, 0);

  // 4) Makeup layers.
  const mk = look.makeup;
  if (mk) {
    const rgb = (k) => hexToRgb(mk[k]).join(",");
    for (const [x, y] of TEX.cheeks) blob(ctx, x, y, 70, 46, rgb("blush"), 0.42, "multiply");
    for (const e of TEX.eyes) {
      blob(ctx, e.cx + e.outer * 8, e.cy + 36, 86, 16, rgb("eyeshadow_crease"), 0.55, "multiply");
      blob(ctx, e.cx + e.outer * 4, e.cy + 25, 72, 13, rgb("eyeshadow_lid"), 0.85, "multiply");
      // Liner along the upper lash line (towards the brow on this upside-down texture), flicked outward.
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = mk.eyeliner;
      ctx.lineCap = "round";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(e.cx - e.outer * 58, e.cy + 10);
      ctx.quadraticCurveTo(e.cx, e.cy + 22, e.cx + e.outer * 62, e.cy + 14);
      ctx.lineTo(e.cx + e.outer * 82, e.cy + 30);
      ctx.stroke();
      ctx.restore();
    }
    for (const [x, y] of TEX.cheekbones) blob(ctx, x, y, 56, 26, rgb("highlighter"), 0.22, "screen");
    blob(ctx, 512, 600, 16, 46, rgb("highlighter"), 0.16, "screen");
  }
  tex.needsUpdate = true;
}

function paintHair(hex) {
  const { ctx, canvas, base, tex } = hair;
  const out = new ImageData(new Uint8ClampedArray(base.data), canvas.width, canvas.height);
  const d = out.data, src = base.data;
  const c = hexToRgb(hex);
  // The texture is near-black strands; use their brightness as light/shade over the chosen colour.
  for (let i = 0; i < d.length; i += 4) {
    const lum = (src[i] + src[i + 1] + src[i + 2]) / 765;
    const k = 0.55 + lum * 1.6;
    d[i] = c[0] * k; d[i + 1] = c[1] * k; d[i + 2] = c[2] * k;
  }
  ctx.putImageData(out, 0, 0);
  tex.needsUpdate = true;
}

function paintIris(hex) {
  const { ctx, canvas, base, tex } = iris;
  const out = new ImageData(new Uint8ClampedArray(base.data), canvas.width, canvas.height);
  const d = out.data, src = base.data, w = canvas.width, mid = w / 2, s = w / 256;
  const c = hexToRgb(hex);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - mid, y - mid) / s;
    const m = smooth(13, 17, r) * (1 - smooth(34, 42, r));   // ring between pupil and white
    if (!m) continue;
    const i = (y * w + x) * 4;
    // Keep the iris texture's light and shade, brightened a little so dark colours still read under the cornea.
    const lum = (src[i] + src[i + 1] + src[i + 2]) / 3 / 95;
    for (let k = 0; k < 3; k++) d[i + k] = src[i + k] * (1 - m) + Math.min(255, c[k] * Math.min(1.8, lum * 1.25) + 10) * m;
  }
  ctx.putImageData(out, 0, 0);
  tex.needsUpdate = true;
}

function apply() {
  const look = state.look;
  if (!state.ready || !look) return;
  paintHead(look);
  paintHair(look.hair);
  paintIris(look.iris);
  if (mats.lashes) mats.lashes.opacity = { none: 0.55, natural: 0.85, dramatic: 1 }[look.lashes] ?? 0.85;
}

// ---------- Scene ----------

function frame(root) {
  root.updateMatrixWorld(true);
  const headBox = new THREE.Box3().setFromObject(head.mesh);
  const eyeBox = new THREE.Box3().setFromObject(iris.mesh);
  const centre = headBox.getCenter(new THREE.Vector3());
  const eyes = eyeBox.getCenter(new THREE.Vector3());
  const size = headBox.getSize(new THREE.Vector3());
  const front = new THREE.Vector3(eyes.x - centre.x, 0, eyes.z - centre.z).normalize();
  const target = eyes.clone().add(new THREE.Vector3(0, -size.y * 0.08, 0));
  const dist = size.y * 3.1;
  camera.position.copy(target).addScaledVector(front, dist);
  camera.near = dist / 50;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.minDistance = dist * 0.7;
  controls.maxDistance = dist * 1.3;
  controls.update();
}

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    throw new Error("no WebGL");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No filmic tone mapping: it desaturates reds, and the lipstick must match the palette swatch.
  renderer.toneMapping = THREE.NoToneMapping;
  container.append(renderer.domElement);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1e6, 1.1);
  key.position.set(1.5, 2, 3);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x6b4b5a, 0.45));

  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 1000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = Math.PI * 0.36;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.minAzimuthAngle = -Math.PI * 0.4;
  controls.maxAzimuthAngle = Math.PI * 0.4;

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    if (name === "Head") { head.mesh = o; mats.head = o.material; }
    else if (name === "Hair") { hair.mesh = o; mats.hair = o.material; }
    else if (name === "material") { iris.mesh = o; mats.iris = o.material; }
    else if (name === "Eyelashes") { mats.lashes = o.material; o.material.transparent = true; }
    else if (name === "EyeScleraReflect" || name === "MeniscusEye") { o.material.depthWrite = false; }
  });
  if (!head.mesh || !hair.mesh || !iris.mesh) throw new Error("model parts missing");

  Object.assign(head, canvasFor(mats.head));
  head.skinRef = averageAt(head.base.data, head.canvas.width, TEX.skinRef);
  head.skinLum = head.skinRef.reduce((a, b) => a + b) / 3;
  head.lipLum = (() => {
    const [r, g, b] = averageAt(head.base.data, head.canvas.width, [[512, 430]], 12);
    return (r + g + b) / 3;
  })();
  Object.assign(hair, canvasFor(mats.hair));
  mats.hair.color.set(0xffffff);
  mats.hair.roughness = 0.62;          // the original gloss reads as plastic under our lights
  mats.hair.envMapIntensity = 0.45;
  Object.assign(iris, canvasFor(mats.iris));

  scene.add(root);
  frame(root);
  resize();
  new ResizeObserver(resize).observe(container);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  state.ready = true;
  apply();
}

window.Head3D = {
  status: "loading",
  update(look) {
    state.look = look;
    apply();
  },
  /** Painted textures as images, for checking the makeup placement. */
  debugTextures: () => ({ head: head.canvas?.toDataURL("image/jpeg", 0.8), iris: iris.canvas?.toDataURL() }),
};

init().then(() => {
  window.Head3D.status = "ready";
  window.dispatchEvent(new Event("head3d:ready"));
}).catch((err) => {
  console.warn("3D mirror unavailable, using the drawn face:", err);
  window.Head3D.status = "failed";
  window.dispatchEvent(new Event("head3d:failed"));
});
