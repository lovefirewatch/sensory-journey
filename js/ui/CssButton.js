/* ============================================================
 * CssButton.js —— 纯 CSS 按钮组件（★ 不再依赖任何图片）
 *
 * 与 ImageButton 的区别：
 *   ImageButton  = 图片按钮（需要美术资源，缺失时降级为文字）
 *   CssButton    = 代码画出来的成品按钮（渐变/玻璃/圆角/阴影）
 *
 * 用法：
 *   var b = new CssButton({
 *     text: '开始绘本',
 *     variant: 'primary',      // primary | ghost | choice | icon | pill
 *     icon: '<svg …/>',        // 可选，icon 变体用
 *     onClick: function(){}
 *   });
 *   parent.appendChild(b.el);
 *
 * ★ 移动端：不用 :hover（触屏没有），全部走 :active 反馈。
 * ============================================================ */

(function (global) {
  'use strict';

  function CssButton(opt) {
    opt = opt || {};
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn btn--' + (opt.variant || 'primary');
    if (opt.className) el.className += ' ' + opt.className;
    if (opt.text) el.textContent = opt.text;
    if (opt.icon) el.innerHTML = opt.icon;
    if (opt.title) el.title = opt.title;

    var sound = opt.sound === undefined ? 'click' : opt.sound;
    el.addEventListener('click', function (e) {
      if (sound && global.bus) bus.emit('ui:click', sound);
      if (opt.onClick) opt.onClick(e);
    });

    this.el = el;
    this.onClick = opt.onClick;
  }

  CssButton.prototype.setText = function (t) { this.el.textContent = t; };
  CssButton.prototype.setIcon = function (svg) { this.el.innerHTML = svg; };
  CssButton.prototype.setTitle = function (t) { this.el.title = t; };
  CssButton.prototype.setEnabled = function (v) {
    this.el.disabled = !v;
    this.el.style.opacity = v ? '' : '.45';
  };

  /* ---- 内联图标 ---- */
  var SVG = function (path, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
           'stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + path + '</svg>';
  };

  CssButton.ICON = {
    close:  SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
    back:   SVG('<path d="M15 18l-6-6 6-6"/>'),
    left:   SVG('<path d="M15 18l-6-6 6-6"/>'),
    right:  SVG('<path d="M9 6l6 6-6 6"/>'),
    soundOn: SVG('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/>'),
    soundOff: SVG('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M17 9l4 6M21 9l-4 6"/>'),
    play:   SVG('<path d="M6 4l14 8-14 8V4z" fill="currentColor"/>'),
    pause:  SVG('<path d="M7 4v16M17 4v16"/>'),
    skip:   SVG('<path d="M5 4l10 8-10 8V4zM19 4v16"/>')
  };

  global.CssButton = CssButton;

})(window);
