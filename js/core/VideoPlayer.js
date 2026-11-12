/* ============================================================
 * VideoPlayer.js —— 视频播放与暂停控制（交互电影的底层）
 *
 * 为什么不用 timeupdate 监听：
 *   timeupdate 只有约 4Hz，误差可达 250ms，精确暂停点会被错过。
 *   这里用 requestAnimationFrame 巡检（60Hz，误差 < 17ms），
 *   到达目标时间点立刻 pause()，保证"停在某一帧"。
 *
 * 关键能力：
 *   load(seg)              加载并预加载某段
 *   play() / pause()       播放 / 暂停
 *   seek(sec)              定位到某一秒（用于"停在首帧/末帧"）
 *   showFirstFrame()       显示首帧但不播放
 *   on('ended')            自然播完
 *   on('frame')            每帧回调（供倒计时等用）
 *
 * ★ 移动端限制：iOS/安卓 都要求用户手势后才能有声播放。
 *   本项目流程是"点击开始 → 播放"，天然满足；静音播放则无此限制。
 * ============================================================ */

(function (global) {
  'use strict';

  function VideoPlayer(el) {
    this.video = el;
    this.raf = null;
    this._pausedByCode = false;
    this._stopAt = null;         // 到达该秒数自动暂停
    this._listeners = {};
    this._lastTime = 0;
  }

  /* ---------- 事件 ---------- */
  VideoPlayer.prototype.on = function (name, fn) {
    (this._listeners[name] || (this._listeners[name] = [])).push(fn);
    return this;
  };
  VideoPlayer.prototype._emit = function (name, arg) {
    (this._listeners[name] || []).forEach(function (f) { f(arg); });
  };

  /* ---------- 加载 ---------- */
  /**
   * @param {string} src
   * @param {object} opt { autoplay, muted, stopAt }
   */
  VideoPlayer.prototype.load = function (src, opt) {
    opt = opt || {};
    var v = this.video;
    this._stopAt = opt.stopAt === undefined ? null : opt.stopAt;
    this._stopAtFired = false;
    v.src = src;
    v.muted = !!opt.muted;
    v.loop = false;
    v.playsInline = true;          // iOS 关键：不设会强制全屏
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('x5-playsinline', '');   // 安卓微信/QQ 浏览器
    v.load();
    v.currentTime = 0;
    this._bindOnce();
    var self = this;
    return new Promise(function (resolve, reject) {
      function ok() {
        cleanup(); resolve(self);
      }
      function bad() {
        cleanup(); reject(new Error('视频加载失败: ' + src));
      }
      function cleanup() {
        v.removeEventListener('loadedmetadata', ok);
        v.removeEventListener('error', bad);
      }
      v.addEventListener('loadedmetadata', ok);
      v.addEventListener('error', bad);
    });
  };

  VideoPlayer.prototype._bindOnce = function () {
    if (this._bound) return;
    this._bound = true;
    var self = this, v = this.video;
    v.addEventListener('ended', function () { self._stop(); self._emit('ended'); });
    v.addEventListener('pause', function () { self._stop(); });
  };

  /* ---------- 播放控制 ---------- */
  VideoPlayer.prototype.play = function () {
    var self = this, v = this.video;
    var p = v.play();
    if (p && p.catch) {
      p.catch(function (e) {
        // 最常见：未经用户手势。降级为静音播放再试一次。
        if (!v.muted) {
          v.muted = true;
          v.play().catch(function () {});
        }
        self._emit('playerror', e);
      });
    }
    this._start();
    return p;
  };

  VideoPlayer.prototype.pause = function () {
    this.video.pause();
    this._stop();
  };

  /** 每帧巡检：精确暂停 + 对外回调 */
  VideoPlayer.prototype._start = function () {
    if (this.raf) return;
    var self = this;
    var grace = 0;
    var tick = function () {
      /* ★ 刚调用 play() 时 v.paused 可能还没变 false（play 是异步的），
         这里直接 return 会让 RAF 永久停摆（frame 事件再也不触发）。
         给 10 帧宽限：期间继续排队，超时才真正停。 */
      if (self.video.paused || self.video.ended) {
        if (++grace > 10) { self.raf = null; return; }
        self.raf = requestAnimationFrame(tick);
        return;
      }
      grace = 0;
      var t = self.video.currentTime;

      // 到达指定秒数 → 精确暂停
      if (self._stopAt !== null && !self._stopAtFired && t >= self._stopAt) {
        self._stopAtFired = true;
        self.video.pause();
        self._stop();
        self._emit('stopAt', t);
        return;
      }
      self._lastTime = t;
      self._emit('frame', t);
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  VideoPlayer.prototype._stop = function () {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };

  /** 定位（用于"停在首帧"） */
  VideoPlayer.prototype.seek = function (sec) {
    try { this.video.currentTime = Math.max(0, sec); } catch (e) {}
  };

  VideoPlayer.prototype.duration = function () {
    return this.video.duration || 0;
  };
  VideoPlayer.prototype.currentTime = function () {
    return this.video.currentTime || 0;
  };

  /* ---------- 音量（受全局声音开关控制） ---------- */
  VideoPlayer.prototype.setMuted = function (m) { this.video.muted = !!m; };
  VideoPlayer.prototype.setVolume = function (v) {
    this.video.volume = Math.max(0, Math.min(1, v));
  };

  VideoPlayer.prototype.dispose = function () {
    this._stop();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  };

  global.VideoPlayer = VideoPlayer;

})(window);
