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

function throwingStorage() {
  return {
    get length() { return 0; },
    key() { return null; },
    getItem() { return null; },
    setItem() { throw new Error("quota"); },
    removeItem() {}
  };
}

function seed(storage, entries) {
  for (const [key, value] of Object.entries(entries)) storage.setItem(key, value);
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
    document: window.document,
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

function loadReportStack({ records = [], compensate = () => 8 } = {}) {
  return loadScript("reportGenerator.js", {
    compensate,
    QJZH: {
      dataImport: { getRecords() { return records; } },
      riskPolicy: {
        classifyNh3(value) {
          const nh3 = Number(value);
          return nh3 > 15
            ? { code: "urgent", label: "紧急" }
            : nh3 >= 10
              ? { code: "watch", label: "关注" }
              : { code: "normal", label: "正常" };
        }
      }
    }
  });
}

function sampleRecords() {
  return [validRecord({ timestamp: "2026-09-15T08:00:00+08:00", provenance: "user-import" })];
}

function minimalReport() {
  return {
    language: "zh",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    noRecords: true,
    riskDistribution: {},
    trendSeries: [],
    generatedAt: "2026-09-27T00:00:00Z",
    source: "QJZH 本地记录"
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

test("quota failure pins the session to memory and verifies the write", () => {
  const { window } = loadDataImport({
    localStorage: throwingStorage(),
    sessionStorage: throwingStorage()
  });

  const result = window.QJZH.dataImport.save([validRecord()]);

  assert.equal(result.storage.mode, "memory");
  assert.equal(result.storage.persistent, false);
  assert.equal(window.QJZH.dataImport.getRecords().length, 1);
  assert.equal(window.QJZH.dataImport.storageStatus().mode, "memory");
});

test("file inspection rejects empty, unnamed, unreadable, and oversized inputs before reading", () => {
  const { window } = loadDataImport();
  const api = window.QJZH.dataImport;
  assert.equal(api.inspectFile({ name: "data.csv", size: 0 }).ok, false);
  assert.equal(api.inspectFile({ name: "", size: 10 }).ok, false);
  assert.equal(api.inspectFile({ name: "data.csv", size: 10, type: "text/csv", readable: false }).ok, false);
  assert.equal(api.inspectFile({ name: "data.csv", size: api.MAX_CSV.bytes + 1 }).code, "fileTooLarge");
  const valid = api.inspectFile({ name: "data.csv", size: 10, type: "text/csv" });
  assert.equal(valid.ok, true);
  assert.equal(valid.bytes, 10);
  assert.equal(valid.name, "data.csv");
});

test("CSV export follows accepted field order and quotes commas, newlines, and quotes", () => {
  const { window } = loadDataImport();
  const api = window.QJZH.dataImport;
  api.save([validRecord({ species: "yak, calf", device_model: "sensor\"x\n2" })]);
  const result = api.exportCsv({ siteId: "QH-TEST-01" });
  assert.equal(result.ok, true);
  assert.equal(result.records, 1);
  assert.match(result.csv.split("\n")[0], /^timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model,species/);
  assert.match(result.csv, /"sensor""x\n2"/);
  assert.match(result.csv, /"yak, calf"/);
  assert.match(result.filename, /\.csv$/);
});

test("batch save rolls back all writes when a storage operation fails", () => {
  const values = new Map([["QJZH_SITES", JSON.stringify(["OLD"])], ["QJZH_RECORDS_OLD", JSON.stringify([validRecord({ site_id: "OLD" })])]]);
  const storage = {
    get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (key === "QJZH_SITES") throw new Error("quota"); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const { window } = loadDataImport({ localStorage: storage, sessionStorage: throwingStorage() });
  const result = window.QJZH.dataImport.save([validRecord({ site_id: "NEW" })]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "storageQuota");
  assert.equal(result.rolledBack, true);
  assert.deepEqual(JSON.parse(storage.getItem("QJZH_SITES")), ["OLD"]);
  assert.equal(storage.getItem("QJZH_RECORDS_NEW"), null);
});

test("clearData requires explicit confirmation and reports removed count", () => {
  const { window } = loadDataImport();
  window.QJZH.dataImport.save([validRecord()]);
  const cancelled = window.QJZH.dataImport.clearData({ confirm: false });
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal(window.QJZH.dataImport.getRecords().length, 1);
  const cleared = window.QJZH.dataImport.clearData({ confirm: true });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.removed, 2);
  assert.equal(window.QJZH.dataImport.getRecords().length, 0);
});

test("clearData removes business keys but preserves preferences", () => {
  const { window } = loadDataImport();
  seed(window.localStorage, {
    QJZH_SITES: "[]",
    QJZH_REPORTS: "{}",
    QJZH_INSTITUTIONS: "[]",
    "qjzh-theme": "light",
    "qjzh-language": "bo"
  });

  window.QJZH.dataImport.clearData();

  assert.equal(window.localStorage.getItem("QJZH_REPORTS"), null);
  assert.equal(window.localStorage.getItem("QJZH_INSTITUTIONS"), null);
  assert.equal(window.localStorage.getItem("qjzh-theme"), "light");
  assert.equal(window.localStorage.getItem("qjzh-language"), "bo");
});

test("sample loading removes sites absent from the sample", () => {
  const { window } = loadDataImport();
  window.QJZH.dataImport.save([validRecord({ site_id: "OLD-SITE" })]);

  window.QJZH.dataImport.loadDemo();

  assert.equal(window.QJZH.dataImport.getRecords("OLD-SITE").length, 0);
  assert.equal(window.QJZH.dataImport.getRecords()[0].provenance, "sample");
});

test("institution rows keep imported data separate from the demo snapshot", () => {
  const imported = [{ site_id: "USER-01", name: "User barn", calibrated_nh3_ppm: 8 }];
  const localStorage = createStorage({ QJZH_INSTITUTIONS: JSON.stringify(imported) });
  const { window } = loadScript("institutionView.js", { localStorage });

  assert.equal(window.QJZH.institutionView.getRows().map((row) => row.site_id).join(","), "USER-01");
  assert.equal(window.QJZH.institutionView.getRows("demo").length, 5);
});

test("risk policy matches the locked engine boundary", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "riskPolicy.js")), true);
  const { window } = loadScript("riskPolicy.js");

  assert.equal(window.QJZH.riskPolicy.classifyNh3(9.99).code, "normal");
  assert.equal(window.QJZH.riskPolicy.classifyNh3(10).code, "watch");
  assert.equal(window.QJZH.riskPolicy.classifyNh3(15).code, "watch");
  assert.equal(window.QJZH.riskPolicy.classifyNh3(15.01).code, "urgent");
});

test("reports ignore imported calibrated values", () => {
  const records = [validRecord({ raw_nh3_ppm: 30, calibrated_nh3_ppm: 0 })];
  const { window } = loadReportStack({ records, compensate() { return 24; } });

  const report = window.QJZH.reportGenerator.generate({
    startDate: "2026-09-27",
    endDate: "2026-09-27"
  });

  assert.equal(report.averageNh3, 24);
  assert.equal(report.riskDistribution["紧急"], 1);
});

test("institution rows recalculate imported derived values", () => {
  const imported = [validRecord({ calibrated_nh3_ppm: 0, risk_level: "正常" })];
  const localStorage = createStorage({ QJZH_INSTITUTIONS: JSON.stringify(imported) });
  const base = loadScript("riskPolicy.js", { localStorage, compensate() { return 24; } });
  loadScript("institutionView.js", {}, base.window);

  const row = base.window.QJZH.institutionView.getRows()[0];
  assert.equal(row.calibrated_nh3_ppm, 24);
  assert.equal(row.risk_level, "紧急");
});

test("calibration describes aggregate evaluation without a point-error promise", () => {
  const document = {
    title: "",
    documentElement: { dataset: { language: "zh" } },
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const { window } = loadScript("ui_interactions.js", {
    document,
    compensate() { return 12.3; },
    QJZH: { dataImport: { validate() { return { quality: "A", confidence: "高" }; } } }
  });

  const result = window.QJZH.calibrate(validRecord());
  assert.equal(result.error_range, undefined);
  assert.match(result.evaluation_note, /合成测试集平均相对误差 0\.71%/);
  assert.match(result.evaluation_note, /单点不确定度尚未评估/);
});

test("reports reject reversed ranges and never expand an empty range", () => {
  const report = loadReportStack({ records: sampleRecords() }).window.QJZH.reportGenerator;

  assert.equal(report.generate({ startDate: "2026-10-01", endDate: "2026-09-01" }).errorCode, "INVALID_RANGE");
  assert.equal(report.generate({ startDate: "2026-08-01", endDate: "2026-08-31" }).records.length, 0);
});

test("report cache excludes raw records and includes provenance metadata", () => {
  const { window } = loadReportStack({ records: sampleRecords() });
  const result = window.QJZH.reportGenerator.generate({
    startDate: "2026-09-01",
    endDate: "2026-09-30"
  });
  const cached = JSON.parse(window.localStorage.getItem("QJZH_REPORTS"));

  assert.equal(cached.records, undefined);
  assert.equal(cached.trendSeries, undefined);
  assert.ok(result.modelVersion && result.ruleVersion);
  assert.equal(result.timezone, "Asia/Shanghai");
  assert.equal(result.siteCount, 1);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.provenance["user-import"], 1);
});

test("blocked print popup returns reusable HTML", () => {
  const { window } = loadScript("reportRenderer.js", { open() { return null; } });

  const result = window.QJZH.reportRenderer.render(minimalReport());

  assert.equal(result.opened, false);
  assert.match(result.html, /<!doctype html>/);
  assert.equal(result.window, null);
});

test("institution reports use record dates and label undated snapshots", () => {
  const { window } = loadScript("reportRenderer.js", { open() { return null; } });
  const dated = window.QJZH.reportRenderer.renderInstitution([
    { site_id: "A", name: "A", timestamp: "2026-01-03T08:00:00+08:00", calibrated_nh3_ppm: 8 },
    { site_id: "B", name: "B", timestamp: "2026-01-01T08:00:00+08:00", calibrated_nh3_ppm: 12 }
  ], "en");
  const snapshot = window.QJZH.reportRenderer.renderInstitution([
    { site_id: "A", name: "A", calibrated_nh3_ppm: 8 }
  ], "en");

  assert.match(dated.html, /2026-01-01/);
  assert.match(dated.html, /2026-01-03/);
  assert.match(snapshot.html, /demo snapshot/i);
});

module.exports = { createStorage, loadScript, loadDataImport, loadReportStack, minimalReport, sampleRecords, validRecord, seed, throwingStorage };
