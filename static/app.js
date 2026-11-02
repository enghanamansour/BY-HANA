// by HANA frontend: two steps (my face -> Hno designs), side sections (try it yourself, my looks),
// a floating chat with Hno, light/dark themes and Arabic/English. All talk to the FastAPI backend.

const $ = (id) => document.getElementById(id);
const form = $("look-form");
const face = $("face");
const tr = (ar, en) => I18N.t(ar, en);                         // pick the string for the current language
const pick = (pair) => (pair ? pair[I18N.lang === "en" ? 1 : 0] : "");

// ---------- Vocabularies (Arabic, English) ----------

const REQUIRED = ["skin_type", "skin_tone", "city", "occasion", "budget"];
const FACE_FIELDS = ["skin_tone", "undertone", "hair_color", "face_shape", "jaw", "eye_shape", "eye_color", "lens",
                     "brow_shape", "brow_thickness", "nose", "lips_shape", "coverage"];
const LOOK_TIMEOUT_MS = 150000;
const PHOTO_TIMEOUT_MS = 90000;
const KEYS = { face: "byhana.face", looks: "byhana.looks", bag: "byhana.bag", lang: "byhana.lang", theme: "byhana.theme" };

const TONE_SKIN = { fair: "#F3D9C6", light: "#E9C3A3", medium: "#D1A07A", tan: "#AF7C55", deep: "#7A4E33" };
const HAIR = {
  black: ["#1B1412", "#1E1614"], dark_brown: ["#3A2419", "#2E1D15"], brown: ["#5A3825", "#3E281B"],
  caramel: ["#8A5A34", "#5A3A24"], honey: ["#A57A45", "#6B4B2E"], burgundy: ["#5A1E26", "#3A1C1C"],
};
const TONE = { fair: ["فاتحة جدًا", "very fair"], light: ["فاتحة", "light"], medium: ["حنطية", "medium"],
               tan: ["سمراء", "tan"], deep: ["داكنة", "deep"] };
const EYE = { almond: ["لوزية", "almond"], round: ["واسعة", "round"], narrow: ["ضيقة", "narrow"],
              upturned: ["مسحوبة لفوق", "upturned"], downturned: ["مائلة لتحت", "downturned"], hooded: ["جفن مبطّن", "hooded"] };
const HAIR_NAME = { black: ["أسود", "black"], dark_brown: ["بني غامق", "dark brown"], brown: ["بني", "brown"],
                    caramel: ["كراميل", "caramel"], honey: ["عسلي", "honey"], burgundy: ["عنابي", "burgundy"] };
const STEP = {
  skincare: ["العناية", "Skincare"], primer: ["برايمر", "Primer"], foundation: ["فاونديشن", "Foundation"],
  concealer: ["كونسيلر", "Concealer"], powder: ["بودرة", "Powder"], contour: ["كونتور", "Contour"],
  blush: ["بلشر", "Blush"], highlighter: ["هايلايتر", "Highlighter"], eyeshadow: ["ظلال العيون", "Eyeshadow"],
  eyeliner: ["آيلاينر", "Eyeliner"], mascara: ["ماسكارا", "Mascara"], lashes: ["رموش", "Lashes"],
  brows: ["الحواجب", "Brows"], lips: ["الشفايف", "Lips"], setting_spray: ["مثبت المكياج", "Setting spray"],
};
const BASE = { water: ["مائي", "Water-based"], silicone: ["سيليكون", "Silicone"], oil: ["زيتي", "Oil-based"], powder: ["بودرة", "Powder"] };
const CONF = { high: ["متأكدة", "Sure"], medium: ["غالبًا", "Likely"], low: ["مو متأكدة", "Not sure"] };
const AREA = {
  lips: ["الشفايف", "Lips"], blush: ["البلشر", "Blush"], eyeshadow_lid: ["الجفن", "Lid"],
  eyeshadow_crease: ["الطيّة", "Crease"], eyeliner: ["الآيلاينر", "Liner"], highlighter: ["الهايلايتر", "Highlight"],
};
// Look colour key -> CSS variable on the face. Skin stays the tone she picked, so the face always looks like her.
const FACE_VARS = { lips: "--lips", blush: "--blush", eyeshadow_lid: "--lid", eyeshadow_crease: "--crease",
                    eyeliner: "--liner", highlighter: "--hl" };
const STEP_COLOR = { lips: "lips", blush: "blush", eyeshadow: "eyeshadow_lid", eyeliner: "eyeliner", highlighter: "highlighter" };
const MANUAL_START = { lips: "nude_rose", blush: "soft_pink", eyeshadow_lid: "champagne",
                       eyeshadow_crease: "soft_peach", eyeliner: "brown", highlighter: "champagne" };
const STAGES = [
  ["هنو تشوف بشرتك...", "Hno is reading your skin..."], ["تشيّك على جو مدينتك...", "Checking your city's weather..."],
  ["تقلّب في شنطتك...", "Going through your makeup bag..."], ["تختار الألوان...", "Choosing the colours..."],
  ["ترتب الخطوات...", "Ordering the steps..."], ["تشيّك إن منتجاتك تركب على بعض...", "Checking your products layer well..."],
];

// ---------- State ----------

const state = {
  current: null,   // the look on the mirror: { source: "ai" | "manual", name, colors, look? }
  palette: null,   // curated shades from /api/shades
  manual: {},      // area -> { id, hex, name, name_en }
  bag: [],         // products she owns: { name, step?, base? }
  lastPayload: null,
  stage: 0,
};

// ---------- Helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;  // model output is never injected as HTML
  return node;
}

function icon(name, extra = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `icon ${extra}`.trim());
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

const colourName = (c) => (I18N.lang === "en" ? c.name_en || c.name : c.name);

let toastTimer;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function setBusy(button, on) {
  button.disabled = on;
  button.classList.toggle("loading", on);
}

/** POST JSON to our API. Resolves with the body, or throws an Error with a message for the user. */
async function api(path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lang": I18N.lang },
      body: JSON.stringify({ ...body, lang: I18N.lang }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || tr("صار شي غلط. جربي مرة ثانية.", "Something went wrong. Please try again."));
      err.fields = data?.fields || [];
      throw err;
    }
    if (!data) throw new Error(tr("الرد وصل ناقص. جربي مرة ثانية.", "The reply came back incomplete. Please try again."));
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(tr("الطلب طوّل زيادة. جربي مرة ثانية.", "That took too long. Please try again."));
    if (err instanceof TypeError) throw new Error(tr("ما قدرنا نوصل للموقع. تأكدي من النت وجربي مرة ثانية.", "We couldn't reach the server. Check your connection and try again."));
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Shrink a photo in the browser before upload: faster for Llama and well under the size limit. */
function resizeImage(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error(tr("اختاري صورة.", "Please choose an image.")));
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr("ما قدرنا نقرأ الصورة. جربي صورة ثانية.", "We couldn't read that image. Try another one."))); };
    img.src = url;
  });
}

// ---------- Theme & language ----------

function currentTheme() {
  return document.documentElement.dataset.theme
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
$("theme-toggle").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set(KEYS.theme, next);
});

function setLanguage(lang) {
  I18N.apply(lang);
  store.set(KEYS.lang, lang);
  $("lang-label").textContent = lang === "en" ? "عربي" : "EN";
  $("lang-toggle").setAttribute("aria-label", lang === "en" ? "العربية" : "English");
  // Everything drawn by JavaScript is re-rendered in the new language.
  updateFaceSummary();
  renderBag();
  renderSaved();
  if (state.current) showOnMirror(state.current);
  if (state.current?.look && !$("result").hidden) renderResult(state.current.look);
  if (state.palette) renderManual();
  $("loading-stage").textContent = pick(STAGES[state.stage]);
  updateChatFab();
}
$("lang-toggle").addEventListener("click", () => setLanguage(I18N.lang === "en" ? "ar" : "en"));

// ---------- Navigation: steps and side sections ----------

function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === "manual") openManual();
}
function goTo(name) {
  showTab(name);
  document.querySelector(".flow").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => goTo(b.dataset.goto)));

function markFaceDone(done) {
  document.querySelector('.step[data-tab="face"]').classList.toggle("done", done);
}

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
  updateFaceSummary();
  sync3D();
}

/** Mirror the same face and look onto the 3D head. The 3D model has no hijab, so the drawn face covers that case. */
function sync3D() {
  const portrait = window.Portrait;
  const data = new FormData(form);
  const covered = (data.get("coverage") || "none") !== "none";
  const use3D = portrait?.status === "ready" && !covered;
  $("mirror").classList.toggle("is-3d", use3D);
  // The drawn face is only for hijab/niqab, or if the portrait couldn't load. While loading: neither.
  $("mirror").classList.toggle("use-svg", covered || portrait?.status === "failed");
  if (!use3D) return;
  const f = faceValues();
  const [hair, brow] = HAIR[f.hair_color] || HAIR.black;
  portrait.update({
    skin: TONE_SKIN[f.skin_tone] || TONE_SKIN.medium,
    hair, brow,
    iris: (f.lens && f.lens !== "none" ? LENS[f.lens] : IRIS[f.eye_color]) || IRIS.dark_brown,
    lashes: data.get("lashes") || "natural",
    face: f,   // eye shape, brows, lips, nose, face shape and jaw reshape the portrait
    makeup: state.current ? Object.fromEntries(Object.entries(state.current.colors).map(([k, c]) => [k, c.hex])) : null,
  });
}
window.addEventListener("portrait:ready", sync3D);
window.addEventListener("portrait:failed", sync3D);

function updateFaceSummary() {
  const f = faceValues();
  const lens = f.lens && f.lens !== "none" ? tr(" بعدسة", " with lenses") : "";
  $("face-summary-text").textContent = f.skin_tone
    ? tr(`وجهك: بشرة ${pick(TONE[f.skin_tone])} · عيون ${pick(EYE[f.eye_shape])}${lens} · شعر ${pick(HAIR_NAME[f.hair_color])}`,
        `Your face: ${pick(TONE[f.skin_tone])} skin · ${pick(EYE[f.eye_shape])} eyes${lens} · ${pick(HAIR_NAME[f.hair_color])} hair`)
    : tr("ما حددتي لون بشرتك وملامحك للحين.", "You haven't set your skin tone and features yet.");
}

/** Paint a look onto the face and list its colours under the mirror. */
function showOnMirror(look) {
  state.current = look;
  for (const [key, cssVar] of Object.entries(FACE_VARS)) {
    if (look.colors[key]) face.style.setProperty(cssVar, look.colors[key].hex);
  }
  face.classList.add("made");
  $("palette-title").textContent = look.name ? `${tr("ألوان:", "Colours:")} ${look.name}` : tr("ألوان اللوك", "Look colours");
  const list = $("palette-list");
  list.replaceChildren();
  for (const [key, label] of Object.entries(AREA)) {
    const c = look.colors[key];
    if (!c) continue;
    const li = el("li");
    const dot = el("i");
    dot.style.background = c.hex;
    li.append(dot, el("b", null, colourName(c)), pick(label));
    list.append(li);
  }
  $("palette").hidden = false;
  $("mirror-hint").hidden = true;
  sync3D();
}

function clearMirror() {
  state.current = null;
  face.classList.remove("made");
  Object.values(FACE_VARS).forEach((v) => face.style.removeProperty(v));
  $("palette").hidden = true;
  $("mirror-hint").hidden = false;
  sync3D();
}

// Face inputs live outside the <form> (form="look-form"), so listen on the whole page.
document.addEventListener("change", (e) => {
  if (e.target.form !== form) return;
  updateMirrorBase();
  e.target.closest(".field")?.classList.remove("invalid");
  if (FACE_FIELDS.includes(e.target.name)) $("face-saved-note").hidden = true;
});
form.notes.addEventListener("input", () => { $("notes-count").textContent = form.notes.value.length; });

// ---------- Step 1: save my face ----------

$("save-face").addEventListener("click", () => {
  const f = faceValues();
  if (!f.skin_tone) {
    $("face-error").textContent = tr("اختاري لون بشرتك أول.", "Please choose your skin tone first.");
    $("face-error").hidden = false;
    document.querySelector('.field[data-field="skin_tone"]').classList.add("invalid");
    return;
  }
  $("face-error").hidden = true;
  if (!store.set(KEYS.face, f)) return toast(tr("ما قدرنا نحفظ، المتصفح مانع الحفظ.", "Couldn't save: your browser is blocking storage."));
  $("face-saved-note").hidden = false;
  markFaceDone(true);
  toast(tr("حفظنا وجهك", "Your face is saved"));
  goTo("design");  // straight on to step 2
});

function applySettings(m) {
  for (const [name, value] of Object.entries(m || {})) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  updateMirrorBase();
}

// ---------- Saved looks ----------

function saveCurrent(name) {
  if (!state.current) return;
  const looks = store.get(KEYS.looks, []);
  looks.unshift({
    id: Date.now().toString(36),
    name: name || state.current.name || tr("لوكي", "My look"),
    source: state.current.source,
    savedAt: new Date().toISOString(),
    colors: state.current.colors,
    mirror: { ...faceValues(), lashes: new FormData(form).get("lashes") },
    look: state.current.look || null,
  });
  if (!store.set(KEYS.looks, looks.slice(0, 30))) return toast(tr("ما قدرنا نحفظ، المتصفح مانع الحفظ.", "Couldn't save: your browser is blocking storage."));
  renderSaved();
  toast(tr("حفظنا اللوك في لوكاتي", "Saved to My looks"));
}

function openSaved(item) {
  applySettings(item.mirror);
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
  const looks = store.get(KEYS.looks, []);
  $("saved-count").textContent = looks.length;
  $("saved-empty").hidden = looks.length > 0;
  const list = $("saved-list");
  list.replaceChildren();
  for (const item of looks) {
    const li = el("li");
    const info = el("div", "saved-info");
    const date = new Date(item.savedAt).toLocaleDateString(I18N.lang === "en" ? "en-GB" : "ar-SA", { day: "numeric", month: "long" });
    info.append(el("strong", null, item.name),
                el("span", "saved-meta", `${item.source === "ai" ? tr("من هنو", "By Hno") : tr("تصميمي", "My design")} · ${date}`));
    const dots = el("div", "saved-dots");
    for (const key of Object.keys(AREA)) {
      if (!item.colors[key]) continue;
      const d = el("i");
      d.style.background = item.colors[key].hex;
      d.title = colourName(item.colors[key]);
      dots.append(d);
    }
    info.append(dots);

    const btns = el("div", "actions");
    const open = el("button", "btn primary small");
    open.type = "button";
    open.append(icon("eye"), tr("اعرضي", "View"));
    open.addEventListener("click", () => openSaved(item));
    const del = el("button", "btn ghost small");
    del.type = "button";
    del.append(icon("trash"), tr("حذف", "Delete"));
    del.addEventListener("click", () => {
      store.set(KEYS.looks, store.get(KEYS.looks, []).filter((x) => x.id !== item.id));
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

function addToBag(items) {
  let added = 0;
  for (const item of items) {
    const name = (item.name || "").trim();
    if (name.length < 2 || state.bag.length >= 25) continue;
    if (state.bag.some((b) => b.name.toLowerCase() === name.toLowerCase())) continue;
    state.bag.push({ name, step: item.step || null, base: item.base || null });
    added++;
  }
  store.set(KEYS.bag, state.bag);
  renderBag();
  return added;
}

function renderBag() {
  const list = $("bag-list");
  list.replaceChildren();
  state.bag.forEach((p, i) => {
    const li = el("li");
    li.append(el("bdi", null, p.name));
    if (p.base) li.append(el("span", `tag base-${p.base}`, pick(BASE[p.base])));
    const rm = el("button", "remove");
    rm.type = "button";
    rm.setAttribute("aria-label", `${tr("حذف", "Remove")} ${p.name}`);
    rm.append(icon("x"));
    rm.addEventListener("click", () => {
      state.bag.splice(i, 1);
      store.set(KEYS.bag, state.bag);
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
  bagStatus(tr("هنو تقرأ منتجاتك من الصورة...", "Hno is reading your products from the photo..."), "busy");
  try {
    const image = await resizeImage(file);
    const data = await api("/api/scan", { image }, PHOTO_TIMEOUT_MS);
    const added = addToBag(data.products);
    bagStatus(added
      ? tr(`ضفنا ${added} منتج من الصورة. شيكي على الأسماء واحذفي الغلط.`, `Added ${added} product(s) from the photo. Check the names and remove any mistakes.`)
      : tr("المنتجات اللي بالصورة موجودة في شنطتك من قبل.", "Those products are already in your bag."));
  } catch (err) {
    bagStatus(err.message, "error");
  }
}
$("bag-camera").addEventListener("change", (e) => scanPhoto(e.target));
$("bag-album").addEventListener("change", (e) => scanPhoto(e.target));

// ---------- Step 2: Hno designs a look ----------

let stageTimer = null;

function readForm() {
  const data = new FormData(form);
  const get = (k, fallback = "") => data.get(k) || fallback;
  return {
    skin_type: get("skin_type"), skin_tone: get("skin_tone"), undertone: get("undertone", "unknown"),
    city: get("city"), occasion: get("occasion"), budget: get("budget"), coverage: get("coverage", "none"),
    hair_color: get("hair_color", "black"), lashes: get("lashes", "natural"), finish: get("finish", "any"),
    face_shape: get("face_shape", "oval"), jaw: get("jaw", "defined"), eye_shape: get("eye_shape", "almond"),
    eye_color: get("eye_color", "dark_brown"), lens: get("lens", "none"), brow_shape: get("brow_shape", "arched"),
    brow_thickness: get("brow_thickness", "natural"), nose: get("nose", "medium"), lips_shape: get("lips_shape", "medium"),
    owned_products: state.bag, notes: get("notes").trim(),
  };
}

function markInvalid(fields) {
  document.querySelectorAll(".field[data-field]").forEach((f) => f.classList.toggle("invalid", fields.includes(f.dataset.field)));
}

function setLookLoading(on) {
  setBusy($("submit"), on);
  face.classList.toggle("scanning", on);
  $("mirror").classList.toggle("scanning", on && $("mirror").classList.contains("is-3d"));
  $("loading").hidden = !on;
  clearInterval(stageTimer);
  if (on) {
    state.stage = 0;
    $("loading-stage").textContent = pick(STAGES[0]);
    stageTimer = setInterval(() => {
      state.stage = Math.min(state.stage + 1, STAGES.length - 1);
      $("loading-stage").textContent = pick(STAGES[state.stage]);
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
    if (!look.colors || !Array.isArray(look.products)) throw new Error(tr("الرد وصل ناقص. جربي مرة ثانية.", "The reply came back incomplete. Please try again."));
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
  $("face-summary").classList.toggle("invalid", missing.includes("skin_tone"));
  if (missing.length) {
    err.textContent = missing.includes("skin_tone")
      ? (missing.length === 1
        ? tr("حددي لون بشرتك من خطوة وجهي أول.", "Set your skin tone in the My face step first.")
        : tr("حددي لون بشرتك من خطوة وجهي، وعبّي الخانات اللي باللون الأحمر.", "Set your skin tone in My face, and fill in the fields marked in red."))
      : tr("عبّي الخانات اللي باللون الأحمر لو سمحتي.", "Please fill in the fields marked in red.");
    form.querySelector(".field.invalid, .face-summary.invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  requestLook(payload);
});

$("retry").addEventListener("click", () => state.lastPayload && requestLook(state.lastPayload));
$("again").addEventListener("click", () => {
  $("result").hidden = true;
  clearMirror();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderCompatibility(look) {
  const ok = look.compatibility_ok;
  $("compat").classList.toggle("ok", ok);
  $("compat").classList.toggle("bad", !ok);
  $("compat-icon").querySelector("use").setAttribute("href", ok ? "#i-check-circle" : "#i-alert");
  $("compat-title").textContent = ok
    ? tr("منتجات القاعدة تركب على بعض", "Your base products layer well together")
    : tr("انتبهي: فيه منتجات ما تركب على بعض", "Heads up: some products don't layer well");
  $("compat-note").textContent = ok
    ? tr("البرايمر والفاونديشن والكونسيلر والمثبت من نفس القاعدة، يعني مكياجك ما راح يتكتّل.",
        "Primer, foundation, concealer and setting spray share the same base, so your makeup won't pill.")
    : tr("فيه منتج قاعدته غير عن الباقي. بدّليه بمنتج من نفس قاعدتهم:", "One product has a different base from the rest. Swap it for one that matches:");
  const list = $("compat-list");
  list.replaceChildren();
  for (const w of look.compatibility_warnings) {
    const li = el("li");
    li.append(
      el("strong", null, `${w.product} (${w.base})`),
      el("bdi", "compat-name", w.product_name),
      el("span", "compat-with", `${tr("ما يركب مع:", "Clashes with:")} ${w.conflicts_with.join(tr("، ", ", "))}`),
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
      sw.title = colourName(colour);
      top.append(sw);
    }
    top.append(el("bdi", "step-name", p.name), el("span", "step-cat", pick(STEP[p.step]) || p.step));
    if (p.base) top.append(el("span", `tag base-${p.base}`, pick(BASE[p.base])));
    if (p.owned) {
      const tag = el("span", "tag tag-owned");
      tag.append(icon("bag"), tr("من شنطتك", "From your bag"));
      top.append(tag);
    }
    body.append(top, el("p", "step-how", p.how_to_apply));
    if (p.budget_alternative && !p.owned) body.append(el("p", "step-alt", `${tr("بديل أوفر:", "Cheaper option:")} ${p.budget_alternative}`));
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

// ---------- Side: try it yourself ----------

async function openManual() {
  if (!state.palette) {
    try {
      const res = await fetch("/api/shades");
      if (!res.ok) throw new Error();
      state.palette = await res.json();
    } catch {
      $("manual-areas").replaceChildren(el("p", "form-error", tr("ما قدرنا نحمّل الألوان. حدّثي الصفحة وجربي مرة ثانية.", "Couldn't load the colours. Refresh the page and try again.")));
      return;
    }
  }
  if (!Object.keys(state.manual).length) {
    for (const [area, id] of Object.entries(MANUAL_START)) state.manual[area] = state.palette[area].find((s) => s.id === id);
  }
  renderManual();
  paintManual();
}

function paintManual() {
  const colors = Object.fromEntries(Object.entries(state.manual).map(([k, s]) => [k, { hex: s.hex, name: s.name, name_en: s.name_en }]));
  showOnMirror({ source: "manual", name: $("manual-name").value.trim(), colors });
}

function renderManual() {
  const wrap = $("manual-areas");
  wrap.replaceChildren();
  for (const [area, label] of Object.entries(AREA)) {
    const box = el("div", "area");
    const title = el("p", "area-label", pick(label));
    const chosen = el("span", null, state.manual[area] ? colourName(state.manual[area]) : "");
    title.append(chosen);
    const row = el("div", "swatches");
    for (const shade of state.palette[area]) {
      const b = el("button");
      b.type = "button";
      b.style.background = shade.hex;
      b.title = colourName(shade);
      b.setAttribute("aria-label", `${pick(label)}: ${colourName(shade)}`);
      b.setAttribute("aria-pressed", state.manual[area]?.hex === shade.hex);
      b.addEventListener("click", () => {
        state.manual[area] = shade;
        row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        chosen.textContent = colourName(shade);
        paintManual();
      });
      row.append(b);
    }
    box.append(title, row);
    wrap.append(box);
  }
  wrap.append(lensPicker());
}

/** Coloured lenses, shared with the "my face" step: picking one here checks the same option there. */
const LENS_AR = { none: ["بدون", "None"], honey: ["عسلي", "Honey"], hazel: ["بندقي", "Hazel"],
                  grey: ["رمادي", "Grey"], green: ["أخضر", "Green"], blue: ["أزرق", "Blue"] };
function lensPicker() {
  const box = el("div", "area");
  const current = new FormData(form).get("lens") || "none";
  const title = el("p", "area-label", tr("العدسات", "Lenses"));
  const chosen = el("span", null, pick(LENS_AR[current]));
  title.append(chosen);
  const row = el("div", "swatches");
  for (const [value, label] of Object.entries(LENS_AR)) {
    const b = el("button", value === "none" ? "lens-none" : null, value === "none" ? pick(label) : null);
    b.type = "button";
    if (value !== "none") b.style.background = LENS[value];
    b.title = pick(label);
    b.setAttribute("aria-label", `${tr("العدسات", "Lenses")}: ${pick(label)}`);
    b.setAttribute("aria-pressed", value === current);
    b.addEventListener("click", () => {
      document.querySelector(`input[name="lens"][value="${value}"]`).click();   // updates the face step and the mirror
      row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      chosen.textContent = pick(label);
    });
    row.append(b);
  }
  box.append(title, row);
  return box;
}

$("manual-save").addEventListener("click", () => {
  if (!state.palette) return;
  paintManual();
  saveCurrent($("manual-name").value.trim() || tr("تصميمي", "My design"));
});

// ---------- Floating chat with Hno ----------

const chat = { history: [], image: null, busy: false };
const CHAT_HISTORY_TURNS = 8;

function updateChatFab() {
  const open = !$("chat").hidden;
  $("chat-open").setAttribute("aria-expanded", open);
  $("chat-fab-label").textContent = open ? tr("سكّري", "Close") : tr("اسألي هنو", "Ask Hno");
}

function openChat(open) {
  $("chat").hidden = !open;
  updateChatFab();
  if (open) $("chat-text").focus();
}
$("chat-open").addEventListener("click", () => openChat($("chat").hidden));  // the compact toggles the chat
$("chat-close").addEventListener("click", () => openChat(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chat").hidden) openChat(false); });

function chatBubble(who, ...children) {
  const li = el("li", `msg ${who}`);
  li.append(...children);
  $("chat-log").append(li);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return li;
}

/** Hno's answer: product, tags, answer, how to check, what pairs well / to avoid. */
function answerBubble(ans) {
  const parts = [];
  if (ans.product_name) parts.push(el("bdi", "msg-product", ans.product_name));
  if (ans.base) {
    const tags = el("div", "msg-tags");
    tags.append(el("span", `tag base-${ans.base}`, pick(BASE[ans.base])), el("span", `tag conf-${ans.confidence}`, pick(CONF[ans.confidence])));
    parts.push(tags);
  }
  parts.push(el("p", null, ans.answer));
  if (ans.how_to_check) parts.push(el("p", "msg-check", `${tr("كيف تتأكدين:", "How to check:")} ${ans.how_to_check}`));
  for (const [key, cls, title] of [["pairs_well_with", "good", tr("يمشي مع", "Pairs well with")], ["avoid_with", "bad", tr("لا تحطينه مع", "Avoid with")]]) {
    if (!ans[key]?.length) continue;
    const box = el("div", `msg-list ${cls}`);
    box.append(el("b", null, title), ans[key].join(tr("، ", ", ")));
    parts.push(box);
  }
  return chatBubble("hanu", ...parts);
}

$("chat-photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    chat.image = await resizeImage(file);
    $("chat-attach-img").src = chat.image;
    $("chat-attach").hidden = false;
  } catch (err) {
    chatBubble("hanu err", el("p", null, err.message));
  }
});
$("chat-attach-remove").addEventListener("click", () => { chat.image = null; $("chat-attach").hidden = true; });

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (chat.busy) return;
  const question = $("chat-text").value.trim();
  const image = chat.image;
  if (!question && !image) return $("chat-text").focus();

  const mine = [];
  if (image) { const img = el("img"); img.src = image; img.alt = ""; mine.push(img); }
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
      question, image, history: chat.history.slice(-CHAT_HISTORY_TURNS), owned_products: state.bag,
    }, PHOTO_TIMEOUT_MS);
    waiting.remove();
    answerBubble(ans);
    chat.history.push(
      { role: "user", content: (question || tr("وش هذا المنتج؟", "What is this product?")) + (image ? " [photo]" : "") },
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

const savedFace = store.get(KEYS.face, null);
if (savedFace) {
  applySettings(savedFace);
  $("face-saved-note").hidden = false;
  markFaceDone(true);
}
state.bag = store.get(KEYS.bag, []);
updateMirrorBase();
setLanguage(store.get(KEYS.lang, "ar"));
showTab(savedFace ? "design" : "face");  // first visit: start with step 1
