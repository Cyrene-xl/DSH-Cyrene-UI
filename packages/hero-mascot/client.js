/**
 * dsha-hero-mascot 的浏览器半边。
 *
 * 两件事：
 *   1. 占据新会话 Hero 区左侧的品牌图标槽位 conversation.hero.brand.mark，
 *      显示吉祥物图片。默认用主机半边的 /dsha-hero-mascot/hero.png，
 *      也可以在设置里**上传自己的图**。
 *   2. 在「设置 → 通用」注册一行 settings.general.item，调节：
 *        图片（上传 / 清除）、抠白底、大小、水平位置、垂直位置
 *      改动即时生效并写入 localStorage。
 *
 * 抠白底：上传的图若带纯白背景，直接贴上去在壁纸底上就是一块白方块。
 * 这里用「从画布四边泛洪填充」只吃掉与边框连通的近白像素（亮度 ≥ 240 且
 * 饱和度 ≤ 12），角色内部被描边围住的白色（衬衫、裙摆）不会被打洞；
 * 之后对紧邻背景的一圈像素做 1 次 3×3 alpha 均值，软化锯齿、避免白边。
 *
 * 存储：处理后的图是 PNG data URL，直接进 localStorage。上传时先降采样到
 * 长边 384（160px 显示尺寸 × dpr 1.875 ≈ 300px，384 有富余），若编码后仍
 * 超过配额上限就继续降。抠白底开关在**选择图片时**生效；要改就重新选一次。
 */
window.__ModuleLoader__.load({
  id: 'dsha-hero-mascot',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require('react');

    /** 本插件自己的 locale 命名空间（不能借用 conversation，同 ns+同语言会抛错）。 */
    var NS = 'dsha-hero-mascot';
    /** 主机半边提供的默认图片地址。 */
    var DEFAULT_IMAGE = '/dsh-hero-mascot/hero.png';
    /** 设置落盘位置（固定 origin，刷新与重开都在）。 */
    var STORAGE_KEY = 'dsha-hero-mascot:view';

    /** 默认值与取值范围（px）。 */
    var DEFAULTS = { size: 56, offsetX: 0, offsetY: 0, image: '' };
    var LIMITS = {
      size: [24, 160],
      offsetX: [-80, 80],
      offsetY: [-80, 80]
    };

    /** 上传图片的降采样长边。 */
    var UPLOAD_MAX_SIDE = 384;
    /** data URL 字符数上限（localStorage 配额留余量）。 */
    var MAX_IMAGE_CHARS = 1200000;

    //#region 设置状态：localStorage + 订阅

    function clamp(value, lo, hi) {
      return Math.min(hi, Math.max(lo, value));
    }

    function readState() {
      var raw = {};
      try {
        raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
      } catch (err) {
        raw = {};
      }
      var out = {};
      out.size = numberOr(raw.size, DEFAULTS.size, LIMITS.size);
      out.offsetX = numberOr(raw.offsetX, DEFAULTS.offsetX, LIMITS.offsetX);
      out.offsetY = numberOr(raw.offsetY, DEFAULTS.offsetY, LIMITS.offsetY);
      out.image = typeof raw.image === 'string' && raw.image.indexOf('data:image/') === 0 ? raw.image : '';
      out.cutout = raw.cutout !== false;
      /* 锁定模式：防止误触把大小 / 位置拖歪（默认关）。 */
      out.locked = raw.locked === true;
      return out;
    }

    function numberOr(value, fallback, range) {
      var number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return clamp(number, range[0], range[1]);
    }

    var state = readState();
    var listeners = new Set();

    function subscribe(fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }

    function update(patch) {
      state = Object.assign({}, state, patch);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        /* 配额满 / 隐私模式：内存里仍生效，只是不落盘。 */
      }
      listeners.forEach(function (fn) { fn(state); });
    }

    /** 订阅当前设置；吉祥物与设置行共用同一个状态源。 */
    function useView() {
      var pair = react.useState(state);
      var value = pair[0];
      var setValue = pair[1];
      react.useEffect(function () { return subscribe(setValue); }, []);
      return value;
    }

    //#endregion

    //#region 抠白底（从边框泛洪填充）

    /**
     * 只吃掉「与画布边框连通的近白像素」，然后羽化边界。
     * @param ctx - 已经画好图、尺寸 w×h 的 2D 上下文（原地修改）。
     * @param w - 宽。
     * @param h - 高。
     */
    function removeBorderWhite(ctx, w, h) {
      var frame = ctx.getImageData(0, 0, w, h);
      var data = frame.data;
      var count = w * h;
      var background = new Uint8Array(count);
      var stack = new Int32Array(count);
      var top = 0;

      function isNearWhite(index) {
        var p = index * 4;
        var r = data[p];
        var g = data[p + 1];
        var b = data[p + 2];
        var lum = 0.299 * r + 0.587 * g + 0.114 * b;
        var sat = Math.max(r, g, b) - Math.min(r, g, b);
        return lum >= 240 && sat <= 12;
      }

      function seed(index) {
        if (!background[index] && isNearWhite(index)) {
          background[index] = 1;
          stack[top++] = index;
        }
      }

      for (var x = 0; x < w; x++) {
        seed(x);
        seed((h - 1) * w + x);
      }
      for (var y = 0; y < h; y++) {
        seed(y * w);
        seed(y * w + (w - 1));
      }

      while (top > 0) {
        var index = stack[--top];
        var px = index % w;
        var py = (index - px) / w;
        if (px > 0) seed(index - 1);
        if (px < w - 1) seed(index + 1);
        if (py > 0) seed(index - w);
        if (py < h - 1) seed(index + w);
      }

      /* 先把 alpha 写成 0/255，并留一份快照给边界均值用。 */
      var alpha = new Uint8Array(count);
      for (var i = 0; i < count; i++) {
        alpha[i] = background[i] ? 0 : 255;
        data[i * 4 + 3] = alpha[i];
      }

      /* 只对紧邻背景的一圈做 3×3 均值：软化锯齿，又不整体糊掉。 */
      for (var yy = 1; yy < h - 1; yy++) {
        for (var xx = 1; xx < w - 1; xx++) {
          var at = yy * w + xx;
          if (!background[at]
            && !background[at - 1] && !background[at + 1]
            && !background[at - w] && !background[at + w]) continue;
          var sum = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) sum += alpha[at + dy * w + dx];
          }
          data[at * 4 + 3] = Math.round(sum / 9);
        }
      }

      /* 背景像素强制全透明（上一步的均值可能给了它们非零 alpha）。 */
      for (var k = 0; k < count; k++) if (background[k]) data[k * 4 + 3] = 0;

      ctx.putImageData(frame, 0, 0);
    }

    /** 把已解码的图按长边降采样画到 canvas 上，返回 canvas。 */
    function drawScaled(image, maxSide) {
      var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      var width = Math.max(1, Math.round(image.width * scale));
      var height = Math.max(1, Math.round(image.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      return { canvas: canvas, ctx: ctx, width: width, height: height };
    }

    /**
     * 读一个用户选的文件 → 可选抠白底 → 降采样 → PNG data URL。
     * 超过配额就继续降采样，仍不行则回调 null。
     * @param file - 用户选的文件。
     * @param cutout - 是否抠白底。
     * @param onDone - 回调，参数为 data URL 或 null。
     */
    function readImageFile(file, cutout, onDone) {
      var reader = new FileReader();
      reader.onerror = function () { onDone(null); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { onDone(null); };
        image.onload = function () {
          var side = UPLOAD_MAX_SIDE;
          try {
            for (var attempt = 0; attempt < 4; attempt++) {
              var drawn = drawScaled(image, side);
              if (cutout) removeBorderWhite(drawn.ctx, drawn.width, drawn.height);
              var url = drawn.canvas.toDataURL('image/png');
              if (url.length <= MAX_IMAGE_CHARS) { onDone(url); return; }
              side = Math.round(side * 0.75);
            }
            onDone(null);
          } catch (err) {
            /* getImageData / toDataURL 失败（极端图片或内存不足） */
            console.warn('[dsha-hero-mascot] 图片处理失败：', err && err.message);
            onDone(null);
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    //#endregion

    //#region 吉祥物

    /**
     * Hero 品牌图标：自定义吉祥物。
     * @param props - 槽位传入的 `className`（Hero 的 .fish，带上就保留官方那套
     *   悬停游动动画；手机上 `(hover:hover)` 不成立，所以天然是静态的）。
     */
    function HeroMascot(props) {
      var view = useView();
      var passed = props && typeof props.className === 'string' ? props.className : '';
      return react.createElement(
        'span',
        {
          className: (passed ? passed + ' ' : '') + 'dsha-hero-mascot',
          'data-dsha-hero-mascot': '',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            position: 'relative',
            width: view.size + 'px',
            height: view.size + 'px',
            left: view.offsetX + 'px',
            top: view.offsetY + 'px'
          }
        },
        react.createElement('img', {
          src: view.image || DEFAULT_IMAGE,
          alt: '',
          draggable: false,
          decoding: 'async',
          style: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' }
        })
      );
    }

    //#endregion

    //#region 设置行

    /* 样式值照官方 EnterBehaviorRow / modalInput 的 CSS 复刻，保证观感一致。 */
    var rowStyle = {
      borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
      padding: '16px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: 0
    };
    var rowTextStyle = { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 };
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
    var controlRowStyle = { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' };
    var sliderRowStyle = { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 };
    var sliderLabelStyle = {
      flex: 'none',
      width: '40px',
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
    var chipStyle = {
      flex: 'none',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      cursor: 'pointer',
      border: '0.5px solid var(--dsw-alias-border-l4)',
      borderRadius: '12px',
      padding: '3px 10px',
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary)'
    };
    var chipOnStyle = Object.assign({}, chipStyle, {
      background: 'var(--dsw-alias-state-business-primary)',
      borderColor: 'transparent',
      color: '#fff'
    });

    /** 打开系统文件选择器。用临时 input，省得在 React 树里维护 ref。 */
    function pickImageFile(onPick) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (file) onPick(file);
        if (input.parentNode) input.parentNode.removeChild(input);
      });
      document.body.appendChild(input);
      input.click();
    }

    /**
     * 设置行：吉祥物图片 + 大小 + 位置。
     * @param props - 槽位按 `locale: NS` 注入的 `t`。
     */
    function MascotSettingsRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var view = useView();
      var noticePair = react.useState('');
      var notice = noticePair[0];
      var setNotice = noticePair[1];

      function slider(key, label) {
        return react.createElement(
          'div',
          { key: key, style: sliderRowStyle },
          react.createElement('span', { style: sliderLabelStyle }, label),
          react.createElement('input', {
            type: 'range',
            min: LIMITS[key][0],
            max: LIMITS[key][1],
            step: 1,
            value: view[key],
            'aria-label': label,
            disabled: view.locked === true,
            style: view.locked === true
              ? Object.assign({}, sliderStyle, { opacity: 0.4, cursor: 'not-allowed' })
              : sliderStyle,
            onChange: function (event) {
              var patch = {};
              patch[key] = Number(event.target.value);
              update(patch);
            }
          }),
          react.createElement('span', { style: sliderValueStyle }, view[key] + ' px')
        );
      }

      return react.createElement(
        'div',
        { style: rowStyle },
        react.createElement(
          'div',
          { style: rowTextStyle },
          react.createElement('div', { style: titleStyle }, t('title')),
          react.createElement('div', { style: descStyle }, t('description'))
        ),

        /* 图片行：上传 / 清除 / 抠白底 */
        react.createElement(
          'div',
          { style: controlRowStyle },
          react.createElement('span', { style: sliderLabelStyle }, t('image')),
          react.createElement('button', {
            type: 'button',
            style: pillStyle,
            onClick: function () {
              setNotice('');
              pickImageFile(function (file) {
                readImageFile(file, view.cutout !== false, function (url) {
                  if (url === null) { setNotice(t('imageFailed')); return; }
                  update({ image: url });
                });
              });
            }
          }, view.image ? t('imageChange') : t('imagePick')),
          view.image
            ? react.createElement('button', {
              type: 'button',
              style: pillStyle,
              onClick: function () { setNotice(''); update({ image: '' }); }
            }, t('imageClear'))
            : null,
          react.createElement('button', {
            type: 'button',
            style: view.cutout !== false ? chipOnStyle : chipStyle,
            'aria-pressed': view.cutout !== false,
            title: t('cutoutHint'),
            onClick: function () { update({ cutout: view.cutout === false }); }
          }, t('cutout') + (view.cutout !== false ? ' ✓' : ''))
        ),

        notice ? react.createElement('div', {
          style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', lineHeight: '18px' }
        }, notice) : null,

        /* 锁定模式：一行开关，锁上之后三根滑杆不可拖动。 */
        react.createElement(
          'div',
          { style: Object.assign({}, controlRowStyle, { gap: '10px' }) },
          react.createElement('button', {
            type: 'button',
            style: view.locked === true ? chipOnStyle : chipStyle,
            'aria-pressed': view.locked === true,
            title: t('lockHint'),
            onClick: function () { setNotice(''); update({ locked: view.locked !== true }); }
          }, t('lock') + (view.locked === true ? ' ✓' : '')),
          react.createElement('span', {
            style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' }
          }, view.locked === true ? t('lockOnHint') : t('lockOffHint'))
        ),

        slider('size', t('size')),
        slider('offsetX', t('offsetX')),
        slider('offsetY', t('offsetY')),

        react.createElement('button', {
          type: 'button',
          style: Object.assign({}, pillStyle, { alignSelf: 'flex-start' }),
          onClick: function () { setNotice(''); update(Object.assign({}, DEFAULTS)); }
        }, t('reset'))
      );
    }

    //#endregion

    /** 需要槽位服务与 locale 服务。 */
    var inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, {
          zh: {
            title: '吉祥物',
            description: '新会话页左侧吉祥物的图片与位置。可上传自己的图片（自动压缩存储）；「抠白底」会从四边泛洪掉与边框连通的纯白背景。',
            image: '图片',
            imagePick: '选择图片',
            imageChange: '更换图片',
            imageClear: '清除',
            imageFailed: '这张图处理失败或太大，换一张试试',
            cutout: '抠白底',
            cutoutHint: '在上传时生效：只吃掉与画布四边连通的纯白背景，角色内部的白色保留。改变后请重新选择图片。',
            size: '大小',
            offsetX: '水平',
            offsetY: '垂直',
            lock: '锁定位置与大小',
            lockHint: '锁定后三根滑杆不可拖动，避免误触；再点一次解锁',
            lockOnHint: '已锁定：滑杆不可拖动（防止误触）',
            lockOffHint: '未锁定：可拖动调整大小与位置',
            reset: '恢复默认'
          },
          en: {
            title: 'Mascot',
            description: 'Image and position of the mascot beside the new-session headline. Upload your own image (stored compressed); "Cut white" flood-fills pure white connected to the edges.',
            image: 'Image',
            imagePick: 'Choose image',
            imageChange: 'Change image',
            imageClear: 'Clear',
            imageFailed: 'That image could not be processed — try another one',
            cutout: 'Cut white',
            cutoutHint: 'Applied when you pick a file: removes pure white connected to the canvas edges, keeping enclosed whites. Re-pick the image after changing this.',
            size: 'Size',
            offsetX: 'X',
            offsetY: 'Y',
            lock: 'Lock size & position',
            lockHint: 'When locked the sliders cannot be dragged; click again to unlock',
            lockOnHint: 'Locked: sliders are read-only',
            lockOffHint: 'Unlocked: drag to adjust size and position',
            reset: 'Reset'
          }
        });
      }, 'dsha-hero-mascot: locale');

      /* 1. 吉祥物：占据 Hero 品牌图标槽位。 */
      ctx.slots.inject('conversation.hero.brand.mark', function () {
        return ctx.slots.register({ name: 'conversation.hero.brand.mark', id: 'hero-mascot' }, HeroMascot);
      });

      /* 2. 设置行：设置 → 通用里追加一项（list 槽位，用 id 保证唯一）。 */
      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'hero-mascot',
          order: 40,
          locale: NS
        }, MascotSettingsRow);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
