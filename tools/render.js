// Renders Black Icarus frames headlessly to PNG, using the same icarus.js the site uses.
//   node tools/render.js 1.1 3.45 13          -> out/frame-<t>.png (4x)
//   node tools/render.js --sheet 1,3.4,8.6,13 -> out/sheet.png (contact sheet, 2x)
//   node tools/render.js --video 0 24 30      -> out/seq/00000.png ... (for ffmpeg)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'icarus.js'), 'utf8');
const OUT = path.join(__dirname, '..', 'out');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function scale(src, w, h, s) {
  const out = Buffer.alloc(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const i = ((y / s | 0) * w + (x / s | 0)) * 4, o = (y * w * s + x) * 4;
    out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 255;
  }
  return out;
}

// Runs icarus.js with a stub DOM frozen at time t; returns the 256x144 RGBA buffer.
function frameAt(t) {
  let data = null;
  const ctx = {
    createImageData: (w, h) => { const d = { data: new Uint8ClampedArray(w * h * 4) }; data = d.data; return d; },
    putImageData() {}, drawImage() {}, set imageSmoothingEnabled(v) {},
  };
  const node = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, getBoundingClientRect: () => ({ width: 1024 }), getContext: () => ctx, width: 0, height: 0 });
  const el = node();
  const sandbox = {
    window: { addEventListener() {}, devicePixelRatio: 1 },
    document: { readyState: 'complete', createElement: node, querySelectorAll: () => [el], addEventListener() {} },
    location: { search: '?t=' + t },
    URLSearchParams, requestAnimationFrame() {},
  };
  sandbox.window.matchMedia = null;
  new Function('window', 'document', 'location', 'URLSearchParams', 'requestAnimationFrame', SRC)(
    sandbox.window, sandbox.document, sandbox.location, URLSearchParams, sandbox.requestAnimationFrame);
  return Buffer.from(data.buffer);
}

const args = process.argv.slice(2);
if (args[0] === '--sheet') {
  const ts = args[1].split(',').map(Number), s = 2, cols = 2, W = 256 * s, H = 144 * s, gap = 4;
  const rows = Math.ceil(ts.length / cols);
  const sw = cols * W + (cols + 1) * gap, sh = rows * H + (rows + 1) * gap;
  const sheet = Buffer.alloc(sw * sh * 4, 40);
  ts.forEach((t, i) => {
    const f = scale(frameAt(t), 256, 144, s);
    const ox = gap + (i % cols) * (W + gap), oy = gap + ((i / cols) | 0) * (H + gap);
    for (let y = 0; y < H; y++) f.copy(sheet, ((oy + y) * sw + ox) * 4, y * W * 4, (y + 1) * W * 4);
  });
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;
  fs.writeFileSync(path.join(OUT, 'sheet.png'), png(sw, sh, sheet));
  console.log('out/sheet.png', ts.join(' '));
} else if (args[0] === '--video') {
  // One live instance, stepped frame by frame through its own animation loop.
  const [from, to, fps] = args.slice(1).map(Number);
  const dir = path.join(OUT, 'seq'); fs.mkdirSync(dir, { recursive: true });
  let data = null, tick = null;
  const ctx = { createImageData: (w, h) => { const d = { data: new Uint8ClampedArray(w * h * 4) }; data = d.data; return d; }, putImageData() {}, drawImage() {}, set imageSmoothingEnabled(v) {} };
  const node = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, getBoundingClientRect: () => ({ width: 1024 }), getContext: () => ctx, width: 0, height: 0 });
  const el = node();
  new Function('window', 'document', 'location', 'URLSearchParams', 'requestAnimationFrame', SRC)(
    { addEventListener() {}, devicePixelRatio: 1, matchMedia: null },
    { readyState: 'complete', createElement: node, querySelectorAll: () => [el], addEventListener() {} },
    { search: '' }, URLSearchParams, (f) => { tick = f; });
  let ts = 1, n = 0;
  tick(ts);
  for (let t = 0; t < to; t += 1 / fps) {
    ts += 1000 / fps; tick(ts);
    if (t >= from) fs.writeFileSync(path.join(dir, String(n++).padStart(5, '0') + '.png'), png(256, 144, Buffer.from(data.buffer)));
  }
  console.log('frames', n);
} else {
  for (const t of args) {
    fs.writeFileSync(path.join(OUT, 'frame-' + t + '.png'), png(1024, 576, scale(frameAt(t), 256, 144, 4)));
    console.log('out/frame-' + t + '.png');
  }
}
