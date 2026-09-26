/**
 * Bind the independently loaded highland compensation model to the demo panel.
 * @returns {void}
 */
(function () {
  "use strict";
  window.QJZH = window.QJZH || {};
  function updateDocumentTitle() {
    var titles = {
      zh: "青境智衡 · 高原圈舍环境数据服务系统",
      en: "Qingjing Zhiheng · Plateau Barn Environment Data Service",
      bo: "ཆིངས་ཅིང་ཀྲི་ཧེང་ · མཐོ་སྒང་ཁོར་ཡུག་གཞི་གྲངས་ཞབས་ཞུ"
    };
    document.title = titles[document.documentElement.dataset.language] || titles.zh;
  }
  updateDocumentTitle();
  window.addEventListener("dashboard:language-change", function () {
    updateDocumentTitle();
    renderRecommendationPanel();
  });
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]; }); }
  function translate(key, fallback, values) { return window.QJZH.translate ? window.QJZH.translate(key, fallback, values || {}) : fallback; }
  window.QJZH.calibrate = function (input) {
    input = input || {};
    var raw = Number(input.raw_nh3_ppm ?? input.raw ?? 0);
    var corrected = typeof window.compensate === "function" ? Number(window.compensate(Number(input.altitude_m), Number(input.temp_c), Number(input.rh_percent), raw)) : raw;
    var validation = window.QJZH.dataImport?.validate(input);
    return { calibrated_nh3_ppm: corrected, error_range: validation?.quality === "A" ? "±0.71%" : validation?.quality === "B" ? "±5%" : translate("qjzh.data.notEvaluated", "未评估"), confidence: validation?.confidence || translate("qjzh.confidence.levelLow", "低") };
  };
  window.QJZH.advise = function (input) {
    var n = Number(input?.calibrated_nh3_ppm || 0);
    var level = n >= 20 ? "紧急" : n >= 15 ? "待办" : n >= 10 ? "关注" : "正常";
    return { risk_level: level, ventilation_window: "12:00-14:00", duration_min: n >= 20 ? 15 : n >= 10 ? 8 : 0, suggestions: n >= 20 ? ["建议立即组织通风", "清粪并复测"] : n >= 10 ? ["建议短时通风", "检查北侧风口"] : ["保持日常巡检"], rule_id: n >= 20 ? "KB-NH3-CRITICAL" : n >= 10 ? "KB-NH3-WATCH" : "KB-NH3-NORMAL", standard: "NY/T 388-1999" };
  };

  // The legacy demo still owns the actuator DOM ids. Keep those ids for model compatibility,
  // but project only recommendation semantics into the visible panel.
  function renderRecommendationPanel() {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
    var panel = document.querySelector(".actuator-panel");
    if (!panel) return;
    var corrected = Number((document.getElementById("correctedAmmoniaValue") || {}).textContent?.replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(corrected)) corrected = Number((document.getElementById("ringValue") || {}).textContent);
    if (!Number.isFinite(corrected)) corrected = 0;
    var recommendation = window.QJZH.advise({ calibrated_nh3_ppm: corrected });
    var text = window.QJZH.text || function (key) { return key; };
    var levelKey = { 正常: "normal", 关注: "watch", 待办: "todo", 紧急: "emergency" }[recommendation.risk_level] || "normal";
    var levelColor = recommendation.risk_level === "紧急" ? "#ff4d5e" : recommendation.risk_level === "待办" ? "#ff9f43" : recommendation.risk_level === "关注" ? "#ffd93d" : "#00d4aa";
    var names = panel.querySelectorAll(".actuator-name");
    var descs = panel.querySelectorAll(".actuator-desc");
    var status = panel.querySelectorAll(".state-badge span:last-child");
    var expectedStatus = text(levelKey);
    var mapAdvice = window.QJZH.mapAdvice || function (value) { return value; };
    var rawAdvice = mapAdvice(recommendation.suggestions.join("；"));
    var expectedAdvice = translate("recommendation.suggestion." + levelKey, rawAdvice);
    var setText = function (node, value) { if (node && node.textContent !== value) node.textContent = value; };
    setText(names[0], translate("recommendation.riskName", "风险等级"));
    setText(descs[0], translate("recommendation.riskDesc", "基于校准氨气与本地知识库规则"));
    setText(names[1], translate("recommendation.actionName", "处置建议"));
    setText(descs[1], translate("recommendation.actionDesc", "系统仅输出建议，执行由养殖户既有设备或人工完成"));
    setText(status[0], expectedStatus);
    setText(status[1], expectedAdvice);
    var dots = panel.querySelectorAll(".state-dot");
    dots.forEach(function (dot) { if (dot.style.getPropertyValue("--state-color") !== levelColor) dot.style.setProperty("--state-color", levelColor); });
    var icon = document.getElementById("fanIcon");
    if (icon) icon.classList.remove("spin");
    var command = document.getElementById("commandText");
    setText(command, translate("recommendation.command", "建议：{advice}（窗口 {window}）", { advice: expectedAdvice, window: recommendation.ventilation_window }));
    var alarms = document.getElementById("alarmList");
    var alarmText = translate("recommendation.trace", "建议溯源：{rule} · {standard}", { rule: recommendation.rule_id, standard: recommendation.standard });
    if (alarms && alarms.textContent.trim() !== alarmText) alarms.innerHTML = "<div class=\"alarm-item\"><i class=\"alarm-dot\" style=\"--alarm-color:" + levelColor + ";\"></i><span>" + esc(alarmText) + "</span></div>";
    var vent = document.getElementById("ventAdvice");
    setText(vent, translate("recommendation.noHardware", "{advice}。系统不向风机或其他硬件下发控制指令。", { advice: expectedAdvice }));
    var flow = document.getElementById("flowExecute");
    setText(flow, translate("recommendation.output", "建议输出：{level}", { level: expectedStatus }));
  }

  /** Update displayed values for the altitude, temperature, and humidity sliders. @returns {void} */
  function updateDemoLabels() {
    document.getElementById("demoAltitudeOut").value = `${document.getElementById("demoAltitude").value} m`;
    document.getElementById("demoTempOut").value = `${document.getElementById("demoTemp").value} C`;
    document.getElementById("demoRhOut").value = `${document.getElementById("demoRh").value} %RH`;
  }

  /** Generate an in-range simulated raw reading and display its compensated ppm value. @returns {void} */
  function runAlgorithmDemo() {
    const altitude = Number(document.getElementById("demoAltitude").value);
    const temperature = Number(document.getElementById("demoTemp").value);
    const humidity = Number(document.getElementById("demoRh").value);
    const simulatedTruePpm = 3 + Math.random() * 24;
    const rawPpm = window.simulateHighlandRaw(simulatedTruePpm, altitude, temperature, humidity);
    const correctedPpm = window.compensate(altitude, temperature, humidity, rawPpm);
    document.getElementById("demoRaw").textContent = `${rawPpm.toFixed(2)} ppm`;
    document.getElementById("demoCorrected").textContent = `${correctedPpm.toFixed(2)} ppm`;
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderRecommendationPanel();
    var recommendationPanel = document.querySelector(".actuator-panel");
    if (recommendationPanel && window.MutationObserver) {
      var observerOptions = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] };
      var observer = new MutationObserver(function () {
        observer.disconnect();
        renderRecommendationPanel();
        observer.observe(recommendationPanel, observerOptions);
      });
      observer.observe(recommendationPanel, observerOptions);
    }
    document.getElementById("modelVersion").textContent = window.MODEL_WEIGHTS.version;
    ["demoAltitude", "demoTemp", "demoRh"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateDemoLabels);
    });
    document.getElementById("demoSimulate").addEventListener("click", runAlgorithmDemo);
    updateDemoLabels();

    var banner = document.getElementById("boundaryBanner");
    document.getElementById("dismissBoundary")?.addEventListener("click", function () { if (banner) banner.hidden = true; });
    var form = document.getElementById("manualDataForm");
    form?.addEventListener("submit", function (event) {
      event.preventDefault();
      var record = Object.fromEntries(new FormData(form).entries());
      record.timestamp = new Date().toISOString();
      record.altitude_m = Number(record.altitude_m); record.temp_c = Number(record.temp_c);
      record.rh_percent = Number(record.rh_percent); record.raw_nh3_ppm = Number(record.raw_nh3_ppm);
      var result = window.QJZH?.dataImport?.validateManual(record);
      var status = document.getElementById("dataImportStatus");
      var badge = document.getElementById("dataQualityBadge");
      if (status) { status.className = "qjzh-data-state qjzh-state-" + (result?.level || "error"); status.textContent = result?.issues?.length ? result.issues.join("；") : translate("qjzh.data.manualSaved", "数据已接入并保存"); }
      if (badge && result) badge.textContent = translate("qjzh.data.quality", "数据质量 {quality} · 置信度 {confidence}", { quality: result.quality, confidence: result.confidence });
      window.QJZH?.dataImport?.updateConfidence?.(result);
      if (result?.valid) window.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: { records: [record], errors: [], warnings: [] } }));
    });
    document.getElementById("loadDemoSimulation")?.addEventListener("click", function () {
      document.getElementById("loadSampleData")?.click();
      document.getElementById("dataImportStatus").textContent = translate("qjzh.data.demoReplay", "青海冬季示例已导入，主看板将按单站点时间回放");
    });
    document.querySelectorAll("[data-scene]").forEach(function (button) {
      button.addEventListener("click", function () {
        var scene = button.dataset.scene;
        window.QJZH.viewRouter?.stopTour();
        if (scene === "tour") window.QJZH.viewRouter?.startTour();
        var status = document.getElementById("dataImportStatus");
        if (scene === "retail") {
          window.location.hash = "#/overview";
          document.getElementById("loadSampleData")?.click();
          if (status) { status.className = "qjzh-data-state qjzh-state-warning"; status.textContent = translate("qjzh.scene.retailStatus", "散户场景：QH-HD-001 单站点回放，校准后生成午间短时通风建议"); }
        }
        if (scene === "institution") {
          window.location.hash = "#/institution";
          window.QJZH?.institutionView?.render?.();
          if (status) { status.className = "qjzh-data-state qjzh-state"; status.textContent = translate("qjzh.scene.institutionStatus", "机构场景：5 个模拟圈舍按校准氨气风险排序"); }
        }
        if (scene === "offline") {
          window.location.hash = "#/overview";
          var records = window.QJZH?.dataImport?.getRecords?.() || [];
          window.QJZH_NETWORK_STATE = { online: false, simulated: true, checkedAt: new Date().toISOString() };
          document.documentElement.dataset.network = "offline-demo";
          var probe = window.QJZH?.calibrate?.({ altitude_m: 2620, temp_c: -5, rh_percent: 62, raw_nh3_ppm: 18.6, timestamp: new Date().toISOString(), site_id: "OFFLINE-PROBE", device_model: "offline-demo" });
          var fallbackActive = window.QJZH?.activateCanvasFallback?.() === true;
          if (status) { status.className = "qjzh-data-state qjzh-state-warning"; status.textContent = translate("qjzh.scene.offlineStatus", "断网演示：本地 {count} 条记录可查看 · 校准/决策脚本正常（{ppm} ppm）· Canvas 回退{fallback}", { count: records.length, ppm: Number(probe?.calibrated_nh3_ppm || 0).toFixed(1), fallback: fallbackActive ? translate("qjzh.scene.active", "已接管") : translate("qjzh.scene.available", "可用") }); }
        }
        document.querySelector(".qjzh-scene-presets")?.classList.remove("expanded");
        document.getElementById("scenePresetToggle")?.setAttribute("aria-expanded", "false");
      });
    });
    document.getElementById("scenePresetToggle")?.addEventListener("click", function () {
      var presets = document.querySelector(".qjzh-scene-presets");
      if (!presets) return;
      var expanded = presets.classList.toggle("expanded");
      this.setAttribute("aria-expanded", String(expanded));
    });
    document.getElementById("resetDemoData")?.addEventListener("click", function () { window.QJZH.viewRouter?.stopTour(); window.location.hash = "#/overview"; window.QJZH?.demoReset?.reset?.(); });
  });
})();
