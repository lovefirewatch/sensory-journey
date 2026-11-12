/**
 * _csscheck.js —— 静态 CSS 检查：算出某个元素最终生效的属性值
 *
 * ★ 为什么需要：运行时桩件不执行 CSS 级联。像
 *     #ui-layer > *  { pointer-events: auto }   ← 特异性 (1,0,0)
 *     .lvl-hud       { pointer-events: none }   ← 特异性 (0,1,0)
 *   这种"父级通配选择器把全屏容器变成可点击、吞掉所有场景交互"的 bug，
 *   纯靠运行时断言根本测不出来，必须算特异性。
 *
 * 提供：
 *   parseRules(cssText)                 解析出 [{ selector, decls }]
 *   specificity(part)                   计算特异性 [id, class, element]
 *   matches(selector, ctx)              选择器是否命中该元素
 *   winningValue(cssText, ctx, prop)    取最终生效值
 */

'use strict';

/** 去掉注释；@media 块内的规则也一并展开（本项目只用它调字号，不影响命中判定） */
function strip(cssText) {
  return String(cssText)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{/g, '');
}

/** 解析为 [{ selector, decls: {prop: value} }] */
function parseRules(cssText) {
  const css = strip(cssText);
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.charAt(0) === '@') continue;
    const decls = {};
    m[2].split(';').forEach(d => {
      const i = d.indexOf(':');
      if (i < 0) return;
      const k = d.slice(0, i).trim();
      const v = d.slice(i + 1).trim();
      if (k) decls[k] = v;
    });
    out.push({ selector, decls });
  }
  return out;
}

/** 计算单个复合选择器（不含逗号与组合符）的特异性 [id, class, element] */
function specificity(part) {
  const ids = (part.match(/#[\w-]+/g) || []).length;
  const cls = (part.match(/\.[\w-]+/g) || []).length;
  let elem = 0;
  const stripped = part.replace(/[#.][\w-]+/g, '').replace(/[*]/g, '');
  const tags = stripped.match(/\b[a-zA-Z][\w-]*/g) || [];
  elem = tags.length;
  return [ids, cls, elem];
}

/**
 * 选择器是否命中元素
 * @param {string} selector 完整选择器（可含逗号）
 * @param {object} ctx { classes:Set|Array, id, tag, ancestors:[{id,classes,tag}] }
 */
function matches(selector, ctx) {
  const groups = String(selector).split(',').map(s => s.trim()).filter(Boolean);
  return groups.some(g => matchesGroup(g, ctx));
}

/** 拆成 [{ part, comb }]，comb 是该部件"前面"的组合符（首个为空） */
function tokenize(group) {
  const tokens = [];
  const re = /([\s>+~]*)([^>+~]+)/g;
  let m, first = true;
  while ((m = re.exec(group))) {
    const comb = (m[1] || '').trim();
    tokens.push({ part: m[2].trim(), comb: first ? '' : (comb || ' ') });
    first = false;
  }
  return tokens;
}

function matchesGroup(group, ctx) {
  const tokens = tokenize(group);
  if (!tokens.length) return false;
  // 从右往左匹配：最后一个部件必须命中元素自身
  if (!matchPart(tokens[tokens.length - 1].part, ctx)) return false;
  const chain = ctx.ancestors || [];           // 由近到远的祖先链
  let idx = 0;                                  // chain[idx] = 当前节点的父级
  for (let i = tokens.length - 2; i >= 0; i--) {
    const comb = tokens[i + 1].comb;
    if (comb === '>') {
      const parent = chain[idx];
      if (!parent || !matchPart(tokens[i].part, parent)) return false;
      idx++;
    } else {
      // 后代选择器：在往上任意一层找得到即可（本项目够用）
      let found = -1;
      for (let k = idx; k < chain.length; k++) {
        if (matchPart(tokens[i].part, chain[k])) { found = k; break; }
      }
      if (found < 0) return false;
      idx = found + 1;
    }
  }
  return true;
}

function matchPart(part, node) {
  if (!part || !node) return false;
  if (part === '*') return true;
  const classes = node.classes instanceof Set ? node.classes : new Set(node.classes || []);
  const idM = part.match(/#([\w-]+)/);
  if (idM && node.id !== idM[1]) return false;
  const clsList = part.match(/\.([\w-]+)/g) || [];
  for (const c of clsList) {
    if (!classes.has(c.slice(1))) return false;
  }
  const tagM = part.replace(/[#.][\w-]+/g, '').replace(/\*/g, '').match(/\b([a-zA-Z][\w-]*)/);
  if (tagM && node.tag && node.tag.toLowerCase() !== tagM[1].toLowerCase()) return false;
  return true;
}

/**
 * 取某属性最终生效值（同源、无 !important 简化处理）
 * @param {string} cssText
 * @param {object} ctx { classes, id, tag, ancestors }
 * @param {string} prop 属性名
 * @param {string} [fallback] 默认值
 */
function winningValue(cssText, ctx, prop, fallback) {
  const rules = parseRules(cssText);
  let best = null, bestSpec = null;
  rules.forEach(r => {
    if (r.decls[prop] === undefined) return;
    if (!matches(r.selector, ctx)) return;
    // 一个 rule 里可能有多个逗号分组，取能命中的分组里特异性最高的
    let spec = null;
    r.selector.split(',').map(s => s.trim()).filter(Boolean).forEach(g => {
      if (!matchesGroup(g, ctx)) return;
      const parts = g.split(/[\s>+~]+/).filter(Boolean);
      const s = parts.reduce((acc, p) => {
        const x = specificity(p);
        return [acc[0] + x[0], acc[1] + x[1], acc[2] + x[2]];
      }, [0, 0, 0]);
      if (!spec || cmp(s, spec) > 0) spec = s;
    });
    if (!spec) return;
    if (!bestSpec || cmp(spec, bestSpec) > 0 || (cmp(spec, bestSpec) === 0 && false)) {
      bestSpec = spec; best = r.decls[prop];
    }
  });
  return best === null ? (fallback === undefined ? '' : fallback) : best;
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}


/* ============================================================
 * 附加检查：绝对定位的按钮类是否被 .btn 基础规则覆盖
 *
 * ★ 真实 bug：.btn{position:relative} 基础规则在文件靠后位置，
 *   而 .btn-arrow / .select-back 等单类选择器（同为 0,1,0）写在它前面，
 *   会被覆盖成 position:relative → 按钮掉进文档流，被挤到页面底部"消失"。
 *   修复方式：把这类选择器写成 .btn.xxx（0,2,0）。
 * ============================================================ */
function checkBtnPosition(css) {
  const problems = [];
  const lines = css.split('\n');
  let baseLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\.btn\s*\{/.test(lines[i].trim())) { baseLine = i; break; }
  }
  if (baseLine < 0) return problems;
  // 基础规则里若含 position:relative，则检查它之前的所有按钮定位规则
  let hasRel = false;
  for (let i = baseLine; i < Math.min(baseLine + 12, lines.length); i++) {
    if (/position:\s*relative/.test(lines[i])) { hasRel = true; break; }
  }
  if (!hasRel) return problems;
  for (let i = 0; i < baseLine; i++) {
    const m = lines[i].trim().match(/^\.(btn-[a-zA-Z0-9_-]+|select-back|about-back|pending-back)\s*\{/);
    if (!m) continue;
    // 只看紧接着的块里是否有 position:absolute
    let body = '';
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      body += lines[j] + '\n';
      if (lines[j].includes('}')) break;
    }
    if (/position:\s*absolute/.test(body)) {
      problems.push(`第 ${i + 1} 行 .${m[1]} 用了 position:absolute，但写在 .btn 基础规则(第 ${baseLine + 1} 行)之前且特异性相同 → 会被覆盖成 relative。请改成 ".btn.${m[1]}"`);
    }
  }
  return problems;
}

module.exports = { parseRules, specificity, matches, winningValue, strip, checkBtnPosition };
