'use strict';
/* =========================================================
   Shape Motion Generator
   - 도형/SVG + 카피를 캔버스에 그려서 루프 애니메이션을 만든다
   - 설치 없이 브라우저에서 바로 동작 (index.html 더블클릭)
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TAU = Math.PI * 2;

const RATIOS = {
  '16:9': [1920, 1080], '6:4': [1920, 1280], '3:4': [1440, 1920],
  '4:5': [1536, 1920], '9:16': [1080, 1920], '1:1': [1920, 1920],
};

const FONTS = [
  ['Helvetica Neue', '"Helvetica Neue", Helvetica, Arial'],
  ['Inter Tight', '"Inter Tight"'],
  ['Archivo', '"Archivo"'],
  ['Space Grotesk', '"Space Grotesk"'],
  ['Syne', '"Syne"'],
  ['DM Serif Display', '"DM Serif Display"'],
  ['IBM Plex Mono', '"IBM Plex Mono"'],
  ['Noto Sans KR', '"Noto Sans KR"'],
  ['Black Han Sans', '"Black Han Sans"'],
];
const customFonts = [];

const SHAPES = {
  circle: '원', square: '사각형', triangle: '삼각형', star: '별', arch: '아치',
  plus: '플러스', ring: '링', pill: '캡슐', half: '반원', diamond: '다이아몬드',
};

const DEFAULT_STATE = {
  ratio: '16:9',
  duration: 6,
  bg: { mode: 'solid', color: '#EA3323', g1: '#EA3323', g2: '#FF9F0A', gtype: 'linear', angle: 135, fit: 'cover' },
  text: {
    content: 'OBJECTS &\nFREQUENCIES', font: 'Inter Tight', weight: 700, size: 170,
    lineHeight: 0.95, tracking: -20, align: 'center', color: '#000000', x: 50, y: 50,
  },
  graphics: [
    { id: 1, type: 'arch', color: '#000000', size: 16, count: 5 },
    { id: 2, type: 'circle', color: '#000000', size: 9, count: 4 },
  ],
  motion: { mode: 'drift', amount: 60, cycles: 1, spin: false, layer: 'xor', seed: 7 },
  textMotion: { mode: 'repel', amount: 55 },
  effect: { mode: 'glitch', amount: 45, mode2: 'none', amount2: 40 },
};

let state = loadState();
let nextId = Math.max(0, ...state.graphics.map(g => g.id)) + 1;
let bgImage = null;

/* ---------- 캔버스 준비 ---------- */
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; };
const [gC, gctx] = mk();   // 그래픽 레이어
const [tC, tctx] = mk();   // 카피 레이어
const [fC, fctx] = mk();   // 합성된 전경
const [xC, xctx] = mk();   // 효과용 임시
const mctx = document.createElement('canvas').getContext('2d'); // 글자 측정용

function resizeCanvases() {
  const [W, H] = RATIOS[state.ratio];
  for (const c of [canvas, gC, tC, fC, xC, eA, eB]) { c.width = W; c.height = H; }
  layoutKey = null;
  fitCanvas();
}
function fitCanvas() {
  const st = $('#stage');
  const cs = getComputedStyle(st);
  const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.max(0.02, Math.min(aw / canvas.width, ah / canvas.height));
  canvas.style.width = canvas.width * k + 'px';
  canvas.style.height = canvas.height * k + 'px';
  $('#zoomLabel').textContent = Math.round(k * 100) + '%';
  $('#dimLabel').textContent = `${canvas.width} × ${canvas.height}`;
}
window.addEventListener('resize', fitCanvas);

/* ---------- 결정적 난수 (같은 시드면 같은 배치) ---------- */
function rnd(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) + 0x9e37, 374761393) ^ Math.imul((b | 0) + 0x85eb, 668265263)
        ^ Math.imul((c | 0) + 0xc2b2, 2246822519) ^ Math.imul((state.motion.seed | 0) + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- 기본 도형 (중심 0,0 / 한 변 1) ---------- */
const pathCache = {};
function shapePath(type) {
  if (pathCache[type]) return pathCache[type];
  const p = new Path2D();
  let rule = 'nonzero';
  switch (type) {
    case 'circle': p.arc(0, 0, 0.5, 0, TAU); break;
    case 'square': p.rect(-0.5, -0.5, 1, 1); break;
    case 'triangle': p.moveTo(0, -0.5); p.lineTo(0.5, 0.45); p.lineTo(-0.5, 0.45); p.closePath(); break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.21 : 0.5, a = -Math.PI / 2 + i * Math.PI / 5;
        i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r + 0.04) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r + 0.04);
      }
      p.closePath(); break;
    case 'arch':
      p.moveTo(-0.5, 0.5); p.lineTo(-0.5, 0); p.arc(0, 0, 0.5, Math.PI, 0);
      p.lineTo(0.5, 0.5); p.lineTo(0.2, 0.5); p.lineTo(0.2, 0); p.arc(0, 0, 0.2, 0, Math.PI, true);
      p.lineTo(-0.2, 0.5); p.closePath(); break;
    case 'plus': {
      const t = 0.17;
      p.moveTo(-t, -0.5); p.lineTo(t, -0.5); p.lineTo(t, -t); p.lineTo(0.5, -t); p.lineTo(0.5, t);
      p.lineTo(t, t); p.lineTo(t, 0.5); p.lineTo(-t, 0.5); p.lineTo(-t, t); p.lineTo(-0.5, t);
      p.lineTo(-0.5, -t); p.lineTo(-t, -t); p.closePath(); break;
    }
    case 'ring': p.arc(0, 0, 0.5, 0, TAU); p.moveTo(0.28, 0); p.arc(0, 0, 0.28, 0, TAU); rule = 'evenodd'; break;
    case 'pill': {
      const r = 0.22;
      p.moveTo(-0.5 + r, -r); p.lineTo(0.5 - r, -r); p.arc(0.5 - r, 0, r, -Math.PI / 2, Math.PI / 2);
      p.lineTo(-0.5 + r, r); p.arc(-0.5 + r, 0, r, Math.PI / 2, -Math.PI / 2); p.closePath(); break;
    }
    case 'half': p.moveTo(-0.5, 0.25); p.arc(0, 0.25, 0.5, Math.PI, 0); p.closePath(); break;
    case 'diamond': p.moveTo(0, -0.5); p.lineTo(0.38, 0); p.lineTo(0, 0.5); p.lineTo(-0.38, 0); p.closePath(); break;
  }
  return (pathCache[type] = { p, rule });
}

/* ---------- SVG 처리 ---------- */
function prepareSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('SVG 형식이 아니에요');
  const vb = svg.getAttribute('viewBox');
  const wa = svg.getAttribute('width') || '', ha = svg.getAttribute('height') || '';
  let w = parseFloat(wa), h = parseFloat(ha);
  if (vb) {
    const v = vb.trim().split(/[\s,]+/).map(Number);
    if (!w || !h || /%/.test(wa + ha)) { w = v[2]; h = v[3]; }
  }
  if (!w || !h) { w = h = 100; }
  if (!vb) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const k = 1024 / Math.max(w, h);
  svg.setAttribute('width', w * k);
  svg.setAttribute('height', h * k);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { src: new XMLSerializer().serializeToString(svg), w: w * k, h: h * k };
}
function loadSvgImage(item) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { item._img = img; item._spriteKey = null; res(item); };
    img.onerror = () => rej(new Error('SVG를 읽을 수 없어요'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.svgSrc);
  });
}
function getSprite(item) {
  if (!item._img) return null;
  const key = item.keep ? 'keep' : item.color;
  if (item._sprite && item._spriteKey === key) return item._sprite;
  const c = item._sprite || document.createElement('canvas');
  c.width = Math.round(item.svgW); c.height = Math.round(item.svgH);
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(item._img, 0, 0, c.width, c.height);
  if (!item.keep) {
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = item.color;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
  }
  item._sprite = c; item._spriteKey = key;
  return c;
}

function drawItem(c, item, x, y, size, rot = 0) {
  if (size <= 0.5) return;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (item.type === 'svg') {
    const s = getSprite(item);
    if (s) {
      const k = size / Math.max(s.width, s.height);
      c.drawImage(s, -s.width * k / 2, -s.height * k / 2, s.width * k, s.height * k);
    }
  } else {
    const { p, rule } = shapePath(item.type);
    c.scale(size, size);
    c.fillStyle = item.color;
    c.fill(p, rule);
  }
  c.restore();
}

/* ---------- 카피 레이아웃 (글자 하나하나의 위치 계산) ---------- */
let layoutKey = null, layoutCache = null, fontVersion = 0;
function fontStack(name) {
  const f = FONTS.find(f => f[0] === name);
  return (f ? f[1] : `"${name}"`) + ', "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
}
function getLayout(W, H) {
  const T = state.text;
  const key = JSON.stringify(T) + W + 'x' + H + '|' + fontVersion;
  if (key === layoutKey) return layoutCache;
  const font = `${T.weight} ${T.size}px ${fontStack(T.font)}`;
  mctx.font = font;
  const capH = mctx.measureText('H').actualBoundingBoxAscent || T.size * 0.7;
  const track = T.tracking / 1000 * T.size;
  const lines = T.content.split('\n');
  const lineAdv = T.size * T.lineHeight;
  const widths = lines.map(l => {
    const n = [...l].length;
    return n ? mctx.measureText(l).width + track * (n - 1) : 0;
  });
  const blockW = Math.max(0, ...widths);
  const blockH = capH + (lines.length - 1) * lineAdv;
  const cx = T.x / 100 * W, cy = T.y / 100 * H;
  const left = cx - blockW / 2, top = cy - blockH / 2;
  const letters = [];
  lines.forEach((line, li) => {
    const chars = [...line];
    const lw = widths[li];
    const x0 = T.align === 'left' ? left : T.align === 'right' ? left + blockW - lw : left + (blockW - lw) / 2;
    const base = top + capH + li * lineAdv;
    let prefix = '';
    chars.forEach((ch, ci) => {
      const x = x0 + mctx.measureText(prefix).width + track * ci;
      const w = mctx.measureText(ch).width;
      prefix += ch;
      letters.push({ ch, x, w, base, cx: x + w / 2, cy: base - capH / 2, space: /\s/.test(ch) });
    });
  });
  layoutCache = { font, capH, letters, blockW, blockH, cx, cy, left, top };
  layoutKey = key;
  return layoutCache;
}

/* ---------- 그래픽 배치 + 움직임 ---------- */
function buildInstances(W, H, p, layout) {
  const M = state.motion, a = M.amount / 100, cyc = M.cycles, S = Math.min(W, H);
  const items = state.graphics;
  const out = [];
  if (!items.length) return out;

  if (M.mode === 'grid') {
    const maxSize = Math.max(...items.map(g => g.size)) / 100 * S;
    const cell = Math.max(S * 0.04, maxSize * 1.15);
    const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
    const ox = (W - (cols - 1) * cell) / 2, oy = (H - (rows - 1) * cell) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const item = items[(r + c) % items.length];
      const ph = TAU * cyc * p - (c + r) * 0.45;
      const s = 1 - a * (0.5 + 0.5 * Math.sin(ph));
      const rot = M.spin ? TAU * cyc * p * ((r + c) % 2 ? 1 : -1) : 0;
      out.push({ item, x: ox + c * cell, y: oy + r * cell, size: item.size / 100 * S * s, rot });
    }
    return out;
  }

  const all = [];
  items.forEach(it => { for (let k = 0; k < it.count; k++) all.push({ it, j: all.length }); });
  const N = all.length;
  const Ls = layout.letters.filter(l => !l.space);

  for (const { it, j } of all) {
    const r1 = rnd(j, 1), r2 = rnd(j, 2), r3 = rnd(j, 3), r4 = rnd(j, 4);
    const size = it.size / 100 * S;
    let x = W / 2, y = H / 2, s = 1;
    switch (M.mode) {
      case 'drift': {
        const fx = 1 + Math.floor(r3 * 2), fy = 1 + Math.floor(r4 * 2);
        x = W * (0.12 + 0.76 * r1) + Math.sin(TAU * (cyc * p * fx + r3)) * W * 0.28 * a;
        y = H * (0.12 + 0.76 * r2) + Math.cos(TAU * (cyc * p * fy + r4)) * H * 0.28 * a;
        break;
      }
      case 'sweep': {
        let q = (cyc * p + r1) % 1;
        if (j % 2) q = 1 - q;
        x = -size + q * (W + 2 * size);
        y = H * (j + 0.5) / N + Math.sin(TAU * (cyc * p * 2 + r3)) * H * 0.08 * a;
        break;
      }
      case 'fall': {
        const q = (cyc * p + r2) % 1;
        x = W * (j + 0.5) / N + (r1 - 0.5) * W / N * 0.6 + Math.sin(TAU * (cyc * p + r3)) * size * 0.6 * a;
        y = -size + q * (H + 2 * size);
        break;
      }
      case 'orbit': {
        const ang = TAU * (cyc * p + j / N);
        const rx = layout.blockW / 2 * (0.4 + a) + size * 0.3;
        const ry = layout.blockH / 2 * (0.5 + a * 1.4) + size * 0.3;
        x = layout.cx + Math.cos(ang) * rx;
        y = layout.cy + Math.sin(ang) * ry;
        break;
      }
      case 'letters': {
        if (!Ls.length) break;
        const hops = 4 * cyc, seg = p * hops, idx = Math.floor(seg), e = ease(seg - idx);
        const A = Ls[Math.floor(rnd(j, idx % hops, 9) * Ls.length)];
        const B = Ls[Math.floor(rnd(j, (idx + 1) % hops, 9) * Ls.length)];
        x = lerp(A.cx, B.cx, e);
        y = lerp(A.cy, B.cy, e) - Math.sin(Math.PI * e) * size * (0.3 + a * 1.5);
        break;
      }
      case 'pulse': {
        x = W * (0.12 + 0.76 * r1); y = H * (0.12 + 0.76 * r2);
        s = 1 + a * 0.6 * Math.sin(TAU * (cyc * p + r3));
        break;
      }
    }
    const rot = M.spin ? TAU * cyc * p * (r4 < 0.5 ? 1 : -1) + r3 * TAU : 0;
    out.push({ item: it, x, y, size: size * s, rot });
  }
  return out;
}

/* ---------- 카피 그리기 (글자별 움직임) ---------- */
function drawText(c, layout, inst, p, t, W, H) {
  const TM = state.textMotion, a = TM.amount / 100, T = state.text;
  const q = (state.motion.cycles * p) % 1;
  c.font = layout.font;
  c.textBaseline = 'alphabetic';
  c.fillStyle = T.color;
  c.strokeStyle = T.color;
  c.lineWidth = Math.max(1.5, T.size * 0.016);
  c.lineJoin = 'round';
  const L = layout.letters, n = L.length;
  L.forEach((l, i) => {
    if (l.space) return;
    let dx = 0, dy = 0, s = 1, outline = false;
    switch (TM.mode) {
      case 'spread': {
        const env = Math.pow(Math.sin(Math.PI * q), 2);
        dx = (rnd(i, 11) - 0.5) * W * 0.6 * a * env;
        dy = (rnd(i, 12) - 0.5) * H * 0.25 * a * env;
        break;
      }
      case 'wave': dy = Math.sin(TAU * q - i * 0.4) * T.size * 0.45 * a; break;
      case 'pulse': s = 1 + 0.6 * a * Math.sin(TAU * q - i * 0.3); break;
      case 'outline': outline = rnd(i, Math.floor(t * 6) + 100) < 0.15 + 0.6 * a; break;
      case 'type': {
        const k = i / Math.max(1, n);
        if (q < 0.5 && k >= q / 0.45) return;
        if (q > 0.8 && k < (q - 0.8) / 0.18) return;
        break;
      }
      case 'repel': {
        for (const g of inst) {
          const ddx = l.cx - g.x, ddy = l.cy - g.y;
          const d = Math.hypot(ddx, ddy) || 1;
          const R = g.size * (0.55 + a * 0.6);
          if (d < R) {
            const f = Math.pow((R - d) / R, 1.6);
            dx += ddx / d * f * R * (0.3 + a * 0.6);
            dy += ddy / d * f * R * (0.3 + a * 0.6);
          }
        }
        break;
      }
    }
    c.save();
    c.translate(l.cx + dx, l.cy + dy);
    if (s !== 1) c.scale(s, s);
    if (outline) c.strokeText(l.ch, -l.w / 2, layout.capH / 2);
    else c.fillText(l.ch, -l.w / 2, layout.capH / 2);
    c.restore();
  });
}

/* ---------- 배경 ---------- */
function drawBg(c, W, H) {
  const B = state.bg;
  if (B.mode === 'gradient') {
    let g;
    if (B.gtype === 'radial') {
      g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    } else {
      const th = B.angle * Math.PI / 180;           // CSS처럼 0° = 아래→위
      const dx = Math.sin(th), dy = -Math.cos(th);
      const half = Math.abs(W / 2 * dx) + Math.abs(H / 2 * dy);
      g = c.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
    }
    g.addColorStop(0, B.g1); g.addColorStop(1, B.g2);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return;
  }
  c.fillStyle = B.color;
  c.fillRect(0, 0, W, H);
  if (B.mode === 'image' && bgImage) {
    const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
    const k = B.fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
    c.drawImage(bgImage, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
  }
}

/* ---------- 화면 효과 ----------
   각 효과는 원본(s)을 받아서 빈 캔버스(d)에 결과를 그린다.
   a = 강도(0~1), q = 루프 진행도(0~1), t = 현재 시간(초), u = 해상도 배율 */
const [eA] = mk();   // 1번 효과 결과
const [eB] = mk();   // 2번 효과 결과
const smallC = document.createElement('canvas');
const sctx = smallC.getContext('2d', { willReadFrequently: true });
const osc = q => 0.5 - 0.5 * Math.cos(TAU * q);   // 루프 처음과 끝이 0인 부드러운 곡선

const EFFECTS = {
  /* --- 왜곡 --- */
  glitch(d, s, W, H, a, q, t) {
    const env = 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * q), 2);
    const step = Math.floor(t * 12);
    let y = 0, b = 0;
    while (y < H) {
      const h = Math.min(H - y, Math.max(2, H * (0.008 + 0.1 * rnd(step, b, 1))));
      let dx = 0;
      if (rnd(step, b, 2) < (0.2 + 0.5 * a) * env) dx = (rnd(step, b, 3) - 0.5) * W * 0.4 * a;
      if (rnd(step, b, 4) < 0.15 * a * env) {   // 한 줄을 늘려서 줄무늬
        d.imageSmoothingEnabled = false;
        d.drawImage(s, 0, y, W, 1, dx, y, W, h);
        d.imageSmoothingEnabled = true;
      } else d.drawImage(s, 0, y, W, h, dx, y, W, h);
      y += h; b++;
    }
  },
  wave(d, s, W, H, a, q, t, u) {
    const strip = Math.max(2, Math.round(3 * u));
    for (let y = 0; y < H; y += strip) {
      const h = Math.min(strip, H - y);
      const dx = Math.sin(y / H * TAU * 2.5 + TAU * q) * W * 0.08 * a;
      d.drawImage(s, 0, y, W, h, dx, y, W, h);
    }
  },
  smear(d, s, W, H, a, q) {
    const y0 = Math.floor(H * (0.12 + 0.76 * osc(q)));
    const len = Math.floor(Math.min(H - y0, H * (0.08 + 0.7 * a) * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * q * 2), 2))));
    if (y0 > 0) d.drawImage(s, 0, 0, W, y0, 0, 0, W, y0);
    d.imageSmoothingEnabled = false;
    if (len > 0) d.drawImage(s, 0, y0, W, 1, 0, y0, W, len);
    d.imageSmoothingEnabled = true;
    const rest = H - y0 - len;
    if (rest > 0) d.drawImage(s, 0, y0 + len, W, rest, 0, y0 + len, W, rest);
  },
  liquid(d, s, W, H, a, q, t, u) {
    const blur = (2 + 26 * a * osc(q)) * u;
    xctx.clearRect(0, 0, W, H);
    xctx.filter = `blur(${blur.toFixed(1)}px)`;
    xctx.drawImage(s, 0, 0);
    xctx.filter = 'none';
    d.filter = 'url(#goo)';
    d.drawImage(xC, 0, 0);
    d.filter = 'none';
  },
  mirror(d, s, W, H, a, q) {
    const ax = Math.round(W * (0.5 + 0.3 * a * Math.sin(TAU * q)));
    d.drawImage(s, 0, 0, ax, H, 0, 0, ax, H);
    d.save();
    d.translate(2 * ax, 0);
    d.scale(-1, 1);
    d.drawImage(s, 0, 0, ax, H, 0, 0, ax, H);
    d.restore();
  },
  jitter(d, s, W, H, a, q, t) {
    const st = Math.floor(t * 8);
    const dx = (rnd(st, 1, 51) - 0.5) * W * 0.035 * a, dy = (rnd(st, 2, 51) - 0.5) * H * 0.035 * a;
    const r = (rnd(st, 3, 51) - 0.5) * 0.07 * a, k = 1 + (rnd(st, 4, 51) - 0.5) * 0.07 * a;
    d.save();
    d.translate(W / 2 + dx, H / 2 + dy);
    d.rotate(r);
    d.scale(k, k);
    d.drawImage(s, -W / 2, -H / 2);
    d.restore();
  },

  /* --- 반복 · 패턴 --- */
  echo(d, s, W, H, a, q) {
    const n = 2 + Math.round(5 * a);
    const amp = (0.008 + 0.03 * a) * Math.max(W, H) * (0.3 + 0.7 * Math.abs(Math.sin(TAU * q)));
    const dx = Math.cos(TAU * q) * amp, dy = Math.sin(TAU * q) * amp;
    d.globalCompositeOperation = 'xor';     // 겹칠수록 번갈아 비워져서 등고선처럼 보임
    for (let i = n; i >= 0; i--) d.drawImage(s, dx * i, dy * i);
    d.globalCompositeOperation = 'source-over';
  },
  tiles(d, s, W, H, a, q, t) {
    const cols = 3 + Math.round(9 * a);
    const rows = Math.max(1, Math.round(H / (W / cols)));
    const st = Math.floor(t * 3);
    const X = i => Math.round(i * W / cols), Y = i => Math.round(i * H / rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const id = r * 97 + c;
      let sc = c, sr = r;
      if (rnd(id, st, 31) < 0.2 + 0.5 * a) {
        if (rnd(id, st, 32) < 0.5) sc = (c + 1 + Math.floor(rnd(id, st, 33) * (cols - 1))) % cols;
        else sr = (r + 1 + Math.floor(rnd(id, st, 34) * (rows - 1))) % rows;
      }
      const w = X(c + 1) - X(c), h = Y(r + 1) - Y(r);
      d.drawImage(s, X(sc), Y(sr), w, h, X(c), Y(r), w, h);
    }
  },
  stripes(d, s, W, H, a, q, t, u) {
    d.drawImage(s, 0, 0);
    const P = (14 + 70 * a) * u;
    const fill = 0.5 + 0.42 * Math.sin(TAU * q);
    const diag = Math.hypot(W, H), off = (q * P * 4) % P;
    d.globalCompositeOperation = 'destination-in';
    d.save();
    d.translate(W / 2, H / 2);
    d.rotate(-0.6);
    d.beginPath();
    for (let y = -diag / 2 - P + off; y < diag / 2 + P; y += P) d.rect(-diag / 2, y, diag, P * fill);
    d.fillStyle = '#000';
    d.fill();
    d.restore();
    d.globalCompositeOperation = 'source-over';
  },

  /* --- 질감 --- */
  mosaic(d, s, W, H, a, q, t, u) {
    const px = Math.max(1, Math.round((1 + 46 * a * osc(q)) * u));
    const sw = Math.ceil(W / px), sh = Math.ceil(H / px);
    xctx.clearRect(0, 0, W, H);
    xctx.drawImage(s, 0, 0, sw, sh);
    d.imageSmoothingEnabled = false;
    d.drawImage(xC, 0, 0, sw, sh, 0, 0, sw * px, sh * px);
    d.imageSmoothingEnabled = true;
  },
  halftone(d, s, W, H, a, q, t, u) {
    const cell = Math.max(5, (9 + 28 * a * osc(q)) * u);
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    smallC.width = cols; smallC.height = rows;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(s, 0, 0, cols, rows);
    const px = sctx.getImageData(0, 0, cols, rows).data;
    const groups = new Map();   // 같은 색 점끼리 묶어서 한 번에 칠함
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4, al = px[i + 3];
      if (al < 14) continue;
      const key = `rgb(${px[i] >> 3 << 3},${px[i + 1] >> 3 << 3},${px[i + 2] >> 3 << 3})`;
      let path = groups.get(key);
      if (!path) groups.set(key, (path = new Path2D()));
      const r = cell * 0.62 * Math.sqrt(al / 255), cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
      path.moveTo(cx + r, cy);
      path.arc(cx, cy, r, 0, TAU);
    }
    for (const [color, path] of groups) { d.fillStyle = color; d.fill(path); }
  },
  dissolve(d, s, W, H, a, q, t, u) {
    const cell = Math.max(2, Math.round((3 + 10 * a) * u));
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    const th = (0.15 + 0.85 * a) * osc(q);
    smallC.width = cols; smallC.height = rows;
    const img = sctx.createImageData(cols, rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const n = rnd(x, y, 77) * 0.6 + (y / rows) * 0.4;   // 아래쪽부터 부스러지듯 사라짐
      img.data[(y * cols + x) * 4 + 3] = n >= th ? 255 : 0;
    }
    sctx.putImageData(img, 0, 0);
    d.drawImage(s, 0, 0);
    d.globalCompositeOperation = 'destination-in';
    d.imageSmoothingEnabled = false;
    d.drawImage(smallC, 0, 0, cols * cell, rows * cell);
    d.imageSmoothingEnabled = true;
    d.globalCompositeOperation = 'source-over';
  },
  outline(d, s, W, H, a, q, t, u) {
    const th = Math.max(1, (1.5 + 8 * a * (0.5 + 0.5 * Math.sin(TAU * q))) * u);
    for (let i = 0; i < 12; i++) {
      const an = i * TAU / 12;
      d.drawImage(s, Math.cos(an) * th, Math.sin(an) * th);
    }
    d.globalCompositeOperation = 'destination-out';
    d.drawImage(s, 0, 0);
    d.globalCompositeOperation = 'source-over';
  },
};

function runEffect(mode, amount, src, dst) {
  const fn = EFFECTS[mode];
  if (!fn) return src;
  const W = dst.width, H = dst.height, d = dst.getContext('2d');
  d.clearRect(0, 0, W, H);
  const q = (state.motion.cycles * ((time / state.duration) % 1)) % 1;
  fn(d, src, W, H, amount / 100, q, time, Math.max(W, H) / 1920);
  return dst;
}

/* ---------- 한 프레임 그리기 ---------- */
function render() {
  const W = canvas.width, H = canvas.height;
  const p = (time / state.duration) % 1;
  const layout = getLayout(W, H);
  const inst = buildInstances(W, H, p, layout);

  gctx.clearRect(0, 0, W, H);
  for (const g of inst) drawItem(gctx, g.item, g.x, g.y, g.size, g.rot);
  tctx.clearRect(0, 0, W, H);
  drawText(tctx, layout, inst, p, time, W, H);

  fctx.clearRect(0, 0, W, H);
  const order = state.motion.layer;
  if (order === 'xor') {
    fctx.drawImage(gC, 0, 0);
    fctx.globalCompositeOperation = 'xor';   // 겹친 부분은 비워져서 배경색이 드러남
    fctx.drawImage(tC, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
  } else if (order === 'text') {
    fctx.drawImage(gC, 0, 0); fctx.drawImage(tC, 0, 0);
  } else {
    fctx.drawImage(tC, 0, 0); fctx.drawImage(gC, 0, 0);
  }

  let out = runEffect(state.effect.mode, state.effect.amount, fC, eA);
  out = runEffect(state.effect.mode2, state.effect.amount2, out, out === eA ? eB : eA);
  drawBg(ctx, W, H);
  ctx.drawImage(out, 0, 0);
}

/* ---------- 재생 루프 ---------- */
let time = 0, playing = true, last = performance.now();
let recorder = null, recElapsed = 0;
const scrub = $('#scrub'), timeLabel = $('#timeLabel'), playBtn = $('#playBtn');

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && !scrubbing) {
    time += dt;
    if (recorder) {
      recElapsed += dt;
      $('#recLabel').textContent = `녹화 중 ${Math.min(99, Math.floor(recElapsed / state.duration * 100))}%`;
      if (recElapsed >= state.duration) { time = 0; render(); stopRecording(); }
    }
    if (time >= state.duration) time %= state.duration;
  }
  render();
  scrub.value = time / state.duration;
  setFill(scrub);
  timeLabel.textContent = `${time.toFixed(1)} / ${state.duration.toFixed(1)}초`;
  requestAnimationFrame(frame);
}

function setPlaying(v) {
  playing = v;
  playBtn.classList.toggle('paused', !v);
}
playBtn.onclick = () => setPlaying(!playing);
let scrubbing = false;
scrub.addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
scrub.addEventListener('input', () => { time = +scrub.value * state.duration; });
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'color'].includes(document.activeElement.type))) return;
  e.preventDefault();
  setPlaying(!playing);
});

/* ---------- 캔버스 드래그로 카피 이동 ---------- */
let drag = null;
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  drag = { x: e.clientX, y: e.clientY, tx: state.text.x, ty: state.text.y, w: r.width, h: r.height };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const clamp = v => Math.max(0, Math.min(100, Math.round(v * 2) / 2));
  state.text.x = clamp(drag.tx + (e.clientX - drag.x) / drag.w * 100);
  state.text.y = clamp(drag.ty + (e.clientY - drag.y) / drag.h * 100);
  syncUI();
  save();
});
canvas.addEventListener('pointerup', () => { drag = null; });

/* ---------- 상태 경로 도우미 ---------- */
const getPath = path => path.split('.').reduce((o, k) => o[k], state);
function setPath(path, v) {
  const ks = path.split('.'), lastK = ks.pop();
  ks.reduce((o, k) => o[k], state)[lastK] = v;
}
function setFill(r) {
  const min = +r.min || 0, max = +r.max || 1;
  r.style.setProperty('--p', ((+r.value - min) / (max - min) * 100) + '%');
}
function fmt(path, v, unit) {
  if (path === 'text.tracking') return (v > 0 ? '+' : '') + v;
  if (typeof v === 'number' && !Number.isInteger(v)) v = +v.toFixed(2);
  return v + (unit || '');
}

/* ---------- UI 바인딩 ---------- */
function onChange(path) {
  if (path === 'ratio') resizeCanvases();
  if (path.startsWith('text.')) { layoutKey = null; loadFont(); }
  if (path === 'duration') time = Math.min(time, state.duration);
  syncUI();
  save();
}

function bindControls() {
  $$('[data-bind]').forEach(el => {
    const path = el.dataset.bind;
    if (el.classList.contains('segmented')) {
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        setPath(path, el.hasAttribute('data-num') ? +b.dataset.v : b.dataset.v);
        onChange(path);
      });
      return;
    }
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'number' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'range') v = +v;
      if (el.type === 'number') {   // 숫자 칸: 범위를 벗어나면 끝값으로 맞춤
        v = parseFloat(v);
        if (Number.isNaN(v)) { syncUI(); return; }
        v = Math.min(+el.max, Math.max(+el.min, v));
      }
      setPath(path, v);
      onChange(path);
    });
  });
  $$('[data-hex]').forEach(el => {
    el.addEventListener('change', () => {
      let v = el.value.trim().replace(/^#?/, '#');
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
      if (/^#[0-9a-f]{6}$/i.test(v)) { setPath(el.dataset.hex, v.toUpperCase()); onChange(el.dataset.hex); }
      else el.value = getPath(el.dataset.hex);
    });
  });
}

function syncUI() {
  $$('[data-bind]').forEach(el => {
    const v = getPath(el.dataset.bind);
    if (el.classList.contains('segmented')) {
      $$('button', el).forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(v)));
    } else if (el.type === 'checkbox') {
      el.checked = !!v;
    } else if (document.activeElement !== el || el.type === 'range') {
      if (el.value !== String(v)) el.value = v;
      if (el.type === 'range') setFill(el);
    }
  });
  $$('[data-hex]').forEach(el => { if (document.activeElement !== el) el.value = getPath(el.dataset.hex); });
  $$('[data-out]').forEach(el => { el.textContent = fmt(el.dataset.out, getPath(el.dataset.out), el.dataset.unit); });
  $$('[data-show]').forEach(el => {
    const [path, vals] = el.dataset.show.split(':');
    el.hidden = !vals.split(',').includes(String(getPath(path)));
  });
  $$('[data-hide]').forEach(el => {
    const [path, vals] = el.dataset.hide.split(':');
    el.hidden = vals.split(',').includes(String(getPath(path)));
  });
}

/* 탭 */
$('#tabSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#tabSeg button').forEach(x => x.classList.toggle('on', x === b));
  $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.v; });
  $('#panelTitle').textContent = b.title;
  $('.inspector').scrollTop = 0;
});

/* 섹션 접기/펼치기 */
$$('.sec-head').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed')));

/* 캔버스 크게 보기 */
$('#fullBtn').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#stage').requestFullscreen?.();
};
document.addEventListener('fullscreenchange', () => setTimeout(fitCanvas, 50));
if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe($('#stage'));

/* ---------- 폰트 ---------- */
function fillFontSelect() {
  const sel = $('#fontSelect');
  sel.innerHTML = '';
  [...FONTS.map(f => f[0]), ...customFonts].forEach(name => {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    sel.appendChild(o);
  });
}
function loadFont() {
  const T = state.text;
  if (!document.fonts) return;
  document.fonts.load(`${T.weight} 100px ${fontStack(T.font)}`, T.content || 'A')
    .then(() => { fontVersion++; layoutKey = null; }).catch(() => {});
}
if (document.fonts) {
  document.fonts.addEventListener('loadingdone', () => { fontVersion++; layoutKey = null; });
  document.fonts.ready.then(() => { fontVersion++; layoutKey = null; });
}
$('#fontBtn').onclick = () => $('#fontInput').click();
$('#fontInput').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const name = file.name.replace(/\.[^.]+$/, '');
    const face = new FontFace(name, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    if (!customFonts.includes(name)) customFonts.push(name);
    fillFontSelect();
    state.text.font = name;
    onChange('text.font');
    toast(`‘${name}’ 폰트를 불러왔어요`);
  } catch (err) {
    toast('폰트 파일을 읽을 수 없어요');
  }
};

/* ---------- 그래픽 목록 ---------- */
function drawThumb(c, item, px) {
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = px + 'px';
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  drawItem(x, item, c.width / 2, c.height / 2, c.width * 0.72);
}

function buildShapeGrid() {
  const grid = $('#shapeGrid');
  Object.entries(SHAPES).forEach(([type, label]) => {
    const b = document.createElement('button');
    b.title = label + ' 추가';
    const c = document.createElement('canvas');
    drawThumb(c, { type, color: '#1C1C1E' }, 26);
    b.appendChild(c);
    b.onclick = () => {
      state.graphics.push({ id: nextId++, type, color: state.graphics.at(-1)?.color || '#000000', size: 12, count: 4 });
      renderGraphicList();
      save();
    };
    grid.appendChild(b);
  });
}

function renderGraphicList() {
  const list = $('#graphicList');
  list.innerHTML = '';
  if (!state.graphics.length) {
    list.innerHTML = '<div class="empty">위에서 도형을 고르거나 SVG를 올려 주세요.</div>';
    return;
  }
  state.graphics.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'layer';
    const name = item.type === 'svg' ? (item.name || 'SVG') : SHAPES[item.type];
    card.innerHTML = `
      <div class="head">
        <canvas class="thumb"></canvas>
        <div class="name">${escapeHtml(name)}<small>레이어 ${idx + 1}${item.type === 'svg' ? ' · SVG' : ''}</small></div>
        <input class="hex" value="${item.color}">
        <input type="color" value="${item.color}">
        <button class="del" title="삭제"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
      </div>
      <div class="row"><label>크기 %</label><div class="ctl">
        <input type="range" min="2" max="100" step="1" value="${item.size}">
        <input class="num" type="number" min="2" max="100" step="1" value="${item.size}"></div></div>
      <div class="row"><label>개수</label><div class="ctl"><span class="count">${item.count}</span>
        <div class="stepper"><button data-d="-1">−</button><button data-d="1">+</button></div></div></div>
      ${item.type === 'svg' ? '<div class="row"><label>원본 색</label><div class="ctl"><input type="checkbox" class="switch"' + (item.keep ? ' checked' : '') + '></div></div>' : ''}
    `;
    const thumb = $('.thumb', card);
    const redrawThumb = () => drawThumb(thumb, item, 34);
    redrawThumb();
    const color = $('input[type=color]', card), hex = $('.hex', card);
    color.oninput = () => { item.color = color.value.toUpperCase(); hex.value = item.color; redrawThumb(); save(); };
    hex.onchange = () => {
      const v = hex.value.trim().replace(/^#?/, '#');
      if (/^#[0-9a-f]{6}$/i.test(v)) { item.color = v.toUpperCase(); color.value = item.color; redrawThumb(); save(); }
      else hex.value = item.color;
    };
    $('.del', card).onclick = () => { state.graphics.splice(state.graphics.indexOf(item), 1); renderGraphicList(); save(); };
    const range = $('input[type=range]', card), num = $('.num', card);
    setFill(range);
    range.oninput = () => { item.size = +range.value; num.value = item.size; setFill(range); save(); };
    num.onchange = () => {
      const v = Math.round(parseFloat(num.value));
      if (!Number.isNaN(v)) item.size = Math.min(100, Math.max(2, v));
      num.value = range.value = item.size;
      setFill(range); save();
    };
    const cnt = $('.count', card);
    $$('.stepper button', card).forEach(b => b.onclick = () => {
      item.count = Math.max(1, Math.min(40, item.count + +b.dataset.d));
      cnt.textContent = item.count; save();
    });
    const sw = $('.switch', card);
    if (sw) sw.onchange = () => { item.keep = sw.checked; redrawThumb(); save(); };
    list.appendChild(card);
  });
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('#svgBtn').onclick = () => $('#svgInput').click();
$('#svgInput').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  let ok = 0;
  for (const f of files) {
    try {
      const { src, w, h } = prepareSvg(await f.text());
      const item = { id: nextId++, type: 'svg', name: f.name.replace(/\.svg$/i, ''), color: '#000000',
                     size: 18, count: 3, keep: false, svgSrc: src, svgW: w, svgH: h };
      await loadSvgImage(item);
      state.graphics.push(item);
      ok++;
    } catch (err) {
      toast(`${f.name}: ${err.message}`);
    }
  }
  if (ok) { renderGraphicList(); save(); toast(`SVG ${ok}개를 추가했어요`); }
};

/* ---------- 배경 이미지 ---------- */
$('#bgBtn').onclick = () => $('#bgInput').click();
$('#bgInput').onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const img = new Image();
  img.onload = () => { bgImage = img; $('#bgName').textContent = f.name; };
  img.onerror = () => toast('이미지를 읽을 수 없어요');
  img.src = URL.createObjectURL(f);
};
$('#swapGrad').onclick = () => {
  [state.bg.g1, state.bg.g2] = [state.bg.g2, state.bg.g1];
  onChange('bg.g1');
};
$('#shuffleBtn').onclick = () => { state.motion.seed = Math.floor(Math.random() * 100000); save(); };

/* ---------- 내보내기 ---------- */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileBase = () => `shape-motion_${state.ratio.replace(':', 'x')}_${state.duration}s`;

$('#pngBtn').onclick = () => {
  canvas.toBlob(b => b && download(b, fileBase() + '.png'), 'image/png');
};

$('#recBtn').onclick = () => {
  if (recorder) return;
  const types = ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = window.MediaRecorder && types.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) { toast('이 브라우저는 영상 저장을 지원하지 않아요. Chrome에서 열어 주세요.'); return; }
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 24_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    download(new Blob(chunks, { type: mime.split(';')[0] }), fileBase() + (mime.includes('mp4') ? '.mp4' : '.webm'));
    toast(mime.includes('mp4') ? 'MP4 영상을 저장했어요' : 'WebM 영상을 저장했어요');
  };
  time = 0; recElapsed = 0;
  setPlaying(true);
  render();
  rec.start(250);
  recorder = rec;
  const btn = $('#recBtn');
  btn.classList.add('rec');
  $('#recLabel').textContent = '녹화 중 0%';
};
function stopRecording() {
  const rec = recorder;
  recorder = null;
  setTimeout(() => rec.stop(), 60);
  const btn = $('#recBtn');
  btn.classList.remove('rec');
  $('#recLabel').textContent = '영상 내보내기';
}

/* ---------- 초기화 / 저장 ---------- */
$('#resetBtn').onclick = () => {
  if (!confirm('모든 설정을 처음 상태로 되돌릴까요?')) return;
  state = structuredClone(DEFAULT_STATE);
  nextId = 10;
  bgImage = null;
  $('#bgName').textContent = '없음';
  resizeCanvases();
  renderGraphicList();
  loadFont();
  syncUI();
  save();
};

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('smg-state', JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v)));
    } catch (e) { /* 저장 공간이 없어도 동작은 계속 */ }
  }, 300);
}
function loadState() {
  const base = structuredClone(DEFAULT_STATE);
  try {
    const s = JSON.parse(localStorage.getItem('smg-state'));
    if (!s) return base;
    for (const k of ['bg', 'text', 'motion', 'textMotion', 'effect']) Object.assign(base[k], s[k] || {});
    if (RATIOS[s.ratio]) base.ratio = s.ratio;
    if (s.duration) base.duration = s.duration;
    if (Array.isArray(s.graphics)) base.graphics = s.graphics;
    if (!FONTS.some(f => f[0] === base.text.font)) base.text.font = DEFAULT_STATE.text.font;
  } catch (e) { /* 저장된 값이 깨졌으면 기본값 사용 */ }
  return base;
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 효과 목록 ---------- */
const FX_GROUPS = [
  ['왜곡', [['glitch', '글리치 슬라이스'], ['wave', '웨이브 왜곡'], ['smear', '흘러내림'],
            ['liquid', '녹아내림 (블롭)'], ['mirror', '미러 대칭'], ['jitter', '스톱모션 떨림']]],
  ['반복 · 패턴', [['echo', '잔상 반복'], ['tiles', '타일 셔플'], ['stripes', '사선 스트라이프']]],
  ['질감', [['mosaic', '픽셀 모자이크'], ['halftone', '하프톤 도트'], ['dissolve', '디졸브 (부스러짐)'], ['outline', '외곽선만']]],
];
// 잘 어울리는 조합: [메인, 강도, 보조, 강도]
const FX_COMBOS = [
  ['echo', 55, 'glitch', 35], ['outline', 50, 'stripes', 40], ['liquid', 60, 'jitter', 40],
  ['halftone', 45, 'wave', 30], ['tiles', 50, 'outline', 30], ['smear', 55, 'dissolve', 35],
  ['mirror', 60, 'echo', 40], ['glitch', 55, 'mosaic', 25], ['stripes', 55, 'jitter', 30],
  ['dissolve', 50, 'glitch', 30],
];
function fillFxSelects() {
  $$('.fx-select').forEach(sel => {
    sel.innerHTML = '<option value="none">없음</option>' + FX_GROUPS.map(([g, list]) =>
      `<optgroup label="${g}">${list.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</optgroup>`).join('');
  });
}
$('#fxRandom').onclick = () => {
  const cur = state.effect;
  let c;
  do { c = FX_COMBOS[Math.floor(Math.random() * FX_COMBOS.length)]; }
  while (FX_COMBOS.length > 1 && c[0] === cur.mode && c[2] === cur.mode2);
  [cur.mode, cur.amount, cur.mode2, cur.amount2] = c;
  onChange('effect.mode');
  const name = v => FX_GROUPS.flatMap(g => g[1]).find(x => x[0] === v)[1];
  toast(`${name(c[0])} + ${name(c[2])}`);
};

/* ---------- 시작 ---------- */
fillFxSelects();
fillFontSelect();
buildShapeGrid();
bindControls();
resizeCanvases();
Promise.all(state.graphics.filter(g => g.type === 'svg').map(g => loadSvgImage(g).catch(() => {})))
  .then(renderGraphicList);
renderGraphicList();
syncUI();
loadFont();
requestAnimationFrame(t => { last = t; frame(t); });
