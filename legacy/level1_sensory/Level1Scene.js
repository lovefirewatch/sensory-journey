/* ============================================================
 * Level1Scene.js —— 第一关「迟到的课堂」主控
 *
 * 职责：
 *   1. 关卡信息卡（标题/副标题/感官/时长/子场景）→ 点击开始
 *   2. 调度四个子场景 A→B→C→D
 *   3. 全局状态机（空闲/基线/自闭症模式/交互/成功/过渡/平静/过载）
 *   4. 平静值与感官休息（右上角「休息一下」+ 归零强制休息）
 *   5. 画面合成：离屏画场景 → 主画布加震动/隧道/变暗等后期
 *
 * ★ 子场景各自只管自己的玩法（js/scenes/level1/SubScene*.js），
 *   全局机制集中在这里，新增子场景只需往 this.subScenes 里加一个。
 * ============================================================ */

(function (global) {
  'use strict';

  /* ---------- 状态机：允许的转换 ----------
   * 对应设计稿的转换规则，另有三处按实际流程补充的出口：
   *   idle → asd      ：B/C/D 没有"3 秒普通模式"，进入即处于感官模式
   *   idle → overload ：D 一进入就被点名，直接触发过载
   *   success → interact：同一子场景内有多个任务时（A 的黑板 → 聚焦声音）
   */
  var TRANSITIONS = {
    idle:       ['baseline', 'asd', 'overload'],
    baseline:   ['asd', 'calm'],
    asd:        ['interact', 'overload', 'calm'],
    interact:   ['success', 'asd', 'calm'],
    success:    ['transition', 'interact', 'calm'],
    transition: ['idle'],
    calm:       ['asd'],
    overload:   ['interact', 'calm']
  };
  var STATE_NAMES = {
    idle: '空闲', baseline: '基线', asd: '自闭症模式', interact: '交互',
    success: '成功', transition: '过渡', calm: '平静', overload: '过载'
  };

  function Level1Scene(game) {
    Scene.call(this, game, 'level1');
    var L = global.LEVEL1;
    this.cfg = L;
    this.g = L.global;

    /* ---------- 全局状态 ---------- */
    this.phase = 'card';          // card → play → end
    this.stateName = 'idle';
    this.calm = this.g.calmMax;
    this.yaw = 0;                 // 视角 -1~1
    this.boardText = '';
    this.dim = 1;                 // 画面亮度（休息时降到 0.5）
    this.shakeOff = { x: 0, y: 0 };
    this.rest = null;             // { active, t, dur, forced }

    /* ---------- 离屏画布 ---------- */
    this.sceneCanvas = document.createElement('canvas');
    this.sceneCtx = this.sceneCanvas.getContext('2d');
    this.trail = document.createElement('canvas');      // 残影用（保存上一帧）
    this.trailCtx = this.trail.getContext('2d');

    this.view = new ClassroomView(game.width, game.height);
    this.sound = null;
    this.subScenes = [];
    this.subIndex = 0;
  }
  Level1Scene.prototype = Object.create(Scene.prototype);
  Level1Scene.prototype.constructor = Level1Scene;

  /* ============================================================
   * 初始化
   * ★ 关键约定：init() 只做"不涉及 DOM 挂载"的准备，
   *   UI 一律延迟到第一次 enter() 再建（见 _ensureUI）。
   *   原因：SceneManager.register() 在启动时就会调用 init()，
   *   若在 init 里把 HUD 挂到 ui-layer，关卡的「休息一下 / 退出」按钮
   *   会从一开机就浮在标题页和选关页上面，既看得见又挡点击。
   * ============================================================ */
  Level1Scene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    /* ---------- 教室元素占位图 ----------
       ★ 教室是"一张全景背景 + 若干元素占位图"搭起来的，不是 canvas 画的。
         换美术只需替换 assets/scenes/l1/ 下的同名文件；
         改位置大小改 js/data/level1.js 的 scene.elements。 */
    this.view.setImages({
      bg:      A.get('scenes.l1Bg'),
      door:    A.get('scenes.l1Door'),
      board:   A.get('scenes.l1Board'),
      desk:    A.get('scenes.l1Desk'),
      chair:   A.get('scenes.l1Chair'),
      teacher: A.get('scenes.l1Teacher'),
      hand:    A.get('scenes.l1Hand'),
      orb:     A.get('scenes.l1Orb'),
      noise:   A.get('scenes.l1Noise'),
      char:    A.get('scenes.l1Char'),
      step:    A.get('scenes.l1Step')
    });

    /* ---------- 子场景 ---------- */
    this.subScenes = [
      new SubSceneA(this, this.view),
      new SubSceneB(this, this.view),
      new SubSceneC(this, this.view),
      new SubSceneD(this, this.view)
    ];
    this.subScenes.forEach(function (s) { s.init(); });

    /* ---------- 音频 ---------- */
    this.sound = new SoundScape(this.game.audio);

    /* ---------- 输入 ---------- */
    bus.on('input:down', function (p) { self._onDown(p); });
    bus.on('input:drag', function (d) { self._onDrag(d); });

    this._uiReady = false;      // UI 尚未创建
    this.el = null;             // 占位根节点（_ensureUI 里创建）
  };

  /**
   * 首次进入关卡时才创建全部 DOM
   * ★ 这样在标题页 / 选关页阶段，本场景在 DOM 里完全不存在，
   *   不会有任何按钮提前出现或拦截点击。
   */
  Level1Scene.prototype._ensureUI = function () {
    if (this._uiReady) return;
    this._uiReady = true;

    // ★ 不创建"占位根节点"：#ui-layer 的直接子元素会继承 pointer-events:auto，
    //   多一个无用的全宽节点就多一层挡点击的风险。

    var hud = document.createElement('div');
    hud.className = 'lvl-hud';
    hud.style.display = 'none';                // 双保险：创建即隐藏，由 enter 控制显示
    this._buildHud(hud);
    this.uiLayer.appendChild(hud);
    this.hudEl = hud;

    this._buildCard();          // 内部已 display:none
    this._buildEndPanel();      // 内部已 display:none
  };

  /* ---------- HUD：顶部提示 / 子场景进度 / 平静条 / 休息 / 退出 ---------- */
  Level1Scene.prototype._buildHud = function (hud) {
    var self = this;
    var A = this.game.assets;

    // ① 顶部提示（居中）
    var hint = document.createElement('div');
    hint.className = 'lvl-hint';
    hud.appendChild(hint);
    this._hintEl = hint;

    // ② 左上角：子场景名 + 进度
    var sub = document.createElement('div');
    sub.className = 'lvl-sub';
    sub.innerHTML = '<span class="lvl-sub__name"></span><span class="lvl-sub__prog"></span>';
    hud.appendChild(sub);
    this._subName = sub.querySelector('.lvl-sub__name');
    this._subProg = sub.querySelector('.lvl-sub__prog');

    // ③ 右上角下方：平静条 + 休息按钮（声音按钮在最上方，故下移避让）
    var right = document.createElement('div');
    right.className = 'lvl-right';

    var calmWrap = document.createElement('div');
    calmWrap.className = 'lvl-calm';
    calmWrap.innerHTML =
      '<span class="lvl-calm__label">平静</span>' +
      '<span class="lvl-calm__track"><i class="lvl-calm__fill"></i></span>';
    right.appendChild(calmWrap);
    this._calmFill = calmWrap.querySelector('.lvl-calm__fill');

    this.btnRest = new ImageButton({
      className: 'btn-rest',
      alt: this.g.restLabel,
      image:   A.get('ui.btnRest'),        // ★ 占位符：assets/ui/btn_rest.png
      hover:   A.get('ui.btnRestHover'),
      pressed: A.get('ui.btnRestPressed'),
      sound: false,
      onClick: function () { self.startRest(false); }
    });
    right.appendChild(this.btnRest.el);

    hud.appendChild(right);

    // ④ 左上角退出（对应"可以随时退出"的承诺）
    this.btnQuit = new ImageButton({
      className: 'btn-back lvl-quit',
      alt: '退出体验',
      image: A.get('ui.btnBack'),
      sound: 'back',
      onClick: function () { self.quit(); }
    });
    hud.appendChild(this.btnQuit.el);
  };

  /* ---------- 关卡信息卡 ---------- */
  Level1Scene.prototype._buildCard = function () {
    var self = this;
    var L = this.cfg, C = L.card;

    var wrap = document.createElement('div');
    wrap.className = 'lvl-card-wrap';

    var card = document.createElement('div');
    card.className = 'lvl-card';
    var panelImg = this.game.assets.get('ui.panelLevelInfo');
    if (panelImg && panelImg.src) card.style.backgroundImage = 'url("' + panelImg.src + '")';

    var subsHtml = L.subScenes.map(function (s, i) {
      return '<li><span class="lvl-card__idx">' + (i + 1) + '</span>' + s + '</li>';
    }).join('');

    card.innerHTML =
      '<p class="lvl-card__eyebrow">第 一 关</p>' +
      '<h2 class="lvl-card__title">' + L.title + '</h2>' +
      '<p class="lvl-card__subtitle">' + L.subtitle + '</p>' +
      '<dl class="lvl-card__meta">' +
        '<dt>' + C.labels.sense + '</dt><dd>' + L.senses.join('、') + '</dd>' +
        '<dt>' + C.labels.duration + '</dt><dd>' + C.durationText + '</dd>' +
      '</dl>' +
      '<div class="lvl-card__subs">' +
        '<div class="lvl-card__subsTitle">' + C.labels.subs + '</div>' +
        '<ol class="lvl-card__subsList">' + subsHtml + '</ol>' +
      '</div>';

    var hint = document.createElement('div');
    hint.className = 'lvl-card__hint';
    hint.textContent = C.hint;
    card.appendChild(hint);
    this._cardHint = hint;

    wrap.appendChild(card);
    this.uiLayer.appendChild(wrap);
    this.cardEl = wrap;
    wrap.style.display = 'none';

    wrap.addEventListener('click', function () {
      if (self.phase === 'card' && self._cardReady) self._startPlay();
    });
  };

  /* ---------- 结束面板 ---------- */
  Level1Scene.prototype._buildEndPanel = function () {
    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'lvl-end';

    var panel = document.createElement('div');
    panel.className = 'lvl-end__panel';
    panel.innerHTML =
      '<p class="lvl-end__eyebrow">第 一 关 · 完成</p>' +
      '<h2>感官需要休息了</h2>' +
      '<p class="lvl-end__text">' +
        '你只在这个教室里待了几分钟。<br>' +
        '而对一些人来说，这是一整天的日常 —— 没有"退出"按钮，' +
        '也没有人告诉他们可以休息。<br><br>' +
        '感谢你走完这一段。' +
      '</p>';

    var back = new ImageButton({
      className: 'btn-back lvl-end__back',
      alt: '返回关卡选择',
      image: this.game.assets.get('ui.btnBack'),
      sound: 'back',
      onClick: function () { self.quit(); }
    });
    panel.appendChild(back.el);

    wrap.appendChild(panel);
    this.uiLayer.appendChild(wrap);
    this.endEl = wrap;
    wrap.style.display = 'none';
  };

  /* ============================================================
   * 进入 / 退出
   * ============================================================ */
  Level1Scene.prototype.enter = function () {
    Scene.prototype.enter.call(this);
    this._ensureUI();                          // ★ 首次进入才建 DOM

    this.phase = 'card';
    this.calm = this.g.calmMax;
    this.yaw = 0;
    this.dim = 1;
    this.rest = null;
    this.stateName = 'idle';
    this.subIndex = 0;
    this.boardText = '';

    this.setBackground(null);                  // 教室由 canvas 绘制
    this._resizeOffscreen();

    // 显示信息卡，隐藏 HUD 与结束面板
    this.cardEl.style.display = '';
    this.cardEl.classList.remove('is-leaving');
    this.hudEl.style.display = 'none';
    this.endEl.style.display = 'none';
    this._cardReady = false;
    this._cardHint.classList.remove('is-show');

    var self = this;
    this._cardTimer = setTimeout(function () {
      self._cardReady = true;
      self._cardHint.classList.add('is-show');
    }, this.cfg.card.hintDelay * 1000);

    // 音频解锁后启动声景（普通模式：安静的教室）
    this.game.audio.unlock();
    if (this.sound && this.game.audio.ctx) {
      this.sound.start();
      this.sound.setMode('normal');
    }
  };

  Level1Scene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
    clearTimeout(this._cardTimer);
    clearTimeout(this._hintTimer);
    if (this.sound) { this.sound.stop(); }
    if (this.cardEl) this.cardEl.style.display = 'none';
    if (this.endEl) this.endEl.style.display = 'none';
    if (this.hudEl) this.hudEl.style.display = 'none';
  };

  /** 从信息卡进入正式体验 */
  Level1Scene.prototype._startPlay = function () {
    if (this.phase !== 'card') return;
    var self = this;
    this.phase = 'play';
    this.cardEl.classList.add('is-leaving');
    setTimeout(function () { self.cardEl.style.display = 'none'; }, 500);
    this.hudEl.style.display = '';
    this._startSubScene(0);
  };

  Level1Scene.prototype._startSubScene = function (i) {
    if (i >= this.subScenes.length) { this._finish(); return; }
    this.subIndex = i;
    this.setState('idle');
    var s = this.subScenes[i];
    this._subName.textContent = s.name;
    this.setHint('', 0);
    s.enter();          // 各子场景在自己的 enter() 里决定初始状态
  };

  Level1Scene.prototype._finish = function () {
    this.phase = 'end';
    this.endEl.style.display = '';
    this.hudEl.style.display = 'none';
    if (this.sound) { this.sound.breathOn(false); this.sound.fadeOut(1.2); }
    bus.emit('level1:finish', { level: 1 });
  };

  Level1Scene.prototype.quit = function () {
    if (this.sound) this.sound.stop();
    this.game.scenes.go('select', {}, false);
  };

  /* ============================================================
   * 状态机
   * ============================================================ */
  Level1Scene.prototype.setState = function (s) {
    if (!TRANSITIONS[s]) return;
    var allowed = TRANSITIONS[this.stateName] || [];
    if (this.stateName !== s && allowed.indexOf(s) < 0 && this.game.cfg.debug) {
      console.warn('[状态机] 非预期转换：' + STATE_NAMES[this.stateName] +
                   ' → ' + STATE_NAMES[s] + '（已放行，但请检查子场景逻辑）');
    }
    this.stateName = s;
    bus.emit('level1:state', { from: this.stateName, to: s, name: STATE_NAMES[s] });
  };

  /** 子场景完成后由 update 检测并推进（_advancing 防重入） */
  Level1Scene.prototype._advance = function () {
    if (this._advancing) return;
    var cur = this.subScenes[this.subIndex];
    if (!cur || !cur.isDone()) return;
    this._advancing = true;
    cur.exit();
    this.setState('transition');
    this.setHint('下一个场景……', 1.2);
    var self = this;
    setTimeout(function () {
      self._advancing = false;
      self.setState('idle');
      self._startSubScene(self.subIndex + 1);
    }, 700);
  };

  /* ============================================================
   * 平静值 / 感官休息
   * ============================================================ */
  Level1Scene.prototype.drainCalm = function (v) {
    this.calm = Math.max(0, this.calm - v);
  };

  /**
   * 开始休息
   * @param {boolean} forced true=平静值归零的强制休息（3 秒）
   */
  Level1Scene.prototype.startRest = function (forced) {
    if (this.rest && this.rest.active) return;
    var g = this.g;
    this.rest = {
      active: true, t: 0, forced: !!forced,
      dur: forced ? g.forceRestSec : (g.restFadeSec + g.restHoldSec)
    };
    this.setState('calm');
    this.setHint(forced ? '平静值耗尽 —— 强制休息 3 秒' : '休息一下……', forced ? 3 : 2);
    // 声音淡出约 1 秒
    if (this.sound) this.sound.fadeOut(g.restFadeSec);
  };

  Level1Scene.prototype._endRest = function () {
    this.rest = null;
    this.calm = this.g.calmMax;                  // 休息后恢复
    this.setState('asd');
    this.setHint('感官刺激重新涌来', 2);
    if (this.sound) this.sound.fadeIn(0.8);
  };

  /* ============================================================
   * 输入
   * ============================================================ */
  Level1Scene.prototype._onDown = function (p) {
    if (this.phase !== 'play' || !this.active) return;
    var s = this.subScenes[this.subIndex];
    if (s && !this.rest) s.onPointerDown(p.x, p.y);
  };

  Level1Scene.prototype._onDrag = function (d) {
    if (this.phase !== 'play' || !this.active) return;
    var s = this.subScenes[this.subIndex];
    if (s && !this.rest) s.onDrag(d.dx, 0);
  };

  Level1Scene.prototype.addYaw = function (v) {
    this.yaw = Math.max(-1, Math.min(1, this.yaw + v));
  };
  Level1Scene.prototype.setYaw = function (v) { this.yaw = Math.max(-1, Math.min(1, v)); };
  Level1Scene.prototype.setBoardText = function (t) { this.boardText = t; };
  Level1Scene.prototype.setHint = function (text, sec) {
    if (!this._hintEl) return;
    var el = this._hintEl;
    if (!text) { el.classList.remove('is-show'); return; }
    el.textContent = text;
    el.classList.add('is-show');
    clearTimeout(this._hintTimer);
    if (sec > 0) {
      this._hintTimer = setTimeout(function () { el.classList.remove('is-show'); }, sec * 1000);
    }
  };

  /* ============================================================
   * 每帧
   * ============================================================ */
  Level1Scene.prototype.update = function (dt) {
    this.t = (this.t || 0) + dt;

    if (this.phase === 'card') {
      // 信息卡阶段：背景画一个安静的教室
      return;
    }

    if (this.phase === 'end') return;

    /* ---------- 休息中 ---------- */
    if (this.rest && this.rest.active) {
      var r = this.rest;
      r.t += dt;
      // 画面变暗到 0.5（1 秒内完成）
      var k = Math.min(1, r.t / this.g.restFadeSec);
      this.dim = 1 - (1 - this.g.restDim) * k;
      if (r.t >= r.dur) this._endRest();
      return;                                   // 休息期间暂停子场景
    }
    this.dim += (1 - this.dim) * Math.min(1, dt * 4);

    /* ---------- 平静值衰减 ---------- */
    var decayStates = ['asd', 'interact', 'overload'];
    if (decayStates.indexOf(this.stateName) >= 0) {
      this.calm -= this.g.calmDecay * dt;
      if (this.calm <= 0) { this.calm = 0; this.startRest(true); return; }
    }
    if (this._calmFill) {
      this._calmFill.style.width = Math.max(0, this.calm / this.g.calmMax * 100).toFixed(1) + '%';
      this._calmFill.className = 'lvl-calm__fill' +
        (this.calm < 30 ? ' is-low' : (this.calm < 60 ? ' is-mid' : ''));
    }

    /* ---------- 子场景 ---------- */
    var s = this.subScenes[this.subIndex];
    if (s) {
      s.update(dt);
      if (this._subProg) this._subProg.textContent = s.progressText();
      if (s.isDone()) this._advance();
    }
  };

  /* ============================================================
   * 渲染
   * ============================================================ */
  Level1Scene.prototype.render = function (ctx) {
    var W = this.game.width, H = this.game.height;

    if (this.phase === 'card') {
      // 信息卡阶段：安静的教室（普通模式，无频闪）
      this.view.draw(ctx, 0, { mode: 'normal', flicker: 1, boardText: '' });
      ctx.save();
      ctx.fillStyle = 'rgba(8,11,22,.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }

    var s = this.subScenes[this.subIndex];
    if (!s) return;

    // ① 把场景画到离屏画布
    var g = this.sceneCtx;
    g.clearRect(0, 0, W, H);
    s.render(g, W, H);

    // ② 更新残影缓存（保存当前帧，下一帧用作 afterimage）
    this.trailCtx.clearRect(0, 0, W, H);
    this.trailCtx.drawImage(this.sceneCanvas, 0, 0);

    // ③ 叠加到主画布（带过载震动）
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.stateName === 'overload') {
      var d = global.LEVEL1.subD;
      var sh = FX.shake(this.t, d.shakeAmp, d.shakeHz);
      ctx.translate(sh.x, sh.y);
    }
    ctx.drawImage(this.sceneCanvas, 0, 0);
    ctx.restore();

    // ④ 子场景的后期特效（如 B 的隧道视野）
    if (s.postFX) s.postFX(ctx, W, H, this.sceneCanvas);

    // ⑤ 休息 / 平静值低时压暗画面
    if (this.dim < 0.999) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - this.dim).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  /* ---------- 尺寸变化 ---------- */
  Level1Scene.prototype.resize = function (w, h) {
    this.view.resize(w, h);
    this._resizeOffscreen();
    this.subScenes.forEach(function (s) {
      if (s.onResize) s.onResize(w, h);
    });
  };

  Level1Scene.prototype._resizeOffscreen = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var W = this.game.width, H = this.game.height;
    [[this.sceneCanvas, this.sceneCtx], [this.trail, this.trailCtx]].forEach(function (pair) {
      pair[0].width = Math.floor(W * dpr);
      pair[0].height = Math.floor(H * dpr);
      pair[0].style.width = W + 'px';
      pair[0].style.height = H + 'px';
      pair[1].setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  };

  global.Level1Scene = Level1Scene;

})(window);
