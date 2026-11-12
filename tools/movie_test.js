/**
 * movie_test.js —— 第一关「交互电影」流程测试
 *
 * 覆盖：
 *   ① 时间轴：7 步定义正确、视频路径正确、转码后的 H.264 文件存在
 *   ② 转码校验：H.264 + 1920×1080 + 60fps + faststart（HEVC 在安卓会黑屏）
 *   ③ 交互①：视频2 首帧暂停 → 点右上命中 / 点其它象限闪错
 *   ④ 交互②：视频3 首帧暂停 → 点左下命中
 *   ⑤ 选择①：选 A 推进、选 B 重播视频3 且 B 被移除、重播时跳过交互②
 *   ⑥ 座位算式：随机落在 4~6、算式求值等于答案、4 秒后消失
 *   ⑦ 选择②：4 选项 1 正确、选错移除该选项、只剩正确项
 *   ⑧ 竖屏强制横屏、跳过按钮、声音开关联动视频音量
 *
 * 运行：node tools/movie_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cssCheck = require('./_csscheck');
const contrast = require('./_contrast');
const { createSandbox, ROOT } = require('./_harness');

const CSS_TEXT = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
/** 取某元素最终生效的属性值（模拟浏览器级联） */
function styleOf(classes, prop, ancestors, fallback) {
  return cssCheck.winningValue(CSS_TEXT, {
    classes: new Set(classes), id: '', tag: 'div',
    ancestors: ancestors || []
  }, prop, fallback);
}

const errors = [];
function check(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''));
  if (!cond) errors.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(function () {
  const { run } = createSandbox();
  const name = () => run('game.scenes.currentName');
  const scene = () => run('game.scenes.current');

  (async () => {
    await sleep(300);

    /* ================= ① 时间轴定义 ================= */
    console.log('=== ① 时间轴定义 ===');
    const TL = JSON.parse(run('JSON.stringify(LEVEL1.timeline)'));
    check('时间轴 10 步（444 新增闹铃段）', TL.length === 10, '实际 ' + TL.length);
    check('step0 = 新增闹铃段（seg1，循环）',
      TL[0].seg === 1 && TL[0].loop === true && TL[0].interact === 'alarm');
    check('step1 = 原 seg1（迟到赶路）', TL[1].seg === 2 && TL[1].pauseAt === null);
    check('step2 = 敲门（444 seg3 首帧）', TL[2].seg === 3 && TL[2].pauseAt === 'start' && TL[2].interact === 'knock');
    check('step3 = 门把手（444 seg4 首帧）', TL[3].seg === 4 && TL[3].pauseAt === 'start' && TL[3].interact === 'handle');
    check('step4 = 选择①（444 seg4 末帧）', TL[4].seg === 4 && TL[4].pauseAt === 'end' && TL[4].interact === 'quizStay');
    check('step5 = 座位算式（444 seg5）', TL[5].seg === 5 && TL[5].overlay === 'seatMath');
    check('step6 = 选择②（444 seg5 末帧）', TL[6].seg === 5 && TL[6].pauseAt === 'end' && TL[6].interact === 'quizSeat');
    check('step7 = 444 seg6 直接播放', TL[7].seg === 6 && TL[7].pauseAt === null);
    check('step8 = 看黑板（444 seg6 末帧）', TL[8].seg === 6 && TL[8].pauseAt === 'end' && TL[8].interact === 'boardGaze');
    check('step9 = 444 seg7 直接播放（选对后）', TL[9].seg === 7 && TL[9].pauseAt === null);
    check('最终会播到 seg7', TL[TL.length - 1].seg === 7);

    /* ★ 回归：本次修复的致命 bug —— "播完直接重播，第二次才弹选择"
       同一个 seg 出现两次时，第二次必须是 reuse（接在末帧做交互），
       否则会把同一段视频再放一遍。 */
    console.log('\n--- 回归：同一段不得被播放两遍 ---');
    const segs = TL.map(s => s.seg);
    const dup = [...new Set(segs.filter((v, i) => segs.indexOf(v) !== i))];
    check('存在重复的 seg（4 / 5 / 6）', dup.length === 3, '重复段号 ' + dup.join(','));
    dup.forEach(sg => {
      const occurrences = TL.map((s, i) => ({ s, i })).filter(o => o.s.seg === sg);
      const last = occurrences[occurrences.length - 1];
      check(`seg${sg} 的第二次出现是 reuse（不重播）`, last.s.reuse === true,
        'step' + last.i + (last.s.reuse ? '' : ' ← 缺 reuse，会导致重复播放'));
    });

    /* 真跑一遍：视频3 播完必须立刻弹选择，且 seg3 只加载 1 次 */
    await go('level1', '{}');
    run('game.scenes.current.cardEl.children[0].querySelector("button").click()')
    ;
    await sleep(600);
    // 直接把流程放到 step3（444 seg4 首帧交互②门把手）并让它完成
    run(`(function(){
      var s2 = game.scenes.current;
      s2.stepIndex = 3; s2._curStep = LEVEL1.timeline[3];
      s2._loadCount = {}; s2._skipUsed = {}; s2._replaying = false;
      s2._runStep();
    })()`);
    await sleep(300);
    // 完成交互② → 播放 → 触发播完
    run('game.scenes.current.interact._succeed()');
    await sleep(400);
    const loadBefore = run("JSON.stringify(game.scenes.current._loadCount)");
    run('game.scenes.current.videoEl.dispatch("ended", {})');
    await sleep(400);
    const loadAfter = run("JSON.stringify(game.scenes.current._loadCount)");
    check('seg4 播完直接弹选择（未重播）',
      run('game.scenes.current.interact.active') === 'choice',
      'interact.active=' + run('game.scenes.current.interact.active'));
    check('seg4 只加载 1 次', JSON.parse(loadAfter)['4'] === 1,
      `播完前 ${loadBefore} → 播完后 ${loadAfter}`);
    check('弹的是选择①（回座位）',
      run(`(function(){
        var q = game.scenes.current.interact.el.children[0].children[0];
        return String(q.textContent);
      })()`) === '你接下来要做的事是？');
    check('两个选项都在（首次提问 A/B 齐全）',
      run('game.scenes.current.interact._remaining.length') === 2);

    /* ================= ② 转码校验 ================= */
    console.log('\n=== ② 视频转码校验（H.264 / 1080p60 / faststart）===');
    const { execSync } = require('child_process');
    const vdir = path.join(ROOT, 'assets/video');
    /* ★ 444 包：seg1 是新增的闹铃段，seg2~seg7 = 原 555 的 seg1~seg6 */
    const expect = { 1: 3.507, 2: 4.923, 3: 2.021, 4: 9.776, 5: 7.315, 6: 10.705, 7: 18.344 };
    for (let n = 1; n <= 7; n++) {
      const f = path.join(vdir, `seg${n}.mp4`);
      if (!fs.existsSync(f)) { check(`seg${n}.mp4 存在`, false); continue; }
      let info = '';
      try {
        info = execSync(`ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${f}"`).toString();
      } catch (e) { check(`seg${n} 可解析`, false, e.message); continue; }
      const lines = info.trim().split('\n').map(x => x.trim());
      const h264 = lines.includes('h264');
      const wh = lines.includes('1920') && lines.includes('1080');
      const fps = lines.some(l => l === '60/1');
      const dur = parseFloat(lines[lines.length - 1]);
      const durOk = Math.abs(dur - expect[n]) < 0.5;
      // faststart = moov 在文件头部
      const buf = fs.readFileSync(f);
      const moovEarly = buf.indexOf(Buffer.from('moov')) < 2 * 1024 * 1024;
      check(`seg${n}: H.264 + 1080p60 + 时长${dur.toFixed(2)}s + faststart`,
        h264 && wh && fps && durOk && moovEarly,
        `${(fs.statSync(f).size / 1024 / 1024).toFixed(1)}MB` +
        (h264 ? '' : ' [非H.264]') + (wh ? '' : ' [非1080p]') +
        (fps ? '' : ' [非60fps]') + (durOk ? '' : ` [时长偏差 ${dur}≠${expect[n]}]`) +
        (moovEarly ? '' : ' [无faststart]'));
    }

    /* ================= ③ 进入关卡 ================= */
    console.log('\n=== ③ 进入关卡 ===');
    await go('level1', '{}');
    check('已进入 level1', name() === 'level1', name());
    check('信息卡已显示', run("game.scenes.current.cardEl.style.display") === '');
    const cardHTML = run('game.scenes.current.cardEl.children[0].innerHTML');
    check('信息卡：标题', cardHTML.includes('迟到的课堂'));
    check('信息卡：副标题', cardHTML.includes('推开门的那一刻'));
    check('信息卡：时长', cardHTML.includes('约 2 分钟'));
    check('信息卡：互动点', cardHTML.includes('4 处互动'));
    const sizeMB = execSync(`du -sm "${vdir}"`).toString().split('\t')[0];
    check('视频总体积合理（<80MB）', parseFloat(sizeMB) < 80, sizeMB + 'MB');

    /* ================= ④ 交互①：敲门（右上） ================= */
    console.log('\n=== ④ 交互① 敲门：右上象限容错 ===');
    run(`(function(){
      var c = game.scenes.current.cardEl.children[0];
      for (var i=0;i<c.children.length;i++)
        if (c.children[i].tagName === 'button') { c.children[i].click(); return; }
    })()`);
    await sleep(500);
    // 推进到 step1（视频2 首帧暂停）
    await forceStep(1);
    const R = JSON.parse(run('JSON.stringify(Object.keys(REGIONS))'));
    check('四象限已定义', R.length === 4 && R.includes('top-right') && R.includes('bottom-left'));
    check('右上判定 x>=0.5 且 y<0.5',
      run("REGIONS['top-right'](0.8,0.2)") === true &&
      run("REGIONS['top-right'](0.51,0.49)") === true &&
      run("REGIONS['top-right'](0.4,0.2)") === false);
    check('左下判定 x<0.5 且 y>=0.5',
      run("REGIONS['bottom-left'](0.2,0.8)") === true &&
      run("REGIONS['bottom-left'](0.49,0.5)") === true &&
      run("REGIONS['bottom-left'](0.6,0.8)") === false);
    check('容错=整个象限（右上任意点都命中）',
      run("REGIONS['top-right'](0.99,0.01)") === true &&
      run("REGIONS['top-right'](0.5,0.0)") === true);

    /* ================= ⑤ 选择①：回座位 / 去外面站着 ================= */
    console.log('\n=== ⑤ 选择① 回座位 / 去教室外面站着 ===');
    const qs = JSON.parse(run('JSON.stringify(LEVEL1.quizStay)'));
    check('题干「你接下来要做的事是？」', qs.question === '你接下来要做的事是？');
    check('选项 A = 回座位（正确）', qs.options[0].text === '回座位' && qs.options[0].correct === true);
    check('选项 B = 去教室外面站着（错误）', qs.options[1].text === '去教室外面站着' && qs.options[1].correct === false);

    // 模拟：选 B → B 被移除 + 重播视频3 且跳过交互②
    await forceStep(3);
    const s = scene();
    s._quizStay(function () {});
    await sleep(50);
    const btns = run(`JSON.stringify((function(){
      var l = game.scenes.current.interact._list.children, out=[];
      for (var i=0;i<l.length;i++) out.push(String(l[i].textContent));
      return out; })())`);
    check('两个选项都渲染', JSON.parse(btns).length === 2, JSON.parse(btns).join(' | '));
    // 点 B
    run(`(function(){
      var bs = game.scenes.current.interact._list.children;
      for (var i=0;i<bs.length;i++) if (String(bs[i].textContent).indexOf('外面')>=0) { bs[i].click(); return; }
    })()`);
    await sleep(700);   // 交互层有 420ms 的选错动画延迟
    check('选 B 后标记 B 已移除', run('game.scenes.current._quizBRemoved') === true);
    check('选 B 后标记重播', run('game.scenes.current._replaying') === true);
    check('重播时跳过交互②（门把手）', run("game.scenes.current._skipUsed.handle") === true);
    await sleep(1800);  // _replayStay 内部 1400ms 后回到 timeline[2]
    check('重播回到 timeline[2]（视频3）', run('game.scenes.current.stepIndex') === 2,
      'stepIndex=' + run('game.scenes.current.stepIndex'));

    /* ================= ⑥ 座位算式 ================= */
    console.log('\n=== ⑥ 座位算式（随机 + 4~6 区间）===');
    const vals = [];
    for (let i = 0; i < 40; i++) {
      const v = JSON.parse(run(`JSON.stringify((function(){
        var s2 = game.scenes.current; s2.seat = s2._genSeat(); return s2.seat; })())`));
      vals.push(v);
    }
    check('排与列都落在 4~6',
      vals.every(v => v.row >= 4 && v.row <= 6 && v.col >= 4 && v.col <= 6),
      '样本 ' + vals.length);
    check('确实有随机性（不全相同）',
      new Set(vals.map(v => v.row + ',' + v.col)).size > 1,
      '不同组合 ' + new Set(vals.map(v => v.row + ',' + v.col)).size + ' 种');

    // 算式求值必须等于答案
    let exprOk = true, sample = '';
    for (let i = 0; i < 25; i++) {
      const r = JSON.parse(run(`JSON.stringify((function(){
        var s2 = game.scenes.current;
        s2.seat = s2._genSeat();
        s2._showSeatMath();
        var el = s2.interact._overlay;
        return { text: el ? el.textContent : '', row: s2.seat.row, col: s2.seat.col };
      })())`));
      const m = r.text.match(/\((\d+)([+-])(\d+)\)/g);
      if (!m || m.length !== 2) { exprOk = false; sample = r.text; break; }
      const ev = (x) => { const p = x.match(/\((\d+)([+-])(\d+)\)/); return p[2] === '+' ? (+p[1] + +p[3]) : (+p[1] - +p[3]); };
      if (ev(m[0]) !== r.row || ev(m[1]) !== r.col) { exprOk = false; sample = r.text + ` 期望 ${r.row}/${r.col}`; break; }
      sample = r.text;
    }
    check('算式求值 == 随机出的排/列', exprOk, sample);
    check('算式显示到 4 秒', run('LEVEL1.seatMath.showUntilSec') === 4.0);
    run("game.scenes.current.interact.clearOverlay()");

    /* ================= ⑦ 选择②：座位 4 选 1 ================= */
    console.log('\n=== ⑦ 选择② 座位 4 选 1 ===');
    const opts = JSON.parse(run(`JSON.stringify((function(){
      var s2 = game.scenes.current; s2.seat = {row:5, col:4};
      return s2._buildSeatOptions(); })())`));
    check('恰好 4 个选项', opts.length === 4, '实际 ' + opts.length);
    check('恰好 1 个正确', opts.filter(o => o.correct).length === 1);
    check('正确项 == 答案', (() => {
      const c = opts.find(o => o.correct);
      return c && c.row === 5 && c.col === 4;
    })());
    check('所有选项都落在 4~6', opts.every(o => o.row >= 4 && o.row <= 6 && o.col >= 4 && o.col <= 6),
      opts.map(o => `${o.row}/${o.col}`).join(' '));
    check('选项文案格式「第 X 排 第 Y 列」',
      opts.every(o => o.text === `第 ${o.row} 排 第 ${o.col} 列`), opts[0].text);

    // 选错 → 移除该选项
    await forceStep(5);
    scene()._quizSeat(function () {});
    await sleep(50);
    const before2 = run("game.scenes.current.interact._remaining.length");
    // 明确挑一个"错误项"来点（不能靠 className，正确项点击前没有标记）
    run(`(function(){
      var s2 = game.scenes.current, rem = s2.interact._remaining;
      for (var i=0;i<rem.length;i++) {
        if (rem[i].correct) continue;                 // 跳过正确项
        s2.interact._list.children[i].click(); return;
      }
    })()`);
    await sleep(800);
    const after2 = run("game.scenes.current.interact._remaining.length");
    check('选错后该选项被移除', parseInt(after2) < parseInt(before2),
      `${before2} → ${after2}`);

    /* ================= ⑦¼ 新增：闹铃交互（444 第一段） ================= */
    console.log('\n=== ⑦¼ 闹铃交互（点击关闹铃 / 未点击重播 / 兜底）===');
    const AL = JSON.parse(run('JSON.stringify(LEVEL1.alarm)'));
    check('提示文案 = 关掉闹铃', AL.text === '关掉闹铃', AL.text);
    check('提示强度分档（≥3 档）', AL.steps.length >= 3, AL.steps.length + ' 档');
    check('每档字号递增',
      AL.steps.every((st, i) => i === 0 || st.scale > AL.steps[i - 1].scale),
      AL.steps.map(s => s.scale).join(' → '));
    check('每档闪烁加快（blink 递减）',
      AL.steps.every((st, i) => i === 0 || st.blink < AL.steps[i - 1].blink),
      AL.steps.map(s => s.blink + 's').join(' → '));
    /* ★ 需求是"重复播放直到用户点击"，不是播几次就自动放行。
       maxLoops = 0 表示无限重播；正整数才启用兜底。 */
    check('maxLoops = 0（无限重播直到点击，不自动跳过）', AL.maxLoops === 0,
      'maxLoops=' + AL.maxLoops);

    await go('level1', '{}');
    /* ★ 进入关卡先显示信息卡，必须点「开始」才会跑时间轴；
       之后视频加载是异步的，还要再等一会儿才能断言。 */
    await startCard();
    check('开局即闹铃段（step0，loop）',
      run('game.scenes.current.stepIndex') === 0 &&
      run('game.scenes.current._curStep.loop') === true,
      'stepIndex=' + run('game.scenes.current.stepIndex') +
      ' loop=' + run('game.scenes.current._curStep && game.scenes.current._curStep.loop'));
    check('闹铃提示已显示',
      run("!!(game.scenes.current._alarmEl && game.scenes.current._alarmEl.classList.contains('is-show'))"));
    check('提示初始为第 0 档（scale = 1）',
      run("game.scenes.current._alarmEl.style.getPropertyValue('--alarm-scale')") === '1');

    /* ★ 未点击 → 播完重播本段，且**不重新 load** */
    const before = JSON.parse(run('JSON.stringify(game.scenes.current._loadCount)'));
    run('game.scenes.current.videoEl.dispatch("ended", {})');
    await sleep(120);
    const after = JSON.parse(run('JSON.stringify(game.scenes.current._loadCount)'));
    check('未点击时播完仍在闹铃段（未推进）',
      run('game.scenes.current.stepIndex') === 0,
      'stepIndex=' + run('game.scenes.current.stepIndex'));
    check('重播不重新 load（loadCount 不变）',
      JSON.stringify(before) === JSON.stringify(after),
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    check('重播计数 +1', run('game.scenes.current._alarmLoops') === 1);
    check('第 2 次提示更强（scale > 1）',
      parseFloat(run("game.scenes.current._alarmEl.style.getPropertyValue('--alarm-scale')")) > 1,
      'scale=' + run("game.scenes.current._alarmEl.style.getPropertyValue('--alarm-scale')"));

    /* ★ 连续播完 8 次都必须留在本段（用户还没点，绝不能自动跳过） */
    for (let k = 0; k < 8; k++) {
      run('game.scenes.current.videoEl.dispatch("ended", {})');
      await sleep(30);
    }
    check('连播 8 次仍未推进（不被自动跳过）',
      run('game.scenes.current.stepIndex') === 0,
      'stepIndex=' + run('game.scenes.current.stepIndex'));
    check('重播计数已累积到 9', run('game.scenes.current._alarmLoops') === 9,
      'loops=' + run('game.scenes.current._alarmLoops'));
    check('提示强度封顶在最后一档（不无限变大）',
      parseFloat(run("game.scenes.current._alarmEl.style.getPropertyValue('--alarm-scale')")) === AL.steps[AL.steps.length - 1].scale,
      'scale=' + run("game.scenes.current._alarmEl.style.getPropertyValue('--alarm-scale')"));
    /* 兜底开关仍可用：显式设为正整数时应自动放行 */
    run('LEVEL1.alarm.maxLoops = 2');
    await go('level1', '{}');
    await startCard();
    run('game.scenes.current.videoEl.dispatch("ended", {})');
    await sleep(60);
    run('game.scenes.current.videoEl.dispatch("ended", {})');
    await sleep(200);
    check('maxLoops=2 时兜底生效（自动放行）',
      run('game.scenes.current.stepIndex') === 1,
      'stepIndex=' + run('game.scenes.current.stepIndex'));
    run('LEVEL1.alarm.maxLoops = 0');

    /* ★ 点击 → 立即进入第二段 */
    await go('level1', '{}');
    await startCard();
    run(`(function(){
      var s2 = game.scenes.current;
      s2._alarmOff = false; s2._alarmLoops = 0;
      s2._refreshAlarmHint(0);
      s2._alarmOffNow();
    })()`);
    await sleep(200);
    check('点击后推进到 step1', run('game.scenes.current.stepIndex') === 1,
      'stepIndex=' + run('game.scenes.current.stepIndex'));
    check('点击后提示隐藏',
      run("!game.scenes.current._alarmEl.classList.contains('is-show')"));
    check('点击后 seg2 已加载（进入赶路段）',
      run('game.scenes.current._loadCount[2]') === 1,
      'loadCount[2]=' + run('game.scenes.current._loadCount[2]'));

    /* ★ 点右上角按钮不应被当成"关闹铃" */
    await go('level1', '{}');
    await startCard();
    const btnGuard = JSON.parse(run(`JSON.stringify((function(){
      var s2 = game.scenes.current;
      var before = s2.stepIndex;
      if (s2._alarmHandler) s2._alarmHandler({ target: s2.btnSkip });
      return { before: before, after: s2.stepIndex, off: !!s2._alarmOff };
    })())`));
    check('点工具按钮不触发关闹铃', btnGuard.off === false && btnGuard.after === btnGuard.before,
      `off=${btnGuard.off} step ${btnGuard.before}→${btnGuard.after}`);

    /* ================= ⑦½ 视觉：不画区域框 + 对比度 ================= */
    console.log('\n=== ⑦½ 视觉：无区域框 / 对比度 ===');
    // 区域框必须不存在（用户明确要求：不要用框框住点击区域）
    check('CSS 已移除 .it-region 样式', CSS_TEXT.indexOf('.it-region') < 0);
    check('代码已不再创建 region 元素',
      run(`(function(){
        var s2 = game.scenes.current;
        s2.interact.clear();
        s2.interact.showTap(LEVEL1.interacts.knock, function(){});
        var r = s2.interact._regionEl;
        var hasRegionChild = !!s2.interact.el.children[0] &&
                             String(s2.interact.el.children[0].className).indexOf('it-region') >= 0;
        s2.interact.clear();
        return !r && !hasRegionChild;
      })()`));
    check('点击交互只保留文字提示',
      run(`(function(){
        var s2 = game.scenes.current;
        s2.interact.showTap(LEVEL1.interacts.handle, function(){});
        var c = s2.interact.el.children[0];
        var ok = String(c.className).indexOf('it-tip') >= 0;
        s2.interact.clear();
        return ok;
      })()`));
    check('点错闪的是提示文字（tip-wrong 动画存在）',
      /@keyframes tip-wrong/.test(CSS_TEXT));

    // ---- 对比度：半透明底色按"合成到纯白"的最坏情况计算 ----
    const pairs = [
      ['选择题面板', '.it-choice', 'color', '.it-choice__q'],
      ['悬浮算式', '.it-overlay', 'color', null]
    ];
    // 直接取声明值做对比度计算
    const panelBg = styleOf(['it-choice'], 'background');
    const qColor = styleOf(['it-choice__q'], 'color');
    check('选择题面板：深实底（alpha ≥ .9）',
      (contrast.parseColor(panelBg) || { a: 0 }).a >= 0.9, panelBg);
    check('选择题题干对比度 ≥ 4.5（亮画面上仍可读）',
      contrast.contrast(qColor, panelBg) >= 4.5,
      `${qColor} on ${panelBg} = ${contrast.contrast(qColor, panelBg).toFixed(1)}:1`);

    const ovBg = styleOf(['it-overlay'], 'background');
    const ovFg = styleOf(['it-overlay'], 'color');
    check('悬浮算式：深实底（alpha ≥ .9）',
      (contrast.parseColor(ovBg) || { a: 0 }).a >= 0.9, ovBg);
    check('悬浮算式对比度 ≥ 4.5',
      contrast.contrast(ovFg, ovBg) >= 4.5,
      `${ovFg} on ${ovBg} = ${contrast.contrast(ovFg, ovBg).toFixed(1)}:1`);

    const tipBg = styleOf(['it-tip'], 'background');
    const tipFg = styleOf(['it-tip__text'], 'color');
    check('点击提示：深实底（alpha ≥ .9）',
      (contrast.parseColor(tipBg) || { a: 0 }).a >= 0.9, tipBg);
    check('点击提示对比度 ≥ 4.5',
      contrast.contrast(tipFg, tipBg) >= 4.5,
      `${tipFg} on ${tipBg} = ${contrast.contrast(tipFg, tipBg).toFixed(1)}:1`);

    // 右上角声音按钮（叠在视频上，必须是深色底）
    const hudIcon = styleOf(['btn', 'btn--icon'], '--btn-c1',
      [{ id: 'hud-layer', classes: new Set(['hud-layer']), tag: 'div' }]);
    check('声音按钮底色为深色（R+G+B < 120）',
      (() => {
        const c = contrast.parseColor(hudIcon);
        return c && (c.r + c.g + c.b) < 120;
      })(), hudIcon);
    check('声音按钮与白色图标对比度 ≥ 4.5',
      contrast.contrast('#ffffff', hudIcon) >= 4.5,
      `白图标 on ${hudIcon} = ${contrast.contrast('#ffffff', hudIcon).toFixed(1)}:1`);
    check('声音按钮有白色描边（浅底亮画面下仍可见）',
      /#hud-layer \.btn--icon[^}]*rgba\(255,255,255,\.\d+\)/.test(CSS_TEXT));
    void pairs;

    /* ================= ⑦¾ 看黑板（第 5 个交互点） ================= */
    console.log('\n=== ⑦¾ 看黑板（444 seg6 播完 → 受限视野找红色公式）===');
    const BG = JSON.parse(run('JSON.stringify(LEVEL1.boardGaze)'));
    check('时间轴：444 seg6 播完接 boardGaze',
      TL[8].seg === 6 && TL[8].pauseAt === 'end' && TL[8].interact === 'boardGaze' && TL[8].reuse === true);
    check('选对公式 → 播 seg7 → 结束', TL[9].seg === 7 && TL[9].pauseAt === null);
    check('首次 30 秒 / 选错再给 10 秒', BG.firstSec === 30 && BG.retrySec === 10);
    check('对准停留 2 秒自动交卷', BG.dwellSec === 2.0);
    check('视野窗口 18%', Math.abs(BG.windowRatio - 0.18) < 1e-6);
    check('正确答案 = y = ax²（² 为上标，非中文）',
      BG.answer === 'y = ax²' && BG.answer.indexOf('平方') < 0 && BG.answer.indexOf('²') > 0,
      JSON.stringify(BG.answer));
    check('4 个选项 / 恰好 1 个正确',
      BG.options.length === 4 && BG.options.filter(o => o === BG.answer).length === 1,
      BG.options.join(' | '));
    check('混淆项都不等于答案',
      BG.options.filter(o => o !== BG.answer).every(o => o !== BG.answer));
    check('底图文件存在',
      fs.existsSync(path.join(ROOT, BG.image)), BG.image);

    // ★ 视野不缩小：半径的计算不得依赖任何随时间变化的量
    //   （注释里提到"缩小"不算，只看真实计算式）
    const gazeSrc = fs.readFileSync(path.join(ROOT, 'js/scenes/level1/BoardGaze.js'), 'utf8');
    const codeOnly = gazeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const rLine = (codeOnly.match(/var r = [^;]+;/) || [''])[0];
    check('视野半径是常量（不随时间/剩余时间缩小）',
      rLine.length > 0 && !/this\.t|remaining|dt|progress/.test(rLine), rLine.trim());
    check('三个"不受控"来源都在（漂移 / 阻尼 / 夺走）',
      /drift/.test(codeOnly) && /damping/.test(codeOnly) && /hijack/.test(codeOnly));

    // 干扰点必须避开目标热区，否则玩家会被"夺走"到正确位置
    const tg = BG.target;
    const overlap = BG.hijack.points.filter(p =>
      p.x >= tg.x - 0.02 && p.x <= tg.x + tg.w + 0.02 &&
      p.y >= tg.y - 0.02 && p.y <= tg.y + tg.h + 0.02);
    check('干扰点都不落在目标热区内', overlap.length === 0,
      overlap.map(p => p.label).join(',') || '无重叠');
    check('干扰点在 0~1 范围内',
      BG.hijack.points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));

    // ---- 真跑：视野中心应被限制在 0~1，且能对公式停留计时 ----
    run(`(function(){
      var s2 = game.scenes.current;
      if (s2.gaze) { s2.gaze.stop(); s2.gaze = null; }
      window.__g = new BoardGaze({
        img: game.assets.get('scenes.boardClassroom'),
        cfg: LEVEL1.boardGaze,
        container: s2.hudEl,
        onObserveEnd: function(){ window.__ended = true; }
      });
      __g.begin();
    })()`);
    await sleep(60);
    check('看黑板已启动', run('!!window.__g && window.__g.phase === "gaze"') === true);

    // 模拟 60 帧，视野中心必须始终合法
    run(`(function(){
      window.__bad = 0;
      for (var i=0;i<60;i++){
        __g.update(i*16.7);
        if (__g.center.x < 0 || __g.center.x > 1 || __g.center.y < 0 || __g.center.y > 1) __bad++;
      }
    })()`);
    check('60 帧后视野中心仍在 0~1 内', run('window.__bad') === 0);

    // 把视野强行放到目标区，验证 dwell 累积与自动交卷
    run(`(function(){
      var c = LEVEL1.boardGaze.target;
      __g.target.x = c.x + c.w/2; __g.target.y = c.y + c.h/2;
      __g.center.x = __g.target.x; __g.center.y = __g.target.y;
      __g._hijack = null;
      window.__ended = false;
      for (var i=0;i<200 && !window.__ended;i++) __g.update(1000 + i*16.7);
    })()`);
    check('对准后停留 2 秒自动交卷', run('window.__ended') === true,
      'dwell=' + run('__g.dwell.toFixed(2)'));

    // 倒计时到点也会交卷
    run(`(function(){
      __g.phase='gaze'; __g.remaining=0.05; __g.dwell=0; window.__ended=false;
      for (var i=0;i<10 && !window.__ended;i++) __g.update(3000+i*16.7);
    })()`);
    check('倒计时归零也会交卷', run('window.__ended') === true);

    // resume：位置与视野大小都不变
    run(`(function(){
      __g.phase='gaze';
      __g.center.x=0.3; __g.center.y=0.7; __g.target.x=0.3; __g.target.y=0.7;
      __g.resume(10);
    })()`);
    check('resume 后位置不变', Math.abs(run('__g.center.x') - 0.3) < 1e-6 &&
      Math.abs(run('__g.center.y') - 0.7) < 1e-6);
    check('resume 后剩余时间 = 10 秒', run('__g.remaining') === 10);
    run('__g.stop(); window.__g = null;');

    /* ================= ⑦⅞ 本次修复的四项回归 ================= */
    console.log('\n=== ⑦⅞ 回归：拖动方向 / 视野外可见 / 选错消失 / 选对跳转 ===');

    /* ① 拖动方向：向左拖，视野必须向左 */
    await go('level1', '{}');
    run(`(function(){
      var s2 = game.scenes.current;
      s2.stepIndex = 8; s2._curStep = LEVEL1.timeline[8];
      s2._doInteract(LEVEL1.timeline[8], function(){});
    })()`);
    await sleep(150);
    check('看黑板已启动', run("!!(game.scenes.current.gaze && game.scenes.current.gaze.active)"));

    /* ★ 注意：拖动限速后 pointermove 写的是 _pending（原始意图），
       target 由 update() 逐步逼近。所以这里既查 _pending（即时方向），
       也跑几帧确认 target 真的朝那个方向走了。 */
    function dragProbe(fromX, fromY, toX, toY) {
      return JSON.parse(run(`JSON.stringify((function(){
        var g = game.scenes.current.gaze;
        var saveHj = LEVEL1.boardGaze.hijack.enabled;
        LEVEL1.boardGaze.hijack.enabled = false;      // 隔离"注意力被夺"
        g._hijack = null;
        g.phase = 'gaze'; g.active = true; g._last = 0;
        g.target.x = ${fromX}; g.target.y = ${fromY};
        g.center.x = g.target.x; g.center.y = g.target.y;
        g.canvas.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        g.canvas.dispatch('pointermove', { clientX: ${toX}, clientY: ${toY}, pointerId: 1 });
        var pend = { x: g._pending.x, y: g._pending.y };
        for (var i = 0; i < 30; i++) g.update(20000 + i * 16);   // 跑半秒
        var tgt = { x: g.target.x, y: g.target.y };
        g._dragging = false; g._pending = null;
        LEVEL1.boardGaze.hijack.enabled = saveHj;
        return { pend: pend, tgt: tgt };
      })())`));
    }
    const d1 = dragProbe(0.5, 0.5, 300, 500);   // 向左拖
    check('向左拖 → 意图向左（pending.x 变小）', d1.pend.x < 0.5,
      'pending.x=' + d1.pend.x.toFixed(3));
    check('向左拖 → 视野确实左移（target.x 变小）', d1.tgt.x < 0.5,
      'target.x=' + d1.tgt.x.toFixed(3));

    const d2 = dragProbe(0.5, 0.5, 800, 500);   // 向右拖
    check('向右拖 → 意图向右（pending.x 变大）', d2.pend.x > 0.5,
      'pending.x=' + d2.pend.x.toFixed(3));
    check('向右拖 → 视野确实右移（target.x 变大）', d2.tgt.x > 0.5,
      'target.x=' + d2.tgt.x.toFixed(3));

    const d3 = dragProbe(0.5, 0.5, 500, 300);   // 向上拖
    check('向上拖 → 视野确实上移（target.y 变小）', d3.tgt.y < 0.5,
      'target.y=' + d3.tgt.y.toFixed(3));

    /* ② 视野外不能全黑 */
    /* ★ 用户要求：视野外必须全黑（管状视野）。
       注：上一版曾误把"全黑"当成问题调亮，这里反向锁死防止回退。 */
    check('视野外全黑（dim ≥ 0.99）', run('LEVEL1.boardGaze.dim') >= 0.99,
      'dim=' + run('LEVEL1.boardGaze.dim'));
    check('全黑时走纯色填充分支（省一次 drawImage）',
      /dim >= 0\.99/.test(require('fs').readFileSync(
        require('path').join(ROOT, 'js/scenes/level1/BoardGaze.js'), 'utf8')));

    /* ★ 拖动干扰：难度不能太低 */
    const DG = JSON.parse(run('JSON.stringify(LEVEL1.boardGaze.drag)'));
    check('打滑：gain < 1（手指挪 1 格视野只跟一部分）',
      DG.gain < 1 && DG.gain > 0, 'gain=' + DG.gain);
    check('拖动随机偏移 noise > 0', DG.noise > 0, 'noise=' + DG.noise);
    check('拖动抖动 jitterAmp > 0', DG.jitterAmp > 0, 'amp=' + DG.jitterAmp);
    check('拖动时阻尼更低（dragDampingScale < 1）',
      DG.dragDampingScale < 1, 'scale=' + DG.dragDampingScale);
    check('注意力被夺更频繁（everyMin ≤ 3.5）',
      run('LEVEL1.boardGaze.hijack.everyMin') <= 3.5,
      'everyMin=' + run('LEVEL1.boardGaze.hijack.everyMin'));
    check('漂移幅度已加大（ampX ≥ 0.03）',
      run('LEVEL1.boardGaze.drift.ampX') >= 0.03,
      'ampX=' + run('LEVEL1.boardGaze.drift.ampX'));

    /* ★ 本轮新增：渐进聚焦 / 起始位置 / 方向凸起 / 拖动限速 */
    console.log('\n--- 新增：聚焦 · 起始点 · 凸起 · 限速 ---');
    const BGC = JSON.parse(run('JSON.stringify(LEVEL1.boardGaze)'));
    check('起始位置不在正中心',
      Math.abs(BGC.start.x - 0.5) > 0.1 || Math.abs(BGC.start.y - 0.5) > 0.1,
      `start=(${BGC.start.x}, ${BGC.start.y})`);
    check('起始点远离目标（需要主动找）',
      Math.abs(BGC.start.x - (BGC.target.x + BGC.target.w / 2)) > 0.2,
      '横向距离 = ' + Math.abs(BGC.start.x - (BGC.target.x + BGC.target.w / 2)).toFixed(2));
    check('渐进聚焦已开启（sec > 0 且 from = 1）',
      BGC.focusIn.sec > 0 && BGC.focusIn.from === 1,
      `sec=${BGC.focusIn.sec} from=${BGC.focusIn.from}`);
    check('方向凸起已开启', BGC.bump.enabled === true);
    check('拖动限速已开启（maxSpeed ≤ 0.25）',
      BGC.drag.maxSpeed <= 0.25, 'maxSpeed=' + BGC.drag.maxSpeed);

    // 模糊量随时间递减
    const blurCurve = JSON.parse(run(`JSON.stringify((function(){
      var g = game.scenes.current.gaze;
      var f = LEVEL1.boardGaze.focusIn;
      var out = [];
      [0, 0.25, 0.5, 0.75, 1].forEach(function(k){
        g.elapsed = f.sec * k;
        out.push(+g._blurAmount().toFixed(3));
      });
      g.elapsed = 0;
      return out;
    })())`));
    check('开场完全模糊（t=0 时 ≈1）', blurCurve[0] >= 0.99, 'blur=' + blurCurve[0]);
    check('模糊随時間单调递减',
      blurCurve.every((v, i) => i === 0 || v <= blurCurve[i - 1]),
      blurCurve.join(' → '));
    check('到点后完全清晰（t=sec 时 =0）', blurCurve[4] === 0, 'blur=' + blurCurve[4]);
    check('前段非常模糊（t=25% 时仍 ≥0.85）', blurCurve[1] >= 0.85,
      't=25% → blur=' + blurCurve[1]);
    check('中段仍偏模糊（t=50% 时 ≥0.6）', blurCurve[2] >= 0.6,
      't=50% → blur=' + blurCurve[2]);

    /* ★ 拖动抖动：必须真的生效（不能只改配置不改代码）
       注意要**临时关掉 hijack**：否则测到的是"注意力被夺走到干扰点"的位移，
       会把抖动幅度夸大到 0.4 量级，掩盖真实读数。 */
    const shake = JSON.parse(run(`JSON.stringify((function(){
      var g = game.scenes.current.gaze;
      var saveHj = LEVEL1.boardGaze.hijack.enabled;
      LEVEL1.boardGaze.hijack.enabled = false;      // 隔离变量
      g._hijack = null;
      g.phase = 'gaze'; g.active = true; g._last = 0;   // ★ 复位，避免跨用例污染
      g.target.x = 0.5; g.target.y = 0.5;
      g.center.x = 0.5; g.center.y = 0.5;
      g._dragging = true;
      var xs = [];
      for (var i = 0; i < 40; i++) { g.update(1000 + i * 16); xs.push(g.center.x); }
      g._dragging = false;
      LEVEL1.boardGaze.hijack.enabled = saveHj;
      var mn = Math.min.apply(null, xs), mx = Math.max.apply(null, xs);
      return { span: mx - mn };
    })())`));
    check('拖动时视野确实在抖（明显可感）', shake.span > 0.02,
      '纯抖动幅度 = ' + shake.span.toFixed(4));
    check('抖动没有大到完全失控（< 0.25）', shake.span < 0.25,
      '纯抖动幅度 = ' + shake.span.toFixed(4));

    /* 松手后抖动应消失，只剩漂移 —— 这是"拖到位松手就能稳住"的关键 */
    const still = JSON.parse(run(`JSON.stringify((function(){
      var g = game.scenes.current.gaze;
      var saveHj = LEVEL1.boardGaze.hijack.enabled;
      LEVEL1.boardGaze.hijack.enabled = false;
      g._hijack = null;
      g.phase = 'gaze'; g.active = true; g._last = 0;
      g.target.x = 0.5; g.target.y = 0.5;
      g.center.x = 0.5; g.center.y = 0.5;
      g._dragging = false;
      var xs = [];
      for (var i = 0; i < 40; i++) { g.update(3000 + i * 16); xs.push(g.center.x); }
      LEVEL1.boardGaze.hijack.enabled = saveHj;
      return { span: Math.max.apply(null, xs) - Math.min.apply(null, xs) };
    })())`));
    check('松手后明显更稳（拖动时波动 ≥ 松手时的 2 倍）',
      shake.span >= still.span * 2,
      `拖动 ${shake.span.toFixed(4)} vs 松手 ${still.span.toFixed(4)}`);
    check('拖动干扰确实够强（波动 ≥ 0.05，玩家能明显感到抓不住）',
      shake.span >= 0.05, '波动 = ' + shake.span.toFixed(4));

    /* ★ 可完成性：松手后抖动消失，只留漂移，且漂移小于目标热区半宽
       —— 保证"拖到位后松手能稳住 2 秒"，不会因干扰过大而永久卡关 */
    const settle = JSON.parse(run(`JSON.stringify((function(){
      var g = game.scenes.current.gaze, tg = LEVEL1.boardGaze.target;
      g.phase = 'gaze'; g.active = true; g._last = 0; g._hijack = null;
      g.target.x = tg.x + tg.w / 2; g.target.y = tg.y + tg.h / 2;
      g.center.x = g.target.x; g.center.y = g.target.y;
      g._dragging = false;
      var inside = 0;
      for (var i = 0; i < 200; i++) {          // 约 3.2 秒
        g.update(5000 + i * 16);
        if (g.center.x >= tg.x && g.center.x <= tg.x + tg.w &&
            g.center.y >= tg.y && g.center.y <= tg.y + tg.h) inside++;
      }
      return { ratio: inside / 200 };
    })())`));
    check('松手后能稳在目标区内（可完成，不卡关）', settle.ratio > 0.85,
      '停留在目标区的时间占比 = ' + (settle.ratio * 100).toFixed(0) + '%');

    /* ★ 拖动限速：手指猛甩，视野也只能慢慢跟 */
    const slow = JSON.parse(run(`JSON.stringify((function(){
      var g = game.scenes.current.gaze;
      var saveHj = LEVEL1.boardGaze.hijack.enabled;
      LEVEL1.boardGaze.hijack.enabled = false;
      g._hijack = null;
      g.phase = 'gaze'; g.active = true; g._last = 0;
      g.target.x = 0.1; g.target.y = 0.5; g.center.x = 0.1; g.center.y = 0.5;
      g._dragging = true;
      g._pending = { x: 0.9, y: 0.5 };        // 手指一把甩到最右（跨度 0.8）
      g.update(10000);                         // 预热一帧（确立 _last）
      var x1 = g.target.x;
      g.update(10016);                         // 再走一帧 16ms
      var moved = g.target.x - x1;
      g._dragging = false; g._pending = null;
      LEVEL1.boardGaze.hijack.enabled = saveHj;
      return { moved: moved, cap: LEVEL1.boardGaze.drag.maxSpeed };
    })())`));
    check('单帧位移被限速（≤ maxSpeed × 0.016 + 容差）',
      slow.moved <= slow.cap * 0.016 + 1e-6,
      `单帧移动 ${slow.moved.toFixed(5)} ≤ 上限 ${(slow.cap * 0.016).toFixed(5)}`);
    check('限速后横穿全图需 ≥ 5 秒', 1 / slow.cap >= 5,
      `横穿耗时 ≈ ${(1 / slow.cap).toFixed(1)} 秒`);

    /* ★ 回归：闹铃点击监听必须绑在 #app 上（不能绑会被 _build 重建的 this.el） */
    console.log('\n--- 回归：点击绑定位置 ---');
    check('_bindAlarmWatch 存在', run("typeof game.scenes.map.level1._bindAlarmWatch") === 'function');
    check('监听绑在 #app（稳定节点，不会随 _build 失效）',
      require('fs').readFileSync(path.join(ROOT, 'js/scenes/VideoLevelScene.js'), 'utf8')
        .indexOf("getElementById('app')") >= 0);
    check('enter 里每次都重新绑定（不在 _bindAudioWatch 的单次保护内）',
      (function () {
        const src = require('fs').readFileSync(path.join(ROOT, 'js/scenes/VideoLevelScene.js'), 'utf8');
        const fn = src.slice(src.indexOf('_bindAlarmWatch = function'),
                             src.indexOf('_unbindAlarmWatch = function'));
        const inAudio = src.slice(src.indexOf('_bindAudioWatch = function'),
                                  src.indexOf('_watchRotate = function'))
                           .includes('_bindAlarmWatch()');
        return fn.includes("getElementById('app')") && !inAudio;
      })());

    /* ★ 真实派发 pointerdown 到 #app，验证点击能关掉闹铃 */
    await go('level1', '{}');
    await startCard();
    const beforeClick = run('game.scenes.current.stepIndex');
    run(`(function(){
      var app = document.getElementById('app');
      app.dispatch('pointerdown', { clientX: 400, clientY: 300, target: app });
    })()`);
    await sleep(400);
    check('真实点击 #app 能关掉闹铃并推进',
      beforeClick === 0 && run('game.scenes.current.stepIndex') === 1,
      `step ${beforeClick} → ${run('game.scenes.current.stepIndex')}`);
    check('点击后 _alarmOff = true', run('game.scenes.current._alarmOff') === true);

    /* ★ 重复进出关卡后点击依然有效（旧 bug：绑在被重建的 el 上会失效） */
    await go('select', '{}');
    await go('level1', '{}');
    await startCard();
    run(`(function(){
      var app = document.getElementById('app');
      app.dispatch('pointerdown', { clientX: 400, clientY: 300, target: app });
    })()`);
    await sleep(400);
    check('二次进入关卡后点击仍有效（不因 el 重建失效）',
      run('game.scenes.current.stepIndex') === 1,
      'stepIndex=' + run('game.scenes.current.stepIndex'));

    /* ★ 校准模式 */
    check('BoardGaze 支持 calib 参数',
      /opt\.calib/.test(require('fs').readFileSync(
        path.join(ROOT, 'js/scenes/level1/BoardGaze.js'), 'utf8')));
    check('数字键 9 绑定了校准切换',
      /Digit9/.test(require('fs').readFileSync(path.join(ROOT, 'js/main.js'), 'utf8')));

    /* 上面把流程推进到了 step1，这里重建 gaze，保证后续用例的前置状态不变 */
    await go('level1', '{}');
    await startCard();
    run(`(function(){
      var s2 = game.scenes.current;
      s2.stepIndex = 8; s2._curStep = LEVEL1.timeline[8];
      s2._doInteract(LEVEL1.timeline[8], function(){});
    })()`);
    await sleep(200);
    check('已重建 gaze 供后续用例使用', run("!!game.scenes.current.gaze"));

    /* ③ 选错：题目消失 → 回去看 10 秒 → 再问 */
    console.log('\n--- 选错：题目消失并重问 ---');
    run(`(function(){
      var s2 = game.scenes.current, cfg = LEVEL1.boardGaze;
      s2.gaze.pause();
      s2.interact.showChoice(
        { question: cfg.question,
          options: cfg.options.map(function(t,i){
            return {id:'f'+i, text:t, correct: t===cfg.answer}; }) },
        function(){},
        { wrongText: cfg.wrongText, removeAfterWrong: false,
          onWrong: function(){
            setTimeout(function(){
              s2.interact.clear();
              if (s2.gaze) s2.gaze.resume(cfg.retrySec);
            }, 900);
          } });
    })()`);
    await sleep(100);
    check('题目已弹出', run("game.scenes.current.interact.active") === 'choice');
    run(`(function(){
      var s2 = game.scenes.current, l = s2.interact._list.children;
      for (var i=0;i<l.length;i++)
        if (!s2.interact._remaining[i].correct) { l[i].click(); return; }
    })()`);
    await sleep(1700);   // 420ms 选错动画 + 900ms 消失延时，留足余量
    check('选错后题目消失', run("game.scenes.current.interact.active") === null,
      'active=' + run("game.scenes.current.interact.active"));
    check('选错后回到观察', run("game.scenes.current.gaze.phase") === 'gaze',
      'phase=' + run("game.scenes.current.gaze.phase"));
    check('选错后再给 ≈10 秒',
      run("game.scenes.current.gaze.remaining") > 9.0 &&
      run("game.scenes.current.gaze.remaining") <= 10.0,
      'remaining=' + run("game.scenes.current.gaze.remaining").toFixed(2));

    /* ④ 选对：必须跳到视频6 */
    console.log('\n--- 选对：跳转视频6 ---');
    run(`(function(){
      var s2 = game.scenes.current, cfg = LEVEL1.boardGaze;
      s2.gaze.pause();
      s2.interact.showChoice(
        { question: cfg.question,
          options: cfg.options.map(function(t,i){
            return {id:'f'+i, text:t, correct: t===cfg.answer}; }) },
        function(){
          if (s2.gaze) { s2.gaze.stop(); s2.gaze = null; }
          s2.interact.clear();
          s2._next();                 // ★ 本次修复的关键行
        },
        { removeAfterWrong: false });
    })()`);
    await sleep(100);
    run(`(function(){
      var s2 = game.scenes.current, l = s2.interact._list.children;
      for (var i=0;i<l.length;i++)
        if (s2.interact._remaining[i].correct) { l[i].click(); return; }
    })()`);
    await sleep(700);
    check('选对后推进到 step9（seg7）', run('game.scenes.current.stepIndex') === 9,
      'stepIndex=' + run('game.scenes.current.stepIndex'));
    check('选对后 gaze 已清理', run('game.scenes.current.gaze') === null);
    check('seg7 已开始加载', run('game.scenes.current._loadCount[7]') === 1,
      'loadCount[7]=' + run('game.scenes.current._loadCount[7]'));

    /* ================= ⑧ 全局：竖屏 / 跳过 / 音量 ================= */
    console.log('\n=== ⑧ 全局：竖屏 / 跳过 / 音量 ===');
    check('竖屏遮罩元素存在', run("!!game.scenes.current.rotateEl"));
    check('跳过按钮存在', run("!!game.scenes.current.btnSkip"));
    check('跳过按钮文案', run("game.scenes.current.btnSkip.textContent") === run('LEVEL1.ui.skip'));

    run("game.audio.setMuted(true)");
    await sleep(30);
    check('静音 → 视频静音', run('game.scenes.current.videoEl.muted') === true);
    run("game.audio.setMuted(false)");
    await sleep(30);
    check('取消静音 → 视频有声', run('game.scenes.current.videoEl.muted') === false);

    check('结束文案已定义',
      run('LEVEL1.end.title') === '本章结束' && !!run('LEVEL1.end.text'));

    /* ================= ⑨ 无运行时报错 ================= */
    console.log('\n=== ⑨ 渲染与推进无异常 ===');
    let err = null;
    try {
      for (let i = 0; i < TL.length; i++) {
        run(`game.scenes.current.stepIndex = ${i};
             game.scenes.current._curStep = LEVEL1.timeline[${i}];
             if (game.scenes.current.render) game.scenes.current.render(game.ctx);`);
      }
    } catch (e) { err = e.message; }
    check('各步骤渲染无异常', !err, err || '');

    console.log('\n' + (errors.length ? '✗ 失败 ' + errors.length + ' 项：' + errors.join(' / ')
                                      : '✓ 全部检查通过'));
    process.exit(errors.length ? 1 : 0);

    async function go(nm, params) {
      for (let i = 0; i < 12; i++) {
        run(`game.scenes.go('${nm}', ${params || '{}'}, false)`);
        await sleep(260);
        if (name() === nm) return true;
      }
      return false;
    }
    /**
     * ★ 点击信息卡的「开始」按钮。
     *   注意桩件的 querySelector 只搜**直接子节点**且按 class 匹配，
     *   而按钮在 cbox 内部、class 是 'btn btn--primary'，
     *   所以 `querySelector('button')` 找不到它（会返回一个空 div，点了没反应）。
     *   这里按 tagName 精确找，并等 420ms 的离场动画 + 视频加载。
     */
    async function startCard() {
      run(`(function(){
        var s2 = game.scenes.current;
        var box = s2.cardEl.children[0];
        var btn = null;
        (box.children || []).forEach(function(c){ if (c.tagName === 'button') btn = c; });
        if (btn) btn.click();
      })()`);
      await sleep(700);
    }
    /** 直接把流程推进到指定 step（视频加载在桩件里不真实播放，故手动指定） */
    async function forceStep(i) {
      run(`game.scenes.current.stepIndex = ${i};
           game.scenes.current._curStep = LEVEL1.timeline[${i}];
           game.scenes.current._replaying = false;
           game.scenes.current._skipUsed = {};`);
      await sleep(30);
    }
  })();
})();
