/* QJZH data ingestion: CSV/manual validation, persistence, and demo loading. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var MIN = { altitude_m: 2200, temp_c: -15, rh_percent: 20, raw_nh3_ppm: 0 };
  var MAX = { altitude_m: 3500, temp_c: 25, rh_percent: 85, raw_nh3_ppm: 30 };
  var REQUIRED = ["timestamp", "site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model"];
  var ACCEPTED_FIELDS = REQUIRED.concat(["species", "age_days", "stocking_density", "barn_area"]);
  var SITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
  var RESERVED_SITE_IDS = new Set(["__proto__", "prototype", "constructor"]);
  var memory = root.__QJZH_MEM__ = root.__QJZH_MEM__ || {};
  var memoryStore = {
    get length() { return Object.keys(memory).length; },
    key: function (index) { return Object.keys(memory)[index] || null; },
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
    setItem: function (key, value) { memory[key] = String(value); },
    removeItem: function (key) { delete memory[key]; }
  };
  var activeStore = null;
  var storeState = { mode: "uninitialized", persistent: false, warning: "" };
  var cursor = 0;
  var lastConfidenceResult = null;
  function memoryWarning() { return text("qjzh.storage.memoryWarning", "浏览器存储不可用，数据仅在当前页面会话中保留"); }
  function probe(candidate, mode) {
    if (!candidate) return null;
    var key = "__qjzh_probe__" + Date.now();
    try {
      candidate.setItem(key, "1");
      if (candidate.getItem(key) !== "1") throw new Error("storage verification failed");
      candidate.removeItem(key);
      storeState = { mode: mode, persistent: mode === "localStorage", warning: mode === "sessionStorage" ? text("qjzh.storage.sessionWarning", "数据将在当前浏览器标签页中保留") : "" };
      return candidate;
    } catch (_) {
      try { candidate.removeItem(key); } catch (_) {}
      return null;
    }
  }
  function pinMemory() {
    activeStore = memoryStore;
    storeState = { mode: "memory", persistent: false, warning: memoryWarning() };
    return activeStore;
  }
  function selectStore() {
    if (activeStore) return activeStore;
    activeStore = probe(root.localStorage, "localStorage") || probe(root.sessionStorage, "sessionStorage");
    return activeStore || pinMemory();
  }
  function read(key) {
    try { var value = selectStore().getItem(key); return value ? JSON.parse(value) : null; }
    catch (_) { pinMemory(); var fallback = memoryStore.getItem(key); return fallback ? JSON.parse(fallback) : null; }
  }
  function write(key, value) {
    var serialized = JSON.stringify(value);
    try {
      var target = selectStore();
      target.setItem(key, serialized);
      if (target.getItem(key) !== serialized) throw new Error("storage verification failed");
    } catch (_) {
      pinMemory().setItem(key, serialized);
    }
    return Object.assign({ ok: true }, storeState);
  }
  function storageStatus() { selectStore(); return Object.assign({}, storeState); }
  function number(value) { return value === "" || value == null ? NaN : Number(value); }
  function validateSiteId(value) {
    var id = String(value == null ? "" : value).trim();
    return SITE_ID_PATTERN.test(id) && !RESERVED_SITE_IDS.has(id.toLowerCase());
  }
  function validateTimestamp(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return false;
    var time = new Date(raw).getTime();
    return Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000;
  }
  function normalizeRecord(record, provenance) {
    var clean = {};
    record = record || {};
    ACCEPTED_FIELDS.forEach(function (key) {
      if (record[key] != null) clean[key] = record[key];
    });
    clean.provenance = provenance || record.provenance || "manual-entry";
    return clean;
  }
  function check(record) {
    var issues = [], fields = ["altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm"], warning = false, reject = false;
    fields.forEach(function (field) {
      var value = number(record[field]);
      if (!Number.isFinite(value)) {
        issues.push(text("qjzh.validation.number", "{field} 必须为数字", { field: field }));
        reject = true;
        return;
      }
      var range = MAX[field] - MIN[field];
      if (value < MIN[field] || value > MAX[field]) {
        var distance = value < MIN[field] ? MIN[field] - value : value - MAX[field];
        if (distance / range <= 0.1) {
          warning = true;
          issues.push(text("qjzh.validation.rangeWarning", "{field} 超出适用范围（警告）", { field: field }));
        } else {
          reject = true;
          issues.push(text("qjzh.validation.rangeReject", "{field} 超出模型适用范围", { field: field }));
        }
      }
    });
    REQUIRED.forEach(function (field) {
      if (record[field] == null || String(record[field]).trim() === "") {
        issues.push(text("qjzh.validation.missing", "缺少字段：{field}", { field: field }));
        reject = true;
      }
    });
    if (record.site_id != null && String(record.site_id).trim() !== "" && !validateSiteId(record.site_id)) {
      issues.push(text("qjzh.validation.siteId", "site_id 仅支持 2–64 位字母、数字、下划线或连字符"));
      reject = true;
    }
    if (record.timestamp != null && String(record.timestamp).trim() !== "" && !validateTimestamp(record.timestamp)) {
      issues.push(text("qjzh.validation.timestamp", "timestamp 必须为带时区且不晚于当前时间的 ISO 8601 时间"));
      reject = true;
    }
    var quality = reject ? "C" : warning ? "B" : "A";
    var level = reject ? "reject" : warning ? "warning" : "normal";
    var confidence = level === "reject"
      ? text("qjzh.confidence.levelLow", "低")
      : level === "warning"
        ? text("qjzh.confidence.levelMedium", "中")
        : text("qjzh.confidence.levelHigh", "高");
    return { valid: !reject, accepted: !reject, quality: quality, level: level, confidence: confidence, issues: issues, record: record };
  }
  function parseLine(line) { var result = [], value = "", quoted = false; for (var i = 0; i < line.length; i += 1) { var c = line[i]; if (c === '"' && line[i + 1] === '"' && quoted) { value += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { result.push(value); value = ""; } else value += c; } result.push(value); return result; }
  function splitRows(text) {
    var input = String(text == null ? "" : text).replace(/^\ufeff/, "");
    var rows = [], row = "", quoted = false;
    for (var i = 0; i < input.length; i += 1) {
      var c = input[i];
      if (c === '"') {
        row += c;
        if (quoted && input[i + 1] === '"') { row += input[i + 1]; i += 1; }
        else quoted = !quoted;
      } else if (c === "\r" || c === "\n") {
        if (c === "\r" && input[i + 1] === "\n") i += 1;
        if (quoted) row += "\n";
        else { if (row.trim() !== "") rows.push(row); row = ""; }
      } else row += c;
    }
    if (row.trim() !== "") rows.push(row);
    return rows;
  }
  function parseCsv(csvText, options) { var lines = splitRows(csvText); options = options || {}; if (!lines.length) return { records: [], errors: [{ row: 1, message: text("qjzh.validation.csvEmpty", "CSV 为空") }], warnings: [] }; var headers = parseLine(lines[0]).map(function (h) { return h.trim(); }), missing = REQUIRED.filter(function (h) { return headers.indexOf(h) < 0; }); if (missing.length) return { records: [], errors: [{ row: 1, field: "header", message: text("qjzh.validation.missing", "缺少字段：{field}", { field: missing.join(", ") }) }], warnings: [] }; var records = [], errors = [], warnings = []; lines.slice(1).forEach(function (line, offset) { var values = parseLine(line), raw = {}; headers.forEach(function (key, i) { if (ACCEPTED_FIELDS.indexOf(key) >= 0) raw[key] = (values[i] == null ? "" : values[i]).trim(); }); var record = normalizeRecord(raw, options.provenance || "user-import"); var result = check(record); if (result.valid) { records.push(record); if (result.level === "warning") warnings.push({ row: offset + 2, issues: result.issues }); } else errors.push({ row: offset + 2, issues: result.issues, message: result.issues.join("；") }); }); return { records: records, errors: errors, warnings: warnings }; }
  function recordKey(record) { return String(record.site_id || "unknown") + "\u0000" + String(record.timestamp || ""); }
  function save(records, options) {
    options = options || {};
    var bySite = new Map();
    var normalized = [];
    (records || []).forEach(function (input) {
      var record = normalizeRecord(input, input && input.provenance);
      var id = record.site_id || "unknown";
      normalized.push(record);
      if (!bySite.has(id)) bySite.set(id, []);
      bySite.get(id).push(record);
    });
    var known = read("QJZH_SITES") || [];
    bySite.forEach(function (siteRecords, id) {
      var old = options.replaceSites ? [] : (read("QJZH_RECORDS_" + id) || []);
      var merged = new Map();
      old.concat(siteRecords).forEach(function (record) { merged.set(recordKey(record), record); });
      var ordered = Array.from(merged.values()).sort(function (a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); }).slice(-1000);
      write("QJZH_RECORDS_" + id, ordered);
      if (known.indexOf(id) < 0) known.push(id);
    });
    write("QJZH_SITES", known);
    cursor = 0;
    return { records: normalized, storage: storageStatus() };
  }
  function clearStoreBusiness(target) {
    if (!target) return;
    var keys = [];
    try {
      for (var i = 0; i < target.length; i += 1) {
        var key = target.key(i);
        if (key && key.indexOf("QJZH_") === 0) keys.push(key);
      }
    } catch (_) {}
    keys.forEach(function (key) { try { target.removeItem(key); } catch (_) {} });
  }
  function clearBusinessData() {
    clearStoreBusiness(root.localStorage);
    clearStoreBusiness(root.sessionStorage);
    clearStoreBusiness(memoryStore);
    cursor = 0;
  }
  function qualityFor(result) { return result && result.errors && result.errors.length ? "reject" : result && result.warnings && result.warnings.length ? "warning" : "normal"; }
  function text(key, fallback, values) { return q.translate ? q.translate(key, fallback, values || {}) : fallback.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] != null ? values[name] : _; }); }
  function updateConfidence(result) {
    var badge = root.document && root.document.getElementById("confidenceBadge");
    if (!result) return;
    lastConfidenceResult = result;
    if (!badge) return;
    var level = result.level || qualityFor(result);
    var map = {
      normal: [text("qjzh.confidence.detailHigh", "置信度：高（输入在模型适用范围内）"), "qjzh-confidence"],
      warning: [text("qjzh.confidence.detailMedium", "置信度：中（部分输入超出模型适用范围）"), "qjzh-confidence qjzh-confidence-warn"],
      reject: [text("qjzh.confidence.detailLow", "置信度：低（输入超出模型适用范围，结果不可信）"), "qjzh-confidence qjzh-confidence-err"]
    };
    var entry = map[level] || map.normal;
    badge.textContent = entry[0]; badge.className = entry[1];
  }
  function resetConfidence() {
    lastConfidenceResult = null;
    var badge = root.document && root.document.getElementById("confidenceBadge");
    if (badge) { badge.textContent = text("qjzh.confidence.wait", "置信度：待接入数据后评估"); badge.className = "qjzh-confidence"; }
  }
  var api = q.dataImport = {
    MIN: MIN,
    MAX: MAX,
    REQUIRED: REQUIRED.slice(),
    ACCEPTED_FIELDS: ACCEPTED_FIELDS.slice(),
    storage: function () { return storageStatus().mode; },
    storageStatus: storageStatus,
    validate: check,
    validateSiteId: validateSiteId,
    validateTimestamp: validateTimestamp,
    normalizeRecord: normalizeRecord,
    validateManual: function (record) {
      var clean = normalizeRecord(record || {}, "manual-entry");
      var result = check(clean);
      result.record = clean;
      if (result.valid) result.storage = save([clean]).storage;
      return result;
    },
    parseCsv: parseCsv,
    importCsv: function (csvText, options) {
      options = options || {};
      var result = parseCsv(csvText, options);
      if (result.records.length) result.storage = save(result.records, options).storage;
      else result.storage = storageStatus();
      result.level = qualityFor(result);
      return result;
    },
    save: save,
    getRecords: function (siteId) {
      if (siteId) return read("QJZH_RECORDS_" + siteId) || [];
      var ids = read("QJZH_SITES") || [];
      return ids.reduce(function (all, id) { return all.concat(read("QJZH_RECORDS_" + id) || []); }, []);
    },
    importedRecords: function (siteId) { return api.getRecords(siteId).slice().sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); }); },
    replaySummary: function () { var all = api.importedRecords(); var siteIds = Array.from(new Set(all.map(function (record) { return record.site_id || "unknown"; }))); var siteId = siteIds[0] || ""; return { siteId: siteId, recordCount: siteId ? all.filter(function (record) { return record.site_id === siteId; }).length : 0, siteCount: siteIds.length, totalCount: all.length }; },
    nextRecord: function (siteId) { var list = api.importedRecords(siteId); if (!list.length) return null; var record = list[cursor % list.length]; cursor += 1; return record; },
    useImported: function () { return api.importedRecords().length > 0; },
    resetCursor: function () { cursor = 0; },
    clearData: function () { clearBusinessData(); resetConfidence(); return { ok: true, storage: storageStatus() }; },
    loadDemo: function (csvText) {
      var result = parseCsv(csvText || api.demoCsv, { provenance: "sample" });
      if (result.records.length) {
        clearBusinessData();
        result.storage = save(result.records, { replaceSites: true }).storage;
      } else result.storage = storageStatus();
      result.level = qualityFor(result);
      result.replaced = result.records.length > 0;
      updateConfidence(result);
      return result;
    },
    updateConfidence: updateConfidence,
    resetConfidence: resetConfidence,
    qualityFor: qualityFor,
    parseLine: parseLine,
    splitRows: splitRows
  };
  api.demoCsv = [
    "timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model,species,age_days,stocking_density,barn_area",
    "2026-01-15T08:00:00+08:00,QH-HD-001,2620,-5,62,18.6,generic_sensor,yak_calf,45,1.2,180",
    "2026-01-15T12:00:00+08:00,QH-HD-001,2620,1,55,12.4,generic_sensor,yak_calf,45,1.2,180",
    "2026-01-15T18:00:00+08:00,QH-HD-001,2620,-3,64,16.2,generic_sensor,yak_calf,45,1.2,180",
    "2026-01-16T08:00:00+08:00,QH-HZ-002,2800,-8,68,9.2,generic_sensor,dairy_cattle,120,0.9,240",
    "2026-01-16T12:00:00+08:00,QH-HZ-002,2800,0,58,7.5,generic_sensor,dairy_cattle,120,0.9,240",
    "2026-01-16T18:00:00+08:00,QH-HZ-002,2800,-4,65,11.8,generic_sensor,dairy_cattle,120,0.9,240",
    "2026-01-17T08:00:00+08:00,QH-GN-003,2450,-10,72,14.4,generic_sensor,tibetan_sheep,90,1.5,150",
    "2026-01-17T12:00:00+08:00,QH-GN-003,2450,-1,60,8.8,generic_sensor,tibetan_sheep,90,1.5,150",
    "2026-01-17T18:00:00+08:00,QH-GN-003,2450,-6,70,13.1,generic_sensor,tibetan_sheep,90,1.5,150",
    "2026-01-18T08:00:00+08:00,QH-TJ-004,3050,-12,76,21.2,generic_sensor,yak,180,1.0,300",
    "2026-01-18T12:00:00+08:00,QH-TJ-004,3050,-3,66,15.6,generic_sensor,yak,180,1.0,300",
    "2026-01-18T18:00:00+08:00,QH-TJ-004,3050,-9,73,19.8,generic_sensor,yak,180,1.0,300",
    "2026-01-19T08:00:00+08:00,QH-HN-005,3300,-14,80,24.6,generic_sensor,tibetan_sheep,150,1.3,210",
    "2026-01-19T12:00:00+08:00,QH-HN-005,3300,-5,69,18.3,generic_sensor,tibetan_sheep,150,1.3,210",
    "2026-01-19T18:00:00+08:00,QH-HN-005,3300,-11,77,22.1,generic_sensor,tibetan_sheep,150,1.3,210",
    "2026-01-20T08:00:00+08:00,QH-HN-005,3300,-13,79,23.1,generic_sensor,tibetan_sheep,150,1.3,210"
  ].join("\n");
  q.validateSensorRecord = check;
  q.storage = q.storage || { mode: function () { return api.storage(); }, get: read, set: write, clear: api.clearData };
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; }); }
  function renderRecordList() {
    var body = root.document && root.document.getElementById("dataRecordRows");
    if (!body) return;
    var records = api.importedRecords().slice(-20).reverse();
    if (!records.length) { body.innerHTML = "<tr><td colspan='6'>" + escapeHtml(text("qjzh.data.noRecords", "尚无本地记录")) + "</td></tr>"; return; }
    body.innerHTML = records.map(function (record) {
      return "<tr><td>" + escapeHtml(record.timestamp || "-") + "</td><td>" + escapeHtml(record.site_id || "-") + "</td><td>" + escapeHtml(record.species || "-") + "</td><td>" + escapeHtml(record.altitude_m || "-") + " m</td><td>" + escapeHtml(record.raw_nh3_ppm || "-") + " ppm</td><td>" + escapeHtml(record.device_model || "-") + "</td></tr>";
    }).join("");
  }
  api.renderRecordList = renderRecordList;
  root.addEventListener("storage", function (event) {
    if (!event || !event.key || event.key.indexOf("QJZH_") !== 0) return;
    cursor = 0;
    renderRecordList();
    if (q.institutionView && q.institutionView.render) q.institutionView.render();
    try { root.dispatchEvent(new CustomEvent("qjzh:data-synced", { detail: { key: event.key } })); } catch (_) {}
  });
  root.addEventListener("dashboard:language-change", function () {
    renderRecordList();
    if (lastConfidenceResult) updateConfidence(lastConfidenceResult);
    else resetConfidence();
  });
  function bindUi() {
    if (!root.document) return;
    var manualForm = root.document.getElementById("manualDataForm");
    var importStatus = root.document.getElementById("dataImportStatus");
    var emptyState = root.document.getElementById("dataEmptyState");
    var input = root.document.getElementById("csvInput");
    if (input) input.addEventListener("change", function () { var file = input.files && input.files[0]; if (!file || !root.FileReader) return; var reader = new root.FileReader(); reader.onload = function () { var result = api.importCsv(reader.result); updateConfidence(result); renderRecordList(); var status = root.document.getElementById("dataImportStatus"); if (status) status.textContent = result.errors.length ? text("qjzh.data.partialImport", "部分数据未导入") : text("qjzh.data.imported", "已导入并去重合并 {count} 条记录，主看板将按单站点回放", { count: result.records.length }); root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: result })); }; reader.readAsText(file, "utf-8"); });
    var sample = root.document.getElementById("loadSampleData"); if (sample) sample.addEventListener("click", function () { var result = api.loadDemo(); renderRecordList(); var summary = api.replaySummary(); var status = root.document.getElementById("dataImportStatus"); if (status) status.textContent = text("qjzh.data.sampleLoaded", "示例数据已覆盖导入（{sites}圈舍{count}条）", { sites: summary.siteCount, count: summary.totalCount }); var badge = root.document.getElementById("dataQualityBadge"); if (badge) badge.textContent = text("qjzh.data.quality", "数据质量 {quality} · 置信度 {confidence}", { quality: result.level === "normal" ? "A" : result.level === "warning" ? "B" : "C", confidence: result.level === "normal" ? "高" : result.level === "warning" ? "中" : "低" }); root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: result })); });
    if (manualForm) manualForm.setAttribute("data-qjzh-ready", "true");
    if (importStatus) importStatus.setAttribute("aria-live", "polite");
    if (emptyState) emptyState.setAttribute("data-qjzh-empty", "true");
    var clear = root.document.getElementById("clearLocalData"); if (clear) clear.addEventListener("click", function () { api.clearData(); renderRecordList(); if (importStatus) importStatus.textContent = text("qjzh.data.cleared", "本地数据已清除"); });
    var download = root.document.getElementById("downloadCsvTemplate"); if (download) download.addEventListener("click", function () { if (q.csvTemplate) q.csvTemplate.download(); });
    renderRecordList();
  }
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bindUi); else bindUi(); }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
