/* ============================================================
 * LevelIntroScene.js —— 关卡开始前的伪加载页
 *
 * 流程：
 *   1. 进度条在 intro.duration 秒内跑满，同时正文逐段淡入
 *   2. 跑满后：进度条淡出，「我准备好了」「再了解一下」两个图片按钮淡入
 *   3. 点「再了解一下」→ 返回关卡选择（不进入）
 *   4. 点「我准备好了」→ 渐隐 → 进入关卡（Level1Scene 的关卡信息卡）
 *
 * ★ 文案在 js/data/level1.js 的 intro 段，排版样式见 css 的 .li-* 类
 * ★ 两个按钮的图片占位符：assets/ui/btn_ready.png、btn_know_more.png
 * ============================================================ */

(function (global) {
  'use strict';

  function LevelIntroScene(game) {
    Scene.call(this, game, 'level-intro');
    this.p = 0;                  // 进度 0~1
    this.lineEls = [];
    this._ready = false;         // 进度是否跑满
  }
  LevelIntroScene.prototype = Object.create(Scene.prototype);
  LevelIntroScene.prototype.constructor = LevelIntroScene;

  LevelIntroScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;
    var L = global.LEVEL1.intro;

    var wrap = document.createElement('div');
    wrap.className = 'li-wrap';

    /* ---------- 正文区 ---------- */
    var text = document.createElement('div');
    text.className = 'li-text';

    L.paragraphs.forEach(function (p) {
      var el = document.createElement('p');
      el.className = 'li-p';
      el.textContent = p;
      text.appendChild(el);
      self.lineEls.push(el);
    });

    // 操作提示块（单独一块，左对齐，视觉上和正文区分）
    var ops = document.createElement('div');
    ops.className = 'li-ops';
    var opsTitle = document.createElement('div');
    opsTitle.className = 'li-ops__title';
    opsTitle.textContent = L.opsTitle;
    ops.appendChild(opsTitle);
    var ul = document.createElement('ul');
    ul.className = 'li-ops__list';
    L.ops.forEach(function (o) {
      var li = document.createElement('li');
      li.textContent = o;
      ul.appendChild(li);
    });
    ops.appendChild(ul);
    text.appendChild(ops);

    wrap.appendChild(text);

    /* ---------- 底部：进度条 → 按钮 ---------- */
    var bottom = document.createElement('div');
    bottom.className = 'li-bottom';

    var barWrap = document.createElement('div');
    barWrap.className = 'li-progress';
    var bar = document.createElement('i');
    bar.className = 'li-progress__fill';
    barWrap.appendChild(bar);
    bottom.appendChild(barWrap);
    this._barWrap = barWrap;
    this._bar = bar;

    var actions = document.createElement('div');
    actions.className = 'li-actions';

    // ① 我准备好了
    this.btnReady = new CssButton({
      className: 'btn-ready',
      variant: 'primary',
      text: L.btnReady,
      onClick: function () { self._startLevel(); }
    });

    // ② 再了解一下
    this.btnKnow = new CssButton({
      className: 'btn-know',
      variant: 'ghost',
      text: L.btnKnowMore,
      sound: 'back',
      onClick: function () { self._goBack(); }
    });

    actions.appendChild(this.btnReady.el);
    actions.appendChild(this.btnKnow.el);
    bottom.appendChild(actions);
    this._actions = actions;

    wrap.appendChild(bottom);
    this.el = wrap;
    this.uiLayer.appendChild(wrap);
    wrap.style.display = 'none';
  };

  /* ---------- 进入：重置进度并开始 ---------- */
  LevelIntroScene.prototype.enter = function (params) {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    this.params = params || {};
    this.p = 0;
    this._ready = false;
    this._leaving = false;

    /* ★ 全部文字一次性展现：不做逐段淡入，也不做滚动区域。
       正文整体淡入一次即可，保证一屏内读完、无需上下滑动。 */
    this.lineEls.forEach(function (el) { el.classList.add('is-show'); });
    this.el.classList.remove('is-leaving');
    this._bar.style.width = '0%';
    this._barWrap.classList.remove('is-hidden');
    this._actions.classList.remove('is-show');

    this.setBackground(this.game.assets.get('ui.bgClassroom'));   // ★ 关卡背景占位符
  };

  LevelIntroScene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
  };

  /* ---------- 每帧：推进进度条 ---------- */
  LevelIntroScene.prototype.update = function (dt) {
    if (this._ready || this._leaving) return;
    var L = global.LEVEL1.intro;
    this.p += dt / L.duration;
    if (this.p >= 1) { this.p = 1; this._onProgressDone(); }
    this._bar.style.width = (this.p * 100).toFixed(1) + '%';
  };

  LevelIntroScene.prototype._onProgressDone = function () {
    if (this._ready) return;
    this._ready = true;
    // 进度条淡出 → 两个按钮淡入（"进度条变成了按钮"）
    var self = this;
    this._barWrap.classList.add('is-hidden');
    setTimeout(function () { self._actions.classList.add('is-show'); }, 260);
  };

  /** 点「我准备好了」→ 渐隐进入关卡 */
  LevelIntroScene.prototype._startLevel = function () {
    if (this._leaving) return;
    this._leaving = true;
    var self = this;
    this.el.classList.add('is-leaving');
    setTimeout(function () {
      self.game.scenes.go('level1', self.params, true);
    }, 480);
  };

  /** 点「再了解一下」→ 返回关卡选择 */
  LevelIntroScene.prototype._goBack = function () {
    if (this._leaving) return;
    this._leaving = true;
    var self = this;
    this.el.classList.add('is-leaving');
    setTimeout(function () {
      self.game.scenes.go('select', {}, false);
    }, 380);
  };

  LevelIntroScene.prototype.render = function () {
    // 本页纯 DOM，主画布不绘制
  };

  global.LevelIntroScene = LevelIntroScene;

})(window);
