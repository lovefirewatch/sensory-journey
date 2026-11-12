/* ============================================================
 * SceneSelectScene.js —— 选择生活场景
 *
 * 流程位置：标题页 → 介绍对话框 → 【本页：场景选择】→ （下一步）第一人称体验
 *
 * 本页职责：
 *   1. 展示 5 个生活场景卡片（左右滑动切换，带 3D coverflow + 卡片氛围动效）
 *   2. 提供左右箭头按钮（★ 图片按钮，移动端滑动之外的兜底操作）
 *   3. 显示当前场景的简要说明
 *   4. 点击卡片 / 点击"进入"按钮 → 走转场动画 → 交给下一步场景
 *
 * ★ 后续开发：确认进入后改一行即可接入体验场景
 *     game.scenes.go('experience', { sceneId: item.id });
 * ============================================================ */

(function (global) {
  'use strict';

  function SceneSelectScene(game) {
    Scene.call(this, game, 'select');
    this.carousel = null;
    this.current = null;      // 当前选中的场景数据
    this._entering = false;   // 防止连点重复进入
  }
  SceneSelectScene.prototype = Object.create(Scene.prototype);
  SceneSelectScene.prototype.constructor = SceneSelectScene;

  /* ---------- 初始化：建 DOM（只执行一次） ---------- */
  SceneSelectScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    var wrap = document.createElement('div');
    wrap.className = 'select-wrap';

    /* ---------- 顶部标题 ---------- */
    var head = document.createElement('div');
    head.className = 'select-head';
    head.innerHTML =
      '<h2 class="select-title">选择你想体验的场景</h2>' +
      '<p class="select-sub">左右滑动浏览 · 点击进入</p>';
    wrap.appendChild(head);

    /* ---------- 轮播 ---------- */
    var carousel = new Carousel({
      container: wrap,
      items: global.SCENE_CARDS,
      assets: A,
      onChange: function (idx, item) { self._onChange(item); },
      onSelect: function (idx, item) { self.confirm(item); }
    });
    this.carousel = carousel;
    wrap.appendChild(carousel.el);

    /* ---------- 左右箭头（★ 图片按钮） ---------- */
    var arrowL = new CssButton({
      className: 'btn-arrow btn-arrow--left',
      variant: 'icon',
      icon: CssButton.ICON.left,
      title: '上一个场景',
      sound: 'hover',
      onClick: function () { carousel.goTo(carousel.index - 1); }
    });
    var arrowR = new CssButton({
      className: 'btn-arrow btn-arrow--right',
      variant: 'icon',
      icon: CssButton.ICON.right,
      title: '下一个场景',
      sound: 'hover',
      onClick: function () { carousel.goTo(carousel.index + 1); }
    });
    wrap.appendChild(arrowL.el);
    wrap.appendChild(arrowR.el);
    this.arrowL = arrowL; this.arrowR = arrowR;

    /* ---------- 底部：场景说明 + 进入按钮 ---------- */
    var foot = document.createElement('div');
    foot.className = 'select-foot';

    var info = document.createElement('div');
    info.className = 'select-info';
    info.innerHTML = '<h3 class="select-info__title"></h3><p class="select-info__desc"></p>';
    foot.appendChild(info);
    this._infoTitle = info.querySelector('.select-info__title');
    this._infoDesc = info.querySelector('.select-info__desc');

    var enter = new CssButton({
      className: 'btn-enter',
      variant: 'primary',
      text: '进入这个场景',
      sound: 'click',
      onClick: function () {
        if (self.current) self.confirm(self.current);
      }
    });
    foot.appendChild(enter.el);
    this.enterBtn = enter;

    wrap.appendChild(foot);

    /* ---------- 返回按钮（回到标题页） ---------- */
    var back = new CssButton({
      className: 'btn-back select-back',
      variant: 'icon',
      icon: CssButton.ICON.back,
      title: '返回标题',
      sound: 'back',
      onClick: function () { self.game.scenes.go('title', {}, false); }
    });
    wrap.appendChild(back.el);

    this.el = wrap;
    this.uiLayer.appendChild(wrap);
    wrap.style.display = 'none';
  };

  /** 切换卡片时更新底部说明文字 */
  SceneSelectScene.prototype._onChange = function (item) {
    this.current = item;
    if (this._infoTitle) this._infoTitle.textContent = item.title;
    if (this._infoDesc) this._infoDesc.textContent = item.subtitle;
    // 箭头到达两端时置灰
    var i = this.carousel.index;
    this.arrowL.setEnabled(i > 0);
    this.arrowR.setEnabled(i < global.SCENE_CARDS.length - 1);
  };

  /* ---------- 进入场景 ---------- */
  SceneSelectScene.prototype.enter = function (params) {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    this.setBackground(this.game.assets.get('ui.bgSelect'));   // ★ 选择页背景占位符

    // 清掉上一次进入时留下的转场状态，否则再次进来页面会是透明的
    this._entering = false;
    this.el.classList.remove('is-leaving');
    this.carousel.cards.forEach(function (c) { c.el.classList.remove('is-entering'); });

    this.carousel.index = 0;
    this.carousel.position = 0;
    this.carousel.target = 0;
    this.carousel.velocity = 0;
    this.carousel.enabled = true;           // 退出本页后不再响应键盘
    this.carousel.resize();                 // 进入时才拿得到真实尺寸（此前 DOM 隐藏）
    this._onChange(global.SCENE_CARDS[0]);
  };

  SceneSelectScene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
    if (this.carousel) this.carousel.enabled = false;   // 离开后停止响应方向键
  };

  SceneSelectScene.prototype.update = function (dt) {
    if (this.carousel) this.carousel.update(dt);
  };

  SceneSelectScene.prototype.render = function () {
    // 本页全部由 DOM/Canvas 卡片呈现，主画布不额外绘制
  };

  SceneSelectScene.prototype.resize = function () {
    if (this.carousel) this.carousel.resize();
  };

  /**
   * 确认进入某个场景
   * ★ 分流规则：卡片数据里带 levelId 的走已开发关卡（伪加载页 → 关卡），
   *   其余场景仍落到 pending 占位页。后续每开发完一关，
   *   在 js/data/sceneCards.js 对应卡片上加 levelId: N 即可接入。
   */
  SceneSelectScene.prototype.confirm = function (item) {
    if (this._entering) return;
    this._entering = true;

    var self = this;
    // 转场：卡片高亮放大（视觉上"走进去"），随后切场景
    var card = this.carousel.cards[this.carousel.index];
    if (card) card.el.classList.add('is-entering');
    this.el.classList.add('is-leaving');

    setTimeout(function () {
      if (item && item.levelId) {
        self.game.scenes.go('level-intro', { scene: item, levelId: item.levelId }, true);
      } else {
        self.game.scenes.go('pending', { scene: item }, true);
      }
    }, 520);
  };

  global.SceneSelectScene = SceneSelectScene;

})(window);
