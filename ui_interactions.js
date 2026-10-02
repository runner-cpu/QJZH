/**
 * Bind the independently loaded highland compensation model to the demo panel.
 * @returns {void}
 */
(function () {
  "use strict";
  window.QJZH = window.QJZH || {};
  // Stable presentation-only randomness keeps repeated demos reproducible without
  // touching the compensation model or any decision-engine inputs. FNV-1a is
  // deliberately small, synchronous, and available in browsers without crypto.
  if (typeof window.QJZH.presentationSeed !== "function") {
    window.QJZH.presentationSeed = function (key, salt) {
      var input = String(key == null ? "" : key) + "\u001f" + String(salt == null ? "" : salt);
      var hash = 2166136261;
      for (var index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0) / 4294967296;
    };
  }
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
    window.QJZH.refreshDynamicLanguage?.();
    renderRecommendationPanel();
  });
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"'=]/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;", "=": "&#61;" }[character]; }); }
  var SAFE_COLORS = Object.freeze({ normal: "#00d4aa", watch: "#ffd93d", todo: "#ff9f43", emergency: "#ff4d5e" });
  function safeColor(value, fallback) {
    var candidate = String(value || "").toLowerCase();
    var allowed = Object.keys(SAFE_COLORS).map(function (key) { return SAFE_COLORS[key]; });
    var matched = allowed.indexOf(candidate) >= 0 ? candidate : null;
    var safeFallback = allowed.indexOf(String(fallback || "").toLowerCase()) >= 0 ? String(fallback).toLowerCase() : SAFE_COLORS.normal;
    return matched || safeFallback;
  }
  function safeStateClass(value) { return ["normal", "warning", "reject", "ok", "error", "empty"].indexOf(String(value || "")) >= 0 ? String(value) : "error"; }
  function translate(key, fallback, values) { return window.QJZH.translate ? window.QJZH.translate(key, fallback, values || {}) : fallback; }
  window.QJZH.calibrate = function (input) {
    input = input || {};
    var raw = Number(input.raw_nh3_ppm ?? input.raw ?? 0);
    var corrected = typeof window.compensate === "function" ? Number(window.compensate(Number(input.altitude_m), Number(input.temp_c), Number(input.rh_percent), raw)) : raw;
    var validation = window.QJZH.dataImport?.validate(input);
    return { calibrated_nh3_ppm: corrected, evaluation_note: translate("qjzh.model.evaluationNote", "内部记录的合成测试集平均相对误差 0.71%；单点不确定度尚未评估"), confidence: validation?.confidence || translate("qjzh.confidence.levelLow", "低") };
  };
  window.QJZH.advise = function (input) {
    var n = Number(input?.calibrated_nh3_ppm || 0);
    var policy = window.QJZH.riskPolicy?.classifyNh3(n) || { code: n > 15 ? "urgent" : n >= 10 ? "watch" : "normal", label: n > 15 ? "紧急" : n >= 10 ? "关注" : "正常" };
    return { risk_level: policy.label, ventilation_window: "12:00-14:00", duration_min: policy.code === "urgent" ? 15 : policy.code === "watch" ? 8 : 0, suggestions: policy.code === "urgent" ? ["建议立即组织通风", "清粪并复测"] : policy.code === "watch" ? ["建议短时通风", "检查北侧风口"] : ["保持日常巡检"], rule_id: policy.code === "urgent" ? "KB-NH3-CRITICAL" : policy.code === "watch" ? "KB-NH3-WATCH" : "KB-NH3-NORMAL", standard: "NY/T 388-1999" };
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
    var levelColor = recommendation.risk_level === "紧急" ? SAFE_COLORS.emergency : recommendation.risk_level === "待办" ? SAFE_COLORS.todo : recommendation.risk_level === "关注" ? SAFE_COLORS.watch : SAFE_COLORS.normal;
    levelColor = safeColor(levelColor, SAFE_COLORS.normal);
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
    if (alarms && alarms.textContent.trim() !== alarmText && typeof document.createElement === "function") {
      var alarmItem = document.createElement("div");
      alarmItem.className = "alarm-item";
      var alarmDot = document.createElement("i");
      alarmDot.className = "alarm-dot";
      alarmDot.style.setProperty("--alarm-color", levelColor);
      var alarmCopy = document.createElement("span");
      alarmCopy.textContent = alarmText;
      alarmItem.append(alarmDot, alarmCopy);
      alarms.replaceChildren(alarmItem);
    }
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
    const sceneKey = [altitude, temperature, humidity].map((value) => Number.isFinite(value) ? value : 0).join("|");
    const simulatedTruePpm = 3 + window.QJZH.presentationSeed("algorithm-demo", sceneKey) * 24;
    const rawPpm = window.simulateHighlandRaw(simulatedTruePpm, altitude, temperature, humidity);
    const correctedPpm = window.compensate(altitude, temperature, humidity, rawPpm);
    document.getElementById("demoRaw").textContent = `${rawPpm.toFixed(2)} ppm`;
    document.getElementById("demoCorrected").textContent = `${correctedPpm.toFixed(2)} ppm`;
  }
  window.QJZH.runAlgorithmDemo = runAlgorithmDemo;

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
    document.getElementById("demoSimulate").addEventListener("click", window.QJZH.runAlgorithmDemo);
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
      if (status) { status.className = "qjzh-data-state qjzh-state-" + safeStateClass(result?.level); status.textContent = result?.issues?.length ? result.issues.join("；") : translate("qjzh.data.manualSaved", "数据已接入并保存"); }
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
