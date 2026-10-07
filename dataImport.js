/* QJZH data ingestion: CSV/manual validation, persistence, and demo loading. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var MIN = { altitude_m: 2200, temp_c: -15, rh_percent: 20, raw_nh3_ppm: 0 };
  var MAX = { altitude_m: 3500, temp_c: 25, rh_percent: 85, raw_nh3_ppm: 30 };
  var REQUIRED = ["timestamp", "site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model"];
  var ACCEPTED_FIELDS = REQUIRED.concat(["species", "age_days", "stocking_density", "barn_area"]);
  var MAX_CSV = Object.freeze({ bytes: 1024 * 1024, rows: 5000, fields: ACCEPTED_FIELDS.length, fieldLength: 256 });
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
  var recordCache = null;
  var MAX_STORED_RECORDS = 5000;
  var damagedKeys = new Set();
  var refreshDataUi = null;
  function invalidateRecords() { recordCache = null; cursor = 0; }
  function browserStore(name) { try { return root[name]; } catch (_) { return null; } }
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
    activeStore = probe(browserStore("localStorage"), "localStorage") || probe(browserStore("sessionStorage"), "sessionStorage");
    return activeStore || pinMemory();
  }
  function read(key) {
    var value;
    try { value = selectStore().getItem(key); }
    catch (_) { value = memoryStore.getItem(key); }
    try { return value ? JSON.parse(value) : null; }
    catch (_) { damagedKeys.add(key); return null; }
  }
  function write(key, value) {
    var serialized = JSON.stringify(value);
    try {
      var target = selectStore();
      target.setItem(key, serialized);
      if (target.getItem(key) !== serialized) throw new Error("storage verification failed");
    } catch (_) {
      // Optional report/cache writes must not switch away from healthy records.
      return Object.assign({ ok: false, code: "storageQuota" }, storageStatus());
    }
    if (key === "QJZH_SITES" || key.indexOf("QJZH_RECORDS_") === 0) invalidateRecords();
    return Object.assign({ ok: true }, storeState);
  }
  function storageStatus() { selectStore(); return Object.assign({}, storeState, { damagedKeys: damagedKeys.size }); }
  function number(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return NaN;
    return Number(value);
  }
  function validateSiteId(value) {
    var id = String(value == null ? "" : value).trim();
    return SITE_ID_PATTERN.test(id) && !RESERVED_SITE_IDS.has(id.toLowerCase());
  }
  function validateTimestamp(value) {
    var raw = String(value == null ? "" : value).trim();
    var parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
    if (!parts) return false;
    var year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59 || Number(parts[7] || 0) > 23 || Number(parts[8] || 0) > 59) return false;
    var time = new Date(raw).getTime();
    return Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000;
  }
  function normalizeRecord(record, provenance) {
    var clean = {};
    record = record || {};
    ACCEPTED_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(record, key) && record[key] != null) clean[key] = typeof record[key] === "string" ? record[key].trim() : record[key];
    });
    clean.provenance = provenance || record.provenance || "manual-entry";
    return clean;
  }
  function check(record) {
    record = record || {};
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
    ACCEPTED_FIELDS.forEach(function (field) {
      if (record[field] != null && String(record[field]).length > MAX_CSV.fieldLength) {
        issues.push(text("qjzh.validation.fieldLength", "{field} 超过 256 字符限制", { field: field })); reject = true;
      }
    });
    ["age_days", "stocking_density", "barn_area"].forEach(function (field) {
      if (record[field] == null || record[field] === "") return;
      var value = number(record[field]);
      if (!Number.isFinite(value) || value < 0 || (field === "age_days" && !Number.isInteger(value))) {
        issues.push(text("qjzh.validation.metadata", "{field} 必须为非负数，age_days 必须为整数", { field: field })); reject = true;
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
  function parseLine(line) {
    var result = [], value = "", quoted = false, closed = false;
    for (var i = 0; i < line.length; i += 1) {
      var c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
        else if (c === '"') { quoted = false; closed = true; }
        else value += c;
      } else if (c === ",") { result.push(value); value = ""; closed = false; }
      else if (c === '"') {
        if (value !== "" || closed) throw new Error("csvQuotes");
        quoted = true;
      } else {
        if (closed) throw new Error("csvQuotes");
        value += c;
      }
    }
    if (quoted) throw new Error("csvQuotes");
    result.push(value); return result;
  }
  function byteLength(value) {
    try { return new TextEncoder().encode(String(value == null ? "" : value)).length; }
    catch (_) { return unescape(encodeURIComponent(String(value == null ? "" : value))).length; }
  }
  function inspectFile(file) {
    var candidate = file || {};
    var name = String(candidate.name == null ? "" : candidate.name).trim();
    var rawBytes = Number(candidate.size);
    var bytes = Number.isFinite(rawBytes) && rawBytes > 0 ? Math.floor(rawBytes) : 0;
    if (!name) return { ok: false, code: "fileNameMissing", message: text("qjzh.data.fileNameMissing", "请选择一个有名称的 CSV 文件"), bytes: Number.isFinite(bytes) ? bytes : 0, name: name };
    if (!/\.csv$/i.test(name)) return { ok: false, code: "fileType", message: text("qjzh.data.fileType", "请选择 .csv 文件"), bytes: bytes, name: name };
    if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, code: "fileEmpty", message: text("qjzh.data.fileEmpty", "文件为空，无法导入"), bytes: Number.isFinite(bytes) ? bytes : 0, name: name };
    if (candidate.readable === false || candidate.error) return { ok: false, code: "fileUnreadable", message: text("qjzh.data.fileUnreadable", "文件不可读取，请重新选择"), bytes: bytes, name: name };
    if (bytes > MAX_CSV.bytes) return { ok: false, code: "fileTooLarge", message: text("qjzh.data.fileTooLarge", "文件超过 1 MiB 大小限制"), bytes: bytes, name: name };
    return { ok: true, code: "ok", message: text("qjzh.data.fileReady", "文件已通过预检"), bytes: bytes, name: name };
  }
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
  function csvError(code, message, row, field) { return { row: row || 1, field: field || "csv", code: code, message: text("qjzh.validation." + code, message) }; }
  function parseCsv(csvText, options) {
    options = options || {};
    var input = String(csvText == null ? "" : csvText);
    if (byteLength(input) > MAX_CSV.bytes) return { records: [], errors: [csvError("csvTooLarge", "CSV 超过 1 MB 大小限制")], warnings: [] };
    var lines = splitRows(input);
    if (!lines.length) return { records: [], errors: [csvError("csvEmpty", "CSV 为空")], warnings: [] };
    if (lines.length - 1 > MAX_CSV.rows) return { records: [], errors: [csvError("csvTooManyRows", "CSV 数据行超过 5000 行限制")], warnings: [] };
    var headers;
    try { headers = parseLine(lines[0]).map(function (h) { return h.trim(); }); }
    catch (_) { return { records: [], errors: [csvError("csvQuotes", "CSV 引号不完整或位置不合法")], warnings: [] }; }
    if (!headers.length || headers.some(function (header) { return !header; })) return { records: [], errors: [csvError("csvHeaderEmpty", "CSV 表头不能为空")], warnings: [] };
    if (headers.length > MAX_CSV.fields) return { records: [], errors: [csvError("csvTooManyFields", "CSV 字段数超过允许上限")], warnings: [] };
    var duplicates = headers.filter(function (header, index) { return headers.indexOf(header) !== index; });
    if (duplicates.length) return { records: [], errors: [csvError("csvDuplicateHeader", "CSV 表头不能重复：" + Array.from(new Set(duplicates)).join(", "))], warnings: [] };
    if (headers.some(function (header) { return RESERVED_SITE_IDS.has(header.toLowerCase()); })) return { records: [], errors: [csvError("csvReservedHeader", "CSV 包含保留字段名")], warnings: [] };
    var missing = REQUIRED.filter(function (h) { return headers.indexOf(h) < 0; });
    if (missing.length) return { records: [], errors: [csvError("missing", text("qjzh.validation.missing", "缺少字段：{field}", { field: missing.join(", ") }))], warnings: [] };
    var records = [], errors = [], warnings = [];
    if (lines.length === 1) errors.push(csvError("csvNoRows", "CSV 只有表头，没有数据行"));
    lines.slice(1).forEach(function (line, offset) {
      var values;
      try { values = parseLine(line); }
      catch (_) { errors.push(csvError("csvQuotes", "CSV 引号不完整或位置不合法", offset + 2)); return; }
      if (values.length !== headers.length) { errors.push(csvError("csvColumns", "数据行列数与表头不一致", offset + 2)); return; }
      if (values.length > MAX_CSV.fields || values.some(function (value) { return String(value).length > MAX_CSV.fieldLength; })) {
        errors.push(csvError("csvFieldTooLong", "CSV 字段长度或字段数量超过限制", offset + 2));
        return;
      }
      var raw = {};
      headers.forEach(function (key, i) {
        if (ACCEPTED_FIELDS.indexOf(key) < 0) return;
        var value = values[i].trim();
        // Reverse the spreadsheet-safe escape used by this application's exports.
        if (["device_model", "species"].indexOf(key) >= 0 && /^'+[=+@-]/.test(value)) value = value.slice(1);
        raw[key] = value;
      });
      var record = normalizeRecord(raw, options.provenance || "user-import");
      var result = check(record);
      if (result.valid) { records.push(record); if (result.level === "warning") warnings.push({ row: offset + 2, issues: result.issues }); }
      else errors.push({ row: offset + 2, issues: result.issues, message: result.issues.join("；") });
    });
    return { records: records, errors: errors, warnings: warnings, ignoredFields: headers.filter(function (header) { return ACCEPTED_FIELDS.indexOf(header) < 0; }) };
  }
  function recordKey(record) { return String(record.site_id || "unknown").trim() + "\u0000" + new Date(record.timestamp).toISOString(); }
  function siteList() { var ids = read("QJZH_SITES"); if (ids != null && !Array.isArray(ids)) damagedKeys.add("QJZH_SITES"); return Array.isArray(ids) ? Array.from(new Set(ids.filter(validateSiteId))) : []; }
  function siteRecords(id) {
    var key = "QJZH_RECORDS_" + id, rows = read(key);
    if (!Array.isArray(rows)) { if (rows != null) damagedKeys.add(key); return []; }
    return rows.filter(function (row) { var valid = row && row.site_id === id && check(row).valid; if (!valid) damagedKeys.add(key); return valid; });
  }
  function businessKeys(target) {
    var keys = [];
    for (var i = 0; i < target.length; i += 1) { var key = target.key(i); if (key && key.indexOf("QJZH_") === 0) keys.push(key); }
    return keys;
  }
  function save(records, options) {
    options = options || {};
    if (!Array.isArray(records) || records.some(function (record) { return !check(normalizeRecord(record)).valid; })) return { ok: false, code: "invalidRecord", records: [], storage: storageStatus() };
    var bySite = new Map();
    var normalized = [];
    (records || []).forEach(function (input) {
      var record = normalizeRecord(input, input && input.provenance);
      var id = record.site_id || "unknown";
      normalized.push(record);
      if (!bySite.has(id)) bySite.set(id, []);
      bySite.get(id).push(record);
    });
    var known = options.replaceAll ? [] : siteList();
    var operations = [];
    bySite.forEach(function (siteBatch, id) {
      var old = options.replaceSites || options.replaceAll ? [] : siteRecords(id);
      var merged = new Map();
      old.concat(siteBatch).forEach(function (record) { merged.set(recordKey(record), record); });
      var ordered = Array.from(merged.values()).sort(function (a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });
      operations.push({ key: "QJZH_RECORDS_" + id, value: ordered });
      if (known.indexOf(id) < 0) known.push(id);
    });
    var total = operations.reduce(function (count, operation) { return count + operation.value.length; }, 0);
    if (!options.replaceAll) known.forEach(function (id) { if (!bySite.has(id)) total += siteRecords(id).length; });
    if (total > MAX_STORED_RECORDS) return { ok: false, code: "storageCapacity", records: [], storage: storageStatus() };
    operations.push({ key: "QJZH_SITES", value: known });
    var target = selectStore();
    var snapshots = [], snapshotsComplete = false;
    try {
      if (options.replaceAll) businessKeys(target).forEach(function (key) {
        if (!operations.some(function (operation) { return operation.key === key; })) operations.push({ key: key, remove: true });
      });
      snapshots = operations.map(function (operation) { return { key: operation.key, value: target.getItem(operation.key) }; });
      snapshotsComplete = true;
      operations.forEach(function (operation) {
        if (operation.remove) { target.removeItem(operation.key); if (target.getItem(operation.key) !== null) throw new Error("storage removal failed"); return; }
        var serialized = JSON.stringify(operation.value);
        target.setItem(operation.key, serialized);
        if (target.getItem(operation.key) !== serialized) throw new Error("storage verification failed");
      });
    } catch (_) {
      snapshots.forEach(function (snapshot) {
        try { if (snapshot.value == null) target.removeItem(snapshot.key); else target.setItem(snapshot.key, snapshot.value); } catch (_) {}
      });
      var restored = snapshotsComplete && snapshots.every(function (snapshot) { try { return target.getItem(snapshot.key) === snapshot.value; } catch (_) { return false; } });
      invalidateRecords();
      return { ok: false, code: restored ? "storageQuota" : "storageRecovery", rolledBack: restored, records: normalized, storage: storageStatus() };
    }
    invalidateRecords();
    return { ok: true, records: normalized, storedCount: total, storage: storageStatus() };
  }
  function csvCell(value) {
    var cell = String(value == null ? "" : value);
    if (/^[\s\u0000-\u001f]*'*[=+@-]/.test(cell) && !Number.isFinite(number(cell))) cell = "'" + cell;
    return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  }
  function exportCsv(options) {
    options = options || {};
    try {
      var records = options.siteId ? api.importedRecords(options.siteId) : api.importedRecords();
      var lines = [ACCEPTED_FIELDS.map(csvCell).join(",")];
      records.forEach(function (record) { lines.push(ACCEPTED_FIELDS.map(function (field) { return csvCell(record[field]); }).join(",")); });
      var filename = String(options.filename || "qjzh-local-data.csv").replace(/[^A-Za-z0-9._-]/g, "_");
      if (!/\.csv$/i.test(filename)) filename += ".csv";
      return { ok: true, csv: lines.join("\r\n") + "\r\n", filename: filename, records: records.length, storage: storageStatus() };
    } catch (_) {
      return { ok: false, code: "exportFailed", csv: "", filename: "qjzh-local-data.csv", records: 0, storage: storageStatus() };
    }
  }
  function clearStoreBusiness(target) {
    if (!target) return { removed: 0, failed: 0 };
    var keys = [];
    try {
      for (var i = 0; i < target.length; i += 1) {
        var key = target.key(i);
        if (key && key.indexOf("QJZH_") === 0) keys.push(key);
      }
    } catch (_) { return { removed: 0, failed: 1 }; }
    var result = { removed: 0, failed: 0 };
    keys.forEach(function (key) { try { target.removeItem(key); if (target.getItem(key) !== null) throw new Error("removal failed"); result.removed += 1; } catch (_) { result.failed += 1; } });
    return result;
  }
  function clearBusinessData() {
    var results = [clearStoreBusiness(browserStore("localStorage")), clearStoreBusiness(browserStore("sessionStorage")), clearStoreBusiness(memoryStore)];
    invalidateRecords(); damagedKeys.clear();
    return results.reduce(function (total, result) { total.removed += result.removed; total.failed += result.failed; return total; }, { removed: 0, failed: 0 });
  }
  function qualityFor(result) { return result && result.errors && result.errors.length ? "reject" : result && result.warnings && result.warnings.length ? "warning" : "normal"; }
  function text(key, fallback, values) { return q.translate ? q.translate(key, fallback, values || {}) : fallback.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] != null ? values[name] : _; }); }
  function updateConfidence(result) {
    var badge = root.document && root.document.getElementById("confidenceBadge");
    if (!result) return;
    lastConfidenceResult = result;
    var qualityBadge = root.document && root.document.getElementById("dataQualityBadge");
    if (qualityBadge) {
      if (qualityBadge.removeAttribute) qualityBadge.removeAttribute("data-i18n");
      var qualityLevel = result.level || qualityFor(result);
      qualityBadge.textContent = text("qjzh.data.quality", "数据质量 {quality} · 置信度 {confidence}", { quality: qualityLevel === "normal" ? "A" : qualityLevel === "warning" ? "B" : "C", confidence: text(qualityLevel === "normal" ? "qjzh.confidence.levelHigh" : qualityLevel === "warning" ? "qjzh.confidence.levelMedium" : "qjzh.confidence.levelLow", qualityLevel === "normal" ? "高" : qualityLevel === "warning" ? "中" : "低") });
    }
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
    var qualityBadge = root.document && root.document.getElementById("dataQualityBadge");
    if (qualityBadge) qualityBadge.textContent = text("qjzh.data.qualityPending", "尚未评分");
  }
  function refreshConfidence() {
    var records = api.importedRecords();
    if (!records.length) { resetConfidence(); return; }
    var level = "normal";
    records.forEach(function (record) { var checked = check(record); if (checked.level === "reject") level = "reject"; else if (checked.level === "warning" && level !== "reject") level = "warning"; });
    updateConfidence({ level: level });
  }
  var api = q.dataImport = {
    MIN: MIN,
    MAX: MAX,
    MAX_CSV: Object.assign({}, MAX_CSV),
    MAX_STORED_RECORDS: MAX_STORED_RECORDS,
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
      result.ok = false;
      if (result.valid) { var saved = save([clean]); result.ok = saved.ok; result.storage = saved.storage; result.code = saved.code; result.rolledBack = saved.rolledBack; }
      return result;
    },
    parseCsv: parseCsv,
    inspectFile: inspectFile,
    exportCsv: exportCsv,
    importCsv: function (csvText, options) {
      options = options || {};
      var result = parseCsv(csvText, options);
      if (result.records.length) {
        var saved = save(result.records, options);
        result.ok = saved.ok;
        result.storage = saved.storage;
        if (saved.code) result.code = saved.code;
        if (saved.rolledBack) result.rolledBack = true;
      } else {
        result.ok = result.errors.length === 0;
        result.storage = storageStatus();
      }
      result.level = qualityFor(result);
      return result;
    },
    save: save,
    getRecords: function (siteId) {
      if (siteId) return validateSiteId(siteId) ? siteRecords(siteId) : [];
      return siteList().reduce(function (all, id) { return all.concat(siteRecords(id)); }, []);
    },
    importedRecords: function (siteId) {
      if (!recordCache) recordCache = api.getRecords().sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
      return siteId ? recordCache.filter(function (record) { return record.site_id === siteId; }) : recordCache.slice();
    },
    replaySummary: function () { var all = api.importedRecords(); var siteIds = Array.from(new Set(all.map(function (record) { return record.site_id || "unknown"; }))); var siteId = siteIds[0] || ""; return { siteId: siteId, recordCount: siteId ? all.filter(function (record) { return record.site_id === siteId; }).length : 0, siteCount: siteIds.length, totalCount: all.length }; },
    nextRecord: function (siteId) { var list = api.importedRecords(siteId); if (!list.length) return null; var record = list[cursor % list.length]; cursor += 1; return record; },
    useImported: function () { return api.importedRecords().length > 0; },
    resetCursor: function () { cursor = 0; },
    clearData: function (options) {
      if (options && options.confirm !== true) return { ok: false, cancelled: true };
      var result = clearBusinessData(); refreshConfidence(); return { ok: !result.failed, code: result.failed ? "storageRecovery" : "ok", removed: result.removed, storage: storageStatus() };
    },
    loadDemo: function (csvText) {
      var result = parseCsv(csvText || api.demoCsv, { provenance: "sample" });
      if (result.records.length) {
        var saved = save(result.records, { replaceSites: true, replaceAll: true });
        result.ok = saved.ok;
        result.storage = saved.storage;
        if (saved.code) result.code = saved.code;
        if (saved.rolledBack) result.rolledBack = true;
      } else {
        result.ok = result.errors.length === 0;
        result.storage = storageStatus();
      }
      result.level = qualityFor(result);
      result.replaced = result.ok === true && result.records.length > 0;
      updateConfidence(result);
      return result;
    },
    updateConfidence: updateConfidence,
    resetConfidence: resetConfidence,
    refreshConfidence: refreshConfidence,
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
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"'=]/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "=": "&#61;" }[character]; }); }
  function renderRecordList() {
    var body = root.document && root.document.getElementById("dataRecordRows");
    if (!body) return;
    var records = api.importedRecords().slice(-20).reverse();
    if (!records.length) { body.innerHTML = "<tr><td colspan='6'>" + escapeHtml(text("qjzh.data.noRecords", "尚无本地记录")) + "</td></tr>"; if (refreshDataUi) refreshDataUi(); return; }
    body.innerHTML = records.map(function (record) {
      return "<tr><td>" + escapeHtml(record.timestamp || "-") + "</td><td>" + escapeHtml(record.site_id || "-") + "</td><td>" + escapeHtml(record.species || "-") + "</td><td>" + escapeHtml(record.altitude_m == null ? "-" : record.altitude_m) + " m</td><td>" + escapeHtml(record.raw_nh3_ppm == null ? "-" : record.raw_nh3_ppm) + " ppm</td><td>" + escapeHtml(record.device_model || "-") + "</td></tr>";
    }).join("");
    if (refreshDataUi) refreshDataUi();
  }
  api.renderRecordList = renderRecordList;
  root.addEventListener("storage", function (event) {
    if (!event || (event.key !== null && (!event.key || event.key.indexOf("QJZH_") !== 0))) return;
    invalidateRecords();
    renderRecordList();
    refreshConfidence();
    if (refreshDataUi) refreshDataUi();
    if (q.institutionView && q.institutionView.render) q.institutionView.render();
    try { root.dispatchEvent(new CustomEvent("qjzh:data-synced", { detail: { key: event.key } })); } catch (_) {}
  });
  root.addEventListener("dashboard:language-change", function () {
    renderRecordList();
    refreshConfidence();
  });
  function bindUi() {
    if (!root.document) return;
    var manualForm = root.document.getElementById("manualDataForm");
    var importStatus = root.document.getElementById("dataImportStatus");
    var emptyState = root.document.getElementById("dataEmptyState");
    var input = root.document.getElementById("csvInput");
    var preview = root.document.getElementById("csvImportPreview");
    var confirmImport = root.document.getElementById("confirmCsvImport");
    var cancelImport = root.document.getElementById("cancelCsvImport");
    var pendingCsv = null, pendingResult = null, lastValidationCsv = null, reader = null, readGeneration = 0;
    var statusModel = { key: "qjzh.data.emptyStatus", fallback: "尚未接入数据，请上传 CSV 或手动录入。", state: "empty", values: {} };
    function paintStatus(focus) {
      if (!importStatus) return;
      importStatus.textContent = text(statusModel.key, statusModel.fallback, statusModel.values);
      importStatus.className = "qjzh-data-state qjzh-state-" + statusModel.state;
      importStatus.setAttribute("aria-busy", statusModel.state === "loading" ? "true" : "false");
      if (focus && statusModel.state !== "loading") { importStatus.setAttribute("tabindex", "-1"); if (typeof importStatus.focus === "function") importStatus.focus({ preventScroll: true }); }
    }
    function setStatus(key, fallback, values, state) {
      statusModel = { key: key, fallback: fallback, values: values || {}, state: state || "empty" };
      paintStatus(true);
    }
    api.setStatus = setStatus;
    function failureStatus(result) {
      if (result.code === "storageCapacity") setStatus("qjzh.storage.capacity", "保存后将超过 5000 条记录限制，请先导出并清理旧数据。", {}, "error");
      else if (result.code === "storageRecovery") setStatus("qjzh.storage.recovery", "存储失败且恢复未完成，请导出现有记录后检查浏览器存储。", {}, "error");
      else setStatus("qjzh.storage.rollback", "存储失败，已恢复原有数据", {}, "error");
    }
    api.failureStatus = failureStatus;
    function detailsFor(result) {
      var details = root.document.getElementById("dataImportDetails");
      var list = root.document.getElementById("dataImportIssues");
      if (!details || !list) return;
      list.textContent = "";
      var issues = (result.errors || []).concat(result.warnings || []);
      issues.slice(0, 20).forEach(function (issue) {
        var item = root.document.createElement("li");
        item.textContent = text("qjzh.data.rowIssue", "第 {row} 条：{reason}", { row: issue.row, reason: issue.message || (issue.issues || []).join("；") });
        list.appendChild(item);
      });
      if (result.ignoredFields && result.ignoredFields.length) {
        var item = root.document.createElement("li");
        item.textContent = text("qjzh.data.ignoredFields", "以下列不参与保存或计算：{fields}", { fields: result.ignoredFields.join(", ") }); list.appendChild(item);
      }
      details.hidden = !issues.length && !(result.ignoredFields || []).length;
      details.open = (result.errors || []).length > 0;
    }
    function paintPreview() {
      if (!pendingResult) return;
      var rows = root.document.getElementById("csvPreviewRows");
      if (rows) rows.innerHTML = pendingResult.records.slice(0, 20).map(function (record) {
        return "<tr><td>" + escapeHtml(record.timestamp) + "</td><td>" + escapeHtml(record.site_id) + "</td><td>" + escapeHtml(record.raw_nh3_ppm) + " ppm</td><td>" + escapeHtml(record.device_model) + "</td></tr>";
      }).join("");
      var count = root.document.getElementById("csvPreviewCount");
      if (count) count.textContent = text("qjzh.data.previewCounts", "有效 {accepted} · 拒绝 {rejected} · 警告 {warnings}", { accepted: pendingResult.records.length, rejected: pendingResult.errors.length, warnings: pendingResult.warnings.length });
      detailsFor(pendingResult);
    }
    function cancelRead() {
      readGeneration += 1;
      if (reader && reader.readyState === 1 && reader.abort) reader.abort();
      reader = null; pendingCsv = null; pendingResult = null;
      if (preview) preview.hidden = true;
      if (input) input.value = "";
    }
    refreshDataUi = function () {
      var count = api.importedRecords().length;
      var summary = root.document.getElementById("dataStorageSummary");
      var storage = storageStatus();
      var mode = storage.mode === "localStorage" ? text("qjzh.storage.local", "保存在当前浏览器，刷新后保留") : storage.mode === "sessionStorage" ? text("qjzh.storage.sessionWarning", "数据仅保留在当前浏览器会话") : text("qjzh.storage.memoryWarning", "存储不可用，数据仅保留在当前页面");
      if (summary) summary.textContent = text("qjzh.storage.summary", "{count} / 5000 条本地记录 · {mode} · 不上传", { count: count, mode: mode }) + (storage.damagedKeys ? text("qjzh.storage.damaged", " · {count} 个存储项损坏，已跳过", { count: storage.damagedKeys }) : "");
      ["downloadLocalData", "clearLocalData"].forEach(function (id) { var button = root.document.getElementById(id); if (button) button.disabled = !count; });
      paintStatus(false); paintPreview();
    };
    if (input) input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      cancelRead();
      if (!file) { setStatus("qjzh.data.readCancelled", "已取消文件读取"); return; }
      var preflight = api.inspectFile(file);
      if (!preflight.ok) { detailsFor({}); setStatus("qjzh.data." + preflight.code, preflight.message, {}, "error"); return; }
      if (!root.FileReader) { setStatus("qjzh.data.readError", "当前浏览器不支持文件读取，请重试", {}, "error"); return; }
      setStatus("qjzh.data.importing", "正在读取文件…", {}, "loading");
      var generation = readGeneration;
      reader = new root.FileReader();
      reader.onload = function () {
        if (generation !== readGeneration) return;
        pendingCsv = String(reader.result || ""); lastValidationCsv = pendingCsv; pendingResult = api.parseCsv(pendingCsv);
        paintPreview();
        if (preview) preview.hidden = !pendingResult.records.length;
        if (confirmImport) confirmImport.disabled = !pendingResult.records.length;
        setStatus(pendingResult.records.length ? "qjzh.data.previewReady" : "qjzh.data.rejected", pendingResult.records.length ? "预检完成，确认后导入 {count} 条有效记录；拒绝 {rejected} 条。" : "没有可导入的有效记录，请查看校验详情。", { count: pendingResult.records.length, rejected: pendingResult.errors.length }, pendingResult.errors.length ? "warning" : pendingResult.records.length ? "empty" : "error");
      };
      reader.onerror = function () { if (generation === readGeneration) setStatus("qjzh.data.readError", "文件读取失败，请重试", {}, "error"); };
      reader.onabort = function () { if (generation === readGeneration) setStatus("qjzh.data.readCancelled", "已取消文件读取"); };
      try { reader.readAsText(file, "utf-8"); } catch (_) { setStatus("qjzh.data.readError", "文件读取失败，请重试", {}, "error"); }
    });
    if (confirmImport) confirmImport.addEventListener("click", function () {
      if (pendingCsv === null) return;
      var result = api.importCsv(pendingCsv);
      if (result.ok === false) { failureStatus(result); return; }
      cancelRead(); updateConfidence(result); renderRecordList(); detailsFor(result);
      setStatus("qjzh.data.importSummary", "已处理 {count} 条有效记录，拒绝 {rejected} 条；当前共 {total} 条。", { count: result.records.length, rejected: result.errors.length, total: api.importedRecords().length }, result.errors.length || result.warnings.length ? "warning" : "empty");
      root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: result }));
    });
    if (cancelImport) cancelImport.addEventListener("click", function () { cancelRead(); lastValidationCsv = null; detailsFor({}); setStatus("qjzh.data.importCancelled", "已取消导入，原有数据保留。"); });
    var clearGuard = root.document.getElementById("clearLocalData");
    if (clearGuard) clearGuard.addEventListener("click", function () {
      var confirmed = root.confirm ? root.confirm(text("qjzh.data.confirmClear", "确认清除本地数据？")) : false;
      var result = confirmed ? api.clearData({ confirm: true }) : { ok: false, cancelled: true };
      if (result.ok) { cancelRead(); lastValidationCsv = null; renderRecordList(); detailsFor({}); root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: { cleared: true } })); }
      if (!result.ok && !result.cancelled) { renderRecordList(); failureStatus(result); root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: { clearFailed: true } })); return; }
      setStatus(result.ok ? "qjzh.data.cleared" : "qjzh.data.clearCancelled", result.ok ? "本地数据已清除" : "已取消清除");
    });
    var sample = root.document.getElementById("loadSampleData"); if (sample) sample.addEventListener("click", function () {
      if (api.importedRecords().some(function (record) { return record.provenance !== "sample"; }) && (!root.confirm || !root.confirm(text("qjzh.data.confirmSample", "加载示例将替换全部本地记录。请先导出需要保留的数据，确认继续？")))) { setStatus("qjzh.data.importCancelled", "已取消导入，原有数据保留。"); return; }
      cancelRead(); lastValidationCsv = null;
      var result = api.loadDemo();
      renderRecordList();
      var summary = api.replaySummary();
      if (result.ok === false) { failureStatus(result); return; }
      detailsFor({});
      setStatus("qjzh.data.sampleLoaded", "示例数据已覆盖导入（{sites}圈舍{count}条）", { sites: summary.siteCount, count: summary.totalCount });
      var badge = root.document.getElementById("dataQualityBadge"); if (badge) badge.textContent = text("qjzh.data.quality", "数据质量 {quality} · 置信度 {confidence}", { quality: result.level === "normal" ? "A" : result.level === "warning" ? "B" : "C", confidence: text(result.level === "normal" ? "qjzh.confidence.levelHigh" : result.level === "warning" ? "qjzh.confidence.levelMedium" : "qjzh.confidence.levelLow", result.level === "normal" ? "高" : result.level === "warning" ? "中" : "低") });
      if (result.ok !== false) root.dispatchEvent(new CustomEvent("qjzh:data-imported", { detail: result }));
    });
    if (manualForm) manualForm.setAttribute("data-qjzh-ready", "true");
    var downloadLocal = root.document.getElementById("downloadLocalData");
    if (downloadLocal) downloadLocal.addEventListener("click", function () {
      var result = api.exportCsv();
      if (result.ok && root.Blob && root.URL && root.URL.createObjectURL && root.document.createElement) {
        var url = root.URL.createObjectURL(new root.Blob([result.csv], { type: "text/csv;charset=utf-8" }));
        var anchor = root.document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click();
        if (root.URL.revokeObjectURL) root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
      }
      setStatus(result.ok ? "qjzh.data.exported" : "qjzh.data.exportError", result.ok ? "已导出 {count} 条本地记录" : "导出失败", { count: result.records }, result.ok ? "empty" : "error");
    });
    if (importStatus) { importStatus.setAttribute("aria-live", "polite"); importStatus.setAttribute("aria-atomic", "true"); importStatus.setAttribute("aria-busy", "false"); }
    if (emptyState) emptyState.setAttribute("data-qjzh-empty", "true");
    var download = root.document.getElementById("downloadCsvTemplate"); if (download) download.addEventListener("click", function () { if (q.csvTemplate) q.csvTemplate.download(); });
    renderRecordList();
    root.addEventListener("dashboard:language-change", function () {
      if (lastValidationCsv !== null) {
        var result = api.parseCsv(lastValidationCsv);
        if (pendingResult) pendingResult = result;
        detailsFor(result); paintPreview();
      }
    });
  }
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bindUi); else bindUi(); }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
