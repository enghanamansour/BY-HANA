// by HANA frontend: collects the profile, calls /api/look, and paints the result onto the face.

const $ = (id) => document.getElementById(id);
const form = $("look-form");
const face = $("face");
const submitBtn = $("submit");

const REQUIRED = ["skin_type", "skin_tone", "city", "occasion", "budget"];
const REQUEST_TIMEOUT_MS = 120000;

const TONE_SKIN = { fair: "#F3D9C6", light: "#E9C3A3", medium: "#D1A07A", tan: "#AF7C55", deep: "#7A4E33" };

const STEP_AR = {
  skincare: "العناية", primer: "برايمر", foundation: "فاونديشن", concealer: "كونسيلر", powder: "بودرة",
  contour: "كونتور", blush: "بلشر", highlighter: "هايلايتر", eyeshadow: "ظلال العيون", eyeliner: "آيلاينر",
  mascara: "ماسكارا", brows: "الحواجب", lips: "الشفايف", setting_spray: "مثبت المكياج",
};
const BASE_AR = { water: "مائي", silicone: "سيليكون", oil: "زيتي", powder: "بودرة" };
const COLOR_AR = {
  lips: "الشفايف", blush: "البلشر", eyeshadow_lid: "الجفن",
  eyeshadow_crease: "الطيّة", eyeliner: "الآيلاينر", highlighter: "الهايلايتر",
};
// Which palette colour to show next to each product step.
const STEP_COLOR = { lips: "lips", blush: "blush", eyeshadow: "eyeshadow_lid", eyeliner: "eyeliner", highlighter: "highlighter" };
// Llama colour key -> CSS variable on the face. Skin stays the tone she picked, so the face never looks unlike her.
const FACE_VARS = {
  lips: "--lips", blush: "--blush", eyeshadow_lid: "--lid",
  eyeshadow_crease: "--crease", eyeliner: "--liner", highlighter: "--hl",
};

const STAGES = ["نحلل بشرتك...", "نشيّك على جو مدينتك...", "نختار الألوان...", "نرتب المنتجات وخطوات التطبيق...", "نتأكد من توافق المنتجات..."];
let stageTimer = null;
let lastPayload = null;

// ---------- Live mirror preview from the form ----------

function setFaceVar(name, value) {
  face.style.setProperty(name, value);
}

function updatePreview() {
  const data = new FormData(form);
  const tone = data.get("skin_tone");
  if (tone && !face.classList.contains("made")) setFaceVar("--skin", TONE_SKIN[tone]);
  face.dataset.coverage = data.get("coverage") || "none";
}

form.addEventListener("change", (e) => {
  updatePreview();
  const field = e.target.closest(".field");
  if (field) field.classList.remove("invalid");
});

form.notes.addEventListener("input", () => {
  $("notes-count").textContent = form.notes.value.length;
});

// ---------- Validation ----------

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
    notes: (data.get("notes") || "").trim(),
  };
}

function markInvalid(fields) {
  form.querySelectorAll(".field").forEach((el) => {
    el.classList.toggle("invalid", fields.includes(el.dataset.field));
  });
}

function showFormError(message) {
  $("form-error").textContent = message;
  $("form-error").hidden = !message;
}

// ---------- UI states ----------

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle("loading", on);
  submitBtn.querySelector(".btn-label").textContent = on ? "جاري التصميم..." : "صممي لوكي";
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

function showError(message) {
  $("error-message").textContent = message;
  $("error").hidden = false;
  $("error").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetFace() {
  face.classList.remove("made");
  Object.values(FACE_VARS).forEach((v) => face.style.removeProperty(v));
  $("palette").hidden = true;
  $("mirror-hint").hidden = false;
  updatePreview();
}

// ---------- API call ----------

async function requestLook(payload) {
  lastPayload = payload;
  $("error").hidden = true;
  $("result").hidden = true;
  resetFace();
  setLoading(true);
  $("loading").scrollIntoView({ behavior: "smooth", block: "center" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("/api/look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 400 && body?.fields) markInvalid(body.fields);
      throw new Error(body?.error || "صار خطأ غير متوقع. حاولي مرة ثانية.");
    }
    if (!body || !body.colors || !Array.isArray(body.products)) {
      throw new Error("وصلنا رد غير مكتمل. حاولي مرة ثانية.");
    }
    renderResult(body);
  } catch (err) {
    const message = err.name === "AbortError"
      ? "الطلب أخذ وقت أطول من المتوقع. حاولي مرة ثانية."
      : err instanceof TypeError
        ? "ما قدرنا نتصل بالسيرفر. تأكدي من الإنترنت وحاولي مرة ثانية."
        : err.message;
    showError(message);
  } finally {
    clearTimeout(timeout);
    setLoading(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const payload = readForm();
  const missing = REQUIRED.filter((k) => !payload[k]);
  markInvalid(missing);
  if (missing.length) {
    showFormError("فضلًا اختاري الخانات المعلّمة بالأحمر.");
    form.querySelector(".field.invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  showFormError("");
  requestLook(payload);
});

$("retry").addEventListener("click", () => lastPayload && requestLook(lastPayload));
$("again").addEventListener("click", () => {
  $("result").hidden = true;
  resetFace();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---------- Rendering (textContent only: model output is never injected as HTML) ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function paintFace(colors) {
  for (const [key, cssVar] of Object.entries(FACE_VARS)) {
    if (colors[key]) setFaceVar(cssVar, colors[key].hex);
  }
  face.classList.add("made");

  const list = $("palette-list");
  list.replaceChildren();
  for (const [key, label] of Object.entries(COLOR_AR)) {
    if (!colors[key]) continue;
    const li = el("li");
    const dot = el("i");
    dot.style.background = colors[key].hex;
    li.append(dot, el("b", null, colors[key].name), label);
    list.append(li);
  }
  $("palette").hidden = false;
  $("mirror-hint").hidden = true;
}

function renderCompatibility(look) {
  const box = $("compat");
  box.classList.toggle("ok", look.compatibility_ok);
  box.classList.toggle("bad", !look.compatibility_ok);
  $("compat-title").textContent = look.compatibility_ok
    ? "✓ منتجات القاعدة متوافقة"
    : "⚠ انتبهي: فيه منتجات ما تتوافق مع بعض";
  $("compat-note").textContent = look.compatibility_ok
    ? "البرايمر والفاونديشن والكونسيلر والمثبت من نفس القاعدة، فما راح يتكتل المكياج."
    : "لقينا تعارض في قاعدة المنتجات. استبدلي المنتج التالي بمنتج من نفس قاعدة الباقي:";

  const list = $("compat-list");
  list.replaceChildren();
  for (const w of look.compatibility_warnings) {
    const li = el("li");
    li.append(
      el("strong", null, `${w.product} ${w.base}`),
      el("bdi", "compat-name", w.product_name),
      el("span", "compat-with", `يتعارض مع: ${w.conflicts_with.join("، ")}`),
      el("span", "compat-why", w.message),
    );
    list.append(li);
  }
}

function renderSteps(products, colors) {
  const list = $("steps");
  list.replaceChildren();
  for (const p of products) {
    const li = el("li");
    const body = el("div");
    const top = el("div", "step-top");
    const colour = colors[STEP_COLOR[p.step]];
    if (colour) {
      const sw = el("span", "swatch");
      sw.style.background = colour.hex;
      sw.title = colour.name;
      top.append(sw);
    }
    top.append(
      el("span", "step-name", p.name),
      el("span", "step-cat", STEP_AR[p.step] || p.step),
      el("span", `base base-${p.base}`, BASE_AR[p.base] || p.base),
    );
    body.append(top, el("p", "step-how", p.how_to_apply));
    if (p.budget_alternative) body.append(el("p", "step-alt", `بديل أوفر: ${p.budget_alternative}`));
    li.append(body);
    list.append(li);
  }
}

function renderResult(look) {
  paintFace(look.colors);
  $("look-name").textContent = look.look_name;
  $("look-desc").textContent = look.description;
  renderCompatibility(look);
  renderSteps(look.products, look.colors);

  const tips = $("tips");
  tips.replaceChildren(...look.climate_tips.map((t) => el("li", null, t)));

  $("model-tag").textContent = `Powered by ${look.model.split("/").pop()}`;
  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

updatePreview();
