/* ============================================================
 * AssetLoader.js —— 图片预加载 + 占位兜底
 *
 * 关键能力（为"先跑通逻辑、后替换美术"而设计）：
 * 1. 递归遍历 GAME_CONFIG.ASSETS，把配置树加载成同构的 { key: HTMLImageElement }
 * 2. 图片 404 时不会报错中断，而是生成一张"占位色块"，并在 debug 模式打印缺失清单
 * 3. 因此你现在把占位图删掉、或还没做美术，游戏依然能正常跑起来
 * ============================================================ */

(function (global) {
  'use strict';

  /**
   * 按资源用途推断占位图尺寸
   * 目的：占位图保持与真实素材相近的宽高比，
   * 这样即使图片没加载，页面布局也不会被撑变形（宽按钮不会变成正方块）
   */
  function inferSize(keyPath) {
    var k = String(keyPath).toLowerCase();
    if (/card/.test(k))  return [192, 256];   // 3:4  竖版场景卡片
    if (/^ui\.bg|bg[A-Z]/.test(k)) return [320, 180]; // 16:9 背景
    if (/panel/.test(k)) return [256, 192];   // 4:3  面板
    if (/logo/.test(k))  return [320, 120];   // 8:3  标题 LOGO
    if (/arrow|sound|back/.test(k)) return [128, 128]; // 1:1 图标按钮
    if (/rest/.test(k))  return [320, 120];   // 8:3  休息按钮（宽扁形）
    if (/btn/.test(k))   return [384, 128];   // 3:1  宽按钮
    return [256, 256];
  }

  /**
   * 生成占位图（图片缺失时用它顶上）
   * @param {string} color 占位颜色
   * @param {string} label 画在占位图上的文字（资源 key）
   */
  function makePlaceholder(color, label, w, h) {
    var c = document.createElement('canvas');
    if (!w || !h) { var sz = inferSize(label); w = sz[0]; h = sz[1]; }
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = color || '#333';
    g.fillRect(0, 0, c.width, c.height);
    // 画斜条纹，一眼能看出这是占位图
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.lineWidth = Math.max(4, Math.min(w, h) / 40);
    for (var i = -c.height; i < c.width; i += Math.max(18, c.width / 14)) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + c.height, c.height); g.stroke();
    }
    // 边框，方便看清按钮实际占位范围
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, c.width - 2, c.height - 2);
    g.fillStyle = 'rgba(0,0,0,.7)';
    g.font = 'bold ' + Math.max(12, Math.min(22, h / 5)) + 'px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(label || 'IMG').slice(0, 24), c.width / 2, c.height / 2);
    return c;   // canvas 可直接当图片源使用（drawImage / CSS background 均支持）
  }

  function AssetLoader(config) {
    this.config = config.ASSETS || {};
    /** 已加载资源，结构同 config：assets.ui.btnStart -> Image/canvas */
    this.images = {};
    this.missing = [];      // 缺失资源清单（debug 用）
    this.loaded = 0;
    this.total = 0;
  }

  /** 统计需要加载的图片总数（用于进度条） */
  AssetLoader.prototype._count = function (node) {
    var n = 0;
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      var v = node[k];
      if (v && typeof v === 'object' && v.src) n++;
      else if (v && typeof v === 'object') n += this._count(v);
    }
    return n;
  };

  /**
   * 开始加载全部资源
   * @param {Function} onProgress 进度回调 (0~1)
   * @returns {Promise}
   */
  AssetLoader.prototype.load = function (onProgress) {
    var self = this;
    this.total = this._count(this.config);
    var jobs = [];
    var done = 0;

    function tick() {
      done++;
      if (onProgress) onProgress(self.total ? done / self.total : 1);
    }

    /**
     * 递归遍历配置树
     * ★ 注意：onload/onerror 是异步回调，必须用 IIFE 把 k / dstNode / keyPath
     *   固化到本次循环，否则异步回调执行时 for...in 早已结束，
     *   所有资源都会被写到同一个 key 上（这是最容易踩的坑）
     */
    function walk(srcNode, dstNode, path) {
      for (var k in srcNode) {
        if (!Object.prototype.hasOwnProperty.call(srcNode, k)) continue;
        var v = srcNode[k];
        var keyPath = path ? path + '.' + k : k;

        if (v && typeof v === 'object' && typeof v.src === 'string') {
          (function (dst, key, fullPath, item) {
            dst[key] = null;
            jobs.push(loadOne(item, fullPath).then(function (res) {
              dst[key] = res.img;
              if (res.missing) self.missing.push({ key: fullPath, src: res.src });
              tick();
            }));
          })(dstNode, k, keyPath, v);
        } else if (v && typeof v === 'object') {
          dstNode[k] = {};
          walk(v, dstNode[k], keyPath);
        }
      }
    }

    /**
     * 加载单张图，永远 resolve（失败则用占位图）
     *
     * ★ 重要：这里【不能】设置 img.crossOrigin = 'anonymous'
     *   原因：crossOrigin 会强制走 CORS 检查，而 file:// 协议下浏览器的来源是
     *   "null"（不透明来源），本地文件又不会返回 Access-Control-Allow-Origin 头，
     *   结果就是所有图片 onerror 全部失败 → 退化成占位图。
     *   表现：双击 index.html 打开时按钮全没图，用 http 服务器打开却正常。
     *   本项目只做 drawImage / CSS background，不读取图片像素，
     *   因此不需要 CORS 清理，保持默认（不设置）即可。
     *   （将来若要把外部图片画到 canvas 后 toDataURL 导出，再按需开启。）
     */
    function loadOne(item, keyPath) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve({ img: img, src: item.src, missing: false }); };
        img.onerror = function () {
          var ph = makePlaceholder(item.color, keyPath.split('.').pop());
          resolve({ img: ph, src: item.src, missing: true });
        };
        img.src = item.src;
      });
    }

    walk(this.config, this.images, '');
    return Promise.all(jobs);
  };

  /**
   * 取资源（支持 'ui.btnStart' 点号路径）
   * @param {string} path 如 'ui.btnStart'
   * @returns {HTMLImageElement|HTMLCanvasElement|null}
   */
  AssetLoader.prototype.get = function (path) {
    var parts = String(path).split('.');
    var cur = this.images;
    for (var i = 0; i < parts.length; i++) {
      if (!cur) return null;
      cur = cur[parts[i]];
    }
    return cur || null;
  };

  /**
   * 生成加载结果报告（排查图片问题时很有用）
   * 也可以在浏览器控制台随时调用：game.assets.report()
   * @returns {{total:number, ok:number, missing:Array, allFailed:boolean}}
   */
  AssetLoader.prototype.report = function () {
    var all = [];
    (function walk(node, prefix) {
      for (var k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        var v = node[k];
        var p = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && typeof v.src === 'string') all.push(p);
        else if (v && typeof v === 'object' && !v.tagName) walk(v, p);
      }
    })(this.images, '');
    return {
      total: this.total,
      ok: this.total - this.missing.length,
      missing: this.missing.slice(),
      allFailed: this.total > 0 && this.missing.length === this.total
    };
  };

  global.AssetLoader = AssetLoader;
  global.makePlaceholder = makePlaceholder;
  global.inferPlaceholderSize = inferSize;   // 导出，便于诊断脚本验证占位比例

})(window);
