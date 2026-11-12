/* ============================================================
 * Input.js —— 统一输入管理（键盘 / 鼠标 / 触摸 / 拖拽视角）
 *
 * 第一人称场景需要"持续按住"这类状态（前进、转向、自我调节），
 * 所以这里维护 keys 状态表，而不是只在事件里处理逻辑。
 * ============================================================ */

(function (global) {
  'use strict';

  function Input(target) {
    this.target = target || document;
    this.keys = Object.create(null);      // { KeyW: true, ... }
    this.pointer = { x: 0, y: 0, nx: 0, ny: 0, down: false }; // nx/ny 为 -1~1 归一化坐标
    this.drag = { active: false, dx: 0, lastX: 0 };           // 拖拽位移（用于转视角）
    this._enabled = true;
    this._bind();
  }

  Input.prototype._bind = function () {
    var self = this;

    // ---------- 键盘 ----------
    global.addEventListener('keydown', function (e) {
      if (!self._enabled) return;
      // 空格/方向键会滚动页面，游戏里需拦截
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      if (!self.keys[e.code]) bus.emit('input:keydown', e.code);
      self.keys[e.code] = true;
    });
    global.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      bus.emit('input:keyup', e.code);
    });
    global.addEventListener('blur', function () { self.keys = Object.create(null); }); // 失焦清空，防止"卡键"

    // ---------- 指针（鼠标 + 触摸统一用 Pointer Events） ----------
    var t = this.target;

    /**
     * 判断是否点在 UI 控件上
     * ★ 必须过滤：按钮是 #app 的子元素，点击会冒泡到 #app，
     *   若不过滤，点"休息一下"这类按钮会同时被当成"点击场景"。
     * ★ 这里只拦截"确实是控件"的元素，菜单页的滑动/卡片交互不在此列，
     *   因此不会影响进入关卡之前的操作方式。
     */
    function isUIEvent(e) {
      var el = e && e.target;
      if (!el || !el.closest) return false;
      return !!el.closest('.img-btn, button, .asset-warn, .dialog-mask, .lvl-hud');
    }

    t.addEventListener('pointerdown', function (e) {
      self._updatePointer(e);
      if (isUIEvent(e)) return;              // 点在按钮上：不算游戏内点击
      self.pointer.down = true;
      self.drag.active = true;
      self.drag.lastX = e.clientX;
      bus.emit('input:down', self.pointer);
    });
    global.addEventListener('pointermove', function (e) {
      self._updatePointer(e);
      if (self.drag.active) {
        self.drag.dx = e.clientX - self.drag.lastX;
        self.drag.lastX = e.clientX;
        bus.emit('input:drag', self.drag);
      }
      bus.emit('input:move', self.pointer);
    });
    global.addEventListener('pointerup', function () {
      self.pointer.down = false;
      self.drag.active = false;
      self.drag.dx = 0;
      bus.emit('input:up', self.pointer);
    });
    global.addEventListener('pointercancel', function () {
      self.pointer.down = false; self.drag.active = false;
    });
  };

  Input.prototype._updatePointer = function (e) {
    var w = global.innerWidth, h = global.innerHeight;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.nx = (e.clientX / w) * 2 - 1;    // -1(左) ~ 1(右)
    this.pointer.ny = (e.clientY / h) * 2 - 1;    // -1(上) ~ 1(下)
  };

  /** 某键是否处于按下状态 */
  Input.prototype.isDown = function (code) { return !!this.keys[code]; };
  /** 任一指定键按下 */
  Input.prototype.anyDown = function () {
    for (var i = 0; i < arguments.length; i++) if (this.keys[arguments[i]]) return true;
    return false;
  };
  /** 是否正在"自我调节"（按住空格 / 按住屏幕） */
  Input.prototype.isRegulating = function () {
    return this.isDown('Space') || this.pointer.down;
  };

  Input.prototype.setEnabled = function (v) { this._enabled = !!v; };

  global.Input = Input;

})(window);
