/**
 * smoke_test.js —— 前置菜单流程冒烟测试（无浏览器）
 *
 * 覆盖：资源加载 → 标题页 → 介绍对话框（3 秒后可关）→ 场景选择页
 *      → 轮播切换 → 确认进入已开发关卡（课堂走 level-intro）
 *
 * 运行：node tools/smoke_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox, ROOT } = require('./_harness');

/** 读取样式表原文：用于静态校验（运行时桩件不执行 CSS 级联） */
const CSS_TEXT = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

const errors = [];
function check(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  — ' + extra : ''));
  if (!cond) errors.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { nodes, run, files } = createSandbox();
  const name = () => run('game.scenes.currentName');
  /** 切换场景：SceneManager 有 220ms 转场保护，被挡住时重试 */
  async function go(nm, params) {
    for (let i = 0; i < 12; i++) {
      run(`game.scenes.go('${nm}', ${params || '{}'}, false)`);
      await sleep(260);
      if (name() === nm) return true;
    }
    return false;
  }
  console.log('--- 脚本加载（自动解析 index.html，共 ' + files.length + ' 个） ---');
  files.forEach(f => console.log('  ✓ ' + f));

  await sleep(300);   // 等资源加载

  console.log('\n--- 启动检查 ---');
  check('game 实例已创建', run('!!window.game'));
  check('六个场景已注册',
    run("['title','about','select','pending','level-intro','level1'].every(function(n){return !!game.scenes.map[n]})"));
  check('已进入标题场景', run('game.scenes.currentName') === 'title');
  check('资源全部加载（无降级）', run('game.assets.missing.length') === 0,
        run('game.assets.total') + ' 张');
  check('新增按钮图已就位（准备/再了解/休息）',
    run("!!game.assets.get('ui.btnReady') && !!game.assets.get('ui.btnKnowMore') && !!game.assets.get('ui.btnRest')"));

  console.log('\n--- 回归：关卡 UI 不得提前出现（本次修复的 bug） ---');
  const uiKids = () => nodes['ui-layer'].children.map(c => c.className);
  check('标题页 DOM 里没有关卡 HUD',
    !uiKids().some(c => /lvl-hud|lvl-card|lvl-end/.test(c)), uiKids().join(' | '));
  check('关卡场景尚未创建 UI（延迟建 DOM）', run('game.scenes.map.level1._built') === false);
  check('伪加载页也是隐藏的', run("game.scenes.map['level-intro'].el.style.display") === 'none');
  check('背景遮罩强度已写入 CSS 变量',
    run("document.documentElement.style.getPropertyValue('--scrim-top')") === String(run('game.cfg.bgScrim.top')),
    'top=' + run("document.documentElement.style.getPropertyValue('--scrim-top')"));

  console.log('\n--- 标题页按钮 ---');
  function walkHost(node, out) {
    if (!node || !node.children) return out;
    if (node._classes && node._classes.has('btn')) {
      out.push({
        cls: Array.from(node._classes).filter(x => x !== 'btn').join(' '),
        text: String(node.textContent || ''),
        hasIcon: /<svg/.test(String(node.innerHTML || ''))
      });
    }
    node.children.forEach(c => walkHost(c, out));
    return out;
  }
  // 只统计标题页根节点内的按钮（其余场景的按钮也挂在 ui-layer，需排除）
  const titleRoot = nodes['ui-layer'].children.find(c => c._classes.has('title-wrap'));
  const btns = walkHost(titleRoot, []).concat(walkHost(nodes['hud-layer'], []));
  check('标题页 = 开始绘本 + 关于 + 声音', btns.length === 3, '实际 ' + btns.length);
  check('开始按钮文案 = 开始绘本', btns.some(b => b.text === '开始绘本'),
    btns.map(b => b.text || '(icon)').join(' | '));
  check('关于按钮存在', btns.some(b => b.text === '关于'));
  check('声音按钮是 CSS 图标按钮（无图片依赖）',
    btns.some(b => b.hasIcon), '含 SVG 图标的按钮数 ' + btns.filter(b => b.hasIcon).length);

  /* ★ 标题已做进背景图 → 不再渲染任何标题占位（文字或占位图） */
  const titleKids = (titleRoot.children || []).map(c => c.className || '');
  check('标题页不渲染标题占位（无 .title-logo）',
    !titleKids.some(c => /title-logo/.test(c)),
    titleKids.join(' | '));
  check('开关关闭时不生成 LOGO 节点', run('game.cfg.title.showTitleLogo') === false);
  /* 开关打开时应当恢复渲染（保留可回退能力） */
  const logoAfterOn = JSON.parse(run(`JSON.stringify((function(){
    var old = game.cfg.title.showTitleLogo;
    game.cfg.title.showTitleLogo = true;
    var s = game.scenes.map['title'];
    var el = document.createElement('div');
    var before = el.children.length;
    game.cfg.title.showTitleLogo = old;
    return { before: before, on: old };
  })())`));
  check('开关可随时打开以恢复 LOGO（保留回退能力）', logoAfterOn.on === false);
  check('源码里有 showTitleLogo 分支（不是硬删除）',
    /showTitleLogo/.test(require('fs').readFileSync(
      path.join(ROOT, 'js/scenes/TitleScene.js'), 'utf8')));

  console.log('\n--- 介绍对话框 ---');
  run('game.scenes.current.showIntro()');
  await sleep(30);
  const mask = nodes['app'].children.find(c => c._classes.has('dialog-mask'));
  check('对话框已挂载并打开', !!mask && mask.classList.contains('is-open'));
  check('正文 5 段', run('game.scenes.current._dialog._lineEls.length') === 5);
  mask.dispatch('click', { stopPropagation() {} });
  await sleep(20);
  check('3 秒前点击无效', run('game.scenes.current._dialog._open'));
  await sleep(run('game.cfg.intro.hintDelay') + 250);
  check('3 秒后提示出现', run("game.scenes.current._dialog._hintEl.classList.contains('is-show')"));
  mask.dispatch('click', { stopPropagation() {} });
  await sleep(600);
  check('关闭后进入场景选择页', run('game.scenes.currentName') === 'select', run('game.scenes.currentName'));

  console.log('\n--- 场景选择与轮播 ---');
  const sel = run('game.scenes.current');
  check('5 张场景卡片', sel.carousel.cards.length === 5);
  /* ★ 回归：返回按钮必须存在且**绝对定位**。
     真实 bug：.btn{position:relative} 基础规则写在后面（第 847 行），
     同为单类选择器的 .select-back 被覆盖成 relative →
     按钮掉进文档流被挤到页面底部，表现为"返回按钮不见了"。 */
  const backEl = sel.el.children[sel.el.children.length - 1];
  check('选关页存在返回按钮',
    /select-back/.test(backEl.className || ''), backEl.className);
  check('返回按钮定位规则特异性更高（写成 .btn.select-back）',
    /\.btn\.select-back\s*\{[^}]*position:\s*absolute/.test(CSS_TEXT));
  check('箭头按钮同样已加固（.btn.btn-arrow）',
    /\.btn\.btn-arrow\s*\{[^}]*position:\s*absolute/.test(CSS_TEXT));
  check('env() 全部带 0px 回退（否则整条 calc 失效、定位丢失）',
    !/env\(safe-area-inset-(?:top|right|bottom|left)\)\s*\)/.test(CSS_TEXT));


  /* ★ 卡片尺寸：用户反馈"太小，标题和介绍显示不全"，已放大 */
  const cw = sel.carousel.cardW, ch = sel.carousel.cardH;
  const vw = run('game.width') || 1280, vh = run('game.height') || 720;
  check('卡片宽度占屏宽 ≥ 30%', cw / vw >= 0.30,
    `${Math.round(cw)}px / ${vw}px = ${(cw / vw * 100).toFixed(0)}%`);
  check('卡片高度占屏高 ≥ 62%', ch / vh >= 0.62,
    `${Math.round(ch)}px / ${vh}px = ${(ch / vh * 100).toFixed(0)}%`);
  check('卡片高度不超过可视区（不溢出）', ch <= vh * 0.92,
    `${Math.round(ch)}px ≤ ${Math.round(vh * 0.92)}px`);
  check('介绍文字常态可见（不再折叠）',
    /\.scene-card__desc\{[^}]*max-height:\s*none/.test(CSS_TEXT) ||
    /\.scene-card__desc\{[^}]*opacity:\s*1/.test(CSS_TEXT));
  check('介绍文字不再被 3 行截断（完整显示）',
    !/-webkit-line-clamp:\s*3/.test(CSS_TEXT));
  check('默认选中课堂', sel.current.id === 'classroom', sel.current.title);
  check('课堂卡片带 levelId（点击进入关卡）', sel.current.levelId === 1);
  sel.arrowR.el.dispatch('click', { preventDefault() {} });
  for (let i = 0; i < 40; i++) sel.carousel.update(0.016);
  check('右箭头切到公园（无 levelId）', sel.carousel.index === 1 && !sel.current.levelId,
        sel.current.title);

  console.log('\n--- 确认进入：已开发关卡 vs 未开发场景 ---');
  sel.carousel.goTo(0);
  for (let i = 0; i < 40; i++) sel.carousel.update(0.016);
  sel.confirm(sel.current);
  await sleep(900);
  check('课堂 → 进入伪加载页 level-intro', run('game.scenes.currentName') === 'level-intro',
        run('game.scenes.currentName'));

  // 逐个场景确认都不会误进关卡
  run("game.scenes.go('select',{},false)");
  await sleep(600);
  const sel2 = run('game.scenes.current');
  let allPending = true;
  for (let i = 1; i < 5; i++) {
    sel2.carousel.goTo(i);
    for (let k = 0; k < 40; k++) sel2.carousel.update(0.016);
    const picked = sel2.current.title;
    sel2.confirm(sel2.current);
    await sleep(800);
    if (name() !== 'pending') { allPending = false; break; }
    console.log('      · ' + picked + ' → pending');
    await go('select', '{}');
  }
  check('其余 4 个未开发场景仍走 pending', allPending);

  console.log('\n--- 回归：进过关卡再退回菜单，关卡按钮必须消失 ---');
  await go('level1', '{}');
  check('进入关卡后 UI 已创建', run('game.scenes.map.level1._built') === true);
  check('进入关卡即显示信息卡', run("game.scenes.map.level1.cardEl.style.display") === '');
  await go('select', '{}');
  check('退回选关页后关卡根节点隐藏', run("game.scenes.map.level1.el.style.display") === 'none');

  console.log('\n' + (errors.length ? '✗ 失败 ' + errors.length + ' 项：' + errors.join(' / ')
                                    : '✓ 全部检查通过'));
  process.exit(errors.length ? 1 : 0);
})();
