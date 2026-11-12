/* ============================================================
 * main.js —— 启动入口
 *
 * 执行顺序：
 *   1. 创建 Game（画布 + 全局服务）
 *   2. 注册所有场景
 *   3. 建常驻 HUD（右上角声音按钮）
 *   4. 加载资源 → 进入标题页 → 启动主循环
 *
 * ★ 后续开发：新增页面 = 在这里 scenes.register('xxx', new XxxScene(game))
 * ============================================================ */

(function (global) {
  'use strict';

  function boot() {
    var cfg = global.GAME_CONFIG;

    // ① 创建游戏主控（挂在 window.game，方便控制台调试：game.scenes.go('game')）
    var game = new Game(cfg);
    global.game = game;

    // ② 常驻 HUD 与场景注册都放在资源就绪回调里（见下 ⑤）
    //    原因：场景 init() 会读取图片资源，必须在 AssetLoader 加载完成后执行，
    //    否则按钮与卡片会拿到空资源、退化成文字占位按钮。
    function setupScenes() {
      // ★ 新增场景就加一行
      game.scenes.register('title',   new TitleScene(game));         // 标题页
      game.scenes.register('about',   new AboutScene(game));         // 关于页
      game.scenes.register('select',  new SceneSelectScene(game));   // 选择生活场景
      game.scenes.register('pending', new PendingScene(game));       // 未开发场景的落点

      // 第一关「迟到的课堂」—— 交互电影
      game.scenes.register('level-intro', new LevelIntroScene(game)); // 伪加载 + 说明 + 两个按钮
      game.scenes.register('level1',      new VideoLevelScene(game)); // 视频 + 叠加交互

      /* ★ 后续关卡：照第一关的写法，加 level-intro / levelN 两组场景，
         并在 js/data/sceneCards.js 对应卡片上写 levelId: N 即可接入。
         第一人称通用原型见 js/scenes/ExperienceScene.js（暂未注册）。 */

      // 常驻 HUD：右上角声音开关（全局生效，不随场景销毁）
      game.buildGlobalHUD();
    }

    // ③ 任意首次点击/触摸 → 解锁音频（浏览器自动播放策略要求必须用户手势）
    var unlockOnce = function () {
      game.audio.unlock();
      if (!game.audio.muted && game.scenes.currentName === 'title') game.audio.playBGM();
      global.removeEventListener('pointerdown', unlockOnce);
      global.removeEventListener('keydown', unlockOnce);
    };
    global.addEventListener('pointerdown', unlockOnce);
    global.addEventListener('keydown', unlockOnce);

    // ⑤ 开始：加载资源 → 建场景 → 自动进入标题页
    game.start('title', setupScenes);

    // ⑥ 调试快捷键（debug 模式下生效，上线把 config.debug 改 false 即可）
    if (cfg.debug) {
      global.addEventListener('keydown', function (e) {
        if (e.code === 'Digit1') game.scenes.go('title');
        if (e.code === 'Digit2') game.scenes.go('about');
        if (e.code === 'Digit3') game.scenes.go('select');      // 直接看场景选择页
        if (e.code === 'Digit4') game.scenes.go('level-intro', { scene: window.SCENE_CARDS[0], levelId: 1 }); // 关卡加载页
        if (e.code === 'Digit5') game.scenes.go('level1');      // 直接进入第一关（交互电影）
        /* ★ 数字键 9：切换"看黑板"判定区校准模式（画黄框 + 坐标，便于调 target） */
        if (e.code === 'Digit9') {
          var cs = game.scenes.map['level1'];
          if (game.scenes.current !== cs) game.scenes.go('level1');
          setTimeout(function () { cs._toggleCalib(); }, 400);
        }
        if (e.code === 'Digit0') game.scenes.current.showIntro && game.scenes.current.showIntro(); // 重看介绍
        if (e.code === 'KeyM')   {                       // M 键 = 静音切换（和按钮同一套逻辑）
          var muted = game.audio.toggleMute();
          game.audio.syncBGM();
          console.log('[Audio] muted =', muted);
        }
      });
    }
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
