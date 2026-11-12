/* ============================================================
 * ClassroomView.js —— 教室视图（★ 用占位图搭建，不再用 canvas 画）
 *
 * 构建方式（对应"0 美术"的要求）：
 *   ① 一张全景背景图（宽 = 屏宽 × bgScale，默认 3 倍），随 yaw 横向平移 → 环视教室
 *   ② 每个可交互元素都是一张独立占位图：
 *        门 / 黑板 / 老师 / 歪椅子 / 举手 / 声源圆钮 / 干扰点 / 文字块 / 步骤块
 *      按世界坐标摆放，随视角平移，各有独立命中区域
 *
 * ★ 换美术：替换 assets/scenes/l1/ 下的同名文件即可，代码一行不用改。
 * ★ 调位置大小：改 js/data/level1.js 的 scene.elements。
 *
 * 坐标约定（换真美术时保持）：
 *   世界宽 WW = 屏宽 × bgScale；摄像机 camX = WW/2 + yaw × (WW-W)/2
 *   屏幕 x = 世界 x − camX + W/2
 * ============================================================ */

(function (global) {
  'use strict';

  function ClassroomView(W, H) {
    this.imgs = {};         // 元素图片表，由 setImages() 注入
    this.resize(W, H);
  }

  /** 注入图片表：{ bg, door, board, desk, chair, teacher, hand, orb, noise, char, step } */
  ClassroomView.prototype.setImages = function (imgs) { this.imgs = imgs || {}; };

  ClassroomView.prototype.resize = function (W, H) {
    var S = global.LEVEL1.scene;
    this.W = W; this.H = H;
    this.WW = W * S.bgScale;
    this.cols = S.cols;
    this.colStep = W * S.colStep;
    this.L = S.elements;
    this.rows = S.rows.map(function (r) { return { y: H * r.y, scale: r.s }; });
    this.emptySeat = S.emptySeat;
  };

  /* ============================================================
   * 坐标换算
   * ============================================================ */
  ClassroomView.prototype.camX = function (yaw) {
    return this.WW / 2 + yaw * (this.WW - this.W) / 2;
  };
  ClassroomView.prototype.toScreen = function (worldX, yaw) {
    return worldX - this.camX(yaw) + this.W / 2;
  };
  ClassroomView.prototype.centerWorld = function () { return this.WW / 2; };
  ClassroomView.prototype.colWorldX = function (col) {
    return this.centerWorld() + (col - (this.cols - 1) / 2) * this.colStep;
  };

  /* ============================================================
   * 尺寸计算：只给宽或高，另一个按图片比例自动推导
   *   → 换图后只要比例一致就不会被拉伸变形
   * ============================================================ */
  ClassroomView.prototype._size = function (img, e) {
    var iw = img.naturalWidth || img.width || 1;
    var ih = img.naturalHeight || img.height || 1;
    var aspect = ih / iw;
    var w, h;
    if (e.h) { h = e.h * this.H; w = h / aspect; }
    else { w = (e.w || 0.1) * this.W; h = w * aspect; }
    return { w: w, h: h };
  };

  /** 画一张元素图（中心锚点，可旋转、可缩放、可调透明度） */
  ClassroomView.prototype._drawImg = function (g, img, e, cx, cy, opt) {
    if (!img) return null;
    opt = opt || {};
    var sz = this._size(img, e);
    var k = opt.scale || 1;
    g.save();
    g.globalAlpha = opt.alpha === undefined ? 1 : opt.alpha;
    g.translate(cx, cy);
    if (opt.rotate) g.rotate(opt.rotate);
    if (opt.flipX) g.scale(-1, 1);
    g.drawImage(img, -sz.w * k / 2, -sz.h * k / 2, sz.w * k, sz.h * k);
    g.restore();
    return { w: sz.w * k, h: sz.h * k, x: cx - sz.w * k / 2, y: cy - sz.h * k / 2 };
  };

  /** 元素在屏幕上的中心点与尺寸（命中判定共用同一套计算） */
  ClassroomView.prototype.place = function (name, yaw, extraScale) {
    var e = this.L[name];
    var wx = this.centerWorld() + (e.wx || 0) * this.W;
    var cx = this.toScreen(wx, yaw);
    var cy = (e.cy === undefined ? 0.5 : e.cy) * this.H;
    var img = this.imgs[name];
    var sz = img ? this._size(img, e) : { w: (e.w || 0.1) * this.W, h: (e.h || 0.1) * this.H };
    var k = extraScale || 1;
    return { x: cx, y: cy, w: sz.w * k, h: sz.h * k, r: Math.max(sz.w, sz.h) * k / 2 };
  };

  /* ============================================================
   * 主绘制
   * @param {object} o { mode, flicker, boardText, boardShake, chairAngle,
   *                     showDesks, zoom }
   * ============================================================ */
  ClassroomView.prototype.draw = function (g, yaw, o) {
    o = o || {};
    var W = this.W, H = this.H;
    var asd = o.mode === 'asd';
    var flick = o.flicker === undefined ? 1 : o.flicker;

    g.clearRect(0, 0, W, H);

    /* ① 全景背景（横向平移） */
    var bg = this.imgs.bg;
    if (bg) {
      var x0 = W / 2 - this.camX(yaw);
      g.drawImage(bg, x0, 0, this.WW, H);
    }

    /* ② 黑板（在墙上，先画） */
    var board = this.place('blackboard', yaw);
    this._drawImg(g, this.imgs.board, this.L.blackboard, board.x, board.y);

    /* ③ 课桌阵列 + 空座位的歪椅子 */
    if (o.showDesks !== false) this._drawDesks(g, yaw, o);

    /* ④ 老师（走近时放大） */
    var t = this.place('teacher', yaw, o.zoom || 1);
    this._drawImg(g, this.imgs.teacher, this.L.teacher, t.x, t.y, { scale: o.zoom || 1 });

    /* ⑤ 黑板文字（动态内容，画在黑板图之上） */
    if (o.boardText) this._drawBoardText(g, board, o);

    /* ⑥ 频闪：整屏一起明暗（12Hz / ±30%）——灯管、地面反光、所有元素同步脉动 */
    if (asd && Math.abs(flick - 1) > 0.001) {
      var k = flick - 1;
      g.save();
      g.fillStyle = k > 0 ? 'rgba(255,252,236,1)' : 'rgba(0,0,0,1)';
      g.globalAlpha = Math.min(0.55, Math.abs(k));
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  /* ---------- 课桌与空座位 ---------- */
  ClassroomView.prototype._drawDesks = function (g, yaw, o) {
    var cols = this.cols;
    var chairAngle = (o.chairAngle === undefined ? -18 : o.chairAngle) * Math.PI / 180;
    var deskImg = this.imgs.desk, chairImg = this.imgs.chair;
    var empty = this.emptySeat;

    for (var r = 0; r < this.rows.length; r++) {
      var row = this.rows[r];
      for (var c = 0; c < cols; c++) {
        var x = this.toScreen(this.colWorldX(c), yaw);
        if (x < -this.W * 0.4 || x > this.W * 1.4) continue;
        var s = row.scale;

        if (r === empty.row && c === empty.col) {
          // 空座位：那把歪椅子（可交互）
          var seat = this.getSeatScreen(yaw);
          this._drawImg(g, chairImg, this.L.chair, seat.x, seat.y,
            { rotate: chairAngle, scale: s });
        } else if (deskImg) {
          this._drawImg(g, deskImg, this.L.desk, x, row.y, { scale: s });
        }
      }
    }
  };

  /* ---------- 黑板上的动态文字 ---------- */
  ClassroomView.prototype._drawBoardText = function (g, board, o) {
    var text = o.boardText;
    var shake = o.boardShake || 0;
    var fs = Math.max(14, board.h * 0.22);
    g.save();
    g.font = '600 ' + fs.toFixed(0) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(240,248,240,.92)';
    var cx = board.x, cy = board.y;

    if (shake > 0.01) {
      // 抖动 + 重影：字在"脱落、重叠"
      for (var i = 0; i < 3; i++) {
        g.globalAlpha = 0.22;
        g.fillText(text, cx + (Math.random() - 0.5) * shake * 16,
                         cy + (Math.random() - 0.5) * shake * 10);
      }
      g.globalAlpha = 0.8;
      g.fillText(text, cx + (Math.random() - 0.5) * shake * 4, cy);
    } else {
      g.globalAlpha = 0.95;
      g.fillText(text, cx, cy);
    }
    g.restore();
  };

  /* ============================================================
   * 命中区域（供子场景做点击判定，与绘制共用同一套坐标）
   * ============================================================ */

  /** 黑板矩形（含外扩边距） */
  ClassroomView.prototype.getBoardRect = function (yaw, pad) {
    var b = this.place('blackboard', yaw);
    var p = pad || 0;
    return { x: b.x - b.w / 2 - p, y: b.y - b.h / 2 - p, w: b.w + p * 2, h: b.h + p * 2 };
  };

  /** 空座位（歪椅子）的屏幕位置与半径 */
  ClassroomView.prototype.getSeatScreen = function (yaw) {
    var e = this.emptySeat;
    var row = this.rows[e.row];
    var s = row.scale;
    var x = this.toScreen(this.colWorldX(e.col), yaw);
    var img = this.imgs.chair;
    var sz = img ? this._size(img, this.L.chair) : { w: this.W * 0.13, h: this.W * 0.13 };
    return {
      x: x,
      y: row.y + sz.h * s * 0.18,          // 略低于桌沿，落在椅背上
      r: Math.max(26, Math.max(sz.w, sz.h) * s * 0.5)
    };
  };

  /** 老师的屏幕位置（子场景 D 走近时用） */
  ClassroomView.prototype.getTeacherScreen = function (yaw, zoom) {
    return this.place('teacher', yaw, zoom || 1);
  };

  /* ============================================================
   * 自由摆放的元素（声源圆钮 / 干扰点 / 文字块 / 步骤块 / 举手）
   * 这些元素不跟着世界坐标走，由子场景直接给屏幕坐标
   * ============================================================ */

  /** 按名称取图并按布局比例画出（返回实际绘制矩形，便于命中判定） */
  ClassroomView.prototype.drawElement = function (g, name, cx, cy, opt) {
    var e = this.L[name] || { w: 0.08 };
    return this._drawImg(g, this.imgs[name], e, cx, cy, opt);
  };

  /** 按名称取尺寸（子场景用来算点击半径） */
  ClassroomView.prototype.elementSize = function (name, scale) {
    var e = this.L[name] || { w: 0.08 };
    var img = this.imgs[name];
    var k = scale || 1;
    var sz = img ? this._size(img, e)
                 : { w: (e.w || 0.08) * this.W, h: (e.h || 0.08) * this.H };
    return { w: sz.w * k, h: sz.h * k, r: Math.max(sz.w, sz.h) * k / 2 };
  };

  /* ============================================================
   * 门（子场景 A 开场：点击推开）
   * 单张门图，两扇向两侧滑开 —— 用同一张图裁左右两半实现
   * ============================================================ */
  ClassroomView.prototype.drawDoor = function (g, openK) {
    var img = this.imgs.door;
    var e = this.L.door;
    var sz = img ? this._size(img, e) : { w: this.W * 0.4, h: this.H * 0.8 };
    var k = Math.max(0, Math.min(1, openK));
    var cx = this.W / 2, cy = e.cy * this.H;
    var slide = k * sz.w * 0.5;

    if (!img) return;
    g.save();
    // 左半扇
    g.drawImage(img, 0, 0, img.naturalWidth / 2 || img.width / 2, img.naturalHeight || img.height,
                cx - sz.w / 2 - slide, cy - sz.h / 2, sz.w / 2, sz.h);
    // 右半扇
    g.drawImage(img, img.naturalWidth / 2 || img.width / 2, 0,
                img.naturalWidth / 2 || img.width / 2, img.naturalHeight || img.height,
                cx + slide, cy - sz.h / 2, sz.w / 2, sz.h);
    g.restore();
  };

  global.ClassroomView = ClassroomView;

})(window);
