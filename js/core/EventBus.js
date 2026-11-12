/* ============================================================
 * EventBus.js —— 全局事件总线（模块解耦用）
 * 用法：
 *   bus.on('scene:change', fn);
 *   bus.emit('scene:change', { to: 'game' });
 *   bus.off('scene:change', fn);
 * 好处：场景、音频、UI 之间不需要互相持有引用，后续加功能不用改老代码
 * ============================================================ */

(function (global) {
  'use strict';

  function EventBus() {
    this._map = Object.create(null);   // { 事件名: [回调, ...] }
  }

  /**
   * 监听事件
   * @param {string}   name     事件名
   * @param {Function} handler  回调
   * @param {object}   [ctx]    回调 this 指向
   */
  EventBus.prototype.on = function (name, handler, ctx) {
    (this._map[name] || (this._map[name] = [])).push({ fn: handler, ctx: ctx });
    return this;
  };

  /** 监听一次后自动移除 */
  EventBus.prototype.once = function (name, handler, ctx) {
    var self = this;
    var wrap = function () {
      self.off(name, wrap);
      handler.apply(ctx || null, arguments);
    };
    return this.on(name, wrap);
  };

  /** 取消监听（不传 handler 则清空该事件） */
  EventBus.prototype.off = function (name, handler) {
    var list = this._map[name];
    if (!list) return this;
    if (!handler) { delete this._map[name]; return this; }
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].fn === handler) list.splice(i, 1);
    }
    return this;
  };

  /** 触发事件，多余参数透传给回调 */
  EventBus.prototype.emit = function (name) {
    var list = this._map[name];
    if (!list || !list.length) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    // 复制一份再遍历：允许回调内部增删监听
    list.slice().forEach(function (item) {
      try { item.fn.apply(item.ctx || null, args); }
      catch (e) { console.error('[EventBus] handler error on "' + name + '":', e); }
    });
    return this;
  };

  global.EventBus = EventBus;
  global.bus = new EventBus();   // 全局单例，各处直接用 bus.on / bus.emit

})(window);
