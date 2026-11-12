/* ============================================================
 * AudioManager.js —— 全局声音控制
 *
 * 右上角按钮控制的就是这里：一次开关，全局生效（BGM + 所有音效）
 * 实现要点：
 * 1. 用 WebAudio 的 masterGain 做总开关，切换时 0.15s 淡入淡出，避免"咔哒"爆音
 * 2. 音频文件缺失时，用 Oscillator 合成兜底音，开发期不依赖美术/音频资源
 * 3. 浏览器自动播放策略：首次必须在"用户手势"里调用 unlock()
 * ============================================================ */

(function (global) {
  'use strict';

  function AudioManager(config) {
    this.cfg = config.audio || {};
    this.ctx = null;            // AudioContext（延迟到用户手势后创建）
    this.master = null;         // 总音量 GainNode
    this.muted = !!this.cfg.startMuted;
    this._bgmSource = null;
    this._bgmBuffer = null;
    this._unlocked = false;
  }

  /** 在用户手势（点击/触摸）中调用：创建 AudioContext 并解锁播放 */
  AudioManager.prototype.unlock = function () {
    if (this._unlocked) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { console.warn('[Audio] 当前浏览器不支持 WebAudio'); return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : (this.cfg.masterVolume || 0.8);
    this.master.connect(this.ctx.destination);
    this._unlocked = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  /**
   * 切换静音（右上角按钮绑定此方法）
   * @returns {boolean} 切换后的 muted 状态（true = 已静音）
   */
  AudioManager.prototype.toggleMute = function () {
    this.muted = !this.muted;
    this._applyGain();
    bus.emit('audio:mute', this.muted);
    return this.muted;
  };

  AudioManager.prototype.setMuted = function (m) {
    this.muted = !!m;
    this._applyGain();
    bus.emit('audio:mute', this.muted);
  };

  AudioManager.prototype._applyGain = function () {
    if (!this.master) return;
    var now = this.ctx.currentTime;
    var target = this.muted ? 0 : (this.cfg.masterVolume || 0.8);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + 0.15);   // 淡入淡出
  };

  /**
   * 播放音效
   * @param {string} name  GAME_CONFIG.audio.sfx 中的键名，如 'click'
   */
  AudioManager.prototype.play = function (name) {
    if (!this._unlocked || this.muted) return;
    var sfx = (this.cfg.sfx || {})[name];
    if (!sfx) return;
    // 若配置了真实音频文件，后续可在此加载 buffer 播放；当前用合成音兜底
    this._tone(sfx.type || 'sine', sfx.freq || 660, sfx.dur || 0.1, 0.25);
  };

  /** 合成一个短音（占位音效） */
  AudioManager.prototype._tone = function (type, freq, dur, vol) {
    if (!this.ctx) return;
    var osc = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    var now = this.ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + dur + 0.02);
  };

  /**
   * 播放/停止背景音乐
   * 真实文件到位后自动使用；文件不存在时静默降级（不影响游戏）
   */
  AudioManager.prototype.playBGM = function () {
    if (!this._unlocked) return;
    var src = this.cfg.bgm && this.cfg.bgm.src;
    if (!src) return;
    var self = this;
    // TODO(后续开发)：接入真实 BGM 时用 fetch + decodeAudioData 循环播放，
    // 目前用 <audio> 元素更简单，且天然支持 loop / 流式加载
    if (!this._bgmEl) {
      var el = new Audio(src);
      el.loop = !!(this.cfg.bgm && this.cfg.bgm.loop);
      el.volume = (this.cfg.bgm && this.cfg.bgm.volume) || 0.35;
      // 不设置 crossOrigin：同样是为了避免 file:// 下加载失败（本项目不读取音频数据）
      this._bgmEl = el;
    }
    this._bgmEl.volume = this.muted ? 0 : ((this.cfg.bgm && this.cfg.bgm.volume) || 0.35);
    var p = this._bgmEl.play();
    if (p && p.catch) p.catch(function () { /* 文件缺失/被拦截时忽略 */ });
  };

  AudioManager.prototype.stopBGM = function () {
    if (this._bgmEl) { this._bgmEl.pause(); this._bgmEl.currentTime = 0; }
  };

  /** 静音状态变化时同步 BGM 音量 */
  AudioManager.prototype.syncBGM = function () {
    if (!this._bgmEl) return;
    this._bgmEl.volume = this.muted ? 0 : ((this.cfg.bgm && this.cfg.bgm.volume) || 0.35);
  };

  global.AudioManager = AudioManager;

})(window);
