/* QJZH data ingestion: CSV/manual validation, persistence, and demo loading. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var MIN = { altitude_m: 2200, temp_c: -15, rh_percent: 20, raw_nh3_ppm: 0 };
  var MAX = { altitude_m: 3500, temp_c: 25, rh_percent: 85, raw_nh3_ppm: 30 };
  var REQUIRED = ["timestamp", "site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model"];
  var memory = root.__QJZH_MEM__ = root.__QJZH_MEM__ || {};
  var storageMode = "localStorage";
  var cursor = 0;
  function store() { try { if (root.localStorage) { root.localStorage.setItem("__qjzh_probe__", "1"); root.localStorage.removeItem("__qjzh_probe__"); return root.localStorage; } } catch (_) {} try { if (root.sessionStorage) { root.sessionStorage.setItem("__qjzh_probe__", "1"); root.sessionStorage.removeItem("__qjzh_probe__"); storageMode = "sessionStorage"; return root.sessionStorage; } } catch (_) {} storageMode = "memory"; return { getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); }, removeItem: function (key) { delete memory[key]; } }; }
  function read(key) { try { var value = store().getItem(key); return value ? JSON.parse(value) : null; } catch (_) { return null; } }
  function write(key, value) { try { store().setItem(key, JSON.stringify(value)); return { ok: true, mode: storageMode }; } catch (_) { storageMode = "memory"; memory[key] = JSON.stringify(value); return { ok: true, mode: storageMode, warning: "当前会话可用，刷新后数据丢失" }; } }
  function number(value) { return value === "" || value == null ? NaN : Number(value); }
  function check(record) { var issues = [], fields = ["altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm"], warning = false, reject = false; fields.forEach(function (field) { var value = number(record[field]); if (!Number.isFinite(value)) { issues.push(field + " 必须为数字"); reject = true; return; } var range = MAX[field] - MIN[field]; if (value < MIN[field] || value > MAX[field]) { var distance = value < MIN[field] ? MIN[field] - value : value - MAX[field]; if (distance / range <= 0.1) { warning = true; issues.push(field + " 超出适用范围（警告）"); } else { reject = true; issues.push(field + " 超出模型适用范围"); } } }); REQUIRED.forEach(function (field) { if (record[field] == null || String(record[field]).trim() === "") { issues.push("缺少字段: " + field); reject = true; } }); var quality = reject ? "C" : warning ? "B" : "A"; return { valid: !reject, accepted: !reject, quality: quality, level: reject ? "reject" : warning ? "warning" : "normal", confidence: reject ? "低" : warning ? "中" : "高", issues: issues, record: record }; }
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
  function parseCsv(text) { var lines = splitRows(text); if (!lines.length) return { records: [], errors: [{ row: 1, message: "CSV 为空" }], warnings: [] }; var headers = parseLine(lines[0]).map(function (h) { return h.trim(); }), missing = REQUIRED.filter(function (h) { return headers.indexOf(h) < 0; }); if (missing.length) return { records: [], errors: [{ row: 1, field: "header", message: "缺少字段: " + missing.join(", ") }], warnings: [] }; var records = [], errors = [], warnings = []; lines.slice(1).forEach(function (line, offset) { var values = parseLine(line), record = {}; headers.forEach(function (key, i) { record[key] = (values[i] == null ? "" : values[i]).trim(); }); var result = check(record); if (result.valid) { records.push(record); if (result.level === "warning") warnings.push({ row: offset + 2, issues: result.issues }); } else errors.push({ row: offset + 2, issues: result.issues, message: result.issues.join("；") }); }); return { records: records, errors: errors, warnings: warnings }; }
  function recordKey(record) { return String(record.site_id || "unknown") + "\u0000" + String(record.timestamp || ""); }
  function save(records, options) {
    options = options || {};
    var bySite = {};
    records.forEach(function (record) { var id = record.site_id || "unknown"; (bySite[id] = bySite[id] || []).push(record); });
    var known = read("QJZH_SITES") || [];
    Object.keys(bySite).forEach(function (id) {
      var old = options.replaceSites ? [] : (read("QJZH_RECORDS_" + id) || []);
      var merged = new Map();
      old.concat(bySite[id]).forEach(function (record) { merged.set(recordKey(record), record); });
      var ordered = Array.from(merged.values()).sort(function (a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); }).slice(-1000);
      write("QJZH_RECORDS_" + id, ordered);
      if (known.indexOf(id) < 0) known.push(id);
    });
    write("QJZH_SITES", known); cursor = 0; return records;
  }
  function qualityFor(result) { return result && result.errors && result.errors.length ? "reject" : result && result.warnings && result.warnings.length ? "warning" : "normal"; }
  function text(key, fallback, values) { return q.translate ? q.translate(key, fallback, values || {}) : fallback.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] != null ? values[name] : _; }); }
  function updateConfidence(result) {
    var badge = root.document && root.document.getElementById("confidenceBadge");
    if (!badge || !result) return;
    var level = result.level || qualityFor(result);
    var map = {
      normal: [text("qjzh.confidence.high", "置信度：高") + "（输入在模型适用范围内）", "qjzh-confidence"],
      warning: [text("qjzh.confidence.medium", "置信度：中") + "（部分输入超出模型适用范围）", "qjzh-confidence qjzh-confidence-warn"],
      reject: [text("qjzh.confidence.low", "置信度：低") + "（输入超出模型适用范围，结果不可信）", "qjzh-confidence qjzh-confidence-err"]
    };
    var entry = map[level] || map.normal;
    badge.textContent = entry[0]; badge.className = entry[1];
  }
  function resetConfidence() {
    var badge = root.document && root.document.getElementById("confidenceBadge");
    if (badge) { badge.textContent = text("qjzh.confidence.wait", "置信度：待接入数据后评估"); badge.className = "qjzh-confidence"; }
  }
  var api = q.dataImport = { MIN: MIN, MAX: MAX, REQUIRED: REQUIRED.slice(), storage: function () { store(); return storageMode; }, validate: check, validateManual: function (record) { var result = check(record || {}); if (result.valid) save([record]); return result; }, parseCsv: parseCsv, importCsv: function (text, options) { var result = parseCsv(text); if (result.records.length) save(result.records, options); result.level = qualityFor(result); return result; }, save: save, getRecords: function (siteId) { if (siteId) return read("QJZH_RECORDS_" + siteId) || []; var ids = read("QJZH_SITES") || []; return ids.reduce(function (all, id) { return all.concat(read("QJZH_RECORDS_" + id) || []); }, []); }, importedRecords: function (siteId) { return api.getRecords(siteId).slice().sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); }); }, replaySummary: function () { var all = api.importedRecords(); var siteIds = Array.from(new Set(all.map(function (record) { return record.site_id || "unknown"; }))); var siteId = siteIds[0] || ""; return { siteId: siteId, recordCount: siteId ? all.filter(function (record) { return record.site_id === siteId; }).length : 0, siteCount: siteIds.length, totalCount: all.length }; }, nextRecord: function (siteId) { var list = api.importedRecords(siteId); if (!list.length) return null; var record = list[cursor % list.length]; cursor += 1; return record; }, useImported: function () { return api.importedRecords().length > 0; }, resetCursor: function () { cursor = 0; }, clearData: function () { var ids = read("QJZH_SITES") || []; ids.forEach(function (id) { store().removeItem("QJZH_RECORDS_" + id); }); store().removeItem("QJZH_SITES"); cursor = 0; resetConfidence(); return true; }, loadDemo: function (text) { var result = api.importCsv(text || api.demoCsv, { replaceSites: true }); result.replaced = true; updateConfidence(result); return result; }, updateConfidence: updateConfidence, resetConfidence: resetConfidence, qualityFor: qualityFor, parseLine: parseLine, splitRows: splitRows };
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
