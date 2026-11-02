// Draws the mirror face from her features (face shape, jaw, eyes, brows, nose, lips).
// Every path is computed here; index.html only holds empty elements tagged with data-part.

const FACE_DEFAULTS = {
  face_shape: "oval", jaw: "defined", eye_shape: "almond", eye_color: "dark_brown",
  brow_shape: "arched", brow_thickness: "thick", nose: "medium", lips_shape: "full",
};

const IRIS = {
  dark_brown: "#2A170F", brown: "#4A2B1A", hazel: "#6B5A2E", honey: "#8A5A2B", green: "#4F6B4A", grey: "#6C7A80",
  blue: "#4A6E8C",
};
// Coloured contact lenses are brighter than natural irises.
const LENS = { honey: "#A87A3E", hazel: "#7E6E3A", grey: "#8A969C", green: "#5E8A5A", blue: "#5A86AE" };

// Half-widths and heights of the face outline. tw = forehead, w = cheekbones, jw = jaw corner.
const SHAPES = {
  oval:   { tw: 74, w: 102, jw: 80, jawY: 318, chinY: 384, cw: 24 },
  round:  { tw: 82, w: 110, jw: 94, jawY: 312, chinY: 370, cw: 36 },
  square: { tw: 82, w: 104, jw: 98, jawY: 322, chinY: 378, cw: 42 },
  heart:  { tw: 86, w: 106, jw: 68, jawY: 322, chinY: 384, cw: 16 },
  long:   { tw: 70, w: 94,  jw: 76, jawY: 334, chinY: 402, cw: 26 },
};

// Left eye: outer corner x, tilt of the outer corner (negative = lifted), opening above and below the lash line.
const EYES = {
  almond:     { ox: 124, tilt: -6,  top: 20, bottom: 14, lid: 26 },
  round:      { ox: 122, tilt: -2,  top: 26, bottom: 20, lid: 26 },
  narrow:     { ox: 126, tilt: -4,  top: 13, bottom: 9,  lid: 24 },
  upturned:   { ox: 124, tilt: -13, top: 19, bottom: 12, lid: 26 },
  downturned: { ox: 124, tilt: 7,   top: 19, bottom: 14, lid: 24 },
  hooded:     { ox: 124, tilt: -4,  top: 16, bottom: 13, lid: 12 },
};

const BROWS = {
  arched:   { px: 140, py: 165, tailY: 190 },
  straight: { px: 146, py: 175, tailY: 183 },
  soft:     { px: 146, py: 170, tailY: 188 },
};
const BROW_THICK = { thin: 5, natural: 8, thick: 11 };
const NOSE_W = { slim: 12, medium: 16, wide: 22 };
const LIPS = { thin: { lw: 34, uh: 8, lh: 14 }, medium: { lw: 37, uh: 12, lh: 20 }, full: { lw: 40, uh: 16, lh: 28 } };

const R = (x) => 200 + x;
const L = (x) => 200 - x;
const n1 = (v) => Math.round(v * 10) / 10;

function facePath(f) {
  const s = SHAPES[f.face_shape] || SHAPES.oval;
  const { tw, w, jw, jawY, chinY, cw } = s;
  const lead = f.jaw === "sharp" ? 0 : 8;
  let d = `M200,92 C${R(tw)},92 ${R(w)},140 ${R(w)},214 C${R(w)},${jawY - 60} ${R(jw + lead)},${jawY - 24} ${R(jw)},${jawY} `;
  if (f.jaw === "soft") {
    d += `C${R(jw - 4)},${jawY + 30} ${R(cw + 20)},${chinY} 200,${chinY} C${L(cw + 20)},${chinY} ${L(jw - 4)},${jawY + 30} ${L(jw)},${jawY} `;
  } else if (f.jaw === "sharp") {
    d += `L${R(cw)},${chinY - 4} Q200,${chinY + 2} ${L(cw)},${chinY - 4} L${L(jw)},${jawY} `;
  } else {
    d += `C${R(jw - 8)},${jawY + 22} ${R(cw + 6)},${chinY - 6} ${R(cw)},${chinY - 3} Q200,${chinY + 3} ${L(cw)},${chinY - 3} C${L(cw + 6)},${chinY - 6} ${L(jw - 8)},${jawY + 22} ${L(jw)},${jawY} `;
  }
  d += `C${L(jw + lead)},${jawY - 24} ${L(w)},${jawY - 60} ${L(w)},214 C${L(w)},140 ${L(tw)},92 200,92 Z`;
  return d;
}

/** Lashes as short strokes along the upper lash line, leaning toward the outer corner. */
function lashPath(O, C, I, len, count) {
  let d = "";
  for (let k = 0; k < count; k++) {
    const t = 0.1 + (0.82 * k) / (count - 1);
    const u = 1 - t;
    const px = u * u * O[0] + 2 * u * t * C[0] + t * t * I[0];
    const py = u * u * O[1] + 2 * u * t * C[1] + t * t * I[1];
    const dx = 2 * u * (C[0] - O[0]) + 2 * t * (I[0] - C[0]);
    const dy = 2 * u * (C[1] - O[1]) + 2 * t * (I[1] - C[1]);
    let nx = dy, ny = -dx;                       // normal pointing up
    const m = Math.hypot(nx, ny);
    nx = nx / m - 0.55 * u;                       // lean outward, more at the outer corner
    ny = ny / m;
    const m2 = Math.hypot(nx, ny);
    const l = len * (0.7 + 0.5 * u);
    const tx = (nx / m2) * l, ty = (ny / m2) * l;
    // Curl each lash: the control point sits a little toward the outer corner of the straight stroke.
    d += `M${n1(px)},${n1(py)} q${n1(tx * 0.2 - l * 0.22)},${n1(ty * 0.7)} ${n1(tx)},${n1(ty)} `;
  }
  return d.trim();
}

function eyeParts(f) {
  const e = EYES[f.eye_shape] || EYES.almond;
  const ix = 186, iy = 219;
  const ox = e.ox, oy = 213 + e.tilt + 6;        // outer corner (a neutral eye sits 6px above the inner corner)
  const avg = (oy + iy) / 2;
  const topC = [155, avg - 2 * e.top];
  const botC = [158, avg + 2 * e.bottom];
  const lidTop = avg - e.top - e.lid;
  const O = [ox, oy], I = [ix, iy];

  return {
    eye: `M${ox},${oy} Q${topC} ${ix},${iy} Q${botC} ${ox},${oy} Z`,
    lid: `M${ox - 6},${oy - 1} Q${topC[0]},${topC[1] - 2} ${ix + 6},${iy - 2} C${ix + 6},${iy - 14} ${ox + 34},${lidTop} ${ox - 6},${oy - 1} Z`,
    crease: `M${ox - 12},${oy - 4} C${ox + 2},${lidTop - 14} ${ix + 6},${lidTop - 16} ${ix + 16},${iy - 8} C${ix},${lidTop - 2} ${ox + 10},${lidTop} ${ox - 12},${oy - 4} Z`,
    hood: f.eye_shape === "hooded"
      ? `M${ox - 8},${oy - 2} C${ox + 10},${avg - e.top - 8} ${ix - 4},${avg - e.top - 10} ${ix + 8},${iy - 4} C${ix - 2},${avg - e.top - 2} ${ox + 14},${avg - e.top} ${ox - 8},${oy - 2} Z`
      : "",
    kohl: `M${ox + 2},${oy + 2} Q${botC[0]},${botC[1] - 1} ${ix - 2},${iy + 1}`,
    "crease-line": f.eye_shape === "hooded"
      ? ""
      : `M${ox + 4},${oy - 5} Q${topC[0]},${topC[1] - 14} ${ix + 5},${iy - 8}`,
    "lower-lid": `M${ox + 8},${oy + 5} Q${botC[0]},${botC[1] + 4} ${ix - 6},${iy + 5}`,
    liner: `M${ix + 2},${iy} Q${topC[0]},${topC[1] - 1} ${ox},${oy} L${ox - 15},${oy - 10 - Math.max(0, -e.tilt) * 0.3}`,
    "lash-own": lashPath(O, topC, I, 5, 7),
    "lash-natural": lashPath(O, topC, I, 8, 9),
    "lash-dramatic": lashPath(O, topC, I, 11.5, 12),
    irisY: avg + 1,
    niqabY: avg + e.bottom + 10,
  };
}

function browPath(f) {
  const b = BROWS[f.brow_shape] || BROWS.arched;
  const th = BROW_THICK[f.brow_thickness] || BROW_THICK.natural;
  return `M194,186 L191,${186 - th} C176,${b.py - 1} 156,${b.py - 2} ${b.px},${b.py} ` +
    `C128,${b.py + 3} 116,${b.tailY - 7} 110,${b.tailY} ` +
    `C120,${b.tailY - 3} 132,${b.py + th * 0.9} ${b.px},${b.py + th * 0.9} C162,${b.py + th} 180,184 194,186 Z`;
}

function lipParts(f, lipY) {
  const { lw, uh, lh } = LIPS[f.lips_shape] || LIPS.medium;
  const y = lipY;
  return {
    lipU: `M${L(lw)},${y} Q${L(lw - 16)},${y - uh - 4} ${L(7)},${y - uh} Q200,${y - uh + 4} ${R(7)},${y - uh} Q${R(lw - 16)},${y - uh - 4} ${R(lw)},${y} Q200,${y + 5} ${L(lw)},${y} Z`,
    lipL: `M${L(lw)},${y} Q200,${y + 5} ${R(lw)},${y} Q${R(lw - 14)},${y + lh} 200,${y + lh + 2} Q${L(lw - 14)},${y + lh} ${L(lw)},${y} Z`,
    lipLine: `M${L(lw)},${y} Q200,${y + 5} ${R(lw)},${y}`,
    glossY: y + lh * 0.55,
    cupidY: y - uh - 6,
  };
}

/** Recompute every face path from the features and write them into the SVG. */
function drawFace(svg, features) {
  const f = { ...FACE_DEFAULTS, ...features };
  const s = SHAPES[f.face_shape] || SHAPES.oval;
  const lipY = s.chinY - 66;
  const noseY = lipY - 38;
  const nw = NOSE_W[f.nose] || NOSE_W.medium;
  const eye = eyeParts(f);
  const lips = lipParts(f, lipY);

  const paths = {
    face: facePath(f),
    brow: browPath(f),
    nose: `M194,230 Q191,${noseY - 18} ${L(nw - 2)},${noseY} Q${L(nw / 2)},${noseY + 11} 200,${noseY + 8} Q${R(nw / 2)},${noseY + 11} ${R(nw)},${noseY}`,
    niqab: `M90,${eye.niqabY} C130,${eye.niqabY + 8} 270,${eye.niqabY + 8} 310,${eye.niqabY} C318,${eye.niqabY + 62} 324,382 344,480 L56,480 C76,382 82,302 90,${eye.niqabY} Z`,
    eye: eye.eye, lid: eye.lid, crease: eye.crease, hood: eye.hood, kohl: eye.kohl, liner: eye.liner,
    "crease-line": eye["crease-line"], "lower-lid": eye["lower-lid"],
    // Two soft shadows down the sides of the nose bridge.
    "nose-shade": `M${L(9)},214 Q${L(11)},${noseY - 30} ${L(nw - 1)},${noseY - 4} M${R(9)},214 Q${R(11)},${noseY - 30} ${R(nw - 1)},${noseY - 4}`,
    "lash-own": eye["lash-own"], "lash-natural": eye["lash-natural"], "lash-dramatic": eye["lash-dramatic"],
    lipU: lips.lipU, lipL: lips.lipL, lipLine: lips.lipLine,
  };
  for (const [part, d] of Object.entries(paths)) {
    svg.querySelectorAll(`[data-part="${part}"]`).forEach((node) => node.setAttribute("d", d));
  }

  svg.querySelectorAll('[data-part="iris"]').forEach((c) => c.setAttribute("cy", eye.irisY));
  svg.querySelectorAll('[data-part="pupil"]').forEach((c) => c.setAttribute("cy", eye.irisY));
  svg.querySelectorAll('[data-part="glint"]').forEach((c) => c.setAttribute("cy", eye.irisY - 4));
  svg.querySelectorAll('[data-part="glint2"]').forEach((c) => c.setAttribute("cy", eye.irisY + 4));
  svg.querySelectorAll('[data-part="iris-light"]').forEach((c) => c.setAttribute("cy", eye.irisY + 3));
  svg.querySelector('[data-part="gloss"]').setAttribute("cy", lips.glossY);
  svg.querySelector('[data-part="hl-cupid"]').setAttribute("cy", lips.cupidY);

  // Light and shadow that follow the face shape.
  svg.querySelector('[data-part="nose-tip"]').setAttribute("cy", noseY - 2);
  svg.querySelectorAll('[data-part="nostril"]').forEach((e, i) => {
    e.setAttribute("cx", i ? R(nw * 0.5) : L(nw * 0.5));
    e.setAttribute("cy", noseY + 5);
    e.setAttribute("rx", 2.5 + nw * 0.08);
  });
  svg.querySelector('[data-part="chin-hl"]').setAttribute("cy", s.chinY - 20);
  svg.querySelector('[data-part="under-lip"]').setAttribute("cy", lipY + LIPS[f.lips_shape].lh + 8);
  svg.querySelectorAll('[data-part="contour"]').forEach((e, i) => {
    const x = i ? R(s.w - 22) : L(s.w - 22);
    e.setAttribute("cx", x);
    e.setAttribute("cy", lipY - 30);
    e.setAttribute("transform", `rotate(${i ? -18 : 18} ${x} ${lipY - 30})`);
  });

  // Blush and highlighter follow the cheekbones.
  const cheekX = s.w - 36;
  svg.querySelectorAll('[data-part="blush"]').forEach((e, i) => {
    e.setAttribute("cx", i ? R(cheekX) : L(cheekX));
    e.setAttribute("cy", Math.min(282, lipY - 30));
  });
  const hlX = s.w - 56;
  svg.querySelectorAll('[data-part="hl-cheek"]').forEach((e, i) => {
    const x = i ? R(hlX) : L(hlX);
    e.setAttribute("cx", x);
    e.setAttribute("transform", `rotate(${i ? 14 : -14} ${x} 254)`);
  });

  svg.style.setProperty("--iris", LENS[f.lens] || IRIS[f.eye_color] || IRIS.dark_brown);
}
