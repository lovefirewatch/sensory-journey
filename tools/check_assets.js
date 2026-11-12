/**
 * check_assets.js —— 按钮图片调用链路诊断
 *
 * 逐环节检查「config 声明 → AssetLoader 加载 → ImageButton 写入 <img>」：
 *   ① config 声明的路径，磁盘上是否真的有这个文件
 *   ② 代码写法检查：是否踩了会让浏览器加载失败的坑（如 crossOrigin）
 *   ③ AssetLoader 加载结果：有没有被降级成占位图
 *   ④ 每个按钮最终写入 <img> 的 src（这是真正生效的那一行）
 *   ⑤ 源码里 A.get('...') 的 key 拼写检查
 *   ⑥ 占位图宽高比（图片缺失时布局会不会被撑变形）
 *   ⑦ 背景图 / 卡片图
 *
 * 运行：node tools/check_assets.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, ROOT } = require('./_harness');

/* ---------- ① config 声明的路径 vs 磁盘文件 ---------- */
console.log('=== ① config 声明的图片路径 vs 磁盘文件 ===');
const cfgSandbox = {};
cfgSandbox.window = cfgSandbox;
vm.createContext(cfgSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'), cfgSandbox);
const ASSETS = cfgSandbox.GAME_CONFIG.ASSETS;

let declared = 0, exists = 0;
const notFound = [];
(function walk(node, prefix) {
  for (const k in node) {
    const v = node[k];
    if (v && typeof v === 'object' && typeof v.src === 'string') {
      declared++;
      if (fs.existsSync(path.join(ROOT, v.src))) exists++;
      else notFound.push({ key: (prefix ? prefix + '.' : '') + k, src: v.src });
    } else if (v && typeof v === 'object') walk(v, (prefix ? prefix + '.' : '') + k);
  }
})(ASSETS, '');

console.log(`  声明 ${declared} 张，磁盘存在 ${exists} 张`);
if (notFound.length) {
  console.log('  ✗ 以下路径找不到文件（这是图片不显示的第一个排查点）：');
  notFound.forEach(n => console.log(`      ${n.key.padEnd(24)} → ${n.src}`));
} else {
  console.log('  ✓ 所有声明的路径都能在磁盘上找到');
}

/* ---------- ② 代码写法检查 ---------- */
console.log('\n=== ② 代码写法检查（会让浏览器加载失败的坑） ===');
const loaderSrc = fs.readFileSync(path.join(ROOT, 'js/core/AssetLoader.js'), 'utf8');
// 只扫真实代码行：块注释里提到 crossOrigin 不算
const codeLines = loaderSrc.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const hasCrossOrigin = /crossOrigin\s*=\s*['"]anonymous['"]/.test(codeLines);
console.log(`  AssetLoader 设置了 img.crossOrigin='anonymous' : ${hasCrossOrigin ? '是  ⚠' : '否  ✓'}`);
if (hasCrossOrigin) {
  console.log('    ✗ 这就是按钮图片不显示的主因：');
  console.log('      crossOrigin 会强制 CORS 检查，file:// 来源是 null（不透明来源），');
  console.log('      本地文件不返回 Access-Control-Allow-Origin → 全部 onerror。');
  console.log('      表现为：双击打开时全是占位图，用 http 服务器打开却正常。');
} else {
  console.log('    ✓ 未设置 crossOrigin，file:// 与 http 下都能正常加载');
}
console.log('\n  提示：本脚本只验证 JS 链路，浏览器实际加载行为请这样确认 ——');
console.log('    · 推荐用本地服务器：python3 -m http.server 8080');
console.log('    · F12 控制台执行 game.assets.report() 查看加载结果');

const btnSrc = fs.readFileSync(path.join(ROOT, 'js/ui/ImageButton.js'), 'utf8');
console.log(`  ImageButton 对 Image 对象取 src : ${/this\.img\.src\s*=\s*src\.src/.test(btnSrc) ? '是 ✓' : '否 ⚠'}`);

(async () => {
  await new Promise(r => setTimeout(r, 50));
  const { nodes, run } = createSandbox();
  await new Promise(r => setTimeout(r, 300));

  /* ---------- ③ 加载结果 ---------- */
  console.log('\n=== ③ AssetLoader 加载结果 ===');
  const stat = JSON.parse(run(`JSON.stringify((function(){
    var total=0, phs=[], nulls=[];
    function w(d,p){ for(var k in d){ var v=d[k];
      if(v && typeof v==='object' && !v.tagName && typeof v.src!=='string' && !(v instanceof Object && v.width!==undefined && v.naturalWidth!==undefined)){ w(v,p+k+'.'); }
      else if(v && typeof v==='object' && typeof v.src==='string'){ total++; }
      else if(v && typeof v==='object' && typeof v.toDataURL==='function'){ total++; phs.push(p+k); }
      else if(v===null||v===undefined){ total++; nulls.push(p+k); }
      else if(v && typeof v==='object'){ total++; }
    }}
    w(game.assets.images,'');
    return {total:total, phs:phs, nulls:nulls};
  })())`));
  const missCount = run('game.assets.missing.length');
  console.log(`  资源总数 ${run('game.assets.total')}，加载失败降级 ${missCount} 张，空值 ${stat.nulls.length} 个`);
  if (missCount) {
    console.log('  ⚠ 被降级成占位图（浏览器里会显示斜条纹块）：');
    JSON.parse(run('JSON.stringify(game.assets.missing.map(function(m){return m.key+" → "+m.src}))'))
      .forEach(x => console.log('      ' + x));
  } else {
    console.log('  ✓ 全部成功加载，无降级');
  }
  if (stat.nulls.length) console.log('  ✗ 值为空：' + stat.nulls.join(', '));

  /* ---------- ④ 按钮实际 src ---------- */
  console.log('\n=== ④ 按钮实际写入 <img> 的 src（真正生效的那一行） ===');
  function walkHost(node, out) {
    if (!node || !node.children) return out;
    if (node._classes && node._classes.has('img-btn')) {
      const im = node.children.find(c => c.tagName === 'img');
      out.push({
        cls: Array.from(node._classes).filter(x => x !== 'img-btn').join(' '),
        missing: node._classes.has('is-missing'),
        src: im ? String(im.src) : '(无 img 元素)'
      });
    }
    node.children.forEach(c => walkHost(c, out));
    return out;
  }
  const btns = walkHost(nodes['ui-layer'], []).concat(walkHost(nodes['hud-layer'], []));
  btns.forEach(b => {
    let flag;
    if (b.src === '(无 img 元素)') flag = '✗ 无 img';
    else if (/^data:image/.test(b.src)) flag = '⚠ 占位图(canvas)';
    else if (!b.src) flag = '✗ src 为空';
    else flag = '✓ 真实图片';
    console.log(`  ${flag.padEnd(16)} ${(b.cls || '(未命名)').padEnd(28)} ${b.src}` +
                (b.missing ? '  [is-missing]' : ''));
  });

  /* ---------- ⑤ key 拼写检查 ---------- */
  console.log('\n=== ⑤ 源码中 A.get(...) 的 key 拼写检查 ===');
  const jsFiles = [];
  (function walkDir(d) {
    fs.readdirSync(d).forEach(f => {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walkDir(p);
      else if (f.endsWith('.js')) jsFiles.push(p);
    });
  })(path.join(ROOT, 'js'));
  const keys = new Set();
  jsFiles.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    const re = /\.get\(\s*['"]([a-zA-Z]+\.[a-zA-Z0-9_]+)['"]\s*\)/g;
    while ((m = re.exec(src))) keys.add(m[1]);
    const re2 = /card:\s*['"]([a-zA-Z]+\.[a-zA-Z0-9_]+)['"]/g;
    while ((m = re2.exec(src))) keys.add(m[1]);
  });
  let bad = 0;
  Array.from(keys).sort().forEach(k => {
    const v = run(`(function(){ var v=game.assets.get('${k}'); return v?(v.toDataURL?'canvas':'image'):'NULL'; })()`);
    if (v === 'NULL') { bad++; console.log(`  ✗ ${k.padEnd(24)} → 取不到（config 里没这个 key）`); }
  });
  if (!bad) console.log(`  ✓ 全部 ${keys.size} 个 key 都能取到资源`);

  /* ---------- ⑥ 占位图比例 ---------- */
  console.log('\n=== ⑥ 占位图宽高比（图片缺失时的布局兜底） ===');
  [['ui.btnStart', '开始按钮', 3], ['ui.btnSoundOn', '声音图标', 1],
   ['ui.bgTitle', '背景图', 16 / 9], ['scenes.cardNight', '场景卡片', 0.75],
   ['ui.panelDialog', '对话框面板', 4 / 3], ['ui.btnRest', '休息按钮', 8 / 3]
  ].forEach(function (row) {
    const sz = JSON.parse(run(`JSON.stringify(inferPlaceholderSize('${row[0]}'))`));
    const ratio = sz[0] / sz[1];
    const ok = Math.abs(ratio - row[2]) < 0.05;
    console.log(`  ${ok ? '✓' : '⚠'} ${row[1].padEnd(10)} ${sz[0]}×${sz[1]}  比例 ${ratio.toFixed(2)}（期望 ${row[2].toFixed(2)}）`);
  });

  /* ---------- ⑦ 背景图与卡片图 ---------- */
  console.log('\n=== ⑦ 背景图 / 卡片图 ===');
  console.log('  #bg-layer : ' + (run(`String(document.getElementById('bg-layer').style.backgroundImage||'(空)')`)));
  JSON.parse(run(`JSON.stringify((function(){
    var sc=game.scenes.map['select']; if(!sc||!sc.carousel) return [];
    return sc.carousel.cards.map(function(c,i){ return '卡片'+(i+1)+' : '+String(c.inner.children[1].style.backgroundImage||'(空)'); });
  })())`)).forEach(x => console.log('  ' + x));

  /* ★ 必须显式退出：主循环持续用 requestAnimationFrame 派发定时器，
     不 process.exit 的话 Node 进程永远不结束（表现为脚本"卡住"）。 */
  process.exit(0);
})();
