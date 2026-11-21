// Engraved plates, drawn in code: one emblem per book, plus Milton's cosmos for the title page.
// Everything paints with CSS classes (ink, paper, crimson, gold and hatch patterns), so the plates
// follow the light and dark themes: in the dark they read as white-line engravings.
(function () {
  const r = (n) => Math.round(n * 10) / 10;
  const rnd = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<pattern id="pl-h1" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.4" class="hl" stroke-width=".7"/></pattern>
<pattern id="pl-h2" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0V3.4M0 0H3.4" class="hl" stroke-width=".65"/></pattern>
<pattern id="pl-h3" width="5" height="2.6" patternUnits="userSpaceOnUse"><line x1="0" y1="1.3" x2="5" y2="1.3" class="hl" stroke-width=".4"/></pattern>
<pattern id="pl-hv" width="2.6" height="5" patternUnits="userSpaceOnUse"><line x1="1.3" y1="0" x2="1.3" y2="5" class="hl" stroke-width=".5"/></pattern>
<pattern id="pl-rain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><line x1="0" y1="0" x2="0" y2="3.2" class="hl" stroke-width=".45"/></pattern>
<pattern id="pl-dots" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.6" r=".42" class="k"/></pattern>
<radialGradient id="pl-glow"><stop offset="0" class="gl0"/><stop offset=".55" class="gl5"/><stop offset="1" class="gl1"/></radialGradient>
<radialGradient id="pl-fire"><stop offset="0" class="fi0"/><stop offset="1" class="fi1"/></radialGradient>
</defs></svg>`;

  // ── drawing helpers ──
  const path = (d, cls, extra = "") => `<path d="${d}" class="${cls}" ${extra}/>`;
  function rays(cx, cy, n, r0, r1, a0 = 0, a1 = 360, cls = "gs", w = 0.5) {
    const full = a1 - a0 >= 360;
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = ((a0 + (a1 - a0) * (full ? i / n : n === 1 ? 0.5 : i / (n - 1))) * Math.PI) / 180;
      d += `M${r(cx + r0 * Math.cos(a))} ${r(cy + r0 * Math.sin(a))}L${r(cx + r1 * Math.cos(a))} ${r(cy + r1 * Math.sin(a))}`;
    }
    return path(d, cls, `stroke-width="${w}"`);
  }
  function flame(x, base, h, w, lean = 0) {
    const tx = x + lean, ty = base - h;
    return `M${r(x - w / 2)} ${base}C${r(x - w / 2)} ${r(base - h * 0.45)} ${r(tx - w * 0.12)} ${r(base - h * 0.62)} ${r(tx)} ${r(ty)}C${r(tx + w * 0.18)} ${r(base - h * 0.55)} ${r(x + w / 2)} ${r(base - h * 0.4)} ${r(x + w / 2)} ${base}Z`;
  }
  function flames(x0, x1, base, hMin, hMax, seed, cls = "pf ks", inner = true) {
    const R = rnd(seed);
    let out = "", core = "";
    for (let x = x0; x <= x1; x += 9 + R() * 8) {
      const h = hMin + R() * (hMax - hMin), w = 10 + R() * 9, lean = (R() - 0.5) * 12;
      out += flame(x, base, h, w, lean);
      if (inner) core += flame(x, base, h * 0.55, w * 0.45, lean * 0.6);
    }
    return path(out, cls, 'stroke-width=".7"') + (inner ? path(core, "v", 'opacity=".75"') : "");
  }
  // A feathered wing from the shoulder (sx, sy), reaching out to side d (+1 right, −1 left).
  function wingPath(sx, sy, d, S, tilt = 0) {
    const tipX = sx + d * S, tipY = sy - S * 0.55 + tilt;
    let p = `M${r(sx)} ${r(sy)}Q${r(sx + d * S * 0.35)} ${r(sy - S * 0.78 + tilt * 0.5)} ${r(tipX)} ${r(tipY)}`;
    const endX = sx + d * S * 0.1, endY = sy + S * 0.16;
    let px = tipX, py = tipY;
    const quills = [];
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const qx = tipX + (endX - tipX) * t, qy = tipY + (endY - tipY) * t + Math.sin(t * Math.PI) * S * 0.1;
      p += `Q${r((px + qx) / 2 + d * S * 0.03)} ${r(Math.max(py, qy) + S * 0.13)} ${r(qx)} ${r(qy)}`;
      if (i < 6) quills.push(`M${r(sx + d * S * 0.12)} ${r(sy - S * 0.12)}L${r(qx)} ${r(qy)}`);
      px = qx; py = qy;
    }
    return { d: p + "Z", quills: quills.join("") };
  }
  function wings(sx, sy, S, { tilt = 0, fill = "k", quill = "ps", gap = 2 } = {}) {
    let out = "";
    for (const d of [-1, 1]) {
      const w = wingPath(sx + d * gap, sy, d, S, tilt);
      out += path(w.d, fill + " ks", 'stroke-width=".6"') + path(w.quills, quill, 'stroke-width=".45"');
    }
    return out;
  }
  // A small flying figure: a body and two wings.
  const flyer = (x, y, s, cls = "k") =>
    wings(x, y, s, { fill: cls, quill: cls === "k" ? "ps" : "ks", gap: 1 }) +
    `<ellipse cx="${x}" cy="${r(y + s * 0.15)}" rx="${r(s * 0.12)}" ry="${r(s * 0.32)}" class="${cls}"/><circle cx="${x}" cy="${r(y - s * 0.28)}" r="${r(s * 0.12)}" class="${cls}"/>`;
  // A scalloped blob: tree crowns and clouds.
  function blob(cx, cy, rx, ry, bumps, seed = 1, flatBottom = false) {
    const R = rnd(seed);
    const pts = [];
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
      const k = 0.9 + R() * 0.16;
      let y = cy + Math.sin(a) * ry * k;
      if (flatBottom && y > cy) y = cy + ry * 0.35;
      pts.push([cx + Math.cos(a) * rx * k, y, a]);
    }
    let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
    for (let i = 0; i < bumps; i++) {
      const p = pts[i], q = pts[(i + 1) % bumps];
      const am = p[2] + Math.PI / bumps, f = 1.22;
      let my = cy + Math.sin(am) * ry * f;
      if (flatBottom && my > cy) my = cy + ry * 0.35;
      d += `Q${r(cx + Math.cos(am) * rx * f)} ${r(my)} ${r(q[0])} ${r(q[1])}`;
    }
    return d + "Z";
  }
  const cloud = (cx, cy, w, h, seed, cls = "pf ks") => path(blob(cx, cy, w / 2, h / 2, 9, seed, true), cls, 'stroke-width=".7"');
  function tree(x, base, h, rx, ry, seed) {
    const top = base - h;
    const trunk = `M${x - 4} ${base}C${x - 2} ${r(base - h * 0.3)} ${x - 3} ${r(top + ry)} ${x - 1} ${r(top + ry * 0.6)}L${x + 1} ${r(top + ry * 0.6)}C${x + 3} ${r(top + ry)} ${x + 2} ${r(base - h * 0.3)} ${x + 4} ${base}Z`;
    return path(trunk, "h1 ks", 'stroke-width=".7"') + path(blob(x, top + ry * 0.4, rx, ry, 11, seed), "h1 ks", 'stroke-width=".8"');
  }
  function waves(x0, x1, y, amp, len, cls = "ks", w = 0.6) {
    let d = `M${x0} ${y}`;
    for (let x = x0; x < x1; x += len) d += `q${len / 4} ${-amp} ${len / 2} 0t${len / 2} 0`;
    return path(d, cls, `stroke-width="${w}"`);
  }
  function spiral(cx, cy, rad, turns, cls = "ks", w = 0.55) {
    let d = "";
    const steps = Math.round(turns * 28);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * turns * Math.PI * 2, rr = rad * t;
      d += `${i ? "L" : "M"}${r(cx + Math.cos(a) * rr)} ${r(cy + Math.sin(a) * rr)}`;
    }
    return path(d, cls, `stroke-width="${w}"`);
  }
  function globe(cx, cy, rad) {
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" class="pf ks" stroke-width=".8"/>` +
      path(`M${cx} ${cy - rad}A${rad} ${rad} 0 0 1 ${cx} ${cy + rad}A${r(rad * 0.45)} ${rad} 0 0 0 ${cx} ${cy - rad}Z`, "h1") +
      `<ellipse cx="${cx}" cy="${cy}" rx="${r(rad * 0.45)}" ry="${rad}" class="ks" stroke-width=".5"/><ellipse cx="${cx}" cy="${cy}" rx="${rad}" ry="${r(rad * 0.3)}" class="ks" stroke-width=".5"/>`;
  }
  function chain(x, y0, y1, cls = "gs") {
    let out = "";
    for (let y = y0, i = 0; y < y1; y += 4, i++) {
      out += i % 2 ? `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 4}" class="${cls}" stroke-width="1.6"/>` : `<ellipse cx="${x}" cy="${y + 2}" rx="1.4" ry="2.4" class="${cls}" stroke-width=".7" fill="none"/>`;
    }
    return out;
  }
  function figure(x, base, h, cls = "k", lean = 0) {
    const hr = h * 0.085, top = base - h;
    return `<circle cx="${r(x + lean)}" cy="${r(top + hr)}" r="${r(hr)}" class="${cls}"/>` +
      path(`M${r(x - h * 0.1 + lean * 0.7)} ${r(top + hr * 2.4)}Q${r(x + lean)} ${r(top + hr * 1.9)} ${r(x + h * 0.1 + lean * 0.7)} ${r(top + hr * 2.4)}L${r(x + h * 0.17)} ${base}L${r(x - h * 0.17)} ${base}Z`, cls);
  }
  function grass(x0, x1, y, seed, n = 30) {
    const R = rnd(seed);
    let d = "";
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * (x1 - x0), yy = y + R() * 22, h = 3 + R() * 4;
      d += `M${r(x)} ${r(yy)}l${r((R() - 0.5) * 3)} ${r(-h)}`;
    }
    return path(d, "ks", 'stroke-width=".5"');
  }
  function bolt(x, y, len, ang) {
    const a = (ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    const p = (t, o) => `${r(x + c * len * t + px * o)} ${r(y + s * len * t + py * o)}`;
    return path(`M${p(0, -2)}L${p(0.42, 3)}L${p(0.4, -1)}L${p(1, 0)}L${p(0.55, 1.5)}L${p(0.58, -3.5)}L${p(0, 2)}Z`, "g ks", 'stroke-width=".5"');
  }
  const stars = (x0, y0, x1, y1, n, seed, cls = "pf") => {
    const R = rnd(seed);
    let out = "";
    for (let i = 0; i < n; i++) out += `<circle cx="${r(x0 + R() * (x1 - x0))}" cy="${r(y0 + R() * (y1 - y0))}" r="${r(0.5 + R() * 0.9)}" class="${cls}"/>`;
    return out;
  };

  function plate(inner, label, w = 320, h = 200) {
    return `<svg viewBox="0 0 ${w} ${h}" class="plate" role="img" aria-label="${label}"><rect width="${w}" height="${h}" class="pf"/>${inner}` +
      `<path d="M0 0H${w}V${h}H0ZM7 7V${h - 7}H${w - 7}V7Z" class="pf" fill-rule="evenodd"/>` +
      `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" class="ks" stroke-width="1.5" fill="none"/><rect x="7" y="7" width="${w - 14}" height="${h - 14}" class="ks" stroke-width=".55" fill="none"/></svg>`;
  }

  // ── the twelve plates ──
  const SCENES = {
    // I · Satan rising from the burning lake
    1: () =>
      `<rect width="320" height="200" class="h2" opacity=".85"/>` +
      `<ellipse cx="160" cy="150" rx="190" ry="110" fill="url(#pl-fire)"/>` +
      `<ellipse cx="160" cy="96" rx="80" ry="62" class="pf" opacity=".9"/><ellipse cx="160" cy="96" rx="96" ry="74" fill="url(#pl-glow)"/>` +
      flames(0, 330, 168, 18, 48, 7, "h1 ks", false) +
      `<rect x="0" y="160" width="320" height="40" class="pf"/>` +
      [164, 171, 178, 186, 194].map((y, i) => waves(i % 2 ? -6 : 0, 330, y, 2.2, 14)).join("") +
      `<line x1="138" y1="58" x2="128" y2="168" class="ks" stroke-width="2.2"/>` +
      wings(160, 92, 66) +
      path("M154 84L166 84L171 122Q160 130 149 122Z", "k") + `<circle cx="160" cy="77" r="6" class="k"/>` +
      `<circle cx="178" cy="104" r="11" class="pf ks" stroke-width="1"/><circle cx="178" cy="104" r="7" class="ks" stroke-width=".5" fill="none"/>` + path("M173 99a7 7 0 0 0 4 12a8 8 0 0 1-4-12z", "h1") +
      flames(-4, 330, 200, 14, 34, 11),
    // II · The gates of Hell, and Satan's flight across Chaos to the hanging World
    2: () =>
      `<rect x="160" width="160" height="200" fill="url(#pl-dots)" opacity=".7"/>` +
      spiral(205, 150, 26, 2.4) + spiral(268, 82, 22, 2.2) + spiral(296, 168, 18, 2) + spiral(196, 58, 16, 2) +
      `<ellipse cx="290" cy="34" rx="40" ry="30" fill="url(#pl-glow)"/>` + chain(290, 7, 26) + globe(290, 34, 8) +
      flyer(238, 112, 15) +
      `<rect width="158" height="200" class="h2"/>` +
      path("M24 200V96A56 56 0 0 1 136 96V200Z", "pf ks", 'stroke-width="1.1"') +
      path("M24 200V96A56 56 0 0 1 136 96V200H128V96A48 48 0 0 0 32 96V200Z", "h1") +
      path("M32 200V96A48 48 0 0 1 128 96V200H120V96A40 40 0 0 0 40 96V200Z", "hv") +
      path("M40 200V96A40 40 0 0 1 120 96V200H112V96A32 32 0 0 0 48 96V200Z", "h2") +
      path("M48 200V96A32 32 0 0 1 112 96V200Z", "pf ks", 'stroke-width=".8"') +
      `<ellipse cx="80" cy="160" rx="40" ry="50" fill="url(#pl-fire)"/>` + flames(52, 108, 200, 20, 56, 3),
    // III · Heaven's light, the ranks of angels, and the World hung on its golden chain
    3: () =>
      `<rect width="320" height="200" class="h3"/>` +
      `<rect y="118" width="320" height="82" fill="url(#pl-dots)" opacity=".75"/>` +
      `<ellipse cx="160" cy="40" rx="130" ry="80" fill="url(#pl-glow)"/>` +
      rays(160, 40, 72, 22, 170, 0, 360, "gs", 0.5) +
      `<circle cx="160" cy="40" r="20" class="pf gs" stroke-width="1"/><circle cx="160" cy="40" r="13" class="g"/>` +
      Array.from({ length: 18 }, (_, i) => { const x = 36 + i * 14.6; return `<rect x="${r(x - 2.6)}" y="80" width="5.2" height="14" rx="2.6" class="pf ks" stroke-width=".5"/><circle cx="${r(x)}" cy="77" r="2.8" class="gs" fill="none" stroke-width=".7"/>`; }).join("") +
      cloud(70, 101, 120, 24, 3) + cloud(160, 98, 120, 28, 5) + cloud(252, 101, 118, 24, 9) +
      chain(212, 110, 150) + globe(212, 164, 14) + flyer(236, 147, 7),
    // IV · Eden: the Tree of Life with Satan perched on it as a cormorant
    4: () =>
      `<rect width="320" height="120" class="h3"/>` +
      `<circle cx="252" cy="74" r="13" class="pf gs" stroke-width="1"/>` + rays(252, 74, 20, 17, 30, 180, 360, "gs", 0.6) +
      path("M0 128Q40 92 80 104T160 98T240 102T320 96V140H0Z", "h1 ks", 'stroke-width=".7"') +
      Array.from({ length: 16 }, (_, i) => path(blob(10 + i * 20, 98 + Math.sin(i * 1.7) * 5, 9, 7, 7, i + 2), "pf ks", 'stroke-width=".5"')).join("") +
      `<rect y="132" width="320" height="68" class="pf"/>` +
      path("M168 132C150 150 190 162 150 178S110 194 120 200H150C146 192 178 184 196 172S180 146 182 132Z", "h3 ks", 'stroke-width=".7"') +
      grass(10, 310, 140, 4, 60) +
      tree(236, 194, 98, 30, 24, 8) +
      tree(92, 196, 160, 52, 40, 3) +
      path("M96 36C92 36 90 39 91 42L86 46L92 45C94 50 101 51 106 47L112 49L108 44C108 39 104 36 101 37L103 31C104 28 101 27 100 30Z", "k") + `<line x1="96" y1="50" x2="96" y2="56" class="ks"/>` +
      figure(196, 192, 30, "k", 1) + figure(206, 192, 27, "k", -1),
    // V · Raphael, six-winged, descends to Adam's bower
    5: () =>
      `<rect width="320" height="200" class="h3"/>` +
      `<ellipse cx="160" cy="70" rx="110" ry="80" fill="url(#pl-glow)"/>` +
      rays(160, -10, 26, 30, 230, 55, 125, "gs", 0.5) +
      wings(160, 76, 58, { fill: "h1", quill: "ks" }) +
      wings(160, 64, 40, { tilt: -10, fill: "pf", quill: "ks" }) +
      `<g transform="translate(0 196) scale(1 -1)">${wings(160, 96, 30, { tilt: 6, fill: "pf", quill: "ks" })}</g>` +
      path("M155 66L165 66L172 112Q160 117 148 112Z", "pf ks", 'stroke-width=".7"') +
      `<circle cx="160" cy="59" r="5.5" class="pf ks" stroke-width=".7"/><circle cx="160" cy="59" r="9" class="gs" fill="none" stroke-width=".8"/>` +
      `<rect y="168" width="320" height="32" class="pf"/>` + grass(10, 310, 172, 9, 50) +
      path(blob(60, 154, 34, 26, 9, 4), "h1 ks", 'stroke-width=".7"') + path(blob(262, 152, 38, 28, 9, 6), "h1 ks", 'stroke-width=".7"') +
      path("M126 196V172Q160 128 194 172V196H182V176Q160 146 138 176V196Z", "h1 ks", 'stroke-width=".7"'),
    // VI · The Son's chariot, wheels full of eyes, drives the rebels through the wall of Heaven
    6: () =>
      `<rect width="320" height="140" class="h3"/>` +
      `<ellipse cx="160" cy="72" rx="120" ry="70" fill="url(#pl-glow)"/>` +
      rays(160, 72, 40, 40, 120, 0, 360, "gs", 0.45) +
      `<circle cx="146" cy="78" r="30" class="ks" stroke-width=".8" fill="none"/>` +
      `<circle cx="160" cy="72" r="36" class="pf ks" stroke-width="2"/>` + rays(160, 72, 12, 8, 36, 0, 360, "ks", 1.1) +
      `<circle cx="160" cy="72" r="8" class="k"/>` +
      Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, x = 160 + Math.cos(a) * 36, y = 72 + Math.sin(a) * 36; return `<g transform="translate(${r(x)} ${r(y)}) rotate(${r((a * 180) / Math.PI + 90)})"><ellipse rx="3.4" ry="1.8" class="pf ks" stroke-width=".5"/><circle r="1" class="k"/></g>`; }).join("") +
      bolt(130, 96, 52, 130) + bolt(190, 96, 52, 50) + bolt(150, 108, 40, 100) + bolt(178, 104, 44, 75) +
      `<rect y="140" width="320" height="60" class="h2"/>` +
      `<line x1="7" y1="140" x2="112" y2="140" class="ks" stroke-width="1.6"/><line x1="208" y1="140" x2="313" y2="140" class="ks" stroke-width="1.6"/>` +
      `<ellipse cx="160" cy="200" rx="70" ry="40" fill="url(#pl-fire)"/>` +
      [[132, 152, 8], [176, 158, 9], [150, 176, 7], [196, 182, 6], [118, 184, 6], [164, 192, 5]].map(([x, y, s]) => `<g transform="translate(0 ${2 * y}) scale(1 -1)">${flyer(x, y, s, "pf")}</g>`).join(""),
    // VII · Creation: the golden compasses mark out the World over the deep
    7: () =>
      `<rect width="320" height="200" class="h3"/>` +
      `<rect y="120" width="320" height="80" class="h2"/>` + [128, 140, 154, 170, 186].map((y, i) => waves(i % 2 ? -8 : 0, 330, y, 2.5, 18, "ps", 0.6)).join("") +
      `<circle cx="160" cy="128" r="58" class="pf"/><circle cx="160" cy="128" r="58" class="h3"/>` +
      `<circle cx="160" cy="128" r="58" class="gs" fill="none" stroke-width="1.4"/>` +
      `<ellipse cx="180" cy="30" rx="120" ry="50" fill="url(#pl-glow)"/>` + rays(180, 30, 30, 30, 110, 0, 180, "gs", 0.5) +
      path("M178 36L184 36L162 130L159 130Z", "g ks", 'stroke-width=".6"') +
      path("M178 36L184 36L219 130L216 130Z", "g ks", 'stroke-width=".6"') +
      `<circle cx="181" cy="36" r="5" class="g ks" stroke-width=".7"/>` +
      cloud(180, 26, 150, 36, 12),
    // VIII · The cosmos Adam asks Raphael about: Earth, its spheres and the stars
    8: () =>
      `<rect width="320" height="200" class="h2"/>` + stars(10, 10, 310, 190, 70, 21) +
      `<ellipse cx="160" cy="100" rx="80" ry="60" fill="url(#pl-glow)"/>` +
      [[52, 16], [84, 28], [118, 40], [150, 52]].map(([rx, ry]) => `<ellipse cx="160" cy="100" rx="${rx}" ry="${ry}" transform="rotate(-14 160 100)" class="gs" fill="none" stroke-width=".8"/>`).join("") +
      globe(160, 100, 18) +
      `<g transform="rotate(-14 160 100)"><circle cx="212" cy="100" r="3" class="pf ks" stroke-width=".5"/><circle cx="160" cy="72" r="2.5" class="pf ks" stroke-width=".5"/><circle cx="74" cy="104" r="3.5" class="pf ks" stroke-width=".5"/></g>` +
      `<g transform="rotate(-14 160 100)">${rays(278, 100, 16, 9, 16, 0, 360, "gs", 0.7)}<circle cx="278" cy="100" r="8" class="g"/></g>` +
      path("M58 40a12 12 0 1 0 10 18a10 10 0 1 1-10-18z", "pf"),
    // IX · The Fall: the serpent coiled about the tree, one fruit taken
    9: () =>
      `<rect width="320" height="150" class="h3"/>` +
      path("M0 150Q60 132 120 142T240 138T320 144V200H0Z", "h1") + `<rect y="160" width="320" height="40" class="pf"/>` + grass(10, 310, 166, 13, 60) +
      path("M148 200C152 172 146 142 153 110L167 110C174 142 168 172 174 200Z", "h1 ks", 'stroke-width=".8"') +
      path("M156 116L136 92M164 116L188 90M160 112L160 84", "ks", 'stroke-width="2.4"') +
      path(blob(160, 68, 74, 44, 13, 17), "h1 ks", 'stroke-width=".9"') +
      [[118, 62], [140, 86], [176, 52], [206, 70], [128, 40], [192, 34], [150, 46], [220, 54], [104, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.8" class="pf ks" stroke-width=".6"/>`).join("") +
      `<line x1="200" y1="88" x2="200" y2="94" class="ks" stroke-width=".7"/><circle cx="200" cy="99" r="5.4" class="v ks" stroke-width=".6"/>` +
      path("M136 198C176 192 178 178 150 172C124 166 130 152 166 148C196 144 192 130 160 125C140 122 150 106 182 102", "ks", 'stroke-width="7.5" fill="none" stroke-linecap="round"') +
      path("M136 198C176 192 178 178 150 172C124 166 130 152 166 148C196 144 192 130 160 125C140 122 150 106 182 102", "pss", 'stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="3 2.2"') +
      `<ellipse cx="186" cy="100" rx="6.5" ry="4" transform="rotate(-18 186 100)" class="k"/><circle cx="188" cy="98.6" r=".9" class="pf"/>` + path("M192 99l5 1.2m-5-1.2l4.6 3", "vs", 'stroke-width=".8"'),
    // X · Sin and Death's bridge over Chaos, from Hell's mouth to the World
    10: () =>
      `<rect width="320" height="200" fill="url(#pl-dots)" opacity=".7"/>` +
      spiral(90, 60, 24, 2.2) + spiral(210, 140, 26, 2.4) + spiral(280, 150, 16, 2) + spiral(160, 40, 14, 2) +
      `<ellipse cx="288" cy="44" rx="44" ry="32" fill="url(#pl-glow)"/>` + chain(288, 7, 30) + globe(288, 44, 13) +
      path("M40 156Q160 36 276 52L276 61Q164 48 52 164Z", "h1 ks", 'stroke-width=".8"') +
      Array.from({ length: 13 }, (_, i) => { const t = (i + 1) / 14, x = (1 - t) ** 2 * 46 + 2 * (1 - t) * t * 162 + t * t * 276, y = (1 - t) ** 2 * 160 + 2 * (1 - t) * t * 42 + t * t * 56; return `<path d="M${r(x - 6)} ${r(y + 4)}q6 14 12 0" class="ks" stroke-width=".6" fill="none"/>`; }).join("") +
      `<rect x="7" y="146" width="90" height="54" class="h2"/>` + `<ellipse cx="50" cy="196" rx="50" ry="40" fill="url(#pl-fire)"/>` + flames(12, 96, 200, 16, 44, 31) +
      figure(150, 82, 14, "k", 1) + figure(162, 79, 16, "pf ks", 0),
    // XI · Michael's vision of the Flood: the ark, the rain, the covenant rainbow, the dove
    11: () =>
      `<rect width="320" height="150" class="h3"/>` + `<rect width="150" height="150" fill="url(#pl-rain)"/>` +
      path(blob(70, 26, 80, 22, 10, 5), "h2 ks", 'stroke-width=".6"') + path(blob(180, 18, 60, 16, 9, 8), "h2 ks", 'stroke-width=".6"') +
      `<g fill="none"><path d="M136 150A92 92 0 0 1 320 150" class="gs" stroke-width="3"/><path d="M146 150A82 82 0 0 1 310 150" class="vs" stroke-width="3" opacity=".8"/><path d="M156 150A72 72 0 0 1 300 150" class="gs" stroke-width="3"/></g>` +
      `<rect y="146" width="320" height="54" class="pf"/>` + [150, 158, 167, 177, 188].map((y, i) => waves(i % 2 ? -7 : 0, 330, y, 2.4, 15)).join("") +
      path("M82 150L204 150L190 170L98 170Z", "h1 ks", 'stroke-width=".8"') +
      `<rect x="108" y="128" width="72" height="22" class="pf ks" stroke-width=".7"/>` + path("M100 130L144 110L188 130Z", "hv ks", 'stroke-width=".7"') +
      `<rect x="138" y="134" width="10" height="8" class="k"/>` +
      path("M240 80q8-8 16-2q6-6 12 0q-6 2-10 8q-8 4-18-6z", "pf ks", 'stroke-width=".6"') + path("M258 86l6 8m-2-3l4-1m-6-1l3-3", "ks", 'stroke-width=".6"'),
    // XII · The expulsion: the flaming sword over the gate; the two walk out hand in hand
    12: () =>
      `<rect width="320" height="200" class="h3"/>` +
      `<ellipse cx="40" cy="140" rx="90" ry="60" fill="url(#pl-glow)"/>` + rays(40, 140, 20, 14, 60, 190, 350, "gs", 0.6) +
      path("M0 142Q40 126 90 136T170 132V150H0Z", "h1") +
      `<rect x="232" y="44" width="81" height="156" class="h2"/>` + path("M250 200V128A16 16 0 0 1 282 128V200Z", "pf ks", 'stroke-width=".8"') +
      `<ellipse cx="270" cy="70" rx="56" ry="54" fill="url(#pl-fire)"/>` +
      path("M262 26L270 22L284 102L278 104Z", "v ks", 'stroke-width=".6"') +
      flames(262, 288, 70, 6, 14, 41, "v", false) +
      path("M270 104L292 98", "gs", 'stroke-width="3" stroke-linecap="round"') + path("M284 102L288 116", "gs", 'stroke-width="2.4" stroke-linecap="round"') +
      `<rect y="150" width="240" height="50" class="pf"/>` +
      path("M248 156C200 162 150 170 112 182S50 200 30 200H70C94 196 140 186 180 176S236 166 252 162Z", "h3 ks", 'stroke-width=".5"') +
      grass(10, 230, 156, 23, 40) +
      figure(140, 184, 32, "k", -1.5) + figure(152, 184, 29, "k", -1.5) + path("M144.5 166Q146 170 148 166", "ks", 'stroke-width="1.6"'),
  };

  // The title plate: Milton's universe, top to bottom.
  function cosmos() {
    const W = 240, H = 320;
    const towers = Array.from({ length: 9 }, (_, i) => { const x = 50 + i * 17.5, h = i % 2 ? 10 : 16; return `<rect x="${r(x - 4)}" y="${52 - h}" width="8" height="${h}" class="pf ks" stroke-width=".6"/><path d="M${r(x - 4)} ${52 - h}l2-3 2 3 2-3 2 3" class="ks" stroke-width=".5" fill="none"/>`; }).join("");
    const inner =
      `<rect width="${W}" height="${H}" fill="url(#pl-dots)" opacity=".75"/>` +
      spiral(52, 120, 22, 2.2) + spiral(196, 190, 24, 2.3) + spiral(60, 214, 16, 2) + spiral(190, 104, 14, 2) +
      `<rect width="${W}" height="62" class="pf"/>` +
      `<ellipse cx="120" cy="40" rx="120" ry="58" fill="url(#pl-glow)"/>` + rays(120, 30, 46, 26, 110, 180, 360, "gs", 0.5) +
      towers + `<rect x="36" y="52" width="168" height="8" class="h1 ks" stroke-width=".6"/>` +
      `<text x="120" y="24" class="lab" text-anchor="middle">Heaven</text>` +
      chain(120, 60, 132) + `<ellipse cx="120" cy="146" rx="34" ry="30" fill="url(#pl-glow)"/>` + globe(120, 146, 15) +
      `<text x="120" y="178" class="lab sm" text-anchor="middle">The World</text>` +
      `<text x="56" y="160" class="lab sm" text-anchor="middle">Chaos</text>` +
      flyer(170, 236, 10) +
      `<rect y="258" width="${W}" height="62" class="h2"/>` + `<ellipse cx="120" cy="320" rx="130" ry="56" fill="url(#pl-fire)"/>` +
      flames(0, 250, 320, 12, 40, 51) +
      `<rect x="88" y="268" width="64" height="15" class="pf"/><text x="120" y="280" class="lab" text-anchor="middle">Hell</text>`;
    return plate(inner, "Milton’s universe: Heaven above, the World hung on a golden chain, Chaos, and Hell below", W, H);
  }

  const LABELS = {
    1: "Satan rising from the burning lake", 2: "The gates of Hell and the flight through Chaos",
    3: "Heaven’s light above the hanging World", 4: "Eden, with a cormorant on the Tree of Life",
    5: "Raphael descending to the bower", 6: "The chariot driving the rebels out of Heaven",
    7: "The golden compasses at the Creation", 8: "The spheres of the heavens",
    9: "The serpent on the tree of knowledge", 10: "The bridge over Chaos",
    11: "The ark, the rain and the rainbow", 12: "The flaming sword and the expulsion",
  };
  const cache = {};
  const bookPlate = (n) => (cache[n] ||= plate(SCENES[n](), LABELS[n]));

  // Printer's ornaments.
  const fleuron = () => `<svg viewBox="0 0 60 20" class="fleuron" aria-hidden="true"><path d="M30 4c4 6 4 10 0 12c-4-2-4-6 0-12zM30 10c6-5 14-6 22 0c-8 6-16 5-22 0zM30 10c-6-5-14-6-22 0c8 6 16 5 22 0z" class="v" opacity=".85"/><circle cx="4" cy="10" r="1.6" class="k"/><circle cx="56" cy="10" r="1.6" class="k"/></svg>`;
  const quill = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3C12 4 7 9 5.5 16.5L4 21l1.6-.6C7 15 10 11 15 8c-3 3.4-5.4 7-6.5 11C15 17 19 11 20 3z" fill="currentColor"/></svg>`;

  window.ART = { DEFS, bookPlate, cosmos, fleuron, quill, LABELS };
})();
