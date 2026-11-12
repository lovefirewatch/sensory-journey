/* ============================================================
 * AboutScene.js —— 关于页面
 *
 * 内容：项目背景说明 + 玩法说明 + 返回按钮（图片）
 * ★ 后续开发：文案建议抽到 js/data/copy.js 做多语言/统一维护
 * ============================================================ */

(function (global) {
  'use strict';

  function AboutScene(game) {
    Scene.call(this, game, 'about');
  }
  AboutScene.prototype = Object.create(Scene.prototype);
  AboutScene.prototype.constructor = AboutScene;

  AboutScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    var wrap = document.createElement('div');
    wrap.className = 'about-wrap';

    var panel = document.createElement('div');
    panel.className = 'about-panel';

    // ★ 关于面板底图占位符：assets/ui/panel_about.png
    var panelImg = A.get('ui.panelAbout');
    if (panelImg && panelImg.src) panel.style.backgroundImage = 'url("' + panelImg.src + '")';

    panel.innerHTML =
      '<h2>关于本作</h2>' +
      '<p>《感官之旅》是一款以第一人称视角呈现自闭症儿童感官体验的交互式作品。' +
      '你将在一段普通的日常场景——走廊、教室、超市——中，' +
      '以他们的神经系统去"听"、"看"和"感受"这个世界。</p>' +

      '<h3>为什么这样做</h3>' +
      '<p>许多自闭症人士存在感觉处理差异：荧光灯的频闪、走廊里交叠的人声、' +
      '衣领标签的摩擦，这些对大多数人"自动忽略"的背景信息，' +
      '对他们可能是持续、放大且难以关闭的输入。当输入超过承受范围，就会出现"感官过载"。</p>' +

      '<h3>玩法</h3>' +
      '<ul>' +
      '<li>移动鼠标 / 拖拽屏幕：转动视线</li>' +
      '<li>注视刺激源：对应感官通道强度上升，画面与声音随之变化</li>' +
      '<li>按住空格或屏幕：进行自我调节（深呼吸 / 遮挡 / 转移注意力）</li>' +
      '<li>守住底部"感官负载"不超过警戒线，走到走廊尽头即完成体验</li>' +
      '</ul>' +

      '<h3>说明</h3>' +
      '<p>本作为科普与共情目的设计，个体之间差异极大，无法代表所有自闭症人士的真实感受。' +
      '如你或家人需要专业支持，请咨询医疗与教育专业人士。</p>';

    // ---------- 返回按钮（图片） ----------
    var backBtn = new CssButton({
      className: 'btn-back about-back',
      variant: 'icon',
      icon: CssButton.ICON.back,
      title: '返回',
      sound: 'back',
      onClick: function () { self.game.scenes.back(); }   // 回到进入前的场景
    });
    panel.appendChild(backBtn.el);

    wrap.appendChild(panel);
    this.el = wrap;
    this.uiLayer.appendChild(wrap);
    wrap.style.display = 'none';
  };

  AboutScene.prototype.enter = function () {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    // 关于页沿用标题背景（也可换成专属背景图 ui.bgAbout）
    this.setBackground(this.game.assets.get('ui.bgTitle'));
  };

  global.AboutScene = AboutScene;

})(window);
