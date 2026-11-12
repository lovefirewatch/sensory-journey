/* ============================================================
 * FX.js —— 感官特效库（全部 canvas 实时绘制，无美术资源）
 *
 * 每个效果都对应设计稿里的一条具体规格，参数可直接对照：
 *   flicker()       顶灯频闪（12Hz / ±30%）
 *   tint()          冷绿色温偏移 #E8F5E9
 *   fragment()      画面碎片化（强度 0.4）
 *   afterimage()    残影
 *   tunnel()        隧道视野（中心 80px 清晰 / 边缘模糊 20px / 变暗 70%）
 *   overexpose()    过曝（强度 0.8）
 *   saturate()      饱和度拉满（2.0）
 *   shake()         画面震动（振幅 5px / 20Hz）
 *   （视觉干扰点由子场景用占位图绘制，见 SubSceneB._drawNoise）
 *   grain()         感官噪点
 *
 * ★ 无障碍：GAME_CONFIG.reduceSensory 打开后，
 *   频闪会降到 ±8% / 6Hz（光敏性癫痫风险区间是 5–30Hz，务必提供开关）。
 * ============================================================ */

(function (global) {
  'use strict';

  var FX = {};

  function reduce() {
    return !!(global.GAME_CONFIG && global.GAME_CONFIG.reduceSensory);
  }

  /** 顶灯频闪：返回亮度系数（1 为正常） */
  FX.flicker = function (t, hz, amount) {
    if (reduce()) { hz = 6; amount = 0.08; }        // 降低刺激模式
    return 1 + amount * Math.sin(t * Math.PI * 2 * hz);
  };

  /** 冷绿色温偏移：整屏叠一层半透明色 */
  FX.tint = function (ctx, W, H, color, strength) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = strength;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /**
   * 画面碎片化：把画面切成横条，每条随机横向位移
   * @param {number} intensity 0~1（0.4 = 设计稿强度）
   */
  FX.fragment = function (ctx, W, H, intensity, seed) {
    if (intensity <= 0) return;
    var rows = 14;
    var h = H / rows;
    ctx.save();
    for (var i = 0; i < rows; i++) {
      // 用 (seed, i) 做确定性伪随机，避免每帧乱跳成雪花
      var r = Math.sin((seed || 0) * 12.9898 + i * 78.233) * 43758.5453;
      var n = r - Math.floor(r);                     // 0~1
      var dx = (n - 0.5) * 2 * intensity * 60;
      if (Math.abs(dx) < 0.5) continue;
      ctx.drawImage(ctx.canvas,
        0, i * h, W, h,
        dx, i * h, W, h);
    }
    ctx.restore();
  };

  /** 残影：把上一帧以低透明度叠回来（需要调用方维护 trailCanvas） */
  FX.afterimage = function (ctx, trailCanvas, strength) {
    if (!trailCanvas) return;
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(trailCanvas, 0, 0);
    ctx.restore();
  };

  /**
   * 隧道视野
   * @param {object} o { clearRadius, blurPx, darken, progress }
   *   progress 0~1 用于 1.5 秒缓出过渡
   */
  FX.tunnel = function (ctx, W, H, sceneCanvas, o) {
    var p = Math.max(0, Math.min(1, o.progress));
    var ease = 1 - Math.pow(1 - p, 3);               // 缓出
    var R = o.clearRadius + (1 - ease) * (Math.max(W, H) * 0.6);  // 从大收缩到 80
    var cx = W / 2, cy = H / 2;

    // ① 边缘模糊：把场景画到缩略 canvas 再放大，配合 ctx.filter 得到廉价高斯
    if (sceneCanvas && ctx.filter !== undefined && o.blurPx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, R, 0, Math.PI * 2, true);      // 反向圆 → 挖出中心
      ctx.clip('evenodd');
      ctx.filter = 'blur(' + (o.blurPx * ease).toFixed(1) + 'px)';
      ctx.globalAlpha = ease;
      ctx.drawImage(sceneCanvas, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.restore();
    }

    // ② 边缘变暗 70%
    var g = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, Math.max(R, 1));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (o.darken * ease).toFixed(3) + ')');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 圆外部分全压到最暗
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,0,0,' + (o.darken * ease * 0.9).toFixed(3) + ')';
    ctx.fill('evenodd');
    ctx.restore();
  };

  /** 过曝：白色叠加 */
  FX.overexpose = function (ctx, W, H, strength) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, Math.min(1, strength)).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /** 饱和度拉满（支持 filter 的浏览器用 filter，否则用叠加近似） */
  FX.saturate = function (ctx, W, H, value) {
    if (ctx.filter !== undefined) {
      ctx.save();
      ctx.filter = 'saturate(' + value + ')';
      ctx.globalCompositeOperation = 'overlay';
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,220,180,.18)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  /** 画面震动：返回位移量（由调用方 translate） */
  FX.shake = function (t, amp, hz) {
    if (reduce()) { amp *= 0.4; }
    var a = Math.sin(t * Math.PI * 2 * hz) * amp;
    var b = Math.cos(t * Math.PI * 2 * hz * 1.37) * amp;
    return { x: a, y: b };
  };

  /** 感官噪点（轻量的随机点，强度随负载变化） */
  FX.grain = function (ctx, W, H, intensity, count) {
    if (intensity <= 0) return;
    var n = count || Math.floor(intensity * 220);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + intensity * 0.10).toFixed(3) + ')';
    for (var i = 0; i < n; i++) {
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6);
    }
    ctx.restore();
  };

  /** 缓出插值（1.5 秒过渡用） */
  FX.easeOut = function (k) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3); };

  global.FX = FX;

})(window);
