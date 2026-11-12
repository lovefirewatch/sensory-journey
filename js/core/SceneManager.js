/* ============================================================
 * SceneManager.js —— 场景注册与切换
 *
 * 用法：
 *   scenes.register('title', new TitleScene(game));
 *   scenes.go('game', { level: 1 });     // 切换
 *   scenes.back();                       // 返回上一场景
 *
 * ★ 后续开发：新增一个页面 = 新建 js/scenes/XxxScene.js + 这里 register 一行
 * ============================================================ */

(function (global) {
  'use strict';

  function SceneManager(game) {
    this.game = game;
    this.map = Object.create(null);   // { name: Scene }
    this.current = null;              // 当前场景实例
    this.currentName = '';
    this.stack = [];                  // 返回栈（支持 back()）
    this._transitioning = false;      // 防止连点导致重复切换
  }

  /** 注册场景 */
  SceneManager.prototype.register = function (name, scene) {
    this.map[name] = scene;
    if (scene.init) scene.init();
    return this;
  };

  /**
   * 切换场景
   * @param {string} name 已注册的场景名
   * @param {object} [params] 传给 enter(params) 的参数
   * @param {boolean} [pushStack=true] 是否压栈（false 则不参与 back()）
   */
  SceneManager.prototype.go = function (name, params, pushStack) {
    if (this._transitioning) return;
    var next = this.map[name];
    if (!next) { console.error('[SceneManager] 未注册的场景：' + name); return; }
    this._transitioning = true;

    var prevName = this.currentName;
    if (this.current) {
      if (pushStack !== false && prevName) this.stack.push({ name: prevName });
      this.current.exit();
    }

    this.current = next;
    this.currentName = name;
    next.enter(params || {});

    bus.emit('scene:change', { from: prevName, to: name, params: params || {} });

    // 简易转场：淡入（后续可换成图片遮罩转场，用 assets.ui.maskFade）
    var self = this;
    setTimeout(function () { self._transitioning = false; }, 220);
  };

  /** 返回上一场景（无历史则回标题页） */
  SceneManager.prototype.back = function () {
    var last = this.stack.pop();
    this.go(last ? last.name : 'title', {}, false);
  };

  /** 每帧派发 */
  SceneManager.prototype.update = function (dt) {
    if (this.current && this.current.update) this.current.update(dt);
  };
  SceneManager.prototype.render = function (ctx) {
    if (this.current && this.current.render) this.current.render(ctx);
  };
  SceneManager.prototype.resize = function (w, h) {
    for (var k in this.map) if (this.map[k].resize) this.map[k].resize(w, h);
  };

  global.SceneManager = SceneManager;

})(window);
