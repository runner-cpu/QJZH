/* Qingjing Zhiheng dashboard runtime and resilient chart fallback. */
"use strict";

// CDN 不可用时启用轻量 Canvas 回退，保证离线演示仍有曲线、坐标和点位 Tooltip。
(function installChartFallback() {
  // simulator.js 已提供基础降级图表；这里用多坐标增强版替换它，若 CDN 真正加载则保留 Chart.js。
  const nativeChart = window.Chart?.version ? window.Chart : null;
  if (window.Chart?.__qjzhEnhanced) return;
  const plugins = [];
  const instances = new WeakMap();
  const colors = { yAmmonia: "#FF6B6B", yTemperature: "#4A9EFF", yHumidity: "#00D4AA", yLight: "#FFD93D" };

  class FallbackChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options || {};
      this.scales = {};
      this.hoverIndex = -1;
      this.ctx = canvas.getContext("2d");
      instances.set(canvas, this);
      canvas.addEventListener("mousemove", (event) => this.setHover(event));
      // 移动端用触摸位置复用同一套点位命中逻辑，避免回退图表在手机上只能看不能查值。
      canvas.addEventListener("touchmove", (event) => {
        const touch = event.touches[0];
        if (touch) this.setHover(touch);
      }, { passive: true });
      canvas.addEventListener("touchend", () => { this.hoverIndex = -1; this.draw(); }, { passive: true });
      canvas.addEventListener("mouseleave", () => { this.hoverIndex = -1; this.draw(); });
      window.addEventListener("resize", () => this.draw());
      this.draw();
    }

    update() { this.draw(); }

    isDatasetVisible(index) {
      const dataset = this.data.datasets?.[index];
      return Boolean(dataset) && dataset.hidden !== true;
    }

    setDatasetVisibility(index, visible) {
      const dataset = this.data.datasets?.[index];
      if (dataset) dataset.hidden = !visible;
    }

    setHover(event) {
      const rect = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (!this.chartArea || x < this.chartArea.left || x > this.chartArea.right) return;
      const length = this.data.labels.length;
      this.hoverIndex = length < 2 ? 0 : Math.max(0, Math.min(length - 1, Math.round((x - this.chartArea.left) / (this.chartArea.right - this.chartArea.left) * (length - 1))));
      this.draw();
    }

    scaleValue(scale, value) {
      const min = Number.isFinite(scale.min) ? scale.min : 0;
      const max = Number.isFinite(scale.max) ? scale.max : 1;
      const safe = Math.max(min, Math.min(max, Number(value) || 0));
      return this.chartArea.bottom - ((safe - min) / Math.max(1, max - min)) * (this.chartArea.bottom - this.chartArea.top);
    }

    draw() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(240, Math.floor(rect.width || 800));
      const height = Math.max(240, Math.floor(rect.height || 355));
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ctx = this.ctx;
      ctx.clearRect(0, 0, width, height);
      const compact = width < 430;
      this.chartArea = { left: compact ? 46 : 58, right: width - (compact ? 76 : 106), top: 20, bottom: height - 42 };
      const scales = this.options.scales || {};
      Object.keys(scales).filter((key) => key !== "x").forEach((key) => { this.scales[key] = scales[key]; });
      Object.keys(this.scales).forEach((key) => {
        const scale = this.scales[key];
        scale.getPixelForValue = (value) => this.scaleValue(scale, value);
      });
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(126, 163, 181, 0.18)";
      ctx.fillStyle = "#7A9BB5";
      for (let tick = 0; tick <= 5; tick += 1) {
        const y = this.chartArea.bottom - (tick / 5) * (this.chartArea.bottom - this.chartArea.top);
        ctx.beginPath(); ctx.moveTo(this.chartArea.left, y); ctx.lineTo(this.chartArea.right, y); ctx.stroke();
        const ammoniaScale = scales.yAmmonia || { min: 0, max: 30 };
        const value = ammoniaScale.min + (tick / 5) * (ammoniaScale.max - ammoniaScale.min);
        ctx.fillText(`${value.toFixed(0)} ppm`, 4, y + 4);
      }
      const labels = this.data.labels || [];
      const lastIndex = Math.max(0, labels.length - 1);
      for (let tick = 0; tick <= 5; tick += 1) {
        const index = Math.round((tick / 5) * lastIndex);
        const x = this.chartArea.left + (tick / 5) * (this.chartArea.right - this.chartArea.left);
        ctx.beginPath(); ctx.moveTo(x, this.chartArea.bottom); ctx.lineTo(x, this.chartArea.top); ctx.stroke();
        if (labels[index]) { ctx.fillStyle = "#7A9BB5"; ctx.textAlign = tick === 0 ? "left" : tick === 5 ? "right" : "center"; ctx.fillText(labels[index], x, height - 14); }
      }
      ctx.textAlign = "left";
      (this.data.datasets || []).forEach((dataset) => {
        if (dataset.hidden || !dataset.data?.length) return;
        const color = dataset.borderColor || colors[dataset.yAxisID] || "#00D4AA";
        const scale = scales[dataset.yAxisID] || { min: 0, max: 1 };
        ctx.beginPath();
        let hasPreviousPoint = false;
        dataset.data.forEach((value, index) => {
          // 通风标记等稀疏数据使用空值占位，空值必须断线而非错误落到 0 轴。
          if (!Number.isFinite(value)) {
            hasPreviousPoint = false;
            return;
          }
          const x = this.chartArea.left + (index / Math.max(1, dataset.data.length - 1)) * (this.chartArea.right - this.chartArea.left);
          const y = this.scaleValue(scale, value);
          if (!hasPreviousPoint) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          hasPreviousPoint = true;
        });
        ctx.strokeStyle = color; ctx.lineWidth = dataset.borderWidth || 2; ctx.setLineDash(dataset.borderDash || []); ctx.stroke(); ctx.setLineDash([]);
        dataset.data.forEach((value, index) => {
          if (!Number.isFinite(value)) return;
          const x = this.chartArea.left + (index / Math.max(1, dataset.data.length - 1)) * (this.chartArea.right - this.chartArea.left);
          const y = this.scaleValue(scale, value);
          ctx.beginPath(); ctx.arc(x, y, dataset.pointRadius || 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        });
      });
      plugins.forEach((plugin) => plugin.afterDraw?.(this));
      if (this.hoverIndex >= 0) this.drawTooltip(width, height);
    }

    drawTooltip(width, height) {
      const ctx = this.ctx;
      const labels = this.data.labels || [];
      const rows = (this.data.datasets || []).filter((dataset) => dataset.hidden !== true && Number.isFinite(dataset.data?.[this.hoverIndex]) && dataset.id !== "ventilationMarkers");
      const entries = rows.map((dataset) => {
        const unit = dataset.yAxisID === "yLight" ? "Lux" : dataset.yAxisID === "yHumidity" ? "%" : dataset.yAxisID === "yTemperature" ? "℃" : "ppm";
        const value = Number(dataset.data[this.hoverIndex]).toFixed(unit === "Lux" || unit === "%" ? 0 : 1);
        return { color: dataset.borderColor || colors[dataset.yAxisID] || "#00D4AA", text: `${dataset.label}: ${value} ${unit}` };
      });
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const boxWidth = Math.min(300, Math.max(180, ...entries.map((entry) => ctx.measureText(entry.text).width + 38)));
      const boxHeight = entries.length * 18 + 34;
      const x = Math.min(width - boxWidth - 8, Math.max(8, this.chartArea.left + (this.hoverIndex / Math.max(1, labels.length - 1)) * (this.chartArea.right - this.chartArea.left) + 12));
      const y = Math.max(8, this.chartArea.top + 8);
      ctx.fillStyle = "rgba(8, 22, 32, 0.94)"; ctx.strokeStyle = "rgba(0, 212, 170, 0.5)"; ctx.lineWidth = 1; ctx.fillRect(x, y, boxWidth, boxHeight); ctx.strokeRect(x, y, boxWidth, boxHeight);
      ctx.fillStyle = "#E8F0F8";
      ctx.fillText(labels[this.hoverIndex] || "--", x + 10, y + 20);
      entries.forEach((entry, index) => {
        const rowY = y + 38 + index * 18;
        ctx.fillStyle = entry.color;
        ctx.fillRect(x + 10, rowY - 9, 10, 10);
        ctx.fillStyle = "#D7E4EE";
        ctx.fillText(entry.text, x + 27, rowY);
      });
    }
  }

  FallbackChart.instances = instances;
  FallbackChart.register = (...items) => plugins.push(...items);
  FallbackChart.getChart = (canvas) => instances.get(canvas);
  FallbackChart.__qjzhEnhanced = true;
  window.QJZHCanvasChart = FallbackChart;
  if (!nativeChart) window.Chart = FallbackChart;
})();

const MAX_POINTS = 60;
const MAX_RECORDS = 8;
const MAX_SNAPSHOTS = 5;
const MAX_ADVICE_LOG = 24;
const SAMPLE_INTERVAL = 2000;

const state = {
  sampleIndex: 0,
  running: true,
  streamPhase: "booting",
  streamSource: "simulation",
  timer: null,
  labels: [],
  temperature: [],
  humidity: [],
  ammonia: [],
  rawAmmonia: [],
  light: [],
  records: [],
  snapshots: [],
  adviceHistory: [],
  currentData: null,
  currentResult: null,
  scenario: {
    type: "normal",
    tick: 0,
    duration: 0,
    hold: 0,
    previousTemperature: null
  }
};

// 动态界面文案集中在这里。知识库仍只返回规则 ID、状态和数值，展示层按语言解释，避免采样刷新后重新写入中文。
const uiCopy = {
  en: {
    "sensor.labels": ["Ammonia", "Barn temperature", "Relative humidity", "Illuminance"],
    "sensor.references": ["15 ppm threshold", "0 C / 22 C", "80% high humidity", "Supplemental-light guide"],
    "qjzh.page.title": "Qingjing Zhiheng · Highland Barn Environmental Data Service", "qjzh.page.subtitle": "Data intake → highland calibration → decision support → recommendation → report", "qjzh.tab.individual": "Individual", "qjzh.tab.institution": "Institution", "qjzh.data.title": "Data intake", "qjzh.data.note": "The system does not provide sensors. It calibrates, analyzes and produces recommendations from third-party or manually entered data.", "qjzh.data.importCsv": "Third-party CSV", "qjzh.data.manual": "Manual entry", "qjzh.data.demo": "Demo data", "qjzh.confidence.wait": "Confidence: waiting for data", "qjzh.confidence.high": "Confidence: high", "qjzh.confidence.medium": "Confidence: medium", "qjzh.confidence.low": "Confidence: low", "qjzh.institution.title": "Institution multi-barn view", "qjzh.institution.role": "Institution role", "qjzh.report.title": "Quarterly environment report", "qjzh.scene.toggle": "Demo", "qjzh.scene.aria": "Presentation scene presets", "qjzh.scene.retail": "Individual scene", "qjzh.scene.institution": "Institution scene", "qjzh.scene.offline": "Loaded-session offline demo", "qjzh.scene.reset": "Reset demo", "qjzh.advice.title": "Decision recommendations", "qjzh.algorithm.title": "Highland calibration demo", "qjzh.pipeline.intake": "Data intake", "qjzh.pipeline.calibrate": "Highland calibration", "qjzh.pipeline.decide": "Decision support", "qjzh.pipeline.output": "Recommendation", "qjzh.footer.product": "Qingjing Zhiheng · software environmental data service demo", "qjzh.footer.boundary": "Local-only data · no animal diagnosis · no hardware control · reference recommendations only", "qjzh.footer.deployed": "Deployed", "qjzh.footer.local": "Local development build",
    "nav.overview": "Overview", "nav.data": "Data intake", "nav.algorithm": "Highland calibration", "nav.decision": "Decision support", "nav.institution": "Institution", "nav.report": "Environment report", "nav.next": "Next: {label}",
    "qjzh.scene.tour": "Guided tour", "view.overview.tourHint": "Suggested tour: Data intake → Highland calibration → Decision support → Institution view → Environment report", "view.overview.institutionQuick": "Barn rankings, regional summaries and role views", "view.overview.reportQuick": "Date ranges, trilingual reports and print export",
    "view.overview.title": "Environment overview", "view.overview.note": "Review the active site, live readings, trends and samples before moving through calibration and decision views.", "view.algorithm.title": "Highland calibration", "view.algorithm.note": "Compare raw and calibrated ammonia, model boundaries and input confidence.", "view.algorithm.modelLabel": "Model", "view.algorithm.api": "The calibration algorithm is exposed through the standard compensate() interface for front ends, back ends and third-party devices; this page calls it directly in the browser.", "view.algorithm.range": "Operating range: altitude 2200–3500 m, temperature -15–25℃, humidity 20–85%, ammonia 0–30 ppm", "view.decision.title": "Decision support", "view.decision.note": "Generate risk level, time window, recommendations and traceable local rules.", "view.institution.title": "Institution view", "view.institution.note": "Review barns by risk and filter by site or species.", "view.report.title": "Environment report", "view.report.note": "Generate a localized report for a date range and print or save it as PDF.",
    "panel.trend": "Real-time trend", "panel.trend.note": "NH₃ uses the left ppm axis; temperature, humidity and light use independent axes. The red dashed line marks the 15 ppm risk threshold; hover any point for its measured values.", "panel.records": "Sampling records", "panel.records.note": "Keeps the latest eight samples; save snapshots for traceable review.", "panel.calibration": "Collection and compensation", "panel.calibration.note": "Simulates sensor compensation under high-altitude, low-pressure conditions.", "panel.algorithm": "Algorithm demonstration", "panel.decisionOutput": "Decision recommendations", "panel.decisionOutput.note": "The system provides recommendations only. Farmers act through existing equipment or manual work; no fan is controlled.", "panel.reasoning": "Current inference", "panel.reasoning.note": "Displays outputs from the local knowledge base and decision engine without duplicating rules in this page.", "panel.knowledgeCatalog": "Knowledge-base rule catalog", "panel.knowledgeCatalog.note": "Thresholds, operating constraints and traceable evidence matched in the current inference.",
    "trend.a11y.canvas": "Environmental trend chart for the latest 60 samples", "trend.a11y.empty": "The trend chart has no samples yet.", "trend.a11y.summary": "Time window {start}–{end}. Latest compensated ammonia {latest} ppm; peak {max} ppm; trend {direction}; current risk: {risk}.", "trend.a11y.direction.rising": "rising", "trend.a11y.direction.falling": "falling", "trend.a11y.direction.stable": "stable", "trend.a11y.direction.collecting": "collecting",
    "view.overview.dataQuick": "CSV, manual entry and quality scoring", "view.overview.algorithmQuick": "Model demo, error boundaries and confidence", "view.overview.decisionQuick": "Risk, recommendations and rule traceability",
    "qjzh.data.records": "Local records", "qjzh.data.recordsNote": "Shows the latest 20 records; the newest value wins for the same site and timestamp.", "qjzh.data.noRecords": "No local records", "qjzh.data.partialImport": "Some records were not imported", "qjzh.data.imported": "Imported and deduplicated {count} records; the overview will replay one site.", "qjzh.data.sampleLoaded": "Demo data replaced ({sites} barns, {count} records)", "qjzh.data.quality": "Data quality {quality} · confidence {confidence}", "qjzh.data.qualityPending": "Not scored", "qjzh.data.cleared": "Local data cleared", "qjzh.data.demoReplay": "Qinghai winter demo loaded; the overview will replay one site in time order.",
    "qjzh.data.csvNote": "Upload a CSV containing timestamp, site_id, altitude_m, temp_c, rh_percent, raw_nh3_ppm and device_model.", "qjzh.data.downloadTemplate": "Download CSV template", "qjzh.data.loadSample": "Load sample data", "qjzh.data.clear": "Clear local data", "qjzh.data.submit": "Import and calibrate", "qjzh.data.emptyNote": "No data has been connected. Upload a CSV or enter a reading manually.", "qjzh.data.loadDemo": "Load Qinghai winter 24-hour demo", "qjzh.data.emptyStatus": "No data has been connected. Upload a CSV or enter a reading manually.", "qjzh.data.placeholder.site": "Site name", "qjzh.data.placeholder.altitude": "Altitude (m)", "qjzh.data.placeholder.temperature": "Temperature (℃)", "qjzh.data.placeholder.humidity": "Humidity (%)", "qjzh.data.placeholder.ammonia": "Raw ammonia (ppm)", "qjzh.data.placeholder.device": "Device model", "qjzh.data.table.time": "Time", "qjzh.data.table.site": "Site", "qjzh.data.table.species": "Species", "qjzh.data.table.altitude": "Altitude", "qjzh.data.table.raw": "Raw NH₃", "qjzh.data.table.source": "Source",
    "qjzh.data.manualSaved": "Reading imported and saved", "qjzh.data.notEvaluated": "Not evaluated", "qjzh.model.evaluationNote": "Internal synthetic-test-set mean relative error: 0.71%; point-level uncertainty has not been evaluated.", "qjzh.validation.number": "{field} must be numeric", "qjzh.validation.rangeWarning": "{field} is slightly outside the operating range (warning)", "qjzh.validation.rangeReject": "{field} is outside the model operating range", "qjzh.validation.missing": "Missing field: {field}", "qjzh.validation.csvEmpty": "CSV is empty", "qjzh.confidence.levelHigh": "high", "qjzh.confidence.levelMedium": "medium", "qjzh.confidence.levelLow": "low",
    "qjzh.institution.filter": "Filter", "qjzh.institution.note": "Loads five Qinghai demo barns by default; local records can add more sites.", "qjzh.institution.loading": "Loading regional summary…", "qjzh.institution.filterPlaceholder": "Enter a site ID or species", "qjzh.institution.table.site": "Site", "qjzh.institution.table.altitude": "Altitude", "qjzh.institution.table.species": "Species", "qjzh.institution.table.ammonia": "Calibrated NH₃", "qjzh.institution.table.risk": "Risk level", "qjzh.institution.table.updated": "Last update", "qjzh.institution.export": "Export regional report", "qjzh.institution.import": "Import local records", "qjzh.report.note": "Uses the latest 90 days by default; the report opens in a new window for printing or PDF export.", "qjzh.report.start": "Start date", "qjzh.report.end": "End date", "qjzh.report.generate": "Generate and print report", "qjzh.report.status": "Choose a date range to generate a report.", "qjzh.report.preview": "Environment report preview", "qjzh.report.retryPrint": "Open print window again", "qjzh.report.watermark": "Generated reports include a demo-only watermark and are not statutory measurements or animal diagnoses.",
    "recommendation.riskName": "Risk level", "recommendation.riskDesc": "Based on calibrated ammonia and local knowledge-base rules", "recommendation.actionName": "Response recommendation", "recommendation.actionDesc": "The system only advises; farmers act with existing equipment or manual work", "recommendation.command": "Recommendation: {advice} (window {window})", "recommendation.trace": "Traceability: {rule} · {standard}", "recommendation.noHardware": "{advice}. No control command is sent to a fan or other hardware.", "recommendation.output": "Recommendation: {level}", "recommendation.suggestion.normal": "Continue routine inspection", "recommendation.suggestion.watch": "Use short ventilation and inspect the north air outlet", "recommendation.suggestion.todo": "Use short ventilation, inspect the air outlet and recheck ammonia", "recommendation.suggestion.emergency": "Organize ventilation promptly, remove manure and recheck ammonia",
    "qjzh.scene.retailStatus": "Individual scene: replaying QH-HD-001 and generating a noon short-ventilation recommendation.", "qjzh.scene.institutionStatus": "Institution scene: five demo barns ranked by calibrated-ammonia risk.", "qjzh.scene.offlineStatus": "Offline demo: {count} local records · calibration and decision scripts available ({ppm} ppm) · Canvas fallback {fallback}", "qjzh.scene.active": "active", "qjzh.scene.available": "available",
    "qjzh.replay.active": "Replaying {site}: {count} records (one of {sites} sites)", "qjzh.replay.complete": "Replay complete: {site}, {count} records ({other} other sites; open Institution view)", "qjzh.replay.local": "Current data: local 24-hour simulation; imported data replays one site at a time.", "qjzh.replay.source": "Imported data · {site}", "qjzh.stream.importedRunning": "Imported-data replay running", "qjzh.stream.importedComplete": "Imported-data replay complete",
    "status.lowTemp": "Low temperature", "status.watch": "Watch", "status.normal": "Normal", "status.high": "High", "status.low": "Low", "status.severe": "Severe", "status.exceeded": "Above limit", "status.night": "Night",
    "step.pending": "Pending", "step.running": "Running", "step.monitoring": "Monitoring", "step.completed": "Complete", "step.trend": "Trend", "step.basis": "Basis",
    "step.critical.1": "Recommend organizing ventilation immediately and moving young livestock to a safe area.", "step.critical.2": "Check barn sealing and investigate manure accumulation points.", "step.critical.3": "Monitor the NH3 decrease and record a reading every 2 minutes.",
    "step.warning.1": "Use low-speed ventilation for 5-10 minutes in the 12:00-14:00 window.", "step.warning.2": "Check for damp bedding and increase replacement frequency.", "step.warning.3": "Monitor temperature changes and keep the drop within 3 C.",
    "step.alert.1": "Remove manure promptly to reduce the ammonia source.", "step.alert.2": "Extend noon ventilation to 15 minutes.", "step.alert.3": "Add dry bedding to reduce humidity.",
    "step.caution.1": "Add heat lamps or extra bedding.", "step.caution.2": "Limit each ventilation event to 3-5 minutes.", "step.caution.3": "Observe crowding and add heating when required.",
    "step.normal.1": "Maintain the current management measures.", "step.normal.2": "Inspect equipment operation regularly.", "step.normal.3": "Watch the noon window and perform a short ventilation inspection when suitable.",
    "status.riskPending": "Waiting for assessment", "status.watch": "Watch", "status.todo": "To-do", "status.urgent": "Urgent", "status.recommendation": "Pending", "status.recommendInsulation": "Recommend insulation",
    "advice.pending": "Recommendation: waiting for calibrated input", "advice.critical": "Recommendation: organize ventilation and recheck", "advice.warning": "Recommendation: short ventilation, 8 min, 12:00-14:00", "advice.alert": "Recommendation: clean manure, replace bedding, then ventilate", "advice.caution": "Recommendation: add insulation and shorten ventilation",
    "alarm.critical": "NH3 {ammonia} ppm: recommend organizing ventilation and recheck.", "alarm.warning": "NH3 {ammonia} ppm: recommend a short noon ventilation review.", "alarm.alert": "Humidity {humidity}% + NH3 {ammonia} ppm: recommend cleaning manure and replacing bedding.", "alarm.caution": "Temperature {temperature} C; recommendation: {heater}.", "alarm.normal": "Conditions are normal; continue routine inspection.", "alarm.recommendation": "Risk {fan}; {command}",
    "pipeline.collect": "{time} · compatible third-party sensors", "pipeline.compensate": "{pressure} kPa · NH3 {raw} to {corrected}", "pipeline.execute": "Recommendation output",
    "trigger.time": "Time", "trigger.ammonia": "NH3", "trigger.humidity": "Humidity", "trigger.temperature": "Temperature", "trigger.light": "Light", "trigger.tempDrop": "Temperature drop",
    "vent.inside": "Within window", "vent.outside": "Outside window", "vent.high": "NH3 is above the threshold. Recommend 5-10 minutes of short ventilation from 12:00-14:00 and keep the temperature change within 3 C.", "vent.normal": "No active ventilation is recommended. Continue monitoring ammonia accumulation; inspect briefly during the noon window.", "vent.active": "Recommendation generated: {duration} minutes of short ventilation; continue monitoring the temperature drop.", "vent.alertOnly": "Recommendation only; review manually.", "vent.standby": "Continue routine inspection and monitoring.",
    "rule.basis": "Decision basis: matched rule {index} - {condition}{engineRule}", "rule.engine": " · Engine rule {ruleId}", "rule.matched": "Matched", "rule.unmet": "Not met", "rule.names": ["Level-one alert", "Warning", "Combined alert", "Low-temperature notice", "Normal"], "rule.conditions": ["NH3 > 20 ppm", "NH3 > 15 ppm", "Humidity > 80% and NH3 > 10 ppm", "Temperature < 0 C", "No above condition is met"],
    "level.critical": "Level-one alert", "level.warning": "Warning", "level.alert": "Combined alert", "level.caution": "Low-temperature notice", "level.normal": "Normal",
    "factor.up": "Compensation increase", "factor.down": "Compensation decrease", "factor.steady": "Balanced compensation",
    "snapshot": "NH3 {ammonia} ppm · Temperature {temperature} C · Humidity {humidity}% · Light {light} Lux", "chart.points": "Latest {count} / {max} points",
    "threshold": "NH3 15 ppm threshold", "trend.collecting": "Collecting trend data. A summary is available after 10 samples.", "trend.rising": "NH3 is rising continuously. Watch the noon ventilation window.", "trend.falling": "NH3 is falling continuously. Conditions are stabilizing.", "trend.stable": "NH3 is stable with no clear accumulation trend.", "trend.fast": "NH3 is rising rapidly ↑ · slope +{slope} ppm/h", "trend.slow": "NH3 is rising slowly ↗ · slope +{slope} ppm/h", "trend.down": "NH3 is falling ↓ · slope {slope} ppm/h", "trend.flat": "Trend stable · no clear deterioration", "points": "points",
    "knowledge.empty": "No displayable rule catalog is available from the local knowledge base.", "knowledge.untitled": "Untitled rule", "knowledge.condition": "Condition defined by the knowledge base", "knowledge.source": "Source", "knowledge.local": "Local knowledge base", "knowledge.citation": "Basis", "knowledge.ruleId": "Triggered rule ID", "knowledge.scenario": "Scenario", "knowledge.default": "Default fallback", "knowledge.activeVent": "Recommendation: short ventilation for {duration} min", "knowledge.alertOnly": "Recommendation issued; review manually", "knowledge.standby": "Continue routine inspection and monitoring", "knowledge.historyEmpty": "Important advice will be recorded as the simulation progresses.",
    "urgency.critical": "Urgent action", "urgency.warning": "Action reminder", "urgency.info": "Attention", "urgency.normal": "Routine status", "advice.critical": "Immediate response required. Clean manure sources, confirm the air outlet is clear, and keep livestock safe while the local controller manages ventilation.", "advice.warning": "Ammonia needs attention. Arrange cleaning and use the noon ventilation window while keeping temperature changes within limits.", "advice.info": "Monitor humidity and ammonia together. Replace damp bedding and schedule a noon inspection.", "advice.normal": "Conditions are controllable. Keep routine management and inspect the equipment regularly.",
    "simulation.running": "24-hour simulation running", "simulation.pause": "Pause simulation", "simulation.complete": "24-hour simulation complete", "simulation.restart": "Run simulation again", "simulation.paused": "Simulation paused", "simulation.resume": "Resume simulation", "simulation.time": "Simulation time: {time}", "simulation.data": "Local simulation data", "simulation.fanRun": "Recommend short ventilation / {duration} min", "simulation.standby": "Recommendation pending", "marker.vent": "Ventilation recommendation",
    "scenario.running": "Scenario simulation: {name}",
    "static.scenarioAria": "Scenario simulation", "static.statusAria": "System status and demo controls", "static.themeAria": "Display theme", "static.languageAria": "Language selection", "static.pipelineAria": "Data intake to recommendation output process", "static.sensorAria": "Live sensor readings", "static.decisionAria": "Local decision advice", "static.triggerAria": "Current trigger conditions", "static.match": "Rule match chain · priority check", "static.waitSample": "Waiting for sample", "static.waitSampleDesc": "The rule matching process will appear after the current sensor sample is received.", "static.ventWindow": "Ventilation window 12:00-14:00", "static.waitDecision": "Waiting for decision", "static.ruleState": ["Matched rule", "Recommendation", "Traceable basis"], "static.catalogNote": "Current thresholds, operating constraints and traceable basis from the local rule catalog.", "static.catalogLoading": "Loading the local knowledge-base rule catalog.", "static.library": "View complete rule-library document", "static.libraryRules": ["Level-one alert: NH3 > 20 ppm. Recommend organizing ventilation and move livestock to a safe area. Basis: NY/T 388-1999.", "Warning: NH3 > 15 ppm. Recommend 5-10 minutes of short ventilation from 12:00-14:00; temperature change must not exceed 3 C.", "Combined alert: humidity > 80% and NH3 > 10 ppm. Clean manure, replace bedding and extend noon ventilation to 15 minutes.", "Low-temperature notice: temperature < 0 C. Recommend insulation and limit ventilation to 3-5 minutes.", "Normal: no risk condition is active. Continue inspection and offline local decision-making."],
    "static.calibrationLabels": ["Estimated pressure", "Compensation factor", "Raw NH3", "Compensated NH3"], "static.compareTitle": "Highland dual-variable compensation comparison", "static.compareLabels": ["Raw NH3", "Compensated NH3"], "static.compareNote": "The pressure-temperature-humidity nonlinear model compensates sensor drift under high-altitude, low-pressure conditions; field uncertainty still requires validation.", "static.ventLabels": ["Risk level", "Recommendation"], "static.alarmWaiting": "Waiting for a traceable recommendation.", "static.ruleStateNote": "Displays current outputs from the local knowledge base and decision engine without duplicating the rules in this page.", "static.compensationNote": "Simulates sensor compensation under high-altitude, low-pressure conditions.", "static.executionNote": "Shows decision recommendations and their traceable basis; execution remains with existing equipment or people.", "static.modelNote": "Internal synthetic-test-set mean relative error: 0.71%; point-level uncertainty has not been evaluated.",
    "aria.dismissBoundary": "Dismiss service boundary notice", "aria.mainNav": "Primary navigation", "aria.quickLinks": "Module shortcuts", "aria.csvUpload": "Upload sensor CSV", "aria.riskScale": "Ammonia risk scale", "aria.trendLegend": "Trend-series visibility controls", "aria.chartInsights": "Statistics for the latest 60 points", "aria.snapshotList": "Saved snapshots", "aria.compensationCompare": "Highland dual-variable compensation comparison", "aria.algorithmPanel": "Algorithm demonstration panel", "aria.algorithmCredentials": "Algorithm interface and operating range", "aria.demoAltitude": "Algorithm demo altitude", "aria.demoTemperature": "Algorithm demo temperature", "aria.demoHumidity": "Algorithm demo humidity", "aria.demoRaw": "Algorithm demo raw ammonia", "aria.demoOutput": "Raw and compensated results", "aria.adviceTrace": "Recommendation traceability", "aria.institutionRole": "Institution role",
    "title.lowTempMarker": "Low-temperature marker 0℃", "title.highTempMarker": "High-temperature marker 22℃", "qjzh.confidence.detailHigh": "Confidence: high (input is within the model operating range)", "qjzh.confidence.detailMedium": "Confidence: medium (some inputs are outside the model operating range)", "qjzh.confidence.detailLow": "Confidence: low (input is outside the model operating range; result is unreliable)"
  },
  bo: {
    "sensor.labels": ["ཨམ་མོ་ནི་ཡ", "ཁང་པའི་དྲོད་ཚད", "བརླན་ཚད", "འོད་ཀྱི་སྟུག་ཚད"],
    "sensor.references": ["15 ppm ཚད་ཐིག", "0 C / 22 C", "80% བརླན་ཚད་མཐོ", "ཁ་གསབ་འོད་ཀྱི་གཞི་འཛིན"],
    "qjzh.page.title": "མཐོ་སྒང་ཕྱུགས་ཁང་ཁོར་ཡུག་གཞི་གྲངས་ཞབས་ཞུ", "qjzh.page.subtitle": "གཞི་གྲངས་འཇུག་པ → མཐོ་སྒང་ཁ་གསབ → ཐག་གཅོད → བསམ་འཆར → སྙན་ཞུ", "qjzh.tab.individual": "ཁྱིམ་ཚང་ཐོན་སྐྱེད", "qjzh.tab.institution": "སྒྲིག་འཛུགས", "qjzh.data.title": "གཞི་གྲངས་འཇུག་པ", "qjzh.data.note": "མ་ལག་འདིས་བསྡུ་ལེན་སྒྲིག་ཆས་མི་བཟོ། ཕྱིའི་གཞི་གྲངས་ལ་ཁ་གསབ་དང་དཔྱད་ཞིབ། བསམ་འཆར་སྤྲོད།", "qjzh.data.importCsv": "CSV ནང་འདྲེན", "qjzh.data.manual": "ལག་བྲིས་ནང་འཇུག", "qjzh.data.demo": "དཔེ་སྟོན་གཞི་གྲངས", "qjzh.confidence.wait": "ཡིད་ཆེས། གཞི་གྲངས་སྒུག", "qjzh.confidence.high": "ཡིད་ཆེས་མཐོ", "qjzh.confidence.medium": "ཡིད་ཆེས་འབྲིང", "qjzh.confidence.low": "ཡིད་ཆེས་དམའ", "qjzh.institution.title": "སྒྲིག་འཛུགས་ཕྱུགས་ཁང་མང་པོའི་མཐོང་རིས", "qjzh.institution.role": "སྒྲིག་འཛུགས་ལས་འགན", "qjzh.report.title": "དུས་ཚིགས་ཁོར་ཡུག་སྙན་ཞུ", "qjzh.scene.toggle": "དཔེ་སྟོན", "qjzh.scene.aria": "འགྲེམས་སྟོན་རྣམ་པའི་སྔོན་སྒྲིག", "qjzh.scene.retail": "ཁྱིམ་ཚང་རྣམ་པ", "qjzh.scene.institution": "སྒྲིག་འཛུགས་རྣམ་པ", "qjzh.scene.offline": "ཡོད་ཟིན་པའི་ལཱ་ཡུན་དྲ་མེད་དཔེ་སྟོན", "qjzh.scene.reset": "དཔེ་སྟོན་བསྐྱར་སྒྲིག", "qjzh.advice.title": "ཐག་གཅོད་བསམ་འཆར", "qjzh.algorithm.title": "མཐོ་སྒང་ཁ་གསབ་དཔེ་སྟོན", "qjzh.pipeline.intake": "གཞི་གྲངས་འཇུག", "qjzh.pipeline.calibrate": "མཐོ་སྒང་ཁ་གསབ", "qjzh.pipeline.decide": "ཐག་གཅོད", "qjzh.pipeline.output": "བསམ་འཆར", "qjzh.footer.product": "མཐོ་སྒང་ཁོར་ཡུག་གཞི་གྲངས་ཞབས་ཞུ་དཔེ་སྟོན", "qjzh.footer.boundary": "གཞི་གྲངས་ས་གནས་སུ་ཉར · སྨན་བཅོས་མིན · སྲ་ཆས་མི་ཚོད", "qjzh.footer.deployed": "འགྲེམས་སྤེལ་དུས་ཚོད", "qjzh.footer.local": "ས་གནས་གསར་སྤེལ་ཐོན་རིམ",
    "nav.overview": "སྙིང་བསྡུས", "nav.data": "གཞི་གྲངས", "nav.algorithm": "ཁ་གསབ", "nav.decision": "ཐག་གཅོད", "nav.institution": "སྒྲིག་འཛུགས", "nav.report": "སྙན་ཞུ", "nav.next": "རྗེས་མ། {label}",
    "qjzh.scene.tour": "ལྟ་སྐོར་དཔེ་སྟོན", "view.overview.tourHint": "དཔེ་སྟོན་གྱི་ལམ་རིམ། གཞི་གྲངས་འཇུག་པ → མཐོ་སྒང་ཁ་གསབ → རིག་ནུས་ཐག་གཅོད → སྒྲིག་འཛུགས → ཁོར་ཡུག་སྙན་ཞུ", "view.overview.institutionQuick": "ཕྱུགས་ཁང་གོ་རིམ་དང་ས་ཁུལ་སྙིང་བསྡུས། ལས་འགན་མཐོང་རིས།", "view.overview.reportQuick": "དུས་ཡུན་དང་སྐད་གསུམ་སྙན་ཞུ། པར་འདེབས།",
    "view.overview.title": "ཁོར་ཡུག་སྙིང་བསྡུས", "view.overview.note": "ད་ལྟའི་ས་ཚིགས་དང་ཚད་གྲངས། འཕེལ་ཕྱོགས། དཔེ་ཚད་ལ་ལྟ་བ།", "view.algorithm.title": "མཐོ་སྒང་ཁ་གསབ", "view.algorithm.note": "ཐོག་མའི་ཨམ་མོ་ནི་ཡ་དང་ཁ་གསབ་འབྲས་བུ་བསྡུར་བ།", "view.algorithm.modelLabel": "མ་དཔེ", "view.algorithm.api": "ཁ་གསབ་རྩིས་ཐབས་ནི་ཚད་ལྡན་མཐུད་ཁ compensate() བརྒྱུད་མདུན་སྣེ་དང་རྒྱབ་སྣེ། ཕྱིའི་སྒྲིག་ཆས་ཀྱིས་འབོད་ཆོག", "view.algorithm.range": "སྤྱོད་ཁོངས། མཚོ་ངོས་ 2200–3500 m། དྲོད་ཚད -15–25℃། བརླན་ཚད 20–85%། ཨམ་མོ་ནི་ཡ 0–30 ppm", "view.decision.title": "རིག་ནུས་ཐག་གཅོད", "view.decision.note": "ཉེན་ཁ་དང་དུས་སྐབས། བསམ་འཆར། ཁུངས་འདེད་སྒྲིག་གཞི་སྟོན།", "view.institution.title": "སྒྲིག་འཛུགས་མཐོང་རིས", "view.institution.note": "ཕྱུགས་ཁང་མང་པོ་ཉེན་ཁ་ལྟར་སྒྲིག", "view.report.title": "ཁོར་ཡུག་སྙན་ཞུ", "view.report.note": "དུས་ཡུན་ལྟར་སྙན་ཞུ་བཟོས་ནས་ PDF དུ་ཉར།",
    "panel.trend": "དངོས་དུས་འཕེལ་ཕྱོགས", "panel.trend.note": "NH₃ ལ་གཡོན་གྱི ppm ཚད་ཐིག་སྤྱོད། དམར་པོའི་ཚད་ཐིག་ནི 15 ppm ཉེན་ཁའི་ཚད་ཡིན།", "panel.records": "དཔེ་འཇལ་ཟིན་ཐོ", "panel.records.note": "ཉེ་བའི་དཔེ་འཇལ་ 8 ཉར་ཞིང་མྱུར་བཀོད་ཉར་ཆོག", "panel.calibration": "བསྡུ་ལེན་དང་ཁ་གསབ", "panel.calibration.note": "མཐོ་སྒང་གནོན་ཤུགས་དམའ་བའི་ཚོར་ཆས་ཁ་གསབ་ལས་རིམ་དཔེ་སྟོན།", "panel.algorithm": "རྩིས་ཐབས་དཔེ་སྟོན", "panel.decisionOutput": "ཐག་གཅོད་བསམ་འཆར", "panel.decisionOutput.note": "མ་ལག་གིས་བསམ་འཆར་ཁོ་ན་སྤྲོད། སྲ་ཆས་ལ་ཚོད་འཛིན་མི་བྱེད།", "panel.reasoning": "ད་ཐེངས་ཀྱི་རྟོག་ཞིབ", "panel.reasoning.note": "ས་གནས་ཤེས་བྱ་དང་ཐག་གཅོད་འཕྲུལ་ཆས་ཀྱི་འབྲས་བུ་སྟོན།", "panel.knowledgeCatalog": "ཤེས་བྱའི་སྒྲིག་གཞི", "panel.knowledgeCatalog.note": "ད་ལྟ་མཐུན་པའི་ཚད་གཞི་དང་བཀོལ་སྤྱོད་ཚད། ཁུངས་འདེད་གཞི་འཛིན།",
    "view.overview.dataQuick": "CSV དང་ལག་བྲིས་ནང་འཇུག སྤུས་ཚད་སྐར་གྲངས", "view.overview.algorithmQuick": "མ་དཔེ་དཔེ་སྟོན་དང་ནོར་འཁྲུལ་མཚམས། ཡིད་ཆེས་ཚད།", "view.overview.decisionQuick": "ཉེན་ཁ་དང་བསམ་འཆར། སྒྲིག་གཞི་ཁུངས་འདེད།",
    "qjzh.data.records": "ས་གནས་ཟིན་ཐོ", "qjzh.data.recordsNote": "ཉེ་བའི་ཟིན་ཐོ་20 སྟོན།", "qjzh.data.noRecords": "ས་གནས་ཟིན་ཐོ་མེད", "qjzh.data.partialImport": "ཟིན་ཐོ་ཁ་ཤས་ནང་འདྲེན་མ་བྱས", "qjzh.data.imported": "ཟིན་ཐོ {count} ནང་འདྲེན་དང་བསྐྱར་ཟློས་སེལ", "qjzh.data.sampleLoaded": "དཔེ་སྟོན་གཞི་གྲངས་བརྗེས། ཕྱུགས་ཁང {sites} · ཟིན་ཐོ {count}", "qjzh.data.quality": "གཞི་གྲངས་སྤུས་ཚད {quality} · ཡིད་ཆེས {confidence}", "qjzh.data.qualityPending": "སྐར་གྲངས་མ་བཀོད", "qjzh.data.cleared": "ས་གནས་གཞི་གྲངས་བསུབས", "qjzh.data.demoReplay": "མཚོ་སྔོན་དགུན་དུས་དཔེ་སྟོན་ནང་འདྲེན་བྱས།",
    "qjzh.data.csvNote": "timestamp、site_id、altitude_m、temp_c、rh_percent、raw_nh3_ppm、device_model ཡོད་པའི CSV ཡར་འཇུག", "qjzh.data.downloadTemplate": "CSV དཔེ་གཞི་ཕབ་ལེན", "qjzh.data.loadSample": "དཔེ་གྲངས་འཇུག", "qjzh.data.clear": "ས་གནས་གཞི་གྲངས་བསུབ", "qjzh.data.submit": "ནང་འཇུག་དང་ཁ་གསབ", "qjzh.data.emptyNote": "གཞི་གྲངས་མ་མཐུད། CSV ཡར་འཇུག་གམ་ལག་བྲིས་ནང་འཇུག་བྱོས།", "qjzh.data.loadDemo": "མཚོ་སྔོན་དགུན་དུས་ཆུ་ཚོད་ 24 དཔེ་སྟོན", "qjzh.data.emptyStatus": "གཞི་གྲངས་མ་མཐུད། CSV ཡར་འཇུག་གམ་ལག་བྲིས་ནང་འཇུག་བྱོས།", "qjzh.data.placeholder.site": "ས་ཚིགས་མིང", "qjzh.data.placeholder.altitude": "མཚོ་ངོས་མཐོ་ཚད (m)", "qjzh.data.placeholder.temperature": "དྲོད་ཚད (℃)", "qjzh.data.placeholder.humidity": "བརླན་ཚད (%)", "qjzh.data.placeholder.ammonia": "ཐོག་མའི་ཨམ་མོ་ནི་ཡ (ppm)", "qjzh.data.placeholder.device": "སྒྲིག་ཆས་དཔེ་རྟགས", "qjzh.data.table.time": "དུས་ཚོད", "qjzh.data.table.site": "ས་ཚིགས", "qjzh.data.table.species": "ཕྱུགས་རིགས", "qjzh.data.table.altitude": "མཚོ་ངོས", "qjzh.data.table.raw": "ཐོག་མའི NH₃", "qjzh.data.table.source": "གཞི་གྲངས་ཁུངས",
    "qjzh.data.manualSaved": "གཞི་གྲངས་ནང་འཇུག་དང་ཉར་ཚགས་བྱས།", "qjzh.data.notEvaluated": "དཔྱད་ཞིབ་མ་བྱས", "qjzh.model.evaluationNote": "ནང་ཁུལ་མཉམ་བསྲེས་ཚོད་ལྟའི་ཆ་སྙོམས་ལྟོས་བཅས་ནོར་ཚད་ 0.71% ཡིན། གནས་གཅིག་གི་ངེས་མེད་ཚད་ད་དུང་དཔྱད་ཞིབ་མ་བྱས།", "qjzh.validation.number": "{field} གྲངས་ཀ་ཡིན་དགོས།", "qjzh.validation.rangeWarning": "{field} སྤྱོད་ཁོངས་ལས་ཅུང་ཟད་བརྒལ།", "qjzh.validation.rangeReject": "{field} མ་དཔེའི་སྤྱོད་ཁོངས་ལས་བརྒལ།", "qjzh.validation.missing": "ཞིང་ཁ་མི་འདང་། {field}", "qjzh.validation.csvEmpty": "CSV ནང་གཞི་གྲངས་མེད།", "qjzh.confidence.levelHigh": "མཐོ", "qjzh.confidence.levelMedium": "འབྲིང", "qjzh.confidence.levelLow": "དམའ",
    "qjzh.institution.filter": "འཚོལ་བ", "qjzh.institution.note": "སྔོན་སྒྲིག་ཏུ་མཚོ་སྔོན་དཔེ་སྟོན་ཕྱུགས་ཁང་ 5 འཇུག", "qjzh.institution.loading": "ས་ཁུལ་སྙིང་བསྡུས་འཇུག་བཞིན་པ…", "qjzh.institution.filterPlaceholder": "ས་ཚིགས ID ཡང་ན་ཕྱུགས་རིགས་འཇུག", "qjzh.institution.table.site": "ས་ཚིགས", "qjzh.institution.table.altitude": "མཚོ་ངོས", "qjzh.institution.table.species": "ཕྱུགས་རིགས", "qjzh.institution.table.ammonia": "ཁ་གསབ NH₃", "qjzh.institution.table.risk": "ཉེན་ཁའི་རིམ་པ", "qjzh.institution.table.updated": "མཇུག་མཐའི་དུས་ཚོད", "qjzh.institution.export": "ས་ཁུལ་སྙན་ཞུ་ཕྱིར་འདྲེན", "qjzh.institution.import": "ས་གནས་ཟིན་ཐོ་ནང་འདྲེན", "qjzh.report.note": "སྔོན་སྒྲིག་ཉིན་ 90 བསྡོམས། སྙན་ཞུ་པར་འདེབས་སམ PDF དུ་ཉར་ཆོག", "qjzh.report.start": "འགོ་ཚུགས་ཉིན", "qjzh.report.end": "མཇུག་ཉིན", "qjzh.report.generate": "སྙན་ཞུ་བཟོ་ཞིང་པར་འདེབས", "qjzh.report.status": "དུས་ཡུན་བདམས་ནས་སྙན་ཞུ་བཟོས།", "qjzh.report.preview": "ཁོར་ཡུག་སྙན་ཞུའི་སྔོན་ལྟ", "qjzh.report.retryPrint": "པར་འདེབས་སྒེའུ་ཁུང་ཡང་བསྐྱར་ཁ་ཕྱེ", "qjzh.report.watermark": "སྙན་ཞུར་དཔེ་སྟོན་ཆུ་རྟགས་ཡོད། ཁྲིམས་མཐུན་ཚད་འཇལ་ལམ་སྨན་བཅོས་གཞི་འཛིན་མིན།",
    "trend.a11y.canvas": "ཉེ་བའི་དཔེ་འཇལ་ 60 ཡི་ཁོར་ཡུག་འཕེལ་ཕྱོགས་རི་མོ", "trend.a11y.empty": "འཕེལ་ཕྱོགས་རི་མོར་དཔེ་འཇལ་གཞི་གྲངས་མེད།", "trend.a11y.summary": "དུས་ཡུན {start}–{end}། ཁ་གསབ་ཨམ་མོ་ནི་ཡ་གསར་ཤོས {latest} ppm། མཐོ་ཤོས {max} ppm། འཕེལ་ཕྱོགས {direction}། ད་ལྟའི་ཉེན་ཁ། {risk}", "trend.a11y.direction.rising": "འཕར་བ", "trend.a11y.direction.falling": "མར་ཆག་པ", "trend.a11y.direction.stable": "བརྟན་པོ", "trend.a11y.direction.collecting": "བསྡུ་ལེན་བྱེད་བཞིན་པ",
    "recommendation.riskName": "ཉེན་ཁའི་རིམ་པ", "recommendation.riskDesc": "ཁ་གསབ་ཨམ་མོ་ནི་ཡ་དང་ས་གནས་ཤེས་བྱའི་སྒྲིག་གཞི་ལ་གཞིར་བཞག", "recommendation.actionName": "ཐག་གཅོད་བསམ་འཆར", "recommendation.actionDesc": "མ་ལག་གིས་བསམ་འཆར་ཁོ་ན་སྤྲོད", "recommendation.command": "བསམ་འཆར། {advice}（{window}）", "recommendation.trace": "ཁུངས་འདེད། {rule} · {standard}", "recommendation.noHardware": "{advice} སྲ་ཆས་ལ་ཚོད་འཛིན་བཀའ་མི་གཏོང་།", "recommendation.output": "བསམ་འཆར། {level}", "recommendation.suggestion.normal": "རྒྱུན་ལྡན་གྱི་སྐོར་ཞིབ་མུ་མཐུད།", "recommendation.suggestion.watch": "དུས་ཐུང་རླུང་འགྲོ་བྱས་ནས་བྱང་ཕྱོགས་ཀྱི་རླུང་ཁ་ཞིབ་བཤེར་བྱེད།", "recommendation.suggestion.todo": "དུས་ཐུང་རླུང་འགྲོ་དང་རླུང་ཁ་ཞིབ་བཤེར། ཨམ་མོ་ནི་ཡ་བསྐྱར་འཇལ་བྱེད།", "recommendation.suggestion.emergency": "མྱུར་དུ་རླུང་འགྲོ་སྒྲིག་འཛུགས་དང་ལྕི་བ་གཙང་སེལ། ཨམ་མོ་ནི་ཡ་བསྐྱར་འཇལ་བྱེད།",
    "qjzh.scene.retailStatus": "ཁྱིམ་ཚང་རྣམ་པ། QH-HD-001 ས་ཚིགས་གཅིག་བསྐྱར་སྟོན།", "qjzh.scene.institutionStatus": "སྒྲིག་འཛུགས་རྣམ་པ། ཕྱུགས་ཁང་5 ཉེན་ཁ་ལྟར་སྒྲིག", "qjzh.scene.offlineStatus": "དྲ་མེད་དཔེ་སྟོན། ས་གནས་ཟིན་ཐོ {count} · ཁ་གསབ {ppm} ppm · Canvas {fallback}", "qjzh.scene.active": "ལས་འགན་ཁུར", "qjzh.scene.available": "སྤྱོད་རུང",
    "qjzh.replay.active": "{site} བསྐྱར་སྟོན། ཟིན་ཐོ {count} · ས་ཚིགས {sites} ནས་གཅིག", "qjzh.replay.complete": "བསྐྱར་སྟོན་གྲུབ། {site} · ཟིན་ཐོ {count} · ས་ཚིགས་གཞན {other}", "qjzh.replay.local": "ད་ལྟའི་གཞི་གྲངས། ས་གནས་ཆུ་ཚོད་24 དཔེ་མཚོན།", "qjzh.replay.source": "ནང་འདྲེན་གཞི་གྲངས · {site}", "qjzh.stream.importedRunning": "ནང་འདྲེན་བསྐྱར་སྟོན་འགྲོ་བཞིན", "qjzh.stream.importedComplete": "ནང་འདྲེན་བསྐྱར་སྟོན་གྲུབ",
    "status.lowTemp": "དྲོད་ཚད་དམའ", "status.watch": "དོ་སྣང", "status.normal": "རྒྱུན་ལྡན", "status.high": "མཐོ", "status.low": "དམའ", "status.severe": "ཚབས་ཆེ", "status.exceeded": "ཚད་བརྒལ", "status.night": "མཚན་མོ",
    "step.pending": "སྒུག་བཞིན", "step.running": "ལག་བསྟར", "step.monitoring": "ལྟ་ཞིབ", "step.completed": "ལེགས་འགྲུབ", "step.trend": "འཕེལ་ཕྱོགས", "step.basis": "གཞི་འཛིན",
    "vent.suggest": "རླུང་འགྲོའི་བསམ་འཆར", "vent.short": "དུས་ཐུང་རླུང་འགྲོ", "vent.hold": "རླུང་འགྲོ་རེ་ཞིག་འགོར་བཞག", "advice.source": "བསམ་འཆར་ཁུངས་བཙན",
    "trend.collecting": "འཕེལ་ཕྱོགས་གཞི་གྲངས་བསྡུ་བཞིན། དཔེ་འཇལ་ 10 རྗེས་སུ་སྙིང་བསྡུས་སྟོན།", "trend.rising": "NH3 རྒྱུན་མཐུད་འཕར་བཞིན། ཉིན་དགུང་རླུང་འགྲོའི་དུས་སྐབས་ལ་དོ་སྣང་བྱོས།", "trend.falling": "NH3 རྒྱུན་མཐུད་འབབ་བཞིན། ཁོར་ཡུག་བརྟན་པར་འགྱུར་བཞིན།", "trend.stable": "NH3 བརྟན་པོ་ཡོད། གསོག་འབྱུང་རྟགས་མི་གསལ།", "trend.fast": "NH3 མྱུར་དུ་འཕར་བཞིན ↑ · འགྲོས {slope} ppm/h", "trend.slow": "NH3 དལ་བུར་འཕར་བཞིན ↗ · འགྲོས {slope} ppm/h", "trend.down": "NH3 འབབ་བཞིན ↓ · འགྲོས {slope} ppm/h", "trend.flat": "འཕེལ་ཕྱོགས་བརྟན་པོ", "points": "གནས་ཚད",
    "level.critical": "རིམ་པ་དང་པོའི་ཉེན་བརྡ", "level.warning": "ཉེན་བརྡ", "level.alert": "མཉམ་འདྲེས་ཉེན་བརྡ", "level.caution": "དྲོད་ཚད་དམའ་བའི་དོ་སྣང", "level.normal": "རྒྱུན་ལྡན",
    "knowledge.source": "ཁུངས", "knowledge.citation": "གཞི་འཛིན", "knowledge.ruleId": "མཐུན་པའི་སྒྲིག་གཞི ID", "knowledge.scenario": "གནས་ཚུལ", "knowledge.default": "སྔོན་སྒྲིག", "knowledge.historyEmpty": "གལ་ཆེའི་བསླབ་བྱ་དཔེ་མཚོན་མུ་མཐུད་ན་ཟིན་ཐོར་འགོད།", "urgency.critical": "འཕྲལ་མྱུར་བྱ་སྤྱོད", "urgency.warning": "ལས་འགན་དྲན་སྐུལ", "urgency.info": "དོ་སྣང", "urgency.normal": "རྒྱུན་ལྡན་གནས་ཚུལ",
    "simulation.running": "ཆུ་ཚོད་24 ཡི་དཔེ་མཚོན་འགྲོ་བཞིན", "simulation.pause": "དཔེ་མཚོན་མཚམས་འཇོག", "simulation.complete": "ཆུ་ཚོད་24 ཡི་དཔེ་མཚོན་ལེགས་འགྲུབ", "simulation.restart": "དཔེ་མཚོན་ཡང་བསྐྱར", "simulation.paused": "དཔེ་མཚོན་མཚམས་བཞག", "simulation.resume": "དཔེ་མཚོན་མུ་མཐུད", "simulation.time": "དཔེ་མཚོན་དུས་ཚོད། {time}", "simulation.data": "ས་གནས་དཔེ་མཚོན་གཞི་གྲངས", "marker.vent": "རླུང་འགྲོ་འགོ་འཛུགས", "scenario.running": "གནས་ཚུལ་དཔེ་མཚོན། {name}"
  }
};

Object.assign(uiCopy.en, {
  "a11y.skipMain": "Skip to main content",
  "qjzh.data.label.site": "Site ID",
  "qjzh.data.label.altitude": "Altitude (m)",
  "qjzh.data.label.temperature": "Temperature (℃)",
  "qjzh.data.label.humidity": "Relative humidity (%)",
  "qjzh.data.label.ammonia": "Raw NH₃ (ppm)",
  "qjzh.data.label.device": "Device model",
  "qjzh.data.help.site": "Use 2–64 letters, numbers, underscores or hyphens.",
  "qjzh.data.help.altitude": "The model operating range is 2200–3500 m.",
  "qjzh.data.help.temperature": "Enter the current barn temperature to one decimal place.",
  "qjzh.data.help.humidity": "Enter relative humidity from 20 to 85.",
  "qjzh.data.help.ammonia": "Enter the sensor reading before highland calibration.",
  "qjzh.data.help.device": "Optional; used to trace the sensor or entry source."
});
Object.assign(uiCopy["bo"], {
  "a11y.skipMain": "ནང་དོན་གཙོ་བོར་མཆོང་།",
  "qjzh.data.label.site": "ས་ཚིགས ID",
  "qjzh.data.label.altitude": "མཚོ་ངོས་མཐོ་ཚད (m)",
  "qjzh.data.label.temperature": "དྲོད་ཚད (℃)",
  "qjzh.data.label.humidity": "བརླན་ཚད (%)",
  "qjzh.data.label.ammonia": "ཐོག་མའི NH₃ (ppm)",
  "qjzh.data.label.device": "སྒྲིག་ཆས་དཔེ་རྟགས",
  "qjzh.data.help.site": "ཡིག་འབྲུ་དང་ཨང་ཀི འོག་ཐིག འབྲེལ་རྟགས་བཅས་ 2–64 སྤྱོད།",
  "qjzh.data.help.altitude": "མ་དཔེའི་སྤྱོད་ཁོངས་ 2200–3500 m ཡིན།",
  "qjzh.data.help.temperature": "ཕྱུགས་ཁང་གི་ད་ལྟའི་དྲོད་ཚད་གྲངས་ཆུང་གཅིག་གིས་འཇུག",
  "qjzh.data.help.humidity": "བརླན་ཚད་ 20 ནས་ 85 བར་འཇུག",
  "qjzh.data.help.ammonia": "མཐོ་སྒང་ཁ་གསབ་མ་བྱས་གོང་གི་ཚོར་ཆས་ཀློག་གྲངས་འཇུག",
  "qjzh.data.help.device": "འདེམས་རུང་། ཚོར་ཆས་སམ་ནང་འཇུག་ཁུངས་འདེད་པར་སྤྱོད།"
});

// 藏语动态文案与英文键保持一一对应，避免规则刷新后回退成英文。
Object.assign(uiCopy.bo, {
  "step.critical.1": "མྱུར་དུ་རླུང་འགྲོ་སྒྲིག་འཛུགས་བྱས་ཏེ་ཕྱུགས་ཕྲུག་བདེ་འཇགས་ས་ཁུལ་དུ་སྤོ་བའི་བསམ་འཆར།",
  "step.critical.2": "ཕྱུགས་ཁང་གི་སྦྱར་མཚམས་ཞིབ་བཤེར་དང་ལྕི་བ་གསོག་ས་འཚོལ།",
  "step.critical.3": "NH₃ མར་ཆག་པར་ལྟ་ཞིབ་བྱས་ཏེ་སྐར་མ་ 2 རེར་ཚད་འཇལ་ཟིན་ཐོ་འགོད།",
  "step.warning.1": "12:00–14:00 དུས་སྐབས་སུ་སྐར་མ་ 5–10 རིང་དལ་བུའི་རླུང་འགྲོ་བྱེད།",
  "step.warning.2": "གདན་རློན་པ་ཡོད་མེད་ཞིབ་བཤེར་དང་བརྗེ་བའི་ཐེངས་གྲངས་མང་དུ་གཏོང་།",
  "step.warning.3": "དྲོད་ཚད་འགྱུར་བར་ལྟ་ཞིབ་བྱས་ཏེ་མར་ཆག་ཚད 3℃ ནང་དུ་འཛིན།",
  "step.alert.1": "ལྕི་བ་དུས་ཐོག་ཏུ་གཙང་སེལ་བྱས་ནས་ཨམ་མོ་ནི་ཡའི་ཁུངས་ཉུང་དུ་གཏོང་།",
  "step.alert.2": "ཉིན་དགུང་རླུང་འགྲོའི་དུས་ཚོད་སྐར་མ་ 15 བར་རིང་དུ་གཏོང་།",
  "step.alert.3": "བརླན་ཚད་ཉུང་དུ་གཏོང་ཆེད་སྐམ་པའི་གདན་ཁ་སྣོན།",
  "step.caution.1": "དྲོད་སྒྲོན་ནམ་གདན་ཁ་སྣོན་གྱི་བསམ་འཆར།",
  "step.caution.2": "རླུང་འགྲོ་ཐེངས་རེ་སྐར་མ་ 3–5 ནང་དུ་ཚད་འཛིན།",
  "step.caution.3": "ཕྱུགས་ཚོགས་དྲགས་ཡོད་མེད་ལྟ་ཞིབ་དང་དགོས་སྐབས་དྲོད་སྲུང་ཁ་སྣོན།",
  "step.normal.1": "ད་ལྟའི་དོ་དམ་བྱ་ཐབས་རྒྱུན་འཁྱོངས།",
  "step.normal.2": "སྒྲིག་ཆས་ཀྱི་ལས་སྟངས་རྒྱུན་དུ་ཞིབ་བཤེར།",
  "step.normal.3": "ཉིན་དགུང་དུས་སྐབས་ལ་དོ་སྣང་དང་འཚམ་པོ་ཡོད་ན་དུས་ཐུང་རླུང་འགྲོ་ཞིབ་བཤེར།",
  "status.riskPending": "ཉེན་ཁ་ཞིབ་དཔྱད་སྒུག",
  "status.todo": "བྱ་དགོས",
  "status.urgent": "ཛ་དྲག",
  "status.recommendation": "བསམ་འཆར་སྒུག",
  "status.recommendInsulation": "དྲོད་སྲུང་བསམ་འཆར",
  "advice.pending": "བསམ་འཆར། ཁ་གསབ་གཞི་གྲངས་སྒུག",
  "advice.critical": "འཕྲལ་དུ་ཐག་གཅོད་དགོས། ལྕི་བ་གཙང་སེལ་དང་རླུང་ཁ་ཤར་གཏོང་། ཕྱུགས་ཀྱི་བདེ་འཇགས་སྲུང་།",
  "advice.warning": "ཨམ་མོ་ནི་ཡར་དོ་སྣང་དགོས། གཙང་སེལ་སྒྲིག་འཛུགས་དང་ཉིན་དགུང་རླུང་འགྲོ་བྱས་ཏེ་དྲོད་ཚད་འགྱུར་བ་ཚད་འཛིན།",
  "advice.alert": "བསམ་འཆར། ལྕི་བ་གཙང་སེལ་དང་གདན་བརྗེས་རྗེས་རླུང་འགྲོ་བྱེད།",
  "advice.caution": "བསམ་འཆར། དྲོད་སྲུང་ཁ་སྣོན་དང་རླུང་འགྲོའི་དུས་ཚོད་ཐུང་དུ་གཏོང་།",
  "alarm.critical": "NH₃ {ammonia} ppm། མྱུར་དུ་རླུང་འགྲོ་སྒྲིག་འཛུགས་དང་བསྐྱར་འཇལ་བྱེད།",
  "alarm.warning": "NH₃ {ammonia} ppm། ཉིན་དགུང་དུས་ཐུང་རླུང་འགྲོ་ཞིབ་བཤེར་བྱེད།",
  "alarm.alert": "བརླན་ཚད {humidity}% + NH₃ {ammonia} ppm། ལྕི་བ་གཙང་སེལ་དང་གདན་བརྗེ་བའི་བསམ་འཆར།",
  "alarm.caution": "དྲོད་ཚད {temperature}℃། བསམ་འཆར། {heater}",
  "alarm.normal": "ཁོར་ཡུག་རྒྱུན་ལྡན། རྒྱུན་ལྡན་སྐོར་ཞིབ་མུ་མཐུད།",
  "alarm.recommendation": "ཉེན་ཁ {fan}། {command}",
  "pipeline.collect": "{time} · ཕྱིའི་ཚོར་ཆས་དང་མཐུན",
  "pipeline.compensate": "{pressure} kPa · NH₃ {raw} → {corrected}",
  "pipeline.execute": "བསམ་འཆར་ཕྱིར་འདོན",
  "trigger.time": "དུས་ཚོད",
  "trigger.ammonia": "ཨམ་མོ་ནི་ཡ",
  "trigger.humidity": "བརླན་ཚད",
  "trigger.temperature": "དྲོད་ཚད",
  "trigger.light": "འོད་ཚད",
  "trigger.tempDrop": "དྲོད་ཚད་མར་ཆག",
  "vent.inside": "དུས་སྐབས་ནང",
  "vent.outside": "དུས་སྐབས་ཕྱི",
  "vent.high": "ཨམ་མོ་ནི་ཡ་ཚད་ལས་བརྒལ། 12:00–14:00 བར་སྐར་མ་ 5–10 དུས་ཐུང་རླུང་འགྲོ་དང་དྲོད་ཚད་འགྱུར་བ 3℃ ནང་ཚད་འཛིན།",
  "vent.normal": "ད་ལྟ་རང་འགུལ་རླུང་འགྲོའི་བསམ་འཆར་མེད། ཨམ་མོ་ནི་ཡ་གསོག་ཚུལ་ལྟ་ཞིབ་མུ་མཐུད།",
  "vent.active": "བསམ་འཆར་བཟོས་ཟིན། སྐར་མ་ {duration} དུས་ཐུང་རླུང་འགྲོ་དང་དྲོད་ཚད་མར་ཆག་ལྟ་ཞིབ།",
  "vent.alertOnly": "བསམ་འཆར་ཁོ་ན། མིས་བསྐྱར་ཞིབ་བྱེད།",
  "vent.standby": "རྒྱུན་ལྡན་སྐོར་ཞིབ་དང་ལྟ་ཞིབ་མུ་མཐུད།",
  "rule.basis": "ཐག་གཅོད་གཞི་འཛིན། སྒྲིག་གཞི {index} - {condition}{engineRule}",
  "rule.engine": " · མ་ལག་སྒྲིག་གཞི {ruleId}",
  "rule.matched": "མཐུན་ཟིན",
  "rule.unmet": "མ་མཐུན",
  "rule.names": ["རིམ་པ་དང་པོའི་ཉེན་བརྡ", "ཉེན་བརྡ", "མཉམ་འདྲེས་ཉེན་བརྡ", "དྲོད་ཚད་དམའ་བའི་དོ་སྣང", "རྒྱུན་ལྡན"],
  "rule.conditions": ["NH₃ > 20 ppm", "NH₃ > 15 ppm", "བརླན་ཚད > 80% དང NH₃ > 10 ppm", "དྲོད་ཚད < 0℃", "གོང་གི་ཆ་རྐྱེན་མ་མཐུན"],
  "factor.up": "ཁ་གསབ་ཡར་སྣོན",
  "factor.down": "ཁ་གསབ་མར་ཆག",
  "factor.steady": "ཁ་གསབ་དོ་མཉམ",
  "snapshot": "NH₃ {ammonia} ppm · དྲོད་ཚད {temperature}℃ · བརླན་ཚད {humidity}% · འོད་ཚད {light} Lux",
  "chart.points": "ཉེ་བའི་གནས་ཚད {count} / {max}",
  "threshold": "NH₃ 15 ppm ཉེན་ཁའི་ཚད",
  "knowledge.empty": "ས་གནས་ཤེས་བྱའི་མཛོད་ལ་སྟོན་རུང་སྒྲིག་གཞི་མེད།",
  "knowledge.untitled": "མིང་མེད་སྒྲིག་གཞི",
  "knowledge.condition": "ཆ་རྐྱེན་ཤེས་བྱའི་མཛོད་ཀྱིས་གཏན་འབེབས།",
  "knowledge.local": "ས་གནས་ཤེས་བྱའི་མཛོད",
  "knowledge.activeVent": "བསམ་འཆར། སྐར་མ་ {duration} དུས་ཐུང་རླུང་འགྲོ",
  "knowledge.alertOnly": "བསམ་འཆར་བཟོས་ཟིན། མིས་བསྐྱར་ཞིབ་བྱེད།",
  "knowledge.standby": "རྒྱུན་ལྡན་སྐོར་ཞིབ་དང་ལྟ་ཞིབ་མུ་མཐུད།",
  "advice.info": "བརླན་ཚད་དང་ཨམ་མོ་ནི་ཡ་མཉམ་དུ་ལྟ་ཞིབ། རློན་པའི་གདན་བརྗེས་ཏེ་ཉིན་དགུང་ཞིབ་བཤེར་སྒྲིག་འཛུགས།",
  "advice.normal": "ཁོར་ཡུག་ཚོད་འཛིན་རུང་། རྒྱུན་ལྡན་དོ་དམ་དང་སྒྲིག་ཆས་ཞིབ་བཤེར་མུ་མཐུད།",
  "simulation.fanRun": "དུས་ཐུང་རླུང་འགྲོའི་བསམ་འཆར / སྐར་མ་ {duration}",
  "simulation.standby": "བསམ་འཆར་སྒུག་བཞིན",
  "static.scenarioAria": "གནས་ཚུལ་དཔེ་སྟོན",
  "static.statusAria": "མ་ལག་གནས་ཚུལ་དང་དཔེ་སྟོན་ཚོད་འཛིན",
  "static.themeAria": "མཐོང་རིས་ཁ་དོག",
  "static.languageAria": "སྐད་ཡིག་བདམས་པ",
  "static.pipelineAria": "གཞི་གྲངས་འཇུག་པ་ནས་བསམ་འཆར་ཕྱིར་འདོན་བར་གྱི་ལས་རིམ",
  "static.sensorAria": "དངོས་དུས་ཚོར་ཆས་ཚད་གྲངས",
  "static.decisionAria": "ས་གནས་ཐག་གཅོད་བསམ་འཆར",
  "static.triggerAria": "ད་ལྟའི་སྐུལ་རྐྱེན",
  "static.match": "སྒྲིག་གཞི་མཐུན་སྦྱོར་རིམ་པ · སྔོན་ཐོབ་ལྟར་ཞིབ་བཤེར",
  "static.waitSample": "དཔེ་འཇལ་སྒུག་བཞིན",
  "static.waitSampleDesc": "ད་ལྟའི་ཚོར་ཆས་དཔེ་འཇལ་འབྱོར་རྗེས་སྒྲིག་གཞི་མཐུན་སྦྱོར་སྟོན།",
  "static.ventWindow": "རླུང་འགྲོའི་དུས་སྐབས 12:00–14:00",
  "static.waitDecision": "ཐག་གཅོད་སྒུག་བཞིན",
  "static.ruleState": ["མཐུན་པའི་སྒྲིག་གཞི", "བསམ་འཆར", "ཁུངས་འདེད་གཞི་འཛིན"],
  "static.catalogNote": "ད་ལྟའི་སྒྲིག་གཞི་དཀར་ཆག་གི་ཚད་གཞི་དང་ལས་སྤྱོད་ཚད། ཁུངས་འདེད་གཞི་འཛིན།",
  "static.catalogLoading": "ས་གནས་ཤེས་བྱའི་སྒྲིག་གཞི་དཀར་ཆག་འཇུག་བཞིན།",
  "static.library": "སྒྲིག་གཞི་མཛོད་ཡོངས་རྫོགས་ལྟ་བ",
  "static.libraryRules": [
    "རིམ་པ་དང་པོའི་ཉེན་བརྡ། NH₃ > 20 ppm། རླུང་འགྲོ་སྒྲིག་འཛུགས་དང་ཕྱུགས་བདེ་འཇགས་སར་སྤོ་བའི་བསམ་འཆར། གཞི་འཛིན། NY/T 388-1999།",
    "ཉེན་བརྡ། NH₃ > 15 ppm། 12:00–14:00 བར་སྐར་མ་ 5–10 རླུང་འགྲོ་དང་དྲོད་ཚད་མར་ཆག 3℃ ལས་མི་བརྒལ།",
    "མཉམ་འདྲེས་ཉེན་བརྡ། བརླན་ཚད > 80% དང NH₃ > 10 ppm། ལྕི་བ་གཙང་སེལ་དང་གདན་བརྗེས་ཏེ་ཉིན་དགུང་རླུང་འགྲོ་སྐར་མ་ 15 བར་རིང་དུ་གཏོང་།",
    "དྲོད་ཚད་དམའ་བའི་དོ་སྣང་། དྲོད་ཚད < 0℃། དྲོད་སྲུང་དང་རླུང་འགྲོ་ཐེངས་རེ་སྐར་མ་ 3–5 བར་ཚད་འཛིན།",
    "རྒྱུན་ལྡན། ཉེན་ཁའི་ཆ་རྐྱེན་མ་མཐུན། སྐོར་ཞིབ་དང་དྲ་མེད་ས་གནས་ཐག་གཅོད་མུ་མཐུད།"
  ],
  "static.calibrationLabels": ["རྩིས་དཔག་གནོན་ཤུགས", "ཁ་གསབ་བསྡུར་ཚད", "ཐོག་མའི NH₃", "ཁ་གསབ་རྗེས་ཀྱི NH₃"],
  "static.compareTitle": "མཐོ་སྒང་འགྱུར་ཚད་གཉིས་ཀྱི་ཁ་གསབ་བསྡུར་བ",
  "static.compareLabels": ["ཐོག་མའི NH₃", "ཁ་གསབ NH₃"],
  "static.compareNote": "གནོན་ཤུགས་དང་དྲོད་ཚད། བརླན་ཚད་ཀྱི་མི་ཐིག་གི་ཁ་གསབ་མ་དཔེས་མཐོ་སྒང་གནོན་ཤུགས་དམའ་བའི་ཚོར་ཆས་འཁྱོག་ཚད་བཅོས། ས་གནས་ངེས་མེད་ཚད་ལ་ད་དུང་ར་སྤྲོད་དགོས།",
  "static.ventLabels": ["ཉེན་ཁའི་རིམ་པ", "ཐག་གཅོད་བསམ་འཆར"],
  "static.alarmWaiting": "ཁུངས་འདེད་རུང་བའི་བསམ་འཆར་སྒུག་བཞིན།",
  "static.ruleStateNote": "ས་གནས་ཤེས་བྱའི་མཛོད་དང་ཐག་གཅོད་འཕྲུལ་ཆས་ཀྱི་ད་ལྟའི་འབྲས་བུ་སྟོན་ཞིང་ཤོག་ངོས་སུ་སྒྲིག་གཞི་བསྐྱར་བཟོ་མི་བྱེད།",
  "static.compensationNote": "མཐོ་སྒང་གནོན་ཤུགས་དམའ་བའི་ཚོར་ཆས་ཁ་གསབ་ལས་རིམ་དཔེ་སྟོན།",
  "static.executionNote": "ཐག་གཅོད་བསམ་འཆར་དང་ཁུངས་འདེད་གཞི་འཛིན་སྟོན། ལག་བསྟར་ནི་ཡོད་ཟིན་སྒྲིག་ཆས་སམ་མིས་བྱེད།",
  "static.modelNote": "ནང་ཁུལ་མཉམ་བསྲེས་ཚོད་ལྟའི་ཆ་སྙོམས་ལྟོས་བཅས་ནོར་ཚད་ 0.71% ཡིན། གནས་གཅིག་གི་ངེས་མེད་ཚད་ད་དུང་དཔྱད་ཞིབ་མ་བྱས།",
  "aria.dismissBoundary": "ཞབས་ཞུའི་མཚམས་ཐིག་བརྡ་ཐོ་ཁ་རྒྱག", "aria.mainNav": "གཙོ་བོའི་ཕྱོགས་སྟོན", "aria.quickLinks": "ནུས་པའི་མགྱོགས་འཇུག", "aria.csvUpload": "ཚོར་ཆས་ CSV ཡར་འཇུག", "aria.riskScale": "ཨམ་མོ་ནི་ཡའི་ཉེན་ཁའི་ཚད", "aria.trendLegend": "འཕེལ་ཕྱོགས་གཞི་གྲངས་མངོན་སྟོན་ཚོད་འཛིན", "aria.chartInsights": "ཉེ་བའི་གནས་ཚད་ 60 ཡི་བསྡོམས་རྩིས", "aria.snapshotList": "མྱུར་བཀོད་རེའུ་མིག", "aria.compensationCompare": "མཐོ་སྒང་འགྱུར་ཚད་གཉིས་ཀྱི་ཁ་གསབ་བསྡུར་བ", "aria.algorithmPanel": "རྩིས་ཐབས་དཔེ་སྟོན་ངོས", "aria.algorithmCredentials": "རྩིས་ཐབས་མཐུད་ཁ་དང་སྤྱོད་ཁོངས", "aria.demoAltitude": "རྩིས་ཐབས་དཔེ་སྟོན་མཚོ་ངོས", "aria.demoTemperature": "རྩིས་ཐབས་དཔེ་སྟོན་དྲོད་ཚད", "aria.demoHumidity": "རྩིས་ཐབས་དཔེ་སྟོན་བརླན་ཚད", "aria.demoRaw": "རྩིས་ཐབས་དཔེ་སྟོན་ཐོག་མའི་ཨམ་མོ་ནི་ཡ", "aria.demoOutput": "ཐོག་མ་དང་ཁ་གསབ་འབྲས་བུ", "aria.adviceTrace": "བསམ་འཆར་ཁུངས་འདེད", "aria.institutionRole": "སྒྲིག་འཛུགས་ལས་འགན",
  "title.lowTempMarker": "དྲོད་ཚད་དམའ་བའི་རྟགས་ 0℃", "title.highTempMarker": "དྲོད་ཚད་མཐོ་བའི་རྟགས་ 22℃", "qjzh.confidence.detailHigh": "ཡིད་ཆེས་མཐོ（ནང་འཇུག་མ་དཔེའི་སྤྱོད་ཁོངས་ནང་ཡོད）", "qjzh.confidence.detailMedium": "ཡིད་ཆེས་འབྲིང（ནང་འཇུག་ཁ་ཤས་མ་དཔེའི་སྤྱོད་ཁོངས་ལས་བརྒལ）", "qjzh.confidence.detailLow": "ཡིད་ཆེས་དམའ（ནང་འཇུག་མ་དཔེའི་སྤྱོད་ཁོངས་ལས་བརྒལ་ཞིང་འབྲས་བུར་ཡིད་ཆེས་མི་རུང）"
});

/**
 * 读取当前界面语言的展示文本；规则、模型与采集数值不参与翻译。
 * @param {string} key 文案键名。
 * @param {string} zhFallback 中文默认文案。
 * @param {Object<string, string|number>} values 模板变量。
 * @returns {string} 当前语言的已插值展示文本。
 */
function tr(key, zhFallback, values = {}) {
  // 图表回退会在页面脚本早期调用此函数，此时 languageState 尚未初始化；从 DOM 读取可避免启动阶段 TDZ 错误。
  const language = document.documentElement.dataset.language || "zh";
  const template = language === "zh"
    ? zhFallback
    : uiCopy[language]?.[key] || uiCopy.en[key] || zhFallback;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
window.QJZH = window.QJZH || {};
window.QJZH.translate = tr;

/** 读取多项翻译文本，中文模式保留原有中文内容。 */
function trList(key, index, zhFallback) {
  if (languageState.current === "zh") return zhFallback;
  const list = uiCopy[languageState.current]?.[key] || uiCopy.en[key];
  return Array.isArray(list) && list[index] ? list[index] : zhFallback;
}

/** 按当前界面语言显示规则级别，不改变知识库中原始级别。 */
function localizedLevel(levelClass, zhFallback) {
  return tr(`level.${levelClass}`, zhFallback);
}

const els = {
  streamStatus: document.getElementById("streamStatus"),
  toggleStream: document.getElementById("toggleStream"),
  scenarioSelect: document.getElementById("scenarioSelect"),
  languageSelect: document.getElementById("languageSelect"),
  themeOptions: document.querySelectorAll("[data-theme-value]"),
  scenarioHint: document.getElementById("scenarioHint"),
  snapshotButton: document.getElementById("snapshotButton"),
  snapshotList: document.getElementById("snapshotList"),
  lastUpdate: document.getElementById("lastUpdate"),
  decisionPanel: document.getElementById("decisionPanel"),
  decisionIcon: document.getElementById("decisionIcon"),
  decisionTitle: document.getElementById("decisionTitle"),
  decisionAdvice: document.getElementById("decisionAdvice"),
  decisionTrigger: document.getElementById("decisionTrigger"),
  decisionEvidence: document.getElementById("decisionEvidence"),
  ruleMatchList: document.getElementById("ruleMatchList"),
  riskRing: document.getElementById("riskRing"),
  riskPointer: document.getElementById("riskPointer"),
  ringValue: document.getElementById("ringValue"),
  ventStatus: document.getElementById("ventStatus"),
  ventTimeline: document.getElementById("ventTimeline"),
  ventAdvice: document.getElementById("ventAdvice"),
  fanIcon: document.getElementById("fanIcon"),
  fanStatusDot: document.getElementById("fanStatusDot"),
  fanStatusText: document.getElementById("fanStatusText"),
  heaterStatusDot: document.getElementById("heaterStatusDot"),
  heaterStatusText: document.getElementById("heaterStatusText"),
  commandText: document.getElementById("commandText"),
  trendSummary: document.getElementById("trendSummary"),
  flowCollect: document.getElementById("flowCollect"),
  flowCompensate: document.getElementById("flowCompensate"),
  flowDecision: document.getElementById("flowDecision"),
  flowExecute: document.getElementById("flowExecute"),
  insightAvgNh3: document.getElementById("insightAvgNh3"),
  insightMaxNh3: document.getElementById("insightMaxNh3"),
  insightAvgTemp: document.getElementById("insightAvgTemp"),
  insightHumidCount: document.getElementById("insightHumidCount"),
  decisionResult: document.getElementById("decision-result"),
  adviceUrgencyBadge: document.getElementById("adviceUrgencyBadge"),
  expertAdviceText: document.getElementById("expertAdviceText"),
  adviceTrendStatus: document.getElementById("adviceTrendStatus"),
  adviceCitation: document.getElementById("adviceCitation"),
  adviceRuleId: document.getElementById("adviceRuleId"),
  adviceScenarioKey: document.getElementById("adviceScenarioKey"),
  activeRuleId: document.getElementById("activeRuleId"),
  activeRuleAction: document.getElementById("activeRuleAction"),
  activeRuleCitation: document.getElementById("activeRuleCitation"),
  adviceHistoryLog: document.getElementById("adviceHistoryLog"),
  adviceHistoryCount: document.getElementById("adviceHistoryCount"),
  alarmList: document.getElementById("alarmList"),
  pressureValue: document.getElementById("pressureValue"),
  factorValue: document.getElementById("factorValue"),
  rawAmmoniaValue: document.getElementById("rawAmmoniaValue"),
  correctedAmmoniaValue: document.getElementById("correctedAmmoniaValue"),
  recordRows: document.getElementById("recordRows")
};

const sensors = {
  ammonia: {
    value: document.getElementById("value-ammonia"),
    status: document.getElementById("status-ammonia"),
    range: document.getElementById("range-ammonia"),
    card: document.getElementById("card-ammonia"),
    min: 0,
    max: 30,
    decimals: 1
  },
  temperature: {
    value: document.getElementById("value-temperature"),
    status: document.getElementById("status-temperature"),
    range: document.getElementById("range-temperature"),
    min: -5,
    max: 25,
    decimals: 1
  },
  humidity: {
    value: document.getElementById("value-humidity"),
    status: document.getElementById("status-humidity"),
    range: document.getElementById("range-humidity"),
    min: 40,
    max: 90,
    decimals: 0
  },
  light: {
    value: document.getElementById("value-light"),
    status: document.getElementById("status-light"),
    range: document.getElementById("range-light"),
    min: 0,
    max: 1000,
    decimals: 0
  }
};

const demoEls = {
  altitude: document.getElementById("demoAltitude"),
  altitudeOut: document.getElementById("demoAltitudeOut"),
  temp: document.getElementById("demoTemp"),
  tempOut: document.getElementById("demoTempOut"),
  rh: document.getElementById("demoRh"),
  rhOut: document.getElementById("demoRhOut"),
  rawInput: document.getElementById("demoRawInput"),
  rawInputOut: document.getElementById("demoRawInputOut"),
  raw: document.getElementById("demoRaw"),
  corrected: document.getElementById("demoCorrected"),
  modelVersion: document.getElementById("modelVersion"),
  simulate: document.getElementById("demoSimulate"),
  status: document.getElementById("demoStatus")
};

// 实时刷新算法演示卡片，所有结果均来自当前已加载的 compensate 函数。
function updateCompensationDemo(statusText = "参数已更新") {
  if (!demoEls.altitude || typeof compensate !== "function") return;
  const altitude = Number(demoEls.altitude.value);
  const temp = Number(demoEls.temp.value);
  const rh = Number(demoEls.rh.value);
  const raw = Number(demoEls.rawInput.value);

  try {
    const corrected = Number(compensate(altitude, temp, rh, raw));
    demoEls.altitudeOut.textContent = `${altitude} m`;
    demoEls.tempOut.textContent = `${temp.toFixed(1)} C`;
    demoEls.rhOut.textContent = `${rh.toFixed(0)} %RH`;
    demoEls.rawInputOut.textContent = `${raw.toFixed(1)} ppm`;
    demoEls.raw.textContent = `${raw.toFixed(1)} ppm`;
    demoEls.corrected.textContent = `${corrected.toFixed(2)} ppm`;
    demoEls.modelVersion.textContent = window.MODEL_WEIGHTS?.version || "v--";
    demoEls.status.textContent = statusText;
  } catch (error) {
    demoEls.status.textContent = "模型暂不可用";
    console.error("[算法演示] 补偿模型调用失败", error);
  }
}

[demoEls.altitude, demoEls.temp, demoEls.rh, demoEls.rawInput].forEach((input) => {
  input?.addEventListener("input", () => updateCompensationDemo());
});
demoEls.simulate?.addEventListener("click", () => updateCompensationDemo("已应用当前参数"));
updateCompensationDemo("模型已加载");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomNoise(scale) {
  return (Math.random() - 0.5) * scale;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function percentInRange(value, min, max) {
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function estimateAltitudeM(sampleIndex) {
  return 2850 + 650 * Math.sin(sampleIndex / 55);
}

function estimatePressureKpa(sampleIndex) {
  return LocalSimulator.estimatePressureKpa(estimateAltitudeM(sampleIndex));
}

function simulateHighlandRaw(truePpm, altitude, temperature, humidity) {
  const pressure = LocalSimulator.estimatePressureKpa(altitude);
  const lowPressure = (101.325 - pressure) / 101.325;
  const nonlinearError = clamp(
    0.29 + 0.21 * lowPressure + 0.025 * ((temperature - 5) / 20) ** 2
      + 0.02 * ((humidity - 52.5) / 32.5) ** 2
      + 0.018 * Math.sin((temperature + 15) * Math.PI / 40)
      + 0.012 * (humidity - 52.5) * (temperature - 5) / (32.5 * 20),
    0.35,
    0.40
  );
  const zeroDrift = 0.1 + 0.06 * lowPressure + 0.035 * Math.max(0, -temperature) / 15;
  return clamp(truePpm * (1 + nonlinearError) + zeroDrift + randomNoise(0.11), 0, 45);
}

function interpolateColor(start, end, ratio) {
  const sr = parseInt(start.slice(1, 3), 16);
  const sg = parseInt(start.slice(3, 5), 16);
  const sb = parseInt(start.slice(5, 7), 16);
  const er = parseInt(end.slice(1, 3), 16);
  const eg = parseInt(end.slice(3, 5), 16);
  const eb = parseInt(end.slice(5, 7), 16);
  const r = Math.round(sr + (er - sr) * ratio);
  const g = Math.round(sg + (eg - sg) * ratio);
  const b = Math.round(sb + (eb - sb) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

// 根据氨气浓度动态生成从绿色到红色的风险颜色。
function getRiskColor(ammonia) {
  const ratio = clamp(ammonia / 30, 0, 1);
  if (ratio < 0.5) {
    return interpolateColor("#00D4AA", "#FFD93D", ratio / 0.5);
  }
  return interpolateColor("#FFD93D", "#FF4D5E", (ratio - 0.5) / 0.5);
}

// 场景模拟会在 10-20 个采样点内逐步推向目标值，并短暂稳定，方便演示规则触发。
function startScenario(type) {
  state.scenario = {
    type,
    tick: 0,
    duration: type === "normal" ? 0 : 14,
    hold: type === "normal" ? 0 : 6,
    previousTemperature: null
  };
  els.scenarioHint.classList.toggle("show", type !== "normal");
  els.scenarioHint.textContent = type === "normal" ? "" : tr("scenario.running", `场景模拟中：${els.scenarioSelect.options[els.scenarioSelect.selectedIndex].text}`, { name: els.scenarioSelect.options[els.scenarioSelect.selectedIndex].text });
  // 通知知识库集成层重置场景推理历史，避免把标准序列状态带入演示场景。
  window.dispatchEvent(new CustomEvent("dashboard:scenario-change", { detail: { type } }));
}

function scenarioBlendValue(base, target, min, max) {
  if (state.scenario.type === "normal") return base;
  const total = state.scenario.duration + state.scenario.hold;
  const ramp = state.scenario.duration;
  const tick = state.scenario.tick;
  const ratio = tick <= ramp ? tick / ramp : 1;
  const value = tick <= total ? base + (target - base) * ratio : base;
  return clamp(value + randomNoise(0.4), min, max);
}

function applyScenario(data) {
  const next = { ...data };
  if (state.scenario.type === "ammonia") {
    next.ammonia = scenarioBlendValue(data.ammonia, 18.8, 0, 30);
    next.humidity = scenarioBlendValue(data.humidity, 66, 40, 90);
  }

  if (state.scenario.type === "cold") {
    next.temperature = scenarioBlendValue(data.temperature, -3.2, -5, 25);
    next.ammonia = scenarioBlendValue(data.ammonia, 8.5, 0, 30);
  }

  if (state.scenario.type === "humidAmmonia") {
    next.humidity = scenarioBlendValue(data.humidity, 84, 40, 90);
    next.ammonia = scenarioBlendValue(data.ammonia, 13.2, 0, 30);
  }

  next.rawAmmonia = simulateHighlandRaw(next.ammonia, next.altitude, next.temperature, next.humidity);
  next.referenceAmmonia = next.ammonia;
  next.ammonia = compensate(next.altitude, next.temperature, next.humidity, next.rawAmmonia);
  if (state.scenario.type === "normal") return next;

  next.tempDropRate = state.scenario.previousTemperature == null
    ? next.tempDropRate
    : Number((state.scenario.previousTemperature - next.temperature).toFixed(1));
  state.scenario.previousTemperature = next.temperature;

  state.scenario.tick += 1;

  if (state.scenario.tick > state.scenario.duration + state.scenario.hold + 4) {
    state.scenario.type = "normal";
    state.scenario.previousTemperature = null;
    els.scenarioSelect.value = "normal";
    els.scenarioHint.classList.remove("show");
  }

  return next;
}

// 使用正弦波叠加噪声，模拟自然波动、氨气积聚和通风后的下降。
function generateSensorData() {
  const t = state.sampleIndex;
  const altitude = estimateAltitudeM(t);
  const pressure = estimatePressureKpa(t);
  const ammoniaPhase = t % 46;
  const spike = ammoniaPhase > 24 && ammoniaPhase < 36
    ? Math.sin(((ammoniaPhase - 24) / 12) * Math.PI) * 10.5
    : 0;
  const ventilationDrop = ammoniaPhase > 37 ? -5.2 : 0;
  const daylight = Math.max(0, Math.sin((t / 28) - Math.PI / 2));

  const temperature = clamp(
    8.5 + 13.8 * Math.sin(t / 25 - 1.35) + 2.3 * Math.sin(t / 8) + randomNoise(1.9),
    -5,
    25
  );
  const humidity = clamp(
    64 + 16 * Math.sin(t / 18 + 1.1) - 6 * Math.sin(t / 7) + randomNoise(5.5),
    40,
    90
  );
  const ammonia = clamp(
    8.6 + 5.8 * Math.sin(t / 14 - 0.4) + 2.2 * Math.sin(t / 5) + spike + ventilationDrop + randomNoise(2.2),
    0,
    30
  );
  const rawAmmonia = simulateHighlandRaw(ammonia, altitude, temperature, humidity);
  const light = clamp(daylight * 930 + 45 * Math.sin(t / 3) + randomNoise(36), 0, 1000);

  state.sampleIndex += 1;

  return applyScenario({ time: formatClock(), altitude, temperature, humidity, ammonia, rawAmmonia, light, pressure });
}

function getSensorStatus(type, value) {
  if (type === "temperature") {
    if (value < 0) return { label: tr("status.lowTemp", "低温"), className: "caution" };
    if (value < 4 || value > 22) return { label: tr("status.watch", "关注"), className: "warning" };
    return { label: tr("status.normal", "正常"), className: "normal" };
  }

  if (type === "humidity") {
    if (value > 80) return { label: tr("status.high", "偏高"), className: "warning" };
    if (value < 45) return { label: tr("status.low", "偏低"), className: "caution" };
    return { label: tr("status.normal", "正常"), className: "normal" };
  }

  if (type === "ammonia") {
    if (value > 20) return { label: tr("status.severe", "严重"), className: "critical" };
    if (value > 15) return { label: tr("status.exceeded", "超标"), className: "warning" };
    if (value > 10) return { label: tr("status.watch", "关注"), className: "warning" };
    return { label: tr("status.normal", "正常"), className: "normal" };
  }

  if (value < 80) return { label: tr("status.night", "夜间"), className: "caution" };
  return { label: tr("status.normal", "正常"), className: "normal" };
}

function updateSensorCards(data) {
  Object.keys(sensors).forEach((key) => {
    const config = sensors[key];
    const value = data[key];
    const status = getSensorStatus(key, value);
    config.value.textContent = value.toFixed(config.decimals);
    config.range.style.width = `${percentInRange(value, config.min, config.max)}%`;
    config.status.textContent = status.label;
    config.status.className = `badge ${status.className}`;
  });

  sensors.ammonia.card.classList.toggle("alert", data.ammonia > 15);
}

// 本地专家规则库：按优先级命中第一条。
function decideByExpertRules(data) {
  if (data.ammonia > 20) {
    return {
      levelClass: "critical",
      icon: "🔴",
      title: "一级警报",
      advice: "氨气浓度严重超标！建议立即组织通风，并将幼畜转移至安全区域。氨气浓度超过20ppm将严重损害幼畜呼吸道黏膜，持续30分钟以上可导致不可逆损伤。【参考国标NY/T 388-1999】"
    };
  }

  if (data.ammonia > 15) {
    return {
      levelClass: "warning",
      icon: "🟡",
      title: "警告",
      advice: "氨气浓度超标！建议在午间12:00-14:00气温峰值时段进行5-10分钟短时通风，单次通风温度波动控制在3℃以内。同时检查暖棚密封性，排查粪污堆积点。"
    };
  }

  if (data.humidity > 80 && data.ammonia > 10) {
    return {
      levelClass: "alert",
      icon: "🟠",
      title: "复合预警",
      advice: "高湿高氨环境！建议立即清理粪污、增加垫料更换频率，并在午间通风窗口延长通风至15分钟。"
    };
  }

  if (data.temperature < 0) {
    return {
      levelClass: "caution",
      icon: "🔵",
      title: "低温注意",
      advice: "低温环境！建议增加保温灯或加厚垫料，避免冷应激引发腹泻。通风时应缩短单次时长并观察温度波动。"
    };
  }

  return {
    levelClass: "normal",
    icon: "🟢",
    title: "正常",
    advice: "当前圈舍环境适宜。温度、湿度、氨气均在舒适范围内，继续保持当前管理措施并定期巡查设备运行状态。"
  };
}

// 将规则命中结果转换为结构化建议清单，便于演示“本地决策 → 建议输出”。
function getDecisionSteps(levelClass, inWindow) {
  const stepIcon = inWindow ? `● ${tr("step.completed", "建议已生成")}` : `▶ ${tr("step.pending", "待生成")}`;

  if (levelClass === "critical") {
    return [
      { status: `● ${tr("step.completed", "建议已生成")}`, text: tr("step.critical.1", "建议立即组织通风，疏散幼畜至安全区域。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.critical.2", "检查暖棚密封性，排查粪污堆积点。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.critical.3", "持续监测氨气下降趋势，每 2 分钟记录一次。") }
    ];
  }

  if (levelClass === "warning") {
    return [
      { status: stepIcon, text: tr("step.warning.1", "在 12:00-14:00 午间窗口开启低速通风（5-10 分钟）。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.warning.2", "检查垫料潮湿情况，增加更换频率。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.warning.3", "监测温度波动，确保降幅不超过 3℃。") }
    ];
  }

  if (levelClass === "alert") {
    return [
      { status: `● ${tr("step.completed", "建议已生成")}`, text: tr("step.alert.1", "建议及时清理粪污，减少氨气源头。") },
      { status: stepIcon, text: tr("step.alert.2", "延长午间通风至 15 分钟。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.alert.3", "增加干燥垫料，降低湿度。") }
    ];
  }

  if (levelClass === "caution") {
    return [
      { status: `● ${tr("step.completed", "建议已生成")}`, text: tr("step.caution.1", "建议增加保温灯或加厚垫料。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.caution.2", "缩短单次通风时长至 3-5 分钟。") },
      { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.caution.3", "观察幼畜扎堆情况，必要时增加供暖。") }
    ];
  }

  return [
    { status: `✓ ${tr("step.completed", "已完成")}`, text: tr("step.normal.1", "继续保持当前管理措施。") },
    { status: `▶ ${tr("step.pending", "待执行")}`, text: tr("step.normal.2", "定期巡查设备运行状态。") },
    { status: inWindow ? `● ${tr("step.completed", "建议已生成")}` : `▶ ${tr("step.pending", "待生成")}`, text: tr("step.normal.3", "关注午间窗口，可进行短时巡检通风。") }
  ];
}

function renderDecisionSteps(levelClass, inWindow) {
  const steps = getDecisionSteps(levelClass, inWindow);
  els.decisionAdvice.innerHTML = steps.map((step, index) => `
    <div class="action-step">
      <span class="step-index">${index + 1}</span>
      <span><span class="step-status">${step.status}</span>${step.text}</span>
    </div>
  `).join("");
}

// 根据规则结果刷新建议状态，让右侧栏表达“建议输出”。
function updateActuators(levelClass, inWindow) {
  let fan = { text: tr("status.riskPending", "等待判断"), color: "#7A9BB5", spin: false };
  let heater = { text: tr("status.recommendation", "待生成"), color: "#7A9BB5" };
  let command = tr("advice.pending", "建议：等待数据校准");

  if (levelClass === "critical") {
    fan = { text: tr("status.urgent", "紧急"), color: "#FF4D5E", spin: false };
    command = tr("advice.critical", "建议：组织通风并在 2 分钟后复测");
  } else if (levelClass === "warning") {
    fan = inWindow
      ? { text: tr("status.watch", "关注"), color: "#00D4AA", spin: false }
      : { text: tr("status.riskPending", "等待判断"), color: "#7A9BB5", spin: false };
    command = tr("advice.warning", "建议：12:00-14:00 短时通风 8 分钟");
  } else if (levelClass === "alert") {
    fan = inWindow
      ? { text: tr("status.todo", "待办"), color: "#FF9F43", spin: false }
      : { text: tr("status.riskPending", "等待判断"), color: "#7A9BB5", spin: false };
    command = tr("advice.alert", "建议：清粪换垫料后组织 15 分钟通风");
  } else if (levelClass === "caution") {
    heater = { text: tr("status.recommendInsulation", "建议保温"), color: "#FF4D5E" };
    command = tr("advice.caution", "建议：增加保温并将单次通风缩短至 3-5 分钟");
  }

  els.fanStatusText.textContent = fan.text;
  els.fanStatusDot.style.setProperty("--state-color", fan.color);
  els.fanIcon.classList.toggle("spin", fan.spin);
  els.heaterStatusText.textContent = heater.text;
  els.heaterStatusDot.style.setProperty("--state-color", heater.color);
  els.commandText.textContent = command;
  return { fan, heater, command };
}

// 告警队列借鉴 IoT 看板的事件流做法，保留最关键的执行提示。
function updateAlarmList(data, result, execution) {
  const items = [];
  if (result.levelClass === "critical") {
    items.push({ color: "#FF4D5E", text: tr("alarm.critical", `NH₃ ${data.ammonia.toFixed(1)}ppm，建议组织通风并评估疏散。`, { ammonia: data.ammonia.toFixed(1) }) });
  } else if (result.levelClass === "warning") {
    items.push({ color: "#FFD93D", text: tr("alarm.warning", `NH₃ ${data.ammonia.toFixed(1)}ppm，等待或执行午间短时通风。`, { ammonia: data.ammonia.toFixed(1) }) });
  } else if (result.levelClass === "alert") {
    items.push({ color: "#FF9F43", text: tr("alarm.alert", `湿度 ${data.humidity.toFixed(0)}% + NH₃ ${data.ammonia.toFixed(1)}ppm，优先清粪换垫料。`, { humidity: data.humidity.toFixed(0), ammonia: data.ammonia.toFixed(1) }) });
  } else if (result.levelClass === "caution") {
    items.push({ color: "#4A9EFF", text: tr("alarm.caution", `温度 ${data.temperature.toFixed(1)}℃，处置建议：${execution.heater.text}。`, { temperature: data.temperature.toFixed(1), heater: execution.heater.text }) });
  } else {
    items.push({ color: "#00D4AA", text: tr("alarm.normal", "环境处于正常区间，继续日常巡检。") });
  }

  items.push({ color: execution.fan.color, text: tr("alarm.recommendation", `风险：${execution.fan.text}；${execution.command}`, { fan: execution.fan.text, command: execution.command }) });
  els.alarmList.innerHTML = items.map((item) => `
    <div class="alarm-item"><i class="alarm-dot" style="--alarm-color:${item.color};"></i><span>${item.text}</span></div>
  `).join("");
}

// 顶部流程条实时汇总采集、补偿、决策与执行状态。
function updatePipeline(data, result, execution) {
  els.flowCollect.textContent = tr("pipeline.collect", `${data.time} · 4路传感器在线`, { time: data.time });
  els.flowCompensate.textContent = tr("pipeline.compensate", `${data.pressure.toFixed(1)}kPa · NH₃ ${data.rawAmmonia.toFixed(1)}→${data.ammonia.toFixed(1)}`, { pressure: data.pressure.toFixed(1), raw: data.rawAmmonia.toFixed(1), corrected: data.ammonia.toFixed(1) });
  els.flowDecision.textContent = `${result.icon} ${localizedLevel(result.levelClass, result.title)}`;
  els.flowExecute.textContent = tr("pipeline.execute", `${execution.fan.text} / ${execution.heater.text}`, { fan: execution.fan.text, heater: execution.heater.text });
}

function updateDecision(data) {
  const result = decideByExpertRules(data);
  const risk = clamp((data.ammonia / 30) * 100, 3, 100);
  const riskColor = getRiskColor(data.ammonia);
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const inWindow = hour >= 12 && hour <= 14;

  els.decisionPanel.dataset.level = result.levelClass;
  els.decisionIcon.textContent = result.icon;
  els.decisionTitle.textContent = localizedLevel(result.levelClass, result.title);
  renderDecisionSteps(result.levelClass, inWindow);
  els.decisionTrigger.innerHTML = `
    <span class="trigger-chip">${tr("trigger.ammonia", "氨气")}：<strong style="--chip-color:${riskColor}">${data.ammonia.toFixed(1)}ppm</strong></span>
    <span class="trigger-chip">${tr("trigger.humidity", "湿度")}：<strong style="--chip-color:var(--humidity)">${data.humidity.toFixed(0)}%</strong></span>
    <span class="trigger-chip">${tr("trigger.temperature", "温度")}：<strong style="--chip-color:var(--temperature)">${data.temperature.toFixed(1)}℃</strong></span>
    <span class="trigger-chip">${tr("trigger.light", "光照")}：<strong style="--chip-color:var(--light)">${data.light.toFixed(0)}Lux</strong></span>
  `;
  renderRuleMatchChain(data, null);
  els.riskRing.style.setProperty("--risk", `${risk}%`);
  els.riskRing.style.setProperty("--ring-color", riskColor);
  els.riskPointer.style.setProperty("--pointer", `${risk}%`);
  els.ringValue.textContent = data.ammonia.toFixed(1);
  els.ventTimeline.style.setProperty("--now", `${(hour / 24) * 100}%`);
  els.ventStatus.textContent = inWindow ? tr("vent.inside", "当前在窗口内") : tr("vent.outside", "当前不在窗口内");
  els.ventAdvice.textContent = data.ammonia > 15
    ? tr("vent.high", "氨气已超阈值。建议在 12:00-14:00 进行 5-10 分钟短时通风，温度波动控制在 3℃以内。")
    : tr("vent.normal", "当前无需主动通风，继续监测氨气积聚趋势；若进入午间窗口可进行短时巡检通风。");
  const execution = updateActuators(result.levelClass, inWindow);
  updateAlarmList(data, result, execution);
  updatePipeline(data, result, execution);

  state.currentResult = result;
  return result;
}

// 规则匹配链按项目展示的五级优先级解释当前传感器值，不参与或改写本地知识库推理。
function renderRuleMatchChain(data, decision) {
  if (!els.ruleMatchList || !els.decisionEvidence) return;
  const rules = [
    { index: "①", name: trList("rule.names", 0, "一级警报"), condition: trList("rule.conditions", 0, "氨气 > 20 ppm"), matched: data.ammonia > 20, color: "#ff4d5e" },
    { index: "②", name: trList("rule.names", 1, "警告"), condition: trList("rule.conditions", 1, "氨气 > 15 ppm"), matched: data.ammonia > 15, color: "#ffd93d" },
    { index: "③", name: trList("rule.names", 2, "复合预警"), condition: trList("rule.conditions", 2, "湿度 > 80% 且氨气 > 10 ppm"), matched: data.humidity > 80 && data.ammonia > 10, color: "#ff9f43" },
    { index: "④", name: trList("rule.names", 3, "低温注意"), condition: trList("rule.conditions", 3, "温度 < 0℃"), matched: data.temperature < 0, color: "#4a9eff" },
    { index: "⑤", name: trList("rule.names", 4, "正常"), condition: trList("rule.conditions", 4, "以上条件均未满足"), matched: false, color: "#00d4aa" }
  ];
  const activeRule = rules.find((rule) => rule.matched) || rules[rules.length - 1];
  rules[rules.length - 1].matched = activeRule.index === "⑤";
  const engineRule = decision && decision.ruleId ? tr("rule.engine", ` · 引擎规则 ${decision.ruleId}`, { ruleId: decision.ruleId }) : "";
  els.decisionEvidence.textContent = tr("rule.basis", `决策依据：命中规则 ${activeRule.index} —— ${activeRule.condition}${engineRule}`, { index: activeRule.index, condition: activeRule.condition, engineRule });
  els.ruleMatchList.innerHTML = rules.map((rule) => `
    <div class="rule-match-item${rule.index === activeRule.index ? " is-match" : ""}" role="listitem" style="--rule-match-color:${rule.color}">
      <span class="rule-match-index">${rule.index}</span>
      <div class="rule-match-copy"><strong>${rule.name}</strong><span>${rule.condition}</span></div>
      <span class="rule-match-state">${rule.index === activeRule.index ? `✓ ${tr("rule.matched", "命中")}` : `✗ ${tr("rule.unmet", "未满足")}`}</span>
    </div>
  `).join("");
}

function updateCalibration(data) {
  const factor = data.ammonia > 0 ? data.ammonia / Math.max(data.rawAmmonia, 0.1) : 1;
  els.pressureValue.textContent = `${data.pressure.toFixed(1)} kPa`;
  els.factorValue.textContent = `${factor.toFixed(2)}x`;
  els.rawAmmoniaValue.textContent = `${data.rawAmmonia.toFixed(1)} ppm`;
  els.correctedAmmoniaValue.textContent = `${data.ammonia.toFixed(1)} ppm`;
  const rawPercent = clamp((data.rawAmmonia / 30) * 100, 0, 100);
  const correctedPercent = clamp((data.ammonia / 30) * 100, 0, 100);
  const factorArrow = document.getElementById("compensationFactorArrow");
  const rawBar = document.getElementById("compensationRawBar");
  const correctedBar = document.getElementById("compensationCorrectedBar");
  const rawValue = document.getElementById("compensationRawValue");
  const correctedValue = document.getElementById("compensationCorrectedValue");
  if (rawBar) rawBar.style.width = `${rawPercent}%`;
  if (correctedBar) correctedBar.style.width = `${correctedPercent}%`;
  if (rawValue) rawValue.textContent = `${data.rawAmmonia.toFixed(1)} ppm`;
  if (correctedValue) correctedValue.textContent = `${data.ammonia.toFixed(1)} ppm`;
  if (factorArrow) {
    const direction = factor > 1.2 ? "up" : factor < 0.9 ? "down" : "steady";
    factorArrow.dataset.direction = direction;
    factorArrow.textContent = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
    factorArrow.setAttribute("aria-label", direction === "up" ? tr("factor.up", "补偿上调") : direction === "down" ? tr("factor.down", "补偿下调") : tr("factor.steady", "补偿适中"));
  }
}

function pushRecord(data, result) {
  state.records.unshift({ ...data, result });
  state.records = state.records.slice(0, MAX_RECORDS);
  els.recordRows.innerHTML = state.records.map((item) => `
    <tr>
      <td>${item.time}</td>
      <td>${item.temperature.toFixed(1)}℃</td>
      <td>${item.humidity.toFixed(0)}%</td>
      <td>${item.rawAmmonia.toFixed(1)}</td>
      <td>${item.ammonia.toFixed(1)}</td>
      <td>${item.light.toFixed(0)}</td>
      <td class="level-${item.result.levelClass}">${item.result.icon} ${localizedLevel(item.result.levelClass, item.result.title)}</td>
    </tr>
  `).join("");
}

// 数据快照功能：手动保存当前时刻读数和决策结果，最多保留 5 条。
function saveSnapshot() {
  if (!state.currentData || !state.currentResult) return;
  state.snapshots.unshift({
    ...state.currentData,
    result: state.currentResult
  });
  state.snapshots = state.snapshots.slice(0, MAX_SNAPSHOTS);
  renderSnapshots();
}

function renderSnapshots() {
  if (state.snapshots.length === 0) {
    els.snapshotList.innerHTML = "";
    return;
  }

  els.snapshotList.innerHTML = state.snapshots.map((item) => `
    <div class="snapshot-item" role="listitem">
      <strong>${item.time}</strong>
      <span>${tr("snapshot", `NH₃ ${item.ammonia.toFixed(1)}ppm · 温度 ${item.temperature.toFixed(1)}℃ · 湿度 ${item.humidity.toFixed(0)}% · 光照 ${item.light.toFixed(0)}Lux`, { ammonia: item.ammonia.toFixed(1), temperature: item.temperature.toFixed(1), humidity: item.humidity.toFixed(0), light: item.light.toFixed(0) })}</span>
      <span class="level-${item.result.levelClass}">${item.result.icon} ${localizedLevel(item.result.levelClass, item.result.title)}</span>
    </div>
  `).join("");
}

// Chart.js 自定义插件：在图表区域手动绘制 15ppm 红色虚线阈值。
const thresholdLinePlugin = {
  id: "ammoniaThresholdLine",
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.yAmmonia) return;
    const y = scales.yAmmonia.getPixelForValue(15);
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(255, 77, 94, 0.9)";
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 107, 107, 0.95)";
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(tr("threshold", "NH₃ 15ppm 阈值"), chartArea.left + 8, y - 8);

    // 悬停时增加时间定位线，使多条曲线的同一采样时刻更容易对照。
    const activePoint = chart.tooltip?.getActiveElements?.()[0];
    if (activePoint?.element?.x) {
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 212, 170, 0.72)";
      ctx.moveTo(activePoint.element.x, chartArea.top);
      ctx.lineTo(activePoint.element.x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
};

Chart.register(thresholdLinePlugin);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let trendChart = new Chart(document.getElementById("trendChart"), {
  type: "line",
  data: {
    labels: state.labels,
    datasets: [
      {
        id: "calibratedAmmonia",
        label: "补偿NH₃ ppm",
        data: state.ammonia,
        borderColor: "#FF6B6B",
        backgroundColor: "rgba(255, 107, 107, 0.12)",
        pointBackgroundColor: "#FF6B6B",
        pointBorderColor: "#FFE5E5",
        pointBorderWidth: 1,
        tension: 0.36,
        pointRadius: 2.5,
        pointHoverRadius: 7,
        pointHitRadius: 14,
        borderWidth: 3,
        fill: true,
        yAxisID: "yAmmonia"
      },
      {
        id: "rawAmmonia",
        label: "原始NH₃ ppm",
        data: state.rawAmmonia,
        borderColor: "rgba(170, 170, 170, 0.5)",
        borderDash: [6, 5],
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHitRadius: 14,
        borderWidth: 2,
        yAxisID: "yAmmonia"
      },
      {
        id: "temperature",
        label: "温度 ℃",
        data: state.temperature,
        borderColor: "#4A9EFF",
        pointBackgroundColor: "#4A9EFF",
        pointBorderColor: "#DCEEFF",
        pointBorderWidth: 1,
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHitRadius: 14,
        borderWidth: 2,
        yAxisID: "yTemperature"
      },
      {
        id: "humidity",
        label: "湿度 %",
        data: state.humidity,
        borderColor: "#00D4AA",
        pointBackgroundColor: "#00D4AA",
        pointBorderColor: "#D9FFF6",
        pointBorderWidth: 1,
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHitRadius: 14,
        borderWidth: 2,
        yAxisID: "yHumidity",
        borderDash: [5, 4]
      },
      {
        id: "light",
        label: "光照 Lux",
        data: state.light,
        borderColor: "#FFD93D",
        backgroundColor: "rgba(255, 217, 61, 0.08)",
        pointBackgroundColor: "#FFD93D",
        pointBorderColor: "#FFF6BF",
        pointBorderWidth: 1,
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHitRadius: 14,
        borderWidth: 2,
        yAxisID: "yLight"
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion.matches ? false : { duration: 240 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: false,
        labels: {
          color: "#7A9BB5",
          usePointStyle: true,
          boxWidth: 8,
          font: { weight: "700" }
        }
      },
      tooltip: {
        backgroundColor: "rgba(11, 26, 42, 0.96)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        borderWidth: 1,
        titleColor: "#E8F0F8",
        bodyColor: "#D7E4EE",
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        callbacks: {
          // Tooltip 按数据集的量纲显示每个采样点的真实值。
          label(context) {
            const unit = context.dataset.unit || ({ yAmmonia: "ppm", yTemperature: "℃", yHumidity: "%", yLight: "Lux" }[context.dataset.yAxisID] || "");
            const value = Number(context.parsed.y);
            return `${context.dataset.label}: ${Number.isFinite(value) ? value.toFixed(unit === "Lux" ? 0 : unit === "%" ? 0 : 1) : "--"} ${unit}`.trim();
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#7A9BB5", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        grid: { color: "rgba(255, 255, 255, 0.07)" }
      },
      yAmmonia: {
        position: "left",
        min: 0,
        max: 30,
        ticks: { color: "#FF8A8A", callback: (value) => `${value} ppm` },
        grid: { color: "rgba(255, 255, 255, 0.07)" }
      },
      yTemperature: {
        position: "right",
        min: -8,
        max: 30,
        ticks: { color: "#78B8FF", callback: (value) => `${value}℃` },
        grid: { drawOnChartArea: false }
      },
      yHumidity: {
        position: "right",
        offset: true,
        min: 35,
        max: 90,
        ticks: { color: "#39E0BE", callback: (value) => `${value}%` },
        grid: { drawOnChartArea: false }
      },
      yLight: {
        position: "right",
        offset: true,
        min: 0,
        max: 1000,
        ticks: { color: "#D3A900", callback: (value) => `${value} Lux` },
        grid: { drawOnChartArea: false }
      }
    }
  }
});
window.QJZH = window.QJZH || {};
window.QJZH.activateCanvasFallback = function () {
  if (!window.QJZHCanvasChart || trendChart instanceof window.QJZHCanvasChart) return true;
  const canvas = document.getElementById("trendChart");
  const data = trendChart.data;
  const options = trendChart.options;
  data.datasets.forEach((dataset, index) => { dataset.hidden = !trendChart.isDatasetVisible(index); });
  if (typeof trendChart.destroy === "function") trendChart.destroy();
  trendChart = new window.QJZHCanvasChart(canvas, { type: "line", data, options });
  syncTrendToggleState();
  return true;
};

const trendDatasetIds = ["calibratedAmmonia", "rawAmmonia", "temperature", "humidity", "light"];

function syncTrendToggleState() {
  document.querySelectorAll(".trend-toggle[data-dataset]").forEach((button) => {
    const index = trendChart.data.datasets.findIndex((dataset) => dataset.id === button.dataset.dataset);
    button.setAttribute("aria-pressed", String(index >= 0 && trendChart.isDatasetVisible(index)));
  });
}

function toggleDataset(id) {
  const index = trendChart.data.datasets.findIndex((dataset) => dataset.id === id);
  if (index < 0 || !trendDatasetIds.includes(id)) return false;
  const visibleCount = trendChart.data.datasets.reduce((count, dataset, datasetIndex) => (
    trendDatasetIds.includes(dataset.id) && trendChart.isDatasetVisible(datasetIndex) ? count + 1 : count
  ), 0);
  const nextVisible = !trendChart.isDatasetVisible(index);
  if (!nextVisible && visibleCount <= 1) return true;
  trendChart.setDatasetVisibility(index, nextVisible);
  trendChart.update(reducedMotion.matches ? "none" : undefined);
  syncTrendToggleState();
  updateTrendA11ySummary();
  return nextVisible;
}

window.QJZH.chartControls = { toggleDataset: toggleDataset };
document.querySelector(".trend-key")?.addEventListener("click", (event) => {
  const button = event.target.closest(".trend-toggle[data-dataset]");
  if (button) toggleDataset(button.dataset.dataset);
});
syncTrendToggleState();

function applyChartMotionPreference() {
  trendChart.options.animation = reducedMotion.matches ? false : { duration: 240 };
  trendChart.update("none");
}
if (typeof reducedMotion.addEventListener === "function") reducedMotion.addEventListener("change", applyChartMotionPreference);
else if (typeof reducedMotion.addListener === "function") reducedMotion.addListener(applyChartMotionPreference);

// 语言包只负责界面文案，不参与采集、补偿和知识库决策。
const languageState = { current: "zh" };
const languageCopy = {
  en: {
    title: "Qingjing Zhiheng · Highland Barn Environmental Data Service",
    subtitle: "Data intake → highland calibration → decision support → recommendation → environment report.",
    stream: "Collecting",
    scenario: ["24-hour winter baseline", "Slow ammonia rise", "Cold wave", "High humidity + ammonia"],
    recent: "Last 60 points",
    lastUpdate: "Last update: ",
    pause: "Pause collection",
    resume: "Resume collection",
    lightTheme: "Light",
    darkTheme: "Dark",
    language: "Language",
    languageOptions: ["Chinese", "English", "Tibetan"],
    boundary: "Qingjing Zhiheng is a software-only environmental data service. It accepts third-party sensors, manual input and public data, then provides calibration, analysis and recommendations. It neither sells nor controls hardware.",
    pipelineNames: ["Data intake", "Highland calibration", "Local decision", "Recommendation output"],
    pipelineValues: ["Waiting for sample", "Pressure calibration --", "Rules awaiting input", "Recommendation pending"],
    decisionEngine: "Local knowledge-base engine · first matched rule returns a recommendation",
    riskIndex: "NH₃ risk index ppm",
    riskLabels: ["Safe <10", "Watch 10-15", "Above 15-20", "Danger >20"],
    localKb: "LOCAL EXPERT KB",
    history: "Advice history",
    historyEmpty: "Important advice will be recorded as the simulation progresses.",
    trendTitle: "Real-time trend",
    trendNote: "NH₃ uses the left ppm axis; temperature, humidity and light use independent axes. Red dashed line: 15ppm risk threshold.",
    chartStats: ["NH₃ average", "NH₃ peak", "Temperature average", "High-humidity points"],
    trendLegend: ["Compensated NH₃", "Raw NH₃", "Temperature", "Humidity", "Light"],
    records: "Sampling records",
    recordsNote: "Keep the latest 8 samples; save snapshots for traceable review.",
    snapshot: "Save snapshot",
    tableHeaders: ["Time", "Temperature", "Humidity", "Raw NH₃", "Compensated NH₃", "Light", "Level"],
    collection: "Collection & compensation",
    algorithm: "Algorithm demonstration",
    vent: "Decision recommendations",
    ruleState: "Current inference",
    knowledgeCatalog: "Knowledge-base rule catalog",
    altitude: "Altitude",
    temperature: "Temperature",
    humidity: "Humidity",
    rawNh3: "Raw NH₃",
    applyParams: "Apply parameters",
    waitingInput: "Waiting for input",
    rawReading: "Before compensation",
    correctedReading: "After compensation",
    fan: "Risk level",
    heater: "Recommendation",
    fanDesc: "Based on calibrated NH3, temperature, humidity and matched rules",
    heaterDesc: "Cleaning / bedding / outlet check / retest",
    noCommand: "Recommendation: waiting for calibrated input",
    timeline: ["00:00", "12:00", "14:00", "24:00"]
  },
  bo: {
    title: "མཐོ་སྒང་ཕྱུགས་ཁང་ཁོར་ཡུག་གཞི་གྲངས་ཞབས་ཞུ",
    subtitle: "གཞི་གྲངས་འཇུག་པ → མཐོ་སྒང་ཁ་གསབ → ཐག་གཅོད → བསམ་འཆར → སྙན་ཞུ",
    stream: "བསྡུ་ལེན་བྱེད་བཞིན་པ",
    scenario: ["དགུན་ཁའི་ཆུ་ཚོད་ 24 གཞི་རྩའི་རྣམ་པ", "ཨམ་མོ་ནི་ཡ་འཕར་བ", "གྲང་ངར་རླུང", "རློན་ཚད་མཐོ་བ་དང་ཨམ་མོ་ནི་ཡ་མཐོ་བ"],
    recent: "གནས་ཚད་ 60 མཐའ་མ",
    lastUpdate: "མཇུག་མཐུད་དུས་ཚོད། ",
    pause: "བསྡུ་ལེན་སྐབས་སྐབས་འཇོག",
    resume: "བསྡུ་ལེན་མུ་མཐུད",
    lightTheme: "འོད་མདངས",
    darkTheme: "མུན་ནག",
    language: "སྐད་ཡིག",
    languageOptions: ["རྒྱ་ཡིག", "English", "བོད་ཡིག"],
    boundary: "མ་ལག་འདི་ནི་མཉེན་ཆས་ཁོ་ནའི་ཁོར་ཡུག་གཞི་གྲངས་ཞབས་ཞུ་ཞིག་ཡིན། ཕྱིའི་གཞི་གྲངས་ལ་ཁ་གསབ་དང་དཔྱད་ཞིབ། བསམ་འཆར་སྤྲོད་ཅིང་སྲ་ཆས་ཚོད་འཛིན་མི་བྱེད།",
    pipelineNames: ["གཞི་གྲངས་མཐུད་འཇུག", "མཐོ་སའི་ཁ་གསབ", "ས་གནས་ཐག་གཅོད", "བསམ་འཆར་སྟོན་པ"],
    pipelineValues: ["དཔེ་འཇལ་སྒུག་བཞིན་པ", "གནོན་ཤུགས་སྙོམས་སྒྲིག --", "སྒྲིག་གཞི་སྒུག་བཞིན་པ", "བསམ་འཆར་སྒུག་བཞིན་པ"],
    decisionEngine: "ས་གནས་ཤེས་བྱའི་མ་དཔེ། སྒྲིག་གཞི་དང་པོ་མཐུན་ན་བསམ་འཆར་སྟོན།",
    riskIndex: "NH₃ ཉེན་ཁའི་ཟུར་ཚད ppm",
    riskLabels: ["བདེ་འཇགས <10", "དོ་སྣང་ 10-15", "ཚད་ལས་བརྒལ 15-20", "ཉེན་ཁ >20"],
    localKb: "ས་གནས་ཆེད་མཁས་ཤེས་བྱ",
    history: "བསླབ་བྱའི་ཟིན་ཐོ",
    historyEmpty: "གལ་ཆེའི་བསླབ་བྱ་དེ་དཔེ་མཚོན་མུ་མཐུད་ན་ཟིན་ཐོར་འགོད།",
    trendTitle: "དངོས་དུས་འཕེལ་ཕྱོགས",
    trendNote: "NH₃ གཡོན་གྱི ppm ཚད་འཇལ་ལ་བཀོད། དྲོད་ཚད་དང་རློན་ཚད། འོད་ཚད་ལ་རང་རང་གི་ཚད་འཇལ་ཡོད།",
    chartStats: ["NH₃ ཆ་སྙོམས", "NH₃ མཐོ་ཤོས", "དྲོད་ཚད་ཆ་སྙོམས", "རློན་ཚད་མཐོ་བའི་གྲངས"],
    trendLegend: ["ཁ་གསབ NH₃", "ཐོག་མའི NH₃", "དྲོད་ཚད", "རློན་ཚད", "འོད་ཚད"],
    records: "དཔེ་འཇལ་ཟིན་ཐོ",
    recordsNote: "དཔེ་འཇལ་གནས་ཚད་ 8 ཉར་ཚགས་བྱེད། གཞི་གྲངས་མཐུད་འབྲེལ་ཆེད་དུ་མྱུར་བཀོད་ཉར།",
    snapshot: "གནས་ཚད་མྱུར་བཀོད",
    tableHeaders: ["དུས་ཚོད", "དྲོད་ཚད", "རློན་ཚད", "ཐོག་མའི NH₃", "ཁ་གསབ་རྗེས་ཀྱི NH₃", "འོད་ཚད", "རིམ་པ"],
    collection: "བསྡུ་ལེན་དང་ཁ་གསབ",
    algorithm: "རྩིས་ཐབས་སྟོན་པ",
    vent: "ཐག་གཅོད་བསམ་འཆར",
    ruleState: "ད་ལྟའི་རྣམ་འགྱུར",
    knowledgeCatalog: "ཤེས་བྱའི་སྒྲིག་གཞི་དཀར་ཆག",
    altitude: "མཚོ་ངོས་མཐོ་ཚད",
    temperature: "དྲོད་ཚད",
    humidity: "རློན་ཚད",
    rawNh3: "ཐོག་མའི NH₃",
    applyParams: "ད་ལྟའི་གནས་ཚད་སྤྱོད",
    waitingInput: "ནང་འཇུག་སྒུག",
    rawReading: "ཁ་གསབ་མ་བྱས་པ",
    correctedReading: "ཁ་གསབ་བྱས་རྗེས",
    fan: "ཉེན་ཁའི་རིམ་པ",
    heater: "བསམ་འཆར",
    fanDesc: "ཁ་གསབ་ཨམ་མོ་ནི་ཡ་དང་དྲོད་ཚད། བརླན་ཚད། སྒྲིག་གཞི་ལ་གཞིར་བཞག",
    heaterDesc: "གཙང་སྦྲ / གདན་གསར་པ / ཁ་ཕྱེ་བརྟག་དཔྱད / ཡང་བསྐྱར་ཚད་འཇལ",
    noCommand: "བསམ་འཆར། ཁ་གསབ་གཞི་གྲངས་སྒུག",
    timeline: ["00:00", "12:00", "14:00", "24:00"]
  }
};

const originalLanguageText = new WeakMap();
function setLocalizedText(element, value) {
  if (!element) return;
  if (!originalLanguageText.has(element)) originalLanguageText.set(element, element.textContent);
  element.textContent = value;
}

function updateReplaySiteLabel(complete = false) {
  const label = document.getElementById("replaySiteLabel");
  if (!label) return;
  const summary = window.QJZH?.dataImport?.replaySummary?.();
  if (!summary?.siteId) {
    label.textContent = tr("qjzh.replay.local", "当前数据：本地 24 小时模拟；导入数据后将按首个站点独立回放。");
    return;
  }
  label.textContent = complete
    ? tr("qjzh.replay.complete", "回放完成：{site} 共{count}条（另有{other}站点，切机构版查看）", { site: summary.siteId, count: summary.recordCount, other: Math.max(0, summary.siteCount - 1) })
    : tr("qjzh.replay.active", "正在回放：{site}（共{count}条 / {sites}站点中仅本站点）", { site: summary.siteId, count: summary.recordCount, sites: summary.siteCount });
}
window.QJZH.updateReplaySiteLabel = updateReplaySiteLabel;

function applyLanguage(language) {
  const nextLanguage = ["zh", "en", "bo"].includes(language) ? language : "zh";
  const copy = languageCopy[nextLanguage];
  languageState.current = nextLanguage;
  window.QJZH_LANGUAGE = nextLanguage;
  document.documentElement.dataset.language = nextLanguage;
  document.documentElement.lang = nextLanguage === "bo" ? "bo" : nextLanguage === "en" ? "en" : "zh-CN";
  if (els.languageSelect) els.languageSelect.value = nextLanguage;
  try { localStorage.setItem("qjzh-language", nextLanguage); } catch (error) { console.warn("[语言切换] 无法保存语言偏好", error); }

  const restoreOrSet = (selector, value) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      const translated = Array.isArray(value) ? value[index] : value;
      setLocalizedText(element, nextLanguage === "zh" ? originalLanguageText.get(element) || element.textContent : translated || element.textContent);
    });
  };
  restoreOrSet(".title", copy?.title);
  restoreOrSet(".subtitle", copy?.subtitle);
  restoreOrSet(".language-label", copy?.language);
  restoreOrSet(".qjzh-boundary-copy", copy?.boundary);
  restoreOrSet("#recentPoints", copy?.recent);
  restoreOrSet(".theme-option", [copy?.lightTheme, copy?.darkTheme]);
  restoreOrSet(".pipeline-name", copy?.pipelineNames);
  restoreOrSet(".pipeline-value", copy?.pipelineValues);
  restoreOrSet(".decision-engine", copy?.decisionEngine);
  restoreOrSet(".ring-content span", copy?.riskIndex);
  restoreOrSet(".risk-labels span", copy?.riskLabels);
  restoreOrSet(".knowledge-result-label", copy?.localKb);
  restoreOrSet("#adviceHistoryTitle", copy?.history);
  restoreOrSet(".advice-history-empty", copy?.historyEmpty);
  restoreOrSet(".insight-card span", copy?.chartStats);
  restoreOrSet(".trend-key-label", copy?.trendLegend);
  restoreOrSet("#snapshotButton", copy?.snapshot);
  restoreOrSet("#recordsPanel .data-table th", copy?.tableHeaders);
  restoreOrSet(".demo-row > span", [copy?.altitude, copy?.temperature, copy?.humidity, copy?.rawNh3]);
  restoreOrSet("#demoSimulate", copy?.applyParams);
  restoreOrSet("#demoStatus", copy?.waitingInput);
  restoreOrSet(".demo-output span", [copy?.rawReading, copy?.correctedReading]);
  restoreOrSet(".actuator-name", [copy?.fan, copy?.heater]);
  restoreOrSet(".actuator-desc", [copy?.fanDesc, copy?.heaterDesc]);
  restoreOrSet(".timeline-labels span", copy?.timeline);
  restoreOrSet(".status-strip .control", copy?.pause);
  // 静态面板也统一走语言包，防止只切换顶部文案而留下中文说明。
  const localize = (selector, key, zhFallback, index) => {
    document.querySelectorAll(selector).forEach((element, itemIndex) => {
      const value = index === undefined
        ? tr(key, zhFallback)
        : trList(key, index + itemIndex, Array.isArray(zhFallback) ? zhFallback[index + itemIndex] : zhFallback);
      setLocalizedText(element, value);
    });
  };
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const fallback = originalLanguageText.get(element) || element.textContent;
    setLocalizedText(element, tr(element.dataset.i18n, fallback));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const fallback = element.dataset.i18nPlaceholderZh || element.getAttribute("placeholder") || "";
    if (!element.dataset.i18nPlaceholderZh) element.dataset.i18nPlaceholderZh = fallback;
    element.setAttribute("placeholder", tr(element.dataset.i18nPlaceholder, fallback));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const fallback = element.dataset.i18nAriaLabelZh || element.getAttribute("aria-label") || "";
    if (!element.dataset.i18nAriaLabelZh) element.dataset.i18nAriaLabelZh = fallback;
    element.setAttribute("aria-label", tr(element.dataset.i18nAriaLabel, fallback));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const fallback = element.dataset.i18nTitleZh || element.getAttribute("title") || "";
    if (!element.dataset.i18nTitleZh) element.dataset.i18nTitleZh = fallback;
    element.setAttribute("title", tr(element.dataset.i18nTitle, fallback));
  });
  localize(".sensor-label", "sensor.labels", ["氨气浓度", "圈舍温度", "相对湿度", "光照强度"], 0);
  localize(".sensor-reference", "sensor.references", ["15ppm阈值", "0℃ / 22℃", "80%高湿", "补光参考"], 0);
  document.querySelector(".status-strip")?.setAttribute("aria-label", tr("static.statusAria", "系统状态与演示控制"));
  document.querySelector(".theme-switch")?.setAttribute("aria-label", tr("static.themeAria", "显示主题"));
  els.languageSelect?.setAttribute("aria-label", tr("static.languageAria", "语言切换"));
  els.scenarioSelect?.setAttribute("aria-label", tr("static.scenarioAria", "场景模拟"));
  document.querySelector(".pipeline-strip")?.setAttribute("aria-label", tr("static.pipelineAria", "数据接入到建议输出流程"));
  document.querySelector(".sensor-grid")?.setAttribute("aria-label", tr("static.sensorAria", "实时传感器读数"));
  els.decisionPanel?.setAttribute("aria-label", tr("static.decisionAria", "本地决策建议"));
  els.decisionTrigger?.setAttribute("aria-label", tr("static.triggerAria", "当前触发条件"));
  localize(".rule-match-chain > summary", "static.match", "规则匹配链 · 按优先级核验");
  localize(".calibration-item > span", "static.calibrationLabels", ["估算气压", "补偿系数", "原始氨气", "补偿后氨气"], 0);
  localize(".compensation-compare-title", "static.compareTitle", "高原双维度补偿算法效果对比");
  localize(".compensation-bar-row > span", "static.compareLabels", ["原始 NH₃", "补偿 NH₃"], 0);
  localize(".compensation-note", "static.compareNote", "气压、温度和湿度非线性补偿模型用于修正高海拔低压传感器漂移；现场不确定度仍需验证。");
  localize("#modelBoundaryNote", "static.modelNote", "内部合成测试集平均相对误差 0.71%；单点不确定度尚未评估");
  localize(".actuator-name", "static.ventLabels", ["风险等级", "处置建议"], 0);
  localize(".vent-row > span:first-child", "static.ventWindow", "通风窗口 12:00-14:00");
  localize(".rule-state-list dt", "static.ruleState", ["命中规则", "建议事项", "可追溯依据"], 0);
  localize(".rule-library-details > summary", "static.library", "📄 查看完整规则库文档");
  localize(".rule-library-content article", "static.libraryRules", ["一级警报：氨气 > 20 ppm，建议立即组织通风并转移至安全区域。依据：NY/T 388-1999。", "警告：氨气 > 15 ppm，建议在 12:00-14:00 通风 5-10 分钟，温度降幅不超过 3℃。", "复合预警：湿度 > 80% 且氨气 > 10 ppm，建议优先清粪、换干燥垫料并延长午间通风至 15 分钟。", "低温注意：温度 < 0℃，建议开启保温，缩短单次通风至 3-5 分钟并观察幼畜状态。", "正常：未触发以上风险条件，建议保持管理措施并持续巡检。"], 0);
  document.querySelectorAll(".rule-library-content article").forEach((article) => { article.textContent = window.QJZH?.mapAdvice ? window.QJZH.mapAdvice(article.textContent) : article.textContent; });
  const build = window.BUILD_INFO || { version: "dev", commit: "local", builtAt: null, environment: "local" };
  const deployedBuild = build.environment === "production" && Boolean(build.builtAt);
  const buildStatus = deployedBuild
    ? `${tr("qjzh.footer.deployed", "部署时间")}：${String(build.builtAt).slice(0, 10)} · ${String(build.commit || "").slice(0, 7)}`
    : tr("qjzh.footer.local", "本地开发构建");
  setLocalizedText(document.getElementById("buildVersionText"), `${tr("qjzh.footer.product", "青境智衡 · 纯软件环境数据服务演示")} · ${build.version || "dev"}`);
  setLocalizedText(document.getElementById("buildDateText"), `${tr("qjzh.footer.boundary", "数据本地存储不上传 · 不涉及动物诊疗 · 不控制硬件 · 仅提供环境参考建议")} · ${buildStatus}`);
  setLocalizedText(els.commandText, tr("advice.pending", "建议：等待数据校准"));
  localize("#alarmList .alarm-item span", "static.alarmWaiting", "等待规则引擎输出执行事件。");
  if (state.scenario.type !== "normal") {
    const activeName = els.scenarioSelect?.options[els.scenarioSelect.selectedIndex]?.text || "";
    els.scenarioHint.textContent = tr("scenario.running", `场景模拟中：${activeName}`, { name: activeName });
  } else if (window.QJZH?.dataImport?.useImported?.()) {
    els.scenarioHint.classList.add("show");
    const summary = window.QJZH.dataImport.replaySummary();
    els.scenarioHint.textContent = tr("qjzh.replay.active", "正在回放：{site}（共{count}条 / {sites}站点中仅本站点）", { site: summary.siteId, count: summary.recordCount, sites: summary.siteCount });
  } else {
    els.scenarioHint.classList.add("show");
    els.scenarioHint.textContent = tr("qjzh.replay.local", "本地 24 小时模拟中");
  }
  updateReplaySiteLabel(false);
  if (els.scenarioSelect) {
    els.scenarioSelect.querySelectorAll("option").forEach((option, index) => {
      if (!originalLanguageText.has(option)) originalLanguageText.set(option, option.textContent);
      option.textContent = nextLanguage === "zh" ? originalLanguageText.get(option) : copy.scenario[index];
    });
  }
  if (els.languageSelect) {
    els.languageSelect.querySelectorAll("option").forEach((option, index) => {
      if (!originalLanguageText.has(option)) originalLanguageText.set(option, option.textContent);
      option.textContent = nextLanguage === "zh" ? originalLanguageText.get(option) : copy.languageOptions?.[index] || option.textContent;
    });
  }
  const importedForConfidence = window.QJZH?.dataImport?.importedRecords?.()[0];
  if (importedForConfidence) window.QJZH.dataImport.updateConfidence(window.QJZH.dataImport.validate(importedForConfidence));
  else window.QJZH?.dataImport?.resetConfidence?.();
  if (typeof trendChart !== "undefined") {
    const labels = nextLanguage === "zh" ? ["补偿NH₃ ppm", "原始NH₃ ppm", "温度 ℃", "湿度 %", "光照 Lux", "通风启动"] : nextLanguage === "en" ? ["Compensated NH₃ ppm", "Raw NH₃ ppm", "Temperature ℃", "Humidity %", "Light Lux", "Ventilation started"] : ["ཁ་གསབ NH₃ ppm", "ཐོག་མའི NH₃ ppm", "དྲོད་ཚད ℃", "རློན་ཚད %", "འོད་ཚད Lux", "རླུང་འགྲོ་འགོ་འཛུགས"];
    trendChart.data.datasets.forEach((dataset, index) => { if (labels[index]) dataset.label = labels[index]; });
    trendChart.update("none");
  }
  refreshDynamicLanguage();
  // 通知动态渲染层仅以当前采样状态重绘，不追加采样、曲线或历史记录。
  window.dispatchEvent(new CustomEvent("dashboard:language-change"));
}

// 采集状态和时间戳属于动态文本，按当前语言生成，避免下一次采样把界面切回中文。
const runtimeLanguageCopy = {
  zh: { collecting: "采集中", paused: "已暂停", pause: "暂停采集", resume: "继续采集", lastUpdate: "更新：" },
  en: { collecting: "Collecting", paused: "Paused", pause: "Pause collection", resume: "Resume collection", lastUpdate: "Update: " },
  bo: { collecting: "བསྡུ་ལེན་བྱེད་བཞིན་པ", paused: "མཚམས་བཞག", pause: "བསྡུ་ལེན་མཚམས་འཇོག", resume: "བསྡུ་ལེན་མུ་མཐུད", lastUpdate: "གསར་བཟོ། " }
};

function runtimeText(key) {
  return runtimeLanguageCopy[languageState.current]?.[key] || runtimeLanguageCopy.zh[key];
}

// 切换主题时同步 Chart.js 文本、网格与提示框，保证数据曲线在两种背景下都清晰。
function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  els.themeOptions.forEach((button) => {
    const active = button.dataset.themeValue === nextTheme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  try {
    localStorage.setItem("qjzh-theme", nextTheme);
  } catch (error) {
    console.warn("[主题切换] 无法保存主题偏好", error);
  }

  if (typeof trendChart === "undefined") return;
  const palette = nextTheme === "light"
    ? { axis: "#557184", grid: "rgba(35, 77, 98, 0.14)", tooltipBg: "rgba(255, 255, 255, 0.97)", tooltipBorder: "rgba(35, 77, 98, 0.18)", tooltipTitle: "#173345", tooltipBody: "#254354", markerBorder: "#173345" }
    : { axis: "#7A9BB5", grid: "rgba(255, 255, 255, 0.07)", tooltipBg: "rgba(11, 26, 42, 0.96)", tooltipBorder: "rgba(255, 255, 255, 0.12)", tooltipTitle: "#E8F0F8", tooltipBody: "#D7E4EE", markerBorder: "#E8F0F8" };
  const options = trendChart.options;
  options.plugins.legend.labels.color = palette.axis;
  options.plugins.tooltip.backgroundColor = palette.tooltipBg;
  options.plugins.tooltip.borderColor = palette.tooltipBorder;
  options.plugins.tooltip.titleColor = palette.tooltipTitle;
  options.plugins.tooltip.bodyColor = palette.tooltipBody;
  options.scales.x.ticks.color = palette.axis;
  options.scales.x.grid.color = palette.grid;
  options.scales.yAmmonia.grid.color = palette.grid;
  options.scales.yTemperature.ticks.color = nextTheme === "light" ? "#317ecf" : "#78B8FF";
  options.scales.yHumidity.ticks.color = nextTheme === "light" ? "#008f78" : "#39E0BE";
  options.scales.yLight.ticks.color = nextTheme === "light" ? "#9b7900" : "#D3A900";
  const markerSet = trendChart.data.datasets.find((dataset) => dataset.id === "ventilationMarkers");
  if (markerSet) markerSet.pointBorderColor = palette.markerBorder;
  trendChart.update("none");
}

function pushChartPoint(data) {
  state.labels.push(data.time);
  state.temperature.push(Number(data.temperature.toFixed(1)));
  state.humidity.push(Number(data.humidity.toFixed(0)));
  state.ammonia.push(Number(data.ammonia.toFixed(1)));
  state.rawAmmonia.push(Number(data.rawAmmonia.toFixed(1)));
  state.light.push(Number(data.light.toFixed(0)));

  if (state.labels.length > MAX_POINTS) {
    state.labels.shift();
    state.temperature.shift();
    state.humidity.shift();
    state.ammonia.shift();
    state.rawAmmonia.shift();
    state.light.shift();
  }

  trendChart.update();
  updateChartPointCount();
  updateTrendSummary();
  updateChartInsights();
}

// 根据最近 10 个氨气点生成趋势简评，强化数据洞察。
function updateTrendSummary() {
  const recent = state.ammonia.slice(-10);
  if (recent.length < 10) {
    els.trendSummary.textContent = `📊 ${tr("trend.collecting", "正在积累趋势数据，达到 10 个采样点后生成简评。")}`;
    return;
  }

  let rising = 0;
  let falling = 0;
  for (let i = 1; i < recent.length; i += 1) {
    if (recent[i] > recent[i - 1]) rising += 1;
    if (recent[i] < recent[i - 1]) falling += 1;
  }

  if (rising >= 7 && recent[recent.length - 1] > recent[0]) {
    els.trendSummary.textContent = `📈 ${tr("trend.rising", "氨气呈持续上升趋势，建议关注午间通风窗口。")}`;
  } else if (falling >= 7 && recent[recent.length - 1] < recent[0]) {
    els.trendSummary.textContent = `📉 ${tr("trend.falling", "氨气呈持续下降趋势，当前环境趋于稳定。")}`;
  } else {
    els.trendSummary.textContent = `📊 ${tr("trend.stable", "氨气波动平稳，未出现明显累积趋势。")}`;
  }
}

function updateTrendA11ySummary() {
  const summary = document.getElementById("trendA11ySummary");
  const canvas = document.getElementById("trendChart");
  if (canvas) canvas.setAttribute("aria-label", tr("trend.a11y.canvas", "最近 60 个采样点的环境趋势图"));
  if (!summary) return;
  if (state.ammonia.length === 0 || state.labels.length === 0) {
    summary.textContent = tr("trend.a11y.empty", "趋势图尚无采样数据。");
    return;
  }
  const recent = state.ammonia.slice(-10);
  const latest = recent[recent.length - 1];
  const max = Math.max(...state.ammonia);
  const delta = recent.length > 1 ? latest - recent[0] : 0;
  const directionKey = recent.length < 3
    ? "collecting"
    : delta > 0.5 ? "rising" : delta < -0.5 ? "falling" : "stable";
  const directionFallback = {
    collecting: "采集中",
    rising: "上升",
    falling: "下降",
    stable: "平稳"
  }[directionKey];
  const direction = tr("trend.a11y.direction." + directionKey, directionFallback);
  const risk = getSensorStatus("ammonia", latest).label;
  summary.textContent = tr(
    "trend.a11y.summary",
    "时间窗 {start}–{end}；补偿氨气最新 {latest} ppm、最高 {max} ppm；趋势{direction}；当前风险：{risk}。",
    {
      start: state.labels[0],
      end: state.labels[state.labels.length - 1],
      latest: latest.toFixed(1),
      max: max.toFixed(1),
      direction,
      risk
    }
  );
}

// 汇总最近 60 个采样点，学习监测平台常见的 min/max/avg 辅助读数。
function updateChartInsights() {
  if (state.ammonia.length === 0) return;
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const maxNh3 = Math.max(...state.ammonia);
  const humidCount = state.humidity.filter((value) => value > 80).length;

  els.insightAvgNh3.textContent = `${avg(state.ammonia).toFixed(1)} ppm`;
  els.insightMaxNh3.textContent = `${maxNh3.toFixed(1)} ppm`;
  els.insightAvgTemp.textContent = `${avg(state.temperature).toFixed(1)} ℃`;
  els.insightHumidCount.textContent = `${humidCount} ${tr("points", "点")}`;
}

function updateChartPointCount() {
  updateTrendA11ySummary();
  const count = document.getElementById("chartPointCount");
  if (count) count.textContent = tr("chart.points", `最近 ${state.labels.length} / ${MAX_POINTS} 点`, { count: state.labels.length, max: MAX_POINTS });
}

function refreshStreamStatus() {
  const imported = state.streamSource === "imported";
  if (state.streamPhase === "complete") {
    els.streamStatus.textContent = imported ? tr("qjzh.stream.importedComplete", "导入数据回放完成") : tr("simulation.complete", "24小时模拟完成");
    els.toggleStream.textContent = tr("simulation.restart", "重新运行模拟");
  } else if (state.running) {
    els.streamStatus.textContent = state.streamPhase === "booting" ? runtimeText("collecting") : imported ? tr("qjzh.stream.importedRunning", "导入数据回放中") : tr("simulation.running", "24小时模拟中");
    els.toggleStream.textContent = state.streamPhase === "booting" ? runtimeText("pause") : tr("simulation.pause", "暂停模拟");
  } else {
    els.streamStatus.textContent = tr("simulation.paused", "模拟已暂停");
    els.toggleStream.textContent = tr("simulation.resume", "继续模拟");
  }
}

function refreshDynamicLanguage() {
  refreshStreamStatus();
  updateChartPointCount();
  updateTrendSummary();
  updateChartInsights();
  renderSnapshots();
}
window.QJZH.refreshDynamicLanguage = refreshDynamicLanguage;

function tick() {
  const data = generateSensorData();
  state.currentData = data;
  updateSensorCards(data);
  const result = updateDecision(data);
  updateCalibration(data);
  pushRecord(data, result);
  pushChartPoint(data);
  els.lastUpdate.textContent = `${runtimeText("lastUpdate")}${data.time}`;
}

function setRunning(nextRunning) {
  state.running = nextRunning;
  state.streamPhase = nextRunning ? "booting" : "paused";
  els.streamStatus.textContent = nextRunning ? runtimeText("collecting") : runtimeText("paused");
  els.toggleStream.textContent = nextRunning ? runtimeText("pause") : runtimeText("resume");

  if (nextRunning) {
    tick();
    state.timer = window.setInterval(tick, SAMPLE_INTERVAL);
  } else {
    window.clearInterval(state.timer);
  }
}

els.languageSelect.addEventListener("change", (event) => applyLanguage(event.target.value));
// 支持演示链接携带 ?lang=zh|en|bo，未指定时仍沿用页面默认语言。
applyLanguage(new URLSearchParams(window.location.search).get("lang") || document.documentElement.dataset.language || "zh");

els.themeOptions.forEach((button) => {
  button.addEventListener("click", () => applyTheme(button.dataset.themeValue));
});
applyTheme(document.documentElement.dataset.theme || "dark");

els.toggleStream.addEventListener("click", () => setRunning(!state.running));
els.scenarioSelect.addEventListener("change", (event) => startScenario(event.target.value));
els.snapshotButton.addEventListener("click", saveSnapshot);

// 采集启动统一由本地知识库模拟器接管，避免旧随机流先写入一条不带决策依据的孤立数据。

// 本地知识库模拟接管原随机流：保留既有页面部件，只替换为可复现的24小时数据与决策。
(function startLocalKnowledgeBaseModel() {
  let controller = null;
  let scenarioEngine = null;
  let scenarioHistory = [];
  const modelErrors = [];

  function showRuntimeError(error) {
    const message = error && error.message ? error.message : String(error);
    console.error("[本地知识库启动失败]", modelErrors, error);
    let panel = document.getElementById("runtimeError");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "runtimeError";
      panel.className = "runtime-error";
      panel.setAttribute("role", "alert");
      document.body.appendChild(panel);
    }
    panel.textContent = `本地知识库加载失败（已重试3次）：${message}。完整错误日志已输出至控制台。`;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${url}?retry=${Date.now()}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载 ${url}`));
      document.head.appendChild(script);
    });
  }

  async function ensureDependency(globalName, url) {
    if (window[globalName]) return;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await loadScript(url);
        if (window[globalName]) return;
        throw new Error(`${url} 已加载但未导出 ${globalName}`);
      } catch (error) {
        modelErrors.push({ dependency: globalName, attempt, message: error.message, timestamp: new Date().toISOString() });
        console.warn(`[本地知识库] ${globalName} 第${attempt}次加载失败`, error);
      }
    }
    throw new Error(`${globalName} 连续3次加载失败`);
  }

  function clearDashboardData() {
    [state.labels, state.temperature, state.humidity, state.ammonia, state.rawAmmonia, state.light].forEach((list) => { list.length = 0; });
    state.records.length = 0;
    state.adviceHistory.length = 0;
    state.currentData = null;
    state.currentResult = null;
    els.recordRows.innerHTML = `<tr><td colspan="7">${tr("simulation.running", "24小时本地模拟启动中")}</td></tr>`;
    renderAdviceHistory();
  }

  function toLegacyResult(decision) {
    const urgency = decision.urgencyLevel || (decision.action === "ventilation" ? "warning" : "normal");
    const levelClass = urgency === "info" ? "caution" : urgency;
    const icons = { critical: "🔴", warning: "🟠", info: "🔵", normal: "🟢" };
    return {
      levelClass,
      icon: icons[urgency] || "🟢",
      title: decision.urgencyLabel || (decision.action === "ventilation" ? `通风 ${decision.duration} 分钟` : "保持关闭"),
      urgency
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  // 从已加载的知识库读取规则目录，只负责可视化，不复制或修改规则内容。
  function renderKnowledgeCatalog(catalog) {
    const container = document.getElementById("knowledgeRuleList");
    if (!container) return;
    const colors = ["#ff6b6b", "#ffd93d", "#16d6b0", "#4a9eff", "#b690ff"];
    const entries = Object.entries(catalog || {});
    if (entries.length === 0) {
      container.dataset.ready = "false";
      container.textContent = tr("knowledge.empty", "当前知识库未提供可展示的规则目录。");
      return;
    }
    container.dataset.ready = "true";
    container.innerHTML = entries.map(([id, rule], index) => `
      <article class="knowledge-rule-row" style="--rule-color:${colors[index % colors.length]}">
        <i class="knowledge-rule-accent"></i>
        <div>
          <span class="knowledge-rule-id">${escapeHtml(id)}</span>
          <strong class="knowledge-rule-name">${escapeHtml(localizedRuleCatalog(id, rule).title)}</strong>
          <span class="knowledge-rule-condition">${escapeHtml(localizedRuleCatalog(id, rule).condition)}</span>
          <span class="knowledge-rule-source">${escapeHtml(tr("knowledge.source", "依据"))}：${escapeHtml(localizedRuleCatalog(id, rule).source)}</span>
        </div>
      </article>
    `).join("");
  }

  function formatAdvice(value) {
    const safe = escapeHtml(value || tr("advice.normal", "暂无专家建议。"));
    return safe.replace(/(建议：|建议：[^。；]*|立即[^。；]*|清理粪污|检查北侧风口|保持圈舍密闭|建议开启保温设备)/g, "<strong>$1</strong>");
  }

  function adviceForDisplay(decision) {
    const advice = String(decision.humanAdvice || decision.reason || "暂无专家建议。");
    const mapped = window.QJZH?.mapAdvice ? window.QJZH.mapAdvice(advice) : advice;
    if (languageState.current === "zh") return mapped;
    const urgency = decision.urgencyLevel || "normal";
    return window.QJZH?.mapAdvice ? window.QJZH.mapAdvice(tr(`advice.${urgency}`, advice)) : tr(`advice.${urgency}`, advice);
  }

  function trendText(decision) {
    const slope = Number(decision.trendSlope || 0).toFixed(1);
    if (decision.trendWarning === "fast_rising") return tr("trend.fast", `氨气正在快速上升 ↑ · 斜率 +${slope} ppm/h`, { slope });
    if (decision.trendLabel === "缓慢上升") return tr("trend.slow", `氨气缓慢上升 ↗ · 斜率 +${slope} ppm/h`, { slope });
    if (decision.trendLabel === "下降") return tr("trend.down", `氨气趋势下降 ↓ · 斜率 ${slope} ppm/h`, { slope });
    return tr("trend.flat", "趋势平稳 · 暂无明显恶化迹象");
  }

  // 规则源文件保持中文可溯源，展示层依据规则 ID 输出对应语言，避免直接渲染知识库中的中文说明。
  function localizedRuleCatalog(id, rule = {}) {
    if (languageState.current === "zh") return {
      title: rule.title || "未命名规则",
      condition: rule.condition || "条件由知识库定义",
      source: rule.source || "本地知识库"
    };
    const entriesByLanguage = {
      en: {
        "KB-NH3-START": ["Ammonia high-risk start", "NH3 >= 15.5 ppm", "NY/T 388-1999 Livestock and Poultry Farm Environmental Quality Standard"],
        "KB-NH3-COMFORT": ["Ammonia comfort zone", "NH3 < 10 ppm", "NY/T 388-1999 Livestock and Poultry Farm Environmental Quality Standard"],
        "KB-NH3-HYSTERESIS": ["Ammonia hysteresis protection", "Start 15.5 ppm / stop 9.5 ppm", "Local knowledge-base rule to prevent frequent recommendation switching"],
        "KB-WINTER-VENT-WINDOW": ["Winter ventilation window", "Ventilation is recommended only from 12:00-14:00", "Local winter operation rule"],
        "KB-TEMP-DROP-3C": ["Temperature-drop safety limit", "Pause ventilation when one-event drop is >= 3 C", "Local temperature-drop safety rule"]
      },
      bo: {
        "KB-NH3-START": ["ཨམ་མོ་ནི་ཡ་ཉེན་ཁ་མཐོ་བའི་འགོ་ཚུགས", "NH₃ >= 15.5 ppm", "NY/T 388-1999 ཕྱུགས་རིགས་གསོ་སྤེལ་ར་བའི་ཁོར་ཡུག་སྤུས་ཚད"],
        "KB-NH3-COMFORT": ["ཨམ་མོ་ནི་ཡ་བདེ་འཇགས་ཁུལ", "NH₃ < 10 ppm", "NY/T 388-1999 ཕྱུགས་རིགས་གསོ་སྤེལ་ར་བའི་ཁོར་ཡུག་སྤུས་ཚད"],
        "KB-NH3-HYSTERESIS": ["ཨམ་མོ་ནི་ཡའི་ཕྱིར་འགྱངས་སྲུང་སྐྱོབ", "15.5 ppm ལ་འགོ་ཚུགས / 9.5 ppm ལ་མཚམས་འཇོག", "བསམ་འཆར་ཡང་ཡང་འགྱུར་བ་འགོག་པའི་ས་གནས་སྒྲིག་གཞི"],
        "KB-WINTER-VENT-WINDOW": ["དགུན་དུས་རླུང་འགྲོའི་དུས་སྐབས", "12:00–14:00 བར་ཁོ་ནར་རླུང་འགྲོའི་བསམ་འཆར", "ས་གནས་དགུན་དུས་ལས་སྤྱོད་སྒྲིག་གཞི"],
        "KB-TEMP-DROP-3C": ["དྲོད་ཚད་མར་ཆག་གི་བདེ་འཇགས་ཚད", "ཐེངས་གཅིག་གི་མར་ཆག >= 3℃ ཡིན་ན་རླུང་འགྲོ་རེ་ཞིག་མཚམས་འཇོག", "ས་གནས་དྲོད་ཚད་མར་ཆག་བདེ་འཇགས་སྒྲིག་གཞི"]
      }
    };
    const entries = entriesByLanguage[languageState.current] || entriesByLanguage.en;
    const item = entries[id] || [tr("knowledge.untitled", "未命名规则"), tr("knowledge.condition", "条件由知识库定义"), tr("knowledge.local", "本地知识库")];
    return { title: item[0], condition: item[1], source: item[2] };
  }

  function localizedCitation(decision) {
    const ruleMap = {
      TEMP_DROP_LIMIT: "KB-TEMP-DROP-3C",
      NH3_WINDOW_LOCK: "KB-NH3-START",
      WINDOW_LOCK: "KB-WINTER-VENT-WINDOW",
      NH3_HYSTERESIS_STOP: "KB-NH3-HYSTERESIS",
      NH3_HIGH: "KB-NH3-START",
      NH3_HYSTERESIS_HOLD: "KB-NH3-HYSTERESIS",
      NH3_NORMAL: "KB-NH3-COMFORT",
      NH3_LEVEL_TWO: "KB-NH3-START"
    };
    if (languageState.current === "zh") return decision.citation || "本地知识库规则";
    const id = ruleMap[decision.ruleId] || decision.ruleId;
    const source = localizedRuleCatalog(id).source;
    return `${id || "LOCAL_RULE"} · ${source}`;
  }

  function renderAdviceHistory() {
    els.adviceHistoryCount.textContent = `${state.adviceHistory.length} / ${MAX_ADVICE_LOG}`;
    if (state.adviceHistory.length === 0) {
      els.adviceHistoryLog.innerHTML = `<div class="advice-history-empty">${tr("knowledge.historyEmpty", "重要建议将在模拟推进后记录。")}</div>`;
      return;
    }
    els.adviceHistoryLog.innerHTML = state.adviceHistory.map((item) => `
      <article class="advice-log-item" role="listitem" style="--log-color:${escapeHtml(item.color)}">
        <i class="advice-log-accent"></i>
        <time class="advice-log-time">${escapeHtml(item.time)}</time>
        <div class="advice-log-copy"><strong>${escapeHtml(localizedUrgency(item.decision?.urgencyLevel, item.label))}</strong> · ${formatAdvice(adviceForDisplay(item.decision || item))}<br><span>${escapeHtml(tr("knowledge.citation", "依据"))}：${escapeHtml(localizedCitation(item.decision || item))} · ${escapeHtml(item.ruleId)}</span></div>
      </article>
    `).join("");
  }

  function appendAdviceHistory(data, decision) {
    const important = decision.urgencyLevel !== "normal" || decision.trendWarning || decision.action === "ventilation";
    if (!important) return;
    state.adviceHistory.unshift({
      time: data.time,
      label: decision.urgencyLabel || "关注提示",
      decision,
      ruleId: decision.ruleId || "LOCAL_RULE",
      color: decision.urgencyColor || "#1976D2"
    });
    state.adviceHistory = state.adviceHistory.slice(0, MAX_ADVICE_LOG);
    renderAdviceHistory();
  }

  function localizedUrgency(urgency, zhFallback) {
    return tr(`urgency.${urgency || "info"}`, zhFallback || "关注提示");
  }

  // 模拟器第二个参数是采样序号；只有显式传入 true 才表示语言切换的仅刷新模式。
  // 这样不会把第 1-23 个采样序号误判为 refreshOnly，导致曲线和决策日志只保留第一个点。
  function updateKnowledgeUI(record, sampleIndexOrRefresh = 0) {
    const refreshOnly = sampleIndexOrRefresh === true;
    const scenarioActive = state.scenario.type !== "normal";
    const data = refreshOnly ? record : (scenarioActive ? applyScenario(record) : record);
    let decision = refreshOnly ? (record.decision || state.currentDecision) : record.decision;
    if (!refreshOnly && scenarioActive && scenarioEngine) {
      // 只用已加载的决策引擎推理场景覆盖数据，不更改知识库与补偿模型本身。
      decision = scenarioEngine.decide(
        data.hour,
        data.temperature,
        data.ammonia,
        data.humidity,
        data.tempDropRate,
        scenarioHistory.slice(-3)
      );
      scenarioHistory.push(data.ammonia);
      scenarioHistory = scenarioHistory.slice(-3);
    }
    const result = toLegacyResult(decision);
    const risk = clamp((data.ammonia / 30) * 100, 3, 100);
    const riskColor = getRiskColor(data.ammonia);
    const fanOn = decision.action === "ventilation";

    state.currentData = data;
    state.currentResult = result;
    state.currentDecision = decision;
    updateSensorCards(data);
    updateCalibration(data);
    els.decisionPanel.dataset.level = result.levelClass;
    els.decisionIcon.textContent = result.icon;
    els.decisionTitle.textContent = localizedLevel(result.levelClass, result.title);
    els.decisionAdvice.innerHTML = `
      <div class="action-step"><span class="step-index">1</span><span><span class="step-status">${fanOn ? `● ${tr("step.completed", "建议已生成")}` : `▶ ${tr("step.monitoring", "监测中")}`}</span>${formatAdvice(adviceForDisplay(decision))}</span></div>
      <div class="action-step"><span class="step-index">2</span><span><span class="step-status">${tr("step.trend", "趋势")}</span>${escapeHtml(trendText(decision))}</span></div>
      <div class="action-step"><span class="step-index">3</span><span><span class="step-status">${tr("step.basis", "依据")}</span>${escapeHtml(localizedCitation(decision))}</span></div>`;
    els.decisionTrigger.innerHTML = `
      <span class="trigger-chip">${tr("trigger.time", "时刻")}：<strong>${data.time}</strong></span>
      <span class="trigger-chip">${tr("trigger.ammonia", "氨气")}：<strong style="--chip-color:${riskColor}">${data.ammonia.toFixed(1)}ppm</strong></span>
      <span class="trigger-chip">${tr("trigger.tempDrop", "温降")}：<strong style="--chip-color:var(--temperature)">${data.tempDropRate.toFixed(1)}℃</strong></span>`;
    // 以同一组已补偿数据刷新解释链，保留决策引擎实际命中的规则 ID 作为溯源证据。
    renderRuleMatchChain(data, decision);
    els.riskRing.style.setProperty("--risk", `${risk}%`);
    els.riskRing.style.setProperty("--ring-color", riskColor);
    els.riskPointer.style.setProperty("--pointer", `${risk}%`);
    els.ringValue.textContent = data.ammonia.toFixed(1);
    els.ventTimeline.style.setProperty("--now", `${(data.hour / 24) * 100}%`);
    els.ventStatus.textContent = decision.inWindow ? tr("vent.inside", "当前在窗口内") : tr("vent.outside", "当前不在窗口内");
    els.ventAdvice.textContent = fanOn
      ? tr("vent.active", `建议 ${decision.duration} 分钟短时通风，持续监测温度降幅。`, { duration: decision.duration })
      : decision.action === "alert_only" ? tr("vent.alertOnly", "仅输出建议，请人工复核。") : tr("vent.standby", "保持巡检，继续监测。");
    els.fanStatusText.textContent = fanOn ? tr("status.watch", "关注") : tr("status.riskPending", "等待判断");
    els.fanStatusDot.style.setProperty("--state-color", fanOn ? "#00D4AA" : "#7A9BB5");
    els.fanIcon.classList.toggle("spin", fanOn);
    els.heaterStatusText.textContent = data.temperature < 0 ? tr("status.recommendInsulation", "建议保温") : tr("status.recommendation", "待生成");
    els.heaterStatusDot.style.setProperty("--state-color", data.temperature < 0 ? "#FF4D5E" : "#7A9BB5");
    els.commandText.textContent = fanOn
      ? tr("knowledge.activeVent", `建议：${decision.duration} 分钟短时通风`, { duration: decision.duration })
      : decision.action === "alert_only" ? tr("knowledge.alertOnly", "仅输出建议，请人工复核") : tr("knowledge.standby", "保持巡检，继续监测");
    els.alarmList.innerHTML = `<div class="alarm-item"><i class="alarm-dot" style="--alarm-color:${fanOn ? "#00D4AA" : "#FF9F43"};"></i><span>${escapeHtml(decision.ruleId)} · ${escapeHtml(localizedCitation(decision))}</span></div>`;
    const sourceLabel = data.source === "imported" ? tr("qjzh.replay.source", "导入数据 · {site}", { site: data.siteId || "本地站点" }) : tr("simulation.data", "本地模拟数据");
    els.flowCollect.textContent = `${data.time} · ${sourceLabel}`;
    els.flowCompensate.textContent = tr("pipeline.compensate", `${data.pressure.toFixed(1)}kPa · NH₃ ${data.rawAmmonia.toFixed(1)}→${data.ammonia.toFixed(1)}`, { pressure: data.pressure.toFixed(1), raw: data.rawAmmonia.toFixed(1), corrected: data.ammonia.toFixed(1) });
    els.flowDecision.textContent = `${result.icon} ${localizedLevel(result.levelClass, result.title)}`;
    els.flowExecute.textContent = fanOn ? tr("simulation.fanRun", `建议短时通风 / ${decision.duration}分钟`, { duration: decision.duration }) : tr("simulation.standby", "建议待生成");
    els.decisionResult.dataset.action = decision.action;
    els.decisionResult.dataset.urgency = result.urgency;
    els.decisionResult.style.setProperty("--urgency-color", decision.urgencyColor || "#388E3C");
    els.adviceUrgencyBadge.textContent = localizedUrgency(decision.urgencyLevel, result.title);
    els.adviceUrgencyBadge.style.background = decision.urgencyColor || "#388E3C";
    els.expertAdviceText.innerHTML = formatAdvice(adviceForDisplay(decision));
    els.adviceTrendStatus.innerHTML = `<i class="trend-status-indicator"></i><span>${escapeHtml(trendText(decision))}</span>`;
    els.adviceCitation.textContent = `${tr("knowledge.citation", "依据")}：${localizedCitation(decision)}`;
    els.adviceRuleId.textContent = `${tr("knowledge.ruleId", "触发规则 ID")}：${decision.ruleId || "LOCAL_RULE"}`;
    els.adviceScenarioKey.textContent = `${tr("knowledge.scenario", "场景")}：${decision.adviceKey || tr("knowledge.default", "默认降级")}`;
    els.activeRuleId.textContent = decision.ruleId || "LOCAL_RULE";
    els.activeRuleAction.textContent = decision.action === "ventilation"
      ? tr("knowledge.activeVent", `建议 ${decision.duration || 0} 分钟短时通风`, { duration: decision.duration || 0 })
      : decision.action === "alert_only" ? tr("knowledge.alertOnly", "仅输出建议，请人工复核") : tr("knowledge.standby", "保持巡检，继续监测");
    els.activeRuleCitation.textContent = localizedCitation(decision);
    if (!refreshOnly) {
      appendAdviceHistory(data, decision);
      pushRecord(data, result);
      pushChartPoint(data, decision);
    } else {
      renderAdviceHistory();
      renderSnapshots();
      updateTrendSummary();
      updateChartInsights();
    }
    els.lastUpdate.textContent = tr("simulation.time", `模拟时刻：${data.time}`, { time: data.time });
    console.log("[本地知识库决策]", data.time, decision);
  }

  pushChartPoint = function (data, decision) {
    state.labels.push(data.time);
    state.temperature.push(Number(data.temperature.toFixed(1)));
    state.humidity.push(Number(data.humidity.toFixed(0)));
    state.ammonia.push(Number(data.ammonia.toFixed(1)));
    state.rawAmmonia.push(Number(data.rawAmmonia.toFixed(1)));
    state.light.push(Number(data.light.toFixed(0)));
    const marker = decision && decision.action === "ventilation" ? Number(data.ammonia.toFixed(1)) : null;
    const markerSet = trendChart.data.datasets.find((dataset) => dataset.id === "ventilationMarkers");
    if (markerSet) markerSet.data.push(marker);
    if (state.labels.length > MAX_POINTS) {
      [state.labels, state.temperature, state.humidity, state.ammonia, state.rawAmmonia, state.light].forEach((list) => list.shift());
      if (markerSet) markerSet.data.shift();
    }
    trendChart.update();
    updateChartPointCount();
    updateTrendSummary();
    updateChartInsights();
  };

  function configureDecisionMarkers() {
    if (!trendChart.data.datasets.some((dataset) => dataset.id === "ventilationMarkers")) {
      trendChart.data.datasets.push({
        id: "ventilationMarkers",
        label: tr("marker.vent", "通风启动"),
        data: [],
        showLine: false,
        borderColor: "#00D4AA",
        backgroundColor: "#00D4AA",
        pointBackgroundColor: "#00D4AA",
        pointBorderColor: "#E8F0F8",
        pointBorderWidth: 2,
        pointRadius: 6,
        yAxisID: "yAmmonia"
      });
    }
  }

  function getNextSample(previousTemperature, siteId) {
    const imported = window.QJZH?.dataImport?.nextRecord?.(siteId);
    if (!imported) return null;
    const timestamp = String(imported.timestamp || "");
    const time = timestamp.length >= 16 ? timestamp.slice(11, 16) : "--:--";
    const hour = Number(time.slice(0, 2)) + Number(time.slice(3, 5) || 0) / 60;
    const temperature = Number(imported.temp_c);
    const humidity = Number(imported.rh_percent);
    const altitude = Number(imported.altitude_m);
    const rawAmmonia = Number(imported.raw_nh3_ppm);
    const ammonia = Number(window.compensate(altitude, temperature, humidity, rawAmmonia));
    return {
      hour: Number.isFinite(hour) ? hour : 0,
      time,
      timestamp,
      siteId: String(imported.site_id || "未命名站点"),
      temperature,
      ammonia,
      referenceAmmonia: ammonia,
      modelAmmonia: ammonia,
      rawAmmonia,
      humidity,
      altitude,
      pressure: Number(window.LocalSimulator.estimatePressureKpa(altitude).toFixed(1)),
      light: 100,
      tempDropRate: previousTemperature == null ? 0 : Number((previousTemperature - temperature).toFixed(1)),
      source: "imported"
    };
  }

  function runImportedReplay(engine, updateUICallback) {
    const summary = window.QJZH?.dataImport?.replaySummary?.() || { siteId: "", recordCount: 0, siteCount: 0 };
    const siteId = summary.siteId;
    const count = summary.recordCount;
    window.QJZH?.dataImport?.resetCursor?.();
    updateReplaySiteLabel(false);
    if (typeof engine.reset === "function") engine.reset();
    let index = 0;
    let previousTemperature = null;
    let timer = null;
    let stopped = false;
    const historyNh3 = [];
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    function advance() {
      if (stopped) return;
      if (index >= count) { resolveDone({ source: "imported", count }); return; }
      const sample = getNextSample(previousTemperature, siteId);
      if (!sample) { resolveDone({ source: "imported", count: index }); return; }
      sample.decision = engine.decide(sample.hour, sample.temperature, sample.ammonia, sample.humidity, sample.tempDropRate, historyNh3.slice(-2));
      historyNh3.push(sample.ammonia);
      previousTemperature = sample.temperature;
      updateUICallback(sample, index);
      index += 1;
      timer = window.setTimeout(advance, 1000);
    }
    advance();
    return { stop: function () { stopped = true; window.clearTimeout(timer); }, done, siteId };
  }

  function stopSimulation() {
    if (controller) controller.stop();
    controller = null;
    state.running = false;
    state.streamPhase = "paused";
    els.streamStatus.textContent = tr("simulation.paused", "模拟已暂停");
    els.toggleStream.textContent = tr("simulation.resume", "继续模拟");
  }

  function beginSimulation(engine) {
    stopSimulation();
    // boot/import/storage/scenario events can also arrive outside overview.
    const view = window.QJZH?.viewRouter?.current?.() || String(window.location.hash).replace(/^#\/?/, "").split(/[?&]/)[0];
    if (["data", "algorithm", "decision", "institution", "report"].includes(view)) return;
    clearDashboardData();
    configureDecisionMarkers();
    const useImported = Boolean(window.QJZH?.dataImport?.useImported?.());
    state.streamSource = useImported ? "imported" : "simulation";
    if (useImported) {
      state.scenario.type = "normal";
      els.scenarioSelect.value = "normal";
      els.scenarioHint.classList.add("show");
      const summary = window.QJZH.dataImport.replaySummary();
      els.scenarioHint.textContent = tr("qjzh.replay.active", "正在回放：{site}（共{count}条 / {sites}站点中仅本站点）", { site: summary.siteId, count: summary.recordCount, sites: summary.siteCount });
    } else {
      els.scenarioHint.classList.add("show");
      els.scenarioHint.textContent = tr("qjzh.replay.local", "本地 24 小时模拟中");
    }
    state.running = true;
    state.streamPhase = "running";
    els.streamStatus.textContent = useImported ? tr("qjzh.stream.importedRunning", "导入数据回放中") : tr("simulation.running", "24小时模拟中");
    els.toggleStream.textContent = tr("simulation.pause", "暂停模拟");
    controller = useImported ? runImportedReplay(engine, updateKnowledgeUI) : window.LocalSimulator.runSimulation(engine, updateKnowledgeUI);
    const activeController = controller;
    activeController.done.then(() => {
      if (controller !== activeController) return;
      controller = null;
      if (state.running) {
        state.running = false;
        state.streamPhase = "complete";
        els.streamStatus.textContent = useImported ? tr("qjzh.stream.importedComplete", "导入数据回放完成") : tr("simulation.complete", "24小时模拟完成");
        els.toggleStream.textContent = tr("simulation.restart", "重新运行模拟");
        if (useImported) updateReplaySiteLabel(true);
      }
    });
  }

  async function boot() {
    try {
      await ensureDependency("LocalKnowledgeBase", "knowledgeBase.js");
      await ensureDependency("DecisionEngine", "decisionEngine.js");
      await ensureDependency("LocalSimulator", "simulator.js");
      window.clearInterval(state.timer);
      state.timer = null;
      const engine = new window.DecisionEngine("犊牦牛");
      scenarioEngine = new window.DecisionEngine("犊牦牛");
      window.addEventListener("dashboard:scenario-change", () => {
        scenarioHistory = [];
        scenarioEngine.reset();
        // 场景切换后重新从第一个采样点运行，保证演示不会停留在上一轮24小时序列末尾。
        beginSimulation(engine);
      });
      window.addEventListener("qjzh:data-imported", () => {
        state.scenario.type = "normal";
        scenarioHistory = [];
        beginSimulation(engine);
      });
      window.addEventListener("qjzh:data-synced", () => {
        state.scenario.type = "normal";
        scenarioHistory = [];
        beginSimulation(engine);
      });
      window.addEventListener("dashboard:language-change", () => {
        renderKnowledgeCatalog(window.LocalKnowledgeBase?.RULE_CATALOG);
        if (state.currentData && state.currentDecision) {
          updateKnowledgeUI({ ...state.currentData, decision: state.currentDecision }, true);
        }
      });
      renderKnowledgeCatalog(window.LocalKnowledgeBase.RULE_CATALOG);
      const report = window.LocalSimulator.runSelfCheck(engine);
      if (!report.hysteresisStable || !report.temperaturePriority || !report.expertAdviceAtNight || !report.morningAdvice || !report.fastTrendWarning) {
        throw new Error("自检未通过：滞回、温降优先级或专家建议字段异常");
      }
      setRunning = function (nextRunning) {
        if (nextRunning) beginSimulation(engine);
        else stopSimulation();
      };
      window.QJZH.simulatorControl = {
        stop: stopSimulation,
        restart: function () { if (!controller) beginSimulation(engine); }
      };
      beginSimulation(engine);
    } catch (error) {
      showRuntimeError(error);
    }
  }

  boot();
})();
