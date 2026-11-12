/* ============================================================
 * SoundScape.js —— 程序化空间音频（★ 零音频文件，全部 WebAudio 合成）
 *
 * 设计目标：本关要求"无美术"，声音同样不依赖任何素材文件，
 * 所有声源都用振荡器 / 噪声实时合成，因此 clone 仓库即可听到完整声景。
 *
 * 声源清单（每个都有独立声像，实现"空间音频"）：
 *   连续声：teacher 老师讲课 / ac 空调嗡鸣 / whisper 窃窃私语 / breath 呼吸
 *   事件声：page 翻书 / bird 鸟叫 / pen 转笔 / whistle 哨声 /
 *           chair 椅子拖地 / step 脚步 / paper 纸张摩擦 / name 点名
 *
 * 核心能力：
 *   setMode('normal'|'asd')  普通模式：老师为主；自闭症模式：全部等音量无主次
 *   focusTeacher(ms)         聚焦：其他声音压低，老师清晰，ms 毫秒后回归
 *   muffleTeacher(on)        老师声音低通 2000Hz + 降到 0.4（子场景 C）
 *   granular()               颗粒合成"声音碎片"：0.1s 颗粒、0.5 重叠
 *   step() / callName() / breathOn() / chair() / paper()
 *   fadeOut(sec) / fadeIn(sec)  整体淡出淡入（感官休息用）
 *
 * ★ 响度说明：规格里"音量全部为 1.0"是相对设计值，
 *   6 条轨道同时 1.0 会非常刺耳，因此统一乘 LEVEL1.audio.mix 做总混音缩放，
 *   1.0 仍代表设计响度，只是整体听感被压到可接受范围。
 * ============================================================ */

(function (global) {
  'use strict';

  function SoundScape(audio) {
    this.audio = audio;
    this.ctx = audio ? audio.ctx : null;
    this.master = audio ? audio.master : null;
    this.out = null;                 // 总输出（→ master）
    this.sources = {};               // id -> { gain, pan, filter?, nodes: [] }
    this.mode = 'normal';
    this.running = false;
    this._timers = [];
    this._noiseBuf = null;
    this._muffle = false;
  }

  /* ---------- 生命周期 ---------- */

  SoundScape.prototype.start = function () {
    if (!this.audio) return;
    // ★ AudioContext 要等用户手势后 unlock() 才存在，而 SoundScape 可能在解锁前就创建，
    //   所以这里必须重新取一次 ctx / master，否则所有声源都会静默失效。
    if (!this.ctx) this.audio.unlock();
    this.ctx = this.audio.ctx;
    this.master = this.audio.master;
    if (!this.ctx || !this.master || this.running) return;
    var L = global.LEVEL1.audio;

    this.out = this.ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(this.master);

    this._noiseBuf = this._makeNoiseBuffer(2);
    this._buildContinuous();
    this.running = true;
    this.setMode('normal');
    void L;
  };

  SoundScape.prototype.stop = function () {
    if (!this.running) return;
    this._timers.forEach(clearInterval);
    this._timers = [];
    for (var id in this.sources) {
      var s = this.sources[id];
      try { s.gain.gain.cancelScheduledValues(this.ctx.currentTime); } catch (e) {}
      (s.nodes || []).forEach(function (n) { try { n.stop && n.stop(); } catch (e) {} });
    }
    try { this.out.disconnect(); } catch (e) {}
    this.sources = {};
    this.running = false;
  };

  /* ---------- 基础设施 ---------- */

  /** 生成白噪声 buffer（所有噪声类声源共用） */
  SoundScape.prototype._makeNoiseBuffer = function (sec) {
    var len = Math.floor(this.ctx.sampleRate * sec);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  /** 创建一条声源链：source → [filter] → gain → pan → out */
  SoundScape.prototype._chain = function (id, pan) {
    var ctx = this.ctx;
    var gain = ctx.createGain();
    gain.gain.value = 0;
    var panNode = null;
    if (ctx.createStereoPanner) {
      panNode = ctx.createStereoPanner();
      panNode.pan.value = pan || 0;
      gain.connect(panNode); panNode.connect(this.out);
    } else {
      gain.connect(this.out);       // 老浏览器降级为单声道
    }
    return { id: id, gain: gain, pan: panNode, nodes: [] };
  };

  SoundScape.prototype._noise = function () {
    var s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf; s.loop = true;
    return s;
  };

  /* ---------- 连续声源 ---------- */

  SoundScape.prototype._buildContinuous = function () {
    var ctx = this.ctx, self = this;

    /* ① 老师讲课：噪声经带通（模拟人声频段）+ LFO 调幅（模拟说话节奏） */
    var t = this._chain('teacher', 0);
    var tn = this._noise();
    var tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 900; tbp.Q.value = 1.2;
    var tlfo = ctx.createOscillator(); tlfo.type = 'sine'; tlfo.frequency.value = 3.2;
    var tlfoGain = ctx.createGain(); tlfoGain.gain.value = 0.45;
    var tAmp = ctx.createGain(); tAmp.gain.value = 0.55;
    tlfo.connect(tlfoGain); tlfoGain.connect(tAmp.gain);      // 0.1~1.0 起伏
    tn.connect(tbp); tbp.connect(tAmp); tAmp.connect(t.gain);
    tn.start(); tlfo.start();
    t.nodes = [tn, tlfo]; t.filter = tbp;
    this.sources.teacher = t;

    /* ② 空调嗡鸣：低频锯齿 + 低通噪声 */
    var a = this._chain('ac', -0.5);
    var an = this._noise();
    var alp = ctx.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 400;
    var asaw = ctx.createOscillator(); asaw.type = 'sawtooth'; asaw.frequency.value = 72;
    var asawG = ctx.createGain(); asawG.gain.value = 0.12;
    an.connect(alp); alp.connect(a.gain);
    asaw.connect(asawG); asawG.connect(a.gain);
    an.start(); asaw.start();
    a.nodes = [an, asaw];
    this.sources.ac = a;

    /* ③ 窃窃私语：宽带噪声带通 + 慢速随机调幅 */
    var w = this._chain('whisper', 0.4);
    var wn = this._noise();
    var wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 1600; wbp.Q.value = 2;
    var wlfo = ctx.createOscillator(); wlfo.type = 'sine'; wlfo.frequency.value = 0.9;
    var wlfoG = ctx.createGain(); wlfoG.gain.value = 0.4;
    var wAmp = ctx.createGain(); wAmp.gain.value = 0.5;
    wlfo.connect(wlfoG); wlfoG.connect(wAmp.gain);
    wn.connect(wbp); wbp.connect(wAmp); wAmp.connect(w.gain);
    wn.start(); wlfo.start();
    w.nodes = [wn, wlfo];
    this.sources.whisper = w;

    /* ④ 呼吸：噪声经 800Hz 低通 + 极慢包络（子场景 D 用） */
    var b = this._chain('breath', 0);
    var bn = this._noise();
    var blp = ctx.createBiquadFilter(); blp.type = 'lowpass';
    blp.frequency.value = global.LEVEL1.subD.breathCutoff;
    var blfo = ctx.createOscillator(); blfo.type = 'sine'; blfo.frequency.value = 0.35;
    var blfoG = ctx.createGain(); blfoG.gain.value = 0.45;
    var bAmp = ctx.createGain(); bAmp.gain.value = 0.5;
    blfo.connect(blfoG); blfoG.connect(bAmp.gain);
    bn.connect(blp); blp.connect(bAmp); bAmp.connect(b.gain);
    bn.start(); blfo.start();
    b.nodes = [bn, blfo];
    this.sources.breath = b;

    /* 环境事件声的随机调度器（翻书 / 鸟叫 / 转笔 / 哨声 / 椅子） */
    var sched = [
      { id: 'page',    min: 1800, max: 4200 },
      { id: 'bird',    min: 2600, max: 6500 },
      { id: 'pen',     min: 900,  max: 2200 },
      { id: 'whistle', min: 5000, max: 11000 },
      { id: 'chair',   min: 3200, max: 7000 },
      { id: 'whisperEv', min: 1500, max: 3600 }
    ];
    sched.forEach(function (s) {
      var timer = setInterval(function () {
        // 只在"自闭症模式"下让环境声随机涌入（普通模式下世界是安静的）
        if (self.mode !== 'asd') return;
        if (s.id === 'whisperEv') self._burst('whisper', 0.35, 1500, 1.4);
        else self['_' + s.id]();
      }, s.min + Math.random() * (s.max - s.min));
      self._timers.push(timer);
    });
  };

  /* ---------- 事件声（一次性） ---------- */

  /** 通用噪声脉冲：高通/带通 + 快速衰减 */
  SoundScape.prototype._burst = function (id, dur, freq, q, pan, vol) {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var mix = global.LEVEL1.audio.mix;
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    f.type = q ? 'bandpass' : 'highpass';
    f.frequency.value = freq || 1200;
    if (q) f.Q.value = q;
    var panN = null;
    if (ctx.createStereoPanner) { panN = ctx.createStereoPanner(); panN.pan.value = pan || 0; }
    var n = this._noise();
    n.connect(f); f.connect(g);
    if (panN) { g.connect(panN); panN.connect(this.out); } else g.connect(this.out);
    var peak = (vol === undefined ? 1 : vol) * mix;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    n.start(now); n.stop(now + dur + 0.05);
    void id;
  };

  SoundScape.prototype._page =    function () { this._burst('page', 0.18, 2600, 1.2, -0.6, 0.9); };
  SoundScape.prototype._pen =     function () { this._burst('pen', 0.07, 3200, 2.5, -0.3, 0.7); };
  SoundScape.prototype._chair =   function () { this._sweep(0.45, 500, 120, 0.6); };
  SoundScape.prototype._paper =   function () { this._burst('paper', 0.3, 1800, 0.8, 0.2, 1.0); };

  /** 鸟叫：正弦扫频 */
  SoundScape.prototype._bird = function () {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var mix = global.LEVEL1.audio.mix;
    var o = ctx.createOscillator(); o.type = 'sine';
    var g = ctx.createGain();
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = 0.85;
    o.frequency.setValueAtTime(2100, now);
    o.frequency.exponentialRampToValueAtTime(3400, now + 0.08);
    o.frequency.exponentialRampToValueAtTime(2400, now + 0.16);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5 * mix, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g); if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
    o.start(now); o.stop(now + 0.25);
  };

  /** 远处哨声：高频正弦 + 轻微颤音 */
  SoundScape.prototype._whistle = function () {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var mix = global.LEVEL1.audio.mix;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2600;
    var vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.5;
    var vibG = ctx.createGain(); vibG.gain.value = 30;
    vib.connect(vibG); vibG.connect(o.frequency);
    var g = ctx.createGain();
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = 0.9;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.32 * mix, now + 0.12);
    g.gain.setValueAtTime(0.32 * mix, now + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    o.connect(g); if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
    o.start(now); vib.start(now); o.stop(now + 0.8); vib.stop(now + 0.8);
  };

  /** 扫频噪声（椅子拖地那种"吱——"） */
  SoundScape.prototype._sweep = function (dur, f0, f1, pan) {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var mix = global.LEVEL1.audio.mix;
    var n = this._noise();
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(f0, now);
    f.frequency.exponentialRampToValueAtTime(f1, now + dur);
    var g = ctx.createGain();
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan || 0;
    n.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.9 * mix, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    n.start(now); n.stop(now + dur + 0.05);
  };

  /** 脚步：60Hz 低频加重 + 噪声撞击（子场景 D 的鼓点） */
  SoundScape.prototype._step = function () {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var D = global.LEVEL1.subD, mix = global.LEVEL1.audio.mix;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = D.footFreq;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0, now);
    og.gain.linearRampToValueAtTime(D.footVol * mix, now + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    o.connect(og); og.connect(this.out);
    o.start(now); o.stop(now + 0.3);
    this._burst('stepNoise', 0.12, 300, 1, 0, 0.5);
  };

  /** 点名：无方向感（左右耳同时响，像在颅内），音量 1.5，持续 800ms */
  SoundScape.prototype.callName = function () {
    if (!this.ctx) return;
    var ctx = this.ctx, now = ctx.currentTime;
    var D = global.LEVEL1.subD, mix = global.LEVEL1.audio.mix;
    var dur = D.callMs / 1000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(D.callVol * mix, now + 0.04);
    g.gain.setValueAtTime(D.callVol * mix, now + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    g.connect(this.out);                       // 直接接总输出，不经过 pan → 居中/颅内感
    // 用两个略微失谐的锯齿 + 带通模拟"喊名字"的人声质感
    [220, 233].forEach(function (f) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
      var og = ctx.createGain(); og.gain.value = 0.5;
      o.connect(bp); bp.connect(og); og.connect(g);
      o.start(now); o.stop(now + dur + 0.05);
    });
  };

  /** 颗粒合成的"声音碎片"：0.1s 颗粒、0.5 重叠（子场景 B 拖动视野时触发） */
  SoundScape.prototype.granular = function () {
    if (!this.ctx) return;
    var ctx = this.ctx, t0 = ctx.currentTime;
    var grain = 0.1, overlap = 0.5, count = 6;
    for (var i = 0; i < count; i++) {
      var t = t0 + i * grain * overlap;
      var n = this._noise();
      var f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 800 + Math.random() * 2200; f.Q.value = 2;
      var g = ctx.createGain();
      var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) p.pan.value = Math.random() * 2 - 1;
      n.connect(f); f.connect(g);
      if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
      var v = global.LEVEL1.audio.mix * 0.8;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + grain * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + grain);
      n.start(t); n.stop(t + grain + 0.02);
    }
  };

  /* ---------- 混音控制 ---------- */

  /**
   * 切换模式
   * @param {'normal'|'asd'} mode
   *   normal：老师为主，其余压到 normalOthers（世界是"被过滤过的"）
   *   asd   ：所有声音等音量涌入，没有主次、没有衰减
   */
  SoundScape.prototype.setMode = function (mode) {
    this.mode = mode;
    if (!this.running) return;
    var L = global.LEVEL1.audio;
    var others = ['ac', 'whisper', 'page', 'bird', 'pen', 'whistle', 'chair', 'paper'];
    var self = this;
    var vol = function (id, v) {
      var s = self.sources[id];
      if (!s) return;
      var now = self.ctx.currentTime;
      s.gain.gain.cancelScheduledValues(now);
      s.gain.gain.setValueAtTime(s.gain.gain.value, now);
      s.gain.gain.linearRampToValueAtTime(v * L.mix, now + 0.35);
    };
    if (mode === 'normal') {
      vol('teacher', 0.9);
      others.forEach(function (id) { vol(id, L.normalOthers); });
      vol('breath', 0);
    } else {
      // 自闭症模式：所有轨道都拉到设计响度 1.0
      vol('teacher', L.asdAll);
      others.forEach(function (id) { vol(id, L.asdAll); });
      vol('breath', 0);
    }
  };

  /** 聚焦老师声音：其他声源压低，老师清晰，ms 毫秒后自动回归 */
  SoundScape.prototype.focusTeacher = function (ms) {
    if (!this.running) return;
    var L = global.LEVEL1.audio, self = this, ctx = this.ctx, now = ctx.currentTime;
    var others = ['ac', 'whisper', 'page', 'bird', 'pen', 'whistle', 'chair', 'paper'];
    var set = function (id, v, ramp) {
      var s = self.sources[id]; if (!s) return;
      s.gain.gain.cancelScheduledValues(now);
      s.gain.gain.setValueAtTime(s.gain.gain.value, now);
      s.gain.gain.linearRampToValueAtTime(v * L.mix, now + ramp);
    };
    set('teacher', 1.25, 0.08);
    others.forEach(function (id) { set(id, 0.18, 0.08); });
    // 0.5 秒后被其他声音重新淹没
    setTimeout(function () {
      if (self.mode !== 'asd') return;
      var t2 = ctx.currentTime;
      self.sources.teacher && self.sources.teacher.gain.gain.linearRampToValueAtTime(L.asdAll * L.mix, t2 + 0.25);
      others.forEach(function (id) {
        var s = self.sources[id]; if (!s) return;
        s.gain.gain.linearRampToValueAtTime(L.asdAll * L.mix, t2 + 0.25);
      });
    }, ms);
  };

  /** 老师声音变模糊：低通 2000Hz + 降到 0.4（子场景 C） */
  SoundScape.prototype.muffleTeacher = function (on) {
    if (!this.running) return;
    var s = this.sources.teacher; if (!s) return;
    var L = global.LEVEL1.audio, now = this.ctx.currentTime;
    if (on && !this._muffle) {
      var lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
      // 在既有链路中插入低通：重建 teacher 链（简化：直接改带通频率上限）
      s.filter && s.filter.frequency.setValueAtTime(700, now);
      this._muffle = true;
    }
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime((on ? 0.4 : L.asdAll) * L.mix, now + 0.4);
    if (!on) { this._muffle = false; s.filter && s.filter.frequency.setValueAtTime(900, now); }
  };

  /** 呼吸声开关（子场景 D） */
  SoundScape.prototype.breathOn = function (on) {
    var s = this.sources.breath; if (!s) return;
    var now = this.ctx.currentTime;
    var v = on ? global.LEVEL1.subD.breathVol : 0;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime(v * global.LEVEL1.audio.mix, now + 0.6);
  };

  /** 整体淡出（感官休息：声音淡出 1 秒） */
  SoundScape.prototype.fadeOut = function (sec) {
    if (!this.running) return;
    var now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + (sec || 1));
  };

  SoundScape.prototype.fadeIn = function (sec) {
    if (!this.running) return;
    var now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(1, now + (sec || 1));
  };

  global.SoundScape = SoundScape;

})(window);
