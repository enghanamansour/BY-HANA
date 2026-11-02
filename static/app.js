// by HANA frontend: four tabs (Hanu designs, try it yourself, ask Hanu, saved looks) sharing one mirror.

const $ = (id) => document.getElementById(id);
const form = $("look-form");
const face = $("face");

// ---------- Vocabularies ----------

const REQUIRED = ["skin_type", "skin_tone", "city", "occasion", "budget"];
// Everything that describes her face; saved together as "my face".
const FACE_FIELDS = ["skin_tone", "undertone", "hair_color", "face_shape", "jaw", "eye_shape", "eye_color", "lens",
                     "brow_shape", "brow_thickness", "nose", "lips_shape", "coverage"];
const FACE_KEY = "byhana.face";
const TONE_AR = { fair: "فاتحة جدًا", light: "فاتحة", medium: "حنطية", tan: "سمراء", deep: "داكنة" };
const EYE_AR = { almond: "لوزية", round: "واسعة", narrow: "ضيقة", upturned: "مسحوبة لفوق", downturned: "مائلة لتحت", hooded: "جفن مبطّن" };
const HAIR_AR = { black: "أسود", dark_brown: "بني غامق", brown: "بني", caramel: "كراميل", honey: "عسلي", burgundy: "عنابي" };
const LOOK_TIMEOUT_MS = 150000;
const PHOTO_TIMEOUT_MS = 90000;

const TONE_SKIN = { fair: "#F3D9C6", light: "#E9C3A3", medium: "#D1A07A", tan: "#AF7C55", deep: "#7A4E33" };
const HAIR = {
  black: ["#1B1412", "#1E1614"], dark_brown: ["#3A2419", "#2E1D15"], brown: ["#5A3825", "#3E281B"],
  caramel: ["#8A5A34", "#5A3A24"], honey: ["#A57A45", "#6B4B2E"], burgundy: ["#5A1E26", "#3A1C1C"],
};
const STEP_AR = {
  skincare: "العناية", primer: "برايمر", foundation: "فاونديشن", concealer: "كونسيلر", powder: "بودرة",
  contour: "كونتور", blush: "بلشر", highlighter: "هايلايتر", eyeshadow: "ظلال العيون", eyeliner: "آيلاينر",
  mascara: "ماسكارا", lashes: "رموش", brows: "الحواجب", lips: "الشفايف", setting_spray: "مثبت المكياج",
};
const BASE_AR = { water: "مائي", silicone: "سيليكون", oil: "زيتي", powder: "بودرة" };
const CONF_AR = { high: "متأكدة", medium: "غالبًا", low: "مو متأكدة" };
const AREA_AR = {
  lips: "الشفايف", blush: "البلشر", eyeshadow_lid: "الجفن",
  eyeshadow_crease: "الطيّة", eyeliner: "الآيلاينر", highlighter: "الهايلايتر",
};
// Look colour key -> CSS variable on the face. Skin stays the tone she picked, so the face always looks like her.
const FACE_VARS = {
  lips: "--lips", blush: "--blush", eyeshadow_lid: "--lid",
  eyeshadow_crease: "--crease", eyeliner: "--liner", highlighter: "--hl",
};
const STEP_COLOR = { lips: "lips", blush: "blush", eyeshadow: "eyeshadow_lid", eyeliner: "eyeliner", highlighter: "highlighter" };
const MANUAL_START = {
  lips: "nude_rose", blush: "soft_pink", eyeshadow_lid: "champagne",
  eyeshadow_crease: "soft_peach", eyeliner: "brown", highlighter: "champagne",
};
const STAGES = ["هنو تشوف بشرتك...", "تشيّك على جو مدينتك...", "تقلّب في شنطتك...", "تختار الألوان...", "ترتب الخطوات...", "تشيّك إن منتجاتك تركب على بعض..."];

// ---------- State ----------

const state = {
  current: null,    // the look shown on the mirror: { source: "ai" | "manual", name, colors, look? }
  palette: null,    // curated shades from /api/shades
  manual: {},       // area -> { id, hex, name }
  bag: [],          // products she owns: { name, step?, base? }
  askImage: null,   // data URL of the photo attached to a question
  lastPayload: null,
};

// ---------- Small helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;  // model output is never injected as HTML
  return node;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

let toastTimer;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function setBusy(button, on, label) {
  button.disabled = on;
  button.classList.toggle("loading", on);
  if (label) button.querySelector(".btn-label").textContent = label;
}

/** POST JSON to our API. Resolves with the body, or throws an Error carrying a user-facing Arabic message. */
async function api(path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || "صار شي غلط. جربي مرة ثانية.");
      err.fields = data?.fields || [];
      throw err;
    }
    if (!data) throw new Error("الرد وصل ناقص. جربي مرة ثانية.");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("الطلب طوّل زيادة. جربي مرة ثانية.");
    if (err instanceof TypeError) throw new Error("ما قدرنا نوصل للموقع. تأكدي من النت وجربي مرة ثانية.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Shrink a photo in the browser before upload: faster for Llama and well under the size limit. */
function resizeImage(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("اختاري صورة."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ما قدرنا نقرأ الصورة. جربي صورة ثانية.")); };
    img.src = url;
  });
}

// ---------- Tabs ----------

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === "manual") openManual();
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
  showTab(b.dataset.goto);
  document.querySelector(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}));

// ---------- Mirror ----------

function faceValues() {
  const data = new FormData(form);
  return Object.fromEntries(FACE_FIELDS.map((k) => [k, data.get(k) || ""]));
}

function updateMirrorBase() {
  const data = new FormData(form);
  drawFace(face, faceValues());
  face.style.setProperty("--skin", TONE_SKIN[data.get("skin_tone")] || TONE_SKIN.medium);
  const [hair, brow] = HAIR[data.get("hair_color")] || HAIR.black;
  face.style.setProperty("--hair", hair);
  face.style.setProperty("--brow", brow);
  face.dataset.coverage = data.get("coverage") || "none";
  face.dataset.lashes = data.get("lashes") || "natural";
  face.dataset.eye = data.get("eye_shape") || "almond";
  updateFaceSummary();
}

function updateFaceSummary() {
  const f = faceValues();
  $("face-summary-text").textContent = f.skin_tone
    ? `وجهك: بشرة ${TONE_AR[f.skin_tone]} · عيون ${EYE_AR[f.eye_shape]}${f.lens && f.lens !== "none" ? " بعدسة" : ""} · شعر ${HAIR_AR[f.hair_color]}`
    : "ما حددتي لون بشرتك وملامحك للحين.";
}

$("save-face").addEventListener("click", () => {
  const f = faceValues();
  if (!f.skin_tone) {
    $("face-error").textContent = "اختاري لون بشرتك أول.";
    $("face-error").hidden = false;
    document.querySelector('.field[data-field="skin_tone"]').classList.add("invalid");
    return;
  }
  $("face-error").hidden = true;
  if (!store.set(FACE_KEY, f)) return toast("ما قدرنا نحفظ، المتصفح مانع الحفظ.");
  $("face-saved-note").hidden = false;
  toast("حفظنا وجهك");
  // Straight on to the next step: designing the look.
  showTab("design");
  document.querySelector(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
});

/** Paint a look onto the face and list its colours under the mirror. */
function showOnMirror(look) {
  state.current = look;
  for (const [key, cssVar] of Object.entries(FACE_VARS)) {
    if (look.colors[key]) face.style.setProperty(cssVar, look.colors[key].hex);
  }
  face.classList.add("made");

  $("palette-title").textContent = look.name ? `ألوان: ${look.name}` : "ألوان اللوك";
  const list = $("palette-list");
  list.replaceChildren();
  for (const [key, label] of Object.entries(AREA_AR)) {
    const c = look.colors[key];
    if (!c) continue;
    const li = el("li");
    const dot = el("i");
    dot.style.background = c.hex;
    li.append(dot, el("b", null, c.name), label);
    list.append(li);
  }
  $("palette").hidden = false;
  $("mirror-hint").hidden = true;
}

function clearMirror() {
  state.current = null;
  face.classList.remove("made");
  Object.values(FACE_VARS).forEach((v) => face.style.removeProperty(v));
  $("palette").hidden = true;
  $("mirror-hint").hidden = false;
}

// Face inputs live outside the <form> (form="look-form"), so listen on the whole page.
document.addEventListener("change", (e) => {
  if (e.target.form !== form) return;
  updateMirrorBase();
  e.target.closest(".field")?.classList.remove("invalid");
  if (FACE_FIELDS.includes(e.target.name)) $("face-saved-note").hidden = true;
});
form.notes.addEventListener("input", () => { $("notes-count").textContent = form.notes.value.length; });

// ---------- Saved looks ----------

const SAVED_KEY = "byhana.looks";

function mirrorSettings() {
  return { ...faceValues(), lashes: new FormData(form).get("lashes") };
}

function saveCurrent(name) {
  if (!state.current) return;
  const looks = store.get(SAVED_KEY, []);
  looks.unshift({
    id: Date.now().toString(36),
    name: name || state.current.name || "لوكي",
    source: state.current.source,
    savedAt: new Date().toISOString(),
    colors: state.current.colors,
    mirror: mirrorSettings(),
    look: state.current.look || null,
  });
  if (!store.set(SAVED_KEY, looks.slice(0, 30))) {
    toast("ما قدرنا نحفظ، المتصفح مانع الحفظ.");
    return;
  }
  renderSaved();
  toast("حفظنا اللوك في لوكاتي");
}

function applyMirrorSettings(m) {
  for (const [name, value] of Object.entries(m || {})) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  updateMirrorBase();
}

function openSaved(item) {
  applyMirrorSettings(item.mirror);
  if (item.look) {
    renderResult(item.look);
    showTab("design");
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    state.manual = Object.fromEntries(Object.entries(item.colors).map(([k, c]) => [k, { ...c }]));
    showTab("manual");
    $("manual-name").value = item.name;
  }
  showOnMirror({ source: item.source, name: item.name, colors: item.colors, look: item.look });
}

function renderSaved() {
  const looks = store.get(SAVED_KEY, []);
  $("saved-count").textContent = looks.length;
  $("saved-empty").hidden = looks.length > 0;
  const list = $("saved-list");
  list.replaceChildren();
  for (const item of looks) {
    const li = el("li");
    const info = el("div", "saved-info");
    const date = new Date(item.savedAt).toLocaleDateString("ar-SA", { day: "numeric", month: "long" });
    info.append(el("strong", null, item.name),
                el("span", "saved-meta", `${item.source === "ai" ? "من هنو" : "تصميمي"} · ${date}`));
    const dots = el("div", "saved-dots");
    for (const key of Object.keys(AREA_AR)) {
      if (!item.colors[key]) continue;
      const d = el("i");
      d.style.background = item.colors[key].hex;
      d.title = item.colors[key].name;
      dots.append(d);
    }
    info.append(dots);

    const btns = el("div", "saved-btns");
    const open = el("button", "btn primary inline", "اعرضي");
    open.type = "button";
    open.addEventListener("click", () => openSaved(item));
    const del = el("button", "btn ghost small", "حذف");
    del.type = "button";
    del.addEventListener("click", () => {
      store.set(SAVED_KEY, store.get(SAVED_KEY, []).filter((x) => x.id !== item.id));
      renderSaved();
    });
    btns.append(open, del);
    li.append(info, btns);
    list.append(li);
  }
}

$("mirror-save").addEventListener("click", () => saveCurrent());
$("save-look").addEventListener("click", () => saveCurrent());

// ---------- Makeup bag ----------

const BAG_KEY = "byhana.bag";

function addToBag(items) {
  let added = 0;
  for (const item of items) {
    const name = (item.name || "").trim();
    if (name.length < 2 || state.bag.length >= 25) continue;
    if (state.bag.some((b) => b.name.toLowerCase() === name.toLowerCase())) continue;
    state.bag.push({ name, step: item.step || null, base: item.base || null });
    added++;
  }
  store.set(BAG_KEY, state.bag);
  renderBag();
  return added;
}

function renderBag() {
  const list = $("bag-list");
  list.replaceChildren();
  state.bag.forEach((p, i) => {
    const li = el("li");
    li.append(el("bdi", null, p.name));
    if (p.base) li.append(el("span", `tag base-${p.base}`, BASE_AR[p.base]));
    const rm = el("button", "remove", "×");
    rm.type = "button";
    rm.setAttribute("aria-label", `حذف ${p.name}`);
    rm.addEventListener("click", () => {
      state.bag.splice(i, 1);
      store.set(BAG_KEY, state.bag);
      renderBag();
    });
    li.append(rm);
    list.append(li);
  });
}

function bagStatus(message, kind) {
  const s = $("bag-status");
  s.replaceChildren();
  s.hidden = !message;
  s.classList.toggle("err", kind === "error");
  if (kind === "busy") s.append(el("span", "spinner"));
  if (message) s.append(message);
}

function addTyped() {
  const input = $("bag-input");
  if (!input.value.trim()) return;
  addToBag([{ name: input.value }]);
  input.value = "";
  input.focus();
}
$("bag-add").addEventListener("click", addTyped);
$("bag-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } });

async function scanPhoto(input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  bagStatus("هنو تقرأ منتجاتك من الصورة...", "busy");
  try {
    const image = await resizeImage(file);
    const data = await api("/api/scan", { image }, PHOTO_TIMEOUT_MS);
    const added = addToBag(data.products);
    bagStatus(added ? `ضفنا ${added} منتج من الصورة. شيكي على الأسماء واحذفي الغلط.` : "المنتجات اللي بالصورة موجودة في شنطتك من قبل.");
  } catch (err) {
    bagStatus(err.message, "error");
  }
}
$("bag-camera").addEventListener("change", (e) => scanPhoto(e.target));
$("bag-album").addEventListener("change", (e) => scanPhoto(e.target));

// ---------- 1) Hanu designs a look ----------

let stageTimer = null;

function readForm() {
  const data = new FormData(form);
  return {
    skin_type: data.get("skin_type") || "",
    skin_tone: data.get("skin_tone") || "",
    undertone: data.get("undertone") || "unknown",
    city: data.get("city") || "",
    occasion: data.get("occasion") || "",
    budget: data.get("budget") || "",
    coverage: data.get("coverage") || "none",
    hair_color: data.get("hair_color") || "black",
    lashes: data.get("lashes") || "natural",
    finish: data.get("finish") || "any",
    face_shape: data.get("face_shape") || "oval",
    jaw: data.get("jaw") || "defined",
    eye_shape: data.get("eye_shape") || "almond",
    eye_color: data.get("eye_color") || "dark_brown",
    lens: data.get("lens") || "none",
    brow_shape: data.get("brow_shape") || "arched",
    brow_thickness: data.get("brow_thickness") || "natural",
    nose: data.get("nose") || "medium",
    lips_shape: data.get("lips_shape") || "medium",
    owned_products: state.bag,
    notes: (data.get("notes") || "").trim(),
  };
}

function markInvalid(fields) {
  document.querySelectorAll(".field[data-field]").forEach((f) => f.classList.toggle("invalid", fields.includes(f.dataset.field)));
}

function setLookLoading(on) {
  setBusy($("submit"), on, on ? "هنو تشتغل على لوكك..." : "خلّي هنو تزبّط لوكك");
  face.classList.toggle("scanning", on);
  $("loading").hidden = !on;
  clearInterval(stageTimer);
  if (on) {
    let i = 0;
    $("loading-stage").textContent = STAGES[0];
    stageTimer = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 1);
      $("loading-stage").textContent = STAGES[i];
    }, 6000);
  }
}

async function requestLook(payload) {
  state.lastPayload = payload;
  $("error").hidden = true;
  $("result").hidden = true;
  clearMirror();
  setLookLoading(true);
  $("loading").scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    const look = await api("/api/look", payload, LOOK_TIMEOUT_MS);
    if (!look.colors || !Array.isArray(look.products)) throw new Error("الرد وصل ناقص. جربي مرة ثانية.");
    renderResult(look);
    showOnMirror({ source: "ai", name: look.look_name, colors: look.colors, look });
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err.fields?.length) markInvalid(err.fields);
    $("error-message").textContent = err.message;
    $("error").hidden = false;
    $("error").scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    setLookLoading(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const payload = readForm();
  const missing = REQUIRED.filter((k) => !payload[k]);
  markInvalid(missing);
  const err = $("form-error");
  err.hidden = !missing.length;
  if (missing.length) {
    if (missing.includes("skin_tone")) {
      // Skin tone lives in the "my face" tab: take her there.
      err.textContent = missing.length === 1
        ? "حددي لون بشرتك من تبويب وجهي أول."
        : "حددي لون بشرتك من تبويب وجهي، وعبّي الخانات اللي باللون الأحمر.";
      $("face-summary").classList.add("invalid");
    } else {
      err.textContent = "عبّي الخانات اللي باللون الأحمر لو سمحتي.";
    }
    form.querySelector(".field.invalid, .face-summary.invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  $("face-summary").classList.remove("invalid");
  requestLook(payload);
});

$("retry").addEventListener("click", () => state.lastPayload && requestLook(state.lastPayload));
$("again").addEventListener("click", () => {
  $("result").hidden = true;
  clearMirror();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderCompatibility(look) {
  const box = $("compat");
  box.classList.toggle("ok", look.compatibility_ok);
  box.classList.toggle("bad", !look.compatibility_ok);
  $("compat-title").textContent = look.compatibility_ok
    ? "منتجات القاعدة تركب على بعض"
    : "انتبهي: فيه منتجات ما تركب على بعض";
  $("compat-note").textContent = look.compatibility_ok
    ? "البرايمر والفاونديشن والكونسيلر والمثبت من نفس القاعدة، يعني مكياجك ما راح يتكتّل."
    : "فيه منتج قاعدته غير عن الباقي. بدّليه بمنتج من نفس قاعدتهم:";
  const list = $("compat-list");
  list.replaceChildren();
  for (const w of look.compatibility_warnings) {
    const li = el("li");
    li.append(
      el("strong", null, `${w.product} ${w.base}`),
      el("bdi", "compat-name", w.product_name),
      el("span", "compat-with", `ما يركب مع: ${w.conflicts_with.join("، ")}`),
      el("span", "compat-why", w.message),
    );
    list.append(li);
  }
}

function renderSteps(products, colors) {
  const list = $("steps");
  list.replaceChildren();
  for (const p of products) {
    const li = el("li", p.owned ? "owned" : null);
    const body = el("div");
    const top = el("div", "step-top");
    const colour = colors[STEP_COLOR[p.step]];
    if (colour) {
      const sw = el("span", "swatch");
      sw.style.background = colour.hex;
      sw.title = colour.name;
      top.append(sw);
    }
    top.append(el("span", "step-name", p.name), el("span", "step-cat", STEP_AR[p.step] || p.step));
    if (p.base) top.append(el("span", `tag base-${p.base}`, BASE_AR[p.base]));
    if (p.owned) top.append(el("span", "tag tag-owned", "من شنطتك"));
    body.append(top, el("p", "step-how", p.how_to_apply));
    if (p.budget_alternative && !p.owned) body.append(el("p", "step-alt", `بديل أوفر: ${p.budget_alternative}`));
    li.append(body);
    list.append(li);
  }
}

function renderResult(look) {
  $("look-name").textContent = look.look_name;
  $("look-desc").textContent = look.description;
  renderCompatibility(look);
  renderSteps(look.products, look.colors);
  $("tips").replaceChildren(...look.climate_tips.map((t) => el("li", null, t)));
  const faceTips = look.face_tips || [];
  $("face-tips-card").hidden = !faceTips.length;
  $("face-tips").replaceChildren(...faceTips.map((t) => el("li", null, t)));
  $("model-tag").textContent = `Powered by ${look.model.split("/").pop()}`;
  $("error").hidden = true;
  $("result").hidden = false;
}

// ---------- 2) Try it yourself ----------

async function openManual() {
  if (!state.palette) {
    try {
      const res = await fetch("/api/shades");
      if (!res.ok) throw new Error();
      state.palette = await res.json();
    } catch {
      $("manual-areas").replaceChildren(el("p", "form-error", "ما قدرنا نحمّل الألوان. حدّثي الصفحة وجربي مرة ثانية."));
      return;
    }
  }
  if (!Object.keys(state.manual).length) {
    for (const [area, id] of Object.entries(MANUAL_START)) {
      state.manual[area] = state.palette[area].find((s) => s.id === id);
    }
  }
  renderManual();
  paintManual();
}

function paintManual() {
  const colors = Object.fromEntries(Object.entries(state.manual).map(([k, s]) => [k, { hex: s.hex, name: s.name }]));
  showOnMirror({ source: "manual", name: $("manual-name").value.trim(), colors });
}

function renderManual() {
  const wrap = $("manual-areas");
  wrap.replaceChildren();
  for (const [area, label] of Object.entries(AREA_AR)) {
    const box = el("div", "area");
    const title = el("p", "area-label", label);
    const chosen = el("span", null, state.manual[area]?.name || "");
    title.append(chosen);
    const row = el("div", "swatches");
    for (const shade of state.palette[area]) {
      const b = el("button");
      b.type = "button";
      b.style.background = shade.hex;
      b.title = shade.name;
      b.setAttribute("aria-label", `${label}: ${shade.name}`);
      b.setAttribute("aria-pressed", state.manual[area]?.hex === shade.hex);
      b.addEventListener("click", () => {
        state.manual[area] = shade;
        row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        chosen.textContent = shade.name;
        paintManual();
      });
      row.append(b);
    }
    box.append(title, row);
    wrap.append(box);
  }
}

$("manual-save").addEventListener("click", () => {
  if (!state.palette) return;
  paintManual();
  saveCurrent($("manual-name").value.trim() || "تصميمي");
});

// ---------- 3) Ask Hanu ----------

async function attachAskPhoto(input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    state.askImage = await resizeImage(file);
    $("ask-img").src = state.askImage;
    $("ask-preview").hidden = false;
    $("ask-form-error").hidden = true;
  } catch (err) {
    $("ask-form-error").textContent = err.message;
    $("ask-form-error").hidden = false;
  }
}
$("ask-camera").addEventListener("change", (e) => attachAskPhoto(e.target));
$("ask-album").addEventListener("change", (e) => attachAskPhoto(e.target));
$("ask-remove").addEventListener("click", () => {
  state.askImage = null;
  $("ask-preview").hidden = true;
});

$("ask-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = $("ask-question").value.trim();
  const formErr = $("ask-form-error");
  if (!question && !state.askImage) {
    formErr.textContent = "اكتبي سؤالك أو حطي صورة المنتج.";
    formErr.hidden = false;
    $("ask-question").closest(".field").classList.add("invalid");
    return;
  }
  formErr.hidden = true;
  $("ask-question").closest(".field").classList.remove("invalid");
  $("ask-error").hidden = true;
  $("ask-answer").hidden = true;
  setBusy($("ask-submit"), true, "هنو تفكر...");
  try {
    const ans = await api("/api/ask", { question, image: state.askImage }, PHOTO_TIMEOUT_MS);
    renderAnswer(ans);
  } catch (err) {
    $("ask-error-message").textContent = err.message;
    $("ask-error").hidden = false;
  } finally {
    setBusy($("ask-submit"), false, "اسألي هنو");
  }
});

function renderAnswer(ans) {
  $("ans-product").textContent = ans.product_name || "رد هنو";
  const tags = $("ans-tags");
  tags.replaceChildren();
  if (ans.step) tags.append(el("span", "tag base-powder", STEP_AR[ans.step] || ans.step));
  if (ans.base) tags.append(el("span", `tag base-${ans.base}`, BASE_AR[ans.base]));
  if (ans.base) tags.append(el("span", `tag conf-${ans.confidence}`, CONF_AR[ans.confidence]));
  $("ans-text").textContent = ans.answer;
  $("ans-check").hidden = !ans.how_to_check;
  $("ans-check").textContent = ans.how_to_check ? `كيف تتأكدين: ${ans.how_to_check}` : "";
  for (const [key, boxId, listId] of [["pairs_well_with", "ans-pairs-box", "ans-pairs"], ["avoid_with", "ans-avoid-box", "ans-avoid"]]) {
    $(boxId).hidden = !ans[key].length;
    $(listId).replaceChildren(...ans[key].map((t) => el("li", null, t)));
  }
  $("ans-model").textContent = `Powered by ${ans.model.split("/").pop()}`;
  $("ask-answer").hidden = false;
  $("ask-answer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Floating chat with Hanu ----------

const chat = { history: [], image: null, busy: false };
const CHAT_HISTORY_TURNS = 8;

function openChat(open) {
  $("chat").hidden = !open;
  $("chat-open").setAttribute("aria-expanded", open);
  if (open) $("chat-text").focus();
}
$("chat-open").addEventListener("click", () => openChat(true));
$("chat-close").addEventListener("click", () => openChat(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chat").hidden) openChat(false); });

function chatBubble(who, ...children) {
  const li = el("li", `msg ${who}`);
  li.append(...children);
  $("chat-log").append(li);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return li;
}

/** Hanu's answer as a chat bubble: product, tags, answer, how to check, what pairs well / avoid. */
function answerBubble(ans) {
  const parts = [];
  if (ans.product_name) parts.push(el("p", "msg-product", ans.product_name));
  if (ans.base) {
    const tags = el("div", "msg-tags");
    tags.append(el("span", `tag base-${ans.base}`, BASE_AR[ans.base]),
                el("span", `tag conf-${ans.confidence}`, CONF_AR[ans.confidence]));
    parts.push(tags);
  }
  parts.push(el("p", null, ans.answer));
  if (ans.how_to_check) parts.push(el("p", "msg-check", `كيف تتأكدين: ${ans.how_to_check}`));
  for (const [key, cls, title] of [["pairs_well_with", "good", "يمشي مع"], ["avoid_with", "bad", "لا تحطينه مع"]]) {
    if (!ans[key]?.length) continue;
    const box = el("div", `msg-list ${cls}`);
    box.append(el("b", null, title), ans[key].join("، "));
    parts.push(box);
  }
  return chatBubble("hanu", ...parts);
}

async function attachChatPhoto(input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    chat.image = await resizeImage(file);
    $("chat-attach-img").src = chat.image;
    $("chat-attach").hidden = false;
  } catch (err) {
    chatBubble("hanu err", el("p", null, err.message));
  }
}
$("chat-photo").addEventListener("change", (e) => attachChatPhoto(e.target));
$("chat-attach-remove").addEventListener("click", () => {
  chat.image = null;
  $("chat-attach").hidden = true;
});

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (chat.busy) return;
  const question = $("chat-text").value.trim();
  const image = chat.image;
  if (!question && !image) return $("chat-text").focus();

  // Show her message right away.
  const mine = [];
  if (image) { const img = el("img"); img.src = image; img.alt = "صورة المنتج"; mine.push(img); }
  if (question) mine.push(el("p", null, question));
  chatBubble("user", ...mine);
  $("chat-text").value = "";
  chat.image = null;
  $("chat-attach").hidden = true;

  chat.busy = true;
  $("chat-send").disabled = true;
  const typing = el("div", "dots");
  typing.append(el("span"), el("span"), el("span"));
  const waiting = chatBubble("hanu", typing);

  try {
    const ans = await api("/api/ask", {
      question, image,
      history: chat.history.slice(-CHAT_HISTORY_TURNS),
      owned_products: state.bag,
    }, PHOTO_TIMEOUT_MS);
    waiting.remove();
    answerBubble(ans);
    chat.history.push(
      { role: "user", content: (question || "وش هذا المنتج؟") + (image ? " [مع صورة]" : "") },
      { role: "assistant", content: ans.answer.slice(0, 1500) },
    );
  } catch (err) {
    waiting.remove();
    chatBubble("hanu err", el("p", null, err.message));
  } finally {
    chat.busy = false;
    $("chat-send").disabled = false;
    $("chat-text").focus();
  }
});

// ---------- Start ----------

const savedFace = store.get(FACE_KEY, null);
if (savedFace) {
  applyMirrorSettings(savedFace);
  $("face-saved-note").hidden = false;
}
state.bag = store.get(BAG_KEY, []);
renderBag();
renderSaved();
updateMirrorBase();
showTab(savedFace ? "design" : "face");  // first visit: start by drawing her face
