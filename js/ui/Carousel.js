/* ============================================================
 * Carousel.js —— 场景选择轮播（coverflow）+ 卡片氛围动效
 *
 * 一、交互能力
 *   1. 左右滑动 / 拖拽（鼠标、触摸统一用 Pointer Events）
 *   2. 松手后惯性滑行，自动吸附到最近的一张卡
 *   3. 点击非居中卡片 → 滑到居中；点击居中卡片 → 触发 onSelect
 *   4. 键盘 ← → 切换，回车/空格确认
 *   5. 滚轮横向滚动（PC）
 *
 * 二、动态效果
 *   1. 卡片随与中心的距离做 缩放 / 旋转Y / 位移Z / 透明度 变化（3D coverflow）
 *   2. 居中卡片高亮：亮度提升 + 描边光晕 + 详情文字展开
 *   3. ★ 每张卡片内嵌一个 canvas，绘制专属氛围动效（见下方 SceneFx）
 *
 * 用法：
 *   var c = new Carousel({
 *     container: el, items: SCENE_CARDS, assets: game.assets,
 *     onChange: function(idx, item){}, onSelect: function(idx, item){}
 *   });
 *   c.update(dt);   // 由所属场景每帧调用
 * ============================================================ */

(function (global) {
  'use strict';

  /* ============================================================
   * SceneFx —— 卡片内的氛围动效（纯 canvas 绘制，无需美术资源）
   * 5 种：chalk 粉笔灰 / leaves 落叶 / aisle 货架 / subway 地铁 / night 夜空
   * ★ 后续开发：有美术资源后，把 draw() 换成序列帧或视频即可，接口不变
   * ============================================================ */
  function SceneFx(type, tint) {
    this.type = type || 'chalk';
    this.tint = tint || '#ffffff';
    this.t = 0;
    this.parts = [];
    this._init();
  }

  SceneFx.prototype._init = function () {
    var n = { chalk: 46, leaves: 22, aisle: 0, subway: 0, night: 40 }[this.type] || 24;
    this.parts = [];
    for (var i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random(), y: Math.random(),
        r: 0.4 + Math.random() * 2.2,
        sp: 0.02 + Math.random() * 0.06,
        ph: Math.random() * Math.PI * 2,
        a: 0.15 + Math.random() * 0.5,
        rot: Math.random() * Math.PI * 2,
        rotSp: (Math.random() - 0.5) * 1.6
      });
    }
  };

  SceneFx.prototype.update = function (dt) { this.t += dt; };

  SceneFx.prototype.draw = function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    var fn = this['_' + this.type];
    if (fn) fn.call(this, ctx, w, h);
  };

  /** ① 课堂：粉笔灰在光柱里翻滚 + 顶灯轻微频闪 */
  SceneFx.prototype._chalk = function (ctx, w, h) {
    // 光柱（从顶部斜射下来）
    var flick = 0.82 + 0.18 * Math.sin(this.t * 9) * (Math.random() > 0.985 ? 2.2 : 1);
    var g = ctx.createLinearGradient(w * 0.2, 0, w * 0.75, h);
    g.addColorStop(0, 'rgba(255,233,168,' + (0.16 * flick).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,233,168,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, 0); ctx.lineTo(w * 0.62, 0);
    ctx.lineTo(w * 0.92, h); ctx.lineTo(w * 0.30, h);
    ctx.closePath(); ctx.fill();

    // 粉笔灰颗粒
    ctx.fillStyle = 'rgba(255,246,214,.55)';
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.y += p.sp * 0.06; p.x += Math.sin(this.t * 0.8 + p.ph) * 0.0008;
      if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
      var a = p.a * (0.5 + 0.5 * Math.sin(this.t * 1.6 + p.ph));
      ctx.globalAlpha = Math.max(0, a * flick);
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r * (h / 300) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /** ② 公园：飘落叶 + 缓慢移动的光斑 */
  SceneFx.prototype._leaves = function (ctx, w, h) {
    var g = ctx.createRadialGradient(w * 0.7, h * 0.25, 0, w * 0.7, h * 0.25, w * 0.8);
    g.addColorStop(0, 'rgba(255,246,200,.18)');
    g.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.y += p.sp * 0.09;
      p.x += Math.sin(this.t * 0.7 + p.ph) * 0.0022;
      p.rot += p.rotSp * 0.016;
      if (p.y > 1.1) { p.y = -0.1; p.x = Math.random(); }
      ctx.save();
      ctx.translate(p.x * w, p.y * h);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      ctx.fillStyle = 'rgba(168,230,184,.85)';
      // 叶片：一个扁椭圆
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 5 * (w / 300), p.r * 2.1 * (w / 300), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  /** ③ 超市：货架线条向两侧流动 + 冷白闪光 */
  SceneFx.prototype._aisle = function (ctx, w, h) {
    var cy = h * 0.52;
    ctx.strokeStyle = 'rgba(191,227,255,.30)';
    ctx.lineWidth = 1.4;
    for (var i = 0; i < 9; i++) {
      var t = ((i / 9) + (this.t * 0.16) % (1 / 9)) ;      // 持续向两侧流动
      var d = 0.06 + t * 0.94;
      var sc = d * d;                                       // 近大远小
      var halfW = w * 0.14 * sc, halfH = h * 0.30 * sc;
      ctx.globalAlpha = 0.10 + sc * 0.55;
      ctx.strokeRect(w / 2 - halfW, cy - halfH, halfW * 2, halfH * 2);
      // 货架横梁
      ctx.beginPath();
      ctx.moveTo(w / 2 - halfW, cy - halfH * 0.25);
      ctx.lineTo(w / 2 + halfW, cy - halfH * 0.25);
      ctx.stroke();
    }
    // 冷白灯闪光
    if (Math.random() > 0.97) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#eaf6ff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  };

  /** ④ 地铁：车厢晃动 + 哭声涟漪（同心圆向外扩散） */
  SceneFx.prototype._subway = function (ctx, w, h) {
    var shake = Math.sin(this.t * 3.1) * 2.4 + Math.sin(this.t * 7.7) * 1.1;
    ctx.save();
    ctx.translate(shake, Math.sin(this.t * 2.3) * 1.6);

    // 车厢窗格
    ctx.strokeStyle = 'rgba(201,184,255,.22)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(w * 0.14, h * 0.22, w * 0.72, h * 0.34);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.22); ctx.lineTo(w * 0.5, h * 0.56);
    ctx.stroke();

    // 哭声涟漪：周期性从中心扩散
    for (var k = 0; k < 3; k++) {
      var phase = (this.t * 0.55 + k / 3) % 1;
      var r = phase * w * 0.62;
      var a = (1 - phase) * 0.42;
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(217,160,255,.9)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.58, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /** ⑤ 夜晚：星星闪烁 + 缓慢呼吸的暗色光晕 */
  SceneFx.prototype._night = function (ctx, w, h) {
    var breathe = 0.5 + 0.5 * Math.sin(this.t * 0.7);
    var g = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.75);
    g.addColorStop(0, 'rgba(143,163,216,' + (0.10 + breathe * 0.10).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(143,163,216,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(this.t * (0.8 + p.a) + p.ph));
      ctx.globalAlpha = p.a * tw;
      ctx.fillStyle = '#dfe6ff';
      var s = p.r * (w / 300) * 1.5;
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h * 0.85, s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ============================================================
   * Carousel —— 轮播主体
   * ============================================================ */
  function Carousel(opts) {
    this.opts = opts || {};
    this.items = opts.items || [];
    this.assets = opts.assets;
    this.onChange = opts.onChange || null;
    this.onSelect = opts.onSelect || null;

    this.index = 0;          // 当前居中卡片（整数）
    this.position = 0;       // 浮点位置（用于平滑滑动）
    this.target = 0;         // 吸附目标
    this.velocity = 0;       // 惯性速度（单位：卡片数/秒）
    this.dragging = false;
    this.spacing = 1;        // 相邻卡片间距（像素），resize 时重算
    this.cards = [];
    this._t = 0;
    this.enabled = true;     // 所属场景离开后置 false，避免后台仍响应键盘

    this._build();
    this._bind();
    this.resize();
  }

  Carousel.prototype._build = function () {
    var self = this;
    var root = document.createElement('div');
    root.className = 'carousel';
    this.el = root;

    var track = document.createElement('div');
    track.className = 'carousel__track';
    root.appendChild(track);
    this.track = track;

    this.items.forEach(function (item, i) {
      var card = document.createElement('div');
      card.className = 'scene-card';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', item.title);

      var inner = document.createElement('div');
      inner.className = 'scene-card__inner';

      // ① 氛围动效 canvas（★ 有美术后可替换为序列帧）
      var cvs = document.createElement('canvas');
      cvs.className = 'scene-card__fx';
      inner.appendChild(cvs);

      // ② 背景图（★ 占位符：你的场景卡片图，见 config.ASSETS.scenes.cardXxx）
      var bg = document.createElement('div');
      bg.className = 'scene-card__bg';
      var img = self.assets && item.card ? self.assets.get(item.card) : null;
      if (img && img.src) bg.style.backgroundImage = 'url("' + img.src + '")';
      bg.style.backgroundColor = 'rgba(0,0,0,0)';
      inner.appendChild(bg);

      // ③ 暗部渐变，保证文字可读
      var shade = document.createElement('div');
      shade.className = 'scene-card__shade';
      inner.appendChild(shade);

      // ④ 文字内容
      var body = document.createElement('div');
      body.className = 'scene-card__body';
      var tagsHtml = (item.tags || []).map(function (t) {
        return '<span class="scene-card__tag">' + t + '</span>';
      }).join('');
      body.innerHTML =
        '<div class="scene-card__index">' + (item.index || ('0' + (i + 1))) + '</div>' +
        '<h3 class="scene-card__title">' + item.title + '</h3>' +
        '<p class="scene-card__sub">' + item.subtitle + '</p>' +
        '<p class="scene-card__desc">' + item.desc + '</p>' +
        '<div class="scene-card__tags">' + tagsHtml + '</div>';
      inner.appendChild(body);

      // ⑤ 选中态描边光
      var glow = document.createElement('div');
      glow.className = 'scene-card__glow';
      inner.appendChild(glow);

      card.appendChild(inner);
      track.appendChild(card);

      var fx = new SceneFx(item.fx, item.tint);
      self.cards.push({ el: card, inner: inner, canvas: cvs, ctx: cvs.getContext('2d'), fx: fx, item: item, visible: true });
    });
  };

  /* ---------- 事件绑定：拖拽 / 点击 / 键盘 / 滚轮 ---------- */
  Carousel.prototype._bind = function () {
    var self = this;
    var startX = 0, startPos = 0, moved = 0, lastX = 0, lastT = 0;

    this.el.addEventListener('pointerdown', function (e) {
      self.dragging = true;
      self.velocity = 0;
      startX = lastX = e.clientX;
      startPos = self.position;
      moved = 0;
      lastT = performance.now();
      self.el.classList.add('is-dragging');
      if (self.el.setPointerCapture && e.pointerId !== undefined) {
        try { self.el.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    this.el.addEventListener('pointermove', function (e) {
      if (!self.dragging) return;
      var dx = e.clientX - startX;
      moved = Math.abs(dx);
      self.position = startPos - dx / self.spacing;
      self.position = self._clamp(self.position);

      // 速度估算（用于松手后的惯性）
      var now = performance.now();
      var dt = Math.max(1, now - lastT) / 1000;
      var dp = (e.clientX - lastX) / self.spacing;
      self.velocity = -dp / dt;
      lastX = e.clientX; lastT = now;
    });

    var endDrag = function (e) {
      if (!self.dragging) return;
      self.dragging = false;
      self.el.classList.remove('is-dragging');
      // 拖拽距离很小 → 视为点击
      if (moved < 8) {
        var card = e.target ? e.target.closest('.scene-card') : null;
        if (card) {
          var i = self.cards.findIndex(function (c) { return c.el === card; });
          if (i >= 0) self._tap(i);
        }
        self.velocity = 0;
        self.target = Math.round(self.position);
        return;
      }
      // 惯性 + 预测落点
      var predicted = self.position + self.velocity * 0.28;
      self.target = self._clampInt(Math.round(predicted));
    };
    this.el.addEventListener('pointerup', endDrag);
    this.el.addEventListener('pointercancel', endDrag);
    this.el.addEventListener('pointerleave', function (e) { if (self.dragging) endDrag(e); });

    // 滚轮（PC 横滑）
    this.el.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 2) return;
      e.preventDefault();
      self.target = self._clampInt(self.target + (d > 0 ? 1 : -1));
      self.velocity = 0;
    }, { passive: false });

    // 键盘
    this.keyHandler = function (code) {
      if (!self.enabled) return;
      if (code === 'ArrowLeft' || code === 'KeyA') self.goTo(self.index - 1);
      else if (code === 'ArrowRight' || code === 'KeyD') self.goTo(self.index + 1);
      else if (code === 'Enter' || code === 'Space') {
        if (self.onSelect) self.onSelect(self.index, self.items[self.index]);
      }
    };
    bus.on('input:keydown', this.keyHandler);
  };

  /** 点击卡片：已居中则选中，否则滑到居中 */
  Carousel.prototype._tap = function (i) {
    var rel = Math.abs(i - this.position);
    if (rel < 0.18) {
      if (this.onSelect) this.onSelect(i, this.items[i]);
    } else {
      this.goTo(i);
    }
  };

  Carousel.prototype.goTo = function (i) {
    var prev = this.index;
    this.target = this._clampInt(i);
    this.index = this.target;
    this.velocity = 0;
    if (prev !== this.index && this.onChange) this.onChange(this.index, this.items[this.index]);
  };

  Carousel.prototype._clamp = function (v) {
    return Math.max(-0.6, Math.min(this.items.length - 1 + 0.6, v));
  };
  Carousel.prototype._clampInt = function (v) {
    return Math.max(0, Math.min(this.items.length - 1, Math.round(v)));
  };

  /* ---------- 尺寸：卡片大小与间距随屏幕自适应 ---------- */
  Carousel.prototype.resize = function () {
    var W = this.el.clientWidth || global.innerWidth;
    var H = this.el.clientHeight || global.innerHeight;
    // 卡片宽度：横屏保证两侧露出、竖屏则尽量占满宽度，避免卡片过小
    /* ★ 卡片尺寸（第二版：用户反馈还是太小）
       初版上限是 380 / 340，第一版放大到 470 / 400 仍不够。
       现在显著放开上限，并让高度主要由"内容需要"决定。 */
    var cw;
    if (H > W) {                       // 竖屏（手机）
      cw = Math.min(W * 0.80, 560);
    } else {                           // 横屏（PC / 横放手机）
      cw = Math.min(Math.max(W * 0.34, 300), Math.min(H * 0.78, 660));
    }
    // 高度：标题 + 副标题 + 完整介绍 + 标签 + 留白，给足
    var ch = cw * 1.42;
    var maxH = H * 0.86;              // 留一点上下呼吸空间，别顶满
    if (ch > maxH) { ch = maxH; }
    this.cardW = cw; this.cardH = ch;
    this.spacing = cw * 0.66;

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.cards.forEach(function (c) {
      c.el.style.width = cw + 'px';
      c.el.style.height = ch + 'px';
      c.canvas.width = Math.floor(cw * dpr);
      c.canvas.height = Math.floor(ch * dpr);
      c.canvas.style.width = cw + 'px';
      c.canvas.style.height = ch + 'px';
      c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    this._layout(true);
  };

  /* ---------- 每帧更新：位置插值 + 氛围动画 ---------- */
  Carousel.prototype.update = function (dt) {
    this._t += dt;

    if (!this.dragging) {
      if (Math.abs(this.velocity) > 0.35) {
        // 惯性滑行
        this.position += this.velocity * dt;
        this.velocity *= Math.pow(0.90, dt * 60);
        if (this.position <= -0.5 || this.position >= this.items.length - 0.5) this.velocity *= 0.5;
        this.position = this._clamp(this.position);
        if (Math.abs(this.velocity) <= 0.35) { this.velocity = 0; this.target = this._clampInt(Math.round(this.position)); }
      } else {
        // 吸附缓动
        var k = 1 - Math.pow(0.86, dt * 60);
        var before = Math.round(this.position * 100) / 100;
        this.position += (this.target - this.position) * k;
        if (Math.abs(this.target - this.position) < 0.001) this.position = this.target;
        var nowIdx = this._clampInt(Math.round(this.position));
        if (nowIdx !== this.index && before !== this.target) {
          this.index = nowIdx;
          if (this.onChange) this.onChange(this.index, this.items[this.index]);
        }
      }
    }

    this._layout(false);
    this._drawFx(dt);
  };

  /** 3D coverflow 布局：越远离中心，越小、越转、越淡 */
  Carousel.prototype._layout = function (force) {
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      var rel = i - this.position;                 // 相对中心的偏移（浮点）
      var ar = Math.abs(rel);
      var visible = ar < 3.2;

      if (!force && !visible && !c.visible) continue;
      c.visible = visible;
      if (!visible) { c.el.style.display = 'none'; continue; }
      c.el.style.display = '';

      var scale = Math.max(0.62, 1 - ar * 0.13);
      var rotY = -Math.max(-1.6, Math.min(1.6, rel)) * 20;
      var tz = -ar * 130;
      var x = rel * this.spacing;
      var op = Math.max(0.15, 1 - ar * 0.32);

      c.el.style.transform =
        'translate(-50%,-50%) translateX(' + x.toFixed(1) + 'px) translateZ(' + tz.toFixed(1) + 'px) ' +
        'rotateY(' + rotY.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      c.el.style.opacity = op.toFixed(3);
      c.el.style.zIndex = String(100 - Math.round(ar * 10));

      var isActive = ar < 0.5;
      c.el.classList.toggle('is-active', isActive);
    }
  };

  /** 绘制卡片氛围动效（只画可见卡片，省性能） */
  Carousel.prototype._drawFx = function (dt) {
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      if (!c.visible) continue;
      // 非居中卡片降频绘制（每 2 帧一次），保证滑动流畅
      var ar = Math.abs(i - this.position);
      if (ar > 0.6 && (this._frame = (this._frame || 0) + 1) % 2 === 0 && ar > 1.4) continue;
      c.fx.update(dt);
      c.fx.draw(c.ctx, this.cardW, this.cardH);
    }
  };

  Carousel.prototype.destroy = function () {
    bus.off('input:keydown', this.keyHandler);
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  global.Carousel = Carousel;
  global.SceneFx = SceneFx;

})(window);
