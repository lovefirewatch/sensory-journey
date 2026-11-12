/* ============================================================
 * PendingScene.js —— "已选择场景"的落点（下一步开发的入口）
 *
 * 按需求，流程到这里就结束：用户选定场景后暂停，等待下一步设计。
 * 本页只做三件事：
 *   1. 回显用户选中的场景名，给出明确的"已选择"反馈
 *   2. 用一句话说明接下来会发生什么（后续接入体验场景后替换）
 *   3. 提供返回按钮，可回到场景选择重新挑
 *
 * ★ 后续开发：本页可直接删掉，把 SceneSelectScene.confirm() 里的
 *   scenes.go('pending', ...) 改成 scenes.go('experience', { sceneId }) 即可，
 *   第一人称体验的原型已经写在 js/scenes/ExperienceScene.js 里备用。
 * ============================================================ */

(function (global) {
  'use strict';

  function PendingScene(game) {
    Scene.call(this, game, 'pending');
    this.scene = null;
  }
  PendingScene.prototype = Object.create(Scene.prototype);
  PendingScene.prototype.constructor = PendingScene;

  PendingScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    var wrap = document.createElement('div');
    wrap.className = 'pending-wrap';

    var panel = document.createElement('div');
    panel.className = 'pending-panel';
    var panelImg = A.get('ui.panelDialog');
    if (panelImg && panelImg.src) panel.style.backgroundImage = 'url("' + panelImg.src + '")';

    panel.innerHTML =
      '<p class="pending-eyebrow">已选择场景</p>' +
      '<h2 class="pending-title"></h2>' +
      '<p class="pending-desc"></p>' +
      '<p class="pending-note">接下来，你将以第一人称视角进入这个场景，' +
      '体验它带来的感官差异。<br><span class="pending-todo">（第一人称体验部分待开发）</span></p>';

    var back = new CssButton({
      className: 'btn-back pending-back',
      variant: 'icon',
      icon: CssButton.ICON.back,
      title: '返回场景选择',
      sound: 'back',
      onClick: function () { self.game.scenes.back(); }
    });
    panel.appendChild(back.el);

    wrap.appendChild(panel);
    this.el = wrap;
    this._titleEl = panel.querySelector('.pending-title');
    this._descEl = panel.querySelector('.pending-desc');
    this.uiLayer.appendChild(wrap);
    wrap.style.display = 'none';
  };

  PendingScene.prototype.enter = function (params) {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    var s = (params && params.scene) || global.SCENE_CARDS[0];
    this.scene = s;
    this._titleEl.textContent = s.title;
    this._descEl.textContent = s.subtitle;
    this.setBackground(this.game.assets.get('ui.bgSelect'));

    // 把选中结果广播出去，方便后续埋点或别处读取
    bus.emit('scene:selected', { id: s.id, title: s.title });
    if (this.game.cfg.debug) console.log('[PendingScene] 用户选择：', s.id, s.title);
  };

  global.PendingScene = PendingScene;

})(window);
