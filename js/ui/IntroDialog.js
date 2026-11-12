/* ============================================================
 * Dialog.js —— 通用对话框组件（本次用于"开始前的介绍说明"）
 *
 * 交互流程（按需求实现）：
 *   1. 打开后，正文分段依次淡入（营造阅读节奏）
 *   2. 约 N 秒（默认 3000ms）后，底部淡入一行小字"点击任意处关闭"
 *   3. 提示出现之后，点击任意位置即可关闭；提示出现之前点击无效（防止误触跳过）
 *   4. 关闭时可带回调 onClose
 *
 * 用法：
 *   var dlg = new Dialog({
 *     panelImage: assets.get('ui.panelDialog'),   // ★ 面板底图占位符
 *     lines: ['第一段', '第二段'],
 *     hintDelay: 3000,
 *     hintText: '点击任意处关闭',
 *     onClose: function(){ ... }
 *   });
 *   dlg.open();
 *
 * ★ 后续开发：这是通用组件，剧情旁白、场景说明都能复用；
 *   想加打字机效果，改 _revealLines() 即可。
 * ============================================================ */

(function (global) {
  'use strict';

  function Dialog(opts) {
    opts = opts || {};
    this.opts = opts;
    this.el = null;
    this._open = false;
    this._closable = false;         // 提示出现前不可关闭
    this._hintTimer = null;
    this._lineTimers = [];
    this.onClose = opts.onClose || null;
    this._build();
  }

  Dialog.prototype._build = function () {
    var self = this;

    // ---------- 遮罩（点击任意处关闭就绑在它身上） ----------
    var mask = document.createElement('div');
    mask.className = 'dialog-mask';

    // ---------- 面板 ----------
    var panel = document.createElement('div');
    panel.className = 'dialog-panel';

    // ★ 面板底图占位符：assets/ui/panel_dialog.png
    var panelImg = this.opts.panelImage;
    if (panelImg && panelImg.src) panel.style.backgroundImage = 'url("' + panelImg.src + '")';

    // 标题（可选）
    if (this.opts.title) {
      var h = document.createElement('h2');
      h.className = 'dialog-title';
      h.textContent = this.opts.title;
      panel.appendChild(h);
    }

    // 正文：每一行一个 <p>，逐条淡入
    var body = document.createElement('div');
    body.className = 'dialog-body';
    var lines = this.opts.lines || [];
    this._lineEls = [];
    lines.forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'dialog-line';
      p.textContent = text;
      body.appendChild(p);
      self._lineEls.push(p);
    });
    panel.appendChild(body);

    // 关闭提示（3 秒后才出现）
    var hint = document.createElement('div');
    hint.className = 'dialog-hint';
    hint.textContent = this.opts.hintText || '点击任意处关闭';
    panel.appendChild(hint);
    this._hintEl = hint;

    mask.appendChild(panel);
    this.el = mask;
    this.panel = panel;

    // ---------- 点击关闭 ----------
    mask.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!self._closable) return;              // 提示未出现 → 忽略点击
      self.close();
    });
    // 阻止面板内部点击冒泡到遮罩导致的误判（这里两者行为一致，保留即可）
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
  };

  /** 打开对话框：挂载 → 逐行淡入 → 定时显示关闭提示 */
  Dialog.prototype.open = function (parent) {
    if (this._open) return this;
    this._open = true;
    this._closable = false;

    (parent || document.getElementById('app')).appendChild(this.el);

    // 触发进场动画（强制回流，保证 transition 生效）
    void this.el.offsetWidth;
    this.el.classList.add('is-open');

    this._revealLines();

    // 约 3 秒后出现"点击任意处关闭"
    var self = this;
    this._hintTimer = setTimeout(function () {
      self._hintEl.classList.add('is-show');
      self._closable = true;
    }, this.opts.hintDelay || 3000);

    return this;
  };

  /** 正文逐条淡入 */
  Dialog.prototype._revealLines = function () {
    var self = this;
    this._lineEls.forEach(function (p, i) {
      self._lineTimers.push(setTimeout(function () {
        p.classList.add('is-show');
      }, 220 + i * (self.opts.lineInterval || 260)));
    });
  };

  /** 关闭：淡出后移除 DOM，并触发回调 */
  Dialog.prototype.close = function () {
    if (!this._open) return;
    this._open = false;
    clearTimeout(this._hintTimer);
    this._lineTimers.forEach(clearTimeout);

    var self = this;
    this.el.classList.remove('is-open');
    this.el.classList.add('is-closing');
    setTimeout(function () {
      if (self.el.parentNode) self.el.parentNode.removeChild(self.el);
      self.el.classList.remove('is-closing');
    }, 380);

    if (this.onClose) this.onClose();
  };

  Dialog.prototype.destroy = function () {
    clearTimeout(this._hintTimer);
    this._lineTimers.forEach(clearTimeout);
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this._open = false;
  };

  global.Dialog = Dialog;

})(window);
