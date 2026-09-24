const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); }
  };
}

function loadScript(file, overrides = {}) {
  const listeners = {};
  const window = {
    QJZH: {},
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((listener) => listener(event)); },
    setTimeout,
    clearTimeout,
    console,
    ...overrides
  };
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  return { window, listeners };
}

function loadDataImport() {
  return loadScript("dataImport.js");
}

test("CSV parser keeps a quoted multiline field in one record", () => {
  const { window } = loadDataImport();
  const csv = [
    "timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model",
    '2026-01-15T08:00:00+08:00,QH-HD-001,2620,-5,62,18.6,"generic\nsensor"'
  ].join("\n");

  const result = window.QJZH.dataImport.parseCsv(csv);

  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].device_model, "generic\nsensor");
});

test("saving the same site and timestamp overwrites instead of duplicating", () => {
  const { window } = loadDataImport();
  const base = { timestamp: "2026-01-15T08:00:00+08:00", site_id: "QH-HD-001", altitude_m: 2620, temp_c: -5, rh_percent: 62, raw_nh3_ppm: 18.6, device_model: "a" };

  window.QJZH.dataImport.save([base]);
  window.QJZH.dataImport.save([{ ...base, raw_nh3_ppm: 12.4, device_model: "b" }]);

  const records = window.QJZH.dataImport.getRecords("QH-HD-001");
  assert.equal(records.length, 1);
  assert.equal(Number(records[0].raw_nh3_ppm), 12.4);
  assert.equal(records[0].device_model, "b");
});

test("loading demo data repeatedly keeps 16 records and exposes one-site replay summary", () => {
  const { window } = loadDataImport();
  const api = window.QJZH.dataImport;

  api.loadDemo();
  api.loadDemo();

  assert.equal(api.getRecords().length, 16);
  assert.deepEqual(JSON.parse(JSON.stringify(api.replaySummary())), {
    siteId: "QH-HD-001",
    recordCount: 3,
    siteCount: 5,
    totalCount: 16
  });
  assert.equal(api.nextRecord("QH-HD-001").site_id, "QH-HD-001");
  assert.equal(api.nextRecord("QH-HD-001").site_id, "QH-HD-001");
});

test("a QJZH storage event resets the replay cursor for another tab", () => {
  const { window, listeners } = loadDataImport();
  const api = window.QJZH.dataImport;
  api.loadDemo();
  const first = api.nextRecord("QH-HD-001");
  const second = api.nextRecord("QH-HD-001");
  assert.notEqual(second.timestamp, first.timestamp);

  (listeners.storage || []).forEach((listener) => listener({ key: "QJZH_RECORDS_QH-HD-001" }));

  assert.equal(api.nextRecord("QH-HD-001").timestamp, first.timestamp);
});

function classList() {
  const names = new Set();
  return {
    contains(name) { return names.has(name); },
    toggle(name, force) {
      const active = force === undefined ? !names.has(name) : Boolean(force);
      if (active) names.add(name); else names.delete(name);
      return active;
    }
  };
}

test("hash router activates exactly one of six views and keeps navigation state", () => {
  const names = ["overview", "data", "algorithm", "decision", "institution", "report"];
  const views = names.map((name) => ({ dataset: { view: name }, classList: classList(), hidden: false, setAttribute() {} }));
  const links = names.map((name) => ({ dataset: { view: name }, classList: classList(), setAttribute(key, value) { this[key] = value; }, removeAttribute(key) { delete this[key]; } }));
  const steps = ["data", "algorithm", "decision"].map((name) => ({ dataset: { goto: name }, classList: classList() }));
  const next = { dataset: {}, hidden: false, textContent: "" };
  const institutionPanel = { classList: classList() };
  const documentListeners = {};
  const document = {
    readyState: "complete",
    documentElement: { scrollTop: 99 },
    body: { dataset: {} },
    querySelectorAll(selector) {
      if (selector === ".view") return views;
      if (selector === ".qjzh-main-nav .nav-link") return links;
      if (selector === ".pipeline-step[data-goto]") return steps;
      return [];
    },
    getElementById(id) { return id === "pipelineNext" ? next : id === "institutionView" ? institutionPanel : null; },
    addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); }
  };
  const location = { hash: "#/institution" };
  const { window } = loadScript("viewRouter.js", { document, location, scrollTo() {} });

  window.QJZH.viewRouter.apply();
  assert.deepEqual(views.filter((view) => view.classList.contains("active")).map((view) => view.dataset.view), ["institution"]);
  assert.equal(links.find((link) => link.dataset.view === "institution")["aria-current"], "page");
  assert.equal(institutionPanel.classList.contains("active"), true);

  window.QJZH.viewRouter.go("data");
  window.QJZH.viewRouter.apply();
  assert.equal(location.hash, "#/data");
  assert.deepEqual(views.filter((view) => view.classList.contains("active")).map((view) => view.dataset.view), ["data"]);
  assert.equal(next.dataset.goto, "algorithm");
});

test("report renderer builds localized English and Tibetan documents", () => {
  const { window } = loadScript("reportRenderer.js");
  const report = {
    startDate: "2026-01-01", endDate: "2026-03-31", noRecords: false, complianceRate: 0.75,
    averageNh3: 8.4, maxNh3: 16.2, temperatureRange: { min: -5, max: 10 }, adviceCount: 2,
    riskDistribution: { "正常": 3, "关注": 1, "待办": 0, "紧急": 0 }, generatedAt: "2026-09-24T00:00:00.000Z", source: "QJZH 本地记录"
  };

  const english = window.QJZH.reportRenderer.buildHtml({ ...report, language: "en" });
  const tibetan = window.QJZH.reportRenderer.buildHtml({ ...report, language: "bo" });

  assert.match(english, /Quarterly Environment Report/);
  assert.match(english, /Ammonia compliance rate/);
  assert.match(tibetan, /ཁོར་ཡུག/);
  assert.doesNotMatch(english, /季度环境报告/);
});

test("institution filter matches site id or species without changing source rows", () => {
  const { window } = loadScript("institutionView.js");
  const rows = [
    { site_id: "QH-HD-001", species: "犊牦牛" },
    { site_id: "QH-XN-002", species: "奶牛" }
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(window.QJZH.institutionView.filterRows(rows, "hd-001"))), [rows[0]]);
  assert.deepEqual(JSON.parse(JSON.stringify(window.QJZH.institutionView.filterRows(rows, "奶牛"))), [rows[1]]);
  assert.equal(rows.length, 2);
});
