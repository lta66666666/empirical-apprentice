/* 实证学徒 · 全局动效层（GSAP 3.13，本地 vendor）
   原则：只做入场编排与数值滚动；仅 transform/opacity；
   prefers-reduced-motion 或无 GSAP 时完全跳过，内容保持可见。
*/
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof window.gsap === "undefined") return;

  document.documentElement.classList.add("ea-anim-ready");

  /* 入场编排：带 data-ea-rise 的元素自下而上淡入，同组交错 */
  var groups = {};
  document.querySelectorAll("[data-ea-rise]").forEach(function (el) {
    var g = el.getAttribute("data-ea-rise") || "default";
    (groups[g] = groups[g] || []).push(el);
  });
  Object.keys(groups).forEach(function (g) {
    gsap.fromTo(
      groups[g],
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.07, ease: "power2.out", delay: 0.05 }
    );
  });

  /* 数值滚动：带 data-ea-count 的元素从 0 滚到目标值（按小数位数保留） */
  document.querySelectorAll("[data-ea-count]").forEach(function (el) {
    var target = parseFloat(el.getAttribute("data-ea-count"));
    if (isNaN(target)) return;
    var decimals = (el.getAttribute("data-ea-count").split(".")[1] || "").length;
    var state = { v: 0 };
    gsap.to(state, {
      v: target,
      duration: 1.1,
      ease: "power2.out",
      onUpdate: function () {
        el.textContent = state.v.toFixed(decimals);
      },
    });
  });
})();
