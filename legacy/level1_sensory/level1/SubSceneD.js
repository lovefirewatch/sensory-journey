/* ============================================================
 * SubSceneD.js —— 子场景 D：老师点名
 *
 * 体验目标：理解社交压力与感官冲击叠加。
 *
 * 流程：
 *   1. 点名瞬间：过载 1.5 秒（过曝 0.8 / 饱和度 2.0 / 震动 5px·20Hz）
 *   2. 点击「举手」：点击区域缩小到正常的 1/3，落点随机偏移 ±20px
 *   3. 举手成功 → 老师走近：画面放大 1.2 倍
 *      脚步声像鼓点（音量 1.2 / 每 0.6 秒一步 / 低频 60Hz），
 *      呼吸声放大（音量 1.0 / 低通 800Hz）
 *   4. 结束 → 触发"感官休息"
 * ============================================================ */

(function (global) {
  'use strict';

  function SubSceneD(level, view) {
    SubSceneBase.call(this, level, view);
    this.name = 'D · 老师点名';
    this.cfg = global.LEVEL1.subD;
  }
  SubSceneD.prototype = Object.create(SubSceneBase.prototype);
  SubSceneD.prototype.constructor = SubSceneD;

  SubSceneD.prototype.init = function () {
    this.marks = [];
  };

  SubSceneD.prototype.enter = function () {
    SubSceneBase.prototype.enter.call(this);
    var c = this.cfg;
    this.phase = 'overload';         // overload → hand → approach → done
    this.overT = 0;
    this.handDone = false;
    this.approachT = 0;
    this.zoom = 1;
    this.stepT = 0;
    this.endTriggered = false;
    this.marks = [];
    this.level.setBoardText('');
    this.state('overload');
    this.hint('', 0);

    // 过载额外消耗平静值
    this.level.drainCalm(global.LEVEL1.global.overloadCalmCost);

    if (this.level.sound) {
      this.level.sound.setMode('asd');
      this.level.sound.callName();          // 点名声：无方向感、音量 1.5、800ms
    }
  };

  SubSceneD.prototype.exit = function () {
    if (this.level.sound) {
      this.level.sound.breathOn(false);
    }
    this.zoom = 1;
  };

  /* ---------- 每帧 ---------- */
  SubSceneD.prototype.update = function (dt) {
    this.t += dt;
    var c = this.cfg;
    this.marks.forEach(function (m) { m.age += dt; });
    this.marks = this.marks.filter(function (m) { return m.age < 0.6; });

    if (this.phase === 'overload') {
      this.overT += dt;
      if (this.overT >= c.overloadSec) {
        this.phase = 'hand';
        this.state('interact');
        this.hint(c.handHint, 3.5);
      }
      return;
    }

    if (this.phase === 'hand') {
      // 等待点击举手
      return;
    }

    if (this.phase === 'approach') {
      this.approachT += dt;
      // 画面轻微放大到 1.2
      this.zoom += (c.zoom - this.zoom) * Math.min(1, dt * 1.6);
      // 脚步声每 0.6 秒一步
      this.stepT += dt;
      if (this.stepT >= c.footInterval) {
        this.stepT = 0;
        if (this.level.sound) this.level.sound._step();
      }
      // ★ 只在跨过终点时触发一次：否则每帧都会重复 setState('success')，
      //   污染全局状态机（会把已经切到 transition 的状态又拉回 success）
      if (this.approachT >= 2.6 && !this.endTriggered) {
        this.endTriggered = true;
        this.state('success');
        this.hint(c.endText, 3);
        var self = this;
        setTimeout(function () { self.done(); }, 1600);
      }
    }
  };

  /* ---------- 点击 ---------- */
  SubSceneD.prototype.onPointerDown = function (x, y) {
    if (this.phase !== 'hand') return;
    var c = this.cfg;
    var h = this._handPos();
    var res = this.hitCircleWithOffset(x, y, h.x, h.y, h.r, c.handOffset);
    this.marks.push({ x: res.x, y: res.y, age: 0, ok: res.hit });
    if (res.hit) {
      this.handDone = true;
      this.phase = 'approach';
      this.state('success');
      this.hint('你举起了手 —— 老师向你走来', 2.5);
      if (this.level.sound) {
        this.level.sound.breathOn(true);    // 呼吸声放大（低通 800Hz）
      }
    } else {
      this.hint('手又偏了 —— 在这么多声音里，很难对准', 1.4);
    }
  };

  /** 「举手」位置：右下角；点击区域缩小到正常的 1/3 面积 */
  SubSceneD.prototype._handPos = function () {
    var W = this.game.width, H = this.game.height;
    // ★ 半径取自举手占位图的实际尺寸
    var normalR = this.view.elementSize('hand').r;
    return { x: W * 0.78, y: H * 0.74, r: normalR * this.cfg.handScale, normalR: normalR };
  };

  /* ---------- 绘制 ---------- */
  SubSceneD.prototype.render = function (g, W, H) {
    var c = this.cfg;
    var flick = FX.flicker(this.t, 12, 0.30);

    // ① 教室（老师走近时整体放大 1.2）
    g.save();
    if (this.zoom > 1.001) {
      g.translate(W / 2, H / 2); g.scale(this.zoom, this.zoom); g.translate(-W / 2, -H / 2);
    }
    this.view.draw(g, this.level.yaw, {
      mode: 'asd', flicker: flick,
      zoom: 1 + (this.zoom - 1) * 2.2,        // 老师身形同步放大
      teacherNear: this.phase === 'approach'
    });
    g.restore();

    // ② 过载：震动 → 过曝 → 饱和度拉满
    if (this.phase === 'overload') {
      var k = 1 - this.overT / c.overloadSec;          // 1→0 衰减
      FX.overexpose(g, W, H, c.overexpose * k);
      FX.saturate(g, W, H, c.saturation);
      FX.grain(g, W, H, 0.5);
      // 点名文字（无方向感地"在颅内响"）
      this.drawCaption(g, '有人叫你的名字\n但声音从四面八方同时涌来',
        W / 2, H * 0.42, W, { fontSize: Math.max(16, W * 0.024), weight: '600' });
    } else {
      FX.tint(g, W, H, '#E8F5E9', 0.14);
      FX.grain(g, W, H, 0.22);
    }

    // ③ 举手（占位图；点击区域只有正常的 1/3）
    if (this.phase === 'hand') {
      var h = this._handPos();
      // 先画出"正常大小"的虚线参考圈，让玩家直观感到区域被压缩
      g.save();
      g.setLineDash([5, 6]);
      g.strokeStyle = 'rgba(255,255,255,.22)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(h.x, h.y, h.normalR, 0, Math.PI * 2); g.stroke();
      g.restore();

      // 举手占位图（点击区域缩到 1/3，所以图按 normalR 画、判定按 r）
      this.view.drawElement(g, 'hand', h.x, h.y, { scale: h.normalR / this.view.elementSize('hand').r });

      this.drawCaption(g, '点击「举手」', h.x, h.y + h.normalR * 1.9, W,
        { fontSize: Math.max(12, W * 0.015), bg: true });
    }

    // ④ 点击落点标记
    for (var i = 0; i < this.marks.length; i++) {
      var m = this.marks[i];
      this.drawClickMark(g, m.x, m.y, m.age, 0.6, m.ok);
    }
  };

  SubSceneD.prototype.progressText = function () {
    if (this.phase === 'overload') return '感官过载';
    if (this.phase === 'hand') return '举手';
    return '老师走近';
  };

  global.SubSceneD = SubSceneD;

})(window);
