/**
 * dsha-brand-rename「多条新会话标题 + 随机/顺序选取」的行为测试。
 *
 * 和 placeholder.test.mjs 同一套路：Node 下手搭一个极简 DOM 桩，
 * 直接加载真实的 ../client.js（上线那份），只驱动它自己的补丁逻辑。
 * 这里额外加了两个能力：
 *   1. 把 Math.random 钉死（经参数注入），随机抽取结果可预期；
 *   2. 可以卸载 / 重新挂载 Hero 标题节点，模拟「又开了一个新会话」。
 */
import fs from 'node:fs';

const CODE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const ZH_HERO = '描述你想要构建的内容, / 调用指令, @ 文件或对话';
const ORIGINAL_TITLE = '探索未至之境';
const DEFAULT_HEADLINE = '嗨，想我了吗？';

class El {
  constructor(t) { this.tagName = String(t).toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this._text = ''; this.style = {}; this.parentElement = null; }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = String(v); }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentElement) c.parentElement.children = c.parentElement.children.filter(x => x !== c);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentElement = this; return c;
  }
  addEventListener(type, fn) { (this._handlers = this._handlers || {})[type] = (this._handlers[type] || []).concat(fn); }
  fire(type, ev) { ((this._handlers || {})[type] || []).forEach(fn => fn(ev || { target: this })); }
  get nextSibling() { const p = this.parentElement; if (!p) return null; const i = p.children.indexOf(this); return i < 0 || i + 1 >= p.children.length ? null : p.children[i + 1]; }
  get previousSibling() { const p = this.parentElement; if (!p) return null; const i = p.children.indexOf(this); return i <= 0 ? null : p.children[i - 1]; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); if (c) c.parentElement = null; return c; }
  querySelectorAll(s) { return all(this, s); } querySelector(s) { return all(this, s)[0] || null; }
}
const matches = (e, s) => {
  if (s.startsWith('[class*="')) return e.className.includes(s.slice(9, -2));
  if (s === '[data-composer-placeholder]') return e.getAttribute('data-composer-placeholder') !== null;
  if (s === '[data-placeholder]') return e.getAttribute('data-placeholder') !== null;
  if (s.startsWith('.')) return (' ' + e.className + ' ').indexOf(' ' + s.slice(1) + ' ') !== -1;
  if (/^\[[a-z-]+\]$/.test(s)) return e.getAttribute(s.slice(1, -1)) !== null;
  if (/^(?:\[[a-z-]+="[^"]*"\])+$/.test(s)) {
    return (s.match(/\[[a-z-]+="[^"]*"\]/g) || []).every(part => {
      const m = /^\[([a-z-]+)="([^"]*)"\]$/.exec(part);
      return e.getAttribute(m[1]) === m[2];
    });
  }
  throw new Error(s);
};
const walk = (r, f) => { for (const c of r.children) { f(c); walk(c, f); } };
/* 支持 "A B" 这种后代选择器（浏览器原生就支持，桩里补上）。 */
const matchesDeep = (e, selector) => {
  const parts = String(selector).trim().split(/\s+(?![^\[]*\])/);
  if (parts.length === 1) return matches(e, parts[0]);
  if (!matches(e, parts[parts.length - 1])) return false;
  let pi = parts.length - 2;
  let node = e.parentElement;
  while (node && pi >= 0) {
    if (matches(node, parts[pi])) pi--;
    node = node.parentElement;
  }
  return pi < 0;
};
const all = (r, s) => { const o = []; walk(r, e => { if (matchesDeep(e, s)) o.push(e); }); return o; };
const collect = (n, o = []) => {
  if (!n || typeof n !== 'object') return o;
  if (Array.isArray(n)) { n.forEach(x => collect(x, o)); return o; }
  if (n.p) o.push(n);
  (n.c || []).forEach(x => collect(x, o));
  return o;
};
const textOf = n => (n.c || []).filter(x => typeof x === 'string').join('');

/**
 * @param seed - 预置到 localStorage 的配置。
 * @param options.random - Math.random 的替身；缺省用真随机。
 */
function run(seed, options = {}) {
  const html = new El('html'), head = new El('head'), body = new El('body');
  html.appendChild(head); html.appendChild(body);

  /* 输入框提示区：本测试不关心，但插件每次补丁都会一起处理。 */
  const grow = new El('div'), ed = new El('div'), ph = new El('div');
  ed.setAttribute('data-placeholder', ZH_HERO);
  ph.setAttribute('data-composer-placeholder', ''); ph.textContent = ZH_HERO;
  grow.appendChild(ed); grow.appendChild(ph); body.appendChild(grow);

  /* 模拟侧栏：左下角的「设置」标签 + 它上方的「美化」按钮（ui-boost 的）。 */
  const settingsArea = new El('div'); settingsArea.className = 'AbCd_settingsArea';
  const settingsLabel = new El('span'); settingsLabel.className = 'XyZ_triggerLabel'; settingsLabel.textContent = '设置';
  settingsArea.appendChild(settingsLabel); body.appendChild(settingsArea);
  const beautifyBtn = new El('button'); beautifyBtn.className = 'dshub-footbtn'; beautifyBtn.textContent = '🎨 美化';
  body.appendChild(beautifyBtn);

  /* 模拟底部状态行：轮/步 一个 label，缓存命中 在另一个 label（中间还有 _sep 元素）。 */
  const statsLabel = new El('span'); statsLabel.className = 'Qq_label';
  const statsText = { nodeType: 3, data: '3 轮 5 步' };
  statsLabel.childNodes = [statsText];
  body.appendChild(statsLabel);

  const usageLabel = new El('span'); usageLabel.className = 'Qq_usage_label';
  const usageTotalText = { nodeType: 3, data: '1.2k tokens' };
  const usageSep = new El('span'); usageSep.className = 'Qq_sep';
  const usageSepText = { nodeType: 3, data: ' · ' };
  usageSep.childNodes = [usageSepText];
  const usageCacheText = { nodeType: 3, data: '缓存命中 45%' };
  usageLabel.childNodes = [usageTotalText, usageSep, usageCacheText];
  body.appendChild(usageLabel);

  /* 模拟设置面板：role=dialog + aria-modal，里面有一行带插件标记类名。 */
  const dialogPanel = new El('div');
  dialogPanel.setAttribute('role', 'dialog');
  dialogPanel.setAttribute('aria-modal', 'true');
  const dialogRow = new El('div'); dialogRow.className = 'dsha-brand-row';
  dialogPanel.appendChild(dialogRow); body.appendChild(dialogPanel);

  let group = null, title = null, badge = null;
  /* 真实结构：stack > headline > titleGroup（滑块要插在 headline 之后、stack 里）。 */
  let heroStack = null, heroHeadline = null;
  function mountHero(empty) {
    if (group) unmountHero();
    heroStack = new El('div'); heroStack.className = 'AbC_stack';
    heroHeadline = new El('div'); heroHeadline.className = 'AbC_headline';
    group = new El('div'); group.className = 'AbC123_titleGroup';
    title = new El('span'); title.textContent = empty ? '' : ORIGINAL_TITLE;
    badge = new El('span'); badge.className = 'AbC123_previewBadge'; badge.textContent = '预览版';
    group.appendChild(title); group.appendChild(badge);
    heroHeadline.appendChild(group); heroStack.appendChild(heroHeadline); body.appendChild(heroStack);
  }
  function unmountHero() {
    if (!group) return;
    body.children = body.children.filter(c => c !== heroStack);
    group = null; title = null; badge = null; heroStack = null; heroHeadline = null;
  }
  mountHero(!!options.emptyTitle);

  const store = new Map();
  if (seed !== undefined) store.set('dsh-brand-rename:view', JSON.stringify(seed));
  const windowListeners = {};
  const window = {
    __ModuleLoader__: { load: d => { window.__def = d; } },
    addEventListener: (type, fn) => { (windowListeners[type] = windowListeners[type] || []).push(fn); },
    removeEventListener: () => {},
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    }
  };

  let obs = null; const regs = {}; let dict = null;
  /** 全局 click 监听（插件用来「点空白处收起菜单」），桩里只记录不派发。 */
  const documentListeners = {};
  const document = {
    documentElement: html, head, body, getElementById: () => null,
    createElement: t => new El(t),
    querySelectorAll: s => all(html, s), querySelector: s => all(html, s)[0] || null,
    /* 插件在 factory 里注册了全局 click（用来点空白处收起样式菜单）。
       桩里不需要真的派发，记下来即可 —— 缺这两个方法会让 factory 直接抛错。 */
    addEventListener: (type, fn) => { (documentListeners[type] = documentListeners[type] || []).push(fn); },
    removeEventListener: () => {}
  };
  const MutationObserver = class { constructor(cb) { obs = cb; } observe() {} };
  const react = {
    createElement: (t, p, ...c) => ({ t, p, c }),
    useState: i => [typeof i === 'function' ? i() : i, () => {}],
    useEffect: () => {}
  };
  const req = id => {
    if (id === 'react') return react;
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { BrandWordmark: function () {} };
    throw new Error(id);
  };

  /* Math 以参数注入函数体，既保留其余方法，又能把 random 钉死。 */
  let randomCalls = 0;
  const math = {
    random: () => { randomCalls++; return options.random ? options.random() : Math.random(); },
    floor: Math.floor, max: Math.max, min: Math.min, round: Math.round
  };

  /* 可控时钟：插件用 Date.now() 判断「Hero 消失多久才算换了页面」。 */
  let clock = 1000000;
  const dateStub = { now: () => clock };

  /*
   * fetch 桩：设置面板里「聊天模式称呼」那一行靠它读写主机的
   * /dsh-brand-rename-api。useEffect 在桩里是空实现，所以这里只验证
   * 用户动作（回车 / 失焦）打出去的请求长什么样。
   */
  const fetchCalls = [];
  const fetchStub = (url, init) => {
    fetchCalls.push({ url, init });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, nickname: '伙伴' }) });
  };
  globalThis.fetch = fetchStub;

  /* 假 locale 服务：带真实结构的字典，插件会直接改写它们。 */
  function builtinDicts() {
    const conv = new Map();
    conv.set('zh', {
      'access.preset.readOnly': '仅可查看',
      'access.preset.workspaceWrite': '工作区内修改',
      'access.preset.fullAccess': '完全权限',
      'access.confirm.title': '确认启用完全权限？',
      'access.confirm.description': '启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作。',
      'access.confirm.enable': '启用完全权限'
    });
    conv.set('en', {
      'access.preset.readOnly': 'Read Only',
      'access.preset.workspaceWrite': 'Workspace Write',
      'access.preset.fullAccess': 'Full access',
      'access.confirm.title': 'Enable Full access?',
      'access.confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly.',
      'access.confirm.enable': 'Enable Full access'
    });
    const perm = new Map();
    perm.set('zh', {
      'preset.readOnly': '仅可查看',
      'preset.workspaceWrite': '工作区内修改',
      'preset.fullAccess': '完全权限',
      'confirm.title': '确认启用完全权限？',
      'confirm.description': '启用完全权限后，新会话将减少确认步骤。',
      'confirm.enable': '启用完全权限'
    });
    perm.set('en', {
      'preset.readOnly': 'Read Only',
      'preset.workspaceWrite': 'Workspace Write',
      'preset.fullAccess': 'Full access',
      'confirm.title': 'Enable Full access?',
      'confirm.description': 'Full access reduces confirmation steps for new sessions.',
      'confirm.enable': 'Enable Full access'
    });
    const out = new Map();
    out.set('conversation', conv);
    out.set('settings.permission', perm);
    return out;
  }
  const dicts = options.latePermissionDicts ? new Map() : builtinDicts();
  /* 假会话 + 假 remote：给模式滑块用（记录 select 调用）。 */
  const selectCalls = [];
  const sessionState = { id: 'session-blank', blank: true, preset: 'standard' };
  const sessionsService = {
    list: {
      getSnapshot: () => ({
        current: sessionState.id,
        byId: { [sessionState.id]: { id: sessionState.id, blank: sessionState.blank, projectionValues: { agentPreset: sessionState.preset } } }
      }),
      subscribe: () => () => {}
    }
  };
  const remoteService = {
    agentPresets: {
      select: (sessionId, preset) => {
        selectCalls.push([sessionId, preset]);
        sessionState.preset = preset;
        return Promise.resolve({ ok: true, value: preset });
      }
    }
  };

  const localeSubs = new Set();
  const localeService = {
    dicts: dicts,
    snapshot: { active: 'zh' },
    publish: () => { localeSubs.forEach(fn => fn()); },
    subscribe: (fn) => { localeSubs.add(fn); return () => localeSubs.delete(fn); },
    register: (ns, d) => { dict = d; return () => {}; }
  };

  new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', 'console', 'Math', 'Date', CODE)
    (window, document, MutationObserver, f => f(), console, math, dateStub);
  window.__def.factory(req).apply({
    effect: f => f(),
    slots: {
      inject: (n, cb) => cb(),
      register: (o, c) => { regs[o.id || o.name] = c; return () => {}; }
    },
    locale: localeService,
    get: (name) => (name === 'sessions' ? sessionsService : name === 'remote' ? remoteService : undefined),
    inject: (deps, cb) => {
      const scope = { sessions: sessionsService, remote: remoteService };
      const dispose = typeof cb === 'function' ? cb(scope) : undefined;
      return () => { if (typeof dispose === 'function') dispose(); };
    }
  });

  const t = k => (dict && dict.zh && dict.zh[k] !== undefined) ? dict.zh[k] : k;
  const fire = () => { if (obs) obs(); };
  fire();

  const HRow = regs['brand-headline'];
  const permRow = regs['brand-permission'];
  const nicknameRow = regs['brand-nickname'];
  const sidebarRow = regs['brand-sidebar'];
  const statsRow = regs['brand-stats'];
  const renderSidebar = () => sidebarRow({ t });
  const renderH = () => HRow({ t });
  const renderNickname = () => nicknameRow({ t });
  const nicknameInputs = () => collect(renderNickname()).filter(n => n.t === 'input' && n.p.type === 'text');
  const inputs = () => collect(renderH()).filter(n => n.t === 'input').filter(n => n.p.maxLength === 60);
  const buttons = () => collect(renderH()).filter(n => n.t === 'button');
  const buttonByText = label => buttons().find(n => textOf(n) === label);
  const rowValues = () => inputs().map(n => n.p.value);

  return {
    ph, ed, html, body, t,
    fire,
    /*
     * 模拟「又开了一个新会话」：先离开新会话页（Hero 被卸载、补丁看到它不在了），
     * 隔一会儿再进来。gap 默认 1.5s，超过插件的 800ms 判定阈值。
     */
    newSession: (empty, gap) => {
      unmountHero();
      fire();                                  // 补丁观察到「不在新会话页了」
      clock += (gap === undefined ? 1500 : gap);
      mountHero(empty);
      fire();
    },
    /* 模拟页面内部重渲染：标题格节点被换掉，但一直没离开这一页。 */
    remountTitle: (empty) => {
      const next = new El('span');
      next.textContent = empty ? '' : ORIGINAL_TITLE;
      group.children = group.children.map(c => (c === title ? next : c));
      title = next;
      fire();
    },
    /* 只让时间流逝，不重新进页面。 */
    tick: (ms) => { clock += (ms === undefined ? 3000 : ms); fire(); },
    titleText: () => (title ? title.textContent : null),
    titleNode: () => title,
    applied: () => (title ? title.getAttribute('data-dsha-headline-applied') : null),
    orig: () => (title ? title.getAttribute('data-dsha-headline-orig') : null),
    badge,
    randomCalls: () => randomCalls,
    stored: () => JSON.parse(store.get('dsh-brand-rename:view') || 'null'),
    rows: rowValues,
    renderH,
    inputs,
    buttons,
    buttonByText,
    /* 先重渲染一次再读：真实 React 里状态一变就会重渲染，桩里要手动补这一步。 */
    modeSwitch: () => html.querySelector('.dsha-mode-switch'),
    modeOptions: () => (html.querySelector('.dsha-mode-switch') ? html.querySelector('.dsha-mode-switch').querySelectorAll('[data-dsha-mode]') : []),
    modeLabels: () => {
      const sw = html.querySelector('.dsha-mode-switch');
      if (!sw) return [];
      return sw.querySelectorAll('[data-dsha-mode]').map(b => b.children.map(c => c.textContent).join('|'));
    },
    clickMode: (id) => {
      const sw = html.querySelector('.dsha-mode-switch');
      const btn = sw.querySelectorAll('[data-dsha-mode]').find(b => b.getAttribute('data-dsha-mode') === id);
      btn.fire('click');
    },
    clickTrack: () => html.querySelector('.dsha-mode-switch').querySelector('.dsha-mode-track').fire('click'),
    activeMode: () => {
      const sw = html.querySelector('.dsha-mode-switch');
      const on = sw.querySelectorAll('[data-dsha-mode]').find(b => String(b.className).indexOf('on') !== -1);
      return on ? on.getAttribute('data-dsha-mode') : null;
    },
    setSession: (patch) => { Object.assign(sessionState, patch); },
    selectCalls: () => selectCalls.slice(),
    renderNickname,
    nicknameInputs,
    fetchCalls: () => fetchCalls.slice(),
    blurNickname: (value) => { nicknameInputs()[0].p.onBlur({ target: { value } }); },
    keyNickname: (value, key) => { nicknameInputs()[0].p.onKeyDown({ target: { value }, key, preventDefault() {} }); },
    registeredRows: () => Object.keys(regs),
    localeKeys: () => (dict ? { zh: Object.keys(dict.zh), en: Object.keys(dict.en) } : { zh: [], en: [] }),
    localeText: (locale, key) => (dict && dict[locale] ? dict[locale][key] : undefined),
    statsText: () => statsText,
    cacheText: () => usageCacheText,
    usageLabel: () => usageLabel,
    setStatsData: (data) => { statsText.data = data; fire(); },
    statsInputs: () => collect(statsRow({ t })).filter(n => n.t === 'input' && n.p.type === 'text'),
    typeStats: (i, v) => {
      const list = collect(statsRow({ t })).filter(n => n.t === 'input' && n.p.type === 'text');
      list[i].p.onChange({ target: { value: v } });
    },
    sidebarSettings: () => settingsLabel,
    sidebarBeautify: () => beautifyBtn,
    /* 模拟 React 重渲染把按钮文案改回原文（ui-boost 会这样切 🎨 / ✕）。 */
    rerenderBeautify: (text) => { beautifyBtn.textContent = text; fire(); },
    sidebarInputs: () => collect(renderSidebar()).filter(n => n.t === 'input' && n.p.type === 'text'),
    typeSidebar: (i, v) => {
      const list = collect(renderSidebar()).filter(n => n.t === 'input' && n.p.type === 'text');
      list[i].p.onChange({ target: { value: v } });
    },
    clickResetSidebar: () => {
      const tree = collect(renderSidebar());
      tree.find(n => n.t === 'button' && textOf(n) === t('common.reset')).p.onClick();
    },
    panel: () => { renderH(); return dialogPanel; },
    panelDimButton: () => {
      const label = t('panelDim.label');
      return collect(renderH()).find(n => n.t === 'button' && (textOf(n) === t('panelDim.on') || textOf(n) === t('panelDim.off')));
    },
    togglePanelDim: () => {
      const btn = collect(renderH()).find(n => n.t === 'button' && (textOf(n) === t('panelDim.on') || textOf(n) === t('panelDim.off')));
      btn.p.onClick();
    },
    setPanelAlpha: (pct) => {
      const label = t('panelDim.alpha');
      const node = collect(renderH()).find(n => n.t === 'input' && n.p.type === 'range' && n.p['aria-label'] === label);
      node.p.onChange({ target: { value: String(pct) } });
    },
    titleGroup: () => group,
    heroHeadline: () => heroHeadline,
    unmountHero: () => { unmountHero(); fire(); },
    enNode: () => (group ? group.children.find(c => String(c.className).indexOf('dsha-headline-en') !== -1) || null : null),
    enText: () => {
      const node = group ? group.children.find(c => String(c.className).indexOf('dsha-headline-en') !== -1) : null;
      return node ? node.textContent : null;
    },
    zhInputs: () => collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'text' && n.p.maxLength === 60),
    enInputs: () => collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'text' && n.p.maxLength === 80),
    /* 只数英文行那三根（面板不透明度那根不算）。 */
    /* 滑杆按 aria-label 前缀分组：title:* 中文标题，en:* 英文行。 */
    sliders: () => collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'range'
      && typeof n.p['aria-label'] === 'string' && n.p['aria-label'].indexOf('en:') === 0),
    titleSliders: () => collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'range'
      && typeof n.p['aria-label'] === 'string' && n.p['aria-label'].indexOf('title:') === 0),
    titleSliderValues: () => collect(renderH())
      .filter(n => n.t === 'input' && n.p.type === 'range' && typeof n.p['aria-label'] === 'string' && n.p['aria-label'].indexOf('title:') === 0)
      .map(n => Number(n.p.value)),
    typeEn: (i, v) => {
      const list = collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'text' && n.p.maxLength === 80);
      list[i].p.onChange({ target: { value: v } });
    },
    pressTitleSlider: (key) => {
      const node = collect(renderH()).find(n => n.t === 'input' && n.p.type === 'range' && n.p['aria-label'] === 'title:' + key);
      (node.p.onPointerDown || node.p.onMouseDown || node.p.onTouchStart)();
    },
    setTitleSlider: (key, v) => {
      const node = collect(renderH()).find(n => n.t === 'input' && n.p.type === 'range' && n.p['aria-label'] === 'title:' + key);
      node.p.onChange({ target: { value: String(v) } });
    },
    clickResetStyle: () => buttonByText(t('common.resetStyle')).p.onClick(),
    /* 锁定开关：按钮文案会带「✓」后缀，所以按前缀找。 */
    clickLock: () => buttons().find(n => textOf(n).indexOf(t('headlineLock.label')) === 0).p.onClick(),
    /* 所有 range 滑杆（中文组 3 + 英文组 3 + 面板不透明度 1）—— 锁定断言用。 */
    allRangeInputs: () => collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'range'),
    pressSlider: (key) => {
      const node = collect(renderH()).find(n => n.t === 'input' && n.p.type === 'range' && n.p['aria-label'] === 'en:' + key);
      (node.p.onPointerDown || node.p.onMouseDown || node.p.onTouchStart)();
    },
    releasePointer: () => { (windowListeners.pointerup || []).forEach(fn => fn()); },
    focusEn: (i) => {
      const list = collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'text' && n.p.maxLength === 80);
      if (list[i].p.onFocus) list[i].p.onFocus();
    },
    blurEn: (i) => {
      const list = collect(renderH()).filter(n => n.t === 'input' && n.p.type === 'text' && n.p.maxLength === 80);
      if (list[i].p.onBlur) list[i].p.onBlur();
    },
    setSlider: (key, v) => {
      const node = collect(renderH()).find(n => n.t === 'input' && n.p.type === 'range' && n.p['aria-label'] === 'en:' + key);
      node.p.onChange({ target: { value: String(v) } });
    },
    add: () => buttonByText(t('headline.add')).p.onClick(),
    reset: () => buttonByText(t('common.reset')).p.onClick(),
    setMode: mode => buttonByText(t('headline.mode.' + mode)).p.onClick(),
    modePressed: mode => buttonByText(t('headline.mode.' + mode)).p['aria-pressed'],
    typeAt: (i, v) => inputs()[i].p.onChange({ target: { value: v } }),
    dict: (ns, loc) => (dicts.get(ns) ? dicts.get(ns).get(loc) : undefined),
    attachPermissionDicts: () => {
      for (const [ns, map] of builtinDicts()) dicts.set(ns, map);
      localeService.publish();
    },
    renderPerm: () => permRow({ t }),
    permInputs: () => collect(permRow({ t })).filter(n => n.t === 'input'),
    permRows: () => collect(permRow({ t })).filter(n => n.t === 'input').map(n => n.p.value),
    permHints: () => collect(permRow({ t })).filter(n => n.t === 'input').map(n => n.p.placeholder),
    typePerm: (i, v) => collect(permRow({ t })).filter(n => n.t === 'input')[i].p.onChange({ target: { value: v } }),
    resetPerm: () => collect(permRow({ t })).filter(n => n.t === 'button')[0].p.onClick(),
    removeAt: i => {
      const list = inputs();
      const label = list[i].p['aria-label'];
      const index = label.split(' ').pop();
      buttons().find(n => n.p['aria-label'] === t('headline.remove') + ' ' + index).p.onClick();
    }
  };
}

let pass = 0, fail = 0;
const chk = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if (ok) { pass++; console.log('  ✓', n); }
  else { fail++; console.log('  ✗', n, '\n      得到:', JSON.stringify(g), '\n      期望:', JSON.stringify(w)); }
};

console.log('【1】旧版单条 headline 迁移成列表');
{ const r = run({ headline: '旧标题' }); r.fire();
  chk('标题就是旧值', r.titleText(), '旧标题');
  chk('落盘已升级为列表', r.stored().headlines, ['旧标题']);
  chk('旧字段不再使用', r.stored().headline, undefined); }
{ const r = run({}); r.fire(); chk('没设过 → 插件默认值', r.titleText(), DEFAULT_HEADLINE); }
{ const r = run({ headline: null }); r.fire(); chk('旧的显式 null → 插件默认值', r.titleText(), DEFAULT_HEADLINE); }
{ const r = run({ headline: '' }); r.fire(); chk('旧的空串 → 保留系统原文', r.titleText(), ORIGINAL_TITLE); }

console.log('【2】多条 + 随机：钉死随机数，且补丁反复跑不重抽');
{ const r = run({ headlines: ['A', 'B', 'C'], headlineMode: 'random' }, { random: () => 0 });
  chk('首抽 = 列表第一条', r.titleText(), 'A');
  const calls = r.randomCalls();
  r.fire(); r.fire(); r.fire(); r.fire();
  chk('反复补丁不重新抽签', r.randomCalls(), calls);
  chk('文本保持不动', r.titleText(), 'A');
  r.newSession();
  chk('新会话排除上一次（A）后抽到 B', r.titleText(), 'B');
  r.newSession();
  chk('再新会话排除 B 后抽到 A', r.titleText(), 'A');
  chk('上次结果已落盘', r.stored().headlineLast, 'A'); }

console.log('【3】顺序模式：按列表轮换并循环');
{ const r = run({ headlines: ['A', 'B', 'C'], headlineMode: 'sequence' });
  chk('第 1 次 = A', r.titleText(), 'A');
  r.newSession(); chk('第 2 次 = B', r.titleText(), 'B');
  r.newSession(); chk('第 3 次 = C', r.titleText(), 'C');
  r.newSession(); chk('第 4 次回到 A', r.titleText(), 'A');
  chk('游标已落盘', r.stored().headlineCursor, 1);
  chk('游标在 0..n-1 内', r.stored().headlineCursor < 3, true); }
{ const r = run({ headlines: ['A', 'B', 'C'], headlineMode: 'sequence', headlineCursor: 2 });
  chk('刷新后接着上次的进度', r.titleText(), 'C'); }

console.log('【4】空行 / 空白条目不参与抽取');
{ const r = run({ headlines: ['', 'A', '   ', 'B'], headlineMode: 'sequence' });
  chk('跳过空行取 A', r.titleText(), 'A');
  r.newSession(); chk('再取 B', r.titleText(), 'B');
  r.newSession(); chk('回到 A', r.titleText(), 'A'); }

console.log('【5】空列表 = 保留系统原文');
{ const r = run({ headlines: [] }); r.fire();
  chk('不动系统原文', r.titleText(), ORIGINAL_TITLE);
  chk('没有 applied 标记', r.applied(), null); }

console.log('【6】随机模式：单条时永远那一条；多条时避免连着重复');
{ const r = run({ headlines: ['唯一'] }, { random: () => 0.999 });
  let same = true;
  for (let i = 0; i < 5; i++) { r.newSession(); if (r.titleText() !== '唯一') same = false; }
  chk('5 次新会话都是唯一那条', same, true); }
{ const r = run({ headlines: ['A', 'B', 'C'] });   // 真随机
  const seen = [r.titleText()];
  for (let i = 0; i < 40; i++) { r.newSession(); seen.push(r.titleText()); }
  chk('每次都落在候选里', seen.every(x => ['A', 'B', 'C'].includes(x)), true);
  let repeat = false;
  for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) repeat = true;
  chk('40 次都没有连着重复', repeat, false);
  chk('三条都被用到过', new Set(seen).size, 3); }

console.log('【7】设置行：默认一行 / 加一条 / 删一条 / 恢复默认');
{ const r = run({});
  chk('未设置时显示插件默认值一行', r.rows(), [DEFAULT_HEADLINE]);
  r.add();
  chk('加一条后有 2 行', r.rows(), [DEFAULT_HEADLINE, '']);
  r.typeAt(1, '今天想做什么？');
  chk('第 2 行落盘', r.stored().headlines, [DEFAULT_HEADLINE, '今天想做什么？']);
  r.typeAt(0, '嗨，想我了吗！');
  chk('第 1 行也跟着改', r.stored().headlines, ['嗨，想我了吗！', '今天想做什么？']);
  r.removeAt(1);
  chk('删掉第 2 行', r.stored().headlines, ['嗨，想我了吗！']);
  r.removeAt(0);
  chk('删光 = 空列表', r.stored().headlines, []);
  chk('没有输入框了', r.rows(), []);
  chk('标题还原系统原文', r.titleText(), ORIGINAL_TITLE);
  chk('有空列表提示', collect(r.renderH()).some(n => textOf(n) === r.t('headline.empty')), true);
  r.reset();
  chk('恢复默认 → 列表回到 null', r.stored().headlines, null);
  chk('恢复默认 → 又显示默认那一行', r.rows(), [DEFAULT_HEADLINE]);
  chk('恢复默认 → 标题回到插件默认', r.titleText(), DEFAULT_HEADLINE); }

console.log('【8】选取方式可切换，并即时落盘');
{ const r = run({ headlines: ['A', 'B'] });
  chk('默认是随机', r.stored().headlineMode, 'random');
  chk('随机按钮为按下态', r.modePressed('random'), true);
  r.setMode('sequence');
  chk('切到顺序已落盘', r.stored().headlineMode, 'sequence');
  chk('顺序按钮为按下态', r.modePressed('sequence'), true);
  r.newSession(); r.newSession();
  chk('切换后按顺序抽', [r.stored().headlineCursor >= 0, r.titleText()], [true, 'B']); }

console.log('【9】删掉当前正在显示的那条 → 自动换成仍有效的条目');
{ const r = run({ headlines: ['A', 'B', 'C'], headlineMode: 'sequence' });
  chk('先显示 A', r.titleText(), 'A');
  r.removeAt(0);                      // 删掉 A
  chk('列表剩 B、C', r.stored().headlines, ['B', 'C']);
  chk('换成了候选里的一条', ['B', 'C'].includes(r.titleText()), true);
  chk('不会回到被删掉的 A', r.titleText() !== 'A', true); }

console.log('【10】只是编辑别的条目，不动当前已显示的标题');
{ const r = run({ headlines: ['A', 'B'], headlineMode: 'sequence' });
  chk('先显示 A', r.titleText(), 'A');
  r.typeAt(1, 'B2');
  chk('当前仍是 A', r.titleText(), 'A');
  chk('B2 已落盘', r.stored().headlines, ['A', 'B2']); }

console.log('【11】上限 10 条：到顶后「添加一条」禁用');
{ const r = run({ headlines: ['x', 'y', 'z', '1', '2', '3', '4', '5', '6', '7'] });
  chk('10 个输入框', r.rows().length, 10);
  chk('添加按钮已禁用', r.buttonByText(r.t('headline.add')).p.disabled, true);
  r.removeAt(0);
  chk('删一条后又能加', r.buttonByText(r.t('headline.add')).p.disabled, false); }

console.log('【11b】锁定模式：滑杆禁用，状态落盘');
{ const r = run({ headlines: ['A'] });
  const sliders = () => collect(r.renderH()).filter(n => n.t === 'input' && n.p.type === 'range')
    .filter(n => /^(title|en):/.test(String(n.p['aria-label'] || '')));
  chk('默认未锁定：滑杆可拖', sliders().length > 0 && sliders().every(s => s.p.disabled !== true), true);
  r.clickLock();
  chk('锁定后滑杆全部 disabled', sliders().every(s => s.p.disabled === true), true);
  chk('锁定状态已落盘', r.stored().styleLocked, true);
  chk('锁定按钮显示已按下', r.buttonByText(r.t('headlineLock.label') + ' ✓').p['aria-pressed'], true);
  r.clickLock();
  chk('解锁后又能拖', sliders().every(s => s.p.disabled !== true), true);
  chk('解锁状态已落盘', r.stored().styleLocked, false);
}

console.log('【12】超过上限 / 非法值的历史配置被夹住');
{ const r = run({ headlines: Array.from({ length: 20 }, (_, i) => 'T' + i) });
  chk('最多保留 10 条', r.rows().length, 10);
  chk('保留的是前 10 条', r.rows()[9], 'T9'); }
{ const r = run({ headlines: ['A', 123, null, 'B'] });
  chk('非字符串条目被丢掉', r.rows(), ['A', 'B']); }

console.log('【13】前端把标题格渲成空的时候，也能接管');
{ const r = run({ headlines: ['A', 'B'], headlineMode: 'sequence' }, { emptyTitle: true });
  chk('空标题格被写上第 1 条', r.titleText(), 'A');
  chk('记下原文为空串', r.orig(), '');
  chk('已标记归属', r.applied(), 'A');
  r.newSession(true);
  chk('下一个新会话轮到 B', r.titleText(), 'B');
  r.fire(); r.fire();
  chk('反复补丁不重抽', r.titleText(), 'B'); }
{ const r = run({ headlines: [] }, { emptyTitle: true });
  chk('空列表 + 空标题格 = 保持空', r.titleText(), '');
  chk('没有 applied 标记', r.applied(), null); }

console.log('【14】页面内部重建节点不重抽（否则标题会自己几秒变一次）');
{ const r = run({ headlines: ['A', 'B', 'C'], headlineMode: 'sequence' });
  chk('开始时抽出 A', r.titleText(), 'A');
  r.remountTitle(true);                      // 标题格被重建（空的）
  chk('重建后仍是 A', r.titleText(), 'A');
  r.remountTitle(true); r.fire(); r.fire();
  chk('反复重建仍是 A', r.titleText(), 'A');
  r.tick(5000);
  chk('干等也不会变', r.titleText(), 'A');
  chk('轮换游标没被吃掉', r.stored().headlineCursor, 1);
  r.newSession();                            // 真的离开再进来
  chk('新会话才轮到 B', r.titleText(), 'B'); }
{ let calls = 0;
  const r = run({ headlines: ['A', 'B', 'C'] }, { random: () => { calls++; return 0; } });
  const after = calls;
  r.remountTitle(true); r.tick(4000); r.remountTitle(true); r.fire();
  chk('随机模式下页面内重建不重新抽签', calls, after);
  chk('标题保持 A', r.titleText(), 'A');
  r.newSession();
  chk('新会话才重抽', calls > after, true); }
{ const r = run({ headlines: ['A', 'B'] });
  const before = r.titleText();
  r.newSession('', 200);                     // 200ms 的抖动不算新会话
  chk('抖动式消失不算新会话', r.titleText(), before); }

console.log('【15】不认识的非空文案，仍然不动它');
{ const r = run({ headlines: ['A', 'B'] });
  r.titleNode().textContent = '前端换代后的新标题';
  r.fire();
  chk('新文案未被覆盖', r.titleText(), '前端换代后的新标题');
  chk('没有 applied 标记', r.applied(), null); }

console.log('【17】权限名称：改一处，两个命名空间都跟着变');
{ const r = run({ permissions: { readOnly: '只读' } });
  chk('composer 选择器（zh）', r.dict('conversation', 'zh')['access.preset.readOnly'], '只读');
  chk('composer 选择器（en）', r.dict('conversation', 'en')['access.preset.readOnly'], '只读');
  chk('设置页那一行（zh）', r.dict('settings.permission', 'zh')['preset.readOnly'], '只读');
  chk('设置页那一行（en）', r.dict('settings.permission', 'en')['preset.readOnly'], '只读');
  chk('其它两项不动', r.dict('conversation', 'zh')['access.preset.workspaceWrite'], '工作区内修改'); }

console.log('【18】改「完全权限」→ 确认弹窗里带该名字的文案一起换');
{ const r = run({ permissions: { fullAccess: '完全放开' } });
  chk('弹窗标题', r.dict('conversation', 'zh')['access.confirm.title'], '确认启用完全放开？');
  chk('弹窗说明', r.dict('conversation', 'zh')['access.confirm.description'], '启用完全放开后，智能体将减少确认步骤，并且可以直接执行更多操作。');
  chk('弹窗按钮', r.dict('conversation', 'zh')['access.confirm.enable'], '启用完全放开');
  chk('英文弹窗同步替换', r.dict('conversation', 'en')['access.confirm.title'], 'Enable 完全放开?');
  chk('设置页弹窗标题', r.dict('settings.permission', 'zh')['confirm.title'], '确认启用完全放开？');
  chk('预设名本身', r.dict('settings.permission', 'zh')['preset.fullAccess'], '完全放开'); }

console.log('【19】留空 / 恢复默认 → 回到系统原文');
{ const r = run({ permissions: { readOnly: '只读', fullAccess: '完全放开' } });
  chk('先改上', r.dict('conversation', 'zh')['access.preset.readOnly'], '只读');
  r.typePerm(0, '');
  chk('清空后回到原文', r.dict('conversation', 'zh')['access.preset.readOnly'], '仅可查看');
  chk('另一项不受影响', r.dict('conversation', 'zh')['access.preset.fullAccess'], '完全放开');
  chk('弹窗仍是改后的', r.dict('conversation', 'zh')['access.confirm.title'], '确认启用完全放开？');
  r.resetPerm();
  chk('恢复默认 → 预设名回原文', r.dict('settings.permission', 'zh')['preset.fullAccess'], '完全权限');
  chk('恢复默认 → 弹窗也回原文', r.dict('conversation', 'zh')['access.confirm.title'], '确认启用完全权限？');
  chk('落盘也是空的', r.stored().permissions, { readOnly: '', workspaceWrite: '', fullAccess: '' }); }

console.log('【20】没设置时，字典一个字节都不动');
{ const r = run({});
  const conv = r.dict('conversation', 'zh');
  const perm = r.dict('settings.permission', 'zh');
  chk('只读', conv['access.preset.readOnly'], '仅可查看');
  chk('工作区', conv['access.preset.workspaceWrite'], '工作区内修改');
  chk('完全', conv['access.preset.fullAccess'], '完全权限');
  chk('弹窗', conv['access.confirm.title'], '确认启用完全权限？');
  chk('设置页只读', perm['preset.readOnly'], '仅可查看');
  chk('设置页弹窗', perm['confirm.title'], '确认启用完全权限？'); }

console.log('【21】设置行：三个输入框，灰字提示就是系统原文');
{ const r = run({});
  chk('输入框数量', r.permRows().length, 3);
  chk('初始为空 = 用原文', r.permRows(), ['', '', '']);
  chk('灰字提示 = 系统原文', r.permHints(), ['仅可查看', '工作区内修改', '完全权限']);
  r.typePerm(2, '完全放开');
  chk('已落盘', r.stored().permissions.fullAccess, '完全放开');
  chk('字典已改', r.dict('settings.permission', 'zh')['preset.fullAccess'], '完全放开'); }

console.log('【22】字典比插件注册得晚，也能补上');
{ const r = run({ permissions: { readOnly: '只读' } }, { latePermissionDicts: true });
  chk('一开始还没有字典', r.dict('conversation', 'zh'), undefined);
  r.attachPermissionDicts();
  chk('字典出现后立刻生效', r.dict('conversation', 'zh')['access.preset.readOnly'], '只读');
  chk('设置页也生效', r.dict('settings.permission', 'zh')['preset.readOnly'], '只读'); }

console.log('【23】英文副标题：与中文按序号配对');
{ const r = run({ headlines: ['嗨，想我了吗？', '今天想做什么？'], headlineEns: ['Hey, missed me?', 'What shall we do today?'], headlineMode: 'sequence' });
  chk('中文在上面', r.titleText(), '嗨，想我了吗？');
  chk('第 1 条配第 1 句英文', r.enText(), 'Hey, missed me?');
  chk('英文挂在标题组里', r.enNode() !== null, true);
  chk('标题组被标记', r.titleGroup().className.indexOf('dsha-headline-group') !== -1, true);
  chk('标题组成为定位锚点', r.titleGroup().style.position, 'relative');
  chk('英文行悬浮（脱离文档流）', r.enNode().style.position, 'absolute');
  chk('贴在中文下方', r.enNode().style.top, '100%');
  r.newSession();
  chk('换到第 2 条中文', r.titleText(), '今天想做什么？');
  chk('英文跟着配对换', r.enText(), 'What shall we do today?'); }

console.log('【24】英文留空 → 不留空行；清空 → 连组上的标记一起摘掉');
{ const r = run({ headlines: ['中文一'], headlineEns: [''] });
  chk('没有英文节点', r.enNode(), null);
  chk('组没被标记为纵向', r.titleGroup().className.indexOf('dsha-headline-group'), -1);
  r.typeEn(0, 'English one');
  chk('填上就出现', r.enText(), 'English one');
  chk('组也标记了', r.titleGroup().className.indexOf('dsha-headline-group') !== -1, true);
  r.typeEn(0, '');
  chk('清空就摘掉节点', r.enNode(), null);
  chk('标记也撤了', r.titleGroup().className.indexOf('dsha-headline-group'), -1);
  chk('锚点也清掉', r.titleGroup().style.position, ''); }

console.log('【25】字号 / 上间距 / 水平：滑杆一动立刻写进节点样式');
{ const r = run({ headlines: ['中文一'], headlineEns: ['English'] });
  chk('默认字号 14px', r.enNode().style.fontSize, '14px');
  chk('三根滑杆', r.sliders().length, 3);
  r.setSlider('size', 22);
  chk('字号跟着变', r.enNode().style.fontSize, '22px');
  r.setSlider('gap', -6);
  chk('上下偏移支持负值', r.enNode().style.transform, 'translate(-50%, -6px)');
  r.setSlider('offsetX', 40);
  chk('左右偏移叠加', r.enNode().style.transform, 'translate(calc(-50% + 40px), -6px)');
  r.setSlider('offsetX', 0);
  chk('左右归零后回到纯居中', r.enNode().style.transform, 'translate(-50%, -6px)');
  chk('已落盘', r.stored().headlineEnStyle, { size: 22, gap: -6, offsetX: 0 });
  r.setSlider('size', 999);
  chk('越界值渲染时被夹到 48px', r.enNode().style.fontSize, '48px'); }

console.log('【26】英文行绝不会被当成「标题格」');
{ const r = run({ headlines: ['中文标题'], headlineEns: ['English here'] }, { emptyTitle: true });
  chk('中文进了标题格', r.titleText(), '中文标题');
  chk('英文进了英文行', r.enText(), 'English here');
  r.fire(); r.fire(); r.fire();
  chk('反复补丁也不串行', [r.titleText(), r.enText()], ['中文标题', 'English here']);
  r.remountTitle(true);
  chk('标题格被重建后仍是中文在标题格', r.titleText(), '中文标题'); }

console.log('【27】加一条 / 删一条 / 恢复默认：英文跟着对齐');
{ const r = run({ headlines: ['甲'], headlineEns: ['A'] });
  chk('中英两列一样长', r.enInputs().length, r.zhInputs().length);
  chk('各 1 个输入框', [r.zhInputs().length, r.enInputs().length], [1, 1]);
  r.add();
  chk('加一条后两列都变 2', [r.zhInputs().length, r.enInputs().length], [2, 2]);
  r.typeAt(1, '乙'); r.typeEn(1, 'B');
  chk('落盘对齐', [r.stored().headlines, r.stored().headlineEns], [['甲', '乙'], ['A', 'B']]);
  r.removeAt(0);
  chk('删掉第 1 条后英文也删对', [r.stored().headlines, r.stored().headlineEns], [['乙'], ['B']]);
  chk('显示的英文仍是 B', r.enText(), 'B');
  r.reset();
  chk('恢复默认清空英文', [r.stored().headlines, r.stored().headlineEns], [null, []]);
  chk('节点也没了', r.enNode(), null);
  chk('样式回到默认值', r.stored().headlineEnStyle, { size: 14, gap: 6, offsetX: 0 }); }

console.log('【28】调整时才半透明：按下/聚焦 → 变透明，松手/失焦 → 还原');
{ const r = run({});
  chk('默认功能开着', r.stored().panelDim, true);
  chk('没交互时面板照旧', r.panel().style.opacity, '');
  r.pressSlider('size');
  chk('按下滑杆 → 半透明 50%', r.panel().style.opacity, '0.5');
  r.releasePointer();
  chk('松手 → 还原', r.panel().style.opacity, '');
  r.focusEn(0);
  chk('聚焦英文框 → 半透明', r.panel().style.opacity, '0.5');
  r.blurEn(0);
  chk('失焦 → 还原', r.panel().style.opacity, '');
  r.setSlider('size', 20);
  chk('单纯改值不触发半透明', r.panel().style.opacity, ''); }
{ const r = run({ panelDimAlpha: 0.8 });
  r.pressSlider('offsetX');
  chk('不透明度可调', r.panel().style.opacity, '0.8');
  r.releasePointer();
  chk('松手还原', r.panel().style.opacity, ''); }
{ const r = run({ panelDim: false });
  r.pressSlider('size');
  chk('关掉功能后按下也不变', r.panel().style.opacity, ''); }
{ const r = run({ panelDim: true, panelDimAlpha: 5 });
  r.pressSlider('size');
  chk('越界的不透明度被夹住', r.panel().style.opacity, '0.9');
  r.releasePointer(); }

console.log('【29】中文标题的大小与位置');
{ const r = run({ headlines: ['中文标题'] });
  chk('默认不干预字号', r.titleNode().style.fontSize, '');
  chk('默认不干预位置', r.titleNode().style.transform, '');
  chk('三根滑杆', r.titleSliders().length, 3);
  chk('字号没设过时显示系统值', r.titleSliderValues()[0], 26);
  r.setTitleSlider('size', 34);
  chk('字号写进节点', r.titleNode().style.fontSize, '34px');
  chk('行高按同比例给（避免被固定行高压扁）', r.titleNode().style.lineHeight, '1.2308');
  chk('落盘', r.stored().headlineStyle.size, 34);
  r.setTitleSlider('gap', -8);
  r.setTitleSlider('offsetX', 12);
  chk('位置走 transform（不挤动布局）', r.titleNode().style.transform, 'translate(12px, -8px)');
  chk('文字没被影响', r.titleText(), '中文标题'); }
{ const r = run({ headlineStyle: { size: 0, gap: 5, offsetX: 0 } });
  chk('只挪位置时仍不写字号', r.titleNode().style.fontSize, '');
  chk('位置生效', r.titleNode().style.transform, 'translate(0px, 5px)'); }
{ const r = run({ headlines: ['中文标题'] });
  r.setTitleSlider('size', 30);
  r.setTitleSlider('gap', 10);
  r.clickResetStyle();
  chk('复位后字号回默认', r.titleNode().style.fontSize, '');
  chk('行高也清掉', r.titleNode().style.lineHeight, '');
  chk('复位后位置回默认', r.titleNode().style.transform, '');
  chk('落盘也复位', r.stored().headlineStyle, { size: 0, gap: 0, offsetX: 0 }); }
{ const r = run({ headlineStyle: { size: 999, gap: 0, offsetX: 0 } });
  chk('越界字号被夹住', r.titleNode().style.fontSize, '48px'); }
{ const r = run({ headlines: [], headlineStyle: { size: 30, gap: 0, offsetX: 0 } });
  chk('系统原文也套上样式', r.titleNode().style.fontSize, '30px');
  chk('系统原文本身没被改字', r.titleText(), '探索未至之境'); }

console.log('【30】侧栏标签的英文后缀');
{ const r = run({});
  chk('设置 → 设置 Settings', r.sidebarSettings().textContent, '设置 Settings');
  chk('美化 → 🎨 美化 Beautify', r.sidebarBeautify().textContent, '🎨 美化 Beautify');
  r.fire(); r.fire();
  chk('反复补丁不重复叠加', r.sidebarSettings().textContent, '设置 Settings');
  chk('美化也不重复', r.sidebarBeautify().textContent, '🎨 美化 Beautify'); }
{ const r = run({});
  r.typeSidebar(0, 'Preferences');
  chk('改设置标签跟着变', r.sidebarSettings().textContent, '设置 Preferences');
  r.typeSidebar(1, 'Theme');
  chk('改美化也跟着变', r.sidebarBeautify().textContent, '🎨 美化 Theme');
  chk('落盘', r.stored().sidebarLabels, { settings: 'Preferences', beautify: 'Theme' }); }
{ const r = run({ sidebarLabels: { settings: '', beautify: '' } });
  chk('留空 → 只显示原文', r.sidebarSettings().textContent, '设置');
  chk('美化同理', r.sidebarBeautify().textContent, '🎨 美化'); }
{ const r = run({});
  r.rerenderBeautify('✕ 美化');
  chk('React 换成 ✕ 版后重新接管', r.sidebarBeautify().textContent, '✕ 美化 Beautify');
  r.rerenderBeautify('🎨 美化');
  chk('换回 🎨 版也接管', r.sidebarBeautify().textContent, '🎨 美化 Beautify'); }
{ const r = run({});
  r.sidebarSettings().textContent = 'Settings';
  r.fire();
  chk('认不出的文案不碰', r.sidebarSettings().textContent, 'Settings'); }
{ const r = run({ sidebarLabels: { settings: 'X' } });
  chk('美化走默认 Beautify', r.sidebarBeautify().textContent, '🎨 美化 Beautify');
  r.clickResetSidebar();
  chk('恢复默认', r.stored().sidebarLabels, { settings: 'Settings', beautify: 'Beautify' }); }
{ const r = run({});
  chk('两个输入框', r.sidebarInputs().length, 2); }

console.log('【31】底部状态行单位的英文');
{ const r = run({});
  chk('轮 / 步 各自接英文', r.statsText().data, '3 轮 Rounds 5 步 Steps');
  chk('缓存命中 接英文', r.cacheText().data, '缓存命中 Cache hit 45%');
  chk('分隔点那个 span 没被动', r.usageLabel().childNodes.length, 3);
  r.fire(); r.fire();
  chk('反复补丁不重复叠加', r.statsText().data, '3 轮 Rounds 5 步 Steps');
  chk('缓存命中也不重复', r.cacheText().data, '缓存命中 Cache hit 45%'); }
{ const r = run({});
  r.setStatsData('7 轮 9 步');
  chk('React 改数字后重新补上英文', r.statsText().data, '7 轮 Rounds 9 步 Steps'); }
{ const r = run({ statsLabels: { turns: 'rounds', steps: '', cache: '' } });
  chk('自定义英文', r.statsText().data, '3 轮 rounds 5 步');
  chk('留空的就不加', r.cacheText().data, '缓存命中 45%'); }
{ const r = run({});
  chk('三个输入框', r.statsInputs().length, 3);
  r.typeStats(2, 'HIT');
  chk('改缓存命中跟着变', r.cacheText().data, '缓存命中 HIT 45%');
  chk('落盘', r.stored().statsLabels.cache, 'HIT'); }
{ const r = run({});
  const before = r.usageLabel().childNodes[1].childNodes[0].data;
  r.fire();
  chk('别的文本节点不受影响', r.usageLabel().childNodes[1].childNodes[0].data, before); }

console.log('【32】Hero 里的模式滑块（纯文本对话模式 / 昔涟工作模式；工作模式已隐藏）');
{ const r = run({});
  const sw = r.modeSwitch();
  chk('滑块插进了 Hero', !!sw, true);
  chk('只渲染两个可见档位（工作模式被隐藏）', r.modeOptions().map(b => b.getAttribute('data-dsha-mode')).join(','), 'chat,cyrene-work');
  chk('第 1 档：中文 + 换行英文 + 注释', r.modeLabels()[0], '纯文本对话模式|Plain chat|与昔涟对话');
  chk('第 2 档：中文 + 换行英文 + 注释', r.modeLabels()[1], '昔涟工作模式|Cyrene work|昔涟人设 + 全套工具');
  /* 这个用例的会话预设是 standard —— 一个被隐藏的档位。
     此时不该有任何标签是选中态，滑块落成 __none 停在轨道原位，
     既不能冒充第 1 档，也不能乱跳。 */
  chk('隐藏档当选时没有标签被选中', r.activeMode(), null);
  chk('隐藏档当选时 data-mode 落成 __none', sw.getAttribute('data-mode'), '__none');
  chk('隐藏档当选时两个注释都隐藏', r.modeOptions().map(b => b.querySelector('.note').style.display).join(','), 'none,none');
  chk('位置在标题块正下方', sw.previousSibling === r.heroHeadline(), true);
  chk('轨道也在', !!sw.querySelector('.dsha-mode-track'), true); }
{ const r = run({});
  r.clickMode('chat');
  await Promise.resolve(); await Promise.resolve();
  chk('点第 1 档 → 切到 chat 预设', r.selectCalls().map(x => x.join(':')).join(','), 'session-blank:chat');
  chk('滑块指向第 1 档', r.activeMode(), 'chat');
  chk('滑块位置写在第 1 档', r.modeSwitch().getAttribute('data-mode'), 'chat');
  chk('切档后新档注释可见', r.modeOptions()[0].querySelector('.note').style.display, '');
  chk('另一档注释隐藏', r.modeOptions()[1].querySelector('.note').style.display, 'none'); }
{ const r = run({});
  /* 第二档必须点得到 —— 从二态改多态最容易漏的地方：
     旧的点轨道逻辑写死 `chat ? standard : chat`，会在头两档之间打转。 */
  r.clickMode('cyrene-work');
  await Promise.resolve(); await Promise.resolve();
  chk('点第 2 档 → 切到 cyrene-work 预设', r.selectCalls().map(x => x.join(':')).join(','), 'session-blank:cyrene-work');
  chk('滑块指向第 2 档', r.activeMode(), 'cyrene-work');
  chk('第 2 档注释可见', r.modeOptions()[1].querySelector('.note').style.display, ''); }
{ const r = run({});
  /* 点轨道 = 在可见档位里逐档前进并循环。
     起始态是隐藏的 standard（modeIndex = -1），
     所以 (at + 1) % 2 = 0 → 先落到第 1 档 chat。 */
  r.clickTrack();
  await Promise.resolve(); await Promise.resolve();
  chk('从隐藏档出发 → 落到第 1 档（chat）', r.selectCalls().map(x => x[1]).join(','), 'chat');
  r.clickTrack();
  await Promise.resolve(); await Promise.resolve();
  chk('再点前进一档（→ cyrene-work）', r.selectCalls().map(x => x[1]).join(','), 'chat,cyrene-work');
  r.clickTrack();
  await Promise.resolve(); await Promise.resolve();
  chk('到底回到第 1 档（→ chat）', r.selectCalls().map(x => x[1]).join(','), 'chat,cyrene-work,chat'); }
{ const r = run({});
  r.setSession({ blank: false });          // 已经发过消息 = 锁定
  r.clickMode('chat');
  await Promise.resolve();
  chk('非空白会话不切预设', r.selectCalls().length, 0); }
{ const r = run({});
  r.unmountHero();
  chk('离开 Hero 后滑块被摘掉', r.modeSwitch(), null); }

console.log('【33】设置里的「聊天模式称呼」（提示词变量 {{user_nickname}}）');
{ const r = run({});
  chk('设置行已注册', r.registeredRows().includes('brand-nickname'), true);
  chk('行里有一个文本输入框', r.nicknameInputs().length, 1);
  const input = r.nicknameInputs()[0];
  chk('maxLength 与主机上限一致', input.p.maxLength, 24);
  chk('占位符用的是默认称呼', input.p.placeholder, r.t('nickname.placeholder'));
  chk('无障碍标签', input.p['aria-label'], r.t('nickname.aria')); }
{ const r = run({});
  r.blurNickname('伙伴');
  const call = r.fetchCalls()[0];
  chk('失焦 → 打主机接口', call.url, '/dsh-brand-rename-api');
  chk('POST + JSON', [call.init.method, call.init.headers['content-type']].join('|'), 'POST|application/json');
  chk('请求体只带昵称', JSON.parse(call.init.body).nickname, '伙伴'); }
{ const r = run({});
  r.keyNickname('旅人', 'Enter');
  chk('回车同样保存', JSON.parse(r.fetchCalls()[0].init.body).nickname, '旅人'); }
{ const r = run({});
  r.keyNickname('旅人', 'a');
  chk('普通按键不打接口', r.fetchCalls().length, 0); }
{ const r = run({});
  const zh = r.localeKeys().zh, en = r.localeKeys().en;
  chk('中文字典有这一行', ['nickname.title', 'nickname.description', 'nickname.hint', 'nickname.offline', 'nickname.pending'].every(k => zh.includes(k)), true);
  chk('英文字典有这一行', ['nickname.title', 'nickname.description', 'nickname.hint', 'nickname.offline', 'nickname.pending'].every(k => en.includes(k)), true);
  chk('离线提示说的是重启', r.localeText('zh', 'nickname.offline').includes('重启'), true);
  chk('预设还没用上变量时会给提醒', r.localeText('zh', 'nickname.pending').includes('{{user_nickname}}'), true);
  const hint = collect(r.renderNickname()).find(n => n.p && n.p['data-dsha-nickname-preset-ok'] !== undefined);
  chk('提示行带了「预设是否用上变量」的标记', hint.p['data-dsha-nickname-preset-ok'], 'yes'); }

console.log('【16】预览版徽标始终保持隐藏');
{ const r = run({ headlines: ['A', 'B'] }); r.newSession();
  chk('徽标被隐藏', r.badge.style.display, 'none'); }

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
