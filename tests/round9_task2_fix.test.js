const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function quotaStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (key === "QJZH_SITES") throw new Error("quota"); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function throwingStorage() {
  return { get length() { return 0; }, key() { return null; }, getItem() { return null; }, setItem() { throw new Error("quota"); }, removeItem() {} };
}

function element(id) {
  const listeners = {};
  return {
    id, children: [], attributes: {}, innerHTML: "", textContent: "",
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatch(type, event = {}) { for (const callback of listeners[type] || []) callback({ type, target: this, ...event }); },
    setAttribute(key, value) { this.attributes[key] = String(value); this[key] = String(value); },
    getAttribute(key) { return this.attributes[key] ?? null; },
    appendChild(child) { this.children.push(child); return child; },
    focus() { this.focused = true; }
  };
}

function importDocument() {
  const ids = ["manualDataForm", "dataImportStatus", "dataEmptyState", "csvInput", "clearLocalData", "loadSampleData", "downloadLocalData", "downloadCsvTemplate", "dataRecordRows", "confidenceBadge", "dataQualityBadge"];
  const elements = Object.fromEntries(ids.map((id) => [id, element(id)]));
  return { readyState: "complete", elements, getElementById(id) { return elements[id] || null; }, addEventListener() {}, createElement(tag) { return element(tag); } };
}

function load(file, overrides = {}) {
  const listeners = {};
  const window = {
    QJZH: {}, localStorage: storage(), sessionStorage: storage(),
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
    setTimeout, clearTimeout, console, ...overrides
  };
  window.window = window;
  window.globalThis = window;
  const context = vm.createContext({ window, globalThis: window, document: window.document, console, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(read(file), context, { filename: file });
  return { window, listeners };
}

function validRecord(overrides = {}) {
  return { timestamp: "2026-09-27T08:00:00+08:00", site_id: "QH-TEST-01", altitude_m: 2620, temp_c: -5, rh_percent: 62, raw_nh3_ppm: 18.6, device_model: "sensor-x", ...overrides };
}

function csvFor(record) {
  return ["timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model", [record.timestamp, record.site_id, record.altitude_m, record.temp_c, record.rh_percent, record.raw_nh3_ppm, record.device_model].join(",")].join("\n");
}

test("errorHandler always invokes translate and uses its localized value", () => {
  const document = { querySelector() { return null; }, createElement(tag) { return { tagName: tag, children: [], setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); }, focus() {} }; } };
  const { window } = load("errorHandler.js", { document });
  const target = { children: [], setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); }, textContent: "" };
  let calls = 0;
  const translate = (key, fallback) => { calls += 1; assert.equal(key, "qjzh.status.error"); assert.equal(fallback, "caller message"); return "localized error"; };
  window.QJZH.errorHandler.render(target, window.QJZH.errorHandler.make("error", "caller message"), { translate });
  assert.equal(calls, 1);
  assert.equal(target.children[0].textContent, "localized error");
});

test("data import binding has one clear handler and one reader completion path", () => {
  const source = read("dataImport.js");
  assert.equal((source.match(/reader\.onload\s*=/g) || []).length, 1);
  assert.equal((source.match(/getElementById\(\"clearLocalData\"\)/g) || []).length, 1);
  assert.doesNotMatch(source, /stopImmediatePropagation/);
});

test("status map contains localized empty/loading/error/warning entries", () => {
  const source = read("ui_text_map.js");
  for (const key of ["qjzh.status.empty", "qjzh.status.loading", "qjzh.status.error", "qjzh.status.warning"]) {
    const line = source.split(/\r?\n/).find((value) => value.includes('"' + key + '"'));
    assert.ok(line, key);
    assert.match(line, /zh:\s*"[^"]+"/);
    assert.match(line, /en:\s*"[^"]+"/);
    assert.match(line, /bo:\s*"[^"]+"/);
  }
});

test("importCsv propagates transactional storage failure details", () => {
  const { window } = load("dataImport.js", { localStorage: quotaStorage(), sessionStorage: throwingStorage() });
  const result = window.QJZH.dataImport.importCsv(csvFor(validRecord()));
  assert.equal(result.ok, false);
  assert.equal(result.code, "storageQuota");
  assert.equal(result.rolledBack, true);
  assert.equal(result.storage.mode, "localStorage");
});

test("storage failure does not announce a successful file import", () => {
  const document = importDocument();
  class FileReader { readAsText() { this.result = csvFor(validRecord()); this.onload(); } }
  const { window } = load("dataImport.js", { document, localStorage: quotaStorage(), sessionStorage: throwingStorage(), FileReader });
  let importedEvents = 0;
  window.addEventListener("qjzh:data-imported", () => { importedEvents += 1; });
  document.elements.csvInput.files = [{ name: "records.csv", size: 100 }];
  document.elements.csvInput.dispatch("change");
  assert.equal(importedEvents, 0);
  assert.match(document.elements.dataImportStatus.textContent, /存储失败|Storage failed/);
  assert.equal(document.elements.dataImportStatus.getAttribute("aria-busy"), "false");
  assert.equal(document.elements.dataImportStatus.focused, true);
});

test("sample and cancelled clear actions settle status semantics", () => {
  const document = importDocument();
  const { window } = load("dataImport.js", { document, confirm: () => false });
  const status = document.elements.dataImportStatus;
  document.elements.loadSampleData.dispatch("click");
  assert.equal(status.getAttribute("aria-busy"), "false");
  assert.equal(status.getAttribute("tabindex"), "-1");
  assert.equal(status.focused, true);
  window.QJZH.dataImport.save([validRecord()]);
  const beforeClear = window.QJZH.dataImport.getRecords().length;
  document.elements.clearLocalData.dispatch("click");
  assert.equal(window.QJZH.dataImport.getRecords().length, beforeClear);
  assert.equal(status.getAttribute("aria-busy"), "false");
  assert.equal(status.focused, true);
});
