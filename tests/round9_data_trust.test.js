const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadScript(file, overrides = {}, existingWindow) {
  const listeners = {};
  const window = existingWindow || {
    QJZH: {},
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
    setTimeout,
    clearTimeout,
    console
  };
  Object.assign(window, overrides);
  window.window = window;
  window.globalThis = window;
  const context = vm.createContext({
    window,
    globalThis: window,
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
  });
  vm.runInContext(read(file), context, { filename: file });
  return { window, listeners, context };
}

function loadDataImport(overrides = {}) {
  return loadScript("dataImport.js", overrides);
}

function validRecord(overrides = {}) {
  return {
    timestamp: "2026-09-27T08:00:00+08:00",
    site_id: "QH-TEST-01",
    altitude_m: 2620,
    temp_c: -5,
    rh_percent: 62,
    raw_nh3_ppm: 18.6,
    device_model: "sensor-x",
    ...overrides
  };
}

test("CSV drops system-derived fields and stamps provenance", () => {
  const { window } = loadDataImport();
  const csv = [
    "timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model,calibrated_nh3_ppm,risk_level",
    "2026-09-27T08:00:00+08:00,QH-TEST-01,2620,-5,62,30,sensor-x,0,正常"
  ].join("\n");

  const result = window.QJZH.dataImport.parseCsv(csv);
  const row = result.records[0];

  assert.equal(result.errors.length, 0);
  assert.equal(row.calibrated_nh3_ppm, undefined);
  assert.equal(row.risk_level, undefined);
  assert.equal(row.provenance, "user-import");
});

test("reserved and malformed site IDs are rejected without prototype mutation", () => {
  const { window } = loadDataImport();

  for (const site_id of ["__proto__", "constructor", "bad/id", "X".repeat(65)]) {
    const result = window.QJZH.dataImport.validate(validRecord({ site_id }));
    assert.equal(result.valid, false, site_id);
  }

  assert.equal({}.polluted, undefined);
});

test("timestamps require ISO 8601 offsets and reject unreasonable future values", () => {
  const { window } = loadDataImport();

  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "not-a-date" })).valid, false);
  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "2026-09-27T08:00:00" })).valid, false);
  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "2030-01-01T00:00:00Z" })).valid, false);
  assert.equal(window.QJZH.dataImport.validate(validRecord()).valid, true);
});

module.exports = { createStorage, loadScript, loadDataImport, validRecord };
