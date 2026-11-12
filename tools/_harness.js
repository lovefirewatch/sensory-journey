/**
 * _harness.js —— 测试脚手架（供 smoke_test / check_assets / level1_test 复用）
 *
 * 关键设计：脚本清单直接从 index.html 解析，不在测试里手写。
 * 这样新增场景 / 组件时测试自动跟上，不会出现"忘了同步测试导致的假失败"。
 *
 * 提供：
 *   createSandbox(opts) → { sandbox, nodes, run }
 *     sandbox  vm 沙箱（含最小 DOM / Canvas / WebAudio 桩件）
 *     nodes    各层 DOM 节点（ui-layer / hud-layer / app ...）
 *     run(expr)在沙箱内求值并返回结果（规避跨 realm 取值差异）
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** 从 index.html 解析脚本清单（先去掉 HTML 注释，避免把注释掉的脚本算进来） */
function readScriptFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  const re = /<script[^>]+src\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(noComments))) out.push(m[1]);
  return out;
}

/** Canvas 2D 上下文桩件：任意方法都可调用，渐变返回带 addColorStop 的对象 */
function makeCtx(canvas) {
  const target = {
    canvas: canvas || { width: 300, height: 400 },
    __calls: []          // ★ 记录 ellipse/clip 等调用，供渲染断言使用
  };
  return new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 40 });
      /**
       * ★ BoardView 用到 ellipse / arcTo / setTransform / clip 等。
       *   桩件缺方法会直接抛错，让"视野渲染"完全无法测试。
       *   这里补齐为 no-op，并把 drawImage 等的调用记录下来以便断言。
       */
      if (k === 'ellipse') return function () { o.__calls.push('ellipse'); };
      if (k === 'arcTo') return function () { o.__calls.push('arcTo'); };
      if (k === 'clip') return function () { o.__calls.push('clip'); };
      if (k === 'setTransform') return function () {};
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
}

function HTMLCanvasElement() {}

/** style 桩件：支持普通属性赋值 + CSS 变量的 setProperty / getPropertyValue */
function makeStyle() {
  const st = {
    setProperty(k, v) { this[k] = String(v); },
    getPropertyValue(k) { return this[k] === undefined ? '' : String(this[k]); },
    removeProperty(k) { delete this[k]; }
  };
  return st;
}

/**
 * 创建 DOM 元素桩件
 * @param {string} tag
 * @param {object} opts { fileExists(path) → bool } 决定 Image 是否加载成功
 */
function makeEl(tag, opts) {
  const el = tag === 'canvas' ? Object.create(HTMLCanvasElement.prototype) : {};
  const isVideo = tag === 'video';
  if (isVideo) {
    Object.assign(el, {
      paused: true, ended: false, muted: false, volume: 1,
      duration: 0, currentTime: 0, loop: false, playsInline: false,
      readyState: 0,
      play() { el.paused = false; el._playPromise = Promise.resolve(); return el._playPromise; },
      pause() { el.paused = true; },
      /**
       * ★ 触发 loadedmetadata：VideoPlayer.load() 的 Promise 依赖它，
       *   不触发的话 _runStep 永远停在 .then() 之前，测试会假失败。
       *   同时按 src 里的段号注入真实时长（读 LEVEL1.durations），
       *   这样"停在首帧/末帧"的时间点逻辑也能被验证。
       */
      load() {
        el.readyState = 1;
        const m = String(el.src || '').match(/seg(\d+)\.mp4/);
        if (m) {
          // 延迟到下一个 tick，模拟真实异步
          setTimeout(() => {
            const w = (typeof window !== 'undefined' && window.LEVEL1) ? window : null;
            const durs = w ? w.LEVEL1.durations : null;
            el.duration = durs ? (durs[m[1]] || 5) : 5;
            el.readyState = 4;
            el.dispatch('loadedmetadata', { target: el });
          }, 0);
        }
      },
      canPlayType() { return 'maybe'; }
    });
  }
  Object.assign(el, {
    tagName: tag, children: [], parentNode: null, style: makeStyle(), dataset: {},
    textContent: '', innerHTML: '', disabled: false, type: '', alt: '', id: '', src: '',
    offsetWidth: 100, clientWidth: 1280, clientHeight: 720, naturalWidth: 0,
    _classes: new Set(), _listeners: {},
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    setAttribute(k, v) { el[k] = v; },
    getAttribute(k) { return el[k]; },
    addEventListener(t, fn) { (el._listeners[t] || (el._listeners[t] = [])).push(fn); },
    removeEventListener() {},
    /**
     * ★ 派发时必须补全标准事件方法（preventDefault / stopPropagation / pointerId…），
     *   否则业务代码里调用 e.preventDefault() 会直接抛错。
     */
    dispatch(t, ev) {
      const e = Object.assign({
        target: el, currentTarget: el,
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
      }, ev || {});
      (el._listeners[t] || []).forEach(fn => fn(e));
    },
    querySelector(s) { return el.children.find(c => c._classes.has(s.replace(/^\./, ''))) || makeEl('div', opts); },
    querySelectorAll(s) { return el.children.filter(c => c._classes.has(s.replace(/^\./, ''))); },
    /**
     * 沿 parentNode 向上找匹配选择器的祖先
     * ★ 必须真实实现：Input.js 的 isUIEvent() 依赖 closest() 过滤 UI 点击，
     *   若桩件永远返回 null，测试就永远发现不了"某层全屏容器吞掉场景点击"这类 bug。
     * 支持：.cls  /  .a.b  /  a,b,c（逗号分隔，任一匹配即可）
     */
    closest(sel) {
      if (!sel) return null;
      const groups = String(sel).split(',').map(s => s.trim()).filter(Boolean);
      let cur = el;
      while (cur) {
        for (const g of groups) {
          const classes = g.split('.').filter(Boolean);
          if (classes.length && classes.every(c => cur._classes && cur._classes.has(c))) return cur;
          if (!classes.length && cur.tagName === g) return cur;
        }
        cur = cur.parentNode;
      }
      return null;
    },
    click() { el.dispatch('click', { target: el, preventDefault() {}, stopPropagation() {} }); },
    getContext() { return makeCtx(el); },
    toDataURL() { return 'data:image/png;base64,PLACEHOLDER'; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  });
  /* ★ innerHTML 必须用 defineProperty：真实 DOM 里 `el.innerHTML = ''` 会清空子节点，
     而普通属性赋值不会 —— 导致重渲染后 children 里残留旧按钮，
     测试会点到已经被移除的旧元素上（表现为"点了没反应"）。 */
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return el.__html || ''; },
    set(v) {
      el.__html = String(v);
      if (el.__html === '') el.children.length = 0;
    }
  });

  // className 必须用 defineProperty：Object.assign 会把访问器覆盖成普通属性
  Object.defineProperty(el, 'className', {
    configurable: true,
    get() { return Array.from(el._classes).join(' '); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  el.classList = {
    add: (...c) => c.forEach(x => el._classes.add(x)),
    remove: (...c) => c.forEach(x => el._classes.delete(x)),
    contains: c => el._classes.has(c),
    toggle: (c, f) => {
      const on = f === undefined ? !el._classes.has(c) : !!f;
      on ? el._classes.add(c) : el._classes.delete(c);
      return on;
    }
  };
  return el;
}

/**
 * @param {object} [opts]
 *   opts.fileExists {Function} 判断图片路径是否存在（默认按磁盘真实判断）
 *   opts.audio      {boolean}  是否提供 WebAudio 桩件（默认提供）
 */
function createSandbox(opts) {
  opts = opts || {};
  const fileExists = opts.fileExists || (p => fs.existsSync(path.join(ROOT, String(p).split('?')[0])));

  const ids = ['app', 'bg-layer', 'game-canvas', 'ui-layer', 'hud-layer', 'loading', 'loading-bar-fill'];
  const nodes = {};
  ids.forEach(id => nodes[id] = makeEl('div', opts));
  nodes['game-canvas'] = makeEl('canvas', opts);

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, Date, JSON,
    performance: { now: () => Date.now() },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    /**
     * ★ RAF 必须成对提供 cancel：VideoPlayer 用 RAF 巡检做精确暂停，
     *   _stop() 会调 cancelAnimationFrame，缺了它一暂停就抛错。
     */
    requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); },
    cancelAnimationFrame(id) { clearTimeout(id); },
    addEventListener() {}, removeEventListener() {},
    document: {
      readyState: 'complete',
      documentElement: makeEl('html', opts),     // 供 applyTheme 写 CSS 变量
      getElementById: id => nodes[id] || makeEl('div', opts),
      createElement: tag => makeEl(tag, opts),
      addEventListener() {}, removeEventListener() {}
    },
    Image: class {
      constructor() { this.width = 0; this.height = 0; this.naturalWidth = 0; }
      set src(v) {
        this._src = v;
        const ok = fileExists(v);
        setTimeout(() => {
          if (ok) { this.naturalWidth = 256; this.onload && this.onload(); }
          else this.onerror && this.onerror();
        }, 0);
      }
      get src() { return this._src; }
    },
    Audio: class { constructor(s) { this.src = s; } play() { return Promise.resolve(); } pause() {} },
    HTMLCanvasElement
  };

  if (opts.audio !== false) {
    // 最小 WebAudio 桩件：让 SoundScape 能完整跑起来（验证节点连接不报错）
    const param = () => ({
      value: 0,
      setValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      exponentialRampToValueAtTime() { return this; },
      cancelScheduledValues() { return this; }
    });
    const node = (extra) => Object.assign({
      connect() { return node(); }, disconnect() {}, start() {}, stop() {}
    }, extra || {});
    sandbox.AudioContext = class {
      constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = node(); }
      resume() {}
      createGain() { return node({ gain: param() }); }
      createBiquadFilter() { return node({ type: '', frequency: param(), Q: param() }); }
      createOscillator() { return node({ type: '', frequency: param(), detune: param() }); }
      createStereoPanner() { return node({ pan: param() }); }
      createBufferSource() { return node({ buffer: null, loop: false }); }
      createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len), length: len }; }
    };
  }

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  const files = readScriptFiles();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }

  return {
    sandbox, nodes, files,
    run: expr => vm.runInContext(expr, sandbox)
  };
}

module.exports = { createSandbox, readScriptFiles, ROOT };
