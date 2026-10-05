/*
 * Black Icarus: a pixel-art loop in the style of 16-bit console RPGs.
 * He builds wings in his workshop, flies at the sun, the wax melts, he falls,
 * and he builds again. Everything is drawn in code: no image files, no models.
 *
 * Embed:  <div data-black-icarus></div><script src="icarus.js"></script>
 * Debug:  ?t=12.5 freezes the loop at 12.5 seconds.
 */
(function () {
  'use strict';

  const W = 256, H = 144;
  const TAU = Math.PI * 2;

  // ---------- small helpers ----------
  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const dith = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const mod = (n, m) => ((n % m) + m) % m;
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- character palette (sprites and the rig use these letters) ----------
  const PAL = {
    k: '#140c12', // outline
    d: '#3b2215', s: '#5e3820', S: '#86532f', // skin: shadow, base, light
    h: '#161018', H: '#3d3040', // hair
    w: '#efe8d6', W: '#a89eb6', // tunic
    g: '#eab53e', G: '#9a6818', // gold
    b: '#5a3920', // sandals
    f: '#fbf8f0', F: '#c4c7d8', q: '#7d84a0', // feathers
    x: '#f6ca4a', X: '#b07c1c', // wax
    r: '#7c4c26', R: '#4e2e16', // wood
    m: '#a3a9b6', M: '#59606e', // iron
    e: '#f4f0e8', // eye
  };
  const KEYS = Object.keys(PAL);
  const AC = new Uint32Array(KEYS.length + 1);
  const AI = {};
  KEYS.forEach((k, i) => { AI[k] = i + 1; AC[i + 1] = hex(PAL[k]); });

  // Head, facing right. The outline is added by the renderer.
  const HEAD = [
    '..hhHhHhh...',
    '.hHhhhHhhH..',
    'hhhHhhhhHhh.',
    'hHhhhHhhhhh.',
    'hgggggggggg.',
    'hhhhsSSSSSS.',
    'hhhdsSSekSS.',
    'hhhdsSSekSSS',
    'hhhssSSSSSS.',
    '.hhssSSSdSS.',
    '..hhsSSSSS..',
    '....sssss...',
  ];

  // 5x7 bitmap font
  const FONT = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
    '?': [14, 17, 1, 2, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
    ':': [0, 12, 12, 0, 12, 12, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
  };

  // Sky ramp, deep to sun-hot
  const SKY = ['#1b2462', '#263f8c', '#3a62b0', '#5f88cc', '#8fb0de', '#bfd2ea', '#f1dfb4', '#f6c46e', '#f29a45', '#fff2c4'].map(hex);
  const C = (h) => hex(h);
  const COL = {
    black: C('#08060c'), white: C('#f8f8f8'), shadow: C('#10123a'),
    mortar: C('#2b2230'), stoneA: C('#4b3f4f'), stoneB: C('#45394a'), stoneC: C('#514456'), stoneHi: C('#61536a'),
    archA: C('#7a6a7c'), archB: C('#695a6c'),
    floorTop: C('#8a5a34'), plank: C('#6a4226'), plankB: C('#623c22'), seam: C('#43281a'), plankLit: C('#97663c'), plankLitB: C('#8a5c36'),
    seaFoam: C('#cfe6fa'), seaHi: C('#7fb2e0'), seaA: C('#2f63a6'), seaB: C('#244f8e'), seaC: C('#1b3c74'), seaWave: C('#5e98d2'), glint: C('#f8e3a0'),
    island: C('#3c4f7c'), islandHi: C('#4e6596'),
    cloudL: C('#f2f4fb'), cloudS: C('#b6c0dc'), cloudWL: C('#fde7c2'), cloudWS: C('#e2a874'),
    sunCore: C('#fffbe6'), sunRing: C('#ffe58a'),
    rock: C('#3a3446'), rockHi: C('#544b62'), rockLo: C('#2a2534'),
    towerA: C('#8c8296'), towerB: C('#6c6378'), doorGlow: C('#f2b04c'),
    wood: C('#7c4c26'), woodHi: C('#9a6634'), woodLo: C('#4e2e16'),
    iron: C('#3a3038'), ironHi: C('#5a4e58'), pot: C('#2a2228'),
    flameA: C('#fff0a8'), flameB: C('#f6b03c'), flameC: C('#d8602a'),
    wax: C('#f6ca4a'), waxLo: C('#b07c1c'),
    chalk: C('#d9d2c8'), parch: C('#d8c8a0'), parchLine: C('#8a6a44'),
    vase: C('#b0552c'), vaseLo: C('#7a3418'), jar: C('#9a8a70'),
    candle: C('#ece4cc'), holder: C('#8a8a96'),
    feather: C('#fbf8f0'), featherLo: C('#7d84a0'), strut: C('#b07c1c'),
    splashA: C('#e8f4ff'), splashB: C('#9cc8ec'), speed: C('#e8f0ff'),
    winTop: C('#3848b8'), winBot: C('#141c78'), winEdge: C('#9098d0'),
    heap: C('#b9bccb'), heapLo: C('#6d7389'),
  };

  // ---------- the music (original, a minor-key march) ----------
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const N = { E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, C2: 36, D2: 38, E2: 40, F2: 41, G2: 43, A2: 45 };
  const LEAD = [
    ['A4', 2], ['C5', 2], ['E5', 3], ['D5', 1], ['C5', 2], ['B4', 2], ['A4', 4],
    ['F4', 2], ['A4', 2], ['C5', 3], ['B4', 1], ['A4', 2], ['G4', 2], ['E4', 4],
    ['A4', 2], ['C5', 2], ['E5', 2], ['A5', 2], ['G5', 3], ['F5', 1], ['E5', 4],
    ['D5', 2], ['E5', 2], ['F5', 2], ['D5', 2], ['E5', 8],
  ];
  const BASS = ['A2', 'A2', 'F2', 'E2', 'A2', 'C2', 'D2', 'E2'];

  function mount(el) {
    if (el.__blackIcarus) return el.__blackIcarus;

    // ---------- DOM ----------
    el.style.position = el.style.position || 'relative';
    const view = document.createElement('canvas');
    view.setAttribute('role', 'img');
    view.setAttribute('aria-label', 'Pixel-art animation: Black Icarus builds wings in his workshop, flies toward the sun, the wax melts and he falls into the sea, then he builds new wings and flies again.');
    view.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:16/9;image-rendering:pixelated;image-rendering:crisp-edges;background:#08060c;border-radius:inherit';
    el.appendChild(view);
    const vctx = view.getContext('2d');

    const low = document.createElement('canvas');
    low.width = W; low.height = H;
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(W, H);
    const frame = new Uint32Array(img.data.buffer);

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;gap:6px';
    const mkBtn = (label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'font:600 12px/1 ui-monospace,Consolas,monospace;letter-spacing:.5px;color:#f8f8f8;background:rgba(20,28,120,.85);border:2px solid #f0f0f0;border-radius:4px;padding:6px 8px;min-height:30px;cursor:pointer';
      bar.appendChild(b);
      return b;
    };
    const pauseBtn = mkBtn('PAUSE');
    const soundBtn = mkBtn('SOUND OFF');
    el.appendChild(bar);

    function resize() {
      const r = view.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const s = clamp(Math.round((r.width || W) * dpr / W), 1, 10);
      if (view.width !== W * s) { view.width = W * s; view.height = H * s; }
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(view);
    else window.addEventListener('resize', resize);

    // ---------- pixel primitives on the frame ----------
    function px(x, y, c) {
      x |= 0; y |= 0;
      if (x >= 0 && y >= 0 && x < W && y < H) frame[y * W + x] = c;
    }
    function rect(x, y, w, h, c) {
      for (let j = Math.max(0, y); j < Math.min(H, y + h); j++)
        for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) frame[j * W + i] = c;
    }

    // ---------- actor layer: parts are drawn, outlined, then stacked ----------
    const act = new Uint8Array(W * H), tmp = new Uint8Array(W * H);
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    function tset(x, y, c) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      tmp[y * W + x] = c;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    function commit() {
      if (bx1 < 0) return;
      const x0 = Math.max(0, bx0 - 1), x1 = Math.min(W - 1, bx1 + 1);
      const y0 = Math.max(0, by0 - 1), y1 = Math.min(H - 1, by1 + 1);
      const K = AI.k;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (tmp[i]) act[i] = tmp[i];
        else if ((x > 0 && tmp[i - 1]) || (x < W - 1 && tmp[i + 1]) || (y > 0 && tmp[i - W]) || (y < H - 1 && tmp[i + W])) act[i] = K;
      }
      for (let y = y0; y <= y1; y++) tmp.fill(0, y * W + x0, y * W + x1 + 1);
      bx0 = W; by0 = H; bx1 = -1; by1 = -1;
    }
    // Filled capsule between two points. color: a letter, or fn(u, ex, ey) -> letter
    function capsule(x1, y1, x2, y2, r, color) {
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-6;
      const minx = Math.floor(Math.min(x1, x2) - r - 1), maxx = Math.ceil(Math.max(x1, x2) + r + 1);
      const miny = Math.floor(Math.min(y1, y2) - r - 1), maxy = Math.ceil(Math.max(y1, y2) + r + 1);
      const fixed = typeof color === 'string' ? AI[color] : 0;
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px_ = x + 0.5 - x1, py_ = y + 0.5 - y1;
        const u = clamp((px_ * dx + py_ * dy) / L2, 0, 1);
        const ex = px_ - u * dx, ey = py_ - u * dy;
        if (ex * ex + ey * ey <= r * r) tset(x, y, fixed || AI[color(u, ex, ey)]);
      }
    }
    // Sprite with quarter-turn rotation, centred on (cx, cy)
    function sprite(rows, cx, cy, q) {
      const h = rows.length, w = rows[0].length;
      const rw = q & 1 ? h : w, rh = q & 1 ? w : h;
      const x0 = Math.round(cx - rw / 2), y0 = Math.round(cy - rh / 2);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const ch = rows[j][i];
        if (ch === '.') continue;
        let u, v;
        if (q === 1) { u = h - 1 - j; v = i; } else if (q === 2) { u = w - 1 - i; v = h - 1 - j; } else if (q === 3) { u = j; v = w - 1 - i; } else { u = i; v = j; }
        tset(x0 + u, y0 + v, AI[ch]);
      }
    }
    function flushActors() {
      for (let i = 0; i < act.length; i++) if (act[i]) frame[i] = AC[act[i]];
      act.fill(0);
    }

    const snap = (v) => Math.round(v) + 0.5;
    const dir = (a) => [Math.cos(a), Math.sin(a)];

    // A wing seen from the side. phi: 0 = raised, pi/2 = edge-on, >pi/2 = lowered.
    function wing(root, back, tail, phi, L, FL, melt, far) {
      const c = Math.cos(phi);
      const ex = back[0] * c * L + tail[0] * 0.32 * L, ey = back[1] * c * L + tail[1] * 0.32 * L;
      let fx = tail[0] + back[0] * c * 0.3, fy = tail[1] + back[1] * c * 0.3;
      const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
      const NF = 8;
      let shown = 0;
      for (let i = NF; i >= 1; i--) {
        const t = i / NF;
        if (melt > 0 && t > 1 - melt * 0.98) continue;
        shown++;
        const bx = root[0] + ex * t, by = root[1] + ey * t;
        const len = FL * (0.35 + 0.65 * Math.pow(t, 0.8)) * (1 - 0.3 * melt);
        const odd = i & 1;
        capsule(bx, by, bx + fx * len, by + fy * len, 1.05, (u) =>
          far ? (u > 0.7 ? 'q' : odd ? 'F' : 'q') : (u > 0.78 ? 'F' : odd ? 'f' : 'F'));
      }
      capsule(root[0], root[1], root[0] + ex, root[1] + ey, 0.9, far ? 'X' : 'x');
      commit();
      return { shown, tip: [root[0] + ex, root[1] + ey], root, ex, ey };
    }

    // The rig. Angles are screen radians (0 = right, pi/2 = down).
    function icarus(p) {
      const dT = dir(p.t);
      const back = [dT[1], -dT[0]];
      const tail = [-dT[0], -dT[1]];
      const hip = [snap(p.x), snap(p.y)];
      const at = (o, d, n) => [o[0] + d[0] * n, o[1] + d[1] * n];
      const neck = at(hip, dT, 11);
      const sh = at(hip, dT, 9.5);
      const headC = at(at(neck, dT, 5.2), back, 0.6);
      const limb = (o, a, l1, l2) => { const m = at(o, dir(a[0]), l1); return [m, at(m, dir(a[1]), l2)]; };
      const armF = limb(sh, p.aF, 5.5, 5.5), armB = limb(at(sh, back, 0.5), p.aB, 5.5, 5.5);
      const legF = limb(hip, p.lF, 6, 6), legB = limb(at(hip, back, 1.2), p.lB, 6, 6);
      const out = { hand: armF[1], sh, hip };

      if (p.wings) {
        const root = at(at(sh, back, 2.5), dT, 0.5);
        const farRoot = at(at(root, back, -1.5), dT, 1);
        wing(farRoot, back, tail, p.wings.phi + 0.18, p.wings.L, p.wings.FL, p.wings.melt, true);
      }
      capsule(sh[0] + back[0] * 0.5, sh[1] + back[1] * 0.5, armB[0][0], armB[0][1], 1.3, 's');
      capsule(armB[0][0], armB[0][1], armB[1][0], armB[1][1], 1.3, 's');
      commit();
      capsule(hip[0] + back[0], hip[1] + back[1], legB[0][0], legB[0][1], 1.4, 'd');
      capsule(legB[0][0], legB[0][1], legB[1][0], legB[1][1], 1.4, 'd');
      foot(legB[1], p.lB[1], 'b');
      commit();
      // torso with a short skirt below the hip
      const sk = at(hip, tail, 3.5);
      capsule(sk[0], sk[1], neck[0], neck[1], 4.1, (u, ex, ey) => {
        const side = ex * back[0] + ey * back[1];
        if (u > 0.3 && u < 0.4) return side > 1.6 ? 'G' : 'g';
        return side > 1.8 ? 'W' : 'w';
      });
      commit();
      capsule(hip[0], hip[1], legF[0][0], legF[0][1], 1.4, 's');
      capsule(legF[0][0], legF[0][1], legF[1][0], legF[1][1], 1.4, 's');
      foot(legF[1], p.lF[1], 'b');
      commit();
      const q = p.headQ != null ? p.headQ : mod(Math.round((p.t + Math.PI / 2) / (Math.PI / 2)), 4);
      sprite(HEAD, headC[0], headC[1], q);
      commit();
      if (p.wings) {
        const root = at(at(sh, back, 2.5), dT, 0.5);
        out.wing = wing(root, back, tail, p.wings.phi, p.wings.L, p.wings.FL, p.wings.melt, false);
      }
      capsule(sh[0], sh[1], armF[0][0], armF[0][1], 1.3, 'S');
      capsule(armF[0][0], armF[0][1], armF[1][0], armF[1][1], 1.3, 'S');
      if (p.hammer) {
        const fa = dir(p.aF[1]);
        const end = at(armF[1], fa, 7);
        commit();
        capsule(armF[1][0], armF[1][1], end[0], end[1], 0.6, 'r');
        commit();
        const pr = [-fa[1], fa[0]];
        capsule(end[0] - pr[0] * 3, end[1] - pr[1] * 3, end[0] + pr[0] * 3, end[1] + pr[1] * 3, 1.6, 'M');
        out.hammerHead = end;
      }
      commit();
      return out;
    }
    function foot(f, a, c) {
      const fwd = Math.cos(a) >= -0.2 ? 1 : -1;
      capsule(f[0], f[1], f[0] + 2.5 * fwd, f[1], 1.1, c);
    }

    // ---------- pose library ----------
    const DOWN = Math.PI / 2;
    function stand(x, y) {
      return { x, y, t: -DOWN, aF: [DOWN - 0.15, DOWN - 0.3], aB: [DOWN + 0.25, DOWN + 0.1], lF: [DOWN - 0.1, DOWN + 0.02], lB: [DOWN + 0.12, DOWN] };
    }

    // ---------- the workshop, drawn once ----------
    const ws = new Uint32Array(W * H);
    (function buildWorkshop() {
      const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) ws[y * W + x] = c; };
      const fill = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); };
      // stone wall
      for (let y = 0; y < 110; y++) {
        const row = (y / 8) | 0, off = (row & 1) * 8;
        for (let x = 0; x < W; x++) {
          const bx = ((x + off) / 16) | 0;
          const lx = (x + off) % 16, ly = y % 8;
          let c;
          if (ly === 7 || lx === 15) c = COL.mortar;
          else {
            const r = hash(bx, row);
            c = r < 0.33 ? COL.stoneA : r < 0.66 ? COL.stoneB : COL.stoneC;
            if (ly === 0 || lx === 0) c = COL.stoneHi;
            if (hash(x, y) < 0.04) c = COL.mortar;
          }
          set(x, y, c);
        }
      }
      // floor
      for (let y = 110; y < H; y++) for (let x = 0; x < W; x++) {
        const row = ((y - 111) / 6) | 0;
        const seamX = mod(x + row * 13, 34) === 0;
        let c = y === 110 ? COL.floorTop : (y - 111) % 6 === 5 || seamX ? COL.seam : hash(x >> 3, row) < 0.5 ? COL.plank : COL.plankB;
        // sunbeam from the doorway
        const beamL = 150 - (y - 110) * 1.2, beamR = 200 - (y - 110) * 0.4;
        if (y > 110 && x > beamL && x < beamR && dith(x, y) < 0.6 && c !== COL.seam) c = c === COL.plank ? COL.plankLit : COL.plankLitB;
        set(x, y, c);
      }
      // doorway to the balcony, with the sea outside
      const dx0 = 196, dx1 = 246, cx = 221, cy = 50, R = 25;
      for (let y = 20; y < 110; y++) for (let x = dx0 - 3; x <= dx1 + 3; x++) {
        const inArch = (y >= cy ? x >= dx0 && x <= dx1 : (x - cx) ** 2 + (y - cy) ** 2 <= R * R);
        const inRing = (y >= cy ? x >= dx0 - 3 && x <= dx1 + 3 : (x - cx) ** 2 + (y - cy) ** 2 <= (R + 3) ** 2);
        if (inArch) {
          let c;
          if (y >= 86) {
            const d = y - 86;
            c = d === 0 ? COL.seaHi : d < 5 ? COL.seaA : d < 12 ? COL.seaB : COL.seaC;
            if (d > 1 && mod(x * 3 + y * 7, 23) < 2) c = COL.seaWave;
            if (Math.abs(x - 234) < 4 && d > 0 && (x + y) % 3 === 0) c = COL.glint;
          } else {
            const v = 2.2 + (y - 22) / 64 * 4.2;
            const sd = Math.hypot(x - 234, y - 74);
            let vv = v + 2.6 * Math.exp(-sd / 10);
            const i = clamp(Math.floor(vv) + ((vv % 1) > dith(x, y) ? 1 : 0), 0, 9);
            c = SKY[i];
            if (sd < 5) c = COL.sunCore;
            if (y > 78 && y < 86 && x > 200 && x < 222 && y > 86 - (8 - Math.abs(x - 211) * 0.7)) c = y < 82 ? COL.islandHi : COL.island;
          }
          set(x, y, c);
        } else if (inRing && y < 110) {
          const blk = y >= cy ? ((y / 6) | 0) : ((Math.atan2(y - cy, x - cx) * 6) | 0);
          set(x, y, hash(blk, 7) < 0.5 ? COL.archA : COL.archB);
        }
      }
      // shelf with pottery
      fill(8, 36, 58, 2, COL.wood); fill(8, 36, 58, 1, COL.woodHi); fill(8, 38, 58, 1, COL.woodLo);
      fill(12, 38, 2, 4, COL.woodLo); fill(60, 38, 2, 4, COL.woodLo);
      // amphora
      const vase = (x0, w, h, c, lo) => {
        for (let j = 0; j < h; j++) {
          const t = j / h; const half = Math.round((w / 2) * Math.sin(Math.PI * (0.15 + 0.8 * t)));
          for (let i = -half; i <= half; i++) set(x0 + i, 35 - h + j, i < -half / 2 ? lo : c);
        }
        fill(x0 - 1, 35 - h - 1, 3, 1, lo);
      };
      vase(18, 7, 10, COL.vase, COL.vaseLo); fill(15, 29, 7, 1, COL.black);
      vase(30, 5, 7, COL.jar, COL.mortar);
      fill(38, 31, 8, 4, COL.parch); fill(38, 31, 1, 4, COL.parchLine); fill(45, 31, 1, 4, COL.parchLine);
      vase(54, 6, 12, COL.vase, COL.vaseLo); fill(51, 27, 7, 1, COL.black); fill(51, 30, 7, 1, COL.black);
      // wing sketches pinned to the wall
      fill(118, 30, 22, 16, COL.parch);
      for (let i = 0; i < 6; i++) { set(122 + i * 2, 41 - i, COL.parchLine); set(123 + i * 2, 41 - i, COL.parchLine); }
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) set(124 + i * 2, 42 - i + j, COL.parchLine);
      set(129, 30, COL.vase);
      // hanging tools
      fill(76, 44, 14, 3, COL.ironHi); for (let i = 0; i < 14; i += 2) set(76 + i, 47, COL.iron); fill(90, 43, 4, 5, COL.wood);
      fill(100, 42, 1, 12, COL.iron); fill(103, 42, 1, 12, COL.iron); fill(100, 42, 4, 1, COL.ironHi);
      for (let a = 0; a < TAU; a += 0.2) set(Math.round(108 + 3 * Math.cos(a)), Math.round(50 + 3 * Math.sin(a)), COL.parch);
      // brazier and wax pot
      fill(6, 98, 20, 4, COL.iron); fill(6, 98, 20, 1, COL.ironHi); fill(8, 102, 2, 8, COL.iron); fill(22, 102, 2, 8, COL.iron);
      fill(9, 86, 14, 9, COL.pot); fill(8, 86, 16, 1, COL.ironHi); fill(9, 86, 14, 1, COL.wax); fill(10, 87, 12, 1, COL.waxLo);
      // feather basket
      for (let y = 100; y < 110; y++) for (let x = 30; x < 46; x++) set(x, y, (x + y) % 3 === 0 ? COL.woodLo : COL.woodHi);
      for (let i = 0; i < 9; i++) { const fx = 31 + ((i * 7) % 14), fy = 95 + ((i * 5) % 5); fill(fx, fy, 2, 5, COL.feather); set(fx, fy + 4, COL.featherLo); }
      // candle sconce
      fill(166, 56, 7, 2, COL.holder); fill(168, 49, 3, 7, COL.candle);
    })();

    // ---------- scene drawing ----------
    let tAll = 0; // seconds since start
    function drawWorkshop(attempt) {
      frame.set(ws);
      // fire under the pot
      for (let i = 0; i < 9; i++) {
        const h = 2 + ((hash(i, (tAll * 12) | 0) * 3) | 0);
        for (let j = 0; j < h; j++) px(10 + i * 1.4, 97 - j, j === h - 1 ? COL.flameA : j > 0 ? COL.flameB : COL.flameC);
      }
      // wax bubbles
      for (let i = 0; i < 3; i++) if (hash(i, (tAll * 4) | 0) < 0.5) px(11 + i * 4, 85, COL.wax);
      // candle flame
      const fl = hash(1, (tAll * 10) | 0) < 0.5 ? 0 : 1;
      px(169, 47 - fl, COL.flameB); px(169, 48, COL.flameA); px(170, 48, COL.flameB); px(169, 46 - fl, COL.flameA);
      // tally of past attempts
      const marks = attempt - 1;
      for (let m = 0; m < marks; m++) {
        const g = (m / 5) | 0, k = m % 5, row = (g / 4) | 0, col = g % 4;
        const x0 = 142 + col * 12, y0 = 14 + row * 10;
        if (k < 4) for (let j = 0; j < 6; j++) px(x0 + k * 2, y0 + j, COL.chalk);
        else for (let j = 0; j < 8; j++) px(x0 - 1 + j, y0 + 5 - (j * 0.7) | 0, COL.chalk);
      }
      // the heap of melted wings
      const heaps = Math.min(marks, 10);
      for (let h = 0; h < heaps; h++) {
        const hx = 150 + ((h * 11) % 36), hy = 109 - ((h / 4) | 0) * 2;
        for (let i = 0; i < 6; i++) { px(hx + i, hy - (i % 3 === 1 ? 1 : 0), i % 2 ? COL.heap : COL.heapLo); }
        for (let i = 0; i < 7; i++) px(hx - 2 + i, hy - 2 - (i >> 1), COL.strut);
      }
      // dust in the sunbeam
      for (let i = 0; i < 10; i++) {
        const dx = 150 + mod(i * 37 + tAll * 3, 50), dy = 40 + mod(i * 23 - tAll * 2, 70);
        if (hash(i, (tAll * 2) | 0) < 0.7) px(dx + (dy - 40) * 0.3, dy, COL.chalk);
      }
    }

    function drawRack(progress) {
      // A-frame stand
      capsule(86, 110, 98, 74, 1, 'r'); capsule(114, 110, 104, 74, 1, 'R');
      capsule(90, 94, 110, 94, 0.8, 'r');
      commit();
      if (progress < 0) return;
      // the wing being built, laid on the stand
      const root = [112.5, 75.5], ex = -30, ey = -14;
      const NF = 8, shown = Math.floor(progress * (NF + 0.99));
      for (let i = NF; i >= 1; i--) {
        if (i > shown) continue;
        const t = i / NF, bx = root[0] + ex * t, by = root[1] + ey * t;
        const len = 18 * (0.35 + 0.65 * Math.pow(t, 0.8));
        const odd = i & 1;
        capsule(bx, by, bx + 0.25 * len, by + len, 1.05, (u) => (u > 0.78 ? 'F' : odd ? 'f' : 'F'));
      }
      capsule(root[0], root[1], root[0] + ex, root[1] + ey, 0.9, 'x');
      commit();
    }

    function sky(alt, sunX, sunY, R, heat) {
      const glowR = 12 + 34 * alt, glowK = 2 + 5 * alt;
      for (let y = 0; y < H; y++) {
        let base = 0.6 + (y / H) * 3.4 - alt * 0.9;
        if (y > 70) base += ((y - 70) / 60) * 2.2 * clamp(1 - alt * 1.4, 0, 1);
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - sunX, y - sunY);
          let c;
          if (d < R - 2) c = COL.sunCore;
          else if (d < R) c = dith(x, y) < 0.6 ? COL.sunRing : COL.sunCore;
          else {
            let v = base + glowK * Math.exp(-(d - R) / glowR);
            if (alt > 0.5 && d < R + 34 * alt) {
              const a = Math.atan2(y - sunY, x - sunX) + tAll * 0.25;
              if (Math.abs(mod(a * 6, TAU) - Math.PI) < 0.35 && dith(x, y) < 0.5) v += 1;
            }
            v = clamp(v, 0, 8.6);
            const i = Math.floor(v) + ((v % 1) > dith(x, y) ? 1 : 0);
            c = SKY[clamp(i, 0, 9)];
          }
          frame[y * W + x] = c;
        }
      }
    }
    function cloud(cx, cy, s, warm) {
      const blobs = [[-14, 2, 7], [-6, -2, 9], [5, -1, 8], [14, 2, 6], [0, 3, 8]];
      const L = warm ? COL.cloudWL : COL.cloudL, S = warm ? COL.cloudWS : COL.cloudS;
      const x0 = Math.floor(cx - 24 * s), x1 = Math.ceil(cx + 24 * s), y0 = Math.floor(cy - 12 * s), y1 = Math.ceil(cy + 12 * s);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let depth = -1;
        for (const b of blobs) depth = Math.max(depth, b[2] * s - Math.hypot(x - (cx + b[0] * s), y - (cy + b[1] * s)));
        if (depth < 0) continue;
        if (depth < 1 && dith(x, y) > 0.55) continue;
        px(x, y, y > cy + 3 * s ? S : y > cy + 1 * s && dith(x, y) < 0.5 ? S : L);
      }
    }
    function sea(top, sunX) {
      const y0 = Math.max(0, Math.ceil(top));
      for (let y = y0; y < H; y++) {
        const d = y - top;
        for (let x = 0; x < W; x++) {
          let c = d < 1 ? COL.seaHi : d < 6 ? COL.seaA : d < 16 ? COL.seaB : COL.seaC;
          if (d > 1 && mod(x * 3 + y * 7 + ((tAll * 14) | 0) * (y & 1 ? 2 : -2), 37) < 3) c = COL.seaWave;
          if (Math.abs(x - sunX) < 9 - d * 0.12 && d > 0 && mod(x + y + ((tAll * 8) | 0), 4) === 0) c = COL.glint;
          frame[y * W + x] = c;
        }
      }
    }
    function cliff(x0, seaTop) {
      // rock rising from the sea with the workshop tower on top
      const top = seaTop - 44;
      for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, seaTop + 2); y++) {
        const t = (y - top) / 44;
        const w = 30 + t * 26;
        for (let x = Math.floor(x0 - w / 2); x < x0 + w / 2; x++) {
          const edge = x < x0 - w / 2 + 3;
          px(x, y, edge ? COL.rockHi : hash(x >> 2, y >> 2) < 0.2 ? COL.rockLo : COL.rock);
        }
      }
      const tx = Math.round(x0 - 13), ty = Math.round(top - 30);
      rect(tx, ty, 26, 30, COL.towerB);
      rect(tx, ty, 13, 30, COL.towerA);
      for (let y = 0; y < 30; y += 6) rect(tx, ty + y, 26, 1, COL.mortar);
      for (let x = 0; x < 26; x += 4) rect(tx + x, ty - 3, 2, 3, COL.towerA);
      rect(tx + 15, ty + 14, 7, 16, COL.doorGlow);
      rect(tx + 16, ty + 12, 5, 2, COL.doorGlow);
    }

    // ---------- dialog windows and text ----------
    function box(x, y, w, h) {
      for (let j = 0; j < h; j++) {
        const t = j / (h - 1);
        for (let i = 0; i < w; i++) px(x + i, y + j, t > dith(x + i, y + j) * 0.9 + 0.05 ? COL.winBot : COL.winTop);
      }
      for (let i = 1; i < w - 1; i++) { px(x + i, y, COL.white); px(x + i, y + h - 1, COL.white); px(x + i, y + 1, COL.winEdge); }
      for (let j = 1; j < h - 1; j++) { px(x, y + j, COL.white); px(x + w - 1, y + j, COL.white); px(x + 1, y + j, COL.winEdge); }
    }
    function text(str, x, y, scale) {
      scale = scale || 1;
      let cx = x;
      for (const ch of str) {
        const g = FONT[ch] || FONT[' '];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) {
          rect(cx + c * scale + 1, y + r * scale + 1, scale, scale, COL.shadow);
          rect(cx + c * scale, y + r * scale, scale, scale, COL.white);
        }
        cx += 6 * scale;
      }
    }
    const textW = (s, scale) => s.length * 6 * (scale || 1) - (scale || 1);
    function dialog(lines) {
      const h = 12 + lines.length * 10, y = H - h - 6;
      box(8, y, W - 16, h);
      lines.forEach((l, i) => text(l, 16, y + 7 + i * 10, 1));
    }
    function fade(amount, color) {
      if (amount <= 0) return;
      const c = color || COL.black;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dith(x, y) < amount) frame[y * W + x] = c;
    }

    // ---------- particles ----------
    let parts = [];
    const spawn = (o) => parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 1, age: 0 }, o));
    function stepParts(dt) {
      for (const p of parts) { p.age += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      parts = parts.filter((p) => p.age < p.life && p.y < H + 20 && p.y > -40);
    }
    function drawParts(kinds) {
      for (const p of parts) {
        if (kinds && !kinds.includes(p.k)) continue;
        if (p.k === 'feather') {
          const sw = Math.sin(p.age * 6 + p.seed) * 2;
          px(p.x + sw, p.y, COL.feather); px(p.x + sw + 1, p.y, COL.feather); px(p.x + sw + 2, p.y + 1, COL.featherLo);
        } else if (p.k === 'speed') {
          for (let j = 0; j < 7; j++) if (dith(p.x | 0, (p.y + j) | 0) < 0.7) px(p.x, p.y + j, COL.speed);
        } else px(p.x, p.y, p.c);
      }
    }

    // ---------- the story ----------
    const PH = [['build', 5.6], ['equip', 1.7], ['run', 1.9], ['fly', 7.0], ['melt', 3.0], ['fall', 2.6], ['splash', 2.8]];
    const LOOP = PH.reduce((s, p) => s + p[1], 0);
    let attempt = 1, phase = 0, pt = 0, lastHit = false, lastShown = 8, fallStart = null;

    // Sound
    let audio = null, soundOn = false, nextNote = 0, noteIdx = 0, bassIdx = 0, nextBass = 0;
    const STEP = 60 / 132 / 2; // eighth notes at 132 bpm
    function tone(freq, start, dur, type, vol) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
      o.connect(g).connect(audio.destination);
      o.start(start); o.stop(start + dur + 0.02);
    }
    function noise(start, dur, vol, cutoff) {
      const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur), audio.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
      s.buffer = b; s.connect(f).connect(g).connect(audio.destination); s.start(start);
    }
    function sfx(kind) {
      if (!soundOn || !audio) return;
      const t = audio.currentTime;
      if (kind === 'clink') { tone(1760, t, 0.08, 'square', 0.04); tone(2637, t, 0.05, 'square', 0.02); }
      if (kind === 'whoosh') noise(t, 0.5, 0.25, 900);
      if (kind === 'splash') { noise(t, 0.9, 0.5, 1600); tone(110, t, 0.3, 'triangle', 0.15); }
      if (kind === 'drip') tone(1320 + Math.random() * 400, t, 0.05, 'triangle', 0.03);
    }
    function scheduleMusic() {
      if (!soundOn || !audio) return;
      const now = audio.currentTime;
      while (nextNote < now + 0.25) {
        const [n, len] = LEAD[noteIdx];
        tone(NOTE(N[n]), nextNote, len * STEP * 0.92, 'square', 0.035);
        nextNote += len * STEP; noteIdx = (noteIdx + 1) % LEAD.length;
      }
      while (nextBass < now + 0.25) {
        const bar = (bassIdx / 8) | 0, root = N[BASS[bar % BASS.length]];
        tone(NOTE(root + (bassIdx % 2 ? 12 : 0)), nextBass, STEP * 0.85, 'triangle', 0.12);
        nextBass += STEP; bassIdx = (bassIdx + 1) % (BASS.length * 8);
      }
    }
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      soundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
      if (soundOn) {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
        nextNote = nextBass = audio.currentTime + 0.05;
      }
    });

    function update(dt) {
      tAll += dt; pt += dt;
      const name = PH[phase][0];

      if (name === 'build') {
        const ph = (pt * 2.2) % 1, hit = ph >= 0.55;
        if (hit && !lastHit && pt > 0.3 && pt < 5.2) {
          for (let i = 0; i < 6; i++) spawn({ k: 'spark', x: hammerAt[0], y: hammerAt[1], vx: (Math.random() - 0.3) * 60, vy: -Math.random() * 60, g: 160, life: 0.35, c: i % 2 ? COL.flameA : COL.flameB });
          sfx('clink');
        }
        lastHit = hit;
      }
      if (name === 'run' && pt > 1.45 && pt - dt <= 1.45) sfx('whoosh');
      if (name === 'melt' || name === 'fall') {
        const m = name === 'melt' ? smooth(pt / 3.0) : 1;
        if (name === 'melt' && Math.random() < 0.25 + m * 0.6 && wingInfo) {
          const r = Math.random();
          spawn({ k: 'drip', x: wingInfo.root[0] + wingInfo.ex * r, y: wingInfo.root[1] + wingInfo.ey * r, vy: 6, g: 120, life: 1.6, c: Math.random() < 0.5 ? COL.wax : COL.waxLo });
          if (Math.random() < 0.15) sfx('drip');
        }
      }
      if (name === 'fall') {
        for (let i = 0; i < 2; i++) spawn({ k: 'speed', x: Math.random() * W, y: H + 4, vy: -280 - Math.random() * 120, life: 1 });
      }
      stepParts(dt);

      if (pt >= PH[phase][1]) {
        pt -= PH[phase][1];
        phase = (phase + 1) % PH.length;
        if (phase === 0) { attempt++; parts = []; lastShown = 8; }
        if (PH[phase][0] === 'splash') {
          for (let i = 0; i < 46; i++) spawn({ k: 'splash', x: splashX + (Math.random() - 0.5) * 8, y: splashY, vx: (Math.random() - 0.5) * 90, vy: -50 - Math.random() * 110, g: 240, life: 1.4, c: i % 3 ? COL.splashA : COL.splashB });
          sfx('splash');
        }
      }
    }

    let wingInfo = null, splashX = 150, splashY = 96, hammerAt = [84, 92];

    function render() {
      const name = PH[phase][0];
      wingInfo = null;

      if (name === 'build' || name === 'equip' || name === 'run') {
        drawWorkshop(attempt);
        const rackP = name === 'build' ? smooth((pt - 0.3) / 4.9) : -1;
        drawRack(name === 'build' ? rackP : name === 'equip' && pt < 0.35 ? 1 : -1);
        let p;
        if (name === 'build') {
          p = stand(62, 97);
          const ph = (pt * 2.2) % 1;
          if (pt < 5.2 && ph < 0.55) { p.aF = [-0.15, -1.2]; } else if (pt < 5.2) { p.aF = [0.05, 0.45]; }
          p.hammer = pt < 5.2;
          p.aB = [DOWN - 0.35, DOWN - 0.9];
        } else if (name === 'equip') {
          p = stand(62, 97);
          if (pt < 0.35) { p.aF = [-0.2, -0.5]; p.aB = [-0.1, -0.4]; }
          else {
            const k = (pt - 0.35) / 1.35;
            p.wings = { phi: 0.15 + 1.1 * (0.5 - 0.5 * Math.cos(k * TAU * 2)), L: 14 + 6 * Math.sin(k * Math.PI), FL: 11 + 5 * Math.sin(k * Math.PI), melt: 0 };
            p.aF = [DOWN - 0.6, DOWN - 1.2];
          }
        } else {
          const k = smooth(pt / 1.6);
          const x = lerp(62, 236, Math.pow(pt / 1.9, 1.3));
          const jump = clamp((pt - 1.45) / 0.45, 0, 1);
          const y = 97 - Math.sin(jump * Math.PI * 0.5) * 40;
          p = stand(x, y);
          const cyc = x * 0.35;
          p.t = -DOWN + 0.25 * k;
          p.lF = [DOWN + Math.sin(cyc) * 0.7, DOWN + Math.sin(cyc) * 0.7 + Math.max(0, Math.cos(cyc)) * 0.9];
          p.lB = [DOWN - Math.sin(cyc) * 0.7, DOWN - Math.sin(cyc) * 0.7 + Math.max(0, -Math.cos(cyc)) * 0.9];
          p.aF = [DOWN - Math.sin(cyc) * 0.6, DOWN - Math.sin(cyc) * 0.6 - 0.6];
          p.aB = [DOWN + Math.sin(cyc) * 0.6, DOWN + Math.sin(cyc) * 0.6 - 0.6];
          if (jump > 0) { p.lF = [DOWN - 0.9, DOWN + 0.4]; p.lB = [DOWN + 0.6, DOWN + 1.4]; p.aF = [-0.9, -1.0]; }
          p.wings = { phi: 0.2 + 1.3 * (0.5 - 0.5 * Math.cos(tAll * TAU * (jump > 0 ? 3 : 1.4))), L: 18, FL: 14, melt: 0 };
        }
        const o = icarus(p);
        if (o.hammerHead) hammerAt = o.hammerHead;
        flushActors();
        drawParts(['spark']);

        if (name === 'build') {
          if (attempt === 1 && pt < 2.6) {
            const tw = textW('BLACK ICARUS', 2);
            box(Math.round((W - tw) / 2) - 12, 10, tw + 24, 30);
            text('BLACK ICARUS', Math.round((W - tw) / 2), 18, 2);
          } else if (pt > (attempt === 1 ? 2.8 : 0.5) && pt < 5.3) {
            dialog(['ATTEMPT ' + attempt + '.', 'WAX. FEATHERS. THREAD.']);
          }
          fade(1 - pt / 0.8);
        }
        return;
      }

      // ----- outside: flight, melt, fall, splash -----
      let alt, icX, icY, camX;
      const flyT = name === 'fly' ? pt : 7;
      camX = flyT * 42 + (name === 'melt' ? pt * 20 : name === 'fall' || name === 'splash' ? 60 : 0);
      if (name === 'fly') {
        const f = smooth(pt / 7);
        alt = f; icX = lerp(40, 128, f); icY = lerp(86, 60, f) + Math.sin(tAll * TAU * 2) * 1.5;
      } else if (name === 'melt') {
        const m = pt / 3;
        alt = 1 + 0.06 * m; icX = 128 + 12 * m; icY = 60 - 4 * m + Math.sin(tAll * 40) * m * 1.2;
      } else if (name === 'fall') {
        const k = pt / 2.6;
        alt = 1.06 - 1.1 * Math.pow(k, 1.7); icX = 140 + 10 * k; icY = 56 + 34 * k;
      } else { alt = -0.04; icX = 150; icY = 200; }
      const seaTop = 104 + alt * 190;
      const sunR = 7 + 30 * Math.pow(clamp(alt, 0, 1.1), 1.3);
      const sunX = 206, sunY = 30 + 4 * clamp(alt, 0, 1);
      sky(clamp(alt, 0, 1.1), sunX, sunY, sunR, 0);

      // clouds
      const CL = [[30, 40, 1.0, 0.5], [150, 22, 0.8, 0.35], [250, 55, 1.2, 0.7], [90, 70, 0.9, 0.9], [200, 95, 1.3, 1.1], [320, 30, 0.7, 0.3]];
      for (const [x, y, s, par] of CL) {
        const cx = mod(x - camX * par, W + 100) - 50;
        const cy = y + alt * 160 * par - 40 * par;
        if (cy > -20 && cy < H + 20) cloud(cx, cy, s, alt > 0.62);
      }
      if (seaTop < H) {
        sea(seaTop, sunX);
        if (name === 'fly' && camX < 200) cliff(60 - camX * 1.0, seaTop);
      }

      // heat shimmer near the sun
      if (alt > 0.75) {
        const amt = (alt - 0.75) * 4;
        for (let y = 0; y < 90; y++) {
          const s = Math.round(Math.sin(y * 0.5 + tAll * 9) * amt * 0.9);
          if (!s) continue;
          const row = frame.slice(y * W, y * W + W);
          for (let x = 0; x < W; x++) frame[y * W + x] = row[clamp(x - s, 0, W - 1)];
        }
      }

      if (name !== 'splash') {
        const p = stand(icX, icY);
        if (name === 'fall') {
          const spin = -0.45 + pt * 7.5;
          p.t = spin;
          const fl = Math.sin(pt * 22);
          p.aF = [spin + 1.6 + fl * 0.5, spin + 1.2 + fl * 0.6];
          p.aB = [spin - 1.6 - fl * 0.5, spin - 1.2 - fl * 0.6];
          p.lF = [spin + Math.PI - 0.4 + fl * 0.3, spin + Math.PI - 0.1];
          p.lB = [spin + Math.PI + 0.4 - fl * 0.3, spin + Math.PI + 0.7];
          p.wings = { phi: 0.5 + Math.sin(pt * 30) * 1.2, L: 20, FL: 0, melt: 1 };
          splashX = icX; splashY = seaTop;
        } else {
          p.t = -1.0;
          p.headQ = 0;
          p.aF = [p.t - 0.1, p.t - 0.2];
          p.aB = [p.t + 0.15, p.t + 0.05];
          p.lF = [p.t + Math.PI - 0.15, p.t + Math.PI + 0.05];
          p.lB = [p.t + Math.PI + 0.12, p.t + Math.PI + 0.4];
          const m = name === 'melt' ? smooth(pt / 3) : 0;
          const hz = name === 'melt' ? 3.2 + m * 2 : 2.0;
          p.wings = { phi: 0.1 + 2.5 * (0.5 - 0.5 * Math.cos(tAll * TAU * hz)), L: 22, FL: 17, melt: m };
        }
        const out = icarus(p);
        if (out.wing) {
          wingInfo = out.wing;
          if (out.wing.shown < lastShown) {
            for (let i = 0; i < 3 * (lastShown - out.wing.shown); i++) spawn({ k: 'feather', x: out.wing.tip[0], y: out.wing.tip[1], vx: -20 - Math.random() * 30, vy: 10 + Math.random() * 20, g: 8, life: 3, seed: Math.random() * 6 });
            lastShown = out.wing.shown;
          }
        }
        flushActors();
        drawParts(['drip', 'feather', 'speed']);
      } else {
        // splash: rings on the water, the broken frame floating
        const st = pt;
        for (let r = 0; r < 3; r++) {
          const rr = 4 + (st - r * 0.25) * 28;
          if (rr < 4) continue;
          for (let a = 0; a < TAU; a += 0.02) {
            const x = splashX + Math.cos(a) * rr, y = splashY + 2 + Math.sin(a) * rr * 0.22;
            if (Math.sin(a) > -0.2 && dith(x | 0, y | 0) < 1 - st / 2.4) px(x, y, COL.seaFoam);
          }
        }
        const bob = Math.sin(st * 3) * 0.6;
        for (let i = 0; i < 9; i++) px(splashX - 10 + i, splashY + 2 + bob + (i > 4 ? 1 : 0), COL.strut);
        for (let i = 0; i < 7; i++) px(splashX + 4 + i, splashY + 3 - bob, COL.strut);
        drawParts(['splash', 'feather']);
        if (st > 0.5 && st < 2.5) dialog(['AGAIN.']);
        fade((st - 1.7) / 1.0);
      }

      if (name === 'melt' && pt > 0.3 && pt < 2.7) dialog(['THE WAX IS MELTING!']);
    }

    // ---------- loop ----------
    let paused = false, last = 0, acc = 0;
    const DT = 1 / 60;
    function present() {
      lctx.putImageData(img, 0, 0);
      vctx.imageSmoothingEnabled = false;
      vctx.drawImage(low, 0, 0, view.width, view.height);
    }
    function tick(ts) {
      if (!last) last = ts;
      let dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (!paused) {
        acc += dt;
        while (acc >= DT) { update(DT); acc -= DT; }
        render();
        present();
        scheduleMusic();
      }
      requestAnimationFrame(tick);
    }
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? 'PLAY' : 'PAUSE';
      if (paused && audio) audio.suspend(); else if (audio && soundOn) audio.resume();
    });

    const q = new URLSearchParams(location.search).get('t');
    if (q !== null) {
      const target = parseFloat(q) || 0;
      while (tAll < target) update(DT);
      render(); present();
      paused = true; pauseBtn.textContent = 'PLAY';
    } else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update(DT); render(); present();
      paused = true; pauseBtn.textContent = 'PLAY';
    }
    requestAnimationFrame(tick);

    const api = { pause: () => { paused = true; }, play: () => { paused = false; }, loopSeconds: LOOP };
    el.__blackIcarus = api;
    return api;
  }

  function auto() { document.querySelectorAll('[data-black-icarus]').forEach(mount); }
  window.BlackIcarus = { mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})();
