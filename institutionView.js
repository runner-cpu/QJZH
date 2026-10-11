/* Institution dashboard: five deterministic Qinghai demo barns plus local imports. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var demo = [
    { site_id: "QH-HD-001", name: "海东示范圈舍", altitude_m: 2620, species: "犊牦牛", calibrated_nh3_ppm: 8.4, risk_level: "正常", sample_count: 36 },
    { site_id: "QH-XN-002", name: "西宁城郊圈舍", altitude_m: 2260, species: "奶牛", calibrated_nh3_ppm: 11.8, risk_level: "关注", sample_count: 36 },
    { site_id: "QH-HZ-003", name: "海北牧场圈舍", altitude_m: 3150, species: "牦牛", calibrated_nh3_ppm: 15.6, risk_level: "待办", sample_count: 36 },
    { site_id: "QH-HN-004", name: "海南合作社圈舍", altitude_m: 2900, species: "肉牛", calibrated_nh3_ppm: 6.2, risk_level: "正常", sample_count: 36 },
    { site_id: "QH-GL-005", name: "果洛高原圈舍", altitude_m: 3500, species: "犊牦牛", calibrated_nh3_ppm: 21.3, risk_level: "紧急", sample_count: 36 }
  ];
  var DEMO_NAMES = {
    en: {
      "QH-HD-001": "Haidong Demonstration Barn",
      "QH-XN-002": "Xining Suburban Barn",
      "QH-HZ-003": "Haibei Pasture Barn",
      "QH-HN-004": "Hainan Cooperative Barn",
      "QH-GL-005": "Golog Plateau Barn"
    },
    bo: {
      "QH-HD-001": "མཚོ་ཤར་དཔེ་སྟོན་ཕྱུགས་ཁང",
      "QH-XN-002": "ཟི་ལིང་ཉེ་འདབས་ཕྱུགས་ཁང",
      "QH-HZ-003": "མཚོ་བྱང་འབྲོག་ར་ཕྱུགས་ཁང",
      "QH-HN-004": "མཚོ་ལྷོ་མཉམ་ལས་ཕྱུགས་ཁང",
      "QH-GL-005": "མགོ་ལོག་མཐོ་སྒང་ཕྱུགས་ཁང"
    }
  };
  var SPECIES_NAMES = {
    en: { "犊牦牛": "Yak calves", "奶牛": "Dairy cattle", "牦牛": "Yak", "肉牛": "Beef cattle" },
    bo: { "犊牦牛": "གཡག་ཕྲུག", "奶牛": "འོ་མའི་བ་གླང", "牦牛": "གཡག", "肉牛": "ཤ་ཕྱུགས" }
  };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"'=]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;", "=": "&#61;" }[c]; }); }
  function read(key) {
    try {
      if (q.storage && typeof q.storage.get === "function") return q.storage.get(key);
      return JSON.parse(root.localStorage.getItem(key) || "null");
    } catch (_) { return null; }
  }
  function language() { return root.document?.documentElement?.dataset?.language || "zh"; }
  function numeric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string" || value.trim() === "" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return NaN;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  function localizedFields(row, selectedLanguage) {
    var lang = selectedLanguage || language();
    return {
      name: DEMO_NAMES[lang]?.[row.site_id] || row.name || row.site_id || "-",
      species: SPECIES_NAMES[lang]?.[row.species] || row.species || "-"
    };
  }
  function roleLabels() {
    if (language() === "en") return { station: "Livestock station", analyst: "Regional analyst", cooperative: "Cooperative" };
    if (language() === "bo") return { station: "ཕྱུགས་ལས་ས་ཚིགས", analyst: "ས་ཁུལ་དཔྱད་ཞིབ་མཁན", cooperative: "མཉམ་ལས་ཁང" };
    return { station: "畜牧站", analyst: "区域分析", cooperative: "合作社" };
  }
  function riskLabel(value) {
    var labels = language() === "en"
      ? { "正常": "Normal", "关注": "Watch", "待办": "To-do", "紧急": "Urgent", "未评估": "Unassessed" }
      : language() === "bo"
        ? { "正常": "རྒྱུན་ལྡན", "关注": "དོ་སྣང", "待办": "བྱ་དགོས", "紧急": "ཛ་དྲག", "未评估": "དཔྱད་མེད" }
        : {};
    return labels[value] || value;
  }
  function risk(nh3) {
    var value = numeric(nh3);
    try {
      if (q.riskPolicy && typeof q.riskPolicy.classifyNh3 === "function") {
        var policy = q.riskPolicy.classifyNh3(value);
        if (policy && policy.label) return policy.label;
      }
    } catch (_) {}
    if (!Number.isFinite(value)) return "未评估";
    return value > 15 ? "紧急" : value >= 10 ? "关注" : "正常";
  }
  function deriveRow(input) {
    var row = input && typeof input === "object" ? Object.assign({}, input) : {};
    var rawInputs = [row.altitude_m, row.temp_c, row.rh_percent, row.raw_nh3_ppm].map(numeric);
    if (rawInputs.every(Number.isFinite) && typeof root.compensate === "function") {
      try {
        var calibrated = Number(root.compensate(rawInputs[0], rawInputs[1], rawInputs[2], rawInputs[3]));
        if (Number.isFinite(calibrated)) row.calibrated_nh3_ppm = calibrated;
        else row.calibration_status = "unavailable";
      } catch (_) {
        row.calibration_status = "unavailable";
      }
    } else if (row.calibrated_nh3_ppm != null) {
      var legacyCalibrated = numeric(row.calibrated_nh3_ppm);
      if (Number.isFinite(legacyCalibrated)) row.calibrated_nh3_ppm = legacyCalibrated;
      else row.calibration_status = "unavailable";
    }
    row.risk_level = risk(row.calibrated_nh3_ppm);
    return row;
  }
  function getRows(mode) {
    var imported = read("QJZH_INSTITUTIONS");
    var demoCopy = demo.map(deriveRow);
    var importedCopy = [];
    if (q.dataImport && typeof q.dataImport.getRecords === "function") {
      try { importedCopy = aggregateRecords(q.dataImport.getRecords()); } catch (_) { importedCopy = []; }
    } else if (Array.isArray(imported)) importedCopy = imported.filter(function (row) { return row && typeof row === "object"; }).map(deriveRow);
    if (mode === "demo") return demoCopy;
    if (mode === "imported") return importedCopy;
    return importedCopy.length ? importedCopy : demoCopy;
  }
  function aggregateRecords(records) {
    var sites = new Map();
    (Array.isArray(records) ? records : []).forEach(function (record) {
      if (!record || typeof record !== "object") return;
      var siteId = String(record.site_id == null ? "" : record.site_id).trim();
      if (record.timestamp == null || String(record.timestamp).trim() === "") return;
      var timestamp = new Date(record.timestamp).getTime();
      if (!siteId || !Number.isFinite(timestamp)) return;
      var previous = sites.get(siteId);
      var previousTime = previous ? new Date(previous.timestamp || 0).getTime() : NaN;
      var latest = !previous || timestamp >= previousTime ? record : previous;
      sites.set(siteId, Object.assign({}, latest, { site_id: siteId, name: siteId, sample_count: (previous ? previous.sample_count : 0) + 1 }));
    });
    return Array.from(sites.values()).map(deriveRow);
  }
  function filterRows(rows, query) {
    var term = String(query || "").trim().toLocaleLowerCase();
    if (!term) return rows.slice();
    return rows.filter(function (row) {
      var values = [row.site_id, row.name, row.species];
      ["en", "bo"].forEach(function (lang) {
        var display = localizedFields(row, lang);
        values.push(display.name, display.species);
      });
      return values.some(function (value) { return String(value || "").toLocaleLowerCase().indexOf(term) >= 0; });
    });
  }
  function render() {
    var rows = getRows();
    var body = root.document && root.document.getElementById("institutionRows");
    var summary = root.document && root.document.getElementById("institutionSummary");
    var detail = root.document && root.document.getElementById("institutionRoleDetail");
    var filter = root.document && root.document.getElementById("institutionFilter");
    var roleNode = root.document && root.document.getElementById("institutionRole");
    var role = roleNode ? roleNode.value : "station";
    if (roleNode) Array.from(roleNode.options).forEach(function (option) { option.textContent = roleLabels()[option.value] || option.textContent; });
    rows = filterRows(rows, filter && filter.value);
    rows.sort(function (a, b) {
      var aValue = numeric(a.calibrated_nh3_ppm), bValue = numeric(b.calibrated_nh3_ppm);
      return (Number.isFinite(bValue) ? bValue : -Infinity) - (Number.isFinite(aValue) ? aValue : -Infinity);
    });
    if (body) body.innerHTML = rows.map(function (r) {
      var snapshot = language() === "en" ? "Demo snapshot" : language() === "bo" ? "དཔེ་སྟོན་མྱུར་བཀོད" : "演示快照";
      var display = localizedFields(r);
      var altitude = numeric(r.altitude_m);
      var altitudeText = Number.isFinite(altitude) ? altitude + " m" : "—";
      var calibrated = numeric(r.calibrated_nh3_ppm);
      var calibratedText = Number.isFinite(calibrated) ? calibrated.toFixed(1) + " ppm" : riskLabel("未评估");
      return "<tr><td>" + esc(display.name) + "</td><td>" + esc(altitudeText) + "</td><td>" + esc(display.species) + "</td><td>" + esc(calibratedText) + "</td><td>" + esc(riskLabel(r.risk_level || risk(r.calibrated_nh3_ppm))) + "</td><td>" + esc(r.timestamp || snapshot) + "</td></tr>";
    }).join("");
    var calibratedValues = rows.map(function (r) { return numeric(r.calibrated_nh3_ppm); }).filter(Number.isFinite);
    var compliant = calibratedValues.filter(function (value) { return value < 10; }).length;
    var warnings = calibratedValues.filter(function (value) { return value >= 10; }).length;
    var unassessed = rows.length - calibratedValues.length;
    var average = calibratedValues.length ? (calibratedValues.reduce(function (s, value) { return s + value; }, 0) / calibratedValues.length).toFixed(1) : "—";
    var coverage = calibratedValues.length ? Math.round(compliant / calibratedValues.length * 100) : 0;
    var unassessedText = language() === "en" ? " · " + unassessed + " unassessed" : language() === "bo" ? " · དཔྱད་མེད " + unassessed : " · 未评估 " + unassessed + " 个";
    var species = Array.from(new Set(rows.map(function (r) { return localizedFields(r).species || "未标注"; }))).join(language() === "en" ? ", " : "、");
    var sampleCount = rows.reduce(function (sum, r) {
      var count = Number(r.sample_count);
      return sum + (Number.isFinite(count) && count > 0 ? Math.floor(count) : 1);
    }, 0);
    if (summary) {
      summary.className = "qjzh-data-state qjzh-state";
      if (language() === "en") summary.textContent = role === "analyst"
        ? "Analysis view: species " + species + " · " + sampleCount + " samples · grouped for regional comparison"
        : role === "cooperative"
          ? "Cooperative barns: " + rows.length + " sites · " + warnings + " need attention · export a cooperative report"
          : "Regional summary: low-risk sites " + coverage + "% · sites needing attention " + warnings + " · average NH3 " + average + " ppm" + unassessedText;
      else if (language() === "bo") summary.textContent = role === "analyst"
        ? "ས་ཁུལ་དཔྱད་ཞིབ། ཕྱུགས་རིགས " + species + " · དཔེ་ཚད " + sampleCount
        : role === "cooperative"
          ? "མཉམ་ལས་ཁང་ཕྱུགས་ཁང " + rows.length + " · དོ་སྣང " + warnings
          : "ས་ཁུལ་སྙིང་བསྡུས། ཚད་ལོངས " + coverage + "% · NH3 " + average + " ppm" + unassessedText;
      else summary.textContent = role === "analyst"
        ? "区域分析：畜种 " + species + " · 样本 " + sampleCount + " 条 · 用于不同站点的数据比较"
        : role === "cooperative"
          ? "合作社多圈舍：共 " + rows.length + " 个站点 · " + warnings + " 个需关注 · 建议导出合作社环境报告"
          : "区域汇总：低风险站点占比 " + coverage + "% · 需关注站点 " + warnings + " 个 · 平均氨气 " + average + " ppm" + unassessedText;
    }
    if (detail) {
      if (language() === "en") detail.textContent = role === "analyst" ? "Regional-analysis role: prioritize species distribution and sample counts for comparison." : role === "cooperative" ? "Cooperative role: multi-barn list first, with cooperative report export." : "Livestock-station role: regional summary first, sorted by ammonia risk.";
      else if (language() === "bo") detail.textContent = role === "analyst"
        ? "ས་ཁུལ་དཔྱད་ཞིབ་ལས་འགན། ཕྱུགས་རིགས་དང་དཔེ་ཚད་བསྡུར་བར་སྔོན་དུ་སྟོན།"
        : role === "cooperative"
          ? "མཉམ་ལས་ཁང་ལས་འགན། ཕྱུགས་ཁང་རེའུ་མིག་དང་སྙན་ཞུ་ཕྱིར་འདྲེན།"
          : "ཕྱུགས་ལས་ས་ཚིགས། ས་ཁུལ་སྙིང་བསྡུས་དང་ཉེན་ཁ་རིམ་སྒྲིག";
      else detail.textContent = role === "analyst"
        ? "区域分析视角：优先呈现畜种分布和样本量，便于横向比较。"
        : role === "cooperative"
          ? "合作社角色：优先查看多圈舍列表，导出按钮将生成合作社环境报告。"
          : "畜牧站角色：区域汇总优先，列表按氨气风险从高到低排列。";
    }
    return rows;
  }
  function importLocal() {
    return render();
  }
  function exportReport() {
    var rows = render();
    var reportRows = rows.map(function (row) { return Object.assign({}, row, localizedFields(row)); });
    if (q.reportRenderer && q.reportRenderer.renderInstitution) return q.reportRenderer.renderInstitution(reportRows, language());
    return rows;
  }
  q.institutionView = { demo: demo, getRows: getRows, aggregateRecords: aggregateRecords, filterRows: filterRows, localizedFields: localizedFields, render: render, importLocal: importLocal, exportReport: exportReport, esc: esc };
  root.addEventListener("DOMContentLoaded", function () {
    render();
    root.document.getElementById("institutionImport")?.addEventListener("click", importLocal);
    root.document.getElementById("institutionExport")?.addEventListener("click", exportReport);
    root.document.getElementById("institutionRole")?.addEventListener("change", render);
    root.document.getElementById("institutionFilter")?.addEventListener("input", render);
    root.addEventListener("dashboard:language-change", render);
    root.addEventListener("qjzh:data-imported", render);
    root.addEventListener("qjzh:data-synced", render);
  });
})(window);
