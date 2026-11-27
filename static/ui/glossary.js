/* 实证学徒 · 术语速查（glossary tooltip）
   做法：在教学内容容器中自动识别核心术语，hover/点击弹出速查卡。
   文案与课程手册口径一致；桌面 hover、触屏点击；无 JS 依赖降级为普通文本。
*/
(function () {
  "use strict";
  var TERMS = [
    { k: "双重差分", def: "也叫 DID：用「试点组的变化」减去「对照组的变化」，估计政策的因果效果。前提是政策前两组趋势相似（平行趋势）。" },
    { k: "平行趋势", def: "DID 的关键假设：没有政策时，试点组与对照组的变化趋势应当一致。用政策前各期的系数来检查。" },
    { k: "反事实", def: "「如果没有政策会怎样」的对照情形。DID 用对照组的变化来近似它，两者之差就是政策效果。" },
    { k: "固定效应", def: "控制掉不随时间变化、又难以观察的组别差异，让比较集中在组内随时间的变化上。" },
    { k: "聚类标准误", def: "同一组内的观测彼此相关时，把标准误按组聚类，避免把系数误判为显著。" },
    { k: "安慰剂检验", def: "把政策换到不该有效的假时间或假组上重新估计；如果还能「显著」，说明原结果可疑。" },
    { k: "回归系数", def: "解释变量每变化一个单位，结果变量的平均变化量。显著性与经济含义要分开看。" },
    { k: "普通最小二乘", def: "也叫 OLS：用最小化残差平方和的方式拟合一条直线，是回归分析的基础方法。" },
    { k: "显著性", def: "用 p 值或 t 值判断系数是否可能只是抽样波动。显著不等于重要。" },
    { k: "标准误", def: "系数估计的不确定性度量。样本越少、波动越大，标准误越大。" },
  ];
  var CONTAINERS = ".coach-center,.prose,.concept-card,.lesson-goal,.feedback,.practice-note,.coach-message,.coach-current-operation,.course-card";
  var SKIP = "SCRIPT,STYLE,A,BUTTON,CODE,PRE,INPUT,SELECT,TEXTAREA,.ea-term,.course-state,.btn,.course-resume";
  var tip = null;

  function makeTip() {
    tip = document.createElement("div");
    tip.id = "ea-glossary-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);
  }

  function showTip(term, anchor) {
    if (!tip) makeTip();
    tip.innerHTML = "<strong>" + term.k + "</strong><span>" + term.def + "</span>";
    tip.hidden = false;
    var r = anchor.getBoundingClientRect();
    var tw = 300;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 12);
    tip.style.left = left + "px";
    tip.style.width = tw + "px";
    var top = r.bottom + 8;
    var est = tip.offsetHeight || 90;
    if (top + est > window.innerHeight - 12) top = r.top - est - 8;
    if (top < 12) top = r.bottom + 8;
    tip.style.top = top + "px";
  }

  function hideTip() { if (tip) tip.hidden = true; }

  function scan(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        for (var i = 0; i < TERMS.length; i++) if (n.nodeValue.indexOf(TERMS[i].k) !== -1) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      },
    });
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var text = node.nodeValue;
      var last = 0;
      var matched = null, idx = -1, best = -1;
      while (true) {
        matched = null; best = -1;
        for (var i = 0; i < TERMS.length; i++) {
          idx = text.indexOf(TERMS[i].k, last);
          if (idx !== -1 && (best === -1 || idx < best)) { best = idx; matched = TERMS[i]; }
        }
        if (!matched) break;
        if (best > last) frag.appendChild(document.createTextNode(text.slice(last, best)));
        var span = document.createElement("span");
        span.className = "ea-term";
        span.textContent = matched.k;
        span.setAttribute("tabindex", "0");
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", matched.k + "：术语速查");
        span.addEventListener("mouseenter", function (t, a) { return function () { showTip(t, a); }; }(matched, span));
        span.addEventListener("mouseleave", hideTip);
        span.addEventListener("focus", function (t, a) { return function () { showTip(t, a); }; }(matched, span));
        span.addEventListener("blur", hideTip);
        span.addEventListener("click", function (t, a) { return function (ev) { ev.stopPropagation(); tip && !tip.hidden ? hideTip() : showTip(t, a); }; }(matched, span));
        frag.appendChild(span);
        last = best + matched.k.length;
      }
      if (last === 0) return;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
    if (tip && !document.body.contains(tip)) tip = null;
  }

  function scanAll() {
    document.querySelectorAll(CONTAINERS).forEach(function (el) { scan(el); });
    if (tip) document.body.appendChild(tip);
  }

  document.addEventListener("click", function (ev) { if (tip && !tip.hidden && !ev.target.closest(".ea-term") && !ev.target.closest("#ea-glossary-tip")) hideTip(); });
  document.addEventListener("scroll", hideTip, true);
  window.addEventListener("resize", hideTip);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scanAll);
  else scanAll();
  var pending = null;
  new MutationObserver(function () {
    if (pending) return;
    pending = setTimeout(function () { pending = null; scanAll(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
