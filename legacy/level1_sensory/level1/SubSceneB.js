/* ============================================================
 * SubSceneB.js —— 子场景 B：寻找空座位
 *
 * 体验目标：理解管状视野（隧道视野）与视觉细节过载。
 *
 * 流程：
 *   1. 隧道视野在 1.5 秒内缓出成形：中心 80px 清晰，边缘模糊 20px、变暗 70%
 *   2. 拖动视野找空位：每累计拖动 40px 弹出 4 个干扰点（0.8 秒高亮闪烁）
 *      —— 同时触发一次颗粒合成的"声音碎片"
 *   3. 找到空位后椅子是歪的：点击扶正 3 次，每次落点随机偏移 ±15px
 *   4. 完成 → 进入子场景 C
 * ============================================================ */

(function (global) {
  'use strict';

  function SubSceneB(level, view) {
    SubSceneBase.call(this, level, view);
    this.name = 'B · 寻找空座位';
    this.cfg = global.LEVEL1.subB;
  }
  SubSceneB.prototype = Object.create(SubSceneBase.prototype);
  SubSceneB.prototype.constructor = SubSceneB;

  SubSceneB.prototype.init = function () {
    this.noisePoints = [];
    this.marks = [];
  };

  SubSceneB.prototype.enter = function () {
    SubSceneBase.prototype.enter.call(this);
    this.tunnelK = 0;                // 隧道视野过渡进度 0→1（1.5 秒缓出）
    this.dragAcc = 0;
    this.chairClicks = 0;
    this.chairAngle = this.cfg.chairAngle;
    this.phase = 'search';           // search → chair → done
    this.noisePoints = [];
    this.marks = [];
    this.level.setBoardText('');
    this.state('asd');
    this.hint(this.cfg.hint, 4);
    if (this.level.sound) {
      this.level.sound.setMode('asd');
      this.level.sound.breathOn(false);
    }
  };

  SubSceneB.prototype.exit = function () {
    this.noisePoints = [];
  };

  /* ---------- 每帧 ---------- */
  SubSceneB.prototype.update = function (dt) {
    this.t += dt;
    var c = this.cfg;

    // 隧道视野在 1.5 秒内成形
    if (this.tunnelK < 1) this.tunnelK = Math.min(1, this.tunnelK + dt / c.transition);

    // 干扰点老化
    this.noisePoints.forEach(function (p) { p.life += dt; });
    this.noisePoints = this.noisePoints.filter(function (p) { return p.life < p.maxLife; });
    this.marks.forEach(function (m) { m.age += dt; });
    this.marks = this.marks.filter(function (m) { return m.age < 0.6; });

    // 椅子扶正动画（每次成功点击，角度回正 1/3）
    if (this.phase === 'chair') {
      var target = c.chairAngle * (1 - this.chairClicks / c.chairClicks);
      this.chairAngle += (target - this.chairAngle) * Math.min(1, dt * 6);
    }
  };

  /* ---------- 拖拽：环视 + 触发干扰 ---------- */
  SubSceneB.prototype.onDrag = function (dx) {
    var c = this.cfg;
    this.level.addYaw(-dx * 0.0012);
    this.dragAcc += Math.abs(dx);
    if (this.dragAcc >= c.dragThreshold) {
      this.dragAcc = 0;
      this._spawnNoise();
      if (this.level.sound) this.level.sound.granular();   // 颗粒合成的声音碎片
    }
  };

  /** 弹出 4 个视觉干扰点 */
  SubSceneB.prototype._spawnNoise = function () {
    var c = this.cfg, W = this.game.width, H = this.game.height;
    var labels = c.noiseLabels;
    for (var i = 0; i < c.noiseCount; i++) {
      // 干扰点贴在场景细节上：课桌、地面一带
      var col = Math.floor(Math.random() * this.view.cols);
      var x = this.view.toScreen(this.view.colWorldX(col), this.level.yaw)
            + (Math.random() - 0.5) * W * 0.18;
      var y = H * (0.62 + Math.random() * 0.30);
      if (x < -20 || x > W + 20) x = Math.random() * W;
      this.noisePoints.push({
        x: x, y: y,
        label: labels[i % labels.length],
        life: 0, maxLife: c.noiseLife,
        intensity: c.noiseMin + Math.random() * (c.noiseMax - c.noiseMin)
      });
    }
  };

  /* ---------- 点击 ---------- */
  SubSceneB.prototype.onPointerDown = function (x, y) {
    var c = this.cfg;
    var seat = this.view.getSeatScreen(this.level.yaw);

    if (this.phase === 'search') {
      // 找到空座位（歪椅子）→ 进入扶正阶段
      if (this.hitCircle(x, y, seat.x, seat.y, seat.r * 1.6)) {
        this.phase = 'chair';
        this.state('interact');
        this.hint(c.chairHint, 3);
      }
      return;
    }

    if (this.phase === 'chair') {
      // 点击扶正：落点随机偏移 ±15px，所以常常"点不准"
      var res = this.hitCircleWithOffset(x, y, seat.x, seat.y, seat.r, c.chairOffset);
      this.marks.push({ x: res.x, y: res.y, age: 0, ok: res.hit });
      if (res.hit) {
        this.chairClicks++;
        this.state('interact');
        if (this.chairClicks >= c.chairClicks) {
          this.chairAngle = 0;
          this.state('success');
          this.hint('坐下了 —— 但黑板上的字开始崩解', 2.5);
          var self = this;
          setTimeout(function () { self.done(); }, 1200);
        } else {
          this.hint('还差 ' + (c.chairClicks - this.chairClicks) + ' 次', 1.2);
        }
      } else {
        this.hint('手偏了 —— 再试一次', 1.2);
      }
    }
  };

  /* ---------- 绘制 ---------- */
  SubSceneB.prototype.render = function (g, W, H) {
    var c = this.cfg;
    var flick = FX.flicker(this.t, 12, 0.30);

    // ① 教室（椅子角度实时更新）
    this.view.draw(g, this.level.yaw, {
      mode: 'asd',
      flicker: flick,
      chairAngle: this.chairAngle,
      showStudents: true
    });

    // ② 干扰点（每次移动视野弹出，高亮闪烁）
    this._drawNoise(g);

    // ③ 空座位提示环（找到后高亮，扶正阶段显示目标圈）
    var seat = this.view.getSeatScreen(this.level.yaw);
    if (seat.x > -60 && seat.x < W + 60) {
      g.save();
      var pulse = 0.55 + 0.45 * Math.sin(this.t * (this.phase === 'chair' ? 6 : 2.5));
      g.strokeStyle = 'rgba(127,209,193,' + (this.phase === 'chair' ? pulse : pulse * 0.5) + ')';
      g.lineWidth = this.phase === 'chair' ? 3 : 2;
      g.setLineDash(this.phase === 'chair' ? [] : [6, 6]);
      g.beginPath(); g.arc(seat.x, seat.y, seat.r * (this.phase === 'chair' ? 1 : 1.4), 0, Math.PI * 2);
      g.stroke();
      g.restore();

      if (this.phase === 'chair') {
        this.drawCaption(g, '扶正椅子 ' + this.chairClicks + '/' + c.chairClicks,
          seat.x, seat.y - seat.r * 1.9, W, { fontSize: Math.max(12, W * 0.015), bg: true });
      }
    }

    // ④ 轻噪点（感官背景）
    FX.grain(g, W, H, 0.22);

    // ⑤ 点击落点标记（把偏移显式画出来）
    for (var i = 0; i < this.marks.length; i++) {
      var m = this.marks[i];
      this.drawClickMark(g, m.x, m.y, m.age, 0.6, m.ok);
    }
  };

  /**
   * 后期特效：隧道视野
   * 必须画在主画布上（需要以清晰场景图为模糊源），所以走 postFX 钩子
   */
  SubSceneB.prototype.postFX = function (g, W, H, sceneCanvas) {
    var c = this.cfg;
    FX.tunnel(g, W, H, sceneCanvas, {
      clearRadius: c.clearRadius,
      blurPx: c.blurPx,
      darken: c.darken,
      progress: FX.easeOut(this.tunnelK)
    });
  };

  /**
   * 视觉干扰点：用占位图表示（同学衣服纹理 / 拉链反光 / 桌角反光 / 地砖反光）
   * 高亮闪烁 0.8 秒，强度 0.6~0.9 之间随机
   */
  SubSceneB.prototype._drawNoise = function (g) {
    var view = this.view;
    for (var i = 0; i < this.noisePoints.length; i++) {
      var p = this.noisePoints[i];
      var k = 1 - p.life / p.maxLife;                  // 0→1 生命周期
      var blink = 0.5 + 0.5 * Math.sin(k * Math.PI * 8);
      var a = (1 - k) * p.intensity * (0.4 + 0.6 * blink);
      if (a <= 0.01) continue;
      var box = view.drawElement(g, 'noise', p.x, p.y,
        { scale: 0.75 + p.intensity * 0.6, alpha: Math.min(1, a) });
      // 名称是动态的，画在图上方而不是烘进图片
      g.save();
      g.globalAlpha = Math.min(1, a * 0.9);
      g.fillStyle = 'rgba(255,240,200,.95)';
      g.font = '600 ' + Math.max(10, box.w * 0.30).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(p.label, p.x, p.y - box.h * 0.6);
      g.restore();
    }
  };

  SubSceneB.prototype.progressText = function () {
    if (this.phase === 'chair') return '扶正椅子 ' + this.chairClicks + '/' + this.cfg.chairClicks;
    return '寻找空座位';
  };

  global.SubSceneB = SubSceneB;

})(window);
