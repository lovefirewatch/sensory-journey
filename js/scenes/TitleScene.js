/* ============================================================
 * TitleScene.js —— 标题页面
 *
 * 包含元素（都是你的图片）：
 *   1. 背景图   assets/ui/bg_title.jpg
 *   2. 开始按钮 assets/ui/btn_start.png
 *   3. 关于按钮 assets/ui/btn_about.png
 *   4. 声音按钮 右上角（由 Game.buildGlobalHUD 创建，常驻）
 *   5. 氛围粒子：canvas 上绘制的缓慢漂浮光点，强化"感官"主题
 *
 * ★ 后续开发：想加"设置/关卡选择"按钮，复制 init 里任意一个按钮的写法即可
 * ============================================================ */

(function (global) {
  'use strict';

  function TitleScene(game) {
    Scene.call(this, game, 'title');
    this.particles = [];        // 背景漂浮光点
    this._t = 0;
  }
  TitleScene.prototype = Object.create(Scene.prototype);
  TitleScene.prototype.constructor = TitleScene;

  /* ---------- 初始化：建 DOM 与按钮（只执行一次） ---------- */
  TitleScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    var wrap = document.createElement('div');
    wrap.className = 'title-wrap';

    /* 标题 LOGO
       ★ 默认关闭（config.title.showTitleLogo = false）：
         标题文字/占位图都不渲染 —— 标题已经做进背景图里了，
         再叠一层占位会挡住背景、也显得多余。
       需要单独一层 LOGO 时把开关打开，会用 ui.logoTitle 这张图。 */
    var titleCfg = this.game.cfg.title || {};
    if (titleCfg.showTitleLogo) {
      var logo = document.createElement('div');
      logo.className = 'title-logo';
      var logoImg = A.get('ui.logoTitle');
      if (logoImg && logoImg.src && logoImg.naturalWidth !== 0) {
        var im = document.createElement('img');
        im.src = logoImg.src;
        im.style.width = '60vmin';
        im.alt = '感官之旅';
        logo.appendChild(im);
      } else {
        logo.innerHTML =
          '<h1>感 官 之 旅</h1>' +
          '<p>第一人称 · 自闭症儿童感官体验</p>';
      }
      wrap.appendChild(logo);
    }

    // ---------- 菜单按钮组 ----------
    var menu = document.createElement('div');
    menu.className = 'title-menu';

    // ① 开始绘本按钮
    this.btnStart = new CssButton({
      className: 'btn-start',
      variant: 'primary',
      text: '开始绘本',
      onClick: function () {
        self.showIntro();      // 先弹出介绍说明，关闭后再进入场景选择
      }
    });

    // ② 关于按钮
    this.btnAbout = new CssButton({
      className: 'btn-about',
      variant: 'ghost',
      text: '关于',
      onClick: function () {
        self.game.scenes.go('about', {}, true);      // 压栈，方便返回
      }
    });

    menu.appendChild(this.btnStart.el);
    menu.appendChild(this.btnAbout.el);
    wrap.appendChild(menu);

    this.el = wrap;
    this.uiLayer.appendChild(wrap);
    wrap.style.display = 'none';

    this._initParticles();
  };

  /** 生成背景漂浮光点（纯装饰，性能开销很小） */
  TitleScene.prototype._initParticles = function () {
    this.particles = [];
    for (var i = 0; i < 60; i++) {
      this.particles.push({
        x: Math.random(), y: Math.random(),          // 归一化坐标，适配任意分辨率
        r: 0.6 + Math.random() * 2.2,
        sp: 0.01 + Math.random() * 0.035,            // 上升速度
        ph: Math.random() * Math.PI * 2,             // 呼吸相位
        a: 0.12 + Math.random() * 0.35               // 透明度
      });
    }
  };

  /* ============================================================
   * 点击"开始绘本" → 弹出介绍说明对话框
   * 规则：
   *   · 正文逐段淡入
   *   · 约 3 秒后底部出现一行小字"点击任意处关闭"（此时才允许关闭，避免误触跳过）
   *   · 用户点击任意处关闭 → 进入场景选择页
   * ★ 改文案：js/config.js 的 GAME_CONFIG.intro
   * ============================================================ */
  TitleScene.prototype.showIntro = function () {
    var self = this;
    var cfg = this.game.cfg.intro || {};

    if (this._dialog) this._dialog.destroy();   // 重复点击时先清掉旧的

    this._dialog = new Dialog({
      title: cfg.title || '',
      lines: cfg.lines || [],
      hintText: cfg.hintText || '点击任意处关闭',
      hintDelay: cfg.hintDelay || 3000,
      lineInterval: cfg.lineInterval || 260,
      panelImage: this.game.assets.get('ui.panelDialog'),   // ★ 面板底图占位符
      onClose: function () {
        // 关闭后进入「选择生活场景」
        self.game.scenes.go('select', {}, true);
      }
    });
    this._dialog.open(document.getElementById('app'));
  };

  /* ---------- 进入场景 ---------- */
  TitleScene.prototype.enter = function () {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    // ★ 标题页背景图占位符：换成你的背景图路径即可（见 config.js: ui.bgTitle）
    this.setBackground(this.game.assets.get('ui.bgTitle'));
    this.game.audio.playBGM();                       // 进入标题页起 BGM（静音时自动无声）

    // 从其他页返回标题时，清理可能残留的介绍对话框
    if (this._dialog) { this._dialog.destroy(); this._dialog = null; }
  };

  TitleScene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
  };

  /* ---------- 每帧更新：光点漂移 ---------- */
  TitleScene.prototype.update = function (dt) {
    this._t += dt;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.y -= p.sp * dt;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }   // 飘出顶部后循环
    }
  };

  /* ---------- 每帧绘制：漂浮光点（背景与按钮由 DOM 负责） ---------- */
  TitleScene.prototype.render = function (ctx) {
    var W = this.game.width, H = this.game.height;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var alpha = p.a * (0.6 + 0.4 * Math.sin(this._t * 1.2 + p.ph));   // 呼吸闪烁
      var x = p.x * W + Math.sin(this._t * 0.4 + p.ph) * 14;
      var y = p.y * H;
      var g = ctx.createRadialGradient(x, y, 0, x, y, p.r * 8);
      g.addColorStop(0, 'rgba(180,220,255,' + alpha.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(180,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, p.r * 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  global.TitleScene = TitleScene;

})(window);
