/**
 * dsha-brand-rename 的浏览器半边。
 *
 * 五件事：
 *   A. 侧栏品牌区：删除鲸鱼图标，把 deepseek 字样换成 Demiurge（保留 HARNESS 徽标）
 *   B. 新会话 Hero 区：标题文字**可保留多条**（默认「嗨，想我了吗？」），
 *      每次打开新会话随机抽一条或按顺序轮换，并删除「预览版」徽标
 *   C. 输入框提示文案：**所有会话状态**的灰色提示都可自定义，且**逐条分开设置**
 *   D. 设置行：B、C 的输入面板，挂在「设置 → 通用」
 *
 * ══ A. 侧栏品牌区 ══════════════════════════════════════════════════
 * 品牌区由两个 single 槽位渲染（声明方 dsh-client-ui-sidebar）：
 *   sidebar.brand.mark → 官方 FishLogo（鲸鱼）
 *   sidebar.brand.name → 官方 BrandWordmark（一个 SVG，同时画了「deepseek」
 *                        字母和右侧 HARNESS 徽标）
 *
 * 槽位注册带 priority，且 single 槽位「同优先级重复注册会抛错、换优先级即可
 * 遮蔽，最低优先级渲染」。官方用默认 0，所以这里用 -1 接管，不会报错。
 *
 * 关键：deepseek 字样是**矢量路径不是文字**（BrandWordmark 里 9 条 path），
 * 而 HARNESS 徽标在同一个 SVG 里（一条 rect + 一个 <g>）。为了不动徽标，
 * 这里**保留官方 BrandWordmark 原样渲染**，只用 CSS 隐掉那 9 条字母 path：
 * 字母是该 svg 的**直接子节点**，而鲸鱼和徽标都包在 <g> 里 —— 所以
 * `.dsha-brand-wordmark > path` 精确命中字母，徽标逐像素不变。
 *
 * 关于「字体保持不变」：原字样是绘制出来的 logo 矢量，本身没有字体，
 * 因此无法复用同一「字体」。这里用 font-family: inherit 跟随页面 UI 字体，
 * 并按实测尺寸对齐（原字母 ink 高约 17 CSS px、宽约 95 px，SVG 按 size=24
 * 即 156×24 1:1 渲染），做到字号、字重、颜色、位置与原排版一致。
 *
 * ══ B. Hero 标题 ═══════════════════════════════════════════════════
 *   <span class="<hash>_titleGroup">
 *     <span>探索未至之境</span>                       ← 纯文本，无插槽
 *     <span class="<hash>_previewBadge">预览版</span>  ← 纯文本，无插槽
 *   </span>
 * 没有可用的槽位，也不能靠覆盖 locale（locale.register 对同 namespace + 同语言
 * 会直接抛错），所以只能改 DOM。
 *
 * ══ C. 输入框提示文案 ══════════════════════════════════════════════
 * 组合框（InputBar）里，灰色提示是这样一个普通节点：
 *   <div class="<hash>_placeholder" data-composer-placeholder="true">文案</div>
 * 旁边的 contenteditable 上另有 data-placeholder / aria-label 两个属性同步。
 *
 * data-composer-placeholder 是**稳定的 data 属性**（不是 hash 类名），选择器可靠。
 * conversation.composer.bar 虽然是槽位，但它是 single 且文本面是 Lexical 编辑器
 * —— 接管它等于重写整个输入框，所以这里同样只改 DOM。
 *
 * 输入框的提示按状态分很多条（官方 InputBar 的逻辑）：
 *   parentOffline > disabled(unavailable) > canSteerQueue > planActive > default
 *   另加 hero（新会话）与 workspace（未选工作区）两种由上层传入的。
 * 本插件**逐条分开**支持这 7 种，配置为空的那条就保持系统默认。
 * 识别方式是拿节点当前文本去比对各自的系统默认原文（归一化后比较），
 * 所以只会命中真正认识的那几种；像 composerBlock.reason 这类动态原因不会被误改。
 */
window.__ModuleLoader__.load({
  id: 'dsha-brand-rename',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require('react');

    /**
     * react 是静态模块，直接可用。
     * primitives 提供官方 BrandWordmark（含 HARNESS 徽标）—— 取不到时优雅降级
     * 成「只有文字、没有徽标」，绝不因为一个 require 失败就整个插件不生效。
     */
    var primitives = null;
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    } catch (err) {
      console.warn('[dsha-brand-rename] primitives 不可用，徽标将缺失：', err && err.message);
    }

    /** 本插件自己的 locale 命名空间（不能借用 conversation，同 ns+同语言会抛错）。 */
    var NS = 'dsha-brand-rename';

    //#region 设置状态：localStorage + 订阅

    var STORAGE_KEY = 'dsh-brand-rename:view';
    /** 旧包名留下的缓存：只读一次做迁移，之后都写新键。 */
    var LEGACY_STORAGE_KEY = 'dsha-brand-rename:view';

    /**
     * 输入框提示的 7 种状态。zh/en 是**官方原文**，一张表同时充当两件事：
     *   1. 运行时识别「这个节点现在是哪种状态」的比对基准；
     *   2. 设置面板里对应输入框的灰字提示（让人看得到默认长什么样）。
     */
    var PLACEHOLDER_DEFS = [
      { key: 'hero', zh: '描述你想要构建的内容, / 调用指令, @ 文件或对话', en: 'Describe what you want to build, / commands, @ files or sessions' },
      { key: 'default', zh: '发消息或创建任务, / 调用指令, @ 文件或对话', en: 'Message or run a task, / commands, @ files or sessions' },
      { key: 'plan', zh: '描述你的任务以生成计划', en: 'describe your task to generate plan' },
      { key: 'steerQueue', zh: 'Cmd/Ctrl+Enter 插话发送全部排队消息', en: 'Cmd/Ctrl+Enter steers all queued messages' },
      { key: 'workspace', zh: '选择一个工作区开始', en: 'Choose a workspace to start' },
      { key: 'unavailable', zh: '会话不可用', en: 'Session unavailable' },
      { key: 'parentOffline', zh: '父会话已离线，无法继续发送；仍可停止当前运行', en: 'Parent session offline; sending is unavailable but you can still stop the run' }
    ];

    /** 提示文案长度上限。 */
    var PLACEHOLDER_MAX = 120;

    /**
     * 哪些输入框状态**额外**提供「按模式」的文案。
     *
     * 只挑会在这两个模式里真正露脸的状态，否则设置面板的输入框会翻倍：
     *   hero    —— 空白会话（模式滑块就出现在这里，所以最需要区分）
     *   default —— 已有内容的一般会话
     * 其余状态（plan / steerQueue / workspace / unavailable / parentOffline）
     * 是瞬时或异常态，不值得按模式分。
     */
    var MODE_PLACEHOLDER_KEYS = ['hero', 'default'];

    /**
     * 按模式覆盖时用到的模式 id。
     * ⚠️ 必须与后面 region C4 的 MODE_DEFS 保持一致 —— 这里不能直接引用它，
     *    因为 readState() 在初始化时就跑，那时 MODE_DEFS 还没赋值。
     *    一致性由测试守着（tests/headline-multi.test.mjs 里的模式 id 断言）。
     */
    var MODE_PLACEHOLDER_MODE_IDS = ['standard', 'chat', 'cyrene-work'];
    /** 新会话标题**单条**长度上限。 */
    var HEADLINE_MAX = 60;
    /** 新会话标题最多保留多少条。 */
    var HEADLINE_MAX_COUNT = 10;
    /** 新会话标题的插件默认值（没设过时用它，保持既有观感）。 */
    var DEFAULT_HEADLINE = '嗨，想我了吗？';
    /**
     * 两种选取方式：
     *   random   —— 每次新会话随机抽一条（列表 >1 时避免与上一次重复）；
     *   sequence —— 按列表顺序轮换，到底回第一条。
     * 非随机的默认含义就是「顺序轮换」，这样多条标题才有意义。
     */
    var HEADLINE_MODES = ['random', 'sequence'];

    /** 英文副标题的长度上限。 */
    var HEADLINE_EN_MAX = 80;
    /** 英文行自己带的类名（也用来把它从「标题格」的识别循环里排除掉）。 */
    var HEADLINE_EN_CLASS = 'dsha-headline-en';
    /** 挂了英文行的标题组加这个类，用来把组改成纵向排列。 */
    var HEADLINE_EN_GROUP_CLASS = 'dsha-headline-group';
    /** 英文行的默认样式与三个滑杆的可调范围。 */
    var EN_STYLE_DEFAULTS = { size: 14, gap: 6, offsetX: 0 };
    /** 中文标题的大小 / 位置：0 = 不干预，用系统默认。 */
    var TITLE_STYLE_DEFAULTS = { size: 0, gap: 0, offsetX: 0 };
    /** 读不到系统字号时的兜底（与前端 `.pXSMma_headline` 的 26px 一致）。 */
    var TITLE_SIZE_FALLBACK = 26;
    /** 第一次补丁时从 DOM 读到的系统字号（缓存；0 = 还没读到）。 */
    var SYSTEM_TITLE_SIZE = 0;

    /**
     * 侧栏两个标签，以及它们的**原文**（用来认领节点）。
     * 「设置」是 SettingsRoot 的 trigger 文案；「美化」是 dsh-ui-boost 自己写的按钮文案。
     */
    var SIDEBAR_LABEL_DEFS = [
      {
        key: 'settings',
        base: '设置',
        selectors: ['[class*="settingsArea"] [class*="triggerLabel"]', '[class*="triggerLabel"]']
      },
      { key: 'beautify', base: '美化', selectors: ['[class*="dshub-footbtn"]'] }
    ];
    /** 侧栏标签的英文默认值（用户可改；留空 = 只显示原文）。 */
    var SIDEBAR_LABEL_DEFAULTS = { settings: 'Settings', beautify: 'Beautify' };
    var SIDEBAR_LABEL_MAX = 24;
    var SIDEBAR_MARK_BASE = 'data-dsha-sidebar-base';
    var SIDEBAR_MARK_APPLIED = 'data-dsha-sidebar-applied';

    /**
     * 底部状态行里的三个中文单位，以及它们的英文默认值（用户可改；留空 = 不加）。
     * token 是要接英文的那个中文词，原文长什么样见 chat 命名空间：
     *   stats.counts  = "{turns} 轮 {steps} 步"
     *   stats.cacheHit = "缓存命中 {percent}%"
     */
    var STATS_LABEL_DEFS = [
      { key: 'turns', token: '轮', zh: '轮' },
      { key: 'steps', token: '步', zh: '步' },
      { key: 'cache', token: '缓存命中', zh: '缓存命中' }
    ];
    var STATS_LABEL_DEFAULTS = { turns: 'Rounds', steps: 'Steps', cache: 'Cache hit' };
    var STATS_LABEL_MAX = 24;

    /** 设置面板「半透明」：不透明度可调范围与默认值。 */
    var PANEL_ALPHA_LIMITS = [0.2, 0.9];
    var PANEL_ALPHA_DEFAULT = 0.5;
    /** 设置行自己的标记类名：用来认出「哪一个 dialog 是设置面板」。 */
    var PANEL_ROW_CLASS = 'dsha-brand-row';
    var EN_STYLE_LIMITS = { size: [8, 48], gap: [-40, 80], offsetX: [-200, 200] };

    /** 权限名称单个最长多少字。 */
    var PERMISSION_MAX = 24;
    /**
     * 用户昵称（聊天模式提示词里的 `{{user_nickname}}`）的读写接口。
     * 落在主机半边 index.js 里 —— 变量插值在主机做，浏览器改不了提示词。
     */
    var NICKNAME_API = '/dsh-brand-rename-api';
    /**
     * 三个可改名的权限预设。key 是我们自己的字段名，其余两处是它们在
     * 两个 locale 命名空间里的文案键。
     */
    var PERMISSION_FIELDS = [
      { key: 'readOnly', zh: '仅可查看', en: 'Read Only', conv: 'access.preset.readOnly', settings: 'preset.readOnly' },
      { key: 'workspaceWrite', zh: '工作区内修改', en: 'Workspace Write', conv: 'access.preset.workspaceWrite', settings: 'preset.workspaceWrite' },
      { key: 'fullAccess', zh: '完全权限', en: 'Full access', conv: 'access.preset.fullAccess', settings: 'preset.fullAccess' }
    ];
    /**
     * 会带上「完全权限」字样的确认弹窗文案：改名时把里面的原预设名一起替换掉，
     * 免得出现「预设叫『完全放开』、弹窗还写『确认启用完全权限』」的割裂。
     */
    var PERMISSION_CONFIRM_KEYS = [
      ['conversation', 'access.confirm.title'],
      ['conversation', 'access.confirm.description'],
      ['conversation', 'access.confirm.enable'],
      ['settings.permission', 'confirm.title'],
      ['settings.permission', 'confirm.description'],
      ['settings.permission', 'confirm.enable'],
      /* 0.2.x 把输入框下面的权限选择器拆到了独立命名空间 permission.access。 */
      ['permission.access', 'confirm.title'],
      ['permission.access', 'confirm.description'],
      ['permission.access', 'confirm.enable']
    ];

    /**
     * 权限预设名在哪些命名空间里各有一套 key：
     *   0.1.x 输入框 → conversation（access.preset.*）
     *   0.1.x 设置页 → settings.permission（preset.*）
     *   0.2.x 输入框 → permission.access（preset.*）
     * 三处都改，界面里看到的才是同一个名字。
     */
    var PERMISSION_NAMESPACES = [
      { ns: 'conversation', keyOf: function (field) { return field.conv; }, full: 'access.preset.fullAccess' },
      { ns: 'settings.permission', keyOf: function (field) { return field.settings; }, full: 'preset.fullAccess' },
      { ns: 'permission.access', keyOf: function (field) { return field.settings; }, full: 'preset.fullAccess' }
    ];

    /** 归一化：忽略空白与逗号（中英全半角），只比较实质内容。 */
    function normalizeText(value) {
      return String(value).replace(/[\s,，]/g, '');
    }

    /** 归一化后的官方原文 → 状态 key。中英都进表，界面语言切换也能认出来。 */
    var DEFAULT_LOOKUP = (function () {
      var table = {};
      for (var i = 0; i < PLACEHOLDER_DEFS.length; i++) {
        var def = PLACEHOLDER_DEFS[i];
        table[normalizeText(def.zh)] = def.key;
        table[normalizeText(def.en)] = def.key;
      }
      return table;
    })();

    /** 所有状态 key 的默认值（空串 = 用系统默认）。 */
    function emptyPlaceholders() {
      var out = {};
      for (var i = 0; i < PLACEHOLDER_DEFS.length; i++) out[PLACEHOLDER_DEFS[i].key] = '';
      return out;
    }

    /**
     * 按模式覆盖的空值表：{ 模式id: { 状态key: '' } }。
     * 空串 = 该模式不单独设，回落到上面的通用文案。
     */
    function emptyModePlaceholders() {
      var out = {};
      for (var m = 0; m < MODE_PLACEHOLDER_MODE_IDS.length; m++) {
        var perMode = {};
        for (var i = 0; i < MODE_PLACEHOLDER_KEYS.length; i++) perMode[MODE_PLACEHOLDER_KEYS[i]] = '';
        out[MODE_PLACEHOLDER_MODE_IDS[m]] = perMode;
      }
      return out;
    }

    /** 归一化一份「按模式」的表（读盘与写入共用，避免两处形状写歪）。 */
    function normalizeModePlaceholders(source) {
      var out = emptyModePlaceholders();
      if (!source || typeof source !== 'object') return out;
      for (var m = 0; m < MODE_PLACEHOLDER_MODE_IDS.length; m++) {
        var id = MODE_PLACEHOLDER_MODE_IDS[m];
        var raw = source[id];
        if (!raw || typeof raw !== 'object') continue;
        for (var i = 0; i < MODE_PLACEHOLDER_KEYS.length; i++) {
          var key = MODE_PLACEHOLDER_KEYS[i];
          if (typeof raw[key] === 'string') out[id][key] = raw[key].slice(0, PLACEHOLDER_MAX);
        }
      }
      return out;
    }

    /**
     * 拼出输入框里那行灰字：**中文一行、英文另起一行**。
     * 两边各自留空就只用另一边。
     */
    function composePlaceholder(zh, en) {
      var left = String(zh == null ? '' : zh).trim();
      var right = String(en == null ? '' : en).trim();
      if (left === '') return right;
      if (right === '') return left;
      return left + '\n' + right;
    }

    function readState() {
      var raw = {};
      try {
        var stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === null || stored === '') stored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        raw = JSON.parse(stored || '{}') || {};
      } catch (err) {
        raw = {};
      }
      var source = raw.placeholders && typeof raw.placeholders === 'object' ? raw.placeholders : {};
      var out = {};
      for (var i = 0; i < PLACEHOLDER_DEFS.length; i++) {
        var key = PLACEHOLDER_DEFS[i].key;
        out[key] = typeof source[key] === 'string' ? source[key].slice(0, PLACEHOLDER_MAX) : '';
      }
      /* 与中文提示按同一个 key 配对的英文提示。 */
      var ensSource = raw.placeholderEns && typeof raw.placeholderEns === 'object' ? raw.placeholderEns : {};
      var outEn = {};
      for (var j = 0; j < PLACEHOLDER_DEFS.length; j++) {
        var enKey = PLACEHOLDER_DEFS[j].key;
        outEn[enKey] = typeof ensSource[enKey] === 'string' ? ensSource[enKey].slice(0, PLACEHOLDER_MAX) : '';
      }

      /* 按模式覆盖的文案：可选层，空串一律回落到上面那份通用表。 */
      var byMode = normalizeModePlaceholders(raw.placeholderByMode);
      var byModeEn = normalizeModePlaceholders(raw.placeholderEnByMode);

      /* v1.2.0 只有一个 placeholder 字段、语义就是新会话，迁移过来。 */
      if (out.hero === '' && typeof raw.placeholder === 'string') {
        out.hero = raw.placeholder.slice(0, PLACEHOLDER_MAX);
      }

      /* 标题：多条列表 + 选取方式（含旧版单条 headline 的迁移）。 */
      var headlines = readHeadlines(raw);
      var mode = HEADLINE_MODES.indexOf(raw.headlineMode) !== -1 ? raw.headlineMode : 'random';
      var cursor = typeof raw.headlineCursor === 'number' && isFinite(raw.headlineCursor)
        ? Math.max(0, Math.floor(raw.headlineCursor))
        : 0;
      var last = typeof raw.headlineLast === 'string' ? raw.headlineLast.slice(0, HEADLINE_MAX) : '';

      /* 与中文行按序号配对的英文行。 */
      var ens = [];
      if (Array.isArray(raw.headlineEns)) {
        for (var e = 0; e < raw.headlineEns.length && e < HEADLINE_MAX_COUNT; e++) {
          ens.push(typeof raw.headlineEns[e] === 'string' ? raw.headlineEns[e].slice(0, HEADLINE_EN_MAX) : '');
        }
      }

      /* 底部状态行单位的英文后缀。 */
      var rawStats = raw.statsLabels && typeof raw.statsLabels === 'object' ? raw.statsLabels : {};
      var statsLabels = {};
      for (var st = 0; st < STATS_LABEL_DEFS.length; st++) {
        var stk = STATS_LABEL_DEFS[st].key;
        statsLabels[stk] = typeof rawStats[stk] === 'string'
          ? rawStats[stk].slice(0, STATS_LABEL_MAX)
          : STATS_LABEL_DEFAULTS[stk];
      }

      /* 侧栏标签的英文后缀。 */
      var rawSidebar = raw.sidebarLabels && typeof raw.sidebarLabels === 'object' ? raw.sidebarLabels : {};
      var sidebarLabels = {};
      for (var sb = 0; sb < SIDEBAR_LABEL_DEFS.length; sb++) {
        var sk = SIDEBAR_LABEL_DEFS[sb].key;
        sidebarLabels[sk] = typeof rawSidebar[sk] === 'string'
          ? rawSidebar[sk].slice(0, SIDEBAR_LABEL_MAX)
          : SIDEBAR_LABEL_DEFAULTS[sk];
      }

      /* 中文标题的大小 / 位置（0 = 不干预）。 */
      var rawTitleStyle = raw.headlineStyle && typeof raw.headlineStyle === 'object' ? raw.headlineStyle : {};
      var titleStyle = {
        size: rawTitleStyle.size > 0
          ? clampNumber(rawTitleStyle.size, TITLE_SIZE_FALLBACK, EN_STYLE_LIMITS.size)
          : 0,
        gap: clampNumber(rawTitleStyle.gap, 0, EN_STYLE_LIMITS.gap),
        offsetX: clampNumber(rawTitleStyle.offsetX, 0, EN_STYLE_LIMITS.offsetX)
      };

      /* 设置面板半透明：开关 + 不透明度。 */
      var alpha = Number(raw.panelDimAlpha);
      if (!isFinite(alpha)) alpha = PANEL_ALPHA_DEFAULT;
      alpha = Math.min(PANEL_ALPHA_LIMITS[1], Math.max(PANEL_ALPHA_LIMITS[0], alpha));

      /* 英文行的大小 / 位置（坏值一律夹进滑杆范围）。 */
      var rawEnStyle = raw.headlineEnStyle && typeof raw.headlineEnStyle === 'object' ? raw.headlineEnStyle : {};
      var enStyle = {
        size: clampNumber(rawEnStyle.size, EN_STYLE_DEFAULTS.size, EN_STYLE_LIMITS.size),
        gap: clampNumber(rawEnStyle.gap, EN_STYLE_DEFAULTS.gap, EN_STYLE_LIMITS.gap),
        offsetX: clampNumber(rawEnStyle.offsetX, EN_STYLE_DEFAULTS.offsetX, EN_STYLE_LIMITS.offsetX)
      };

      /* 权限预设的名称（空串 = 用系统原文）。 */
      var rawPerm = raw.permissions && typeof raw.permissions === 'object' ? raw.permissions : {};
      var permissions = {};
      for (var p = 0; p < PERMISSION_FIELDS.length; p++) {
        var pf = PERMISSION_FIELDS[p].key;
        permissions[pf] = typeof rawPerm[pf] === 'string' ? rawPerm[pf].slice(0, PERMISSION_MAX) : '';
      }

      return {
        placeholders: out,
        placeholderEns: outEn,
        placeholderByMode: byMode,
        placeholderEnByMode: byModeEn,
        /*
         * 标题列表三态：
         *   null → 没设过，用插件默认值（保持既有观感）；
         *   []   → 明确清空：不重命名，保留系统原文；
         *   [...] → 候选列表（空串/空白条目在抽取时被忽略）。
         */
        headlines: headlines,
        headlineMode: mode,
        headlineCursor: cursor,
        headlineLast: last,
        headlineEns: ens,
        headlineEnStyle: enStyle,
        headlineStyle: titleStyle,
        /* 锁定模式：防止误触拖动「大小与位置」滑杆（默认关）。 */
        styleLocked: raw.styleLocked === true,
        statsLabels: statsLabels,
        sidebarLabels: sidebarLabels,
        panelDim: raw.panelDim !== false,
        panelDimAlpha: alpha,
        permissions: permissions
      };
    }

    /**
     * 读出标题列表，同时兼容旧版单条字段：
     *   headlines: [...]        → 就是它（可能是空数组 = 明确清空）；
     *   headline: 'x'（v1.4 前）→ ['x']；
     *   headline: ''            → []（旧语义 = 不重命名）；
     *   headline: null / 缺失    → null（旧语义 = 没设过）。
     */
    function readHeadlines(raw) {
      if (Array.isArray(raw.headlines)) {
        var list = [];
        for (var i = 0; i < raw.headlines.length && list.length < HEADLINE_MAX_COUNT; i++) {
          if (typeof raw.headlines[i] === 'string') list.push(raw.headlines[i].slice(0, HEADLINE_MAX));
        }
        return list;
      }
      if (typeof raw.headline === 'string') {
        return raw.headline === '' ? [] : [raw.headline.slice(0, HEADLINE_MAX)];
      }
      return null;
    }

    var state = readState();
    var listeners = new Set();
    /*
     * 设置以宿主机为准：localStorage 是缓存（快、离线可用），真正的持久化在
     * <DSH_HOME>/dsha-brand-rename.json。DSH 换端口 / 换包名 / 升级都会换 origin，
     * localStorage 会整体丢掉；宿主文件跟着 ~/.dsh 一起备份。
     */
    var VIEW_API = '/dsh-brand-rename-api';
    var hostSynced = false;
    var hostPushTimer = null;
    /* 只有真实浏览器页面才有 location；单测的 DOM 桩没有，宿主同步整体跳过。 */
    var hostEnabled = typeof window !== 'undefined' && window.location
      && typeof window.location.href === 'string' && /^https?:/.test(window.location.href);

    function subscribe(fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }

    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        /* 隐私模式 / 配额满：内存里仍生效，只是不落盘。 */
      }
      scheduleHostPush();
    }

    /** 防抖写回宿主（滑杆拖动时不要每一帧都发请求）。 */
    function scheduleHostPush() {
      if (!hostEnabled || !hostSynced || typeof fetch !== 'function') return;
      if (hostPushTimer !== null) clearTimeout(hostPushTimer);
      hostPushTimer = setTimeout(function () {
        hostPushTimer = null;
        try {
          fetch(VIEW_API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ view: state })
          }).catch(function () { /* 宿主暂时不可达：localStorage 里还有一份 */ });
        } catch (err) { /* 同上 */ }
      }, 600);
    }

    /**
     * 启动时把宿主里的设置读回来；宿主没有（第一次升级/新装）就把当前
     * localStorage 的内容推上去，完成一次性迁移。
     */
    function hydrateFromHost() {
      if (!hostEnabled || typeof fetch !== 'function') { hostSynced = true; return; }
      fetch(VIEW_API, { headers: { accept: 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (body) {
          if (body && body.ok === true && body.view && typeof body.view === 'object' && !Array.isArray(body.view)) {
            try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body.view)); } catch (err) { /* 配额满 */ }
            state = readState();
            hostSynced = true;
            listeners.forEach(function (fn) { fn(state); });
            patchDom();
            runPermissionText(true);
          } else {
            hostSynced = true;
            scheduleHostPush();
          }
        })
        .catch(function () { hostSynced = true; });
    }

    function update(patch) {
      state = Object.assign({}, state, patch);
      persist();
      listeners.forEach(function (fn) { fn(state); });
      patchDom();
      runPermissionText(true);
    }

    /**
     * 不通知订阅者的写入。抽取标题时会推动「轮换游标 / 上次抽到的那条」，
     * 这两个值只给自己用，不需要让设置行重渲染，更不能顺手再跑一遍 patchDom
     * —— 否则就是「补丁 → 抽签 → 补丁」的自激循环。
     */
    function silentUpdate(patch) {
      state = Object.assign({}, state, patch);
      persist();
    }

    /** 订阅当前设置；设置行与页面补丁共用同一个状态源。 */
    function useView() {
      var pair = react.useState(state);
      var value = pair[0];
      var setValue = pair[1];
      react.useEffect(function () { return subscribe(setValue); }, []);
      return value;
    }

    //#endregion

    //#region A. 侧栏品牌区

    /** 要显示的品牌名。 */
    var WORD = 'Demiurge';

    /**
     * 官方 wordmark 以 size=24 渲染 → 156×24 CSS px（含徽标、不含鲸鱼）。
     * 实测：字母 ink 从 svg 左缘内缩约 6px 开始，宽约 95px；徽标 rect 从
     * viewBox x=129.348 起（即 svg 内 103.3px 处）。文字起点取 6px，
     * 自然宽度约 77px，落在 6~103 的字母区内，不会碰到徽标。
     */
    var TEXT_LEFT_PX = 6;
    var SVG_H_PX = 24;
    var FONT_SIZE_PX = 18;

    var STYLE_ID = 'dsha-brand-rename-style';

    /**
     * 注入样式表。**不只看 id 在不在，还要比对内容**：
     * 插件被热替换时（HMR）旧的 <style> 还留在页面上，只认 id 就会直接返回，
     * 于是这一版新加的规则永远进不去（踩过：英文行的纵向排列不生效）。
     */
    function ensureStyle() {
      if (typeof document === 'undefined') return;
      var existing = document.getElementById(STYLE_ID);
      if (existing) {
        if (existing.textContent !== pendingStyleText()) existing.textContent = pendingStyleText();
        return;
      }
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = pendingStyleText();
      (document.head || document.documentElement).appendChild(style);
    }

    /** 本插件要注入的整份 CSS（比对与写入共用一份，避免两处漂移）。 */
    function pendingStyleText() {
      return [
        /* 只隐掉 wordmark 的字母路径：它们是该 svg 的直接子节点；
           鲸鱼与 HARNESS 徽标都在 <g> 内，因此原样保留。 */
        '.dsha-brand-wordmark>path{display:none !important}',
        '.dsha-brand-name{position:relative;display:inline-flex;align-items:center}',
        '.dsha-brand-name-text{',
        'position:absolute;left:' + TEXT_LEFT_PX + 'px;top:0;',
        'height:' + SVG_H_PX + 'px;display:inline-flex;align-items:center;',
        'font-family:inherit;font-size:' + FONT_SIZE_PX + 'px;font-weight:600;',
        'letter-spacing:-0.01em;line-height:1;color:currentColor;',
        'white-space:nowrap;pointer-events:none}',
        /* 设置行输入框的占位色（行内样式没法写 ::placeholder）。 */
        '.dsha-brand-input::placeholder{color:var(--dsw-alias-label-caption)}',
        /* 模式滑块：Hero 标题（含英文副标题）正下方的三档滑块 */
        '.dsha-mode-switch{display:flex;flex-direction:column;align-items:center;gap:9px;margin:26px 0 2px;user-select:none}',
        /* 三档并排，顺序即 MODE_DEFS 的顺序 */
        '.dsha-mode-opts{display:flex;align-items:flex-start;justify-content:center;gap:16px}',
        '.dsha-mode-opt{display:flex;flex-direction:column;align-items:center;gap:1px;background:none;border:0;',
        'padding:0 2px;cursor:pointer;font:inherit;color:var(--dsw-alias-label-tertiary);font-size:12px;',
        'line-height:16px;transition:color .15s ease}',
        '.dsha-mode-opt .en{font-size:11px;line-height:14px;opacity:.72}',
        '.dsha-mode-opt .note{font-size:10px;line-height:13px;opacity:.58}',
        '.dsha-mode-opt.on{color:var(--dsw-alias-label-primary);font-weight:600}',
        /* 轨道：可见档位之间的滑块。宽度固定，滑块按 data-mode 挪到对应档位。 */
        '.dsha-mode-track{position:relative;flex:none;width:148px;height:6px;border-radius:999px;',
        'background:var(--dsw-alias-bg-module-platform);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l4);cursor:pointer}',
        '.dsha-mode-knob{position:absolute;top:50%;left:0;width:18px;height:18px;border-radius:50%;',
        'background:var(--dsw-alias-label-primary);transform:translateY(-50%);',
        'transition:left .18s cubic-bezier(.16,1,.3,1)}',
        /* 停位（轨道 148px、滑块 18px）：
             第 1 档（chat）        → 0px    ← knob 默认值，不需要规则
             第 2 档（cyrene-work） → 130px
             隐藏档 / 认不出来      → data-mode 落成 __none，也停在 0px */
        '.dsha-mode-switch[data-mode="cyrene-work"] .dsha-mode-knob{left:130px}',
        /* 英文副标题只有观感留在这里；定位 / 字号 / 偏移全部走行内样式，
           不依赖这份表（它在热替换时可能来不及更新）。 */
        '.dsha-headline-en{display:block;line-height:1.3;font-weight:400;opacity:.78;',
        'word-break:break-word}',
        /* ── 表达风格按钮（挂在 hero 里原生预设 chip 右边）────────────── */
        '.dsha-style-chip{display:inline-flex;align-items:center;margin-left:6px;padding:4px 10px;',
        'border:0;border-radius:999px;font:inherit;font-size:12px;line-height:16px;',
        'color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);',
        'box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l4);cursor:pointer;white-space:nowrap;',
        'max-width:230px;overflow:hidden;text-overflow:ellipsis}',
        '.dsha-style-chip:hover,.dsha-style-chip[aria-expanded="true"]{color:var(--dsw-alias-label-primary)}',
        '.dsha-style-menu{position:fixed;z-index:2147483000;min-width:190px;padding:6px;border-radius:12px;',
        'background:var(--dsw-alias-bg-module-platform);font:inherit;font-size:13px;line-height:18px;',
        'box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l4),0 12px 32px rgba(0,0,0,.18)}',
        '.dsha-style-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;',
        'padding:7px 10px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;',
        'cursor:pointer;text-align:left}',
        '.dsha-style-item:hover{background:var(--dsw-alias-bg-module-hover,rgba(128,128,128,.12))}',
        '.dsha-style-item.on{font-weight:600}',
        '.dsha-style-item .temp{opacity:.55;font-size:11px;font-variant-numeric:tabular-nums}'
      ].join('');
    }

    /** 品牌图标：返回 null 即彻底删除官方鲸鱼（展开行与折叠窄轨同时生效）。 */
    function BrandMark() {
      return null;
    }

    /** 品牌名：官方 SVG（保住 HARNESS 徽标）+ 叠加的 Demiurge 文字。 */
    function BrandName() {
      var hasWordmark = !!(primitives && primitives.BrandWordmark);
      var textStyle = {
        fontFamily: 'inherit',
        fontSize: FONT_SIZE_PX + 'px',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        color: 'currentColor',
        whiteSpace: 'nowrap'
      };

      /* 降级：拿不到 primitives 时至少把名字显示出来（徽标缺失）。 */
      if (!hasWordmark) {
        return react.createElement('span', { style: textStyle }, WORD);
      }

      return react.createElement(
        'span',
        { className: 'dsha-brand-name' },
        react.createElement(primitives.BrandWordmark, {
          key: 'wordmark',
          includeMark: false,
          className: 'dsha-brand-wordmark'
        }),
        react.createElement('span', { key: 'text', className: 'dsha-brand-name-text' }, WORD)
      );
    }

    //#endregion

    //#region B. Hero 标题

    /** Hero 原始标题（中/英），命中才替换 —— 保证幂等，重复执行不会叠加。 */
    var HERO_ORIGINALS = ['探索未至之境', 'Into the Unknown'];
    /** 预览徽标文案（类名匹配失败时的兜底）。 */
    var PREVIEW_TEXTS = ['预览版', 'Preview'];
    /** 记下被我们替换掉的系统原文，清空设置时能原样还原。 */
    var HEADLINE_ORIG = 'data-dsha-headline-orig';
    /** 记下我们实际写进去的文案。 */
    var HEADLINE_APPLIED = 'data-dsha-headline-applied';

    /**
     * 本次「停在新会话页」期间选中的那条标题。
     *
     * 关键：抽签只在**一次新的出现**时发生（离开新会话页再回来 = 又开了一个会话）。
     * 页面内部的重渲染、标题格节点被 React 重建，都只是把同一条重新写回去 ——
     * 否则标题会自己几秒变一次，那不是「每次新会话随机」，是随机闪。
     */
    var currentPick = null;
    /** 上一轮补丁时 Hero 在不在场。 */
    var heroPresent = false;
    /** Hero 消失的时刻（毫秒）。 */
    var heroAbsentAt = 0;
    /**
     * 「消失多久才算真的换了页面」。React 抖动式地拆了又建（间隔几毫秒到几百毫秒）
     * 不算新会话；用户切到别的会话再点「新会话」必然远超这个值。
     */
    var HERO_REAPPEAR_MS = 800;

    /**
     * 设置面板里显示的行：没设过 → 一行插件默认值；设过 → 就用存下来的列表。
     * （存的是空列表时也照实显示成空，让人看到「一条都没有」这个状态。）
     */
    function headlineRows() {
      return state.headlines === null ? [DEFAULT_HEADLINE] : state.headlines;
    }

    /**
     * 与中文行**按序号配对**的英文行（短了补空串，长了截断）。
     * 中英各存一个数组，第 i 条英文就是第 i 条中文的副标题；中文为空的行走不到。
     */
    function headlineEnRows() {
      var rows = headlineRows();
      var saved = Array.isArray(state.headlineEns) ? state.headlineEns : [];
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        out.push(typeof saved[i] === 'string' ? String(saved[i]).slice(0, HEADLINE_EN_MAX) : '');
      }
      return out;
    }

    /** 真正参与抽取的候选：非空的中文行，连同它配对的那条英文。 */
    function headlinePool() {
      var rows = headlineRows();
      var ens = headlineEnRows();
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var value = String(rows[i]);
        if (value.trim() === '') continue;
        out.push({ zh: value, en: ens[i] || '' });
      }
      return out;
    }

    /** 按中文文案找回候选条目（热替换后 currentPick 丢了，用它补回来）。 */
    function poolEntryByText(text) {
      var pool = headlinePool();
      for (var i = 0; i < pool.length; i++) if (pool[i].zh === text) return pool[i];
      return null;
    }

    /** 节点上已经写着的这条现在还算数吗？不算就该重抽一条。 */
    function headlineStillOffered(value) {
      if (value === null || value === '') return false;
      var pool = headlinePool();
      for (var i = 0; i < pool.length; i++) if (pool[i].zh === value) return true;
      return false;
    }

    function clampNumber(value, fallback, range) {
      var number = Number(value);
      if (!isFinite(number)) number = fallback;
      return Math.min(range[1], Math.max(range[0], Math.round(number)));
    }

    /** 中文标题的样式（0 = 不写行内样式，用系统默认）。 */
    function headlineStyle() {
      var saved = state.headlineStyle && typeof state.headlineStyle === 'object' ? state.headlineStyle : {};
      return {
        size: saved.size > 0 ? clampNumber(saved.size, TITLE_SIZE_FALLBACK, EN_STYLE_LIMITS.size) : 0,
        gap: clampNumber(saved.gap, 0, EN_STYLE_LIMITS.gap),
        offsetX: clampNumber(saved.offsetX, 0, EN_STYLE_LIMITS.offsetX)
      };
    }

    /** 中文标题滑杆上显示的字号：没设过就显示系统当前值。 */
    function effectiveTitleSize(style) {
      return style.size > 0 ? style.size : (SYSTEM_TITLE_SIZE || TITLE_SIZE_FALLBACK);
    }

    /** 记下系统原本的字号 —— 必须在写我们自己的 font-size 之前调。 */
    function rememberSystemTitleSize(el) {
      if (SYSTEM_TITLE_SIZE > 0) return;
      try {
        if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
        var computed = window.getComputedStyle(el);
        var size = computed ? parseFloat(computed.fontSize) : 0;
        if (isFinite(size) && size > 0) SYSTEM_TITLE_SIZE = Math.round(size);
      } catch (err) {
        /* 读不到就用兜底值展示。 */
      }
    }

    /**
     * 把「字号 / 上下 / 左右」写进中文标题。
     *
     * 与英文行的区别：中文是版面锚点（整块由它撑起来、英文挂在它下面），
     * 所以字号走 font-size —— 放大时卡片自然变高，这是「调大小」应有的效果；
     * 位置走 transform —— 只挪视觉位置，不挤动周围布局。
     */
    function applyHeadlineStyle(el) {
      var style = headlineStyle();
      if (style.size > 0) {
        el.style.fontSize = style.size + 'px';
        /* 前端是 26px 字号配 32px 行高（≈1.23）；换字号时按同比例给行高，
           否则放大后会被原来的固定行高压扁。 */
        el.style.lineHeight = '1.2308';
      } else {
        el.style.fontSize = '';
        el.style.lineHeight = '';
      }
      if (style.gap || style.offsetX) {
        el.style.transform = 'translate(' + style.offsetX + 'px, ' + style.gap + 'px)';
      } else {
        el.style.transform = '';
      }
    }

    /** 英文行的样式（把存下来的值夹进滑杆范围，坏数据也不会把版面搞崩）。 */
    function headlineEnStyle() {
      var saved = state.headlineEnStyle && typeof state.headlineEnStyle === 'object' ? state.headlineEnStyle : {};
      return {
        size: clampNumber(saved.size, EN_STYLE_DEFAULTS.size, EN_STYLE_LIMITS.size),
        gap: clampNumber(saved.gap, EN_STYLE_DEFAULTS.gap, EN_STYLE_LIMITS.gap),
        offsetX: clampNumber(saved.offsetX, EN_STYLE_DEFAULTS.offsetX, EN_STYLE_LIMITS.offsetX)
      };
    }

    /**
     * 抽一条标题。
     *
     * @param previous - 上一次抽到的那条中文（随机模式下用来避免连着重复）。
     * @param advance - 是否推进内部状态（顺序模式游标 / 上次结果）。
     *                  新会话出现时 true；只是设置改了要换一条时 false，
     *                  免得一次改动把轮换进度白白吃掉一格。
     * @returns 选中的 `{zh, en}`；候选为空时返回 null，表示「保留系统原文」。
     */
    function pickHeadline(previous, advance) {
      var pool = headlinePool();
      if (pool.length === 0) return null;

      var picked;
      if (state.headlineMode === 'random') {
        var source = pool;
        /* 多条时排除上一次，避免「每次都撞上同一条」这种假随机观感。 */
        if (pool.length > 1 && previous) {
          var without = pool.filter(function (item) { return item.zh !== previous; });
          if (without.length > 0) source = without;
        }
        picked = source[Math.floor(Math.random() * source.length)];
      } else {
        var index = state.headlineCursor % pool.length;
        if (index < 0) index = 0;
        picked = pool[index];
        if (advance) silentUpdate({ headlineCursor: (index + 1) % pool.length });
      }

      if (advance && picked.zh !== state.headlineLast) silentUpdate({ headlineLast: picked.zh });
      return picked;
    }

    /**
     * 本次「停在新会话页」期间该显示哪一条。
     *
     * @param fresh - 是不是一次**新的出现**（离开新会话页再回来 = 又开了一个会话）。
     *                只有它才重新抽签；页面内部的重渲染一律沿用当前这条。
     * @returns 该显示的 `{zh, en}`；候选为空时返回 null（保留系统原文）。
     */
    function headlineFor(fresh) {
      var previous = currentPick !== null ? currentPick.zh : state.headlineLast;
      if (fresh) {
        currentPick = pickHeadline(previous, true);
        return currentPick;
      }
      if (currentPick !== null && headlineStillOffered(currentPick.zh)) return currentPick;
      /* 设置被改过（当前这条被删了/改了）：换一条顶上，但不算新会话、不推进轮换。 */
      currentPick = pickHeadline(previous, false);
      return currentPick;
    }

    /**
     * 处理标题那一个节点。三种情形，和输入框提示那套是同一个思路：
     *   A. 系统原文（探索未至之境 / Into the Unknown），或者一个**空的标题格** ——
     *      这是「归我们管」的格子：写入当前该显示的那条（是否需要重新抽签由
     *      `fresh` 决定，见 {@link headlineFor}）。
     *   B. 当前正是我们写进去的 → 设置改了才跟上；被清空就还原记录的原文。
     *   C. 其它（我们不认识且非空的文案）→ 只清过期标记，绝不改文本。
     *
     * 为什么要认「空的一格」：`_titleGroup` 里除徽标外只剩这一格，位置本身就是
     * 最硬的证据。而依赖「先认出原文」很脆 —— 实测前端某些版本/时机下这一格
     * 渲染出来就是空的（`t("hero.headline")` 没给出文本），那时插件永远认不出来，
     * 用户设的标题一条都写不进去。空 ≠ 别人写的文案，接管它是安全的。
     */
    function patchHeadlineNode(el, text, fresh) {
      var applied = el.getAttribute(HEADLINE_APPLIED);
      var original = el.getAttribute(HEADLINE_ORIG);

      var isOriginal = HERO_ORIGINALS.indexOf(text) !== -1;
      var isOurs = applied !== null && text === applied;

      /* ── 情形 C：别人写的非空文案 —— 只清过期标记，也不动它的样式 ── */
      if (!isOriginal && text !== '' && !isOurs) {
        if (applied !== null || original !== null) {
          el.removeAttribute(HEADLINE_APPLIED);
          el.removeAttribute(HEADLINE_ORIG);
        }
        return null;
      }

      /*
       * 正是我们写的那条、且现在还合法 → 不用重抽；但条目一定要**从当前候选里现取**，
       * 不能复用 currentPick 缓存：用户刚改过这条的英文时，缓存里还是旧的英文。
       */
      var entry = null;
      if (isOurs && headlineStillOffered(applied)) {
        entry = poolEntryByText(applied);
        if (entry !== null) currentPick = entry;
      }
      if (entry === null) entry = headlineFor(fresh);

      var want = entry !== null ? entry.zh : '';

      /* 轮到我们管这个格子了：先记系统字号，再套上用户的字号 / 位置。 */
      rememberSystemTitleSize(el);

      /* ── 候选为空（列表被清光）= 不重命名（但样式照旧可调） ── */
      if (want === '') {
        applyHeadlineStyle(el);
        el.removeAttribute(HEADLINE_APPLIED);
        if (isOurs) {
          el.removeAttribute(HEADLINE_ORIG);
          if (original !== null && text !== original) el.textContent = original;
        } else if (isOriginal) {
          el.setAttribute(HEADLINE_ORIG, text);
        }
        return null;
      }

      if (!isOurs) el.setAttribute(HEADLINE_ORIG, text);
      if (applied !== want) el.setAttribute(HEADLINE_APPLIED, want);
      if (text !== want) el.textContent = want;
      applyHeadlineStyle(el);
      return entry;
    }

    /**
     * 给标题组一个定位锚点，英文行才能在它下面「悬浮」。
     *
     * 行内样式 + 类名两条都写：行内样式不依赖样式表，即使那份 <style> 因为
     * 热替换而没更新也照样定位得对；类名留给 CSS 兜底与调试。
     * React 不管这个元素的 style（它的 vdom 里 titleGroup 没有 style），
     * 所以不会被回滚 —— 和徽标用 display:none 是同一个道理。
     */
    function markHeadlineGroup(group) {
      var cls = typeof group.className === 'string' ? group.className : '';
      if (cls.indexOf(HEADLINE_EN_GROUP_CLASS) === -1) {
        group.className = (cls + ' ' + HEADLINE_EN_GROUP_CLASS).trim();
      }
      group.style.position = 'relative';
    }

    function unmarkHeadlineGroup(group) {
      var cls = typeof group.className === 'string' ? group.className : '';
      if (cls.indexOf(HEADLINE_EN_GROUP_CLASS) !== -1) {
        group.className = cls.split(/\s+/).filter(function (part) {
          return part !== '' && part !== HEADLINE_EN_GROUP_CLASS;
        }).join(' ');
      }
      group.style.position = '';
    }

    /** 找出组里我们自己插的英文行。 */
    function headlineEnNode(group) {
      var kids = group.children;
      for (var i = 0; i < kids.length; i++) {
        var cls = typeof kids[i].className === 'string' ? kids[i].className : '';
        if (cls.indexOf(HEADLINE_EN_CLASS) !== -1) return kids[i];
      }
      return null;
    }

    /**
     * 把「字号 / 上下 / 左右」写进英文行。
     *
     * 英文行是**绝对定位**的：它不占布局高度，所以把它往下挪时输入框
     * 和整张卡片的高度一帧都不会变 —— 这正是「悬浮」的意思。
     * 锚点是标题组：top:100% 贴在中文下方，left:50% + translateX(-50%) 居中，
     * 再叠上用户设的左右 / 上下偏移。
     */
    function applyHeadlineEnStyle(node) {
      var style = headlineEnStyle();
      node.style.position = 'absolute';
      node.style.left = '50%';
      node.style.top = '100%';
      node.style.width = 'max-content';
      node.style.maxWidth = '88vw';
      node.style.whiteSpace = 'normal';
      node.style.textAlign = 'center';
      node.style.pointerEvents = 'none';
      node.style.fontSize = style.size + 'px';
      var shift = style.offsetX !== 0 ? 'calc(-50% + ' + style.offsetX + 'px)' : '-50%';
      node.style.transform = 'translate(' + shift + ', ' + style.gap + 'px)';
    }

    /**
     * 维护中文标题下面那行英文。
     *
     * 英文是**我们自己插进去的节点**（前端没有这个槽位），所以：
     *   - 它带 HEADLINE_EN_CLASS，标题识别循环会跳过它（否则空文本会被当成
     *     「空的标题格」而被写进中文标题）；
     *   - 没配英文（或没抽到候选）时直接摘掉，不留一行空白；
     *   - 样式每次补丁都重新写一遍，滑杆一动就跟着变。
     */
    function patchHeadlineEn(group, entry) {
      var text = entry !== null && entry.en ? entry.en : '';
      var node = headlineEnNode(group);

      if (text === '') {
        if (node && node.parentElement) node.parentElement.removeChild(node);
        unmarkHeadlineGroup(group);
        return;
      }

      if (!node) {
        node = document.createElement('span');
        node.className = HEADLINE_EN_CLASS;
        group.appendChild(node);
      }
      markHeadlineGroup(group);
      if (node.textContent !== text) node.textContent = text;
      applyHeadlineEnStyle(node);
    }

    /**
     * 改 Hero 标题 + 藏预览徽标。幂等，可反复调用。
     *
     * 徽标用 display:none 而不是 remove()：React 只 diff 自己的 vdom，
     * 手动改的 textContent 和它不管理的 style 都不会被回滚；万一整棵被重建，
     * 由 MutationObserver 再补一次。
     */
    function patchHero() {
      var groups = document.querySelectorAll('[class*="titleGroup"]');

      /* 不在新会话页：记下离开的时刻，下次再出现就是「又开了一个会话」。 */
      if (groups.length === 0) {
        if (heroPresent) heroAbsentAt = Date.now();
        heroPresent = false;
        return;
      }

      /*
       * 判定一次新的出现：之前不在场，且这次缺席不是 React 抖一下
       * （拆了马上又建）。只有真离开过一会儿，才重新抽签。
       */
      var fresh = false;
      if (!heroPresent) {
        heroPresent = true;
        fresh = heroAbsentAt === 0 || (Date.now() - heroAbsentAt) >= HERO_REAPPEAR_MS;
      }

      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var kids = group.children;
        var shown = null;
        for (var j = 0; j < kids.length; j++) {
          var el = kids[j];
          var cls = typeof el.className === 'string' ? el.className : '';
          /* 我们自己插的英文行不是「标题格」，跳过（不然空文本会被当成空格子接管）。 */
          if (cls.indexOf(HEADLINE_EN_CLASS) !== -1) continue;
          var text = (el.textContent || '').trim();

          /* 预览版徽标：先按类名，再按文案兜底。 */
          if (cls.indexOf('_previewBadge') !== -1 || PREVIEW_TEXTS.indexOf(text) !== -1) {
            if (el.style.display !== 'none') el.style.display = 'none';
            continue;
          }

          shown = patchHeadlineNode(el, text, fresh) || shown;
        }
        patchHeadlineEn(group, shown);
      }
    }

    //#endregion

    //#region C. 输入框提示文案

    /**
     * 三个标记，都挂在被改的节点上：
     *   MARK_KEY     该节点属于哪种状态
     *   MARK_ORIG    被我们替换掉的官方原文（「恢复默认」靠它还原）
     *   MARK_APPLIED 我们实际写进去的文案 —— 用来判断「现在这个文本是不是我们写的」
     */
    var MARK_KEY = 'data-dsha-ph-key';
    var MARK_ORIG = 'data-dsha-ph-orig';
    var MARK_APPLIED = 'data-dsha-ph-applied';

    function clearMarks(node) {
      node.removeAttribute(MARK_KEY);
      node.removeAttribute(MARK_ORIG);
      node.removeAttribute(MARK_APPLIED);
    }

    /**
     * 写灰字。官方那条 CSS 是 `white-space:nowrap` + 省略号，中英要分成两行
     * 就得在节点上显式允许换行（`pre-line` 既认 \n 也会自动折行）。
     */
    function writePlaceholder(node, text) {
      node.textContent = text;
      node.style.whiteSpace = 'pre-line';
      syncEditorAttrs(node, text);
    }

    /** 还原成官方原文：连同我们加的行内样式一起摘掉。 */
    function writePlaceholderOriginal(node, text) {
      node.textContent = text;
      node.style.whiteSpace = '';
      syncEditorAttrs(node, text);
    }

    /** contenteditable 上的两个属性同步一下，免得无障碍读到的还是旧文案。 */
    function syncEditorAttrs(node, text) {
      var parent = node.parentElement;
      if (!parent) return;
      var editor = parent.querySelector('[data-placeholder]');
      if (!editor) return;
      editor.setAttribute('data-placeholder', text);
      editor.setAttribute('aria-label', text);
    }

    /**
     * 按状态替换输入框提示。幂等，可反复调用。
     *
     * 每个节点只会落进三种情形之一：
     *   A. 当前文本是某个状态的**官方默认** → 有自定义就替换，没有就只清标记、不碰文本；
     *   B. 当前文本正是**我们写进去的**自定义文案 → 设置改了就跟上，清空了就还原成记录里的原文；
     *   C. 其它（React 换成了我们不认识的文案，或 composerBlock 的动态原因）→ 只清过期标记，绝不改文本。
     *
     * 情形 C 是刻意留的：万一将来 DSH 改了官方原文，我们那张表就认不出来，
     * 这时绝不能拿手里存的旧原文去「还原」—— 那会把控制流交给一个过期快照，
     * 反而把新文案盖掉。
     */
    function patchComposerPlaceholder() {
      var custom = state.placeholders;
      var customEn = state.placeholderEns && typeof state.placeholderEns === 'object' ? state.placeholderEns : {};
      var byMode = state.placeholderByMode && typeof state.placeholderByMode === 'object' ? state.placeholderByMode : {};
      var byModeEn = state.placeholderEnByMode && typeof state.placeholderEnByMode === 'object' ? state.placeholderEnByMode : {};
      /**
       * 某个状态最终要显示的灰字（中文 + 英文）。
       *
       * 取值优先级：**当前模式的专属文案 > 通用文案 > 空（= 不干预官方原文）**。
       * 只有列在 MODE_PLACEHOLDER_KEYS 里的状态才看模式，其余状态走通用那档，
       * 与加这个功能之前的行为完全一致。
       */
      function wantFor(key) {
        if (key === null) return '';
        if (MODE_PLACEHOLDER_KEYS.indexOf(key) !== -1) {
          var modeId = currentModeId();
          var perMode = byMode[modeId];
          if (perMode && typeof perMode[key] === 'string' && perMode[key] !== '') {
            return composePlaceholder(perMode[key], (byModeEn[modeId] || {})[key]);
          }
        }
        if (!Object.prototype.hasOwnProperty.call(custom, key)) return '';
        return composePlaceholder(custom[key], customEn[key]);
      }
      var nodes = document.querySelectorAll('[data-composer-placeholder]');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var text = node.textContent || '';
        var detected = DEFAULT_LOOKUP[normalizeText(text)] || null;
        var applied = node.getAttribute(MARK_APPLIED);

        /* ── 情形 A：DOM 上是某个状态的官方默认 ── */
        if (detected !== null) {
          var want = wantFor(detected);
          if (want === '') {
            clearMarks(node);
            continue;
          }
          node.setAttribute(MARK_KEY, detected);
          if (node.getAttribute(MARK_ORIG) !== text) node.setAttribute(MARK_ORIG, text);
          if (applied !== want) node.setAttribute(MARK_APPLIED, want);
          if (text !== want) writePlaceholder(node, want);
          continue;
        }

        /* ── 情形 B：DOM 上正是我们写进去的自定义文案 ── */
        if (applied !== null && text === applied) {
          var key = node.getAttribute(MARK_KEY);
          var next = wantFor(key);
          if (next === '') {
            var back = node.getAttribute(MARK_ORIG);
            clearMarks(node);
            if (back !== null && text !== back) writePlaceholderOriginal(node, back);
          } else if (next !== applied) {
            node.setAttribute(MARK_APPLIED, next);
            writePlaceholder(node, next);
          }
          continue;
        }

        /* ── 情形 C：不认识 —— 只清过期标记，不动文本 ── */
        if (applied !== null || node.getAttribute(MARK_KEY) !== null || node.getAttribute(MARK_ORIG) !== null) {
          clearMarks(node);
        }
      }
    }

    //#endregion

    //#region C0. 设置面板半透明

    /**
     * 把「设置面板半透明」写进那个 dialog。
     *
     * 为什么能看见新会话页：设置面板是盖在页面上的 `role=dialog` 浮层
     * （`aria-modal`），下面是半透明遮罩 + 对话/新会话页本身；把面板整体
     * 调成半透明，Hero 就从后面透出来了 —— 拖滑杆时不用反复关面板。
     *
     * 用标记类名认出「哪个 dialog 是我们的设置面板」，避免误伤别的弹窗
     * （比如「确认启用完全权限」那个也是 dialog）。
     */
    /** 正在调整（滑杆按着 / 输入框聚焦）。 */
    var panelPeek = false;
    /** 指针是否正按在滑杆上（用来挡住「先编辑文字再拖滑杆」时 blur 把 peek 清掉）。 */
    var panelPointerDown = false;
    /** 指针松开的一次性监听是否已经挂上。 */
    var panelReleaseHooked = false;

    /** 交互状态变了就同步一次：功能开着、且正在调整 → 面板半透明。 */
    function syncPanelDim() {
      var active = state.panelDim !== false && (panelPeek || panelPointerDown);
      applyPanelDim(active, Number(state.panelDimAlpha) || PANEL_ALPHA_DEFAULT);
    }

    /** 指针松开（可能在面板外面）→ 还原。只挂一次监听。 */
    function hookPointerRelease() {
      if (panelReleaseHooked) return;
      try {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        panelReleaseHooked = true;
        var release = function () {
          panelPointerDown = false;
          panelPeek = false;
          syncPanelDim();
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('mouseup', release);
        window.addEventListener('touchend', release);
      } catch (err) {
        /* 挂不上就算了：至少 pointerup 在控件上时还能靠 blur 还原。 */
      }
    }

    /** 滑杆按下 / 输入框聚焦。 */
    function peekStart(fromPointer) {
      if (fromPointer) {
        panelPointerDown = true;
        hookPointerRelease();
      }
      panelPeek = true;
      syncPanelDim();
    }

    /** 输入框失焦：指针还按着就不还原（否则拖滑杆到一半会被顺手还原）。 */
    function peekEnd() {
      if (panelPointerDown) return;
      panelPeek = false;
      syncPanelDim();
    }

    function applyPanelDim(enabled, alpha) {
      try {
        var panels = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        for (var i = 0; i < panels.length; i++) {
          if (!panels[i].querySelector('[class*="' + PANEL_ROW_CLASS + '"]')) continue;
          var next = enabled ? String(alpha) : '';
          if (panels[i].style.opacity !== next) panels[i].style.opacity = next;
          return;
        }
      } catch (err) {
        /* 拿不到面板就算了，不影响其它功能。 */
      }
    }

    //#endregion

    //#region C0b. 状态行单位（轮 / 步 / 缓存命中）

    /**
     * 状态行里那串「3 轮 5 步 · 1.2k tokens · 缓存命中 45%」是 chat 命名空间的
     * 两条模板拼出来的，节点挂在两个 `<span class="…_label">` 里。
     *
     * 做法：**只改文本节点**（`node.data`），不碰元素结构 —— 那个 label 里还有
     * `_sep`（分隔点）和别的 span，直接写 textContent 会把它们抹掉。
     * 英文接在各自中文词的后面，所以渲染出来是「3 轮 Rounds 5 步 Steps」。
     */
    /** 上一次真写进去的英文（改设置时先撤掉旧的，免得新旧两段并存）。 */
    var statsTailApplied = {};

    function withStatsSuffix(text) {
      var out = text;
      for (var i = 0; i < STATS_LABEL_DEFS.length; i++) {
        var def = STATS_LABEL_DEFS[i];
        var tail = (state.statsLabels && state.statsLabels[def.key] != null
          ? String(state.statsLabels[def.key])
          : STATS_LABEL_DEFAULTS[def.key]).trim();
        var prev = statsTailApplied[def.key] || '';
        var appended;
        if (prev !== '' && prev !== tail) {
          appended = def.token + ' ' + prev;
          if (out.indexOf(appended) !== -1) out = out.split(appended).join(def.token);
        }
        if (tail === '') {
          statsTailApplied[def.key] = '';
          continue;
        }
        appended = def.token + ' ' + tail;
        if (out.indexOf(appended) !== -1) {          /* 已经加过 → 不再叠加 */
          statsTailApplied[def.key] = tail;
          continue;
        }
        if (out.indexOf(def.token) === -1) continue;
        out = out.split(def.token).join(appended);
        statsTailApplied[def.key] = tail;
      }
      return out;
    }

    function patchStatsTextNodes(el) {
      var childNodes = el.childNodes;
      if (childNodes && childNodes.length) {
        for (var i = 0; i < childNodes.length; i++) {
          var child = childNodes[i];
          if (!child) continue;
          if (child.nodeType === 3) {
            var next = withStatsSuffix(String(child.data == null ? '' : child.data), null);
            if (next !== child.data) child.data = next;
          } else if (child.nodeType === 1) {
            patchStatsTextNodes(child);
          }
        }
        return;
      }
      /* 叶子（或测试桩）：直接改 textContent */
      var text = el.textContent || '';
      var out = withStatsSuffix(text, null);
      if (out !== text) el.textContent = out;
    }

    function patchStatsLabels() {
      var nodes;
      try {
        nodes = document.querySelectorAll('[class*="label"]');
      } catch (err) {
        return;
      }
      for (var i = 0; i < nodes.length; i++) patchStatsTextNodes(nodes[i]);
    }

    //#endregion

    //#region C1. 侧栏标签的英文

    /**
     * 在侧栏「设置」和它上方的「美化」后面接一句英文（默认 Settings / Beautify）。
     *
     * 这两个标签都是别人渲染的（设置是 SettingsRoot 的 trigger，美化是 dsh-ui-boost
     * 自己的按钮，而且它会在「🎨 美化 / ✕ 美化」之间变），所以照老规矩做 DOM 补偿：
     * 只在**认得出原文**时接管，并把「原文 / 我们写进去的值」记在节点上 ——
     * 设置改了跟着改，React 重建后回到原文也能重新认领，认不出的一律不碰。
     */
    function patchSidebarLabels() {
      var custom = state.sidebarLabels || {};
      for (var i = 0; i < SIDEBAR_LABEL_DEFS.length; i++) {
        var def = SIDEBAR_LABEL_DEFS[i];
        var suffix = String(custom[def.key] == null ? '' : custom[def.key]).trim();
        /* 先按精确选择器找；万一前端的 hash 类名结构变了，退化成「所有 trigger 标签」再按原文筛。 */
        var nodes = [];
        for (var k = 0; k < def.selectors.length && nodes.length === 0; k++) {
          try {
            nodes = document.querySelectorAll(def.selectors[k]);
          } catch (err) {
            nodes = [];
          }
        }
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          var text = node.textContent || '';
          var applied = node.getAttribute(SIDEBAR_MARK_APPLIED);
          var base = node.getAttribute(SIDEBAR_MARK_BASE);

          /* 情形 A：现在就是我们写的那份 → 跟着设置走 */
          if (applied !== null && text === applied) {
            var next = (base === null ? text : base) + (suffix ? ' ' + suffix : '');
            if (next !== text) {
              node.textContent = next;
              node.setAttribute(SIDEBAR_MARK_APPLIED, next);
            }
            continue;
          }

          /* 情形 B：认得出原文 → 接管（含 React 重建后回到原文） */
          if (text.indexOf(def.base) === -1) {
            if (applied !== null || base !== null) {
              node.removeAttribute(SIDEBAR_MARK_APPLIED);
              node.removeAttribute(SIDEBAR_MARK_BASE);
            }
            continue;
          }
          var written = suffix ? text + ' ' + suffix : text;
          node.setAttribute(SIDEBAR_MARK_BASE, text);
          node.setAttribute(SIDEBAR_MARK_APPLIED, written);
          if (written !== text) node.textContent = written;
        }
      }
    }

    //#endregion

    //#region C2. 权限名称

    /*
     * 权限预设的中文文案活在两个已注册的 locale 命名空间里：
     *   conversation          → access.preset.*（输入框旁那个权限选择器 + 确认弹窗）
     *   settings.permission   → preset.*（设置 → 权限 那一行）
     *
     * 同命名空间 + 同语言**不能再 register**（会直接抛错），所以这里走另一条路：
     * 直接改写字典对象里的那几条。`t()` 是渲染时现场读字典的，改完在下一次渲染
     * 就生效；我们额外推一次 locale publish，让订阅者立刻重渲染。
     *
     * 这是内部结构（dicts 不是公开 API），所以全程 try/catch + 存在性判断：
     * 拿不到就安静降级成「什么都没改」，绝不影响插件其余部分。
     */

    /** apply 时抓住的 locale 服务。 */
    var localeService = null;
    /** 原值快照：ns \0 localeKey \0 key → { value, existed }。 */
    var permissionOriginals = {};

    function permissionOriginalId(ns, localeKey, key) {
      return ns + '\u0000' + localeKey + '\u0000' + key;
    }

    /** 记下某个键的**第一次**见到的值（之后会被我们覆盖，所以只记一次）。 */
    function rememberPermissionOriginal(ns, localeKey, entries, key) {
      var id = permissionOriginalId(ns, localeKey, key);
      if (Object.prototype.hasOwnProperty.call(permissionOriginals, id)) return permissionOriginals[id];
      var record = {
        existed: Object.prototype.hasOwnProperty.call(entries, key),
        value: entries[key]
      };
      permissionOriginals[id] = record;
      return record;
    }

    function readPermissionOriginal(ns, localeKey, key) {
      var record = permissionOriginals[permissionOriginalId(ns, localeKey, key)];
      return record !== undefined && record.existed ? record.value : undefined;
    }

    /** 当前界面语言（字典的键是小写 BCP 47）。 */
    function activeLocaleKey() {
      try {
        var snapshot = localeService && localeService.snapshot;
        var active = snapshot && snapshot.active;
        return typeof active === 'string' && active !== '' ? active.toLowerCase() : 'zh';
      } catch (err) {
        return 'zh';
      }
    }

    /** 输入框的灰字提示：主动语言下的系统原文，取不到就用内置常量。 */
    function defaultPermissionLabel(field) {
      var zhLike = activeLocaleKey().indexOf('en') !== 0;
      /* 0.2.x 的原文在 permission.access，0.1.x 在 conversation；都没有就用内置常量。 */
      var got = readPermissionOriginal('permission.access', activeLocaleKey(), field.settings);
      if (typeof got !== 'string' || got === '') {
        got = readPermissionOriginal('conversation', activeLocaleKey(), field.conv);
      }
      if (typeof got === 'string' && got !== '') return got;
      return zhLike ? field.zh : field.en;
    }

    /** 面板里三个框当前该显示什么（空串 = 用系统原文）。 */
    function permissionValues() {
      return state.permissions || { readOnly: '', workspaceWrite: '', fullAccess: '' };
    }

    /**
     * 把自定义名称写进两个命名空间的字典。
     *
     * @param notify - 有实际改动时是否推一次 locale publish（订阅回调里传 false，
     *                 免得 publish → 订阅 → 再写一遍的自激循环）。
     */
    function runPermissionText(notify) {
      var locale = localeService;
      if (!locale || !locale.dicts || typeof locale.dicts.get !== 'function') return;
      var custom = permissionValues();
      var changed = false;

      function write(ns, localeKey, entries, key, next) {
        if (entries[key] === next) return;
        entries[key] = next;
        changed = true;
      }

      function restoreOrWrite(ns, localeKey, entries, key, next) {
        var record = permissionOriginals[permissionOriginalId(ns, localeKey, key)];
        if (next !== '' ) { write(ns, localeKey, entries, key, next); return; }
        /* 自定义为空 = 回到系统原文（原本没有这个键就删掉）。 */
        if (record !== undefined && !record.existed) {
          if (Object.prototype.hasOwnProperty.call(entries, key)) { delete entries[key]; changed = true; }
          return;
        }
        var back = record !== undefined ? record.value : undefined;
        if (typeof back === 'string') write(ns, localeKey, entries, key, back);
      }

      for (var nn = 0; nn < PERMISSION_NAMESPACES.length; nn++) {
        var def = PERMISSION_NAMESPACES[nn];
        var ns = def.ns;
        var locales = locale.dicts.get(ns);
        if (!locales || typeof locales.forEach !== 'function') continue;

        locales.forEach(function (entries, localeKey) {
          if (!entries || typeof entries !== 'object') return;
          var fullCustom = (custom.fullAccess || '').trim();
          var originalFull = rememberPermissionOriginal(ns, localeKey, entries, def.full).value;
          var effectiveFull = fullCustom !== '' ? fullCustom : originalFull;

          for (var f = 0; f < PERMISSION_FIELDS.length; f++) {
            var field = PERMISSION_FIELDS[f];
            var key = def.keyOf(field);
            var next = (custom[field.key] || '').trim();
            rememberPermissionOriginal(ns, localeKey, entries, key);
            restoreOrWrite(ns, localeKey, entries, key, next);
          }

          /*
           * 确认弹窗里带着「完全权限」字样：把原文里的旧名字整段换成新名字
           * （新名字为空时就是换回原名，所以这条分支要一直跑，不能只在改名时跑）。
           */
          if (typeof originalFull === 'string' && originalFull !== '') {
            for (var c = 0; c < PERMISSION_CONFIRM_KEYS.length; c++) {
              if (PERMISSION_CONFIRM_KEYS[c][0] !== ns) continue;
              var ckey = PERMISSION_CONFIRM_KEYS[c][1];
              var original = rememberPermissionOriginal(ns, localeKey, entries, ckey).value;
              if (typeof original !== 'string') continue;
              write(ns, localeKey, entries, ckey, original.split(originalFull).join(effectiveFull));
            }
          }
        });
      }

      if (changed && notify !== false && !permissionEditingNow()) publishLocale();
    }

    /**
     * 是不是正停在本插件的输入框里打字。是的话先别推 publish ——
     * 每次按键都让全局重渲染既浪费，也可能打断输入法/丢焦点。
     * （文案本身不丢：下次渲染读到的就是新值，失焦时我们还会补推一次。）
     */
    function permissionEditingNow() {
      try {
        var el = document.activeElement;
        return !!(el && typeof el.className === 'string' && el.className.indexOf('dsha-brand-input') !== -1);
      } catch (err) {
        return false;
      }
    }

    /** 推一次 locale 快照，让用 t() 的组件当场重渲染（尽力而为）。 */
    function publishLocale() {
      try {
        var locale = localeService;
        if (locale && typeof locale.publish === 'function' && locale.snapshot) {
          locale.publish(locale.snapshot.active, false);
        }
      } catch (err) {
        /* 私有入口不可用时无所谓：下次渲染同样会读到新文案。 */
      }
    }

    //#endregion

    //#region C4. 新模式开关（工作模式 / 纯文本对话模式）

    /**
     * Hero 里那个两档滑块：左 = 工作模式（standard 预设），右 = 纯文本对话模式（chat 预设）。
     *
     * 位置在标题（含下方英文副标题）的正下方 —— 那个位置没有槽位，所以照老规矩自己插 DOM。
     * 切换走 DSH 自己的 RPC（`remote.agentPresets.select`），和界面里原生那个下拉同一通道：
     * 只有**空白会话**才切得动；一旦发过消息，会话不再是 blank，滑块也就随 Hero 一起消失
     * —— "输入提示词之后即刻固定" 是 DSH 的原生行为，不需要我们额外加锁。
     */
    var MODE_DEFS = [
      /* `hidden: true` = **认得但不渲染**。工作模式（原 DSH）不再出现在滑块上，
         但它必须是"已知档位"：它仍是 MODE_DEFAULT_ID，也是 MODE_PLACEHOLDER_MODE_IDS
         的一员。直接删掉的话，碰到一个 standard 会话时 modeDef() 会返回 null，
         滑块就会指错一格 —— 那比不显示更糟。 */
      { id: 'standard', key: 'work', zh: '工作模式', en: 'Work', note: '原DSH及其功能', hidden: true },
      { id: 'chat', key: 'chat', zh: '纯文本对话模式', en: 'Plain chat', note: '与昔涟对话' },
      { id: 'cyrene-work', key: 'cyreneWork', zh: '昔涟工作模式', en: 'Cyrene work', note: '昔涟人设 + 全套工具' }
    ];
    /** 真正渲染出来的档位（渲染 / 循环 / 停位序号一律用它，不要用 MODE_DEFS）。 */
    var MODE_ITEMS = (function () {
      var out = [];
      for (var i = 0; i < MODE_DEFS.length; i++) if (MODE_DEFS[i].hidden !== true) out.push(MODE_DEFS[i]);
      return out;
    })();
    var MODE_SWITCH_CLASS = 'dsha-mode-switch';
    var MODE_DEFAULT_ID = 'standard';
    /** 会话 / RPC 服务（由 ctx.inject 提供；拿不到时滑块不渲染）。 */
    var modeServices = null;
    /** 0.2.x 的当前会话在工作区里（sessions 快照不再带 current）。可选服务。 */
    var workspaceRef = null;
    /** 已经选好、但会话还没出现时先记着。 */
    var stagedMode = null;

    function modeDef(id) {
      for (var i = 0; i < MODE_DEFS.length; i++) if (MODE_DEFS[i].id === id) return MODE_DEFS[i];
      return null;
    }

    /**
     * 某一档在**可见档位**里的序号（0 起）。滑块停位与"点轨道前进一档"都靠它。
     * 返回 -1 表示这一档被隐藏了（或认不出来）—— 调用方据此把滑块放到原位。
     */
    function modeIndex(id) {
      for (var i = 0; i < MODE_ITEMS.length; i++) if (MODE_ITEMS[i].id === id) return i;
      return -1;
    }

    function modeSessions() {
      return modeServices === null ? null : modeServices.sessions;
    }

    function modeRemote() {
      return modeServices === null ? null : modeServices.remote;
    }

    /**
     * 当前会话（没会话就 undefined）。
     *
     * 0.1.x 的快照上有 `current`；0.2.x 把快照改成了 `{ids, byId, phase, ...}`，
     * 当前会话由工作区持有（`uiWorkspace.mainReference.sessionId`）。两个都兼容：
     * 先认 `current`，再问工作区，最后退到「最近更新的空白会话」（Hero 页就是它）。
     */
    function modeCurrentSession() {
      try {
        var list = modeSessions();
        var snapshot = list && list.list ? list.list.getSnapshot() : null;
        if (!snapshot || !snapshot.byId) return undefined;
        var id;
        if (snapshot.current !== undefined && snapshot.current !== null) {
          id = snapshot.current;
        } else if (workspaceRef && workspaceRef.mainReference && workspaceRef.mainReference.sessionId) {
          id = workspaceRef.mainReference.sessionId;
        } else {
          var ids = Array.isArray(snapshot.ids) ? snapshot.ids : Object.keys(snapshot.byId);
          var best = null;
          for (var i = 0; i < ids.length; i++) {
            var item = snapshot.byId[ids[i]];
            if (!item || item.blank !== true) continue;
            if (best === null || (item.updatedAt || 0) > (best.updatedAt || 0)) best = item;
          }
          if (best !== null) return best;
        }
        if (id === undefined) return undefined;
        return snapshot.byId[id];
      } catch (err) {
        return undefined;
      }
    }

    function presetIdOf(session) {
      try {
        return session && session.projectionValues ? session.projectionValues.agentPreset : undefined;
      } catch (err) {
        return undefined;
      }
    }

    /** 滑块该停在哪一档。 */
    function currentModeId() {
      if (stagedMode !== null) return stagedMode;
      var id = presetIdOf(modeCurrentSession());
      return modeDef(id) !== null ? id : MODE_DEFAULT_ID;
    }

    /**
     * 把暂存的选择交给当前会话（照抄原生 seat 的逻辑）：
     * 没有会话就先记着，等会话出现再应用；会话已有内容就不动（锁定）。
     */
    function applyMode() {
      var staged = stagedMode;
      if (staged === null) return;
      var session = modeCurrentSession();
      if (session === undefined) return;
      if (session.blank !== true || presetIdOf(session) === staged) {
        stagedMode = null;
        refreshModeUi();
        return;
      }
      var remote = modeRemote();
      var select = remote && remote.agentPresets ? remote.agentPresets.select : null;
      if (typeof select !== 'function') return;
      stagedMode = null;
      try {
        Promise.resolve(select(session.id, staged)).then(function (result) {
          if (result && result.ok === false) {
            var reason = result.error && (result.error.details && result.error.details.reason || result.error.message);
            toast(reason ? '切换失败：' + reason : '切换失败');
          }
          refreshModeUi();
        }).catch(function (err) {
          toast('切换失败：' + String((err && err.message) || err));
          refreshModeUi();
        });
      } catch (err) {
        toast('切换失败：' + String((err && err.message) || err));
        refreshModeUi();
      }
    }

    /** 用户点了某一档。 */
    function pickMode(id) {
      if (modeDef(id) === null) return;
      stagedMode = id;
      refreshModeUi();
      applyMode();
    }

    /**
     * 把某一档的「选中态 + 注释显隐」一并落到 DOM。
     *
     * 注释只在被指向的那一档显示，所以这两件事必须同时更新 —— 分开写必然漏一处。
     * 显隐走行内 display 而不是样式表：热替换时样式表可能来不及更新（本文件既有约定）。
     */
    function paintModeOption(option, on) {
      option.className = on ? 'dsha-mode-opt on' : 'dsha-mode-opt';
      var note = option.querySelector('.note');
      if (note) note.style.display = on ? '' : 'none';
    }

    /**
     * 模式变了：滑块与输入框提示一起刷。
     *
     * ⚠️ 提示文案必须在这里**显式**刷一次，不能指望 MutationObserver：
     *    切模式改的是 agent preset，输入框节点多半原样保留 —— 不吃 DOM 变更，
     *    观察者不会因此触发，灰字就会停在旧模式的文案上。
     */
    function refreshModeUi() {
      renderModeSwitch();
      patchComposerPlaceholder();
    }

    /**
     * 把一个已经存在的滑块刷成当前档位。
     *
     * 三件事必须一起做：选中态、注释显隐、**滑块位置**。
     * 位置走 `data-mode` 属性而不是 class 拼接 —— 档位是枚举，属性比
     * 「逐个 class 增删」更不容易漏，CSS 侧也只用写三条停位。
     */
    function paintModeSwitch(root) {
      var active = currentModeId();
      var options = root.querySelectorAll('[data-dsha-mode]');
      for (var i = 0; i < options.length; i++) {
        paintModeOption(options[i], options[i].getAttribute('data-dsha-mode') === active);
      }
      /* 当前档被隐藏时（比如会话本来就是「工作模式」），那就不该有任何一个标签
         是选中态 —— 上一步自然不会命中。滑块位置落成 __none，CSS 没有这条规则，
         于是停在轨道原位，既不冒充第 1 档，也不乱跳。 */
      var at = modeIndex(active);
      root.setAttribute('data-mode', at < 0 ? '__none' : active);
      var track = root.querySelector('.dsha-mode-track');
      if (track) {
        track.setAttribute('aria-valuenow', at < 0 ? '0' : String(at + 1));
        track.setAttribute('aria-valuetext', at < 0 ? '未在此滑块中列出' : (modeDef(active) || {}).zh || active);
      }
    }

    /** 画（或刷新）那个滑块；已经存在就只更新选中态。 */
    function renderModeSwitch() {
      var root = document.querySelector('.' + MODE_SWITCH_CLASS);
      if (!root) return;
      paintModeSwitch(root);
    }

    function buildModeSwitch() {
      var root = document.createElement('div');
      root.className = MODE_SWITCH_CLASS;

      function label(def) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'dsha-mode-opt';
        button.setAttribute('data-dsha-mode', def.id);
        button.setAttribute('aria-label', def.zh + ' / ' + def.en);
        var zh = document.createElement('span');
        zh.className = 'zh';
        zh.textContent = def.zh;
        var en = document.createElement('span');
        en.className = 'en';
        en.textContent = def.en;
        button.appendChild(zh);
        button.appendChild(en);
        /* 第三行：模式注释（如「与昔涟对话」）。缺省时不渲染，保持向后兼容。
           初始隐藏；只有被指向的那一档，才由 paintModeOption 打开显示。 */
        if (def.note) {
          var note = document.createElement('span');
          note.className = 'note';
          note.textContent = def.note;
          note.style.display = 'none';
          button.appendChild(note);
        }
        button.addEventListener('click', function () { pickMode(def.id); });
        return button;
      }

      /* 可见档位并排，顺序即 MODE_ITEMS 的顺序 —— 不按索引写死，加档只改 MODE_DEFS。 */
      var row = document.createElement('div');
      row.className = 'dsha-mode-opts';
      for (var n = 0; n < MODE_ITEMS.length; n++) row.appendChild(label(MODE_ITEMS[n]));
      root.appendChild(row);

      /* 轨道：可见档位之间的滑块。点一下前进一档，到底回到第一档。
         逐档前进而不是二态互翻 —— 二态时代那一行 `chat ? standard : chat`
         在多档下会永远在头两档之间打转，后面的档点不到。

         当前档被隐藏（modeIndex 返回 -1）时，(at + 1) % len 正好是 0，
         也就是"先落到第 1 档"—— 这里**不要**再加 at < 0 的兜底，
         加了反而会跳到第 2 档。 */
      var track = document.createElement('span');
      track.className = 'dsha-mode-track';
      track.setAttribute('role', 'slider');
      track.setAttribute('aria-valuemin', '1');
      track.setAttribute('aria-valuemax', String(MODE_ITEMS.length));
      var knob = document.createElement('span');
      knob.className = 'dsha-mode-knob';
      track.appendChild(knob);
      track.addEventListener('click', function () {
        pickMode(MODE_ITEMS[(modeIndex(currentModeId()) + 1) % MODE_ITEMS.length].id);
      });
      root.appendChild(track);

      paintModeSwitch(root);
      return root;
    }

    /**
     * 保证滑块挂在 Hero 标题块的正下方。
     * 只认得出 Hero 时才插；离开 Hero（比如已经在对话里）时把它摘掉。
     */
    function patchModeSwitch() {
      var groups = document.querySelectorAll('[class*="titleGroup"]');
      var host = null;
      if (modeServices !== null && groups.length > 0 && groups[0].parentElement) host = groups[0].parentElement;
      var root = document.querySelector('.' + MODE_SWITCH_CLASS);
      if (host === null) {
        if (root && root.parentElement) root.parentElement.removeChild(root);
        return;
      }
      if (!root) {
        root = buildModeSwitch();
        var parent = host.parentElement;
        if (parent) parent.insertBefore(root, host.nextSibling);
        return;
      }
      if (root.parentElement !== host.parentElement || root.previousSibling !== host) {
        var parent2 = host.parentElement;
        if (parent2) parent2.insertBefore(root, host.nextSibling);
      }
      renderModeSwitch();
    }

    //#endregion

    //#region 表达风格按钮（按会话，数据由 dsh-cyrene 的 style.js 消费）

    /**
     * 在新会话页（hero）里，把风格按钮插到原生「会话预设」chip 的**右边**。
     *
     * 为什么不注册插槽：`conversation.hero.agentPreset` 是 `kind: "single"`，
     * 已经被原生 chip 占住了，同一个槽不能再往里加东西。原生 chip 自带稳定锚点
     * `data-dsha-agent-preset="home"`（页头那枚是 `header`），所以插它后面是可靠的
     * —— 不依赖任何 hash 过的 class 名。
     *
     * 数据走 `/cyrene-style-api`：浏览器碰不到文件系统，档位存在
     * `<DSH_HOME>/cyrene-style.json`，由 dsh-cyrene 的 style.js 读取生效。
     */
    var STYLE_API = '/cyrene-style-api';
    var STYLE_CHIP_CLASS = 'dsha-style-chip';
    var STYLE_MENU_CLASS = 'dsha-style-menu';

    var styleInfo = { loaded: false, failed: false, session: '', style: '', styles: [] };
    var styleMenu = null;

    /** 当前会话 id（没有会话就空串）。 */
    function styleSessionId() {
      var session = modeCurrentSession();
      return session && typeof session.id === 'string' ? session.id : '';
    }

    /** 档位 id → 人读的名字。 */
    function styleLabelOf(id) {
      for (var i = 0; i < styleInfo.styles.length; i++) {
        if (styleInfo.styles[i].id === id) return styleInfo.styles[i].label;
      }
      return '默认';
    }

    /** 拉一次档位与当前值（失败就藏起按钮，不显示"点不动的假按钮"）。 */
    function loadStyleInfo(force) {
      if (!hostEnabled) return;
      if (!force && styleInfo.loaded) return;
      var session = styleSessionId();
      var url = STYLE_API + (session === '' ? '' : '?session=' + encodeURIComponent(session));
      fetch(url, { headers: { accept: 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error((data && data.error) || 'bad payload');
          styleInfo.loaded = true;
          styleInfo.failed = false;
          styleInfo.session = data.session || '';
          styleInfo.style = data.style || 'default';
          styleInfo.styles = Array.isArray(data.styles) ? data.styles : [];
          patchStyleChip();
        })
        .catch(function () {
          styleInfo.failed = true;
          patchStyleChip();
        });
    }

    function closeStyleMenu() {
      if (styleMenu && styleMenu.parentElement) styleMenu.parentElement.removeChild(styleMenu);
      styleMenu = null;
      var chip = document.querySelector('.' + STYLE_CHIP_CLASS);
      if (chip) chip.setAttribute('aria-expanded', 'false');
    }

    /** 选一档：有会话就写该会话，没有就写全局兜底档。 */
    function chooseStyle(id) {
      closeStyleMenu();
      if (!hostEnabled) return;
      var session = styleSessionId();
      /*
       * 0.2.x 会在开始对话时换掉 blank 会话的 id，只写 per-session 会落到
       * 一个随后消失的 id 上，当前会话就退回 cyrene-style.json 的 default
       * （这台机器的 default 是 custom → 满屏 ♡）。
       * 所以 blank Hero 里选档时**同时写全局兜底档**：
       * 新会话一定拿得到，没写过的旧会话也会立刻跟着变。
       */
      var current = modeCurrentSession();
      var blank = current && current.blank === true;
      var body = (session === '' || blank)
        ? { defaultStyle: id }
        : { session: session, style: id };
      fetch(STYLE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error((data && data.error) || 'bad payload');
          styleInfo.loaded = true;
          styleInfo.failed = false;
          styleInfo.style = data.style || id;
          if (Array.isArray(data.styles)) styleInfo.styles = data.styles;
          patchStyleChip();
        })
        .catch(function () {
          styleInfo.failed = true;
          patchStyleChip();
        });
    }

    function openStyleMenu(anchor) {
      closeStyleMenu();
      var rect = anchor.getBoundingClientRect();
      var menu = document.createElement('div');
      menu.className = STYLE_MENU_CLASS;
      menu.setAttribute('role', 'menu');
      menu.style.left = Math.max(8, rect.left) + 'px';
      menu.style.top = (rect.bottom + 6) + 'px';
      for (var i = 0; i < styleInfo.styles.length; i++) {
        (function (item) {
          var on = item.id === styleInfo.style;
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'dsha-style-item' + (on ? ' on' : '');
          button.setAttribute('role', 'menuitemradio');
          button.setAttribute('aria-checked', on ? 'true' : 'false');
          var name = document.createElement('span');
          name.textContent = item.label;
          button.appendChild(name);
          var temp = document.createElement('span');
          temp.className = 'temp';
          temp.textContent = typeof item.temperature === 'number'
            ? item.temperature.toFixed(2)
            : '模型默认';
          button.appendChild(temp);
          button.addEventListener('click', function (event) {
            event.stopPropagation();
            chooseStyle(item.id);
          });
          menu.appendChild(button);
        })(styleInfo.styles[i]);
      }
      document.body.appendChild(menu);
      styleMenu = menu;
      anchor.setAttribute('aria-expanded', 'true');
    }

    function buildStyleChip() {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = STYLE_CHIP_CLASS;
      chip.setAttribute('aria-haspopup', 'menu');
      chip.setAttribute('aria-expanded', 'false');
      chip.addEventListener('click', function (event) {
        event.stopPropagation();
        if (styleMenu) { closeStyleMenu(); return; }
        if (!styleInfo.loaded) { loadStyleInfo(false); return; }
        openStyleMenu(chip);
      });
      return chip;
    }

    function renderStyleChip(chip) {
      var label = styleInfo.loaded ? '风格 · ' + styleLabelOf(styleInfo.style) : '风格…';
      if (chip.textContent !== label) chip.textContent = label;
      chip.title = '表达风格（按会话）：点开选择';
    }

    /** 每次 DOM 变动后对齐一次：位置不对就搬回去，没有 Hero 就摘掉。 */
    /**
     * 风格按钮挂在哪：0.1.x 是原生 chip 自带的 data-dsha-agent-preset，
     * 0.2.x 换成了槽位容器 data-slot="conversation.hero.agentPreset"；
     * 都没有就退到模式滑块旁边（至少不会消失）。
     */
    function styleChipAnchor() {
      return document.querySelector('[data-dsha-agent-preset="home"]')
        || document.querySelector('[data-slot="conversation.hero.agentPreset"]')
        || document.querySelector('.' + MODE_SWITCH_CLASS);
    }

    function patchStyleChip() {
      var anchor = styleChipAnchor();
      var chip = document.querySelector('.' + STYLE_CHIP_CLASS);
      /* 工作模式里不显示这个按钮：那个预设根本没挂风格插件（上游 work/code 也不用
         风格），显示出来只会让人白点。工作模式禁用风格是刻意的安全约定 —— 带
         shell / 文件权限的模式不该被写作风格牵着走。与服务端 style.js 的
         DISABLED_PRESETS 保持一致。 */
      var disabled = presetIdOf(modeCurrentSession()) === 'cyrene-work';
      if (!anchor || !anchor.parentElement || styleInfo.failed || disabled) {
        if (chip && chip.parentElement) chip.parentElement.removeChild(chip);
        if (styleMenu) closeStyleMenu();
        return;
      }
      if (!chip) {
        chip = buildStyleChip();
        anchor.parentElement.insertBefore(chip, anchor.nextSibling);
        loadStyleInfo(false);
      } else if (chip.previousSibling !== anchor) {
        anchor.parentElement.insertBefore(chip, anchor.nextSibling);
      }
      renderStyleChip(chip);
    }

    /* 点空白处 / 按 Esc 收菜单。只挂一次。 */
    document.addEventListener('click', function () { closeStyleMenu(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeStyleMenu();
    });

    //#endregion

    //#region 页面补丁调度

    var domObserver = null;
    var domFramePending = false;

    function patchDom() {
      patchHero();
      patchComposerPlaceholder();
      patchStatsLabels();
      patchSidebarLabels();
      patchModeSwitch();
      patchStyleChip();
    }

    /** 先补一次，再挂观察者兜住 React 的重建。 */
    function watchDom() {
      patchDom();
      if (domObserver || typeof MutationObserver === 'undefined') return;
      domObserver = new MutationObserver(function () {
        if (domFramePending) return;
        domFramePending = true;
        var schedule = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : function (fn) { return setTimeout(fn, 16); };
        schedule(function () {
          domFramePending = false;
          patchDom();
        });
      });
      /* 也观察 characterData：状态行的数字 / 百分比是 React 直接改文本节点更新的
         （childList 不变），不看着它就会漏掉。重复触发是安全的 —— 我们的写入是
         幂等的，第二次跑不会再有改动。 */
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    //#endregion

    //#region D. 设置行

    /* 样式值照官方 EnterBehaviorRow / modalInput 的 CSS 复刻，保证观感一致。 */
    var rowStyle = {
      borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
      padding: '16px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: 0
    };
    var rowTextStyle = { display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 };
    var rowTextBodyStyle = { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: '1 1 auto' };
    var titleStyle = {
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: '22px'
    };
    var descStyle = {
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: '18px'
    };
    var controlRowStyle = { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 };
    var fieldLabelStyle = {
      flex: 'none',
      width: '68px',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '12px',
      lineHeight: '18px'
    };
    var inputStyle = {
      boxSizing: 'border-box',
      flex: '1 1 auto',
      minWidth: 0,
      height: '36px',
      color: 'var(--dsw-alias-label-primary)',
      background: 'transparent',
      border: '0.5px solid var(--dsw-alias-border-l4)',
      borderRadius: '18px',
      outline: 'none',
      padding: '6px 12px',
      font: 'inherit',
      fontSize: '13px',
      fontWeight: 400,
      lineHeight: '20px'
    };
    var pillStyle = {
      flex: 'none',
      background: 'var(--dsw-alias-bg-module-platform)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '13px',
      lineHeight: '20px',
      cursor: 'pointer',
      border: 'none',
      borderRadius: '14px',
      padding: '5px 14px',
      whiteSpace: 'nowrap'
    };
    /** 选中的那一颗「选取方式」按钮。 */
    var pillActiveStyle = {
      background: 'var(--dsw-alias-button-primary-fill)',
      color: 'var(--dsw-alias-label-primary-foreground)'
    };
    /** 条目右侧的「删除」小按钮：比主按钮窄一档。 */
    var removeButtonStyle = Object.assign({}, pillStyle, {
      padding: '5px 10px',
      fontSize: '12px',
      color: 'var(--dsw-alias-label-tertiary)'
    });
    /** 输入框左侧的序号。 */
    var indexStyle = {
      flex: 'none',
      width: '16px',
      textAlign: 'right',
      color: 'var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary))',
      fontSize: '12px',
      lineHeight: '18px'
    };
    /** 占满整行的辅助说明（选取方式提示、空列表提示）。 */
    var noteStyle = Object.assign({}, descStyle, { minWidth: 0 });
    /** 出问题时的说明：同样一块地方，换暖色，别让人漏看。 */
    var noteWarnStyle = Object.assign({}, noteStyle, { color: 'var(--dsw-color-warning, #d9902f)' });
    /** 权限名称那一行：标签最长 6 个字（工作区内修改），比通用标签宽一点。 */
    var permissionLabelStyle = Object.assign({}, fieldLabelStyle, { width: '84px' });

    /** 标题列表里的一条：中文一行 + 英文一行，所以自己是个纵向小格。 */
    var headlineRowStyle = { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 };
    /** 英文输入框：比中文那行矮一点、字号小一点，一眼分得出主次。 */
    var enInputStyle = Object.assign({}, inputStyle, {
      height: '30px',
      fontSize: '12px',
      lineHeight: '18px',
      borderRadius: '15px'
    });
    /** 小标题（「英文行的大小与位置」）。 */
    var sectionTitleStyle = {
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: '18px',
      marginTop: '2px'
    };
    /* 滑杆三件套，照官方 / dsha-hero-mascot 的观感复刻。 */
    var sliderRowStyle = { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 };
    var sliderLabelStyle = {
      flex: 'none',
      width: '48px',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '12px',
      lineHeight: '18px'
    };
    var sliderStyle = {
      flex: '1 1 auto',
      minWidth: 0,
      accentColor: 'var(--dsw-alias-state-business-primary)'
    };
    var sliderValueStyle = {
      flex: 'none',
      width: '52px',
      textAlign: 'right',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '12px',
      lineHeight: '18px',
      fontVariantNumeric: 'tabular-nums'
    };

    /**
     * 设置行：逐条自定义各会话状态的输入框提示文案。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function PlaceholderSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      var opened = react.useState(true);
      var open = opened[0];
      var setOpen = opened[1];

      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('placeholder.title')),
            react.createElement('div', { style: descStyle }, t('placeholder.description'))
          ),
          react.createElement('button', {
            type: 'button',
            style: pillStyle,
            'aria-expanded': open,
            onClick: function () { setOpen(!open); }
          }, open ? t('common.collapse') : t('common.expand'))
        )
      ];

      if (open) {
        var ens = view.placeholderEns && typeof view.placeholderEns === 'object' ? view.placeholderEns : {};

        /**
         * 生成「某个模式的某个状态」那一行输入。
         *
         * 值走 state.placeholderByMode / placeholderEnByMode；空串表示该模式不单独设，
         * 运行时回落到上面那条通用文案。中英各调一次，形状与通用那两行保持一致。
         */
        function modeFieldRow(modeId, modeLabel, key, isEn) {
          var table = (isEn ? view.placeholderEnByMode : view.placeholderByMode) || {};
          return react.createElement(
            'div',
            { key: key + '-' + modeId + (isEn ? '-en' : ''), style: controlRowStyle },
            react.createElement('span', { style: isEn ? indexStyle : fieldLabelStyle }, isEn ? 'EN' : modeLabel),
            react.createElement('input', {
              type: 'text',
              className: 'dsha-brand-input',
              style: isEn ? enInputStyle : inputStyle,
              value: ((table[modeId] || {})[key]) || '',
              maxLength: PLACEHOLDER_MAX,
              placeholder: isEn ? t('placeholder.enHint') : t('default.' + key),
              'aria-label': (isEn ? t('placeholderEn.aria') + ' ' : '') + t('label.' + key) + ' · ' + modeLabel,
              onFocus: function () { peekStart(false); },
              onBlur: peekEnd,
              onChange: (function (mode, k, en) {
                return function (event) {
                  var field = en ? 'placeholderEnByMode' : 'placeholderByMode';
                  var next = normalizeModePlaceholders(state[field]);
                  next[mode][k] = event.target.value;
                  var patch = {};
                  patch[field] = next;
                  update(patch);
                };
              })(modeId, key, isEn)
            })
          );
        }

        for (var i = 0; i < PLACEHOLDER_DEFS.length; i++) {
          var def = PLACEHOLDER_DEFS[i];
          children.push(react.createElement(
            'div',
            { key: def.key, style: headlineRowStyle },
            react.createElement(
              'div',
              { style: controlRowStyle },
              react.createElement('span', { style: fieldLabelStyle }, t('label.' + def.key)),
              react.createElement('input', {
                type: 'text',
                className: 'dsha-brand-input',
                style: inputStyle,
                value: view.placeholders[def.key] || '',
                maxLength: PLACEHOLDER_MAX,
                /* 灰字提示直接显示该状态的系统默认，看得见默认长什么样。 */
                placeholder: t('default.' + def.key),
                'aria-label': t('label.' + def.key),
                onFocus: function () { peekStart(false); },
                onBlur: peekEnd,
                onChange: (function (key) {
                  return function (event) {
                    var next = Object.assign({}, state.placeholders);
                    next[key] = event.target.value;
                    update({ placeholders: next });
                  };
                })(def.key)
              })
            ),
            /* 英文那半：拼在中文后面同一行显示 */
            react.createElement(
              'div',
              { style: controlRowStyle },
              react.createElement('span', { style: indexStyle }, 'EN'),
              react.createElement('input', {
                type: 'text',
                className: 'dsha-brand-input',
                style: enInputStyle,
                value: ens[def.key] || '',
                maxLength: PLACEHOLDER_MAX,
                placeholder: t('placeholder.enHint'),
                'aria-label': t('placeholderEn.aria') + ' ' + t('label.' + def.key),
                onFocus: function () { peekStart(false); },
                onBlur: peekEnd,
                onChange: (function (key) {
                  return function (event) {
                    var next = Object.assign({}, state.placeholderEns);
                    next[key] = event.target.value;
                    update({ placeholderEns: next });
                  };
                })(def.key)
              })
            )
          ));

          /* 支持按模式区分的状态（hero / default）：再补每个模式一行中文 + 一行 EN。
             表里是空串时运行时回落到上面那条通用文案，所以这里的留空是"不覆盖"。 */
          if (MODE_PLACEHOLDER_KEYS.indexOf(def.key) !== -1) {
            for (var m = 0; m < MODE_DEFS.length; m++) {
              var md = MODE_DEFS[m];
              if (MODE_PLACEHOLDER_MODE_IDS.indexOf(md.id) === -1) continue;
              children.push(modeFieldRow(md.id, md.zh, def.key, false));
              children.push(modeFieldRow(md.id, md.zh, def.key, true));
            }
          }
        }
        children.push(react.createElement(
          'button',
          {
            key: 'reset',
            type: 'button',
            style: Object.assign({}, pillStyle, { alignSelf: 'flex-start' }),
            onClick: function () {
              update({ placeholders: emptyPlaceholders(), placeholderEns: emptyPlaceholders() });
            }
          },
          t('common.reset')
        ));
      }

      return react.createElement('div', { style: rowStyle }, children);
    }

    /**
     * 设置行：底部状态行三个单位的英文（轮 / 步 / 缓存命中）。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function StatsLabelSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      var values = view.statsLabels || {};

      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('stats.title')),
            react.createElement('div', { style: descStyle }, t('stats.description'))
          )
        )
      ];
      for (var i = 0; i < STATS_LABEL_DEFS.length; i++) {
        var def = STATS_LABEL_DEFS[i];
        children.push(react.createElement(
          'div',
          { key: def.key, style: controlRowStyle },
          react.createElement('span', { style: permissionLabelStyle }, def.zh),
          react.createElement('input', {
            type: 'text',
            className: 'dsha-brand-input',
            style: inputStyle,
            value: values[def.key] || '',
            maxLength: STATS_LABEL_MAX,
            placeholder: STATS_LABEL_DEFAULTS[def.key],
            'aria-label': t('stats.title') + ': ' + def.zh,
            onChange: (function (key) {
              return function (event) {
                var next = Object.assign({}, values);
                next[key] = event.target.value;
                update({ statsLabels: next });
              };
            })(def.key)
          })
        ));
      }
      children.push(react.createElement(
        'div',
        { key: 'actions', style: controlRowStyle },
        react.createElement('button', {
          key: 'reset',
          type: 'button',
          style: pillStyle,
          onClick: function () { update({ statsLabels: Object.assign({}, STATS_LABEL_DEFAULTS) }); }
        }, t('common.reset')),
        react.createElement('span', { key: 'hint', style: noteStyle }, t('stats.hint'))
      ));

      return react.createElement('div', { className: PANEL_ROW_CLASS, style: rowStyle }, children);
    }

    /**
     * 设置行：侧栏两个标签的英文后缀（设置 / 美化）。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    /**
     * 设置 → 通用：「表达风格 · 强度档」这一行。
     *
     * 硬开关：档位存在 `<DSH_HOME>/cyrene-style.json` 的 `customTier`，由 style.js
     * 在注入时写死授权标记 —— 模型看到的是确定事实，不用去猜"用户有没有点头"。
     * 只对 custom 档有意义，所以显示里带上该档当前的名字（可能是用户改过的）。
     */
    function TierSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var pair = react.useState({ status: 'loading', tier: 1, label: '自定义', error: '' });
      var view = pair[0];
      var setView = pair[1];
      var savingPair = react.useState(false);
      var saving = savingPair[0];
      var setSaving = savingPair[1];

      function load() {
        fetch('/cyrene-style-api', { headers: { accept: 'application/json' } })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data || data.ok !== true) throw new Error((data && data.error) || 'bad payload');
            var label = '自定义';
            var list = Array.isArray(data.styles) ? data.styles : [];
            for (var i = 0; i < list.length; i++) if (list[i].id === 'custom') label = list[i].label;
            setView({ status: 'ready', tier: data.customTier === 2 ? 2 : 1, label: label, error: '' });
          })
          .catch(function (err) {
            setView({ status: 'error', tier: 1, label: '自定义', error: String((err && err.message) || err) });
          });
      }

      react.useEffect(function () { load(); }, []);

      function pick(tier) {
        if (saving || view.tier === tier) return;
        setSaving(true);
        fetch('/cyrene-style-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ customTier: tier })
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data || data.ok !== true) throw new Error((data && data.error) || 'bad payload');
            setView(function (prev) {
              return { status: 'ready', tier: tier, label: prev.label, error: '' };
            });
          })
          .catch(function (err) {
            setView(function (prev) {
              return { status: prev.status === 'loading' ? 'error' : 'ready', tier: prev.tier, label: prev.label, error: String((err && err.message) || err) };
            });
          })
          .then(function () { setSaving(false); });
      }

      function pill(tier) {
        var on = view.tier === tier;
        return {
          padding: '4px 12px',
          borderRadius: '999px',
          border: '0',
          cursor: saving ? 'progress' : 'pointer',
          font: 'inherit',
          fontSize: '12px',
          lineHeight: '16px',
          color: on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          background: on ? 'var(--dsw-alias-bg-module-platform)' : 'transparent',
          boxShadow: on ? 'inset 0 0 0 .5px var(--dsw-alias-border-l4)' : 'inset 0 0 0 .5px transparent',
          opacity: saving ? 0.6 : 1
        };
      }

      var head = react.createElement(
        'div',
        { style: rowTextStyle },
        react.createElement(
          'div',
          { style: rowTextBodyStyle },
          react.createElement('div', { style: titleStyle }, '表达风格 · 强度档'),
          react.createElement(
            'div',
            { style: descStyle },
            view.status === 'loading'
              ? '读取中…'
              : '只影响「' + view.label + '」这一档。第一档：独占用「记得」表达，不带威胁。'
                + '第二档：更直接、更冷的占有（可以说压迫感台词），仍然守底线。'
          ),
          view.error !== ''
            ? react.createElement('div', { style: Object.assign({}, descStyle, { color: 'var(--dsw-alias-label-error, #d9534f)' }) }, '操作失败：' + view.error)
            : null
        )
      );

      var controls = react.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        react.createElement(
          'div',
          { style: { display: 'flex', gap: '6px' } },
          react.createElement('button', { type: 'button', style: pill(1), onClick: function () { pick(1); } }, '第一档（默认）'),
          react.createElement('button', { type: 'button', style: pill(2), onClick: function () { pick(2); } }, '第二档')
        ),
        react.createElement(
          'div',
          { style: Object.assign({}, descStyle, { fontSize: '11px' }) },
          '开关只写状态，模型看到的是插件写死的授权标记'
        )
      );

      return react.createElement('div', { style: controlRowStyle }, head, controls);
    }

    function SidebarLabelSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      var values = view.sidebarLabels || {};

      var rows = [
        { key: 'settings', label: t('sidebar.settings') },
        { key: 'beautify', label: t('sidebar.beautify') }
      ];
      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('sidebar.title')),
            react.createElement('div', { style: descStyle }, t('sidebar.description'))
          )
        )
      ];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        children.push(react.createElement(
          'div',
          { key: row.key, style: controlRowStyle },
          react.createElement('span', { style: fieldLabelStyle }, row.label),
          react.createElement('input', {
            type: 'text',
            className: 'dsha-brand-input',
            style: inputStyle,
            value: values[row.key] || '',
            maxLength: SIDEBAR_LABEL_MAX,
            placeholder: SIDEBAR_LABEL_DEFAULTS[row.key],
            'aria-label': t('sidebar.title') + ': ' + row.label,
            onChange: (function (key) {
              return function (event) {
                var next = Object.assign({}, values);
                next[key] = event.target.value;
                update({ sidebarLabels: next });
              };
            })(row.key)
          })
        ));
      }
      children.push(react.createElement(
        'div',
        { key: 'actions', style: controlRowStyle },
        react.createElement('button', {
          key: 'reset',
          type: 'button',
          style: pillStyle,
          onClick: function () { update({ sidebarLabels: Object.assign({}, SIDEBAR_LABEL_DEFAULTS) }); }
        }, t('common.reset')),
        react.createElement('span', { key: 'hint', style: noteStyle }, t('sidebar.hint'))
      ));

      return react.createElement('div', { className: PANEL_ROW_CLASS, style: rowStyle }, children);
    }

    /**
     * 设置行：新会话 Hero 区吉祥物右侧那串文字。
     *
     * 可以保留**多条**：每条一个输入框，可增可删；每次打开新会话按
     * 「随机 / 顺序」选一条。空行不参与抽取，一条都没有则保留系统原文。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function HeadlineSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      /* 没设过时显示一行插件默认值，让人一眼看到当前实际效果。 */
      var rows = view.headlines === null ? [DEFAULT_HEADLINE] : view.headlines;
      var mode = view.headlineMode;
      /* 与中文行按序号配对的英文行（短了补空串）。 */
      var enRows = [];
      for (var r = 0; r < rows.length; r++) {
        var saved = view.headlineEns && typeof view.headlineEns[r] === 'string' ? view.headlineEns[r] : '';
        enRows.push(saved);
      }
      var enStyle = headlineEnStyle();
      var titleStyle = headlineStyle();
      /* 渲染时顺手同步一次面板半透明（状态变了就会重渲染，天然同步）。 */
      syncPanelDim();

      /*
       * 「添加一条」放在**列表上方**（顶部动作区）：标题多了以后列表会很长，
       * 按钮放在最底部时要先滚到底才找得到。
       */
      var addButton = react.createElement('button', {
        key: 'add',
        type: 'button',
        style: pillStyle,
        disabled: rows.length >= HEADLINE_MAX_COUNT,
        onClick: function () { update({ headlines: rows.concat(['']), headlineEns: enRows.concat(['']) }); }
      }, t('headline.add'));

      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('headline.title')),
            react.createElement('div', { style: descStyle }, t('headline.description'))
          )
        ),
        react.createElement(
          'div',
          { key: 'add-row', style: controlRowStyle },
          addButton,
          rows.length >= HEADLINE_MAX_COUNT
            ? react.createElement('span', { key: 'full', style: noteStyle }, t('headline.full'))
            : null
        ),
        /* 选取方式：随机 / 顺序 */
        react.createElement(
          'div',
          { key: 'mode', style: controlRowStyle },
          react.createElement('span', { style: fieldLabelStyle }, t('headline.mode')),
          react.createElement('button', {
            key: 'mode-random',
            type: 'button',
            style: mode === 'random' ? Object.assign({}, pillStyle, pillActiveStyle) : pillStyle,
            'aria-pressed': mode === 'random',
            onClick: function () { update({ headlineMode: 'random' }); }
          }, t('headline.mode.random')),
          react.createElement('button', {
            key: 'mode-sequence',
            type: 'button',
            style: mode === 'sequence' ? Object.assign({}, pillStyle, pillActiveStyle) : pillStyle,
            'aria-pressed': mode === 'sequence',
            onClick: function () { update({ headlineMode: 'sequence' }); }
          }, t('headline.mode.sequence'))
        ),
        react.createElement('div', { key: 'mode-hint', style: noteStyle }, t('headline.modeHint.' + mode))
      ];

      /*
       * 每一条 = 中文输入 + 删除按钮，下面再跟一行**英文**输入
       * （英文与中文按序号配对，第 i 条英文就是第 i 条中文的副标题）。
       */
      for (var i = 0; i < rows.length; i++) {
        children.push(react.createElement(
          'div',
          { key: 'row-' + i, style: headlineRowStyle },
          react.createElement(
            'div',
            { style: controlRowStyle },
            react.createElement('span', { style: indexStyle }, String(i + 1)),
            react.createElement('input', {
              type: 'text',
              className: 'dsha-brand-input',
              style: inputStyle,
              value: rows[i],
              maxLength: HEADLINE_MAX,
              placeholder: t('headline.hint'),
              'aria-label': t('headline.title') + ' ' + (i + 1),
              onChange: (function (index) {
                return function (event) {
                  var next = rows.slice();
                  next[index] = event.target.value;
                  update({ headlines: next });
                };
              })(i)
            }),
            react.createElement('button', {
              type: 'button',
              style: removeButtonStyle,
              'aria-label': t('headline.remove') + ' ' + (i + 1),
              onClick: (function (index) {
                return function () {
                  var next = rows.slice();
                  next.splice(index, 1);
                  var nextEn = enRows.slice();
                  nextEn.splice(index, 1);
                  update({ headlines: next, headlineEns: nextEn });
                };
              })(i)
            }, t('headline.remove'))
          ),
          react.createElement(
            'div',
            { style: controlRowStyle },
            react.createElement('span', { style: indexStyle }, 'EN'),
            react.createElement('input', {
              type: 'text',
              className: 'dsha-brand-input',
              style: enInputStyle,
              value: enRows[i],
              maxLength: HEADLINE_EN_MAX,
              placeholder: t('headline.enHint'),
              'aria-label': t('headlineEn.aria') + ' ' + (i + 1),
              onFocus: function () { peekStart(false); },
              onBlur: peekEnd,
              onChange: (function (index) {
                return function (event) {
                  var next = enRows.slice();
                  while (next.length <= index) next.push('');
                  next[index] = event.target.value;
                  update({ headlineEns: next });
                };
              })(i)
            })
          )
        ));
      }

      if (rows.length === 0) {
        children.push(react.createElement('div', { key: 'empty', style: noteStyle }, t('headline.empty')));
      }

      /* 设置面板半透明：拖滑杆时可以透过面板看见后面的新会话页。 */
      var dimOn = view.panelDim === true;
      var dimAlpha = Number(view.panelDimAlpha) || PANEL_ALPHA_DEFAULT;
      children.push(react.createElement(
        'div',
        { key: 'panel-dim', style: controlRowStyle },
        react.createElement('span', { style: noteStyle }, t('panelDim.label')),
        react.createElement('button', {
          key: 'panel-dim-toggle',
          type: 'button',
          style: dimOn ? Object.assign({}, pillStyle, pillActiveStyle) : pillStyle,
          'aria-pressed': dimOn,
          onClick: function () { update({ panelDim: !dimOn }); }
        }, dimOn ? t('panelDim.on') : t('panelDim.off'))
      ));
      children.push(react.createElement('div', { key: 'panel-dim-hint', style: noteStyle }, t('panelDim.hint')));
      if (dimOn) {
        children.push(react.createElement(
          'div',
          { key: 'panel-dim-alpha', style: sliderRowStyle },
          react.createElement('span', { style: sliderLabelStyle }, t('panelDim.alpha')),
          react.createElement('input', {
            type: 'range',
            min: Math.round(PANEL_ALPHA_LIMITS[0] * 100),
            max: Math.round(PANEL_ALPHA_LIMITS[1] * 100),
            step: 5,
            value: Math.round(dimAlpha * 100),
            'aria-label': t('panelDim.alpha'),
            className: 'dsha-brand-input',
            style: sliderStyle,
            onPointerDown: function () { peekStart(true); },
            onMouseDown: function () { peekStart(true); },
            onTouchStart: function () { peekStart(true); },
            onChange: function (event) {
              update({ panelDimAlpha: Number(event.target.value) / 100 });
            }
          }),
          react.createElement('span', { style: sliderValueStyle }, Math.round(dimAlpha * 100) + '%')
        ));
      }

      /*
       * 大小与位置：中文标题、英文行各三根滑杆。
       * 「中文」那组的字号没设过时显示系统当前字号（拖动即接管），显示「默认」。
       */
      function styleSliders(scope, current, labelPrefix, isTitle) {
        var out = [];
        var specs = [
          { key: 'size', label: t(labelPrefix + '.size') },
          { key: 'gap', label: t(labelPrefix + '.gap') },
          { key: 'offsetX', label: t(labelPrefix + '.offsetX') }
        ];
        var autoSize = isTitle && !(current.size > 0);
        for (var si = 0; si < specs.length; si++) {
          var spec = specs[si];
          var range = EN_STYLE_LIMITS[spec.key];
          var value = spec.key === 'size' && autoSize ? effectiveTitleSize(current) : current[spec.key];
          var shown = spec.key === 'size' && autoSize ? t('common.auto') : current[spec.key] + ' px';
          var locked = view.styleLocked === true;
          out.push(react.createElement(
            'div',
            { key: scope + '-' + spec.key, style: sliderRowStyle },
            react.createElement('span', { style: sliderLabelStyle }, spec.label),
            react.createElement('input', {
              type: 'range',
              min: range[0],
              max: range[1],
              step: 1,
              value: value,
              'aria-label': scope + ':' + spec.key,
              disabled: locked,
              className: 'dsha-brand-input',
              style: locked ? Object.assign({}, sliderStyle, { opacity: 0.4, cursor: 'not-allowed' }) : sliderStyle,
              onPointerDown: function () { peekStart(true); },
              onMouseDown: function () { peekStart(true); },
              onTouchStart: function () { peekStart(true); },
              onChange: (function (field, key) {
                return function (event) {
                  var next = Object.assign({}, field === 'headlineStyle' ? headlineStyle() : headlineEnStyle());
                  next[key] = Number(event.target.value);
                  var patch = {};
                  patch[field] = next;
                  update(patch);
                };
              })(isTitle ? 'headlineStyle' : 'headlineEnStyle', spec.key)
            }),
            react.createElement('span', { style: sliderValueStyle }, shown)
          ));
        }
        return out;
      }

      /*
       * 锁定模式：滑杆很容易在滑动设置页时被误碰，锁上之后「大小与位置」六根滑杆
       * 全部不可拖动（文字编辑、添加/删除标题不受影响 —— 那些不是误触可见的）。
       */
      var styleLocked = view.styleLocked === true;
      children.push(react.createElement(
        'div',
        { key: 'style-lock', style: controlRowStyle },
        react.createElement('button', {
          type: 'button',
          style: styleLocked ? Object.assign({}, pillStyle, pillActiveStyle) : pillStyle,
          'aria-pressed': styleLocked,
          title: t('headlineLock.hint'),
          onClick: function () { update({ styleLocked: !styleLocked }); }
        }, t('headlineLock.label') + (styleLocked ? ' ✓' : '')),
        react.createElement('span', { key: 'style-lock-note', style: noteStyle },
          styleLocked ? t('headlineLock.on') : t('headlineLock.off'))
      ));

      children.push(react.createElement('div', { key: 'title-style-title', style: sectionTitleStyle }, t('headlineStyle.title')));
      var titleSliders = styleSliders('title', titleStyle, 'headlineStyle', true);
      for (var ts = 0; ts < titleSliders.length; ts++) children.push(titleSliders[ts]);
      children.push(react.createElement('div', { key: 'title-style-hint', style: noteStyle }, t('headlineStyle.hint')));

      if (enStyle) {
        children.push(react.createElement('div', { key: 'en-style-title', style: sectionTitleStyle }, t('headlineEn.style')));
        var enSliders = styleSliders('en', enStyle, 'headlineEn', false);
        for (var es = 0; es < enSliders.length; es++) children.push(enSliders[es]);
        children.push(react.createElement(
          'div',
          { key: 'en-style-hint', style: noteStyle },
          t('headlineEn.styleHint')
        ));
      }

      children.push(react.createElement(
        'div',
        { key: 'style-reset', style: controlRowStyle },
        react.createElement('button', {
          type: 'button',
          style: pillStyle,
          onClick: function () {
            update({
              headlineStyle: { size: 0, gap: 0, offsetX: 0 },
              headlineEnStyle: { size: EN_STYLE_DEFAULTS.size, gap: EN_STYLE_DEFAULTS.gap, offsetX: EN_STYLE_DEFAULTS.offsetX }
            });
          }
        }, t('common.resetStyle'))
      ));

      /* 底部动作：只剩「恢复默认」——「添加一条」已经移到顶部动作区。 */
      children.push(react.createElement(
        'div',
        { key: 'actions', style: controlRowStyle },
        react.createElement('button', {
          key: 'reset',
          type: 'button',
          style: pillStyle,
          onClick: function () {
            update({
              headlines: null,
              headlineEns: [],
              headlineMode: 'random',
              headlineCursor: 0,
              headlineLast: ''
            });
          }
        }, t('common.reset'))
      ));

      return react.createElement('div', { className: PANEL_ROW_CLASS, style: rowStyle }, children);
    }

    /**
     * 设置行：权限预设的显示名称。
     *
     * 三个输入框分别对应「仅可查看 / 工作区内修改 / 完全权限」，灰字提示就是
     * 当前语言下的系统原文；留空 = 用原文。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function PermissionSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      var values = view.permissions || {};

      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('permission.title')),
            react.createElement('div', { style: descStyle }, t('permission.description'))
          )
        )
      ];

      for (var i = 0; i < PERMISSION_FIELDS.length; i++) {
        var field = PERMISSION_FIELDS[i];
        var fallback = defaultPermissionLabel(field);
        children.push(react.createElement(
          'div',
          { key: field.key, style: controlRowStyle },
          react.createElement('span', { style: permissionLabelStyle }, fallback),
          react.createElement('input', {
            type: 'text',
            className: 'dsha-brand-input',
            style: inputStyle,
            value: values[field.key] || '',
            maxLength: PERMISSION_MAX,
            placeholder: fallback,
            'aria-label': t('permission.title') + ': ' + fallback,
            onBlur: function () { publishLocale(); },
            onChange: (function (key) {
              return function (event) {
                var next = Object.assign({}, permissionValues());
                next[key] = event.target.value;
                update({ permissions: next });
              };
            })(field.key)
          })
        ));
      }

      children.push(react.createElement(
        'div',
        { key: 'actions', style: controlRowStyle },
        react.createElement('button', {
          key: 'reset',
          type: 'button',
          style: pillStyle,
          onClick: function () {
            var cleared = {};
            for (var j = 0; j < PERMISSION_FIELDS.length; j++) cleared[PERMISSION_FIELDS[j].key] = '';
            update({ permissions: cleared });
          }
        }, t('common.reset'))
      ));

      return react.createElement('div', { style: rowStyle }, children);
    }

    /**
     * 设置行：聊天模式里的「用户昵称」。
     *
     * 这个值不改浏览器表面，改的是系统提示词：主机半边把它注册成
     * `{{user_nickname}}`，chat 预设（昔涟人设）里那句「不要每条回复都叫…」
     * 用的就是它。所以这一行不写插件状态，而是打主机那个小接口
     * `/dsh-brand-rename-api`（浏览器碰不到主机文件系统）。
     *
     * 接口不通 = 主机半边还没加载（老版本插件或还没重启过 DSH），
     * 这时把「要重启一次」直接写在行里，免得用户以为输入没保存上。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function ChatNicknameSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var pair = react.useState({ value: '', status: 'loading', message: '', presetOk: true });
      var view = pair[0];
      var setView = pair[1];

      react.useEffect(function () {
        var alive = true;
        fetch(NICKNAME_API, { method: 'GET' })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (!alive) return;
            if (data && data.ok) {
              setView({
                value: data.nickname || '',
                status: 'ready',
                message: '',
                presetOk: data.presetUsesVariable !== false
              });
            } else {
              setView({ value: '', status: 'offline', message: t('nickname.offline'), presetOk: true });
            }
          })
          .catch(function () {
            if (alive) setView({ value: '', status: 'offline', message: t('nickname.offline'), presetOk: true });
          });
        return function () { alive = false; };
      }, []);

      function save(next) {
        setView({ value: next, status: 'saving', message: t('nickname.saving'), presetOk: view.presetOk });
        fetch(NICKNAME_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nickname: next })
        })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (data && data.ok) {
              setView({ value: data.nickname || '', status: 'saved', message: t('nickname.saved'), presetOk: view.presetOk });
            } else {
              setView({ value: next, status: 'ready', message: (data && data.error) || t('nickname.failed'), presetOk: view.presetOk });
            }
          })
          .catch(function () {
            setView({ value: next, status: 'offline', message: t('nickname.offline'), presetOk: view.presetOk });
          });
      }

      /*
       * 说明文字的三档：接口不通 > 预设还没用上变量（保存了也不会变） >
       * 正常。中间那档是关键 —— 否则用户会以为「已保存」就等于生效了。
       */
      var hintText = view.status === 'offline'
        ? t('nickname.offline')
        : view.presetOk === false
          ? t('nickname.pending')
          : (view.message || t('nickname.hint'));
      var hintWarn = view.status === 'offline' || view.presetOk === false;

      var children = [
        react.createElement(
          'div',
          { key: 'head', style: rowTextStyle },
          react.createElement(
            'div',
            { style: rowTextBodyStyle },
            react.createElement('div', { style: titleStyle }, t('nickname.title')),
            react.createElement('div', { style: descStyle }, t('nickname.description'))
          )
        ),
        react.createElement(
          'div',
          { key: 'control', style: controlRowStyle },
          react.createElement('input', {
            type: 'text',
            className: 'dsha-brand-input',
            style: inputStyle,
            value: view.value,
            maxLength: 24,
            disabled: view.status === 'loading',
            placeholder: t('nickname.placeholder'),
            'aria-label': t('nickname.aria'),
            onChange: function (event) {
              setView({ value: event.target.value, status: 'typing', message: '' });
            },
            onBlur: function (event) { save(event.target.value); },
            onKeyDown: function (event) {
              if (event.key === 'Enter') { event.preventDefault(); save(event.target.value); }
            }
          }),
          react.createElement('span', {
            key: 'hint',
            'data-dsha-nickname-status': view.status,
            'data-dsha-nickname-preset-ok': view.presetOk === false ? 'no' : 'yes',
            style: hintWarn ? noteWarnStyle : noteStyle
          }, hintText)
        )
      ];

      return react.createElement('div', { className: PANEL_ROW_CLASS, style: rowStyle }, children);
    }

    //#endregion

    /** 需要槽位服务与 locale 服务。 */
    var inject = ['slots', 'locale'];

    function apply(ctx) {
      ensureStyle();
      hydrateFromHost();

      /*
       * DOM 补丁的生命周期。放在 ctx.effect 里，插件被热替换 / 禁用时能把
       * 观察者摘掉 —— 否则旧实例的 MutationObserver 会留在页面上重复跑补丁。
       */
      /*
       * 模式滑块要的服务：会话列表 + 预设 RPC。
       * 用 ctx.inject 而不是 ctx.get —— Cordis 的服务必须在 inject 里声明才能访问
       * （直接 get 会抛 "cannot get property ... without inject"，切换会被静默吞掉）。
       * 放在 scoped inject 里还有个好处：万一某个部署没有这些服务，本插件其余功能照常。
       */
      /* 0.2.x 才有的工作区服务：用来拿「当前会话」。0.1.x 没有它也不影响。 */
      ctx.inject(['uiWorkspace'], function (scope) {
        workspaceRef = scope.uiWorkspace || null;
        refreshModeUi();
        return function () {
          workspaceRef = null;
        };
      });

      ctx.inject(['sessions', 'remote', 'remote.agentPresets'], function (scope) {
        try {
          modeServices = { sessions: scope.sessions, remote: scope.remote };
        } catch (err0) {
          modeServices = null;
          return;
        }
        var stop = null;
        try {
          if (scope.sessions && scope.sessions.list && typeof scope.sessions.list.subscribe === 'function') {
            stop = scope.sessions.list.subscribe(function () {
              applyMode();          /* 暂存的选择等会话出现后再交出去 */
              refreshModeUi();      /* 并且让滑块与灰字跟着真实预设走 */
            });
          }
        } catch (err) {
          stop = null;
        }
        patchModeSwitch();
        return function () {
          modeServices = null;
          if (typeof stop === 'function') stop();
        };
      });

      ctx.effect(function () {
        watchDom();
        return function () {
          if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
          }
          domFramePending = false;
        };
      }, 'dsha-brand-rename: dom patch');

      /*
       * 权限名称：先把 locale 服务抓住，立刻改一次；之后 locale 一有变化就再跑一次
       * —— 这样即使 conversation / settings.permission 的字典比我们注册得晚，
       * 也能在它们出现后补上（回调里 notify=false，避免 publish 自激）。
       */
      ctx.effect(function () {
        localeService = ctx.locale;
        var unsubscribe = null;
        try {
          if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
            unsubscribe = ctx.locale.subscribe(function () { runPermissionText(false); });
          }
        } catch (err) {
          /* 订阅不可用就算了，至少 apply 这一次会生效。 */
        }
        runPermissionText(true);
        return function () {
          localeService = null;
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, 'dsha-brand-rename: permission text');

      ctx.effect(function () {
        var zh = {
          'common.reset': '恢复默认',
          'common.expand': '展开',
          'common.collapse': '收起',
          'common.auto': '默认',
          'common.resetStyle': '复位样式',
          'placeholder.title': '输入框提示文案',
          'placeholder.description': '分别为新会话与各种会话状态的输入框灰色提示自定义文案。每条可以再填一句英文（你自己写），显示时**中文一行、英文另起一行**；两侧都留空则保持系统默认。改动即时生效并自动保存。',
          'placeholder.enHint': '英文（可选，另起一行）',
          'placeholderEn.aria': '输入框提示英文',
          'headline.title': '新会话标题',
          'headline.description': '新会话页吉祥物右侧那串文字。可保留多条，每次打开新会话按下方方式选一条；每条下面可以再配一行英文副标题（与它上面对应的那条配对显示，留空就不显示）。空行不参与抽取，一条都没有则保留系统原文（探索未至之境）。改动即时生效并自动保存。',
          'headline.mode': '选取方式',
          'headline.mode.random': '随机',
          'headline.mode.sequence': '顺序',
          'headline.modeHint.random': '每次新会话从非空标题里随机抽一条，并避免与上一次重复。',
          'headline.modeHint.sequence': '每次新会话按列表顺序取一条，到底后回到第一条循环。',
          'headline.add': '添加一条',
          'headline.remove': '删除',
          'headline.hint': '留空则不使用这条',
          'headline.enHint': '英文副标题（留空则不显示）',
          'headlineEn.aria': '英文副标题',
          'headlineLock.label': '锁定大小与位置',
          'headlineLock.hint': '锁定后「大小与位置」滑杆不可拖动，避免误触；再点一次解锁',
          'headlineLock.on': '已锁定：滑杆不可拖动（防止误触）',
          'headlineLock.off': '未锁定：可拖动调整字号与位置',
          'headlineStyle.title': '中文标题的大小与位置',
          'headlineStyle.size': '字号',
          'headlineStyle.gap': '上下',
          'headlineStyle.offsetX': '左右',
          'headlineStyle.hint': '字号直接改字体大小（放大会把整块自然撑高）；上下/左右只挪视觉位置，不挤动布局。字号留在「默认」就是跟随系统。',
          'headlineEn.style': '英文行的大小与位置',
          'headlineEn.size': '字号',
          'headlineEn.gap': '上下',
          'headlineEn.offsetX': '左右',
          'stats.title': '状态栏单位',
          'stats.description': '屏幕下方那串「3 轮 5 步 · … · 缓存命中 45%」里的三个词，各自在后面接一句英文（默认 Rounds / Steps / Cache hit）；留空则不加。改动即时生效并自动保存。',
          'stats.hint': '留空 = 不加英文',
          'sidebar.title': '侧栏文字',
          'sidebar.description': '在左下角「设置」和它上方的「美化」后面各接一句英文（你自己写），中间空一格；留空则只显示原文。改动即时生效并自动保存。',
          'sidebar.settings': '设置',
          'sidebar.beautify': '美化',
          'sidebar.hint': '留空 = 只显示原文',
          'panelDim.label': '调整时半透明',
          'panelDim.on': '已开启',
          'panelDim.off': '关闭',
          'panelDim.alpha': '不透明度',
          'panelDim.hint': '开着时：按下滑杆或聚焦英文输入框，设置面板就变半透明，能直接看到后面的新会话页；松手/失焦自动还原。',
          'headlineEn.styleHint': '英文行是悬浮的：只有它在动，标题、输入框和卡片高度都不受影响。上下/左右是相对中文标题的偏移，都支持负值（往上 / 往左）。',
          'headline.empty': '列表为空：保留系统原文（探索未至之境）',
          'headline.full': '最多 ' + HEADLINE_MAX_COUNT + ' 条',
          'permission.title': '权限名称',
          'permission.description': '自定义「仅可查看 / 工作区内修改 / 完全权限」这三项的显示名称，输入框旁的选择器与「设置 → 权限」都会跟着变；留空则保留系统原文。确认弹窗里带「完全权限」字样的文案会一并替换。改动即时生效并自动保存。',
          'permission.hint': '留空则保留系统原文',
          'nickname.title': '聊天模式里的称呼',
          'nickname.description': '「纯文本对话模式」那套人设里，AI 对你的称呼。它由主机半边注册成提示词变量 {{user_nickname}}，每一轮现取，所以改完从下一轮起就用新值。留空恢复默认「伙伴」。',
          'nickname.hint': '回车或移开焦点即保存',
          'nickname.placeholder': '伙伴',
          'nickname.aria': '聊天模式用户昵称',
          'nickname.saving': '保存中…',
          'nickname.saved': '已保存，下一轮起生效',
          'nickname.failed': '保存失败，请再试一次',
          'nickname.offline': '主机接口没回应：新版主机半边要重启一次 DSH 才会加载',
          'nickname.pending': '还差一步：chat 预设里还写着写死的称呼，换成 {{user_nickname}} 后这里才管用',
          'label.hero': '新会话',
          'label.default': '普通会话',
          'label.plan': '计划模式',
          'label.steerQueue': '队列插话',
          'label.workspace': '未选工作区',
          'label.unavailable': '会话不可用',
          'label.parentOffline': '父会话离线'
        };
        var en = {
          'common.reset': 'Reset',
          'common.expand': 'Expand',
          'common.collapse': 'Collapse',
          'common.auto': 'Default',
          'common.resetStyle': 'Reset styles',
          'placeholder.title': 'Composer hint text',
          'placeholder.description': 'Customize the grey composer hint for each session state. Each line can also carry an English sentence (yours) — it is shown on its own line below the Chinese; leaving both empty keeps the built-in text. Changes apply instantly and are saved.',
          'placeholder.enHint': 'English (optional, on its own line)',
          'placeholderEn.aria': 'Composer hint (English)',
          'headline.title': 'New-session headline',
          'headline.description': 'The text beside the mascot on the new-session screen. Keep several lines and pick one per new session; each line can carry its own English subtitle underneath (paired with the line above it; blank hides it). Blank lines are skipped, and an empty list keeps the built-in wording (Into the Unknown). Changes apply instantly and are saved.',
          'headline.mode': 'Pick',
          'headline.mode.random': 'Random',
          'headline.mode.sequence': 'In order',
          'headline.modeHint.random': 'Each new session draws one non-blank line at random, avoiding an immediate repeat.',
          'headline.modeHint.sequence': 'Each new session takes the next line, wrapping back at the end.',
          'headline.add': 'Add a line',
          'headline.remove': 'Remove',
          'headline.hint': 'Leave blank to skip this line',
          'headline.enHint': 'English subtitle (blank hides it)',
          'headlineEn.aria': 'English subtitle',
          'headlineLock.label': 'Lock size & position',
          'headlineLock.hint': 'When locked the size/position sliders cannot be dragged; click again to unlock',
          'headlineLock.on': 'Locked: sliders are read-only',
          'headlineLock.off': 'Unlocked: drag to adjust size and position',
          'headlineStyle.title': 'Headline: size and position',
          'headlineStyle.size': 'Size',
          'headlineStyle.gap': 'Vertical',
          'headlineStyle.offsetX': 'Horizontal',
          'headlineStyle.hint': 'Size changes the font size (growing it naturally makes the block taller); Vertical/Horizontal only move it visually without reflowing the layout. Leaving Size on “Default” follows the built-in size.',
          'headlineEn.style': 'English line: size and position',
          'headlineEn.size': 'Size',
          'headlineEn.gap': 'Vertical',
          'headlineEn.offsetX': 'Horizontal',
          'headlineEn.styleHint': 'The English line floats: only it moves — the headline, the composer and the card height stay untouched. Both offsets accept negative values.',
          'stats.title': 'Status-bar units',
          'stats.description': 'The three Chinese words in the status line (轮 / 步 / 缓存命中): each gets an English word appended right after it (defaults: Rounds / Steps / Cache hit). Leave a field empty to skip it. Changes apply instantly and are saved.',
          'stats.hint': 'Empty = no English',
          'sidebar.title': 'Sidebar labels',
          'sidebar.description': 'Append an English word (yours) after “设置” at the bottom-left and after “美化” above it, separated by one space. Leave a field empty to keep the original only. Changes apply instantly and are saved.',
          'sidebar.settings': 'Settings',
          'sidebar.beautify': 'Beautify',
          'sidebar.hint': 'Empty = original only',
          'panelDim.label': 'Peek while adjusting',
          'panelDim.on': 'On',
          'panelDim.off': 'Off',
          'panelDim.alpha': 'Opacity',
          'panelDim.hint': 'While on: press a slider or focus an English field and the settings panel goes translucent so you can watch the new-session page behind it; it restores on release/blur.',
          'headline.empty': 'Empty list: keeps the built-in wording (Into the Unknown)',
          'headline.full': 'Up to ' + HEADLINE_MAX_COUNT + ' lines',
          'permission.title': 'Permission labels',
          'permission.description': 'Rename the three permission presets (Read Only / Workspace Write / Full access). Both the composer selector and Settings → Permission follow. Leave a field empty to keep the built-in wording; confirmation copy that mentions the Full access name is updated too. Changes apply instantly and are saved.',
          'permission.hint': 'Leave empty for the built-in wording',
          'nickname.title': 'Chat-mode name for you',
          'nickname.description': 'How the persona in Plain chat mode addresses you. It is injected through the host-registered prompt variable {{user_nickname}}, resolved on every turn, so a change applies from the very next turn. Leave it empty to restore the default.',
          'nickname.hint': 'Enter or blur to save',
          'nickname.placeholder': '伙伴',
          'nickname.aria': 'Chat-mode nickname',
          'nickname.saving': 'Saving…',
          'nickname.saved': 'Saved — applies from the next turn',
          'nickname.failed': 'Save failed, please try again',
          'nickname.offline': 'Host API not answering: the new host half needs one DSH restart to load',
          'nickname.pending': 'One step left: the chat preset still spells the name out — replace it with {{user_nickname}} for this field to take effect',
          'label.hero': 'New session',
          'label.default': 'In session',
          'label.plan': 'Plan mode',
          'label.steerQueue': 'Steering queue',
          'label.workspace': 'No workspace',
          'label.unavailable': 'Unavailable',
          'label.parentOffline': 'Parent offline'
        };
        /* 输入框的灰字提示直接用官方原文，单一数据源。 */
        for (var i = 0; i < PLACEHOLDER_DEFS.length; i++) {
          zh['default.' + PLACEHOLDER_DEFS[i].key] = PLACEHOLDER_DEFS[i].zh;
          en['default.' + PLACEHOLDER_DEFS[i].key] = PLACEHOLDER_DEFS[i].en;
        }
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, 'dsha-brand-rename: locale');

      /* 用 priority -1 接管两个品牌槽位（官方默认 0 → 被遮蔽，最低者渲染）。
         先 mark 再 name，任一条失败不影响另一条。 */
      ctx.slots.inject('sidebar.brand.mark', function () {
        return ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, BrandMark);
          yield ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, BrandName);
        });
      });

      /* 设置 → 通用里追加两行（list 槽位，用 id 保证唯一、order 决定次序）。 */
      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-stats',
          order: 39,
          locale: NS
        }, StatsLabelSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-sidebar',
          order: 40,
          locale: NS
        }, SidebarLabelSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-headline',
          order: 41,
          locale: NS
        }, HeadlineSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-placeholder',
          order: 42,
          locale: NS
        }, PlaceholderSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'style-tier',
          order: 43,
          locale: NS
        }, TierSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-permission',
          order: 43,
          locale: NS
        }, PermissionSettingsRow);
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'brand-nickname',
          order: 44,
          locale: NS
        }, ChatNicknameSettingsRow);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
