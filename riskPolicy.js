/* Shared display policy for calibrated ammonia risk. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};

  function classifyNh3(value) {
    var nh3 = Number(value);
    if (!Number.isFinite(nh3)) return { code: "unknown", label: "未评估", urgency: "unknown", color: "#829a96" };
    if (nh3 > 15) return { code: "urgent", label: "紧急", urgency: "critical", color: "#d94f5c" };
    if (nh3 >= 10) return { code: "watch", label: "关注", urgency: "warning", color: "#d6a93d" };
    return { code: "normal", label: "正常", urgency: "normal", color: "#159b7d" };
  }

  q.riskPolicy = {
    thresholds: { comfortUpperExclusive: 10, watchUpperInclusive: 15 },
    classifyNh3: classifyNh3
  };
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
