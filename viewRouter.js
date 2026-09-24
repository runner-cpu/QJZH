/* Six-view hash router for the single-page dashboard. */
(function (root) {
  "use strict";

  var q = root.QJZH = root.QJZH || {};
  var VIEW_ORDER = ["overview", "data", "algorithm", "decision", "institution", "report"];
  var NEXT_VIEW = { overview: "data", data: "algorithm", algorithm: "decision" };
  var LABELS = {
    overview: ["nav.overview", "总览"],
    data: ["nav.data", "数据接入"],
    algorithm: ["nav.algorithm", "高原校准"],
    decision: ["nav.decision", "智能决策"],
    institution: ["nav.institution", "机构版"],
    report: ["nav.report", "环境报告"]
  };

  function translate(key, fallback, values) {
    return q.translate ? q.translate(key, fallback, values || {}) : fallback.replace(/\{(\w+)\}/g, function (match, name) { return values && values[name] != null ? values[name] : match; });
  }

  function current() {
    var hash = String(root.location && root.location.hash || "").replace(/^#\/?/, "").split(/[?&]/)[0];
    return VIEW_ORDER.indexOf(hash) >= 0 ? hash : "overview";
  }

  function updateNext(view) {
    var button = root.document.getElementById("pipelineNext");
    if (!button) return;
    var nextView = NEXT_VIEW[view] || "";
    button.hidden = !nextView;
    button.dataset.goto = nextView;
    button.textContent = nextView ? translate("nav.next", "下一步：{label}", { label: translate(LABELS[nextView][0], LABELS[nextView][1]) }) : "";
  }

  function apply() {
    var view = current();
    root.document.querySelectorAll(".view").forEach(function (element) {
      var active = element.dataset.view === view;
      element.classList.toggle("active", active);
      element.hidden = !active;
    });
    root.document.querySelectorAll(".qjzh-main-nav .nav-link").forEach(function (link) {
      var active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    root.document.querySelectorAll(".pipeline-step[data-goto]").forEach(function (step) {
      step.classList.toggle("active", step.dataset.goto === view);
    });
    var institutionPanel = root.document.getElementById("institutionView");
    if (institutionPanel) institutionPanel.classList.toggle("active", view === "institution");
    if (root.document.body) root.document.body.dataset.view = view;
    updateNext(view);
    if (view === "institution" && q.institutionView && q.institutionView.render) q.institutionView.render();
    if (view === "data" && q.dataImport && q.dataImport.renderRecordList) q.dataImport.renderRecordList();
    if (typeof root.scrollTo === "function") root.scrollTo(0, 0);
    else root.document.documentElement.scrollTop = 0;
    try { root.dispatchEvent(new CustomEvent("qjzh:view-change", { detail: { view: view } })); } catch (_) {}
    return view;
  }

  function go(view) {
    var target = VIEW_ORDER.indexOf(view) >= 0 ? view : "overview";
    var hash = "#/" + target;
    if (root.location.hash === hash) apply();
    else root.location.hash = hash;
    return target;
  }

  function mountViews() {
    if (!root.document.querySelector) return;
    var source = root.document.getElementById("qjzhViewSource");
    if (!source) return;
    function move(mountId, selectors) {
      var mount = root.document.getElementById(mountId);
      if (!mount) return;
      selectors.forEach(function (selector) { var node = source.querySelector(selector); if (node) mount.appendChild(node); });
    }
    move("overviewMount", [".sensor-grid", "#trendPanel", "#recordsPanel"]);
    move("algorithmMount", ["#calibrationPanel", "#algorithmPanel"]);
    move("decisionMount", ["#decisionPanel", "#decision-result", ".advice-history"]);
    move("decisionSideMount", ["#recommendationPanel", "#reasoningPanel", ".knowledge-catalog"]);
    source.remove();
  }

  mountViews();
  root.addEventListener("hashchange", apply);
  root.addEventListener("dashboard:language-change", apply);
  root.document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-goto]") : null;
    if (!target || !target.dataset.goto) return;
    if (target.tagName !== "A") event.preventDefault();
    go(target.dataset.goto);
  });
  root.document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var target = event.target && event.target.closest ? event.target.closest(".pipeline-step[data-goto]") : null;
    if (!target) return;
    event.preventDefault();
    go(target.dataset.goto);
  });
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", apply);
  else apply();

  q.viewRouter = { VIEW_ORDER: VIEW_ORDER.slice(), current: current, apply: apply, go: go, mountViews: mountViews };
})(window);
