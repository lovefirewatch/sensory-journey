/* ============================================================
 * SubSceneA.js —— 子场景 A：推门瞬间
 *
 * 体验目标：理解光敏反应（12Hz 频闪）与听觉过滤失败（声音无主次）。
 *
 * 流程：
 *   1. 点击"推门"           → 门滑开
 *   2. 普通模式 3 秒          → 教室明亮、灯光稳定、声音清晰
 *   3. 自动切入自闭症模式      → 频闪 + 冷绿 + 碎片 + 残影 + 声墙
 *   4. 点击黑板文字 5 次       → 每次抖动一次，第 5 次看清"今日课题"
 *   5. 聚焦老师声音 3 次       → 点错其他声源则归零重来
 *   6. 完成 → 进入子场景 B
 * ============================================================ */

(function (global) {
  'use strict';

  function SubSceneA(level, view) {
    SubSceneBase.call(this, level, view);
    this.name = 'A · 推门瞬间';
    this.cfg = global.LEVEL1.subA;
    // 阶段：door → baseline → asd → focus → done
    this.phase = 'door';
  }
  SubSceneA.prototype = Object.create(SubSceneBase.prototype);
  SubSceneA.prototype.constructor = SubSceneA;

  SubSceneA.prototype.init = function () {
    this.orbs = [];              // 声音聚焦阶段的 6 个声源圆钮
    this.marks = [];             // 点击落点标记
  };

  SubSceneA.prototype.enter = function () {
    SubSceneBase.prototype.enter.call(this);
    this.phase = 'door';
    this.doorK = 0;              // 门开合进度 0→1
    this.doorOpening = false;
    this.baselineT = 0;
    this.boardClicks = 0;
    this.boardShake = 0;
    this.focusOk = 0;
    this.focusFlash = 0;
    this.marks = [];
    this.level.setYaw(0);
    this.state('idle');
    this.hint(this.cfg.doorHint, 0);

    this._buildOrbs();
    if (this.level.sound) this.level.sound.setMode('normal');
  };

  /** 6 个声源圆钮：按 pan（-1~1）横向铺开，y 在画面下方 */
  SubSceneA.prototype._buildOrbs = function () {
    var W = this.game.width, H = this.game.height;
    var list = this.cfg.sources;
    var r = this.view.elementSize('orb').r;        // ★ 半径来自占位图尺寸
    this.orbs = list.map(function (s, i) {
      var col = i % 3, row = Math.floor(i / 3);
      var x = W * (0.22 + col * 0.28);
      var y = H * (0.78 + row * 0.11);
      return { id: s.id, label: s.label, x: x, y: y, r: r, pulse: Math.random() };
    });
  };

  SubSceneA.prototype.exit = function () {
    this.level.setBoardText('');
  };

  /* ---------- 每帧 ---------- */
  SubSceneA.prototype.update = function (dt) {
    this.t += dt;
    var c = this.cfg;

    // 点击标记的老化
    this.marks.forEach(function (m) { m.age += dt; });
    this.marks = this.marks.filter(function (m) { return m.age < 0.6; });

    if (this.phase === 'door') {
      if (this.doorOpening) {
        this.doorK += dt / 0.6;                       // 0.6 秒推开
        if (this.doorK >= 1) {
          this.doorK = 1;
          this.phase = 'baseline';
          this.baselineT = 0;
          this.state('baseline');
          this.hint(c.baselineHint, 3);
          if (this.level.sound) this.level.sound.setMode('normal');
        }
      }
      return;
    }

    if (this.phase === 'baseline') {
      this.baselineT += dt;
      if (this.baselineT >= c.baselineSec) {
        // 自动切入自闭症模式：频闪与声墙同时出现
        this.phase = 'asd';
        this.state('asd');
        this.level.setBoardText(c.boardText);
        this.hint(c.asdHint, 4);
        if (this.level.sound) this.level.sound.setMode('asd');
      }
      return;
    }

    if (this.phase === 'asd') {
      // 黑板文字持续抖动（越点越接近看清）
      var remain = 1 - this.boardClicks / c.boardClicks;
      this.boardShake += ((0.35 + remain * 0.65) - this.boardShake) * Math.min(1, dt * 4);
      return;
    }

    if (this.phase === 'focus') {
      this.focusFlash = Math.max(0, this.focusFlash - dt);
      this.orbs.forEach(function (o) { o.pulse += dt * 2.2; });
      return;
    }
  };

  /* ---------- 点击 ---------- */
  SubSceneA.prototype.onPointerDown = function (x, y) {
    var c = this.cfg, W = this.game.width, H = this.game.height;

    if (this.phase === 'door') {
      // 点击门（命中区域 = 门占位图的实际矩形）
      var d = this.view.place('door', this.level.yaw);
      if (this.hitRect(x, y, { x: d.x - d.w / 2, y: d.y - d.h / 2, w: d.w, h: d.h })) {
        this.doorOpening = true;
        // 状态保持在 idle：门完全打开后才算"开始"→ 进入基线
      }
      return;
    }

    if (this.phase === 'asd') {
      // 点击黑板文字
      var rect = this.view.getBoardRect(this.level.yaw, 20);
      if (this.hitRect(x, y, rect)) {
        this.boardClicks++;
        this.boardShake = 1.4;                        // 每次点击抖动反馈一次
        this.marks.push({ x: x, y: y, age: 0, ok: true });
        this.state('interact');
        if (this.boardClicks >= c.boardClicks) {
          this.level.setBoardText(c.boardAnswer);
          this.boardShake = 0;
          this.phase = 'focus';
          this.state('success');
          this.hint(c.focusHint, 4);
        } else {
          this.hint('再点 ' + (c.boardClicks - this.boardClicks) + ' 次，才能看清', 1.6);
        }
      }
      return;
    }

    if (this.phase === 'focus') {
      for (var i = 0; i < this.orbs.length; i++) {
        var o = this.orbs[i];
        if (this.hitCircle(x, y, o.x, o.y, o.r)) {
          this.marks.push({ x: x, y: y, age: 0, ok: o.id === 'teacher' });
          if (o.id === 'teacher') {
            // 聚焦成功：老师声音清晰 0.5 秒，随后又被淹没
            this.focusOk++;
            this.focusFlash = c.focusHoldSec;
            if (this.level.sound) this.level.sound.focusTeacher(c.focusHoldSec * 1000);
            this.state('interact');
            if (this.focusOk >= c.focusTarget) {
              this.state('success');
              this.hint('锁定老师声音 —— 但只维持了很短的一瞬', 2.5);
              var self = this;
              setTimeout(function () { self.done(); }, 1400);
            } else {
              this.hint('抓住了 ' + this.focusOk + '/' + c.focusTarget + ' 次', 1.4);
            }
          } else {
            // 点错：所有声音回归同等音量，计数归零
            this.focusOk = 0;
            if (this.level.sound) this.level.sound.setMode('asd');
            this.hint(o.label + ' 抢走了你的注意 —— 重新找', 1.6);
          }
          return;
        }
      }
    }
  };

  SubSceneA.prototype.onDrag = function (dx) {
    // A 阶段允许轻微环视（不改变任务逻辑）
    this.level.addYaw(-dx * 0.0009);
  };

  /* ---------- 绘制 ---------- */
  SubSceneA.prototype.render = function (g, W, H) {
    var c = this.cfg;
    var asd = this.phase === 'asd' || this.phase === 'focus';
    var flick = asd ? FX.flicker(this.t, c.flickerHz, c.flickerAmount) : 1;

    // ① 教室
    this.view.draw(g, this.level.yaw, {
      mode: asd ? 'asd' : 'normal',
      flicker: flick,
      boardText: this.level.boardText,
      boardShake: asd ? this.boardShake : 0
    });

    // ② 门（开场与推开动画）
    if (this.phase === 'door' || this.doorK < 1) {
      this.view.drawDoor(g, this.doorK);
    }

    // ③ 自闭症模式的后期：冷绿色温 → 碎片化 → 残影 → 噪点
    if (asd) {
      FX.tint(g, W, H, c.tintColor, 0.22);
      FX.fragment(g, W, H, c.fragment, Math.floor(this.t * 6));
      if (this.level.trail) FX.afterimage(g, this.level.trail, c.afterimage);
      FX.grain(g, W, H, 0.35);
    }

    // ④ 声音聚焦阶段的声源圆钮（占位图 + 标签文字）
    if (this.phase === 'focus') {
      for (var i = 0; i < this.orbs.length; i++) {
        var o = this.orbs[i];
        var isTeacher = o.id === 'teacher';
        var boost = (isTeacher && this.focusFlash > 0) ? 1.25 : 1;
        var pulse = 1 + 0.10 * Math.sin(o.pulse);
        var box = this.view.drawElement(g, 'orb', o.x, o.y, { scale: pulse * boost });
        // 老师的声音：聚焦成功瞬间描一圈高亮
        if (isTeacher && this.focusFlash > 0) {
          g.save();
          g.strokeStyle = 'rgba(127,209,193,' + Math.min(1, this.focusFlash * 2).toFixed(2) + ')';
          g.lineWidth = 3;
          g.beginPath(); g.arc(o.x, o.y, box.w * 0.62, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
        // 标签画在图上（名称是动态的，所以不烘进图片）
        g.save();
        g.fillStyle = isTeacher ? 'rgba(200,240,232,.98)' : 'rgba(226,232,246,.9)';
        g.font = '600 ' + Math.max(11, box.w * 0.17).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(o.label, o.x, o.y);
        g.restore();
      }
      this.drawCaption(g, '连续聚焦 3 次，才能锁定老师的声音', W / 2, H * 0.70, W, { fontSize: Math.max(13, W * 0.016) });
    }

    // ⑤ 点击落点标记
    for (var m = 0; m < this.marks.length; m++) {
      var mk = this.marks[m];
      this.drawClickMark(g, mk.x, mk.y, mk.age, 0.6, mk.ok);
    }
  };

  SubSceneA.prototype.progressText = function () {
    if (this.phase === 'asd') return '看清黑板 ' + this.boardClicks + '/' + this.cfg.boardClicks;
    if (this.phase === 'focus') return '聚焦声音 ' + this.focusOk + '/' + this.cfg.focusTarget;
    return this.phase === 'door' ? '推开门' : '最初的 3 秒';
  };

  global.SubSceneA = SubSceneA;

})(window);
