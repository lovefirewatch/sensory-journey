/* ============================================================
 * SubSceneC.js —— 子场景 C：坐下后的黑板
 *
 * 体验目标：理解语义处理延迟与字体崩解。
 *
 * 流程：
 *   1. 黑板上的字逐字崩解：每个字独立动画（随机角度掉落 / 旋转 / 偏移重叠），
 *      每次只有 1-2 个字能看清，每 1.2 秒切换可见字
 *   2. 玩家按顺序点击能看清的字，拼出「请翻开第37页」
 *   3. 拼字成功后，翻书被拆成 5 个步骤：拿书 / 找页码 / 翻页 / 对齐 / 看黑板
 *      每步点击后有 0.5 秒延迟（语义—动作转换的迟滞）
 *   4. 完成 → 进入子场景 D
 *
 * 听觉：老师声音降到 0.4 并经 2000Hz 低通（模糊），环境音占主导 0.8，
 *       翻页时触发 300ms 纸张摩擦声
 * ============================================================ */

(function (global) {
  'use strict';

  function SubSceneC(level, view) {
    SubSceneBase.call(this, level, view);
    this.name = 'C · 坐下后的黑板';
    this.cfg = global.LEVEL1.subC;
  }
  SubSceneC.prototype = Object.create(SubSceneBase.prototype);
  SubSceneC.prototype.constructor = SubSceneC;

  var DISTRACTORS = ['读', '写', '听', '看', '说'];

  SubSceneC.prototype.init = function () {
    this.chars = [];
    this.marks = [];
  };

  SubSceneC.prototype.enter = function () {
    SubSceneBase.prototype.enter.call(this);
    this.phase = 'spell';            // spell → steps → done
    this.target = this.cfg.target;   // '请翻开第37页'
    this.index = 0;                  // 已拼出的字数
    this.switchT = 0;
    this.marks = [];
    this.stepIndex = 0;
    this.stepLock = 0;               // >0 时步骤不可点（0.5 秒延迟）
    this.level.setBoardText('');
    this.state('asd');
    this.hint(this.cfg.hint, 4);
    this._buildChars();
    this._pickVisible(true);
    if (this.level.sound) {
      this.level.sound.setMode('asd');
      this.level.sound.muffleTeacher(true);   // 老师声音变模糊
    }
  };

  SubSceneC.prototype.exit = function () {
    if (this.level.sound) this.level.sound.muffleTeacher(false);
  };

  /** 生成黑板上的字（目标字 + 干扰字，打散排列） */
  SubSceneC.prototype._buildChars = function () {
    var W = this.game.width, H = this.game.height;
    var pool = this.target.split('').concat(DISTRACTORS);
    // 洗牌
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    // ★ 列宽直接由字块占位图的尺寸推导：换图后排列自动跟随，不会重叠或稀疏
    var size = Math.max(20, this.view.elementSize('char').w);
    var cw = size * 1.18;                       // 列间距留 18% 空隙
    var chh = size * 1.18;
    var cols = Math.max(3, Math.floor(W * 0.62 / cw));
    var bw = cw * cols;
    var x0 = W / 2 - bw / 2;
    var y0 = H * 0.22;

    this.chars = pool.map(function (ch, k) {
      var col = k % cols, row = Math.floor(k / cols);
      return {
        ch: ch,
        bx: x0 + cw * (col + 0.5),
        by: y0 + chh * (row + 0.5),
        size: size,
        ph: Math.random() * Math.PI * 2,
        angle: 0, rot: 0, dx: 0, dy: 0,
        clear: false,
        flash: 0
      };
    });
  };

  /** 重新挑选能看清的 1-2 个字（每 1.2 秒切换） */
  SubSceneC.prototype._pickVisible = function (first) {
    var c = this.cfg;
    this.chars.forEach(function (ch) { ch.clear = false; });
    var n = c.visibleChars;                 // 1~2
    var picks = [];
    // 为了让任务可完成：较高概率把"下一个需要的字"放进可见集合
    var nextChar = this.target[this.index];
    var cand = this.chars.filter(function (x) { return x.ch === nextChar && !x.clear; });
    if (cand.length && (first || Math.random() < 0.6)) {
      // 取第一个未被点掉的同字（可能有重复字，这里按出现顺序）
      picks.push(cand[Math.floor(Math.random() * cand.length)]);
    }
    while (picks.length < n) {
      var p = this.chars[Math.floor(Math.random() * this.chars.length)];
      if (picks.indexOf(p) < 0) picks.push(p);
    }
    picks.forEach(function (p) { p.clear = true; });
  };

  /* ---------- 每帧 ---------- */
  SubSceneC.prototype.update = function (dt) {
    this.t += dt;
    var c = this.cfg;
    this.marks.forEach(function (m) { m.age += dt; });
    this.marks = this.marks.filter(function (m) { return m.age < 0.6; });

    if (this.phase === 'spell') {
      // 每 1.2 秒切换可见字
      this.switchT += dt;
      if (this.switchT >= c.switchSec) {
        this.switchT = 0;
        this._pickVisible(false);
      }
      // 每个字独立动画：清晰字回正，崩解字随机角度 / 旋转 / 偏移
      for (var i = 0; i < this.chars.length; i++) {
        var ch = this.chars[i];
        ch.flash = Math.max(0, ch.flash - dt);
        if (ch.clear) {
          ch.angle += (0 - ch.angle) * Math.min(1, dt * 6);
          ch.rot += (0 - ch.rot) * Math.min(1, dt * 6);
          ch.dx += (0 - ch.dx) * Math.min(1, dt * 6);
          ch.dy += (0 - ch.dy) * Math.min(1, dt * 6);
        } else {
          // 掉落 + 旋转 + 偏移重叠
          ch.angle = Math.sin(this.t * 1.7 + ch.ph) * 0.55;
          ch.rot = this.t * (0.5 + (ch.ph % 1) * 0.8) + ch.ph;
          ch.dx = Math.sin(this.t * 2.3 + ch.ph) * ch.size * 0.45;
          ch.dy = Math.cos(this.t * 1.9 + ch.ph) * ch.size * 0.30;
        }
      }
      return;
    }

    if (this.phase === 'steps') {
      if (this.stepLock > 0) this.stepLock -= dt;
    }
  };

  /* ---------- 点击 ---------- */
  SubSceneC.prototype.onPointerDown = function (x, y) {
    var c = this.cfg;

    if (this.phase === 'spell') {
      for (var i = 0; i < this.chars.length; i++) {
        var ch = this.chars[i];
        var cx = ch.bx + ch.dx, cy = ch.by + ch.dy;
        var half = ch.size * 0.5;                 // ★ 命中区域 = 字块占位图的一半
        if (this.hitRect(x, y, { x: cx - half, y: cy - half, w: half * 2, h: half * 2 })) {
          var want = this.target[this.index];
          if (ch.clear && ch.ch === want) {
            // 拼对一个字
            this.index++;
            ch.flash = 0.45;
            this.marks.push({ x: x, y: y, age: 0, ok: true });
            this.state('interact');
            if (this.index >= this.target.length) {
              this.phase = 'steps';
              this.state('success');
              this.hint(c.stepHint, 3);
            } else {
              this._pickVisible(false);
              this.hint('已拼出：' + this.target.slice(0, this.index), 1.2);
            }
          } else if (!ch.clear) {
            // 看不清的字点不动 —— 这正是"字体崩解"的体验
            this.marks.push({ x: x, y: y, age: 0, ok: false });
            ch.flash = -1;                 // 负值为错误闪烁
            this.hint('这个字还在崩解，看不清', 1.2);
          } else {
            this.marks.push({ x: x, y: y, age: 0, ok: false });
            ch.flash = -1;
            this.hint('顺序不对', 1.0);
          }
          return;
        }
      }
      return;
    }

    if (this.phase === 'steps' && this.stepLock <= 0) {
      var W = this.game.width, H = this.game.height;
      var steps = c.steps;
      var bw = W * 0.52 / steps.length;
      var x0 = W / 2 - (bw * steps.length) / 2;
      var sy = H * 0.72, sh = H * 0.075;
      for (var s = 0; s < steps.length; s++) {
        var r = { x: x0 + bw * s, y: sy, w: bw, h: sh };
        if (this.hitRect(x, y, r)) {
          if (s === this.stepIndex) {
            this.stepIndex++;
            this.stepLock = c.stepDelay;      // 每步之后 0.5 秒迟滞
            this.marks.push({ x: x, y: y, age: 0, ok: true });
            // 翻页那一步：纸张摩擦声
            if (steps[s] === '翻页' && this.level.sound) this.level.sound._paper();
            if (this.stepIndex >= steps.length) {
              this.state('success');
              this.hint('终于翻到了那一页', 2.2);
              var self = this;
              setTimeout(function () { self.done(); }, 1200);
            } else {
              this.hint('下一步：' + steps[this.stepIndex], 1.0);
            }
          } else {
            this.marks.push({ x: x, y: y, age: 0, ok: false });
            this.hint('必须一步一步来', 1.0);
          }
          return;
        }
      }
    }
  };

  /* ---------- 绘制 ---------- */
  SubSceneC.prototype.render = function (g, W, H) {
    var c = this.cfg;
    var flick = FX.flicker(this.t, 12, 0.30);

    // ① 教室（视角回到黑板）
    this.view.draw(g, this.level.yaw, {
      mode: 'asd', flicker: flick, boardText: ''
    });
    FX.tint(g, W, H, '#E8F5E9', 0.16);
    FX.grain(g, W, H, 0.18);

    // ② 黑板底板（拼字区）
    var bw = W * 0.66, bh = H * 0.34;
    var bx = W / 2 - bw / 2, by = H * 0.18;
    g.save();
    g.fillStyle = 'rgba(30,52,44,.72)';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = 'rgba(150,170,150,.35)'; g.lineWidth = 2;
    g.strokeRect(bx, by, bw, bh);
    g.restore();

    if (this.phase === 'spell') {
      // ③ 逐字崩解：每个字是一张字块占位图，字画在图上
      var tile = this.view.elementSize('char');
      for (var i = 0; i < this.chars.length; i++) {
        var ch = this.chars[i];
        var cx = ch.bx + ch.dx, cy = ch.by + ch.dy;
        // 崩解中的字：半透明 + 旋转 + 重影；清晰的字：回正、全不透明
        var alpha = ch.clear ? 1 : 0.45;
        this.view.drawElement(g, 'char', cx, cy, {
          rotate: ch.angle * 0.5 + ch.rot * (ch.clear ? 0 : 0.25),
          alpha: alpha,
          scale: (1 + Math.sin(this.t * 2 + ch.ph) * 0.06)
        });
        if (!ch.clear) {
          // 重影：让"看不清"这件事有画面
          this.view.drawElement(g, 'char', cx + ch.size * 0.12, cy, {
            rotate: ch.angle * 0.5, alpha: 0.22
          });
        }
        // 字（动态内容，画在图上）
        var box = { w: tile.w };
        g.save();
        g.translate(cx, cy);
        g.rotate(ch.angle * 0.5 + ch.rot * (ch.clear ? 0 : 0.25));
        g.font = '600 ' + (box.w * 0.5).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (ch.flash < 0)      g.fillStyle = 'rgba(255,150,150,.98)';   // 点错
        else if (ch.flash > 0) g.fillStyle = 'rgba(127,209,193,.98)';   // 点对
        else if (ch.clear)     g.fillStyle = 'rgba(244,250,244,.96)';
        else                   g.fillStyle = 'rgba(210,225,215,.7)';
        g.fillText(ch.ch, 0, 0);
        g.restore();
      }

      // ④ 已拼出的进度
      var doneTxt = this.target.slice(0, this.index);
      var restTxt = this.target.slice(this.index).split('').map(function () { return '＿'; }).join('');
      this.drawCaption(g, doneTxt + restTxt, W / 2, H * 0.585, W, {
        fontSize: Math.max(16, W * 0.022), bg: true
      });
      return;
    }

    // ⑤ 翻书 5 步骤：每步是一张步骤块占位图
    var steps = c.steps;
    var sw = W * 0.52 / steps.length;
    var x0 = W / 2 - (sw * steps.length) / 2;
    var sy = H * 0.72, sh = H * 0.075;
    var tileW = this.view.elementSize('step').w;
    for (var s = 0; s < steps.length; s++) {
      var isDone = s < this.stepIndex;
      var isNext = s === this.stepIndex;
      var locked = this.stepLock > 0;
      var cx = x0 + sw * s + sw / 2, cy = sy + sh / 2;
      this.view.drawElement(g, 'step', cx, cy, {
        scale: (sw - 6) / tileW,
        alpha: isDone ? 1 : (isNext && !locked ? 0.95 : 0.45)
      });
      // 下一步：描边提示可点
      if (isNext && !locked) {
        g.save();
        g.strokeStyle = 'rgba(127,209,193,.85)'; g.lineWidth = 2.5;
        g.strokeRect(x0 + sw * s + 3, sy, sw - 6, sh);
        g.restore();
      }
      g.save();
      g.fillStyle = isDone ? 'rgba(200,240,232,.95)'
        : (isNext && !locked ? 'rgba(232,238,250,.95)' : 'rgba(160,170,190,.6)');
      g.font = '600 ' + Math.max(12, sh * 0.42).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((s + 1) + '. ' + steps[s], cx, cy);
      g.restore();
    }
    if (this.stepLock > 0) {
      this.drawCaption(g, '……', W / 2, H * 0.63, W, { fontSize: Math.max(18, W * 0.026), bg: false });
    }

    // 点击落点
    for (var m = 0; m < this.marks.length; m++) {
      var mk = this.marks[m];
      this.drawClickMark(g, mk.x, mk.y, mk.age, 0.6, mk.ok);
    }
  };

  SubSceneC.prototype.progressText = function () {
    if (this.phase === 'steps') return '翻书 ' + this.stepIndex + '/' + this.cfg.steps.length;
    return '拼字 ' + this.index + '/' + this.target.length;
  };

  global.SubSceneC = SubSceneC;

})(window);
