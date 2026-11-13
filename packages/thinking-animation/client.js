/**
 * dsh-cyrene-thinking 的浏览器半边。
 *
 * 目标：模型思考时，把过程标题前的图标换成昔涟思考动画；**只对运行中的行**生效
 * （已完成的分析行 activity 仍是 thinking，但文字是「已完成分析」，不能替换）。
 *
 * 定位：`button[data-process-activity="thinking"]`，由客户端按文字排除「已完成 / Completed」，
 * 给运行中的按钮加 `cyrene-thinking-run` 类；CSS 只认这个类，不碰 React。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cyrene-thinking',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require('react');

    var NS = 'dsh-cyrene-thinking';
    var API = '/dsh-cyrene-thinking-api';
    var IMAGE = '/dsh-cyrene-thinking/thinking.gif';
    var STYLE_ID = 'dsh-cyrene-thinking-style';
    var RUN_CLASS = 'cyrene-thinking-run';

    var enabled = true;
    var styleEl = null;
    var observer = null;
    var scheduled = false;

    function ensureStyle() {
      if (styleEl && styleEl.isConnected) return styleEl;
      var existing = document.getElementById(STYLE_ID);
      if (existing) {
        styleEl = existing;
        return styleEl;
      }
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        'button.' + RUN_CLASS + ' [data-step-process-icon] svg{display:none!important}'
        + 'button.' + RUN_CLASS + ' [data-step-process-icon]::before{'
        + 'content:"";position:absolute;inset:-3px;z-index:1;'
        + 'background:url("' + IMAGE + '") center/contain no-repeat;border-radius:50%;pointer-events:none;'
        + '}'
        /* 底部「正在分析请求」旁的 running 图标（鲸鱼尾）：只在这个运行状态存在 */
        + '[class*="_runningIcon"]{width:20px!important;height:20px!important;overflow:visible!important;contain:none!important}'
        + '[class*="_runningIcon"] > span,[class*="_runningIcon"] > svg{display:none!important}'
        + '[class*="_runningIcon"]::before{'
        + 'content:"";position:absolute;inset:0;z-index:1;'
        + 'background:url("' + IMAGE + '") center/contain no-repeat;border-radius:50%;pointer-events:none;'
        + '}';
      (document.head || document.documentElement).appendChild(style);
      styleEl = style;
      return styleEl;
    }

    function isFinished(text) {
      return /已完成|完成分析|Completed/i.test(String(text || ''));
    }

    function scan() {
      scheduled = false;
      if (!enabled) {
        var all = document.querySelectorAll('button.' + RUN_CLASS);
        for (var k = 0; k < all.length; k++) all[k].classList.remove(RUN_CLASS);
        return;
      }
      var buttons = document.querySelectorAll('button[data-process-activity="thinking"]');
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        if (isFinished(button.textContent)) button.classList.remove(RUN_CLASS);
        else button.classList.add(RUN_CLASS);
      }
      var running = document.querySelectorAll('button.' + RUN_CLASS);
      for (var j = 0; j < running.length; j++) {
        if (running[j].getAttribute('data-process-activity') !== 'thinking') {
          running[j].classList.remove(RUN_CLASS);
        }
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    }

    function ensureObserver() {
      if (observer) return;
      if (!document.body) {
        window.setTimeout(ensureObserver, 150);
        return;
      }
      observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-process-activity']
      });
      scan();
    }

    function applyEnabled(on) {
      enabled = on === true;
      ensureStyle().disabled = !enabled;
      if (enabled) ensureObserver();
      else scan();
    }

    function loadEnabled() {
      fetch(API, { headers: { accept: 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (body) {
          applyEnabled(!body || body.ok !== true ? true : body.enabled !== false);
        })
        .catch(function () { applyEnabled(true); });
    }

    function ThinkingRow(props) {
      var t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      var statePair = react.useState({ loading: true, enabled: true, busy: false, error: '' });
      var view = statePair[0];
      var setView = statePair[1];

      function patch(next) {
        setView(function (prev) {
          var out = {};
          for (var k in prev) out[k] = prev[k];
          for (var j in next) out[j] = next[j];
          return out;
        });
      }

      react.useEffect(function () {
        var alive = true;
        fetch(API, { headers: { accept: 'application/json' } })
          .then(function (res) { return res.json(); })
          .then(function (body) {
            if (!alive) return;
            if (!body || body.ok !== true) throw new Error((body && body.error) || t('loadFailed'));
            patch({ loading: false, enabled: body.enabled !== false, error: '' });
          })
          .catch(function (err) {
            if (alive) patch({ loading: false, error: String((err && err.message) || err) });
          });
        return function () { alive = false; };
      }, []);

      function toggle() {
        if (view.loading || view.busy) return;
        var next = !view.enabled;
        patch({ busy: true, error: '' });
        fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ enabled: next })
        })
          .then(function (res) { return res.json(); })
          .then(function (body) {
            if (!body || body.ok !== true) throw new Error((body && body.error) || t('saveFailed'));
            var on = body.enabled !== false;
            applyEnabled(on);
            patch({ busy: false, enabled: on });
          })
          .catch(function (err) {
            patch({ busy: false, error: String((err && err.message) || err) });
          });
      }

      var rowStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        padding: '14px 16px', borderBottom: '1px solid var(--dsw-alias-border-l1)'
      };
      var titleStyle = { fontSize: '14px', fontWeight: '600', lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' };
      var descStyle = { marginTop: '2px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' };
      var errorStyle = { marginTop: '4px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-danger)' };
      var switchStyle = {
        position: 'relative', width: '40px', height: '22px', border: 'none', borderRadius: '999px',
        background: view.enabled ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)',
        cursor: view.busy ? 'default' : 'pointer', flex: '0 0 auto', padding: 0, transition: 'background .15s'
      };
      var knobStyle = {
        position: 'absolute', top: '3px', left: view.enabled ? '21px' : '3px', width: '16px', height: '16px',
        borderRadius: '50%', background: '#fff', transition: 'left .15s'
      };

      return react.createElement('div', { style: rowStyle },
        react.createElement('div', { style: { minWidth: 0 } },
          react.createElement('div', { style: titleStyle }, t('title')),
          react.createElement('div', { style: descStyle }, view.loading ? t('loading') : (view.enabled ? t('onHint') : t('offHint'))),
          view.error ? react.createElement('div', { style: errorStyle }, view.error) : null
        ),
        react.createElement('button', {
          type: 'button', role: 'switch', 'aria-checked': view.enabled,
          'aria-label': t('title'), title: t('title'),
          disabled: view.loading || view.busy, style: switchStyle, onClick: toggle
        }, react.createElement('span', { style: knobStyle }))
      );
    }

    var inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, {
          zh: {
            title: '思考动画',
            onHint: '模型思考时，把「思考中」前的小图标换成昔涟的思考循环动画。',
            offHint: '已关闭：使用 DSH 默认的思考图标。',
            loading: '正在读取开关…',
            loadFailed: '读取开关失败',
            saveFailed: '保存开关失败'
          },
          en: {
            title: 'Thinking animation',
            onHint: 'Replace the small "Thinking" icon with Cyrene\'s animated thinking loop.',
            offHint: 'Off: use the default DSH thinking icon.',
            loading: 'Loading…',
            loadFailed: 'Could not load the setting',
            saveFailed: 'Could not save the setting'
          }
        });
      });

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item', id: 'cyrene-thinking', order: 42, locale: NS
        }, ThinkingRow);
      });

      applyEnabled(true);
      loadEnabled();
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
