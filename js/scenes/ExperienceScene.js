/* ============================================================
 * ExperienceScene.js —— 第一人称感官体验场景（核心玩法骨架）
 *
 * 本场景是"框架中的框架"：跑通了完整机制闭环，但所有内容都设计成可替换的。
 *
 * 当前实现（占位版）：
 *   · 伪 3D 走廊：用 canvas 透视网格模拟，无需任何美术资源就能跑
 *   · 刺激源：荧光灯（视觉）/ 人群声（听觉）/ 衣领标签（触觉）三个热点
 *   · 感官负载：注视热点 → 对应通道强度上升 → 负载累积 → 过载失真
 *   · 自我调节：按住空格/屏幕 → 负载下降（这是本作要传达的核心动作）
 *
 * ★ 后续开发替换点（都在代码里用 TODO 标注）：
 *   1. 走廊 → 换成全景图 / three.js 3D 场景，只需保留 project() 的调用约定
 *   2. 刺激源 → 换成真实音效与精灵图，数据来自 js/data/levels.js
 *   3. 过载表现 → 换成美术给的后期特效图 / shader
 * ============================================================ */

(function (global) {
  'use strict';

  function GameScene(game) {
    Scene.call(this, game, 'game');
    var cfg = game.cfg;

    /* ---------- 玩家状态（第一人称） ---------- */
    this.player = {
      yaw: 0,          // 视线水平角度（弧度，0 = 正前方）
      dist: 0,         // 已前进距离（0~1 表示走廊进度）
      regulating: false
    };

    /* ---------- 感官系统状态 ---------- */
    this.sensory = {
      load: 0,                                   // 总负载 0~1（右下 HUD 显示的就是它）
      channels: { light: 0, sound: 0, touch: 0, motion: 0 },  // 四条通道当前强度 0~1
      overloaded: false                          // 是否处于过载状态（滞回判定）
    };

    this.cfgSensory = cfg.sensory;
    this.cfgPlayer = cfg.player;

    /* ---------- 刺激源（数据驱动，后续从 levels.js 读取） ---------- */
    this.sources = [];

    this._t = 0;            // 场景计时
    this._shakeT = 0;       // 抖动计时
    this._tipEl = null;     // 顶部提示 DOM
    this._hudEl = null;     // 负载条 DOM
    this._finished = false;
  }
  GameScene.prototype = Object.create(Scene.prototype);
  GameScene.prototype.constructor = GameScene;

  /* ============================================================
   * 初始化：建 HUD、生成关卡内容
   * ============================================================ */
  GameScene.prototype.init = function () {
    var self = this;
    var A = this.game.assets;

    /* ---------- 顶部提示 ---------- */
    var tip = document.createElement('div');
    tip.className = 'hud-tip';
    this.uiLayer.appendChild(tip);
    tip.style.display = 'none';
    this._tipEl = tip;

    /* ---------- 底部感官负载条 ---------- */
    var hud = document.createElement('div');
    hud.className = 'hud-load';
    hud.innerHTML =
      '<div class="hud-load__label">感官负载</div>' +
      '<div class="hud-load__track"><i class="hud-load__fill"></i></div>';
    this.uiLayer.appendChild(hud);
    hud.style.display = 'none';
    this._hudEl = hud;
    this._fillEl = hud.querySelector('.hud-load__fill');

    /* ---------- 返回按钮（右上角下方，避免和声音按钮重叠） ---------- */
    var back = new CssButton({
      className: 'btn-back',
      variant: 'icon',
      icon: CssButton.ICON.back,
      title: '返回标题',
      sound: 'back',
      onClick: function () { self.game.scenes.go('title', {}, false); }
    });
    back.el.style.position = 'absolute';
    back.el.style.top = 'calc(11vmin + env(safe-area-inset-top))';
    back.el.style.right = 'calc(1.6vmin + env(safe-area-inset-right))';
    this.uiLayer.appendChild(back.el);
    back.el.style.display = 'none';
    this._backBtn = back;

    this.el = document.createElement('div');   // 占位根节点（便于统一显隐）
    this.el.appendChild(tip);
    this.el.appendChild(hud);
    this.el.appendChild(back.el);
    this.uiLayer.appendChild(this.el);
    this.el.style.display = 'none';
  };

  /* ============================================================
   * 进入场景：重置状态、装载关卡
   * ============================================================ */
  GameScene.prototype.enter = function (params) {
    Scene.prototype.enter.call(this);
    this.el.style.display = '';
    this._tipEl.style.display = '';
    this._hudEl.style.display = '';
    this._backBtn.el.style.display = '';

    // 重置玩家与感官状态
    this.player.yaw = 0; this.player.dist = 0;
    this.sensory.load = 0; this.sensory.overloaded = false;
    this.sensory.channels = { light: 0, sound: 0, touch: 0, motion: 0 };
    this._finished = false; this._t = 0;

    // 背景：场景内不显示标题大图，改由 canvas 绘制走廊
    this.setBackground(null);

    this.loadLevel(params && params.level ? params.level : 1);
    this.showTip('转动视线看看四周 · 按住空格可以自我调节', 4.5);
  };

  /**
   * 装载关卡数据
   * ★ 后续开发：这里改成从 GAME_LEVELS 读取完整关卡（光源、音效、剧情、目标）
   */
  GameScene.prototype.loadLevel = function (levelId) {
    var data = (global.GAME_LEVELS && global.GAME_LEVELS[levelId]) || global.GAME_LEVELS.defaultLevel;
    var A = this.game.assets;

    // 刺激源定义：
    //   angle  相对走廊正前方的角度（弧度，负值在左）
    //   dist   在走廊中的位置（0~1，和玩家进度比较，用于判断是否"经过"）
    //   channel 影响的感官通道
    //   sprite 精灵图（★ 占位符：换成你的素材，见 config.js: scenes.spriteXxx）
    this.sources = [
      { id: 'light1', channel: 'light', angle: -0.55, dist: 0.18, radius: 0.10, label: '闪烁的荧光灯',
        sprite: A.get('scenes.spriteLight'), power: 1.0 },
      { id: 'crowd1', channel: 'sound', angle:  0.62, dist: 0.42, radius: 0.12, label: '走廊里的人声',
        sprite: A.get('scenes.spriteCrowd'), power: 0.9 },
      { id: 'light2', channel: 'light', angle:  0.05, dist: 0.66, radius: 0.09, label: '刺眼的顶灯',
        sprite: A.get('scenes.spriteLight'), power: 1.1 },
      { id: 'tag1',   channel: 'touch', angle: -0.30, dist: 0.85, radius: 0.08, label: '摩擦的衣领标签',
        sprite: A.get('scenes.spriteTag'), power: 0.8 }
    ];

    if (data && data.sources) this.sources = data.sources;   // 关卡数据优先
    this.levelData = data;
  };

  GameScene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
    if (this._tipEl) this._tipEl.classList.remove('is-show');
  };

  /* ============================================================
   * 每帧逻辑
   * ============================================================ */
  GameScene.prototype.update = function (dt) {
    if (this._finished) return;
    this._t += dt;

    this._updateLook(dt);      // ① 视角
    this._updateSensory(dt);   // ② 感官负载
    this._updateMove(dt);      // ③ 前进
    this._updateHUD();         // ④ HUD 与提示
  };

  /** ① 视角控制：鼠标位置 / 拖拽 / 键盘左右 */
  GameScene.prototype._updateLook = function (dt) {
    var inp = this.game.input;
    var p = this.cfgPlayer;

    // 鼠标横向位置 → 目标角度（第一人称"环视"）
    var targetYaw = inp.pointer.nx * (p.fov * Math.PI / 180) * 0.5;
    if (inp.drag.active) targetYaw -= inp.drag.dx * 0.004;      // 触摸拖拽转视角
    if (inp.isDown('ArrowLeft') || inp.isDown('KeyA')) targetYaw -= p.yawSpeed * 0.6;
    if (inp.isDown('ArrowRight') || inp.isDown('KeyD')) targetYaw += p.yawSpeed * 0.6;
    this.player.yaw += (targetYaw - this.player.yaw) * (1 - Math.pow(p.yawDamping, dt * 60));
    this.player.yaw = Math.max(-1.2, Math.min(1.2, this.player.yaw));
  };

  /** ② 感官负载计算（本作核心） */
  GameScene.prototype._updateSensory = function (dt) {
    var S = this.sensory, C = this.cfgSensory;
    var inp = this.game.input;
    this.player.regulating = inp.isRegulating();

    // 1) 计算每条通道当前受到的刺激：视线越对准刺激源、距离越近 → 刺激越强
    var stim = { light: 0, sound: 0, touch: 0, motion: 0 };
    for (var i = 0; i < this.sources.length; i++) {
      var s = this.sources[i];
      var dAngle = Math.abs(s.angle - this.player.yaw);        // 视线夹角
      var dDist = Math.abs(s.dist - this.player.dist);         // 距离差
      var fovRad = this.cfgPlayer.fov * Math.PI / 180;
      var inView = Math.max(0, 1 - dAngle / fovRad);           // 是否在视野内（0~1）
      var near = Math.max(0, 1 - dDist / 0.35);                // 距离衰减
      var v = inView * near * (s.power || 1);

      // 各通道的"质感"不同：灯光是闪烁的、人声是起伏的、触觉是持续的
      if (s.channel === 'light') v *= 0.65 + 0.35 * Math.sin(this._t * 18);      // 频闪感
      if (s.channel === 'sound') v *= 0.6 + 0.4 * Math.abs(Math.sin(this._t * 1.6)); // 人声起伏
      stim[s.channel] = Math.max(stim[s.channel], Math.max(0, v));
    }

    // 2) 通道强度平滑逼近刺激值（避免数值抖动导致画面抽搐）
    for (var k in stim) {
      if (!Object.prototype.hasOwnProperty.call(stim, k)) continue;
      var target = stim[k];
      S.channels[k] += (target - S.channels[k]) * Math.min(1, dt * 4);
    }

    // 3) 汇总成总负载：各通道 × 敏感系数
    var raw = 0;
    for (var c = 0; c < C.channels.length; c++) {
      var name = C.channels[c];
      raw += (S.channels[name] || 0) * (C.gainPerChannel[name] || 1);
    }
    raw = Math.min(1.6, raw / 2.2);   // 归一化到 0~1.6 再裁剪

    // 4) 负载变化：自然回落 / 自我调节 / 过载滞回
    var delta;
    if (this.player.regulating) delta = -C.regulate * dt;                  // 主动调节
    else if (raw > S.load) delta = C.loadRise * (raw - S.load) * dt * 4;   // 受刺激上升
    else delta = -C.loadDecay * dt;                                        // 无刺激回落
    S.load = Math.max(0, Math.min(1, S.load + delta));

    // 5) 过载状态判定（滞回：进 0.85，出 0.45，避免边界抖动）
    if (!S.overloaded && S.load >= C.overloadAt) {
      S.overloaded = true;
      this.game.audio.play('overload');
      this.showTip('感官过载：按住空格深呼吸，或者把视线移开', 5);
      this._shakeT = 0.6;
    } else if (S.overloaded && S.load <= C.recoverAt) {
      S.overloaded = false;
      this.showTip('好一些了 · 继续往前走', 3);
    }
    if (this._shakeT > 0) this._shakeT -= dt;
  };

  /** ③ 前进：W/↑ 或自动缓慢前进；过载时几乎无法前进（体验"被卡住"） */
  GameScene.prototype._updateMove = function (dt) {
    var inp = this.game.input;
    var wantMove = inp.anyDown('KeyW', 'ArrowUp') || inp.pointer.down;

    // 过载时前进效率骤降 —— 这是玩法要传达的关键体验
    var eff = 1;
    if (this.sensory.load > this.cfgSensory.warnAt) {
      eff = 0.35;
    }
    if (this.sensory.overloaded) eff = 0.08;

    if (wantMove) this.player.dist += this.cfgPlayer.moveSpeed * dt * eff * 0.35;
    else this.player.dist += this.cfgPlayer.moveSpeed * dt * eff * 0.12;   // 不按键也缓慢前进，保证流程推进

    if (this.player.dist >= 1) {
      this.player.dist = 1;
      this._finished = true;
      this.showTip('你走到了走廊尽头 · 这只是短短几十米', 6);
      // ★ 后续开发：这里接结算场景 game.scenes.go('result', { load: ... })
      var self = this;
      setTimeout(function () { self.game.scenes.go('title', {}, false); }, 5000);
    }
  };

  /** ④ 刷新 HUD 与提示 */
  GameScene.prototype._updateHUD = function () {
    var S = this.sensory, C = this.cfgSensory;
    if (this._fillEl) this._fillEl.style.width = (S.load * 100).toFixed(1) + '%';

    var cls = this._hudEl.classList;
    cls.toggle('is-warn', S.load >= C.warnAt && !S.overloaded);
    cls.toggle('is-danger', S.overloaded);

    // 过载时给出持续的操作引导
    if (S.overloaded && !this._tipLock) {
      this.showTip('按住空格 / 按住屏幕 · 深呼吸', 2);
    }
  };

  /** 显示提示文字（秒） */
  GameScene.prototype.showTip = function (text, sec) {
    if (!this._tipEl) return;
    var el = this._tipEl;
    el.textContent = text;
    el.classList.add('is-show');
    this._tipLock = true;
    clearTimeout(this._tipTimer);
    var self = this;
    this._tipTimer = setTimeout(function () {
      el.classList.remove('is-show');
      self._tipLock = false;
    }, (sec || 3) * 1000);
  };

  /* ============================================================
   * 伪 3D 投影：把"角度 + 距离"映射成屏幕坐标
   * ★ 后续开发：换成真 3D 时，只需让 project() 返回相同含义的 x/y/scale 即可
   * ============================================================ */
  GameScene.prototype.project = function (angle, dist) {
    var W = this.game.width, H = this.game.height;
    var rel = angle - this.player.yaw;                            // 相对视线的角度
    var fovRad = this.cfgPlayer.fov * Math.PI / 180;
    var depth = Math.max(0.08, dist - this.player.dist);          // 相对深度（米）
    var scale = 1 / depth;                                        // 透视缩放：越近越大
    var x = W / 2 + Math.tan(rel) / Math.tan(fovRad / 2) * (W / 2);
    var y = H * 0.5 + (0.12 * H) * scale * 0.12;                  // 略低于视线中心
    return { x: x, y: y, scale: scale, visible: Math.abs(rel) < fovRad };
  };

  /* ============================================================
   * 每帧绘制
   * ============================================================ */
  GameScene.prototype.render = function (ctx) {
    var W = this.game.width, H = this.game.height;
    var S = this.sensory;

    // 过载抖动：整体位移（最直观的"不舒服"反馈）
    var shake = this._shakeT > 0 ? this._shakeT * 10 : (S.overloaded ? 2.2 : 0);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    this._drawCorridor(ctx, W, H);      // ① 走廊
    this._drawSources(ctx, W, H);       // ② 刺激源
    this._drawOverloadFX(ctx, W, H);    // ③ 过载后期效果
    this._drawVignette(ctx, W, H);      // ④ 暗角（隧道视野）

    ctx.restore();
  };

  /** ① 伪 3D 走廊：几组由远及近的矩形框，营造纵深 */
  GameScene.prototype._drawCorridor = function (ctx, W, H) {
    var cx = W / 2, cy = H * 0.5;
    // 灯光频闪 → 走廊明暗抖动
    var flicker = 1 - S_channels(this.sensory, 'light') * 0.55 * (0.5 + 0.5 * Math.sin(this._t * 20));
    var base = 0.13 * flicker;

    // 背景渐变（远处更暗）
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(18,24,44,' + (0.9 * flicker).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(8,11,22,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(140,170,220,' + (base + 0.12).toFixed(3) + ')';
    ctx.lineWidth = 1.2;

    // 画 N 层"门框"，越远越小越暗
    var layers = 14;
    for (var i = layers; i >= 1; i--) {
      var d = i / layers + (1 - this.player.dist) * 0.02;
      var s = 1 / (d * 3.2 + 0.2);                 // 缩放系数
      var w = W * 0.85 * s * 0.55, h = H * 0.9 * s * 0.55;
      var ox = cx + Math.tan(this.player.yaw * 0.35) * (1 - d) * W * 0.12;  // 转头时视差
      var a = (0.05 + 0.22 * (1 - d)) * flicker;
      ctx.strokeStyle = 'rgba(150,180,235,' + a.toFixed(3) + ')';
      ctx.strokeRect(ox - w / 2, cy - h / 2, w, h);
    }

    // 地面辅助线，强化纵深
    ctx.strokeStyle = 'rgba(120,150,210,' + (0.10 * flicker).toFixed(3) + ')';
    for (var j = -3; j <= 3; j++) {
      ctx.beginPath();
      ctx.moveTo(cx + j * W * 0.03, cy + H * 0.02);
      ctx.lineTo(cx + j * W * 0.42, H);
      ctx.stroke();
    }
  };

  /** ② 刺激源：按投影绘制精灵（或占位光晕） */
  GameScene.prototype._drawSources = function (ctx, W, H) {
    for (var i = 0; i < this.sources.length; i++) {
      var s = this.sources[i];
      var p = this.project(s.angle, s.dist + 0.001);
      if (!p.visible) continue;
      var ch = this.sensory.channels[s.channel] || 0;
      var size = (s.radius || 0.1) * W * p.scale * 0.55;
      size = Math.max(18, Math.min(size, W * 0.5));

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.35 + ch * 0.65));

      // ★ 占位符：这里用你的精灵图 scenes.spriteXxx；没有图时画一个光晕代替
      if (s.sprite && s.sprite.src) {
        ctx.drawImage(s.sprite, p.x - size / 2, p.y - size / 2, size, size);
      } else {
        var col = s.channel === 'light' ? '255,233,168'
                : s.channel === 'sound' ? '143,163,216' : '217,122,122';
        var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
        rg.addColorStop(0, 'rgba(' + col + ',' + (0.55 + ch * 0.4).toFixed(2) + ')');
        rg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
      }

      // 通道标签（debug 模式显示，方便你调参数；上线可关）
      if (this.game.cfg.debug) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#cfd8f0';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.label + ' ' + (ch * 100).toFixed(0) + '%', p.x, p.y + size / 2 + 16);
      }
      ctx.restore();
    }
  };

  /** ③ 过载后期效果：噪点 + 色偏 + 边缘挤压 */
  GameScene.prototype._drawOverloadFX = function (ctx, W, H) {
    var S = this.sensory;
    var intensity = Math.max(0, (S.load - 0.45) / 0.55);   // 0.45 以上开始出现失真
    if (intensity <= 0) return;

    // 噪点：听觉通道越强，画面"沙沙"感越强（用少量随机点模拟，避免性能问题）
    var n = Math.floor(intensity * 260);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + intensity * 0.12).toFixed(3) + ')';
    for (var i = 0; i < n; i++) {
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6);
    }
    ctx.restore();

    // 过载时叠加一层色偏（红/青分离感）
    if (S.overloaded) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(217,122,122,0.10)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  /** ④ 暗角：负载越高，视野越"隧道化"（真实感官过载时的视觉收缩） */
  GameScene.prototype._drawVignette = function (ctx, W, H) {
    var S = this.sensory;
    var strength = 0.25 + S.load * 0.55;
    var r = Math.max(W, H) * (0.85 - S.load * 0.35);
    var g = ctx.createRadialGradient(W / 2, H / 2, r * 0.25, W / 2, H / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + strength.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  /** 小工具：取通道强度 */
  function S_channels(sensory, name) { return sensory.channels[name] || 0; }

  global.ExperienceScene = ExperienceScene;

})(window);
