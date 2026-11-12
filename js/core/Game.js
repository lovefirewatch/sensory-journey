/* ============================================================
 * Game.js —— 游戏主控（主循环 / 画布 / 全局服务）
 *
 * 职责：
 * 1. 管理 canvas 尺寸与高分屏适配（DPR）
 * 2. 驱动主循环 requestAnimationFrame，把 update/render 派发给当前场景
 * 3. 挂载全局服务：game.assets / game.audio / game.input / game.scenes / bus
 * 4. 创建常驻 HUD（右上角声音按钮）
 * ============================================================ */

(function (global) {
  'use strict';

  function Game(config) {
    this.cfg = config;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 0; this.height = 0; this.dpr = 1;

    // 全局服务
    this.assets = new AssetLoader(config);
    this.audio  = new AudioManager(config);
    this.input  = new Input(document.getElementById('app'));
    this.scenes = new SceneManager(this);

    this._last = 0;
    this._running = false;
    this._fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;

    this._bindResize();
    this.resize();
    this.applyTheme();
  }

  /**
   * 把 config 里的视觉参数写进 CSS 变量
   * ★ 背景遮罩强度（bgScrim）走这里：改 config 即可，不用动 CSS。
   */
  Game.prototype.applyTheme = function () {
    var s = this.cfg.bgScrim || { top: .10, middle: .03, bottom: .22 };
    var root = document.documentElement;
    if (!root || !root.style) return;
    root.style.setProperty('--scrim-top', String(s.top));
    root.style.setProperty('--scrim-middle', String(s.middle));
    root.style.setProperty('--scrim-bottom', String(s.bottom));
  };

  /** 窗口尺寸变化：重建画布像素并通知所有场景 */
  Game.prototype._bindResize = function () {
    var self = this;
    var onResize = function () { self.resize(); };
    global.addEventListener('resize', onResize);
    global.addEventListener('orientationchange', function () { setTimeout(onResize, 200); });
  };

  Game.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, this.cfg.canvas.pixelRatioCap || 2);
    var w = global.innerWidth, h = global.innerHeight;
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 之后所有绘制都可以用 CSS 像素坐标
    this.scenes.resize(w, h);
    bus.emit('game:resize', { w: w, h: h });
  };

  /**
   * 启动：先加载资源 → 再注册场景 → 进首个场景
   * @param {string}   firstSceneName 首个场景名
   * @param {Function} [onReady]      资源就绪回调：★ 场景注册必须放在这里，
   *                                  因为场景 init() 会读取图片资源，
   *                                  若在加载完成前注册，按钮与卡片就取不到图
   */
  Game.prototype.start = function (firstSceneName, onReady) {
    var self = this;
    var bar = document.getElementById('loading-bar-fill');
    var mask = document.getElementById('loading');

    this.assets.load(function (p) {
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    }).then(function () {
      // 资源加载结果诊断：图片不显示时，先看这里
      var rep = self.assets.report();
      bus.emit('assets:ready', rep);
      if (self.cfg.debug && self.assets.missing.length) {
        console.warn('[Assets] ' + rep.missing.length + '/' + rep.total +
                     ' 张资源未加载成功，已用占位图代替：');
        console.table(self.assets.missing);
        if (rep.allFailed) {
          console.warn(
            '[Assets] 全部图片都失败了 —— 最常见的原因是直接用 file:// 双击打开了 index.html。\n' +
            '请在项目目录执行  python3 -m http.server 8080  后访问 http://localhost:8080\n' +
            '（或确认 assets/ui 下的图片文件确实存在、文件名与 config.js 中声明的一致）'
          );
        }
        self._showAssetWarning(rep);
      }
      // ★ 资源就绪后再建场景与 HUD
      if (onReady) onReady(self);
      if (mask) {
        mask.classList.add('is-hidden');
        setTimeout(function () { mask.style.display = 'none'; }, 520);
      }
      self.scenes.go(firstSceneName || 'title');
      self._loop();
    });
  };

  /** 主循环 */
  Game.prototype._loop = function () {
    var self = this;
    this._running = true;
    function frame(now) {
      var dt = self._last ? (now - self._last) / 1000 : 0.016;
      self._last = now;
      dt = Math.min(dt, self.cfg.canvas.maxDelta || 0.05);   // 防止切后台回来跳帧

      self.scenes.update(dt);
      self.ctx.clearRect(0, 0, self.width, self.height);
      self.scenes.render(self.ctx);

      if (self.cfg.debug) self._fpsCount(dt);
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  };

  /** 调试用 FPS */
  Game.prototype._fpsCount = function (dt) {
    this._fpsAcc += dt; this._fpsFrames++;
    if (this._fpsAcc >= 1) {
      this._fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0; this._fpsFrames = 0;
      bus.emit('game:fps', this._fps);
    }
  };

  /* ============================================================
   * 资源缺失提示条（仅 debug 模式）
   * 作用：图片没加载时不至于悄无声息地退化成占位图，
   * 页面上直接告诉你"几张图没加载 + 最常见原因"
   * ============================================================ */
  Game.prototype._showAssetWarning = function (rep) {
    var box = document.createElement('div');
    box.className = 'asset-warn';
    var tip = rep.allFailed
      ? '全部图片都没加载：若你是双击 index.html 打开的，请改用本地服务器（python3 -m http.server 8080）'
      : '把图片放进 assets/ 对应路径，或检查 config.js 里的 src 是否写错';
    box.innerHTML =
      '<b>⚠ ' + rep.missing.length + '/' + rep.total + ' 张图片未加载</b>' +
      '<span>' + tip + '</span>' +
      '<button type="button" class="asset-warn__btn">×</button>';
    var btn = box.querySelector('.asset-warn__btn');
    btn.addEventListener('click', function () { box.parentNode && box.parentNode.removeChild(box); });
    document.getElementById('app').appendChild(box);
    // 8 秒后自动收起，不挡视线
    setTimeout(function () { box.classList.add('is-fade'); }, 8000);
    setTimeout(function () { box.parentNode && box.parentNode.removeChild(box); }, 8800);
  };

  /* ============================================================
   * 创建常驻 HUD：右上角声音控制按钮
   * 为什么放在这里：声音开关是"全局"的，任何场景都应可见可用
   * ============================================================ */
  Game.prototype.buildGlobalHUD = function () {
    var hud = document.getElementById('hud-layer');
    var wrap = document.createElement('div');
    wrap.className = 'hud-top-right';

    var self = this;
    var A = this.assets;

    // ★ 声音按钮：纯 CSS 图标按钮（切换时会换图标，不再依赖图片）
    var soundBtn = new CssButton({
      className: 'btn-sound',
      variant: 'icon',
      icon: this.audio.muted ? CssButton.ICON.soundOff : CssButton.ICON.soundOn,
      title: this.audio.muted ? '开启声音' : '关闭声音',
      sound: false,                       // 自身不播放点击音（否则静音后听不到反馈）
      onClick: function () {
        var muted = self.audio.toggleMute();
        self.audio.syncBGM();
        soundBtn.setIcon(muted ? CssButton.ICON.soundOff : CssButton.ICON.soundOn);
        soundBtn.setTitle(muted ? '开启声音' : '关闭声音');
        // 从静音切回有声时，尝试起 BGM（浏览器要求先有用户手势，这里正是点击手势）
        if (!muted) self.audio.playBGM();
      }
    });

    wrap.appendChild(soundBtn.el);
    hud.appendChild(wrap);
    this.soundBtn = soundBtn;

    // 监听别处（如设置面板）改变静音状态时，同步按钮图标
    bus.on('audio:mute', function (muted) {
      soundBtn.setIcon(muted ? CssButton.ICON.soundOff : CssButton.ICON.soundOn);
      soundBtn.setTitle(muted ? '开启声音' : '关闭声音');
    });

    return this;
  };

  global.Game = Game;

})(window);
