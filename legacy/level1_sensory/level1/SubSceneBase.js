/* ============================================================
 * SubSceneBase.js —— 子场景基类（A/B/C/D 的共同接口）
 *
 * 生命周期（由 Level1Scene 调度）：
 *   init()              创建时一次
 *   enter()             进入该子场景
 *   exit()              离开
 *   update(dt)          每帧逻辑
 *   render(g, W, H)     每帧绘制（g = 离屏场景画布的上下文）
 *   onPointerDown(x,y)  点击
 *   onDrag(dx, dy)      拖拽
 *   isDone()            是否已完成（完成即进入下一子场景）
 *
 * 基类提供的工具：
 *   hit / hitCircle     命中判定
 *   progress            当前子场景的推进说明（给 HUD 用，如 "3/5"）
 *
 * ★ 新增子场景：继承本类，实现上面几个方法，再到 Level1Scene 注册。
 * ============================================================ */

(function (global) {
  'use strict';

  function SubSceneBase(level, view) {
    this.level = level;              // Level1Scene（持有 audio/state/calm）
    this.view = view;                // ClassroomView
    this.game = level.game;
    this.cfg = null;                 // 子类在 init 里指向 LEVEL1.subX
    this.name = '';
    this._done = false;
    this.t = 0;                      // 子场景计时
  }

  SubSceneBase.prototype.init = function () {};
  SubSceneBase.prototype.enter = function () { this._done = false; this.t = 0; };
  SubSceneBase.prototype.exit = function () {};
  SubSceneBase.prototype.update = function () {};   // dt
  SubSceneBase.prototype.render = function () {};   // g, W, H
  SubSceneBase.prototype.onPointerDown = function () {};  // x, y
  SubSceneBase.prototype.onDrag = function () {};         // dx, dy
  SubSceneBase.prototype.isDone = function () { return this._done; };

  /** 标记完成 → 由 Level1Scene 推进到下一子场景 */
  SubSceneBase.prototype.done = function () { this._done = true; };

  /** 顶部提示文字 */
  SubSceneBase.prototype.hint = function (text, sec) {
    this.level.setHint(text, sec);
  };

  /** 状态机：切换全局状态（idle/baseline/asd/interact/success/transition/calm/overload） */
  SubSceneBase.prototype.state = function (s) {
    this.level.setState(s);
  };

  /* ---------- 命中判定工具 ---------- */
  SubSceneBase.prototype.hitRect = function (x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };
  SubSceneBase.prototype.hitCircle = function (x, y, cx, cy, r) {
    var dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };

  /**
   * 带随机偏移的命中判定（模拟"手不听使唤"）
   * @param {number} offset ±offset px
   * @returns {{x:number, y:number, hit:boolean}} 实际落点与是否命中
   */
  SubSceneBase.prototype.hitCircleWithOffset = function (x, y, cx, cy, r, offset) {
    var ox = (Math.random() * 2 - 1) * offset;
    var oy = (Math.random() * 2 - 1) * offset;
    var px = x + ox, py = y + oy;
    return { x: px, y: py, hit: this.hitCircle(px, py, cx, cy, r) };
  };

  /** 供 HUD 显示的推进说明，子类覆写 */
  SubSceneBase.prototype.progressText = function () { return ''; };

  /* ---------- 通用绘制小工具 ---------- */

  /** 画一个居中文字块（自动换行、带底衬，保证可读） */
  SubSceneBase.prototype.drawCaption = function (g, text, cx, y, W, opt) {
    opt = opt || {};
    var maxW = opt.maxW || W * 0.8;
    var fs = opt.fontSize || Math.max(14, W * 0.018);
    g.save();
    g.font = (opt.weight || '500') + ' ' + fs.toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // 手动折行（canvas 无自动换行）
    var lines = String(text).split('\n');
    var wrapped = [];
    lines.forEach(function (line) {
      var cur = '';
      for (var i = 0; i < line.length; i++) {
        if (g.measureText(cur + line[i]).width > maxW && cur) {
          wrapped.push(cur); cur = line[i];
        } else cur += line[i];
      }
      wrapped.push(cur);
    });

    var lh = fs * 1.6;
    var totalH = wrapped.length * lh;
    var boxY = y - totalH / 2;
    // 底衬
    if (opt.bg !== false) {
      g.fillStyle = 'rgba(8,11,22,.62)';
      var bw = 0;
      wrapped.forEach(function (l) { bw = Math.max(bw, g.measureText(l).width); });
      g.fillRect(cx - bw / 2 - fs * 0.7, boxY - fs * 0.6, bw + fs * 1.4, totalH + fs * 1.2);
    }
    g.fillStyle = opt.color || 'rgba(240,244,252,.95)';
    wrapped.forEach(function (l, i) {
      g.fillText(l, cx, boxY + lh * (i + 0.5));
    });
    g.restore();
  };

  /** 画一个可点击的圆钮（用于声音聚焦、举手等场景内交互） */
  SubSceneBase.prototype.drawOrb = function (g, cx, cy, r, opt) {
    opt = opt || {};
    g.save();
    // 光晕
    var rg = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
    rg.addColorStop(0, opt.glow || 'rgba(127,209,193,.55)');
    rg.addColorStop(1, 'rgba(127,209,193,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r * 1.9, 0, Math.PI * 2); g.fill();
    // 圆
    g.fillStyle = opt.fill || 'rgba(18,26,44,.88)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = opt.stroke || 'rgba(127,209,193,.9)';
    g.lineWidth = opt.lineWidth || 2;
    g.stroke();
    // 文字
    g.fillStyle = opt.color || 'rgba(232,238,250,.95)';
    g.font = '600 ' + Math.max(11, r * 0.30).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(opt.label || '', cx, cy);
    g.restore();
  };

  /** 点击落点标记（把"你点偏了"这件事显式反馈出来） */
  SubSceneBase.prototype.drawClickMark = function (g, x, y, age, maxAge, ok) {
    var k = 1 - Math.min(1, age / maxAge);
    if (k <= 0) return;
    g.save();
    g.globalAlpha = k;
    g.strokeStyle = ok ? 'rgba(127,209,193,.95)' : 'rgba(217,122,122,.95)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 8 + (1 - k) * 26, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(x - 9, y); g.lineTo(x + 9, y);
    g.moveTo(x, y - 9); g.lineTo(x, y + 9);
    g.stroke();
    g.restore();
  };

  global.SubSceneBase = SubSceneBase;

})(window);
