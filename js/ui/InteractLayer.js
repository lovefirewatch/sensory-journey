/* ============================================================
 * InteractLayer.js —— 叠加在视频画面上的交互层
 *
 * 三种交互：
 *   ① tap      点击四象限区域（容错：整个象限都算命中）
 *   ② choice   选择题（支持"选错移除该选项"）
 *   ③ overlay  悬浮文字（如座位算式，显示到指定秒数）
 *
 * ★ 坐标约定：所有位置都用 0~1 归一化比例，且**相对视频可见区域**计算。
 *   因为视频是 object-fit: contain，画面上下可能有黑边，
 *   按屏幕算会导致"点左下却判成点中间"。
 * ============================================================ */

(function (global) {
  'use strict';

  /* 四象限：容错拉满，整个象限都算 */
  var REGIONS = {
    'top-left':     function (x, y) { return x < 0.5 && y < 0.5; },
    'top-right':    function (x, y) { return x >= 0.5 && y < 0.5; },
    'bottom-left':  function (x, y) { return x < 0.5 && y >= 0.5; },
    'bottom-right': function (x, y) { return x >= 0.5 && y >= 0.5; }
  };

  function InteractLayer(root) {
    this.root = root;
    this.active = null;
    this.el = null;
    this._onDone = null;
  }

  /* ============================================================
   * 点击交互
   * @param {object} cfg  LEVEL1.interacts.xxx
   * @param {Function} onDone 完成回调
   * ============================================================ */
  InteractLayer.prototype.showTap = function (cfg, onDone) {
    this.clear();
    this._onDone = onDone;
    var L = global.LEVEL1.ui;

    var wrap = document.createElement('div');
    wrap.className = 'it-layer it-layer--tap';

    /* ① 只给文字提示，★ 不画高亮框
       原因：框会把"可点击区域的边界"暴露出来，破坏第一人称的沉浸感。
       位置仍按 region 决定（右上/左下），但视觉上只有一行字。 */
    var tip = document.createElement('div');
    tip.className = 'it-tip it-tip--' + cfg.region;
    tip.innerHTML = '<span class="it-tip__text">' + cfg.hintFull + '</span>';
    wrap.appendChild(tip);
    this._tipEl = tip;
    this._regionEl = null;      // 已无区域框，仅保留字段以免外部误用

    this.root.appendChild(wrap);
    this.el = wrap;
    this.active = 'tap';
    this._cfg = cfg;

    var self = this;
    this._handler = function (e) {
      var p = self._norm(e);
      var hit = REGIONS[cfg.region](p.x, p.y);
      if (hit) {
        self._succeed();
      } else {
        self._wrongFeedback();
      }
    };
    wrap.addEventListener('pointerdown', this._handler);
    void L;
  };

  /** 把点击换算成相对"视频可见区域"的 0~1 比例 */
  InteractLayer.prototype._norm = function (e) {
    var r = this.root.getBoundingClientRect();
    var vw = r.width, vh = r.height;
    // 视频是 16:9 contain，算出实际画面区域
    var ar = 16 / 9;
    var dw = vw, dh = vw / ar;
    if (dh > vh) { dh = vh; dw = vh * ar; }
    var ox = (vw - dw) / 2, oy = (vh - dh) / 2;
    var x = (e.clientX - r.left - ox) / dw;
    var y = (e.clientY - r.top - oy) / dh;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  InteractLayer.prototype._succeed = function () {
    var self = this;
    this.active = null;
    if (this.el) this.el.classList.add('is-done');
    setTimeout(function () {
      var cb = self._onDone; self._onDone = null;
      if (cb) cb();
      self.clear();
    }, 260);
  };

  /** 点错了：提示文字连闪几下（不消失，让用户再看清该点哪） */
  InteractLayer.prototype._wrongFeedback = function () {
    if (!this._tipEl) return;
    var t = this._tipEl;
    t.classList.remove('is-wrong');
    void t.offsetWidth;                 // 强制重排，使动画可重复触发
    t.classList.add('is-wrong');
  };

  /* ============================================================
   * 选择题
   * @param {object} cfg { question, options:[{id,text,correct}] }
   * @param {Function} onDone(option)
   * @param {object} opt { removeAfterWrong, wrongText }
   * ============================================================ */
  InteractLayer.prototype.showChoice = function (cfg, onDone, opt) {
    opt = opt || {};
    this.clear();
    this._onDone = onDone;
    this._onWrong = opt.onWrong || null;

    var wrap = document.createElement('div');
    wrap.className = 'it-layer it-layer--choice';

    var box = document.createElement('div');
    box.className = 'it-choice';

    var q = document.createElement('div');
    q.className = 'it-choice__q';
    q.textContent = cfg.question;
    box.appendChild(q);

    var list = document.createElement('div');
    list.className = 'it-choice__list';
    box.appendChild(list);
    this._list = list;

    var self = this;
    this._remaining = cfg.options.slice();

    function render() {
      list.innerHTML = '';
      self._remaining.forEach(function (o) {
        var b = document.createElement('button');
        b.className = 'btn btn--choice';
        b.type = 'button';
        b.textContent = o.text;
        b.addEventListener('click', function () {
          if (o.correct) {
            b.classList.add('is-correct');
            var cb = self._onDone; self._onDone = null;
            setTimeout(function () { if (cb) cb(o); self.clear(); }, 320);
          } else {
            // 选错：闪一下 → 按需移除该选项 → 通知外部（如"选 B 要重播视频"）
            b.classList.add('is-wrong');
            setTimeout(function () {
              if (opt.removeAfterWrong === true) {
                self._remaining = self._remaining.filter(function (x) { return x.id !== o.id; });
                render();
              }
              if (opt.wrongText) self._flashWrong(opt.wrongText);
              if (self._onWrong) self._onWrong(o);
            }, 420);
          }
        });
        list.appendChild(b);
      });
    }
    render();

    wrap.appendChild(box);
    this.root.appendChild(wrap);
    this.el = wrap;
    this.active = 'choice';
  };

  InteractLayer.prototype._flashWrong = function (text) {
    var box = this.el && this.el.querySelector('.it-choice');
    if (!box) return;
    var t = document.createElement('div');
    t.className = 'it-choice__wrong';
    t.textContent = text;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('is-show'); }, 10);
    setTimeout(function () {
      t.classList.remove('is-show');
      setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 300);
    }, 1600);
  };

  /* ============================================================
   * 悬浮文字（如座位算式）
   * @param {string} text
   * ============================================================ */
  InteractLayer.prototype.showOverlay = function (text) {
    this.clearOverlay();
    var el = document.createElement('div');
    el.className = 'it-overlay';
    el.textContent = text;
    this.root.appendChild(el);
    this._overlay = el;
    setTimeout(function () { el.classList.add('is-show'); }, 20);
  };

  InteractLayer.prototype.clearOverlay = function () {
    if (!this._overlay) return;
    var el = this._overlay;
    this._overlay = null;
    el.classList.remove('is-show');
    setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 300);
  };

  InteractLayer.prototype.clear = function () {
    this.clearOverlay();
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null; this.active = null; this._onDone = null;
    this._tipEl = null; this._regionEl = null;
  };

  global.InteractLayer = InteractLayer;
  global.REGIONS = REGIONS;

})(window);
