// Portrait mirror: a still, front-facing render of "Female face Anime" by giueppeccc (Sketchfab, CC BY 4.0).
// app.js calls window.Portrait.update(look); this script repaints the portrait on a canvas: skin tone, hair,
// brows and iris colours, then lipstick, blush, eyeshadow, liner and highlighter at fixed spots on the face.
// If the image can't load, it reports "failed" and the drawn SVG face stays in place.
(function () {
  const IMAGE = "portrait.png";   // 800 x 960, transparent background

  // Where things are on the portrait (pixels).
  const P = {
    dots: [[400, 398, 10], [400, 435, 9], [298, 500, 8], [497, 506, 9], [347, 905, 9]],  // decorative dots to remove
    // Outline of the visible skin of the face, from the hairline round the jaw.
    face: [[325, 255], [400, 245], [520, 255], [545, 300], [554, 380], [556, 470], [548, 560], [525, 610],
           [490, 665], [470, 690], [478, 772], [322, 772], [306, 698], [300, 665], [275, 610], [248, 560],
           [246, 470], [256, 380], [270, 300]],   // includes the neck down to the collarbones
    lips: { cx: 400, cy: 631, rx: 43, ry: 24 },
    eyes: [{ cx: 297, cy: 460, r: 21, outer: -1 }, { cx: 497, cy: 460, r: 21, outer: 1 }],
    brows: [{ x0: 258, y0: 398, x1: 362, y1: 434 }, { x0: 438, y0: 398, x1: 552, y1: 434 }],
    skinRef: [[300, 575], [500, 575], [400, 560]],
    cheeks: [[300, 570], [500, 570]],
    cheekbones: [[283, 528], [517, 528]],
  };

  const container = document.getElementById("mirror3d");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let base = null, hairMask = null, skinRef = null, skinLum = 0, skinRed = 0, lipRed = 0, pending = null;
  let original = null, originalMask = null, faceKey = "";   // unwarped portrait; base/hairMask hold the warped one

  // ---------- Reshaping the face to match "my face" (a soft liquify) ----------
  // Each op works inside an ellipse and fades to nothing at its edge: "scale" grows or shrinks around
  // the centre, "shift" moves the area. Coordinates are on the 800 x 960 portrait.
  const EYES = [[297, 460, -1], [497, 460, 1]];   // [x, y, outer corner direction]
  function faceOps(f) {
    const ops = [];
    const scale = (cx, cy, rx, ry, sx, sy) => ops.push({ scale: true, cx, cy, rx, ry, sx, sy });
    const shift = (cx, cy, rx, ry, dx, dy) => ops.push({ scale: false, cx, cy, rx, ry, dx, dy });
    const sides = (fn) => { fn(-1); fn(1); };

    for (const [x, y, o] of EYES) {
      if (f.eye_shape === "round") scale(x, y, 60, 46, 1.18, 1.32);
      if (f.eye_shape === "narrow") scale(x, y, 60, 40, 1.02, 0.7);
      if (f.eye_shape === "upturned") shift(x + o * 40, y, 28, 24, 0, -10);
      if (f.eye_shape === "downturned") shift(x + o * 40, y, 28, 24, 0, 10);
      if (f.eye_shape === "hooded") shift(x, y - 26, 52, 20, 0, 6);
      // Brows: thickness squeezes or widens the brow band, shape lifts or flattens the arch.
      if (f.brow_thickness === "thin") scale(x + o * 6, 416, 62, 22, 1, 0.55);
      if (f.brow_thickness === "thick") scale(x + o * 6, 416, 62, 26, 1, 1.6);
      if (f.brow_shape === "arched") shift(x + o * 14, 404, 36, 20, 0, -9);
      if (f.brow_shape === "straight") shift(x + o * 14, 404, 36, 20, 0, 7);
    }
    if (f.lips_shape === "thin") scale(400, 631, 64, 40, 1, 0.65);
    if (f.lips_shape === "full") scale(400, 631, 66, 46, 1.08, 1.4);
    if (f.nose === "slim") scale(400, 565, 46, 54, 0.8, 1);
    if (f.nose === "wide") scale(400, 565, 46, 54, 1.25, 1);

    // Face shape and jaw: one large, gentle stretch of the lower face (small local pulls twisted the features).
    if (f.face_shape === "round") scale(400, 610, 190, 170, 1.07, 0.97);
    if (f.face_shape === "square") scale(400, 660, 185, 110, 1.07, 1);
    if (f.face_shape === "heart") scale(400, 670, 175, 115, 0.92, 1);
    if (f.face_shape === "long") scale(400, 650, 185, 160, 0.97, 1.07);
    if (f.jaw === "sharp") scale(400, 690, 140, 70, 0.93, 1.02);
    if (f.jaw === "soft") scale(400, 680, 145, 75, 1.03, 0.99);
    return ops;
  }

  /** Apply the ops to the original portrait (and its hair mask), sampling backwards with bilinear filtering. */
  function reshape(ops) {
    const w = canvas.width, h = canvas.height, src = original.data;
    const out = new Uint8ClampedArray(src);
    const mask = new Uint8Array(originalMask);
    if (ops.length) {
      const x0 = Math.max(1, Math.min(...ops.map((o) => o.cx - o.rx)) | 0);
      const x1 = Math.min(w - 2, Math.max(...ops.map((o) => o.cx + o.rx)) | 0);
      const y0 = Math.max(1, Math.min(...ops.map((o) => o.cy - o.ry)) | 0);
      const y1 = Math.min(h - 2, Math.max(...ops.map((o) => o.cy + o.ry)) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let sx = x, sy = y, moved = false;
        for (let k = ops.length - 1; k >= 0; k--) {
          const o = ops[k], u = (sx - o.cx) / o.rx, v = (sy - o.cy) / o.ry, d2 = u * u + v * v;
          if (d2 >= 1) continue;
          const f = (1 - d2) * (1 - d2);
          moved = true;
          if (o.scale) { sx = o.cx + (sx - o.cx) / (1 + (o.sx - 1) * f); sy = o.cy + (sy - o.cy) / (1 + (o.sy - 1) * f); }
          else { sx -= o.dx * f; sy -= o.dy * f; }
        }
        if (!moved) continue;
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const i00 = (iy * w + ix) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4, o = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) {
          out[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
        }
        mask[y * w + x] = originalMask[Math.round(sy) * w + Math.round(sx)];
      }
    }
    base = new ImageData(out, w, h);
    hairMask = mask;
  }

  const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function average(data, points, r = 6) {
    const sum = [0, 0, 0]; let n = 0;
    for (const [cx, cy] of points) for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
      const i = (y * canvas.width + x) * 4;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
    }
    return sum.map((v) => v / n);
  }

  /** Remove a raised decorative dot: fill it in from the skin around its edge, smoothing inward
   * (repeatedly averaging neighbours), so it blends with the shading around it. */
  function removeDot(data, cx, cy, r) {
    const w = canvas.width, R = r + 5, size = 2 * R + 1;
    const inside = (x, y) => Math.hypot(x - cx, y - cy) <= R;
    // Start from the average colour just outside the dot, so none of its dark centre survives.
    const edge = [0, 0, 0]; let n = 0;
    for (let a = 0; a < 48; a++) {
      const x = Math.round(cx + Math.cos(a / 7.64) * (R + 1)), y = Math.round(cy + Math.sin(a / 7.64) * (R + 1));
      const i = (y * w + x) * 4;
      edge[0] += data[i]; edge[1] += data[i + 1]; edge[2] += data[i + 2]; n++;
    }
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!inside(x, y)) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = edge[c] / n;
    }
    for (let it = 0; it < 60; it++) {
      for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
        if (!inside(x, y)) continue;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          data[i + c] = (data[i - 4 + c] + data[i + 4 + c] + data[i - w * 4 + c] + data[i + w * 4 + c]) / 4;
        }
      }
    }
    return size;
  }

  function blob(x, y, rx, ry, rgb, alpha, mode) {
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paint(look) {
    const w = canvas.width, h = canvas.height;
    const out = new ImageData(new Uint8ClampedArray(base.data), w, h);
    const d = out.data, src = base.data;
    const skin = hexToRgb(look.skin), hair = hexToRgb(look.hair), brow = hexToRgb(look.brow);
    const ratio = skin.map((v, i) => Math.min(1.5, Math.max(0.3, v / skinRef[i])));

    // Skin tone everywhere except hair; hair takes the chosen colour using its own light and shade.
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      if (!src[i + 3]) continue;
      if (hairMask[p]) {
        const k = 0.3 + ((src[i] + src[i + 1] + src[i + 2]) / 765) * 1.9;
        d[i] = hair[0] * k; d[i + 1] = hair[1] * k; d[i + 2] = hair[2] * k;
      } else {
        d[i] = src[i] * ratio[0]; d[i + 1] = src[i + 1] * ratio[1]; d[i + 2] = src[i + 2] * ratio[2];
      }
    }

    // Brows: the darker hairs inside the brow boxes take the brow colour.
    for (const b of P.brows) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const i = (y * w + x) * 4;
      const lum = (src[i] + src[i + 1] + src[i + 2]) / 3;
      const m = smooth(22, 55, skinLum - lum) * 0.85;
      if (m) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m) + brow[c] * (0.7 + lum / 255) * m;
    }

    // Irises: recolour the ring around the pupil, keeping its light and shade.
    const iris = hexToRgb(look.iris);
    for (const e of P.eyes) for (let y = e.cy - e.r; y <= e.cy + e.r; y++) for (let x = e.cx - e.r; x <= e.cx + e.r; x++) {
      const dist = Math.hypot(x - e.cx, y - e.cy);
      const m = smooth(5, 8, dist) * (1 - smooth(e.r - 5, e.r, dist));
      if (!m) continue;
      const i = (y * w + x) * 4;
      const lum = (src[i] + src[i + 1] + src[i + 2]) / 3 / 110;
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m) + Math.min(255, iris[c] * Math.min(1.8, lum * 1.3) + 8) * m * 1;
    }

    // Lipstick: the pinker pixels inside the lip oval, keeping the lips' own shading.
    const mk = look.makeup;
    if (mk?.lips) {
      const lip = hexToRgb(mk.lips), L = P.lips;
      for (let y = L.cy - L.ry - 6; y <= L.cy + L.ry + 6; y++) for (let x = L.cx - L.rx - 6; x <= L.cx + L.rx + 6; x++) {
        const i = (y * w + x) * 4;
        const inside = 1 - smooth(0.7, 1.05, Math.hypot((x - L.cx) / L.rx, (y - L.cy) / L.ry));
        const red = src[i] - (src[i + 1] + src[i + 2]) / 2;
        const m = inside * smooth(skinRed + (lipRed - skinRed) * 0.1, skinRed + (lipRed - skinRed) * 0.5, red);
        if (!m) continue;
        const shade = Math.min(1.1, Math.max(0.65, (src[i] + src[i + 1] + src[i + 2]) / 3 / skinLum * 1.05));
        for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m) + lip[c] * shade * m;
      }
    }
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(out, 0, 0);

    if (mk) {
      const rgb = (k) => hexToRgb(mk[k]).join(",");
      for (const [x, y] of P.cheeks) blob(x, y, 48, 30, rgb("blush"), 0.45, "multiply");
      for (const e of P.eyes) {
        blob(e.cx + e.outer * 6, e.cy - 30, 48, 14, rgb("eyeshadow_crease"), 0.6, "multiply");
        blob(e.cx + e.outer * 4, e.cy - 21, 42, 11, rgb("eyeshadow_lid"), 0.9, "multiply");
        ctx.save();
        ctx.strokeStyle = mk.eyeliner;
        ctx.lineCap = "round";
        ctx.lineWidth = { none: 2.5, natural: 3, dramatic: 4 }[look.lashes] ?? 3;
        ctx.beginPath();
        ctx.moveTo(e.cx - e.outer * 36, e.cy - 12);
        ctx.quadraticCurveTo(e.cx, e.cy - 26, e.cx + e.outer * 36, e.cy - 10);
        ctx.lineTo(e.cx + e.outer * 50, e.cy - 22);
        ctx.stroke();
        ctx.restore();
      }
      for (const [x, y] of P.cheekbones) blob(x, y, 38, 18, rgb("highlighter"), 0.14, "screen");
      blob(400, 520, 8, 30, rgb("highlighter"), 0.12, "screen");
    }
  }

  function update(look) {
    pending = look;
    if (window.Portrait.status !== "ready") return;
    const key = JSON.stringify(look.face || {});
    if (key !== faceKey) {   // reshape only when the face settings change, not for every makeup change
      faceKey = key;
      reshape(faceOps(look.face || {}));
    }
    paint(look);
  }

  window.Portrait = { status: "loading", update };

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    base = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (const [x, y, r] of P.dots) removeDot(base.data, x, y, r);

    skinRef = average(base.data, P.skinRef);
    skinLum = skinRef.reduce((a, b) => a + b) / 3;
    const lip = average(base.data, [[P.lips.cx, P.lips.cy]], 4);
    skinRed = skinRef[0] - (skinRef[1] + skinRef[2]) / 2;
    lipRed = Math.max(skinRed + 6, lip[0] - (lip[1] + lip[2]) / 2);

    // Hair is found by place, not colour (this render's hair and skin are close in tone):
    // outside the face oval and above the chest everything is hair; on the face and chest only the
    // dark strands crossing them are hair. The eyes, brows, nose and lips box always stays skin.
    hairMask = new Uint8Array(canvas.width * canvas.height);
    const shape = document.createElement("canvas");
    shape.width = canvas.width; shape.height = canvas.height;
    const sctx = shape.getContext("2d");
    sctx.beginPath();
    P.face.forEach(([x, y], k) => (k ? sctx.lineTo(x, y) : sctx.moveTo(x, y)));
    sctx.fill();
    const faceArea = sctx.getImageData(0, 0, shape.width, shape.height).data;
    const data = base.data;
    for (let y = 0, p = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++, p++) {
      const i = p * 4;
      if (!data[i + 3]) continue;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const inFace = faceArea[i + 3] > 127;
      const features = x > 270 && x < 530 && y > 395 && y < 700;
      if (inFace) hairMask[p] = !features && lum < skinLum * 0.55 ? 1 : 0;
      else hairMask[p] = y > 690 && lum > skinLum * 0.62 ? 0 : 1;
    }

    original = base;
    originalMask = hairMask;
    container.append(canvas);
    window.Portrait.status = "ready";
    if (pending) update(pending);
    window.dispatchEvent(new Event("portrait:ready"));
  };
  img.onerror = () => {
    window.Portrait.status = "failed";
    window.dispatchEvent(new Event("portrait:failed"));
  };
  img.src = IMAGE;
})();
