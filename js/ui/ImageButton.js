/* ============================================================
 * ImageButton.js —— 图片按钮组件（★ 所有按钮都用它 ★）
 *
 * 设计目标：
 * 1. 按钮外观 100% 由你的图片决定：normal / hover / pressed / disabled 四态
 * 2. 图片缺失自动降级为文字按钮（class: is-missing），保证无美术也能开发
 * 3. 内置点击音效、键盘无障碍（Tab + Enter/Space）、禁用态
 *
 * 基本用法：
 *   var btn = new ImageButton({
 *     image:  assets.get('ui.btnStart'),          // 常态图
 *     hover:  assets.get('ui.btnStartHover'),     // 悬停图（可省）
 *     pressed:assets.get('ui.btnStartPressed'),   // 按下图（可省）
 *     alt:    '开始绘本',                          // 无障碍文本 + 图片缺失时的兜底文字
 *     className: 'btn-start',                     // 尺寸在 CSS 里控制
 *     sound: 'click',                             // 点击音效名（config.audio.sfx 中的键）
 *     onClick: function(){ ... }
 *   });
 *   document.querySelector('#ui-layer').appendChild(btn.el);
 *
 * 之后换图：btn.setImage(newImg)
 * 销毁：    btn.destroy()
 * ============================================================ */

(function (global) {
  'use strict';

  function ImageButton(opts) {
    opts = opts || {};
    this.opts = opts;
    this.image   = opts.image   || null;
    this.hover   = opts.hover   || null;
    this.pressed = opts.pressed || null;
    this.disabledImg = opts.disabled || null;
    this.enabled = opts.enabled !== false;
    this.onClick = opts.onClick || null;

    // ---------- DOM 结构 ----------
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'img-btn' + (opts.className ? ' ' + opts.className : '');
    if (opts.id) el.id = opts.id;
    el.setAttribute('aria-label', opts.alt || 'button');

    var img = document.createElement('img');
    img.className = 'img-btn__img';
    img.alt = opts.alt || '';
    img.draggable = false;

    var fb = document.createElement('span');
    fb.className = 'img-btn__fallback';
    fb.textContent = opts.alt || 'BUTTON';

    el.appendChild(img);
    el.appendChild(fb);
    this.el = el; this.img = img;

    this._applyImage(this.image);
    this._bind();
    if (!this.enabled) this.setEnabled(false);
  }

  /** 把图片资源写入 <img>（支持 HTMLImageElement 与 canvas 占位图） */
  ImageButton.prototype._applyImage = function (src) {
    var self = this;
    if (!src) { this.el.classList.add('is-missing'); return; }
    try {
      // canvas 占位图（缺失兜底）转成 dataURL 才能放进 <img>
      if (src instanceof HTMLCanvasElement) {
        this.img.src = src.toDataURL('image/png');
      } else if (typeof src === 'string') {
        this.img.src = src;
      } else {
        this.img.src = src.src || '';
      }
      this.el.classList.remove('is-missing');
    } catch (e) {
      this.el.classList.add('is-missing');
    }
    // 即便外部传入的资源加载失败，也回退到文字按钮
    this.img.onerror = function () { self.el.classList.add('is-missing'); };
  };

  ImageButton.prototype._bind = function () {
    var self = this;

    // 悬停换图（移动端无 hover，可忽略）
    this.el.addEventListener('mouseenter', function () {
      if (self.hover) self._applyImage(self.hover);
      if (self.opts.sound !== false) global.game && global.game.audio && global.game.audio.play('hover');
    });
    this.el.addEventListener('mouseleave', function () {
      self._applyImage(self.image);
    });
    // 按下换图
    this.el.addEventListener('pointerdown', function () {
      if (self.pressed) self._applyImage(self.pressed);
    });
    this.el.addEventListener('pointerup', function () {
      self._applyImage(self.hover || self.image);
    });

    // 点击：统一在这里解锁音频 + 播放音效 + 回调
    this.el.addEventListener('click', function (e) {
      e.preventDefault();
      if (!self.enabled) return;
      if (global.game && global.game.audio) {
        global.game.audio.unlock();                 // 首次点击解锁 AudioContext（浏览器策略要求）
        global.game.audio.play(self.opts.sound || 'click');
      }
      if (self.onClick) self.onClick(e);
      self._applyImage(self.image);
    });
  };

  /** 运行时换图：如声音按钮在 on/off 之间切换 */
  ImageButton.prototype.setImage = function (src) {
    this.image = src;
    this._applyImage(src);
    return this;
  };

  /** 改文字（也用于多语言切换） */
  ImageButton.prototype.setAlt = function (text) {
    this.el.setAttribute('aria-label', text);
    this.img.alt = text;
    this.el.querySelector('.img-btn__fallback').textContent = text;
  };

  ImageButton.prototype.setEnabled = function (v) {
    this.enabled = !!v;
    this.el.classList.toggle('is-disabled', !v);
    this.el.disabled = !v;
    if (v) this._applyImage(this.image);
    else if (this.disabledImg) this._applyImage(this.disabledImg);
  };

  /** 显示 / 隐藏（切换场景时复用 DOM，避免重复创建） */
  ImageButton.prototype.setVisible = function (v) {
    this.el.style.display = v ? '' : 'none';
  };

  ImageButton.prototype.destroy = function () {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  global.ImageButton = ImageButton;

})(window);
