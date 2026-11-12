/* ============================================================
 * BoardGaze.js —— 「看黑板」交互（第 5 个交互点）
 *
 * 模拟自闭症患者上课看黑板的状态：
 *   · 视野受限：只有一小块窗口清晰，外围模糊 + 变暗
 *   · 不完全受控，三个来源叠加：
 *       ① 自动漂移：视野自己缓慢游走
 *       ② 拖动阻尼：跟不上手，像眼睛追不上
 *       ③ 注意力被夺走：不定期突然跳到干扰点（国旗/书架/储物柜…）
 *   · 视野**不缩小**（用户明确要求），只在窗口边缘做特效
 *
 * 流程：
 *   观察（30s）→ 对准目标停留 2s 自动交卷，或超时 → 弹公式选择
 *   选对 → onDone；选错 → resume(10s) 继续观察（位置与视野大小都不变）
 *
 * ★ 坐标全部归一化 0~1，相对整张底图；底图按 cover 铺满容器。
 * ★ 换图只需替换 assets/scenes/l1/board_classroom.jpg 并重校准 target。
 * ============================================================ */

(function (global) {
  'use strict';

  function BoardGaze(opt) {
    this.img = opt.img;
    this.cfg = opt.cfg;
    this.container = opt.container;      // 挂载容器（应为视频区域大小）
    this.onObserveEnd = opt.onObserveEnd || function () {};

    this.active = false;
    this.phase = 'idle';                 // idle | gaze | done
    /* ★ 起始位置不在正中心：视野从"偏离目标"的地方开始，
       玩家需要主动找；同时为"凸起提示方向"留出方向感。 */
    var st = (opt.cfg && opt.cfg.start) || { x: 0.5, y: 0.5 };
    this.center = { x: st.x, y: st.y };
    this.target = { x: st.x, y: st.y };
    this.dwell = 0;                      // 对准累计时长
    this.remaining = this.cfg.firstSec;
    /* ★ 校准模式：画出判定区框 + 视野中心坐标，方便手动调 target */
    this.calib = !!opt.calib;
    this.t = 0;
    this._last = 0;

    /* 注意力被夺走 */
    this._hijack = null;
    this._nextHijack = this._rollHijackTime();
    this._dragBase = null;

    this._build();
  }

  /* ============================================================
   * 建 DOM：canvas + 提示 + 倒计时
   * ============================================================ */
  BoardGaze.prototype._build = function () {
    var self = this;

    var root = document.createElement('div');
    root.className = 'gaze-root';

    var cv = document.createElement('canvas');
    cv.className = 'gaze-canvas';
    root.appendChild(cv);
    this.canvas = cv;
    this.ctx = cv.getContext('2d');

    // 提示条（顶部）
    var hint = document.createElement('div');
    hint.className = 'it-overlay gaze-hint';
    hint.textContent = this.cfg.hint;
    root.appendChild(hint);
    this.hintEl = hint;

    // 倒计时（右上角，避开全局声音按钮）
    var cd = document.createElement('div');
    cd.className = 'gaze-timer';
    root.appendChild(cd);
    this.timerEl = cd;

    // 对准进度提示
    var dwell = document.createElement('div');
    dwell.className = 'gaze-dwell';
    dwell.textContent = this.cfg.dwellHint;
    root.appendChild(dwell);
    this.dwellEl = dwell;

    /* ---------- 拖动 ---------- */
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    var dragging = false, sx = 0, sy = 0, bx = 0, by = 0;
    cv.addEventListener('pointerdown', function (e) {
      if (!self.active || self.phase !== 'gaze') return;
      dragging = true;
      self._dragging = true;                 // ★ 供 update 判断"是否在拖"
      self._hijack = null;                   // 主动操作可挣脱被夺走的注意力
      var p = pos(e);
      sx = p.x; sy = p.y;
      bx = self.target.x; by = self.target.y;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging || !self.active || self.phase !== 'gaze') return;
      var p = pos(e);
      /* ★ 方向修正：拖左看左、拖右看右（符合直觉）。
         想换回"抓着画面拖"的手感，把 cfg.dragInvert 设为 true。 */
      var sign = self.cfg.dragInvert ? -1 : 1;

      /* ★ 拖动干扰（用户要求"难度太低，多加干扰"）：
         ① slip 打滑：手指挪 1 格，视野只跟 cfg.drag.gain 格
         ② noise 随机偏移：每次移动都抖一下，拖得越久越飘 */
      var dg = self.cfg.drag || {};
      var gain = dg.gain === undefined ? 1 : dg.gain;
      var noise = dg.noise || 0;
      var nx = noise ? (Math.random() * 2 - 1) * noise : 0;
      var ny = noise ? (Math.random() * 2 - 1) * noise : 0;

      /* ★ 写入 _pending（原始意图）而不是 target：
         target 由 update() 按"最大速度"逐步逼近 _pending，
         这样手指甩得再快，视野也只能慢慢跟 —— 大幅降低拖动速度上限。 */
      self._pending = {
        x: clamp01(bx + sign * (p.x - sx) * gain + nx),
        y: clamp01(by + sign * (p.y - sy) * gain + ny)
      };
    });
    function endDrag() { dragging = false; self._dragging = false; }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', endDrag);

    this.container.appendChild(root);
    this.el = root;
    this._resize();
  };

  BoardGaze.prototype._resize = function () {
    var cv = this.canvas;
    var r = this.container.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    this.W = w; this.H = h; this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._buildBlur();
  };

  /**
   * 预生成模糊底图（降采样再放大，移动端比 ctx.filter 稳）
   * ★ 生成两档：
   *   _blurSrc   1/12  —— 外围轻微模糊（dim<1 时用到）
   *   _blurHeavy 1/28  —— 开场"完全看不清"的重度模糊
   * 每帧只 drawImage，绝不用 ctx.filter（手机上会掉到几 fps）
   */
  BoardGaze.prototype._buildBlur = function () {
    var img = this.img;
    if (!img || !img.width) return;
    var self = this;
    function make(scale) {
      var sw = Math.max(2, Math.round(img.width * scale));
      var sh = Math.max(2, Math.round(img.height * scale));
      var c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(img, 0, 0, sw, sh);
      return c;
    }
    this._blurSrc = make(1 / 12);
    this._blurHeavy = make(1 / 28);
    void self;
  };

  /**
   * ★ 渐进聚焦：开场极模糊，随時間逐步看清
   * 返回 0~1 的"模糊量"：1 = 完全看不清，0 = 完全清晰
   * 用 easeOut 曲线 —— 前段退得慢（真的很糊），后段快速清晰
   */
  BoardGaze.prototype._blurAmount = function () {
    var f = this.cfg.focusIn || { sec: 4.5, from: 1.0 };
    var sec = f.sec === undefined ? 4.5 : f.sec;
    if (sec <= 0) return 0;
    var from = f.from === undefined ? 1 : f.from;
    var elapsed = this.elapsed === undefined ? 0 : this.elapsed;
    var k = Math.max(0, Math.min(1, elapsed / sec));
    /* ★ 用 easeInQuad（k²）而不是 easeOut：
       easeOut 起步就掉得快（k=25% 时已清晰 58%），达不到"前几秒非常模糊"。
       k² 让模糊量在前半段居高不下：
         k=25% → 仍模糊 94%   k=50% → 75%   k=75% → 44%   k=100% → 0
       末段会快速清晰，正好对应"适应过来了"。 */
    var e = k * k;
    return from * (1 - e);
  };

  /* ============================================================
   * 生命周期
   * ============================================================ */
  BoardGaze.prototype.begin = function () {
    this.active = true;
    this.phase = 'gaze';
    this.remaining = this.cfg.firstSec;
    this.dwell = 0;
    this.elapsed = 0;                    // ★ 渐进聚焦从 0 开始
    var st = this.cfg.start || { x: 0.5, y: 0.5 };
    this.center.x = st.x; this.center.y = st.y;
    this.target.x = st.x; this.target.y = st.y;
    this._pending = null;
    this._last = 0;
    this._resize();
    this.el.classList.add('is-show');
    this.hintEl.classList.add('is-show');
    this._syncTimer();
  };

  /** 选错后再给 sec 秒（★ 位置与视野大小都不变） */
  BoardGaze.prototype.resume = function (sec) {
    if (!this.active) return;
    this.phase = 'gaze';
    this.remaining = sec === undefined ? this.cfg.retrySec : sec;
    this.dwell = 0;
    this._last = 0;
    this.el.classList.add('is-show');
    this._syncTimer();
  };

  /** 选择期间暂停观察（不倒计时、不判定） */
  BoardGaze.prototype.pause = function () {
    if (this.phase === 'gaze') this.phase = 'paused';
    this.el.classList.remove('is-show');
  };

  BoardGaze.prototype.stop = function () {
    this.active = false;
    this.phase = 'done';
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  /* ============================================================
   * 每帧更新
   * ============================================================ */
  BoardGaze.prototype.update = function (ts) {
    if (!this.active || this.phase !== 'gaze') return;
    /* ★ dt 必须 clamp 到 [0, 0.05]：
       时间戳回退（切后台、测试里乱序调用）会让 dt 变负，
       负 dt 乘进阻尼系数会让视野朝反方向猛跳一大截。 */
    var raw = this._last ? (ts - this._last) / 1000 : 0.016;
    var dt = Math.max(0, Math.min(0.05, raw));
    this._last = ts;
    this.t += dt;
    this.elapsed = (this.elapsed || 0) + dt;    // ★ 用于渐进聚焦（不含选择暂停期）

    this._updateDragSpeed(dt);
    this._updateHijack(dt);
    this._updateCenter(dt);
    this._updateDwell(dt);
    this._updateTimer(dt);
    this._render();
  };

  /* ---------- ★ 拖动限速：手指甩得再快，视野也只能慢慢跟 ---------- */
  BoardGaze.prototype._updateDragSpeed = function (dt) {
    if (!this._dragging || !this._pending) return;
    var dg = this.cfg.drag || {};
    var maxSpeed = dg.maxSpeed === undefined ? 0.16 : dg.maxSpeed;  // 归一化单位/秒
    var step = maxSpeed * dt;
    var dx = this._pending.x - this.target.x;
    var dy = this._pending.y - this.target.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= step || dist < 1e-6) {
      this.target.x = this._pending.x;
      this.target.y = this._pending.y;
    } else {
      this.target.x += (dx / dist) * step;
      this.target.y += (dy / dist) * step;
    }
  };

  /* ---------- ① 自动漂移 + ③ 注意力被夺走 ---------- */
  BoardGaze.prototype._updateHijack = function (dt) {
    var hj = this.cfg.hijack;
    if (!hj || !hj.enabled) return;

    if (this._hijack) {
      this._hijack.left -= dt;
      if (this._hijack.left <= 0) {
        // 恢复：把玩家目标设回被夺走前的位置附近，避免"丢失感"太强
        this.target.x = clamp01(this._hijack.backX);
        this.target.y = clamp01(this._hijack.backY);
        this._hijack = null;
        this._nextHijack = this._rollHijackTime();
      }
      return;
    }

    this._nextHijack -= dt;
    if (this._nextHijack <= 0) {
      var pts = hj.points || [];
      if (!pts.length) { this._nextHijack = this._rollHijackTime(); return; }
      var p = pts[Math.floor(Math.random() * pts.length)];
      this._hijack = {
        x: p.x, y: p.y, label: p.label,
        left: hj.holdSec,
        backX: this.target.x, backY: this.target.y
      };
      this._nextHijack = this._rollHijackTime();
      if (global.bus) bus.emit('gaze:hijack', p.label);
    }
  };

  BoardGaze.prototype._rollHijackTime = function () {
    var hj = this.cfg.hijack || {};
    var a = hj.everyMin || 5, b = hj.everyMax || 8;
    return a + Math.random() * Math.max(0, b - a);
  };

  /* ---------- 视野中心：目标 + 漂移 + 夺走，再走阻尼 ---------- */
  BoardGaze.prototype._updateCenter = function (dt) {
    var d = this.cfg.drift || {};
    var t = this.t * (d.speed || 0.5);

    // ① 自动漂移：两组不同频率的正弦叠加，避免察觉出规律
    var dx = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.53 + 1.3) * 0.4;
    var dy = Math.cos(t * 1.3 + 0.7) * 0.6 + Math.sin(t * 0.41) * 0.4;

    /* ★ 拖动时漂移加倍：越想控制，它飘得越厉害 */
    var dg0 = this.cfg.drag || {};
    var dScale = this._dragging
      ? (dg0.dragDriftScale === undefined ? 1.8 : dg0.dragDriftScale) : 1;

    var desiredX = this.target.x + dx * (d.ampX || 0.02) * dScale;
    var desiredY = this.target.y + dy * (d.ampY || 0.015) * dScale;

    /* ★ 拖动时的高频抖动：越想控制，视野抖得越厉害。
       这是"不完全受控"的主要来源 —— 手指不动时它自己漂，一动就更抓不住。 */
    if (this._dragging) {
      var dg2 = this.cfg.drag || {};
      var jf = dg2.jitterFreq || 0;
      var ja = dg2.jitterAmp || 0;
      if (ja > 0) {
        desiredX += Math.sin(this.t * jf * 6.3 + 1.7) * ja
                  + Math.sin(this.t * jf * 11.1) * ja * 0.5;
        desiredY += Math.cos(this.t * jf * 7.1) * ja * 0.85
                  + Math.sin(this.t * jf * 13.7) * ja * 0.45;
      }
    }

    // ③ 注意力被夺走：直接把期望位置拉到干扰点
    if (this._hijack) {
      desiredX = this._hijack.x;
      desiredY = this._hijack.y;
    }

    /* ② 阻尼：跟不上手
       ★ 拖动时阻尼进一步降低（更迟滞），松手后恢复正常跟随。
          配合抖动，形成"越使劲越抓不住"的手感。 */
    var dg3 = this.cfg.drag || {};
    var damp = (this.cfg.damping || 0.1) *
               (this._dragging ? (dg3.dragDampingScale === undefined ? 0.6 : dg3.dragDampingScale) : 1);
    var k = Math.min(1, damp * (dt / 0.016));
    this.center.x += (clamp01(desiredX) - this.center.x) * k;
    this.center.y += (clamp01(desiredY) - this.center.y) * k;
    this.center.x = clamp01(this.center.x);
    this.center.y = clamp01(this.center.y);
  };

  /* ---------- 对准停留 2 秒自动交卷 ---------- */
  BoardGaze.prototype._updateDwell = function (dt) {
    var tg = this.cfg.target;
    var inside = this.center.x >= tg.x && this.center.x <= tg.x + tg.w &&
                 this.center.y >= tg.y && this.center.y <= tg.y + tg.h;
    // 被夺走注意力时不算"对准"
    if (inside && !this._hijack) {
      this.dwell += dt;
      if (this.dwell >= this.cfg.dwellSec) { this._finishObserve(); return; }
    } else {
      this.dwell = Math.max(0, this.dwell - dt * 1.5);   // 移开则衰减
    }
    var p = Math.min(1, this.dwell / this.cfg.dwellSec);
    this.dwellEl.style.opacity = p > 0.05 ? String(0.35 + p * 0.65) : '0';
    this.dwellEl.classList.toggle('is-near', p > 0.05);
  };

  /* ---------- 倒计时 ---------- */
  BoardGaze.prototype._updateTimer = function (dt) {
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this._syncTimer();
      this._finishObserve();
      return;
    }
    this._syncTimer();
  };

  BoardGaze.prototype._syncTimer = function () {
    if (!this.timerEl) return;
    var s = Math.ceil(this.remaining);
    this.timerEl.textContent = s + 's';
    this.timerEl.classList.toggle('is-urgent', s <= 5);
  };

  BoardGaze.prototype._finishObserve = function () {
    this.phase = 'paused';
    this.dwellEl.style.opacity = '0';
    var cb = this.onObserveEnd;
    if (cb) cb();
  };

  /* ============================================================
   * 渲染
   * ============================================================ */
  BoardGaze.prototype._render = function () {
    var g = this.ctx, W = this.W, H = this.H, img = this.img;
    if (!g || !img) return;

    var cfg = this.cfg;
    g.clearRect(0, 0, W, H);

    /* ① 底图（cover 铺满） */
    var d = drawCover(g, img, W, H);

    /* ② 外围遮罩：模糊 + 变暗，用 destination-out 挖出清晰窗口 */
    var off = this._off || (this._off = document.createElement('canvas'));
    var dpr = this.dpr;
    if (off.width !== W * dpr || off.height !== H * dpr) {
      off.width = W * dpr; off.height = H * dpr;
    }
    var o = off.getContext('2d');
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.clearRect(0, 0, W, H);

    /* ★ 外围遮罩：用户要求"视野外全黑"（管状视野）。
       dim 接近 1 时直接填纯黑，不再画模糊底图（省一次 drawImage，白省性能）。 */
    var dim = cfg.dim === undefined ? 1.0 : cfg.dim;
    if (dim >= 0.99) {
      o.fillStyle = '#04070e';                 // 纯黑，外围什么都看不见
      o.fillRect(0, 0, W, H);
    } else {
      if (this._blurSrc) {
        o.imageSmoothingEnabled = true;
        o.drawImage(this._blurSrc, d.x, d.y, d.w, d.h);
      } else {
        o.drawImage(img, d.x, d.y, d.w, d.h);
      }
      o.fillStyle = 'rgba(4,7,14,' + dim + ')';
      o.fillRect(0, 0, W, H);
    }

    // 挖洞（径向渐变羽化边缘）
    var cx = this.center.x * W, cy = this.center.y * H;
    var r = cfg.windowRatio * W * 0.5;
    o.globalCompositeOperation = 'destination-out';
    var grd = o.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.25);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.72, 'rgba(0,0,0,0.92)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = grd;
    o.beginPath(); o.arc(cx, cy, r * 1.25, 0, Math.PI * 2); o.fill();
    o.globalCompositeOperation = 'source-over';

    g.drawImage(off, 0, 0, W, H);

    /* ②b ★ 渐进聚焦：窗口内叠加一层"重度模糊图"，随时间淡出
       —— 开场完全看不清，几秒后逐步清晰。
       用 alpha 混合而不是 ctx.filter，性能与 ctx.filter 无关。 */
    var blurAmt = this._blurAmount();
    if (blurAmt > 0.01 && this._blurHeavy) {
      g.save();
      g.beginPath();
      g.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
      g.clip();
      g.globalAlpha = Math.min(1, blurAmt);
      g.imageSmoothingEnabled = true;
      g.drawImage(this._blurHeavy, d.x, d.y, d.w, d.h);
      g.restore();
    }

    /* ③b ★ 方向凸起：视野圆圈的边缘朝"目标方向"鼓出一个包，
       告诉玩家该往哪拖。越接近目标，凸起越小；到达后消失。
       这是无美术的引导方式 —— 比箭头含蓄，又比纯盲找友好。 */
    var bumpCfg = this.cfg.bump || {};
    if (bumpCfg.enabled !== false) {
      var tg = this.cfg.target;
      var tgx = tg.x + tg.w / 2, tgy = tg.y + tg.h / 2;
      var vx = tgx - this.center.x, vy = tgy - this.center.y;
      var vd = Math.sqrt(vx * vx + vy * vy);
      var near = vd <= Math.max(tg.w, tg.h) * 0.5;     // 已在目标附近
      if (!near && vd > 1e-4) {
        var ang = Math.atan2(vy, vx);
        // 距离越远凸起越明显（但有上限，别太夸张）
        var strength = Math.min(1, vd / (bumpCfg.fullAt || 0.45));
        var amp = (bumpCfg.amp === undefined ? 0.30 : bumpCfg.amp) * strength;
        var spread = bumpCfg.spread === undefined ? 0.62 : bumpCfg.spread;  // 弧度半宽
        var wob = Math.sin(this.t * 3.0) * 0.03;        // 轻微呼吸

        g.save();
        g.beginPath();
        // 沿圆周画一圈，在目标方向附近向外鼓出
        var N = 40;
        for (var i = 0; i <= N; i++) {
          var a = (i / N) * Math.PI * 2;
          var diff = Math.atan2(Math.sin(a - ang), Math.cos(a - ang));  // 角度差（-π~π）
          var w = Math.max(0, 1 - Math.abs(diff) / spread);
          var bulge = 1 + amp * Math.pow(w, 1.6) + wob * w;
          var px = cx + Math.cos(a) * r * bulge;
          var py = cy + Math.sin(a) * r * bulge;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fillStyle = 'rgba(127,209,193,' + (0.10 + strength * 0.10).toFixed(3) + ')';
        g.fill();
        g.strokeStyle = 'rgba(127,209,193,' + (0.35 + strength * 0.30).toFixed(3) + ')';
        g.lineWidth = Math.max(2, W * 0.0035);
        g.stroke();
        g.restore();
      }
    }

    /* ③ 窗口边缘特效（★ 只做特效，不改变窗口大小） */
    var pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,' + (0.16 + pulse * 0.20).toFixed(3) + ')';
    g.lineWidth = Math.max(1.5, W * 0.0018);
    g.beginPath(); g.arc(cx, cy, r * 1.02, 0, Math.PI * 2); g.stroke();

    // 外圈轻微抖动的光晕（视觉噪声，模拟感官不稳）
    g.strokeStyle = 'rgba(127,209,193,' + (0.06 + pulse * 0.10).toFixed(3) + ')';
    g.lineWidth = Math.max(2, W * 0.004);
    g.beginPath(); g.arc(cx, cy, r * (1.10 + pulse * 0.04), 0, Math.PI * 2); g.stroke();
    g.restore();

    /* ④ 对准进度环 */
    var p = Math.min(1, this.dwell / this.cfg.dwellSec);
    if (p > 0.02) {
      g.save();
      g.strokeStyle = 'rgba(127,209,193,.95)';
      g.lineWidth = Math.max(3, W * 0.005);
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx, cy, r * 1.16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.stroke();
      g.restore();
    }

    /* ④b ★ 校准模式：判定区黄框 + 视野中心十字 + 实时坐标 */
    if (this.calib) {
      var tg = this.cfg.target;
      var tx = tg.x * W, ty = tg.y * H, tw = tg.w * W, th = tg.h * H;
      g.save();
      g.setLineDash([Math.max(4, W * 0.006), Math.max(4, W * 0.006)]);
      g.strokeStyle = 'rgba(255,214,102,.95)';
      g.lineWidth = Math.max(2, W * 0.003);
      g.strokeRect(tx, ty, tw, th);
      g.setLineDash([]);
      // 视野中心十字
      g.strokeStyle = 'rgba(255,90,90,.95)';
      g.beginPath();
      g.moveTo(cx - r * 0.5, cy); g.lineTo(cx + r * 0.5, cy);
      g.moveTo(cx, cy - r * 0.5); g.lineTo(cx, cy + r * 0.5);
      g.stroke();
      // 文字：坐标 + 是否命中
      var fs = Math.max(11, W * 0.014);
      g.font = '600 ' + fs + 'px monospace';
      g.textAlign = 'left'; g.textBaseline = 'top';
      var inside = this.center.x >= tg.x && this.center.x <= tg.x + tg.w &&
                   this.center.y >= tg.y && this.center.y <= tg.y + tg.h;
      var lines = [
        'CALIB 判定区 x=' + tg.x + ' y=' + tg.y + ' w=' + tg.w + ' h=' + tg.h,
        '中心 (' + this.center.x.toFixed(3) + ', ' + this.center.y.toFixed(3) + ')' +
          (inside ? '  ✔ 命中' : '  ✘ 未命中'),
        'target 中心应为 (' + (tg.x + tg.w / 2).toFixed(3) + ', ' + (tg.y + tg.h / 2).toFixed(3) + ')'
      ];
      g.fillStyle = 'rgba(4,7,14,.88)';
      g.fillRect(W * 0.02, H * 0.02, W * 0.44, fs * (lines.length + 0.8));
      lines.forEach(function (ln, i) {
        g.fillStyle = i === 1 ? (inside ? '#8ee6d3' : '#ff9b9b') : '#ffd666';
        g.fillText(ln, W * 0.03, H * 0.025 + i * fs * 1.25);
      });
      g.restore();
    }

    /* ⑤ 被夺走注意力时给个提示 */
    if (this._hijack) {
      g.save();
      g.fillStyle = 'rgba(255,220,190,.9)';
      g.font = '600 ' + Math.max(12, W * 0.016) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('注意力被' + this._hijack.label + '吸引', cx, cy - r * 1.5);
      g.restore();
    }
  };

  /* ============================================================
   * 工具
   * ============================================================ */
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /** 按 cover 方式算出图片的绘制矩形 */
  function drawCover(g, img, W, H) {
    var iw = img.naturalWidth || img.width || 1;
    var ih = img.naturalHeight || img.height || 1;
    var s = Math.max(W / iw, H / ih);
    var w = iw * s, h = ih * s;
    var x = (W - w) / 2, y = (H - h) / 2;
    g.drawImage(img, x, y, w, h);
    return { x: x, y: y, w: w, h: h };
  }

  global.BoardGaze = BoardGaze;

})(window);
