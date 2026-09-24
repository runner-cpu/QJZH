/**
 * Bind the independently loaded highland compensation model to the demo panel.
 * @returns {void}
 */
(function () {
  "use strict";
  window.QJZH = window.QJZH || {};
  window.QJZH.calibrate = function (input) {
    input = input || {};
    var raw = Number(input.raw_nh3_ppm ?? input.raw ?? 0);
    var corrected = typeof window.compensate === "function" ? Number(window.compensate(Number(input.altitude_m), Number(input.temp_c), Number(input.rh_percent), raw)) : raw;
    var validation = window.QJZH.dataImport?.validate(input);
    return { calibrated_nh3_ppm: corrected, error_range: validation?.quality === "A" ? "±0.71%" : validation?.quality === "B" ? "±5%" : "未评估", confidence: validation?.confidence || "低" };
  };
  window.QJZH.advise = function (input) {
    var n = Number(input?.calibrated_nh3_ppm || 0);
    var level = n >= 20 ? "紧急" : n >= 15 ? "待办" : n >= 10 ? "关注" : "正常";
    return { risk_level: level, ventilation_window: "12:00-14:00", duration_min: n >= 20 ? 15 : n >= 10 ? 8 : 0, suggestions: n >= 20 ? ["建议立即组织通风", "清粪并复测"] : n >= 10 ? ["建议短时通风", "检查北侧风口"] : ["保持日常巡检"], rule_id: n >= 20 ? "KB-NH3-CRITICAL" : n >= 10 ? "KB-NH3-WATCH" : "KB-NH3-NORMAL", standard: "NY/T 388-1999" };
  };

  // The legacy demo still owns the actuator DOM ids. Keep those ids for model compatibility,
  // but project only recommendation semantics into the visible panel.
  function renderRecommendationPanel() {
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
    var expectedAdvice = mapAdvice(recommendation.suggestions.join("；"));
    var setText = function (node, value) { if (node && node.textContent !== value) node.textContent = value; };
    setText(names[0], "风险等级");
    setText(descs[0], "基于校准氨气与本地知识库规则");
    setText(names[1], "处置建议");
    setText(descs[1], "系统仅输出建议，执行由养殖户既有设备或人工完成");
    setText(status[0], expectedStatus);
    setText(status[1], expectedAdvice);
    var dots = panel.querySelectorAll(".state-dot");
    dots.forEach(function (dot) { if (dot.style.getPropertyValue("--state-color") !== levelColor) dot.style.setProperty("--state-color", levelColor); });
    var icon = document.getElementById("fanIcon");
    if (icon) icon.classList.remove("spin");
    var command = document.getElementById("commandText");
    setText(command, text("suggest_ventilation") + "：" + expectedAdvice + "（窗口 " + recommendation.ventilation_window + "）");
    var alarms = document.getElementById("alarmList");
    var alarmText = "建议溯源：" + recommendation.rule_id + " · " + recommendation.standard;
    if (alarms && alarms.textContent.trim() !== alarmText) alarms.innerHTML = "<div class=\"alarm-item\"><i class=\"alarm-dot\" style=\"--alarm-color:" + levelColor + ";\"></i><span>" + alarmText + "</span></div>";
    var vent = document.getElementById("ventAdvice");
    setText(vent, expectedAdvice + "。系统不向风机或其他硬件下发控制指令。");
    var flow = document.getElementById("flowExecute");
    setText(flow, "建议输出：" + recommendation.risk_level);
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
    function rewriteDisplayCopy() {
      var title = document.querySelector(".title"); if (title) title.textContent = "青境智衡 · 高原圈舍环境数据服务系统";
      var subtitle = document.querySelector(".subtitle"); if (subtitle) subtitle.textContent = "数据接入 → 高原校准 → 智能决策 → 建议输出 → 环境报告";
      var titles = Array.from(document.querySelectorAll(".panel-title"));
      titles.forEach(function (node) {
        if (node.textContent.indexOf("决策建议输出") >= 0) node.textContent = "决策建议输出";
        if (node.textContent.indexOf("采集与补偿状态") >= 0) node.textContent = "高原校准算法演示";
      });
      var pipeline = ["数据接入", "高原校准", "智能决策", "建议输出"];
      document.querySelectorAll(".pipeline-name").forEach(function (node, index) { if (pipeline[index]) node.textContent = pipeline[index]; });
      var flow = { flowCollect: "兼容第三方传感器", flowCompensate: "校准值 + 置信度", flowDecision: "建议待生成", flowExecute: "建议输出" };
      Object.keys(flow).forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = flow[id]; });
      var panel = document.querySelector(".actuator-panel");
      if (panel) {
        var names = panel.querySelectorAll(".actuator-name");
        var descs = panel.querySelectorAll(".actuator-desc");
        if (names[0]) names[0].textContent = "风险等级";
        if (descs[0]) descs[0].textContent = "基于校准氨气、温湿度和规则命中";
        if (names[1]) names[1].textContent = "处置建议";
        if (descs[1]) descs[1].textContent = "清粪 / 换垫料 / 检查风口 / 复测";
        var command = document.getElementById("commandText"); if (command) command.textContent = "建议：当前窗口可通风 8 分钟";
        var alarm = document.getElementById("alarmList"); if (alarm) { alarm.setAttribute("aria-label", "建议溯源"); var first = alarm.querySelector("span"); if (first) first.textContent = "建议溯源：规则 ID 与标准出处将在校准后显示"; }
      }
      var decision = document.querySelector("#decisionPanel .decision-engine"); if (decision) decision.textContent = "本地知识库决策引擎 · 系统只输出决策建议，执行由养殖户既有设备或人工完成，不涉及风机控制";
      document.querySelectorAll(".footer span")[0]?.replaceChildren(document.createTextNode("青境智衡 · 纯软件环境数据服务演示 · v2026.09"));
      document.querySelectorAll(".footer span")[1]?.replaceChildren(document.createTextNode("数据本地存储不上传 · 不涉及动物诊疗 · 不控制硬件 · 仅提供环境参考建议 · 部署时间：2026-09-24"));
    }
      rewriteDisplayCopy();
    renderRecommendationPanel();
    var recommendationPanel = document.querySelector(".actuator-panel");
    if (recommendationPanel && window.MutationObserver) {
      var observer = new MutationObserver(function () { renderRecommendationPanel(); });
      observer.observe(recommendationPanel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    }
    document.getElementById("modelVersion").textContent = window.MODEL_WEIGHTS.version;
    ["demoAltitude", "demoTemp", "demoRh"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateDemoLabels);
    });
    document.getElementById("demoSimulate").addEventListener("click", runAlgorithmDemo);
    updateDemoLabels();

    var banner = document.getElementById("boundaryBanner");
    document.getElementById("dismissBoundary")?.addEventListener("click", function () { if (banner) banner.hidden = true; });
    document.querySelectorAll(".qjzh-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".qjzh-tab").forEach(function (item) { item.classList.toggle("active", item === tab); });
        var institution = document.getElementById("institutionView");
        var individual = document.querySelector(".main-grid");
        var isInstitution = tab.dataset.view === "institution";
        if (institution) institution.classList.toggle("active", isInstitution);
        if (individual) individual.hidden = isInstitution;
      });
    });
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
      if (status) { status.className = "qjzh-data-state qjzh-state-" + (result?.level || "error"); status.textContent = result?.issues?.length ? result.issues.join("；") : "数据已接入并保存"; }
      if (badge && result) badge.textContent = "数据质量 " + result.quality + " · 置信度 " + result.confidence;
      window.QJZH?.dataImport?.updateConfidence?.(result);
    });
    document.getElementById("loadDemoSimulation")?.addEventListener("click", function () {
      document.getElementById("loadSampleData")?.click();
      document.getElementById("dataImportStatus").textContent = "已加载青海冬季 24 小时演示数据";
    });
    document.querySelectorAll("[data-scene]").forEach(function (button) {
      button.addEventListener("click", function () {
        var scene = button.dataset.scene;
        var status = document.getElementById("dataImportStatus");
        if (scene === "retail") {
          document.querySelector(".qjzh-tab[data-view='individual']")?.click();
          document.getElementById("loadSampleData")?.click();
          document.getElementById("decisionPanel")?.scrollIntoView({ behavior: "smooth" });
          if (status) { status.className = "qjzh-data-state qjzh-state-warning"; status.textContent = "散户场景：2620m 示例数据已加载，氨气 18.6→15.2ppm，红色预警，建议 12:00-14:00 通风 8 分钟"; }
        }
        if (scene === "institution") {
          document.querySelector(".qjzh-tab[data-view='institution']")?.click();
          document.getElementById("institutionView")?.scrollIntoView({ behavior: "smooth" });
          if (status) { status.className = "qjzh-data-state qjzh-state"; status.textContent = "机构场景：5 个模拟圈舍风险排名（果洛 QH-GL-005 氨气 21.3ppm 紧急）"; }
        }
        if (scene === "offline") {
          var sites = window.QJZH?.dataImport?.getRecords?.() || [];
          if (status) { status.className = "qjzh-data-state qjzh-state-warning"; status.textContent = "断网演示：本地看板仍可用，当前已存 " + sites.length + " 条记录于本地存储，校准与决策全程离线完成。"; }
        }
      });
    });
    document.getElementById("resetDemoData")?.addEventListener("click", function () { window.QJZH?.demoReset?.reset?.(); });
  });
})();
