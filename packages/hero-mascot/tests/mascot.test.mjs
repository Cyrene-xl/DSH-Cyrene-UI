/**
 * dsha-hero-mascot 的行为测试（Node 桩 DOM，直接加载真实的 client.js）。
 *
 * 重点验证浏览器端的泛洪抠白底：它直接改像素，最容易出「把角色内部的白色
 * 打出洞」或「边界越界」这类不可见的错。用一张合成图来钉死行为：
 *
 *   8×8 全白，中间有一个 4×4 的闭合黑框，框内 2×2 是白色
 *   → 与四边连通的白必须变透明；闭在框里的白必须原样保留。
 *
 * 顺带覆盖设置读写与吉祥物取图（自定义图 / 回落默认图）。
 */
import fs from 'node:fs';
const CODE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/* ── 合成源图：8×8 ── */
const W = 8, H = 8;
const SRC = new Uint8ClampedArray(W * H * 4);
function put(x, y, r, g, b, a = 255) {
  const i = (y * W + x) * 4;
  SRC[i] = r; SRC[i + 1] = g; SRC[i + 2] = b; SRC[i + 3] = a;
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 255, 255, 255, 255);
for (let x = 2; x <= 5; x++) { put(x, 2, 0, 0, 0); put(x, 5, 0, 0, 0); }
for (let y = 2; y <= 5; y++) { put(2, y, 0, 0, 0); put(5, y, 0, 0, 0); }
// 框内 (3,3)(4,3)(3,4)(4,4) 保持白

let lastCanvas = null;
function makeCanvas() {
  const canvas = {
    width: 0, height: 0, pixels: null,
    getContext() {
      return {
        drawImage(source, dx, dy, dw, dh) {
          canvas.width = dw; canvas.height = dh;
          canvas.pixels = new Uint8ClampedArray(dw * dh * 4);
          for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
            const sx = Math.min(W - 1, Math.floor(x * W / dw));
            const sy = Math.min(H - 1, Math.floor(y * H / dh));
            const s = (sy * W + sx) * 4, d = (y * dw + x) * 4;
            for (let k = 0; k < 4; k++) canvas.pixels[d + k] = SRC[s + k];
          }
        },
        getImageData(x, y, w, h) { return { data: Uint8ClampedArray.from(canvas.pixels), width: w, height: h }; },
        putImageData(frame) { canvas.pixels = Uint8ClampedArray.from(frame.data); }
      };
    },
    toDataURL() { lastCanvas = canvas; return 'data:image/png;base64,STUB'; }
  };
  return canvas;
}
function makeInput() {
  const listeners = {};
  const input = {
    type: '', accept: '', style: {}, files: null, parentNode: null,
    addEventListener(ev, fn) { listeners[ev] = fn; },
    click() { input.files = [{ name: 'x.png' }]; if (listeners.change) listeners.change(); }
  };
  return input;
}

/* ── 迷你 DOM ── */
class El {
  constructor(t) { this.tagName = String(t).toUpperCase(); this.children = []; this.attrs = {}; this._text = ''; this.style = {}; this.parentElement = null; }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = String(v); }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  querySelectorAll(s) { return all(this, s); }
  querySelector(s) { return all(this, s)[0] || null; }
}
const matches = (e, s) => {
  if (s.startsWith('[class*="')) return e.className.includes(s.slice(9, -2));
  throw new Error('unsupported selector ' + s);
};
const walk = (r, f) => { for (const c of r.children) { f(c); walk(c, f); } };
const all = (r, s) => { const o = []; walk(r, e => { if (matches(e, s)) o.push(e); }); return o; };
const collect = (n, o = []) => {
  if (!n || typeof n !== 'object') return o;
  if (Array.isArray(n)) { n.forEach(x => collect(x, o)); return o; }
  if (n.p) o.push(n);
  (n.c || []).forEach(x => collect(x, o));
  return o;
};

function run(seed) {
  const html = new El('html'), head = new El('head'), body = new El('body');
  html.appendChild(head); html.appendChild(body);
  const store = new Map();
  if (seed !== undefined) store.set('dsha-hero-mascot:view', JSON.stringify(seed));
  const window = {
    __ModuleLoader__: { load: d => { window.__def = d; } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  };
  const document = {
    documentElement: html, head, body,
    createElement: t => (t === 'canvas' ? makeCanvas() : makeInput()),
    querySelectorAll: s => all(html, s), querySelector: s => all(html, s)[0] || null,
    getElementById: () => null
  };
  const MutationObserver = class { constructor() {} observe() {} };
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,SRC'; if (this.onload) this.onload(); }
  };
  globalThis.Image = class {
    constructor() { this.width = W; this.height = H; }
    set src(v) { if (this.onload) this.onload(); }
  };
  const react = { createElement: (t, p, ...c) => ({ t, p, c }), useState: i => [typeof i === 'function' ? i() : i, () => {}], useEffect: () => {} };
  const req = id => { if (id === 'react') return react; throw new Error('req ' + id); };
  new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', 'console', CODE)
    (window, document, MutationObserver, f => f(), console);
  const regs = {}; let dict = null;
  window.__def.factory(req).apply({
    effect: f => f(),
    slots: { inject: (n, cb) => cb(), register: (o, c) => { regs[o.name] = c; return () => {}; } },
    locale: { register: (ns, d) => { dict = d; return () => {}; } }
  });
  const t = k => (dict && dict.zh && dict.zh[k] !== undefined) ? dict.zh[k] : k;
  const tree = regs['settings.general.item']({ t });
  const nodes = collect(tree);
  const buttons = nodes.filter(n => n.t === 'button');
  const inputs = nodes.filter(n => n.t === 'input' && n.p.type === 'range');
  const renderMascot = () => regs['conversation.hero.brand.mark']({ className: 'fish' });
  return { tree, t, buttons, inputs, renderMascot,
    byLabel: label => buttons.find(b => (b.c || []).includes(label)),
    imgSrc: () => collect(renderMascot()).find(n => n.t === 'img').p.src };
}

let pass = 0, fail = 0;
const chk = (n, g, w) => { if (g === w) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, '\n      得到:', JSON.stringify(g), '\n      期望:', JSON.stringify(w)); } };
const alphaAt = (x, y) => lastCanvas.pixels[(y * lastCanvas.width + x) * 4 + 3];

console.log('【1】抠白底：边框白透明化，框内白原样保留');
{
  const r = run({ cutout: true });
  lastCanvas = null;
  r.byLabel('选择图片').p.onClick();
  chk('产生了一张画布', lastCanvas !== null, true);
  chk('四角白 → 透明', alphaAt(0, 0), 0);
  chk('边框白 → 透明', alphaAt(7, 7), 0);
  chk('框外的白 → 透明', alphaAt(1, 1), 0);
  chk('闭在框里的白 → 保留', alphaAt(3, 3), 255);
  chk('框内另一格也保留', alphaAt(4, 4), 255);
  // 框的上边缘紧邻背景，会被 3×3 均值羽化：8 邻域里 3 个是背景 → 6/9×255 ≈ 170。
  // 这是刻意的抗锯齿软化（1px 羽化带），关键是不能被删成 0。
  chk('框边缘被羽化而非删除', alphaAt(3, 2), 170);
  chk('框的下一行仍完全实心', alphaAt(3, 3), 255);
}

console.log('【2】关闭抠白底：alpha 一个都不动');
{
  const r = run({ cutout: false });
  lastCanvas = null;
  r.byLabel('选择图片').p.onClick();
  const alphas = new Set();
  for (let i = 3; i < lastCanvas.pixels.length; i += 4) alphas.add(lastCanvas.pixels[i]);
  chk('全部仍是 255', [...alphas].join(','), '255');
}

console.log('【3】上传后吉祥物用它；清除后回落默认图');
{
  const r = run({ cutout: true });
  chk('初始用默认图', r.imgSrc(), '/dsh-hero-mascot/hero.png');
  r.byLabel('选择图片').p.onClick();
  chk('上传后 src 变成 data URL', r.imgSrc().indexOf('data:image/png') === 0, true);
  const rr = run({ cutout: true, image: 'data:image/png;base64,AAA' });
  chk('已存的自定义图生效', rr.imgSrc(), 'data:image/png;base64,AAA');
  chk('有清除按钮', rr.byLabel('清除') !== undefined, true);
}

console.log('【4】大小 / 位置滑杆仍工作');
{
  const r = run({ size: 56, offsetX: 0, offsetY: 0 });
  const size = r.inputs.find(i => i.p['aria-label'] === '大小');
  chk('默认 56', size.p.value, 56);
  chk('滑杆范围 24–160', size.p.min + '~' + size.p.max, '24~160');
  const style = collect(r.renderMascot()).find(n => n.t === 'span' && n.p['data-dsha-hero-mascot'] !== undefined);
  chk('吉祥物按设置尺寸', style.p.style.width, '56px');
  chk('水平偏移生效', style.p.style.left, '0px');
}

console.log('【5】读盘容错：越界值夹回、非 data URL 的图被忽略');
{
  const r = run({ size: 9999, offsetX: -9999, image: 'https://evil.example/x.png', cutout: true });
  const size = r.inputs.find(i => i.p['aria-label'] === '大小');
  chk('size 夹到上限 160', size.p.value, 160);
  const off = r.inputs.find(i => i.p['aria-label'] === '水平');
  chk('offsetX 夹到下限 -80', off.p.value, -80);
  chk('外链图片被忽略（只接受 data:image/）', r.imgSrc(), '/dsh-hero-mascot/hero.png');
}

console.log('【6】默认值：未设置时 size=56、抠白底默认开');
{
  const r = run({});
  chk('size 默认 56', r.inputs.find(i => i.p['aria-label'] === '大小').p.value, 56);
  chk('抠白底默认开启', r.byLabel('抠白底 ✓') !== undefined, true);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
