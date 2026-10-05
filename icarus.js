/*
 * Icarus: a pixel-art loop in the style of 16-bit console RPGs.
 * He builds wings, flies at the sun, the wax melts, he falls, and he changes
 * something and tries again. Every attempt flies higher than the last. On the
 * fifth attempt of a chapter the wax holds, he flies into the sun, and wakes in
 * a new workshop on the far side, aiming for the next star. It never ends.
 * Everything is drawn in code: no image files, no models.
 *
 * Embed:  <div data-icarus></div><script src="icarus.js"></script>
 * Debug:  ?t=12.5 freezes the story at 12.5 seconds.
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
  const fmt = (n) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function roman(n) {
    const R = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of R) while (n >= v) { s += r; n -= v; }
    return s;
  }

  // ---------- character palette (sprites and the rig use these letters) ----------
  const PAL = {
    k: '#140c12', // outline
    d: '#3b2215', s: '#5e3820', S: '#86532f', // skin: shadow, base, light
    h: '#161018', H: '#3d3040', // hair
    w: '#efe8d6', W: '#a89eb6', // suit
    g: '#eab53e', G: '#9a6818', // gold
    b: '#5a3920', B: '#2e1c12', // sandals, boots
    f: '#fbf8f0', F: '#c4c7d8', q: '#7d84a0', // feathers
    x: '#f6ca4a', X: '#b07c1c', // wing frame
    r: '#7c4c26', R: '#4e2e16', // wood
    m: '#a3a9b6', M: '#59606e', // iron
    e: '#f4f0e8', // eye
    c: '#6a4426', C: '#8c5c34', // leather cap
    o: '#26283a', // smoked glass
    p: '#a82838', P: '#6a1424', // cape
  };
  const KEYS = Object.keys(PAL);
  const AC = new Uint32Array(KEYS.length + 1);
  const AI = {};
  KEYS.forEach((k, i) => { AI[k] = i + 1; AC[i + 1] = hex(PAL[k]); });
  const setPal = (k, h) => { AC[AI[k]] = hex(h); };

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
  const CAP = ['..cCcCcc....', '.cCccccCc...', 'cccCcccccc..', 'cCcccccccc..', 'cccccccccc..'];
  const HELM = ['..GgGgGg....', '.GgggggGgg..', 'Gggggggggg..', 'gGgggggggggG', 'GgggggggggG.'];
  function headFor(gear) {
    const rows = HEAD.map((r) => r.split(''));
    const top = gear.helmet ? HELM : gear.cap ? CAP : null;
    if (top) for (let j = 0; j < 5; j++) for (let i = 0; i < 12; i++) if (top[j][i] !== '.') rows[j][i] = top[j][i];
    if (gear.helmet) for (let j = 5; j < 9; j++) rows[j][3] = 'G';
    else if (gear.cap) for (let j = 5; j < 9; j++) rows[j][3] = 'c';
    if (gear.goggles) {
      for (let i = 4; i < 11; i++) rows[5][i] = 'M';
      for (let j = 6; j < 8; j++) for (let i = 7; i < 10; i++) rows[j][i] = 'o';
    }
    return rows.map((r) => r.join(''));
  }

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

  const C = (h) => hex(h);
  const COL = {
    black: C('#08060c'), white: C('#f8f8f8'), shadow: C('#10123a'),
    cloudL: C('#f2f4fb'), cloudS: C('#b6c0dc'), cloudWL: C('#fde7c2'), cloudWS: C('#e2a874'),
    rock: C('#3a3446'), rockHi: C('#544b62'), rockLo: C('#2a2534'),
    towerA: C('#8c8296'), towerB: C('#6c6378'), doorGlow: C('#f2b04c'), mortar: C('#2b2230'),
    wood: C('#7c4c26'), woodHi: C('#9a6634'), woodLo: C('#4e2e16'),
    iron: C('#3a3038'), ironHi: C('#5a4e58'), pot: C('#2a2228'),
    flameA: C('#fff0a8'), flameB: C('#f6b03c'), flameC: C('#d8602a'),
    wax: C('#f6ca4a'), waxLo: C('#b07c1c'),
    chalk: C('#d9d2c8'), parch: C('#d8c8a0'), parchLine: C('#8a6a44'),
    vase: C('#b0552c'), vaseLo: C('#7a3418'), jar: C('#9a8a70'),
    candle: C('#ece4cc'), holder: C('#8a8a96'),
    feather: C('#fbf8f0'), featherLo: C('#7d84a0'), strut: C('#b07c1c'),
    speed: C('#e8f0ff'),
    winTop: C('#3848b8'), winBot: C('#141c78'), winEdge: C('#9098d0'),
    heap: C('#b9bccb'), heapLo: C('#6d7389'),
  };

  // ---------- the worlds: each chapter's workshop and sky ----------
  const THEMES = [
    {
      goal: 'THE SUN', place: 'THE CLIFF WORKSHOP',
      wall: ['#4b3f4f', '#45394a', '#514456', '#61536a', '#2b2230'], arch: ['#7a6a7c', '#695a6c'],
      floor: ['#8a5a34', '#6a4226', '#623c22', '#43281a', '#97663c', '#8a5c36'],
      sea: ['#7fb2e0', '#2f63a6', '#244f8e', '#1b3c74', '#5e98d2', '#f8e3a0'],
      sun: ['#fffbe6', '#ffe58a'], space: 0, clouds: true, island: true,
      ramp: ['#04030b', '#0b0a22', '#141542', '#1b2462', '#263f8c', '#3a62b0', '#5f88cc', '#8fb0de', '#bfd2ea', '#f1dfb4', '#f6c46e', '#f29a45', '#fff2c4'],
    },
    {
      goal: 'THE BLUE STAR', place: 'A WORKSHOP ON THE SUN',
      wall: ['#8a5a2a', '#7e5024', '#966432', '#b07a3c', '#4e2e14'], arch: ['#c8903e', '#b07a34'],
      floor: ['#a85a28', '#7a3e1c', '#70381a', '#3e1c0c', '#a8602c', '#985628'],
      sea: ['#fff2a0', '#f6b03c', '#e8782a', '#c04818', '#ffd870', '#fff8d8'],
      sun: ['#eef6ff', '#9cc8ff'], space: 2.4, clouds: false, island: false,
      ramp: ['#030208', '#08061a', '#0e0c2c', '#16143e', '#1e2258', '#283476', '#344c98', '#4a6cbc', '#6c94d8', '#9cbcec', '#c8dcf8', '#e6f0ff', '#f6faff'],
    },
    {
      goal: 'THE VIOLET STAR', place: 'A WORKSHOP ON THE BLUE STAR',
      wall: ['#3a3460', '#342e58', '#423a6c', '#56508a', '#1c1834'], arch: ['#6a64a8', '#5a5494'],
      floor: ['#5a5084', '#3c3458', '#363050', '#1e1a30', '#544c80', '#4c4474'],
      sea: ['#e8f0ff', '#9cb8f0', '#6a80d0', '#4a58a8', '#c8d8ff', '#ffffff'],
      sun: ['#fbeeff', '#d0a8ff'], space: 3.0, clouds: false, island: false,
      ramp: ['#050208', '#0e0618', '#180c2a', '#22123e', '#2e1a56', '#3c2470', '#4e3290', '#6644b0', '#8460cc', '#a884e0', '#c8a8f0', '#e2ccfa', '#f8eeff'],
    },
  ].map((t) => Object.assign({}, t, {
    wall: t.wall.map(hex), arch: t.arch.map(hex), floor: t.floor.map(hex), sea: t.sea.map(hex), sun: t.sun.map(hex), ramp: t.ramp.map(hex),
  }));
  function themeFor(chapter) {
    const t = THEMES[(chapter - 1) % THEMES.length];
    if (chapter <= THEMES.length) return t;
    return Object.assign({}, t, { goal: 'THE NEXT STAR', place: 'WORKSHOP ' + roman(chapter) });
  }

  // ---------- what he changes each attempt ----------
  const APPROACH = [
    'WAX. FEATHERS. THREAD.',
    'MORE WAX ON EVERY JOINT.',
    'LONGER FEATHERS. WIDER SPAN.',
    'A LEATHER CAP TO KEEP THE HEAT OFF.',
    'A LINEN SUIT, SOAKED IN SEAWATER.',
    'A BRONZE FRAME INSTEAD OF WOOD.',
    'GOGGLES OF SMOKED GLASS.',
    'SILVER FEATHERS FROM THE TEMPLE.',
    'A CAPE TO CATCH THE WIND.',
    'GOLD LEAF ON THE WING TIPS.',
    'BOOTS WITH STRAPS. NO MORE SANDALS.',
    'A HELMET SHAPED LIKE A FALCON.',
  ];
  const SUITS = [['#efe8d6', '#a89eb6', 'CREAM'], ['#cfe0ec', '#7f97b4', 'SEA BLUE'], ['#e8d0a0', '#a88a58', 'SAND'], ['#d8c8ec', '#9484b4', 'LILAC'], ['#f0d0c8', '#b08888', 'ROSE']];
  const FEATHERS = [['#fbf8f0', '#c4c7d8', '#7d84a0', 'THE CLIFF GULLS'], ['#eef4ff', '#a8b8d8', '#6878a0', 'THE TEMPLE DOVES'], ['#fff4d8', '#e0c890', '#a08850', 'THE DESERT HAWKS'], ['#f4ecff', '#c8b8e8', '#8878b0', 'THE NIGHT OWLS']];
  function gearFor(n) {
    const g = {
      waxJoints: n >= 2, cap: n >= 4, bronze: n >= 6, goggles: n >= 7, cape: n >= 9, goldTips: n >= 10, boots: n >= 11, helmet: n >= 12,
      span: 1 + 0.035 * Math.min(n - 1, 10) + (n >= 3 ? 0.06 : 0), nf: 8 + Math.min(n - 1, 6),
      suit: n < 5 ? 0 : n < 13 ? 1 : (1 + Math.floor((n - 11) / 2)) % SUITS.length,
      feathers: n < 8 ? 0 : n < 14 ? 1 : (1 + Math.floor((n - 12) / 2)) % FEATHERS.length,
    };
    return g;
  }
  function approach(n) {
    if (n <= APPROACH.length) return APPROACH[n - 1];
    const g = gearFor(n);
    return (n - 13) % 2 === 0 ? 'A NEW SUIT, DYED ' + SUITS[g.suit][2] + '.' : 'FEATHERS FROM ' + FEATHERS[g.feathers][3] + '.';
  }
  function wearGear(g) {
    setPal('w', SUITS[g.suit][0]); setPal('W', SUITS[g.suit][1]);
    setPal('f', FEATHERS[g.feathers][0]); setPal('F', FEATHERS[g.feathers][1]); setPal('q', FEATHERS[g.feathers][2]);
    if (g.bronze) { setPal('x', '#d0884a'); setPal('X', '#8a5420'); } else { setPal('x', PAL.x); setPal('X', PAL.X); }
  }

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
    if (el.__icarus) return el.__icarus;

    // ---------- DOM ----------
    el.style.position = el.style.position || 'relative';
    const view = document.createElement('canvas');
    view.setAttribute('role', 'img');
    view.setAttribute('aria-label', 'Pixel-art animation of Icarus. He builds wings, flies toward the sun, falls, changes his wings and clothes, and flies higher every time, until he reaches the sun and begins again from a new workshop.');
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
    function wing(root, back, tail, phi, w, far) {
      const { L, FL, melt, gear } = w;
      const c = Math.cos(phi);
      const ex = back[0] * c * L + tail[0] * 0.32 * L, ey = back[1] * c * L + tail[1] * 0.32 * L;
      let fx = tail[0] + back[0] * c * 0.3, fy = tail[1] + back[1] * c * 0.3;
      const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
      const NF = gear.nf;
      let shown = 0;
      for (let i = NF; i >= 1; i--) {
        const t = i / NF;
        if (melt > 0 && t > 1 - melt * 0.98) continue;
        shown++;
        const bx = root[0] + ex * t, by = root[1] + ey * t;
        const len = FL * (0.35 + 0.65 * Math.pow(t, 0.8)) * (1 - 0.3 * melt);
        const odd = i & 1;
        const tip = gear.goldTips && !far ? 'g' : far ? 'q' : 'F';
        capsule(bx, by, bx + fx * len, by + fy * len, 1.05, (u) =>
          (u > 0.78 ? tip : far ? (odd ? 'F' : 'q') : odd ? 'f' : 'F'));
        if (gear.waxJoints && !far && len > 2) capsule(bx, by, bx, by, 1.3, 'x');
      }
      capsule(root[0], root[1], root[0] + ex, root[1] + ey, 0.9, far ? 'X' : 'x');
      commit();
      return { shown, tip: [root[0] + ex, root[1] + ey], root, ex, ey };
    }

    // The rig. Angles are screen radians (0 = right, pi/2 = down).
    function icarus(p, gear, head) {
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
      const wingRoot = at(at(sh, back, 2.5), dT, 0.5);

      if (gear.cape) {
        const flutter = Math.sin(tAll * 9) * 1.5;
        const cs = at(sh, back, 1.5);
        for (let i = 0; i < 3; i++) {
          const end = at(at(cs, tail, 13 + i * 1.5), back, 3 + i * 2.5 + flutter * (i + 1) * 0.5);
          capsule(cs[0], cs[1], end[0], end[1], 2.1, (u) => (u > 0.75 ? 'P' : 'p'));
        }
        commit();
      }
      if (p.wings) wing(at(at(wingRoot, back, -1.5), dT, 1), back, tail, p.wings.phi + 0.18, p.wings, true);
      capsule(sh[0] + back[0] * 0.5, sh[1] + back[1] * 0.5, armB[0][0], armB[0][1], 1.3, 's');
      capsule(armB[0][0], armB[0][1], armB[1][0], armB[1][1], 1.3, 's');
      commit();
      capsule(hip[0] + back[0], hip[1] + back[1], legB[0][0], legB[0][1], 1.4, 'd');
      capsule(legB[0][0], legB[0][1], legB[1][0], legB[1][1], 1.4, 'd');
      boot(legB, p.lB[1], gear);
      commit();
      // suit, with a short skirt below the hip
      const sk = at(hip, tail, 3.5);
      capsule(sk[0], sk[1], neck[0], neck[1], 4.1, (u, ex, ey) => {
        const side = ex * back[0] + ey * back[1];
        if (u > 0.3 && u < 0.4) return side > 1.6 ? 'G' : 'g';
        return side > 1.8 ? 'W' : 'w';
      });
      commit();
      capsule(hip[0], hip[1], legF[0][0], legF[0][1], 1.4, 's');
      capsule(legF[0][0], legF[0][1], legF[1][0], legF[1][1], 1.4, 's');
      boot(legF, p.lF[1], gear);
      commit();
      const q = p.headQ != null ? p.headQ : mod(Math.round((p.t + Math.PI / 2) / (Math.PI / 2)), 4);
      sprite(head, headC[0], headC[1], q);
      commit();
      if (p.wings) out.wing = wing(wingRoot, back, tail, p.wings.phi, p.wings, false);
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
    function boot(leg, a, gear) {
      const f = leg[1];
      const fwd = Math.cos(a) >= -0.2 ? 1 : -1;
      if (gear.boots) {
        const k = leg[0], d = [f[0] - k[0], f[1] - k[1]], L = Math.hypot(d[0], d[1]) || 1;
        capsule(f[0] - (d[0] / L) * 3.5, f[1] - (d[1] / L) * 3.5, f[0], f[1], 1.6, 'B');
        capsule(f[0], f[1], f[0] + 2.8 * fwd, f[1], 1.3, 'B');
      } else capsule(f[0], f[1], f[0] + 2.5 * fwd, f[1], 1.1, 'b');
    }

    // ---------- pose library ----------
    const DOWN = Math.PI / 2;
    function stand(x, y) {
      return { x, y, t: -DOWN, aF: [DOWN - 0.15, DOWN - 0.3], aB: [DOWN + 0.25, DOWN + 0.1], lF: [DOWN - 0.1, DOWN + 0.02], lB: [DOWN + 0.12, DOWN] };
    }

    // ---------- a workshop for each world, drawn once ----------
    const wsCache = new Map();
    function workshopFor(T) {
      if (wsCache.has(T)) return wsCache.get(T);
      const ws = new Uint32Array(W * H);
      wsCache.set(T, ws);
      const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) ws[y * W + x] = c; };
      const fill = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); };
      const [stA, stB, stC, stHi, mor] = T.wall;
      for (let y = 0; y < 110; y++) {
        const row = (y / 8) | 0, off = (row & 1) * 8;
        for (let x = 0; x < W; x++) {
          const bx = ((x + off) / 16) | 0;
          const lx = (x + off) % 16, ly = y % 8;
          let c;
          if (ly === 7 || lx === 15) c = mor;
          else {
            const r = hash(bx, row);
            c = r < 0.33 ? stA : r < 0.66 ? stB : stC;
            if (ly === 0 || lx === 0) c = stHi;
            if (hash(x, y) < 0.04) c = mor;
          }
          set(x, y, c);
        }
      }
      const [fTop, plank, plankB, seam, lit, litB] = T.floor;
      for (let y = 110; y < H; y++) for (let x = 0; x < W; x++) {
        const row = ((y - 111) / 6) | 0;
        const seamX = mod(x + row * 13, 34) === 0;
        let c = y === 110 ? fTop : (y - 111) % 6 === 5 || seamX ? seam : hash(x >> 3, row) < 0.5 ? plank : plankB;
        const beamL = 150 - (y - 110) * 1.2, beamR = 200 - (y - 110) * 0.4;
        if (y > 110 && x > beamL && x < beamR && dith(x, y) < 0.6 && c !== seam) c = c === plank ? lit : litB;
        set(x, y, c);
      }
      // the doorway, looking out at the next goal
      const dx0 = 196, dx1 = 246, cx = 221, cy = 50, R = 25;
      for (let y = 20; y < 110; y++) for (let x = dx0 - 3; x <= dx1 + 3; x++) {
        const inArch = (y >= cy ? x >= dx0 && x <= dx1 : (x - cx) ** 2 + (y - cy) ** 2 <= R * R);
        const inRing = (y >= cy ? x >= dx0 - 3 && x <= dx1 + 3 : (x - cx) ** 2 + (y - cy) ** 2 <= (R + 3) ** 2);
        if (inArch) {
          let c;
          if (y >= 86) {
            const d = y - 86;
            c = d === 0 ? T.sea[0] : d < 5 ? T.sea[1] : d < 12 ? T.sea[2] : T.sea[3];
            if (d > 1 && mod(x * 3 + y * 7, 23) < 2) c = T.sea[4];
            if (Math.abs(x - 234) < 4 && d > 0 && (x + y) % 3 === 0) c = T.sea[5];
          } else {
            const sd = Math.hypot(x - 234, y - 74);
            const vv = 5.2 + ((y - 22) / 64) * 4.2 - T.space + 2.6 * Math.exp(-sd / 10);
            c = T.ramp[clamp(Math.floor(vv) + ((vv % 1) > dith(x, y) ? 1 : 0), 0, 12)];
            if (T.space && vv < 6 && hash(x, y) < 0.025) c = COL.white;
            if (sd < 5) c = T.sun[0];
            if (T.island && y > 78 && y < 86 && x > 200 && x < 222 && y > 86 - (8 - Math.abs(x - 211) * 0.7)) c = y < 82 ? hex('#4e6596') : hex('#3c4f7c');
          }
          set(x, y, c);
        } else if (inRing && y < 110) {
          const blk = y >= cy ? ((y / 6) | 0) : ((Math.atan2(y - cy, x - cx) * 6) | 0);
          set(x, y, hash(blk, 7) < 0.5 ? T.arch[0] : T.arch[1]);
        }
      }
      // shelf with pottery
      fill(8, 36, 58, 2, COL.wood); fill(8, 36, 58, 1, COL.woodHi); fill(8, 38, 58, 1, COL.woodLo);
      fill(12, 38, 2, 4, COL.woodLo); fill(60, 38, 2, 4, COL.woodLo);
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
      fill(110, 30, 22, 16, COL.parch);
      for (let i = 0; i < 6; i++) { set(114 + i * 2, 41 - i, COL.parchLine); set(115 + i * 2, 41 - i, COL.parchLine); }
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) set(116 + i * 2, 42 - i + j, COL.parchLine);
      set(121, 30, COL.vase);
      // hanging tools
      fill(72, 44, 14, 3, COL.ironHi); for (let i = 0; i < 14; i += 2) set(72 + i, 47, COL.iron); fill(86, 43, 4, 5, COL.wood);
      fill(94, 42, 1, 12, COL.iron); fill(97, 42, 1, 12, COL.iron); fill(94, 42, 4, 1, COL.ironHi);
      // brazier and wax pot
      fill(6, 98, 20, 4, COL.iron); fill(6, 98, 20, 1, COL.ironHi); fill(8, 102, 2, 8, COL.iron); fill(22, 102, 2, 8, COL.iron);
      fill(9, 86, 14, 9, COL.pot); fill(8, 86, 16, 1, COL.ironHi); fill(9, 86, 14, 1, COL.wax); fill(10, 87, 12, 1, COL.waxLo);
      // feather basket
      for (let y = 100; y < 110; y++) for (let x = 30; x < 46; x++) set(x, y, (x + y) % 3 === 0 ? COL.woodLo : COL.woodHi);
      for (let i = 0; i < 9; i++) { const fx = 31 + ((i * 7) % 14), fy = 95 + ((i * 5) % 5); fill(fx, fy, 2, 5, COL.feather); set(fx, fy + 4, COL.featherLo); }
      // candle sconce
      fill(166, 56, 7, 2, COL.holder); fill(168, 49, 3, 7, COL.candle);
      return ws;
    }

    // ---------- scene drawing ----------
    let tAll = 0; // seconds since start
    function drawWorkshop(T, failedHere) {
      frame.set(workshopFor(T));
      for (let i = 0; i < 9; i++) {
        const h = 2 + ((hash(i, (tAll * 12) | 0) * 3) | 0);
        for (let j = 0; j < h; j++) px(10 + i * 1.4, 97 - j, j === h - 1 ? COL.flameA : j > 0 ? COL.flameB : COL.flameC);
      }
      for (let i = 0; i < 3; i++) if (hash(i, (tAll * 4) | 0) < 0.5) px(11 + i * 4, 85, COL.wax);
      const fl = hash(1, (tAll * 10) | 0) < 0.5 ? 0 : 1;
      px(169, 47 - fl, COL.flameB); px(169, 48, COL.flameA); px(170, 48, COL.flameB); px(169, 46 - fl, COL.flameA);
      // chalk chart of every flight so far: each bar taller than the last
      const hist = history.slice(-11);
      if (hist.length) {
        const lo = Math.log(hist[0] + 1), hi = Math.log(hist[hist.length - 1] + 1);
        const x0 = 140, base = 34;
        for (let i = 0; i < hist.length; i++) {
          const f = hi > lo ? (Math.log(hist[i] + 1) - lo) / (hi - lo) : 1;
          const hgt = Math.round(4 + f * 18);
          for (let j = 0; j < hgt; j++) { px(x0 + i * 4, base - j, COL.chalk); px(x0 + i * 4 + 1, base - j, COL.chalk); }
        }
        for (let i = -2; i < hist.length * 4; i++) px(x0 + i, base + 1, COL.chalk);
        for (let j = 0; j < 24; j++) px(x0 - 2, base - j, COL.chalk);
      }
      // the wings that melted in this workshop
      for (let h = 0; h < Math.min(failedHere, 10); h++) {
        const hx = 150 + ((h * 11) % 36), hy = 109 - ((h / 4) | 0) * 2;
        for (let i = 0; i < 6; i++) px(hx + i, hy - (i % 3 === 1 ? 1 : 0), i % 2 ? COL.heap : COL.heapLo);
        for (let i = 0; i < 7; i++) px(hx - 2 + i, hy - 2 - (i >> 1), COL.strut);
      }
      for (let i = 0; i < 10; i++) {
        const dx = 150 + mod(i * 37 + tAll * 3, 50), dy = 40 + mod(i * 23 - tAll * 2, 70);
        if (hash(i, (tAll * 2) | 0) < 0.7) px(dx + (dy - 40) * 0.3, dy, COL.chalk);
      }
    }

    function drawRack(progress, gear) {
      capsule(86, 110, 98, 74, 1, 'r'); capsule(114, 110, 104, 74, 1, 'R');
      capsule(90, 94, 110, 94, 0.8, 'r');
      commit();
      if (progress < 0) return;
      const sp = gear.span, NF = gear.nf;
      const root = [112.5, 75.5], ex = -30 * sp, ey = -14 * sp;
      const shown = Math.floor(progress * (NF + 0.99));
      for (let i = NF; i >= 1; i--) {
        if (i > shown) continue;
        const t = i / NF, bx = root[0] + ex * t, by = root[1] + ey * t;
        const len = 18 * sp * (0.35 + 0.65 * Math.pow(t, 0.8));
        const odd = i & 1, tip = gear.goldTips ? 'g' : 'F';
        capsule(bx, by, bx + 0.25 * len, by + len, 1.05, (u) => (u > 0.78 ? tip : odd ? 'f' : 'F'));
        if (gear.waxJoints) capsule(bx, by, bx, by, 1.3, 'x');
      }
      capsule(root[0], root[1], root[0] + ex, root[1] + ey, 0.9, 'x');
      commit();
    }

    // h: how far toward the goal (0..1). s: how close to the star (0..1+).
    function sky(T, h, s, starShift, sunX, sunY, R) {
      const glowR = 12 + 34 * s, glowK = 2 + 5 * s;
      const starP = Math.max(T.space ? 0.012 : 0, h > 0.6 ? (h - 0.6) * 0.04 : 0);
      for (let y = 0; y < H; y++) {
        let base = 3.6 + (y / H) * (3.4 - 1.6 * h) - h * 3.0 - s * 0.6 - T.space;
        if (T.island && y > 70) base += ((y - 70) / 60) * 2.2 * clamp(1 - h * 4, 0, 1);
        const sy = mod(Math.floor(y - starShift), 4096);
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - sunX, y - sunY);
          let c;
          if (d < R - 2) c = T.sun[0];
          else if (d < R) c = dith(x, y) < 0.6 ? T.sun[1] : T.sun[0];
          else {
            let v = base + glowK * Math.exp(-(d - R) / glowR);
            if (s > 0.5 && d < R + 34 * s) {
              const a = Math.atan2(y - sunY, x - sunX) + tAll * 0.25;
              if (Math.abs(mod(a * 6, TAU) - Math.PI) < 0.35 && dith(x, y) < 0.5) v += 1;
            }
            v = clamp(v, 0, 11.6);
            const i = Math.floor(v) + ((v % 1) > dith(x, y) ? 1 : 0);
            c = T.ramp[clamp(i, 0, 12)];
            if (starP && v < 5) {
              const r = hash(x, sy);
              if (r < starP) c = r < starP * 0.3 && hash(x, sy + ((tAll * 3) | 0)) < 0.8 ? COL.white : COL.chalk;
            }
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
    function sea(T, top, sunX) {
      const y0 = Math.max(0, Math.ceil(top));
      for (let y = y0; y < H; y++) {
        const d = y - top;
        for (let x = 0; x < W; x++) {
          let c = d < 1 ? T.sea[0] : d < 6 ? T.sea[1] : d < 16 ? T.sea[2] : T.sea[3];
          if (d > 1 && mod(x * 3 + y * 7 + ((tAll * 14) | 0) * (y & 1 ? 2 : -2), 37) < 3) c = T.sea[4];
          if (Math.abs(x - sunX) < 9 - d * 0.12 && d > 0 && mod(x + y + ((tAll * 8) | 0), 4) === 0) c = T.sea[5];
          frame[y * W + x] = c;
        }
      }
    }
    function cliff(x0, seaTop) {
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
    function title(big, small) {
      const tw = textW(big, 2), sw = small ? textW(small) : 0;
      const w = Math.max(tw, sw) + 24, x = Math.round((W - w) / 2);
      box(x, 10, w, small ? 42 : 30);
      text(big, Math.round((W - tw) / 2), 18, 2);
      if (small) text(small, Math.round((W - sw) / 2), 38);
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
    // Each chapter has K attempts. Each flies higher; the last reaches the star.
    const K = 5;
    const FRAC = [0.14, 0.32, 0.52, 0.76, 1];
    const goalFt = (c) => Math.round((10000 * Math.pow(2.4, c - 1)) / 100) * 100;
    const baseFt = (c) => { let b = 0; for (let i = 1; i < c; i++) b += goalFt(i); return b; };
    const DUR = { build: 5.6, equip: 1.7, run: 1.9, melt: 3.0, fall: 2.6, splash: 3.2, ascend: 3.8 };
    const flyDur = () => 6.5 + k * 0.5;
    const dur = (name) => (name === 'fly' ? flyDur() : DUR[name]);
    let chapter = 1, k = 1, attempt = 1, phase = 'build', pt = 0;
    let fromSun = false, lastHit = false, lastA = 0, newHeightAt = -99, best = 0;
    let history = [];
    let gear = gearFor(1), head = headFor(gear), lastShown = gear.nf;

    const TIERS = [[0, 'LIFTOFF'], [0.15, 'CLIMBING'], [0.45, 'HALFWAY THERE'], [0.7, 'ALMOST THERE'], [0.97, 'AT ']];
    const tierName = (f, T) => { const t = TIERS.filter((x) => f >= x[0]).pop()[1]; return t === 'AT ' ? 'AT ' + T.goal : t; };

    // Where he is in the sky right now (local feet within this chapter)
    function flight() {
      const G = goalFt(chapter), target = G * FRAC[k - 1];
      const kpx = Math.min(0.05, 120 / target); // screen pixels per foot, per attempt
      let A, s, icX, icY;
      if (phase === 'fly') {
        const f = pt / flyDur(), e = smooth(f);
        A = target * (0.5 * f + 0.5 * e);
        icX = lerp(40, 128, e); icY = lerp(86, 60, e) + Math.sin(tAll * TAU * 2) * 1.5;
      } else if (phase === 'melt') {
        const m = pt / 3;
        A = target * (1 + 0.02 * m);
        icX = 128 + 12 * m; icY = 60 - 4 * m + Math.sin(tAll * 40) * m * 1.2;
      } else if (phase === 'fall') {
        const f = pt / 2.6;
        A = target * 1.02 * (1 - Math.pow(f, 1.7));
        icX = 140 + 10 * f; icY = 56 + 42 * f;
      } else if (phase === 'ascend') {
        const a = smooth(pt / 2.6);
        A = G * (1 + 0.04 * a);
        icX = lerp(128, 200, a); icY = lerp(60, 34, a) + Math.sin(tAll * TAU * 2) * 1.5;
      } else { A = 0; icX = splashX; icY = 200; }
      s = A / G;
      return { A, s, icX, icY, kpx, target, G };
    }

    // Sound
    let audio = null, soundOn = false, nextNote = 0, noteIdx = 0, bassIdx = 0, nextBass = 0;
    const STEP = 60 / 132 / 2;
    function tone(freq, start, dur_, type, vol) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur_);
      o.connect(g).connect(audio.destination);
      o.start(start); o.stop(start + dur_ + 0.02);
    }
    function noise(start, dur_, vol, cutoff) {
      const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur_), audio.sampleRate);
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
      if (kind === 'best') [0, 4, 7, 12].forEach((n, i) => tone(NOTE(76 + n), t + i * 0.07, 0.18, 'square', 0.04));
      if (kind === 'triumph') [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(NOTE(69 + n), t + i * 0.11, 0.4, 'square', 0.05));
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

    let wingInfo = null, splashX = 150, splashY = 96, hammerAt = [84, 92];

    function nextPhase() {
      switch (phase) {
        case 'build': return 'equip';
        case 'equip': return 'run';
        case 'run': return 'fly';
        case 'fly': return k === K ? 'ascend' : 'melt';
        case 'melt': return 'fall';
        case 'fall': return 'splash';
        default: return 'build';
      }
    }
    function enter(next) {
      const prev = phase;
      phase = next;
      if (next === 'splash' || next === 'ascend') {
        const peak = baseFt(chapter) + goalFt(chapter) * FRAC[k - 1];
        best = Math.max(best, peak);
        history.push(peak);
      }
      if (next === 'splash') {
        const T = themeFor(chapter);
        for (let i = 0; i < 46; i++) spawn({ k: 'splash', x: splashX + (Math.random() - 0.5) * 8, y: splashY, vx: (Math.random() - 0.5) * 90, vy: -50 - Math.random() * 110, g: 240, life: 1.4, c: i % 3 ? T.sea[0] : T.sea[4] });
        sfx('splash');
      }
      if (next === 'ascend') sfx('triumph');
      if (next === 'build') {
        attempt++;
        if (prev === 'ascend') { chapter++; k = 1; fromSun = true; } else { k++; fromSun = false; }
        parts = []; lastA = 0;
        gear = gearFor(attempt); head = headFor(gear); lastShown = gear.nf;
      }
    }

    function update(dt) {
      tAll += dt; pt += dt;

      if (phase === 'fly' && k > 1) {
        const prevPeak = goalFt(chapter) * FRAC[k - 2];
        const fl = flight();
        if (lastA < prevPeak && fl.A >= prevPeak) {
          newHeightAt = tAll;
          for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; spawn({ k: 'spark', x: fl.icX, y: fl.icY - 6, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.7, c: i % 2 ? COL.flameA : COL.white }); }
          sfx('best');
        }
        lastA = fl.A;
      }
      if (phase === 'build') {
        const ph = (pt * 2.2) % 1, hit = ph >= 0.55;
        if (hit && !lastHit && pt > 0.3 && pt < 5.2) {
          for (let i = 0; i < 6; i++) spawn({ k: 'spark', x: hammerAt[0], y: hammerAt[1], vx: (Math.random() - 0.3) * 60, vy: -Math.random() * 60, g: 160, life: 0.35, c: i % 2 ? COL.flameA : COL.flameB });
          sfx('clink');
        }
        lastHit = hit;
      }
      if (phase === 'run' && pt > 1.45 && pt - dt <= 1.45) sfx('whoosh');
      if (phase === 'melt' && wingInfo && Math.random() < 0.25 + smooth(pt / 3) * 0.6) {
        const r = Math.random();
        spawn({ k: 'drip', x: wingInfo.root[0] + wingInfo.ex * r, y: wingInfo.root[1] + wingInfo.ey * r, vy: 6, g: 120, life: 1.6, c: Math.random() < 0.5 ? COL.wax : COL.waxLo });
        if (Math.random() < 0.15) sfx('drip');
      }
      if (phase === 'fall') for (let i = 0; i < 2; i++) spawn({ k: 'speed', x: Math.random() * W, y: H + 4, vy: -280 - Math.random() * 120, life: 1 });
      if (phase === 'ascend' && Math.random() < 0.6) spawn({ k: 'spark', x: Math.random() * W, y: Math.random() * H, vx: -40, vy: 30, life: 0.5, c: COL.white });
      stepParts(dt);

      if (pt >= dur(phase)) { pt -= dur(phase); enter(nextPhase()); }
    }

    function render() {
      const T = themeFor(chapter);
      wearGear(gear);
      wingInfo = null;

      if (phase === 'build' || phase === 'equip' || phase === 'run') {
        drawWorkshop(T, k - 1);
        drawRack(phase === 'build' ? smooth((pt - 0.3) / 4.9) : phase === 'equip' && pt < 0.35 ? 1 : -1, gear);
        let p;
        const sp = gear.span;
        if (phase === 'build') {
          p = stand(62, 97);
          const ph = (pt * 2.2) % 1;
          if (pt < 5.2 && ph < 0.55) p.aF = [-0.15, -1.2]; else if (pt < 5.2) p.aF = [0.05, 0.45];
          p.hammer = pt < 5.2;
          p.aB = [DOWN - 0.35, DOWN - 0.9];
        } else if (phase === 'equip') {
          p = stand(62, 97);
          if (pt < 0.35) { p.aF = [-0.2, -0.5]; p.aB = [-0.1, -0.4]; }
          else {
            const q = (pt - 0.35) / 1.35;
            p.wings = { phi: 0.15 + 1.1 * (0.5 - 0.5 * Math.cos(q * TAU * 2)), L: (14 + 6 * Math.sin(q * Math.PI)) * sp, FL: (11 + 5 * Math.sin(q * Math.PI)) * sp, melt: 0, gear };
            p.aF = [DOWN - 0.6, DOWN - 1.2];
          }
        } else {
          const q = smooth(pt / 1.6);
          const x = lerp(62, 236, Math.pow(pt / 1.9, 1.3));
          const jump = clamp((pt - 1.45) / 0.45, 0, 1);
          const y = 97 - Math.sin(jump * Math.PI * 0.5) * 40;
          p = stand(x, y);
          const cyc = x * 0.35;
          p.t = -DOWN + 0.25 * q;
          p.lF = [DOWN + Math.sin(cyc) * 0.7, DOWN + Math.sin(cyc) * 0.7 + Math.max(0, Math.cos(cyc)) * 0.9];
          p.lB = [DOWN - Math.sin(cyc) * 0.7, DOWN - Math.sin(cyc) * 0.7 + Math.max(0, -Math.cos(cyc)) * 0.9];
          p.aF = [DOWN - Math.sin(cyc) * 0.6, DOWN - Math.sin(cyc) * 0.6 - 0.6];
          p.aB = [DOWN + Math.sin(cyc) * 0.6, DOWN + Math.sin(cyc) * 0.6 - 0.6];
          if (jump > 0) { p.lF = [DOWN - 0.9, DOWN + 0.4]; p.lB = [DOWN + 0.6, DOWN + 1.4]; p.aF = [-0.9, -1.0]; }
          p.wings = { phi: 0.2 + 1.3 * (0.5 - 0.5 * Math.cos(tAll * TAU * (jump > 0 ? 3 : 1.4))), L: 18 * sp, FL: 14 * sp, melt: 0, gear };
        }
        const o = icarus(p, gear, head);
        if (o.hammerHead) hammerAt = o.hammerHead;
        flushActors();
        drawParts(['spark']);

        if (phase === 'build') {
          if (k === 1 && pt < 2.6) {
            if (chapter === 1) title('ICARUS');
            else title('CHAPTER ' + roman(chapter), T.place);
          } else if (pt > (k === 1 ? 2.8 : 0.5) && pt < 5.3) {
            dialog([attempt === 1 ? 'ATTEMPT 1.' : 'ATTEMPT ' + attempt + '.  BEST: ' + fmt(best) + ' FT', approach(attempt)]);
          }
          fade(1 - pt / 0.8, fromSun ? COL.white : COL.black);
        }
        return;
      }

      // ----- outside: flight, melt, fall, splash, ascend -----
      const fl = flight();
      const { A, s: near, icX, icY, kpx, target, G } = fl;
      const flyT = phase === 'fly' ? pt : flyDur();
      const camX = flyT * 42 + (phase === 'melt' ? pt * 20 : phase === 'fall' || phase === 'splash' ? 60 : phase === 'ascend' ? pt * 30 : 0);
      const REF = 70; // screen row where the current altitude sits
      const seaTop = REF + 34 + A * kpx;
      const asc = phase === 'ascend' ? smooth((pt - 0.6) / 3.0) : 0;
      const sunR = 7 + 30 * Math.pow(clamp(near, 0, 1.1), 1.3) + asc * asc * 320;
      const sunX = 206, sunY = 30 + 4 * clamp(near, 0, 1);
      sky(T, clamp(A / G, 0, 1), clamp(near, 0, 1.1), A * kpx * 0.25, sunX, sunY, sunR);

      // cloud decks at fixed heights: early attempts stay under them, later ones break through
      if (T.clouds) {
        const DECKS = [[0.09, [[40, 0, 1.0], [170, -8, 1.3], [300, 6, 0.9]]], [0.24, [[100, 0, 1.2], [230, 6, 0.9], [350, -4, 1.1]]], [0.42, [[20, 0, 1.1], [160, 5, 1.4], [280, -6, 1.0]]]];
        for (const [fd, list] of DECKS) for (const [x, dy, sc] of list) {
          const cy = REF - (fd * G - A) * kpx + dy;
          const cx = mod(x - camX * 0.6, W + 100) - 50;
          if (cy > -20 && cy < H + 20) cloud(cx, cy, sc, near > 0.62);
        }
      }
      if (seaTop < H) {
        sea(T, seaTop, sunX);
        if (phase === 'fly' && camX < 200) cliff(60 - camX, seaTop);
      }
      if (near > 0.75 && phase !== 'ascend') {
        const amt = (near - 0.75) * 4;
        for (let y = 0; y < 90; y++) {
          const sh = Math.round(Math.sin(y * 0.5 + tAll * 9) * amt * 0.9);
          if (!sh) continue;
          const row = frame.slice(y * W, y * W + W);
          for (let x = 0; x < W; x++) frame[y * W + x] = row[clamp(x - sh, 0, W - 1)];
        }
      }

      // the last attempt's height, waiting in the sky
      if (k > 1 && (phase === 'fly' || phase === 'melt')) {
        const prevLocal = G * FRAC[k - 2];
        const by = Math.round(icY - (prevLocal - A) * kpx);
        if (by > -4 && by < H) {
          for (let x = 0; x < W; x++) if (mod(x + ((tAll * 20) | 0), 7) < 4) px(x, by, COL.wax);
          const lbl = 'BEST ' + fmt(baseFt(chapter) + prevLocal);
          text(lbl, W - textW(lbl) - 6, by - 10);
        }
      }

      if (phase !== 'splash') {
        const p = stand(icX, icY);
        const sp = gear.span;
        if (phase === 'fall') {
          const spin = -0.45 + pt * 7.5;
          p.t = spin;
          const wob = Math.sin(pt * 22);
          p.aF = [spin + 1.6 + wob * 0.5, spin + 1.2 + wob * 0.6];
          p.aB = [spin - 1.6 - wob * 0.5, spin - 1.2 - wob * 0.6];
          p.lF = [spin + Math.PI - 0.4 + wob * 0.3, spin + Math.PI - 0.1];
          p.lB = [spin + Math.PI + 0.4 - wob * 0.3, spin + Math.PI + 0.7];
          p.wings = { phi: 0.5 + Math.sin(pt * 30) * 1.2, L: 20 * sp, FL: 0, melt: 1, gear };
          splashX = icX; splashY = seaTop;
        } else {
          p.t = -1.0;
          p.headQ = 0;
          p.aF = [p.t - 0.1, p.t - 0.2];
          p.aB = [p.t + 0.15, p.t + 0.05];
          p.lF = [p.t + Math.PI - 0.15, p.t + Math.PI + 0.05];
          p.lB = [p.t + Math.PI + 0.12, p.t + Math.PI + 0.4];
          const m = phase === 'melt' ? smooth(pt / 3) : 0;
          const hz = phase === 'melt' ? 3.2 + m * 2 : phase === 'ascend' ? 2.6 : 2.0;
          p.wings = { phi: 0.1 + 2.5 * (0.5 - 0.5 * Math.cos(tAll * TAU * hz)), L: 22 * sp, FL: 17 * sp, melt: m, gear };
        }
        const out = icarus(p, gear, head);
        if (out.wing) {
          wingInfo = out.wing;
          if (out.wing.shown < lastShown) {
            for (let i = 0; i < 3 * (lastShown - out.wing.shown); i++) spawn({ k: 'feather', x: out.wing.tip[0], y: out.wing.tip[1], vx: -20 - Math.random() * 30, vy: 10 + Math.random() * 20, g: 8, life: 3, seed: Math.random() * 6 });
            lastShown = out.wing.shown;
          }
        }
        flushActors();
        drawParts(['drip', 'feather', 'speed', 'spark']);
      } else {
        // splash: rings on the surface, the broken frame floating
        const st = pt;
        for (let r = 0; r < 3; r++) {
          const rr = 4 + (st - r * 0.25) * 28;
          if (rr < 4) continue;
          for (let a = 0; a < TAU; a += 0.02) {
            const x = splashX + Math.cos(a) * rr, y = splashY + 2 + Math.sin(a) * rr * 0.22;
            if (Math.sin(a) > -0.2 && dith(x | 0, y | 0) < 1 - st / 2.4) px(x, y, T.sea[0]);
          }
        }
        const bob = Math.sin(st * 3) * 0.6;
        for (let i = 0; i < 9; i++) px(splashX - 10 + i, splashY + 2 + bob + (i > 4 ? 1 : 0), COL.strut);
        for (let i = 0; i < 7; i++) px(splashX + 4 + i, splashY + 3 - bob, COL.strut);
        drawParts(['splash', 'feather']);
        const peak = baseFt(chapter) + target;
        if (st > 0.5 && st < 2.9) dialog([fmt(peak) + ' FT. ' + (attempt === 1 ? 'A FIRST FLIGHT.' : 'HIGHER THAN EVER.'), 'CHANGE SOMETHING. TRY AGAIN.']);
        fade((st - 2.1) / 1.0);
      }

      if (phase === 'melt' && pt > 0.3 && pt < 2.7) dialog(['THE WAX IS MELTING!']);
      if (phase === 'ascend') {
        if (pt > 0.2 && pt < 2.4) dialog(['THE WAX HOLDS!', 'INTO ' + T.goal + '.']);
        fade((pt - 2.6) / 1.1, COL.white);
      }
      if (phase !== 'splash' && phase !== 'ascend') {
        const l1 = 'ALT ' + fmt(baseFt(chapter) + A) + ' FT', l2 = tierName(A / G, T);
        const bw = Math.max(textW(l1), textW(l2)) + 14;
        box(6, 6, bw, 30);
        text(l1, 13, 11); text(l2, 13, 22);
      }
      if (tAll - newHeightAt < 1.8) {
        const tw = textW('NEW HEIGHT!', 2);
        box(Math.round((W - tw) / 2) - 10, 42, tw + 20, 26);
        text('NEW HEIGHT!', Math.round((W - tw) / 2), 48, 2);
      }
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
      const dt = Math.min(0.1, (ts - last) / 1000);
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

    const api = { pause: () => { paused = true; }, play: () => { paused = false; } };
    el.__icarus = api;
    return api;
  }

  function auto() { document.querySelectorAll('[data-icarus]').forEach(mount); }
  window.Icarus = { mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})();
