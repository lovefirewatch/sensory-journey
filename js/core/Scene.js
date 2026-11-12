/* ============================================================
 * Scene.js —— 场景基类
 *
 * 约定了每个场景的生命周期，新增场景时继承它并实现对应钩子即可：
 *   init()     创建时调用一次：建 DOM、绑事件
 *   enter(p)   进入场景：显示 UI、起 BGM、重置状态；p 为上个场景传来的参数
 *   exit()     离开场景：隐藏 UI、清理定时器
 *   update(dt) 每帧逻辑（dt 单位：秒）
 *   render(ctx)每帧绘制（ctx 为 canvas 2d 上下文，已按屏幕坐标系统一）
 *   resize()   窗口尺寸变化
 *
 * ★ 后续开发提示：场景就是"页面"，标题页/关于页/关卡页/结算页都继承它
 * ============================================================ */

(function (global) {
  'use strict';

  function Scene(game, name) {
    this.game = game;                       // 持有全局服务：game.audio / game.assets / game.scenes / game.input
    this.name = name || 'scene';
    this.uiLayer = document.getElementById('ui-layer');
    this.bgLayer = document.getElementById('bg-layer');
    this.el = null;                         // 场景根 DOM（子类自建）
    this.active = false;
  }

  /** 子类覆写：初始化（只调用一次） */
  Scene.prototype.init = function () {};

  /** 子类覆写：进入场景 */
  Scene.prototype.enter = function () {
    this.active = true;
  };

  /** 子类覆写：离开场景 */
  Scene.prototype.exit = function () {
    this.active = false;
    if (this.el) this.el.style.display = 'none';   // 默认隐藏而不销毁，方便快速回退
  };

  Scene.prototype.update = function () {};   // dt
  Scene.prototype.render = function () {};   // ctx
  Scene.prototype.resize = function () {};

  /** 工具：设置背景图（传 null 则清空） */
  Scene.prototype.setBackground = function (imgOrUrl) {
    if (!imgOrUrl) { this.bgLayer.style.backgroundImage = ''; return; }
    var url = (typeof imgOrUrl === 'string') ? imgOrUrl : (imgOrUrl.src || '');
    this.bgLayer.style.backgroundImage = 'url("' + url + '")';
  };

  /** 工具：清空本场景挂载过的 UI（切场景时由 SceneManager 调用） */
  Scene.prototype.clearUI = function () {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
  };

  global.Scene = Scene;

})(window);
