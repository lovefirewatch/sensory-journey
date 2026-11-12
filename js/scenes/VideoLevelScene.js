/* ============================================================
 * VideoLevelScene.js —— 交互电影主控（第一关「迟到的课堂」）
 *
 * 流程（全部由 js/data/level1.js 的 timeline 驱动，本文件不含任何剧情文案）：
 *
 *   step0 视频1 直接播放
 *   step1 视频2 → 停在首帧 → 交互①点击右上「敲门」→ 播完视频2
 *   step2 视频3 → 停在首帧 → 交互②点击左下「门把手」→ 播完视频3
 *   step3 视频3 停在末帧 → 选择① A回座位 / B去外面站着
 *         选 B → 移除 B，重播视频3（跳过交互②）→ 再问
 *   step4 视频4 播放，前 4 秒悬浮座位算式
 *   step5 视频4 停在末帧 → 选择② 4 选 1，选错提示并移除该选项
 *   step6 视频5 播放 → 播完 → 结束面板
 *
 * 关键实现：
 *   · 每段用独立 VideoPlayer，切段时复用同一个 <video> 元素（移动端更稳）
 *   · "停在首帧/末帧"用 RAF 精确暂停 + seek，不用 timeupdate（4Hz 会错过）
 *   · 竖屏强制横屏：暂停 + 遮罩，转回横屏从暂停处继续
 *   · 声音开关同时控制视频音量和交互音效
 *   · 跳过按钮：可跳过当前正在播放的片段
 * ============================================================ */

(function (global) {
  'use strict';

  function VideoLevelScene(game) {
    Scene.call(this, game, 'level1');
    this.L = null;
    this.stepIndex = 0;
    this.player = null;
    this.interact = null;
    this.seat = null;          // 本次随机出的座位答案 {row, col}
    this._built = false;
    this._pausedByRotate = false;
    this._skipUsed = {};       // 记录哪些段已被跳过（避免重播时又跳过）
  }
  VideoLevelScene.prototype = Object.create(Scene.prototype);
  VideoLevelScene.prototype.constructor = VideoLevelScene;

  /* ============================================================
   * 初始化（★ 不挂 DOM，UI 延迟到首次 enter，避免关卡按钮出现在菜单上）
   * ============================================================ */
  VideoLevelScene.prototype.init = function () {
    this.L = global.LEVEL1;
    this.player = null;
  };

  VideoLevelScene.prototype._src = function (seg) {
    var v = this.L.video;
    return v.dir + v.prefix + seg + v.ext;
  };

  /* ============================================================
   * 建 DOM
   * ============================================================ */
  VideoLevelScene.prototype._build = function () {
    if (this._built) return;
    this._built = true;
    var self = this, L = this.L;

    var root = document.createElement('div');
    root.className = 'vl-root';

    var stage = document.createElement('div');
    stage.className = 'vl-stage';

    // ① 视频
    var video = document.createElement('video');
    video.className = 'vl-video';
    video.preload = 'auto';
    video.playsInline = true;
    stage.appendChild(video);
    this.videoEl = video;
    this.player = new VideoPlayer(video);

    // ② 交互层（叠在视频上）
    var hud = document.createElement('div');
    hud.className = 'vl-hud';
    stage.appendChild(hud);
    this.hudEl = hud;
    this.interact = new InteractLayer(hud);

    // ③ 右上角工具条：跳过 / 退出
    var tools = document.createElement('div');
    tools.className = 'vl-tools';

    this.btnSkip = document.createElement('button');
    this.btnSkip.className = 'btn btn--pill';
    this.btnSkip.type = 'button';
    this.btnSkip.textContent = L.ui.skip;
    this.btnSkip.addEventListener('click', function () { self._skip(); });
    tools.appendChild(this.btnSkip);

    this.btnQuit = document.createElement('button');
    this.btnQuit.className = 'btn btn--icon';
    this.btnQuit.type = 'button';
    this.btnQuit.innerHTML = ICON.close;
    this.btnQuit.addEventListener('click', function () { self.quit(); });
    tools.appendChild(this.btnQuit);

    stage.appendChild(tools);

    // ④ 加载指示
    var loading = document.createElement('div');
    loading.className = 'vl-loading';
    loading.textContent = L.ui.loading;
    stage.appendChild(loading);
    this.loadingEl = loading;

    // ⑤ 强制横屏遮罩
    var rot = document.createElement('div');
    rot.className = 'vl-rotate';
    rot.innerHTML =
      '<div class="vl-rotate__icon"></div>' +
      '<div class="vl-rotate__title">' + L.ui.rotateTitle + '</div>' +
      '<div class="vl-rotate__text">' + L.ui.rotateText + '</div>';
    stage.appendChild(rot);
    this.rotateEl = rot;

    // ⑥ 关卡信息卡（视频开场前，点击开始）
    var card = document.createElement('div');
    card.className = 'vl-card';
    var cbox = document.createElement('div');
    cbox.className = 'vl-card__box';
    var C = L.card;
    cbox.innerHTML =
      '<p class="vl-card__eyebrow">第 一 关</p>' +
      '<h2 class="vl-card__title">' + L.title + '</h2>' +
      '<p class="vl-card__subtitle">' + L.subtitle + '</p>' +
      '<dl class="vl-card__meta">' +
        '<dt>' + C.labels.duration + '</dt><dd>' + C.durationText + '</dd>' +
        '<dt>' + C.labels.points + '</dt><dd>' + C.pointsText + '</dd>' +
      '</dl>';
    var cstart = document.createElement('button');
    cstart.className = 'btn btn--primary';
    cstart.type = 'button';
    cstart.textContent = C.hint;
    cstart.addEventListener('click', function () {
      card.classList.add('is-leaving');
      setTimeout(function () { card.style.display = 'none'; self._runStep(); }, 420);
    });
    cbox.appendChild(cstart);
    card.appendChild(cbox);
    stage.appendChild(card);
    this.cardEl = card;

    // ⑦ 结束面板（先隐藏）
    var end = document.createElement('div');
    end.className = 'vl-end';
    end.style.display = 'none';
    var box = document.createElement('div');
    box.className = 'vl-end__box';
    box.innerHTML =
      '<div class="vl-end__title">' + L.end.title + '</div>' +
      '<div class="vl-end__text">' + L.end.text + '</div>';
    var back = document.createElement('button');
    back.className = 'btn btn--primary';
    back.type = 'button';
    back.textContent = L.end.btnBack;
    back.addEventListener('click', function () { self.quit(); });
    box.appendChild(back);
    end.appendChild(box);
    stage.appendChild(end);
    this.endEl = end;

    root.appendChild(stage);
    this.uiLayer.appendChild(root);
    this.el = root;
    this.el.style.display = 'none';

    /* ---------- 事件 ---------- */
    this.player.on('ended', function () { self._onSegmentEnd(); });
    this.player.on('frame', function (t) { self._onFrame(t); });
  };

  /* ============================================================
   * 进入 / 退出
   * ============================================================ */
  VideoLevelScene.prototype.enter = function (params) {
    Scene.prototype.enter.call(this);
    this._build();
    this.el.style.display = '';
    this.params = params || {};

    this.stepIndex = 0;
    this._skipUsed = {};
    this._loadCount = {};        // 每段视频的加载次数（用于排查"重复播放"）
    this._clearAlarm();          // ★ 闹铃状态复位
    this._bindAlarmWatch();      // ★ 每次进关卡都重新绑定（绑 #app，可安全重复）
    if (this.gaze) { this.gaze.stop(); this.gaze = null; }
    this._quizBRemoved = false;
    this._replaying = false;
    this.seat = this._genSeat();
    this.endEl.style.display = 'none';
    this.setBackground(null);

    // 信息卡：点击「开始」后才跑时间轴
    this.cardEl.style.display = '';
    this.cardEl.classList.remove('is-leaving');
    this._showLoading(false);

    // 声音开关联动视频音量
    this._bindAudioWatch();
    this._syncVolume();
  };

  VideoLevelScene.prototype.exit = function () {
    Scene.prototype.exit.call(this);
    if (this.player) this.player.pause();
    if (this.interact) this.interact.clear();
    if (this.gaze) { this.gaze.stop(); this.gaze = null; }   // ★ 退出必须清掉覆盖层
    this._unbindAlarmWatch();
    this._clearAlarm();
    if (this.el) this.el.style.display = 'none';
    this._removeRotateWatch();
  };

  VideoLevelScene.prototype.quit = function () {
    if (this.player) this.player.pause();
    if (this.gaze) { this.gaze.stop(); this.gaze = null; }
    this.game.scenes.go('select', {}, false);
  };

  VideoLevelScene.prototype._syncVolume = function () {
    if (!this.player) return;
    this.player.setMuted(!!this.game.audio.muted);
    this.player.setVolume(this.game.audio.muted ? 0 : 1);
  };

  /** 右上角声音开关 → 视频音量同步（关掉就全静音） */
  VideoLevelScene.prototype._bindAudioWatch = function () {
    if (this._audioWatching) return;
    this._audioWatching = true;
    var self = this;
    bus.on('audio:mute', function () { self._syncVolume(); });
  };

  /* ============================================================
   * 竖屏检测
   * ============================================================ */
  VideoLevelScene.prototype._watchRotate = function () {
    if (this._rotateWatching) return;
    this._rotateWatching = true;
    var self = this;
    this._rotateHandler = function () { self._checkOrientation(); };
    global.addEventListener('resize', this._rotateHandler);
    global.addEventListener('orientationchange', this._rotateHandler);
    this._checkOrientation();
  };
  VideoLevelScene.prototype._removeRotateWatch = function () {
    if (!this._rotateWatching) return;
    global.removeEventListener('resize', this._rotateHandler);
    global.removeEventListener('orientationchange', this._rotateHandler);
    this._rotateWatching = false;
  };
  VideoLevelScene.prototype._checkOrientation = function () {
    if (!this.active) return;
    var portrait = global.innerHeight > global.innerWidth;
    var isPhone = Math.min(global.innerWidth, global.innerHeight) < 820;
    var need = portrait && isPhone;
    if (need) {
      this.rotateEl.classList.add('is-show');
      if (this.player && !this.videoEl.paused) {
        this.player.pause();
        this._pausedByRotate = true;
      }
    } else {
      this.rotateEl.classList.remove('is-show');
      if (this._pausedByRotate && this._canResume()) {
        this._pausedByRotate = false;
        this.player.play();
      }
    }
  };
  VideoLevelScene.prototype._canResume = function () {
    // 交互进行中（视频本就暂停等用户操作）不要自动恢复播放
    return !(this.interact && this.interact.active);
  };

  /* ============================================================
   * 时间轴推进
   * ============================================================ */
  VideoLevelScene.prototype._runStep = function () {
    var L = this.L;
    var step = L.timeline[this.stepIndex];
    if (!step) { this._finish(); return; }

    this._watchRotate();
    this._curStep = step;

    var self = this;
    var seg = step.seg;

    /* ★ reuse：接在上一段播完的末帧，不再重新加载/播放。
       没有这段就会把同一个视频再放一遍 —— 表现为"播完直接重播，第二次才弹选择"。 */
    if (step.reuse) {
      this._showLoading(false);
      this._doInteract(step, function () {});
      return;
    }

    this._showLoading(true);
    var src = this._src(seg);
    this._loadCount[seg] = (this._loadCount[seg] || 0) + 1;

    this.player.load(src, { muted: !!this.game.audio.muted })
      .then(function () {
        self._showLoading(false);
        self._syncVolume();

        if (step.pauseAt === 'start') {
          // 停在首帧，做交互
          self.player.seek(0);
          self._doInteract(step, function () {
            self.player.play();
          });
        } else {
          self.player.play();
          // 座位算式：视频播放时前 4 秒悬浮
          if (step.overlay === 'seatMath') self._showSeatMath();
          // ★ 闹铃段：一开始就要显示"关掉闹铃"
          if (step.loop) { self._alarmOff = false; self._refreshAlarmHint(0); }
        }
      })
      .catch(function (e) {
        self._showLoading(false);
        console.error('[VideoLevel] ' + e.message);
        self._onLoadError();
      });
  };

  /* ---------- 每帧：座位算式到点消失 ---------- */
  VideoLevelScene.prototype._onFrame = function (t) {
    var step = this._curStep;
    if (!step || step.overlay !== 'seatMath') return;
    if (t >= this.L.seatMath.showUntilSec) {
      if (this.interact) this.interact.clearOverlay();
    }
  };

  /* ---------- 一段播完 ---------- */
  VideoLevelScene.prototype._onSegmentEnd = function () {
    var step = this._curStep;
    if (!step) return;

    /* ★ 闹铃段：播完若用户还没点 → 重播本段。
       重播用 seek(0) + play()，★ 不重新 load ——
       每次都 load 会重新走网络，手机上每次重播都黑屏一下。 */
    if (step.loop && !this._alarmOff) {
      var cfgA = this.L.alarm || {};
      this._alarmLoops = (this._alarmLoops || 0) + 1;
      /* ★ maxLoops <= 0 表示无限重播，直到用户点击（默认行为）。
         只有显式设为正整数才启用"重播 N 次后自动放行"的兜底。 */
      var maxL = cfgA.maxLoops === undefined ? 0 : cfgA.maxLoops;
      if (maxL > 0 && this._alarmLoops >= maxL) {
        this._next();
        return;
      }
      this._refreshAlarmHint(this._alarmLoops);
      var self2 = this;
      this.player.seek(0);
      this.player.play();
      void self2;
      return;
    }

    if (step.pauseAt === 'end') {
      // 停在最后一帧做交互
      this._doInteract(step, function () {});
      return;
    }
    this._next();
  };

  VideoLevelScene.prototype._next = function () {
    this.stepIndex++;
    if (this.interact) this.interact.clear();
    this._runStep();
  };

  /* ============================================================
   * 交互⓪：关掉闹铃（444 新增的第一段）
   *   播完未点击 → 重播；点击 → 立即进入第二段
   * ============================================================ */
  VideoLevelScene.prototype._alarmOffNow = function () {
    if (this._alarmOff) return;
    this._alarmOff = true;
    this._hideAlarmHint();
    this._next();                       // 立即切到第二段
  };

  /** 显示/刷新闹铃提示：第 n 次重播用第 n 档强度 */
  VideoLevelScene.prototype._refreshAlarmHint = function (loops) {
    var cfgA = this.L.alarm || {};
    var steps = cfgA.steps || [{ scale: 1, blink: 2.6 }];
    var st = steps[Math.min(loops, steps.length - 1)];
    var el = this._alarmEl || (this._alarmEl = this._makeAlarmEl());
    el.querySelector('.vl-alarm__text').textContent = cfgA.text || '关掉闹铃';
    var sub = el.querySelector('.vl-alarm__sub');
    if (sub) sub.textContent = cfgA.hintExtra || '';
    el.style.setProperty('--alarm-scale', st.scale);
    el.style.setProperty('--alarm-blink', st.blink + 's');
    el.classList.add('is-show');
    void el.offsetWidth;                // reflow，让动画可重复触发
  };

  VideoLevelScene.prototype._makeAlarmEl = function () {
    var el = document.createElement('div');
    el.className = 'vl-alarm';
    el.innerHTML =
      '<div class="vl-alarm__inner">' +
        '<div class="vl-alarm__text">关掉闹铃</div>' +
        '<div class="vl-alarm__sub"></div>' +
      '</div>';
    this.hudEl.appendChild(el);
    return el;
  };

  VideoLevelScene.prototype._hideAlarmHint = function () {
    if (this._alarmEl) this._alarmEl.classList.remove('is-show');
  };

  /**
   * ★ 绑定"关闹铃"点击监听
   *
   * 必须绑在 **#app**（稳定根节点）上：
   *   _build() 每次进入关卡都会重建 this.el，绑在它上面的监听会随旧 DOM 一起失效。
   *   也不能放在 _bindAudioWatch() 里 —— 那个方法有 `_audioWatching` 单次保护，
   *   第二次进关卡就不绑了。
   *
   * 用捕获阶段：优先拿到事件，不受子元素 pointer-events 影响。
   * 同一 handler 引用重复 addEventListener 会被浏览器自动去重，可安全重复调用。
   */
  VideoLevelScene.prototype._bindAlarmWatch = function () {
    var self = this;
    if (!this._alarmHandler) {
      this._alarmHandler = function (e) {
        // 只在本场景激活时响应，避免退到菜单后误触发
        if (!self.game || self.game.scenes.current !== self) return;
        if (!self._curStep || !self._curStep.loop || self._alarmOff) return;
        var t = e.target;
        // 忽略右上角工具按钮（跳过 / 退出），别把点按钮当成关闹铃
        if (t && t.closest && t.closest('.vl-tools, .btn, button')) return;
        self._alarmOffNow();
      };
    }
    var app = document.getElementById('app');
    if (app) app.addEventListener('pointerdown', this._alarmHandler, true);
  };

  VideoLevelScene.prototype._unbindAlarmWatch = function () {
    if (!this._alarmHandler) return;
    var app = document.getElementById('app');
    if (app) app.removeEventListener('pointerdown', this._alarmHandler, true);
  };

  VideoLevelScene.prototype._clearAlarm = function () {
    this._alarmOff = false;
    this._alarmLoops = 0;
    this._hideAlarmHint();
  };

  /* ---------- 交互分发 ---------- */
  VideoLevelScene.prototype._doInteract = function (step, onDone) {
    var L = this.L, self = this;
    var kind = step.interact;

    /* ★ 选择题永远要弹，不能用"重播中"跳过它 ——
       重播的是视频，选择是视频播完之后必须给用户的。 */
    if (kind === 'quizStay') { this._quizStay(onDone); return; }
    if (kind === 'quizSeat') { this._quizSeat(onDone); return; }
    if (kind === 'boardGaze') { this._boardGaze(onDone); return; }
    if (kind === 'board') { this._boardInteract(onDone); return; }

    var cfg = L.interacts[kind];
    if (!cfg) { onDone(); return; }
    // 本次是否已经跳过这个交互（重播视频3 时不再点门把手）
    if (this._skipUsed[kind]) { onDone(); return; }

    this.interact.showTap(cfg, function () {
      self._toast(cfg.afterText);
      onDone();
    });
  };

  /* ---------- 选择①：回座位 / 去外面站着 ---------- */
  VideoLevelScene.prototype._quizStay = function (onDone) {
    var self = this, L = this.L;
    var cfg = L.quizStay;
    var opts = cfg.options.slice();
    if (this._quizBRemoved) {
      // B 已选过一次 → 移除，只剩「回座位」
      opts = opts.filter(function (o) { return o.correct; });
    }
    this.interact.showChoice(
      { question: cfg.question, options: opts },
      function (o) {                       // 选对：推进
        self._toast(o.text);
        onDone();
        self._next();
      },
      {
        wrongText: cfg.wrongText,
        removeAfterWrong: false,           // 由 _replayStay 负责移除
        onWrong: function () { self._replayStay(); }   // 选 B：重播视频3
      }
    );
  };

  /** 选了 B：移除 B，重播视频3（跳过交互②） */
  VideoLevelScene.prototype._replayStay = function () {
    var self = this;
    this._quizBRemoved = true;
    this._replaying = true;
    this._skipUsed.handle = true;      // 重播时不再点门把手
    this._toast(this.L.quizStay.replayText, 2.2);
    setTimeout(function () {
      self._runStepIndex(2);           // 回到 timeline[2] = 视频3
    }, 1400);
  };

  /* ---------- 选择②：座位是第几排第几列 ---------- */
  VideoLevelScene.prototype._quizSeat = function (onDone) {
    var self = this, L = this.L;
    var opts = this._buildSeatOptions();
    this.interact.showChoice(
      { question: L.quizSeat.question, options: opts },
      function () {
        onDone();
        self._next();
      },
      { wrongText: L.quizSeat.wrongText, removeAfterWrong: true }
    );
  };

  /* ---------- 看黑板：观察 → 选公式 → 选错再给 10 秒 ---------- */
  /**
   * ★ 调试 / 校准：数字键 9
   * 切换"校准模式"——画出判定区黄框 + 视野中心坐标，用于手动调
   * js/data/level1.js 里 boardGaze.target 的 x / y / w / h。
   * 若当前已在看黑板交互中则立即生效，否则直接进入该步以便查看。
   */
  VideoLevelScene.prototype._toggleCalib = function () {
    this._calib = !this._calib;
    if (!this.gaze) {
      this.stepIndex = 8;
      this._curStep = this.L.timeline[8];
      this._doInteract(this._curStep, function () {});
    }
    if (this.gaze) this.gaze.calib = this._calib;
    this._toast(this._calib ? '校准模式：开（照黄框调 target）' : '校准模式：关', 2.2);
  };

  VideoLevelScene.prototype._boardGaze = function (onDone) {
    var self = this, L = this.L, cfg = L.boardGaze;

    var gaze = new BoardGaze({
      img: this.game.assets.get('scenes.boardClassroom'),
      cfg: cfg,
      container: this.hudEl,
      calib: !!this._calib,          // ★ 按数字键 9 切换校准模式
      onObserveEnd: function () { ask(); }
    });
    this.gaze = gaze;

    /**
     * 弹公式选择
     *   选对 → 结束观察 → 推进到下一时间轴步骤（视频6）
     *   选错 → ★ 题目先消失，回去再看 retrySec 秒，时间到了再重新问
     */
    function ask() {
      gaze.pause();
      var opts = shuffle(cfg.options.slice()).map(function (txt, i) {
        return { id: 'f' + i, text: txt, correct: txt === cfg.answer };
      });
      self.interact.showChoice(
        { question: cfg.question, options: opts },
        function () {                        // 选对
          self._toast('答对了', 1.2);
          if (self.gaze) { self.gaze.stop(); self.gaze = null; }
          self.interact.clear();
          onDone();
          /* ★ 关键：这一步原来是缺失的 —— 只调 onDone()（它对 pauseAt:'end'
             来说是个空函数），所以选对了也永远停在视频5，不会播视频6。 */
          self._next();
        },
        {
          wrongText: cfg.wrongText,
          removeAfterWrong: false,           // 保留 4 项，每轮洗牌
          onWrong: function () {
            // 先让"选错"的反馈显示一下，然后题目消失，回到观察
            setTimeout(function () {
              self.interact.clear();         // ★ 题目消失
              if (self.gaze) self.gaze.resume(cfg.retrySec);
            }, 900);
          }
        }
      );
    }

    gaze.begin();
  };

  /* ---------- 座位算式 ---------- */
  VideoLevelScene.prototype._genSeat = function () {
    var m = this.L.seatMath;
    return {
      row: randIn(m.rowRange[0], m.rowRange[1]),
      col: randIn(m.colRange[0], m.colRange[1])
    };
  };

  /** 把数字变成"一位数加减"算式，如 5 → (2+3)、6 → (8-2) */
  function exprFor(n) {
    var a = 1 + Math.floor(Math.random() * Math.max(1, n - 1));   // 1 ~ n-1
    var b = n - a;
    if (b <= 0) { a = n + 1 + Math.floor(Math.random() * 3); b = a - n; return '(' + a + '-' + b + ')'; }
    return Math.random() < 0.5 ? ('(' + a + '+' + b + ')') : ('(' + (n + b) + '-' + b + ')');
  }

  VideoLevelScene.prototype._showSeatMath = function () {
    var m = this.L.seatMath;
    var text = m.text
      .replace('{row}', exprFor(this.seat.row))
      .replace('{col}', exprFor(this.seat.col));
    this.interact.showOverlay(text);
  };

  /**
   * 4 个座位选项：1 正确 + 3 干扰，全部落在 4~6 区间
   * （必须真算对才能选，靠排除法蒙不对）
   */
  VideoLevelScene.prototype._buildSeatOptions = function () {
    var m = this.L.seatMath;
    var right = { row: this.seat.row, col: this.seat.col };
    var list = [right];
    var seen = right.row + '_' + right.col;
    var guard = 0;
    while (list.length < 4 && guard++ < 200) {
      var r = randIn(m.rowRange[0], m.rowRange[1]);
      var c = randIn(m.colRange[0], m.colRange[1]);
      var k = r + '_' + c;
      if (k === seen) continue;
      // 干扰项不能与正确答案"排或列完全相同"太容易排除，
      // 但也不能和已选项重复 —— 这里允许部分重合，逼玩家真算
      if (list.some(function (x) { return x.row === r && x.col === c; })) continue;
      seen += '|' + k;
      list.push({ row: r, col: c });
    }
    var tpl = this.L.quizSeat.optionTemplate;
    return shuffle(list).map(function (x, i) {
      return {
        id: 'o' + i,
        row: x.row, col: x.col,
        correct: x.row === right.row && x.col === right.col,
        text: tpl.replace('{row}', x.row).replace('{col}', x.col)
      };
    });
  };

  /* ---------- 跳过 ---------- */
  VideoLevelScene.prototype._skip = function () {
    var step = this._curStep;
    if (!step) return;
    // 交互进行中不跳过（那是必须做的选择）
    if (this.interact && this.interact.active) return;
    if (step.interact) this._skipUsed[step.interact] = true;
    this._replaying = false;
    this.player.pause();
    this._toast(this.L.ui.skipHint);
    var self = this;
    setTimeout(function () { self._next(); }, 200);
  };

  /* ---------- 结束 ---------- */
  VideoLevelScene.prototype._finish = function () {
    if (this.player) this.player.pause();
    if (this.interact) this.interact.clear();
    this.endEl.style.display = '';
    bus.emit('level1:finish', { level: 1 });
  };

  /* ---------- 跳到指定 step ---------- */
  VideoLevelScene.prototype._runStepIndex = function (i) {
    this.stepIndex = i;
    if (this.interact) this.interact.clear();
    this._runStep();
  };

  /* ---------- 小工具 ---------- */
  VideoLevelScene.prototype._showLoading = function (v) {
    if (!this.loadingEl) return;
    this.loadingEl.classList.toggle('is-hidden', !v);
  };

  VideoLevelScene.prototype._toast = function (text, sec) {
    if (!text) return;
    var self = this;
    var el = document.createElement('div');
    el.className = 'it-overlay';
    el.style.top = '18%';
    el.textContent = text;
    this.hudEl.appendChild(el);
    setTimeout(function () { el.classList.add('is-show'); }, 20);
    setTimeout(function () {
      el.classList.remove('is-show');
      setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 320);
    }, (sec || 1.4) * 1000);
    void self;
  };

  /** 视频加载失败：不卡死，直接推进（方便你排查路径/编码问题） */
  VideoLevelScene.prototype._onLoadError = function () {
    if (this.game.cfg.debug) {
      console.warn('[VideoLevel] 无法播放，检查：① 路径 ② 编码需为 H.264 ③ 本地服务器打开');
    }
    this._next();
  };

  VideoLevelScene.prototype.resize = function () {
    this._checkOrientation();
    if (this.gaze && this.gaze.active) this.gaze._resize();
  };

  /**
   * 主循环 render：看黑板是 canvas 交互，需要每帧驱动
   * （VideoPlayer 自己有 RAF，这里只负责 BoardGaze）
   */
  VideoLevelScene.prototype.render = function () {
    if (this.gaze && this.gaze.active) {
      this.gaze.update(global.performance && performance.now ? performance.now() : Date.now());
    }
  };

  /* ---------- 工具函数 ---------- */
  function randIn(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* 内联图标（避免额外请求） */
  var ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
           'stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  global.VideoLevelScene = VideoLevelScene;

})(window);
