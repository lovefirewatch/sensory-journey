/**
 * _contrast.js —— WCAG 对比度计算（用于静态校验 UI 配色）
 *
 * ★ 为什么需要：「面板字看不清」这类问题靠肉眼很难在改动中守住，
 *   必须能量化。这里实现 WCAG 2.1 的相对亮度与对比度算法。
 *
 * 关键设计：叠加在视频/大图上的面板，底色往往是半透明的。
 *   半透明底遇到「很亮的画面」会整体变亮，白字就糊了。
 *   所以提供 compositeOnWhite()：把半透明色合成到纯白上（最坏情况），
 *   再算与文字色的对比度。只有这时仍达标，才算真正在任何画面上都可读。
 *
 * 用法：
 *   const { contrast, parseColor, compositeOnWhite } = require('./_contrast');
 */

'use strict';

/** 解析 #rgb / #rrggbb / rgb() / rgba() 为 { r, g, b, a }（a 默认 1） */
function parseColor(str) {
  if (!str) return null;
  var s = String(str).trim();

  var hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    var h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }

  var m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return {
      r: parseFloat(m[1]),
      g: parseFloat(m[2]),
      b: parseFloat(m[3]),
      a: m[4] === undefined ? 1 : parseFloat(m[4])
    };
  }
  return null;
}

/** 把半透明色合成到不透明底上（返回新的不透明色） */
function composite(fg, bg) {
  var a = fg.a === undefined ? 1 : fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1
  };
}

/** 合成到纯白上：模拟「底下是很亮的视频画面」的最坏情况 */
function compositeOnWhite(color) {
  return composite(color, { r: 255, g: 255, b: 255, a: 1 });
}

/** WCAG 相对亮度 */
function luminance(c) {
  var ch = [c.r, c.g, c.b].map(function (v) {
    var x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * WCAG 对比度（1 ~ 21）
 * @param {string|object} a 前景（文字）
 * @param {string|object} b 背景（可为半透明，会自动合成到纯白）
 */
function contrast(a, b) {
  var ca = typeof a === 'string' ? parseColor(a) : a;
  var cb = typeof b === 'string' ? parseColor(b) : b;
  if (!ca || !cb) return 0;

  // 背景半透明 → 合成到白色（最坏情况）
  var bg = cb.a < 1 ? compositeOnWhite(cb) : cb;
  var fg = ca.a < 1 ? compositeOnWhite(ca) : ca;

  var l1 = luminance(fg);
  var l2 = luminance(bg);
  var hi = Math.max(l1, l2);
  var lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** 是否达到 WCAG AA（普通文本 4.5:1） */
function meetsAA(a, b) { return contrast(a, b) >= 4.5; }

module.exports = { parseColor, composite, compositeOnWhite, luminance, contrast, meetsAA };
