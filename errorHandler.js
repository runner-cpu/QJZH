/* QJZH shared data-panel state and error helpers. Dependency-free and DOM-safe. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var api = q.errorHandler = q.errorHandler || {};
  var labels = { empty: "尚未接入数据，请上传 CSV 或手动录入", loading: "正在加载数据…", error: "数据加载失败", warning: "数据存在警告" };
  api.labels = labels;
  api.make = function (state, message, details) { return { state: state, message: message || labels[state] || "", details: details || [], timestamp: new Date().toISOString() }; };
  api.empty = function (message) { return api.make("empty", message); };
  api.loading = function (message) { return api.make("loading", message); };
  api.error = function (message, details) { return api.make("error", message, details); };
  api.warning = function (message, details) { return api.make("warning", message, details); };
  api.render = function (target, status, options) {
    options = options || {};
    var element = typeof target === "string" && root.document ? root.document.querySelector(target) : target;
    var value = typeof status === "string" ? api.make(status) : (status || api.empty());
    if (!element) return value;
    element.textContent = "";
    element.className = (options.className || "qjzh-data-state") + " qjzh-state-" + value.state;
    element.setAttribute("role", value.state === "error" ? "alert" : "status");
    var text = root.document.createElement("span"); text.textContent = value.message; element.appendChild(text);
    if (value.details && value.details.length) {
      var details = root.document.createElement("details"); var summary = root.document.createElement("summary");
      summary.textContent = options.detailsLabel || "查看详情"; details.appendChild(summary);
      var list = root.document.createElement("ul"); value.details.forEach(function (item) { var li = root.document.createElement("li"); li.textContent = typeof item === "string" ? item : JSON.stringify(item); list.appendChild(li); });
      details.appendChild(list); element.appendChild(details);
    }
    if (options.retry && (value.state === "error" || value.state === "warning")) { var button = root.document.createElement("button"); button.type = "button"; button.textContent = options.retryLabel || "重试"; button.addEventListener("click", options.retry); element.appendChild(button); }
    return value;
  };
  api.setState = api.render;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
