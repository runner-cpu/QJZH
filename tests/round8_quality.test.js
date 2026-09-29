const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function runBrowserScript(file, windowOverrides = {}) {
  const window = {
    QJZH: {},
    localStorage: { setItem() {}, getItem() { return null; } },
    addEventListener() {},
    setTimeout,
    ...windowOverrides
  };
  window.window = window;
  const context = vm.createContext({ window, console, setTimeout });
  vm.runInContext(read(file), context, { filename: file });
  return window;
}

function extractObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, marker + " exists");
  const start = source.indexOf("{", markerIndex);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("Unclosed object literal after " + marker);
}

test("core panel titles, notes, and actions use complete English and Tibetan i18n keys", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  const requiredKeys = [
    "panel.trend",
    "panel.trend.note",
    "panel.records",
    "panel.records.note",
    "panel.calibration",
    "panel.calibration.note",
    "panel.algorithm",
    "panel.decisionOutput",
    "panel.decisionOutput.note",
    "panel.reasoning",
    "panel.reasoning.note",
    "panel.knowledgeCatalog",
    "panel.knowledgeCatalog.note",
    "qjzh.data.downloadTemplate",
    "qjzh.data.loadSample",
    "qjzh.data.clear",
    "qjzh.institution.export",
    "qjzh.institution.import",
    "qjzh.report.generate"
  ];

  for (const key of requiredKeys) {
    const escapedKey = key.replaceAll(".", "\\.");
    assert.match(html, new RegExp("data-i18n=\\\"" + escapedKey + "\\\""), key + " is attached to the visible control");
    assert.ok(dashboard.split('"' + key + '"').length - 1 >= 2, key + " has English and Tibetan copy");
  }
});

test("dynamic presentation controls and recommendation copy follow the active language", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  const interactions = read("ui_interactions.js");

  assert.match(html, /id="scenePresetToggle" data-i18n="qjzh.scene.toggle"/);
  assert.match(html, /data-i18n="view.algorithm.modelLabel"/);
  assert.match(dashboard, /window.QJZH_LANGUAGE = nextLanguage/);
  assert.ok(dashboard.split('"qjzh.scene.toggle"').length - 1 >= 2);
  assert.ok(dashboard.split('"view.algorithm.modelLabel"').length - 1 >= 2);
  for (const level of ["normal", "watch", "todo", "emergency"]) {
    assert.equal(dashboard.split('"recommendation.suggestion.' + level + '"').length - 1, 2);
  }
  assert.ok(interactions.includes('translate("recommendation.suggestion." + levelKey, rawAdvice)'));
});

test("Tibetan dynamic copy covers every English presentation key", () => {
  const dashboard = read("dashboard.js");
  const uiCopy = vm.runInNewContext("(" + extractObjectLiteral(dashboard, "const uiCopy =") + ")");
  const tibetanAdditions = vm.runInNewContext("(" + extractObjectLiteral(dashboard, "Object.assign(uiCopy.bo") + ")");
  Object.assign(uiCopy.bo, tibetanAdditions);

  const missing = Object.keys(uiCopy.en).filter((key) => !(key in uiCopy.bo));
  assert.deepEqual(missing, []);
});

test("visible control metadata and confidence details localize with the page", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  const dataImport = read("dataImport.js");
  const ariaKeys = [
    "aria.dismissBoundary", "aria.mainNav", "aria.quickLinks", "aria.csvUpload",
    "aria.riskScale", "aria.trendLegend", "aria.chartInsights", "aria.compensationCompare",
    "aria.algorithmPanel", "aria.algorithmCredentials", "aria.demoAltitude",
    "aria.demoTemperature", "aria.demoHumidity", "aria.demoRaw", "aria.demoOutput",
    "aria.adviceTrace", "aria.institutionRole"
  ];
  for (const key of ariaKeys) {
    assert.ok(html.includes('data-i18n-aria-label="' + key + '"'), key + " is attached to the visible element");
    assert.ok(dashboard.split('"' + key + '"').length - 1 >= 2, key + " has English and Tibetan copy");
  }
  for (const key of ["title.lowTempMarker", "title.highTempMarker"]) {
    assert.ok(html.includes('data-i18n-title="' + key + '"'), key + " is attached to the visible element");
    assert.ok(dashboard.split('"' + key + '"').length - 1 >= 2, key + " has English and Tibetan copy");
  }
  assert.match(dashboard, /querySelectorAll\("\[data-i18n-title\]"\)/);
  assert.match(dataImport, /qjzh\.confidence\.detailHigh/);
  assert.doesNotMatch(dataImport, /\+ "（输入在模型适用范围内）"/);
});

test("validation, manual-entry status, and confidence labels follow the active language", () => {
  const copy = {
    "qjzh.validation.number": "{field} must be numeric",
    "qjzh.validation.rangeWarning": "{field} is slightly outside the operating range",
    "qjzh.validation.rangeReject": "{field} is outside the model operating range",
    "qjzh.validation.missing": "Missing field: {field}",
    "qjzh.validation.csvEmpty": "CSV is empty",
    "qjzh.confidence.levelHigh": "high",
    "qjzh.confidence.levelMedium": "medium",
    "qjzh.confidence.levelLow": "low"
  };
  const window = runBrowserScript("dataImport.js", {
    QJZH: {
      translate(key, fallback, values = {}) {
        return String(copy[key] || fallback).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
      }
    }
  });
  const invalid = window.QJZH.dataImport.validate({
    timestamp: "2026-09-27T08:00:00+08:00",
    site_id: "QH-TEST",
    altitude_m: "bad",
    temp_c: 0,
    rh_percent: 60,
    raw_nh3_ppm: 8,
    device_model: "manual"
  });

  assert.deepEqual(Array.from(invalid.issues), ["altitude_m must be numeric"]);
  assert.equal(invalid.confidence, "low");
  assert.equal(window.QJZH.dataImport.parseCsv("").errors[0].message, "CSV is empty");
  const interactions = read("ui_interactions.js");
  assert.match(interactions, /translate\("qjzh\.data\.manualSaved"/);
  assert.doesNotMatch(interactions, /badge\.textContent = "数据质量 /);
});

test("institution demo names and species localize without mutating source rows", () => {
  const document = { documentElement: { dataset: { language: "en" } } };
  const window = runBrowserScript("institutionView.js", { document });
  const demo = window.QJZH.institutionView.demo;

  assert.equal(window.QJZH.institutionView.localizedFields(demo[0]).name, "Haidong Demonstration Barn");
  assert.equal(window.QJZH.institutionView.localizedFields(demo[0]).species, "Yak calves");
  assert.equal(demo[0].name, "海东示范圈舍");
  assert.ok(window.QJZH.institutionView.filterRows(demo, "yak").length >= 3);

  document.documentElement.dataset.language = "bo";
  assert.match(window.QJZH.institutionView.localizedFields(demo[0]).name, /མཚོ་ཤར/);
  assert.match(window.QJZH.institutionView.localizedFields(demo[0]).species, /གཡག/);
});

test("localized placeholders and table headers remain scoped to their own views", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  assert.match(html, /data-i18n-placeholder="qjzh\.institution\.filterPlaceholder"/);
  assert.match(dashboard, /querySelectorAll\("\[data-i18n-placeholder\]"\)/);
  assert.match(dashboard, /restoreOrSet\("#recordsPanel \.data-table th"/);
  assert.doesNotMatch(dashboard, /restoreOrSet\("\.data-table th"/);
  assert.match(html, /name="device_model" value="manual_entry"/);
});

test("report generator exposes the latest twelve calibrated points in time order", () => {
  const records = Array.from({ length: 14 }, (_, index) => ({
    timestamp: "2026-01-" + String(index + 1).padStart(2, "0") + "T08:00:00+08:00",
    site_id: "QH-HD-001",
    altitude_m: 2620,
    temp_c: -5 + index,
    rh_percent: 60,
    raw_nh3_ppm: 4 + index,
    calibrated_nh3_ppm: 3.5 + index
  }));
  const window = runBrowserScript("reportGenerator.js", {
    QJZH: { dataImport: { getRecords() { return records.slice().reverse(); } } }
  });

  const report = window.QJZH.reportGenerator.generate({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    language: "en"
  });

  assert.equal(report.trendSeries.length, 12);
  assert.equal(report.trendSeries[0].timestamp, records[2].timestamp);
  assert.equal(report.trendSeries[report.trendSeries.length - 1].value, records[13].raw_nh3_ppm);
});

test("report date range includes the complete first and last Shanghai calendar days", () => {
  const records = [
    "2026-08-31T23:59:59.999+08:00",
    "2026-09-01T00:00:00.000+08:00",
    "2026-09-30T23:59:59.999+08:00",
    "2026-10-01T00:00:00.000+08:00"
  ].map((timestamp, index) => ({
    timestamp: new Date(timestamp).toISOString(),
    site_id: "QH-BOUNDARY",
    temp_c: 8,
    calibrated_nh3_ppm: 7 + index
  }));
  const source = read("reportGenerator.js");
  const window = runBrowserScript("reportGenerator.js", {
    QJZH: { dataImport: { getRecords() { return records; } } }
  });
  const report = window.QJZH.reportGenerator.generate({ startDate: "2026-09-01", endDate: "2026-09-30" });

  assert.match(source, /T00:00:00\.000/);
  assert.match(source, /T23:59:59\.999/);
  assert.deepEqual(Array.from(report.records, (record) => record.timestamp), [records[1].timestamp, records[2].timestamp]);
  assert.equal(report.startDate, "2026-09-01");
  assert.equal(report.endDate, "2026-09-30");
});

test("report renderer builds accessible, print-stable trend and risk charts", () => {
  const window = runBrowserScript("reportRenderer.js");
  const html = window.QJZH.reportRenderer.buildHtml({
    language: "en",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    noRecords: false,
    complianceRate: 0.5,
    averageNh3: 12.3,
    maxNh3: 21.4,
    temperatureRange: { min: -5, max: 8 },
    adviceCount: 4,
    riskDistribution: { "正常": 2, "关注": 1, "待办": 1, "紧急": 1 },
    trendSeries: [
      { timestamp: "2026-01-01T08:00:00+08:00", value: 8.2 },
      { timestamp: "2026-01-02T08:00:00+08:00", value: 16.8 },
      { timestamp: "2026-01-03T08:00:00+08:00", value: 21.4 }
    ],
    generatedAt: "2026-09-27T00:00:00.000Z",
    source: "QJZH 本地记录"
  });

  assert.match(html, /data-chart='nh3-trend'/);
  assert.match(html, /data-chart='risk-distribution'/);
  assert.match(html, /NH₃ trend/);
  assert.match(html, /15 ppm/);
  assert.match(html, /break-inside:avoid/);
  assert.match(html, /aria-label='[^']+'/);
  assert.doesNotMatch(html, /\.risk-track i\{[^}]*min-width/);
});

test("institution report uses a same-day range and labels the chart as a barn comparison", () => {
  let reportHtml = "";
  const reportWindow = {
    document: { write(value) { reportHtml = value; }, close() {} },
    focus() {},
    print() {}
  };
  const window = runBrowserScript("reportRenderer.js", {
    open() { return reportWindow; },
    setTimeout(callback) { callback(); }
  });
  const rows = [
    { name: "Haidong Demonstration Barn", calibrated_nh3_ppm: 8.2, temp_c: -3 },
    { name: "Hainan Cooperative Barn", calibrated_nh3_ppm: 16.4, temp_c: -1 }
  ];

  window.QJZH.reportRenderer.renderInstitution(rows, "en");

  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const localDate = [todayParts.year, todayParts.month, todayParts.day].join("-");
  assert.match(reportHtml, new RegExp(localDate + " to " + localDate));
  assert.match(reportHtml, /data-chart='nh3-comparison'/);
  assert.match(reportHtml, /Barn NH₃ comparison/);
  assert.match(reportHtml, /2 barns/);
  assert.doesNotMatch(reportHtml, /Latest 12 calibrated points/);
});

test("algorithm view states the callable interface and validated operating range", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  assert.match(html, /data-i18n="view\.algorithm\.api"[^>]*>[^<]*compensate\(\)/);
  assert.match(html, /data-i18n="view\.algorithm\.range"[^>]*>[^<]*2200–3500 m/);
  assert.ok(dashboard.split('"view.algorithm.api"').length - 1 >= 2);
  assert.ok(dashboard.split('"view.algorithm.range"').length - 1 >= 2);
});

test("legacy expert advice retains recommendation semantics", () => {
  assert.doesNotMatch(read("index.html") + read("dashboard.js"), /立即启动最大通风/);
});

test("repository governance, CI surface tests, and four-view README gallery are present", () => {
  const workflow = read(".github/workflows/verify-compensator.yml");
  assert.ok(fs.existsSync(path.join(ROOT, ".gitignore")), ".gitignore exists");
  assert.ok(fs.existsSync(path.join(ROOT, "LICENSE")), "LICENSE exists");
  const ignore = read(".gitignore");
  const license = read("LICENSE");
  const readme = read("README.md");
  const online = read("online_test.html");

  assert.match(workflow, /node --test tests\/\*\.test\.js/);
  assert.match(ignore, /node_modules\//);
  assert.match(ignore, /\*\.log/);
  assert.match(license, /保留所有权利/);
  assert.match(readme, /assets\/screenshots\/algorithm\.png/);
  assert.match(readme, /assets\/screenshots\/report\.png/);
  assert.match(online, /src="dashboard\.js\?v=/);
  assert.match(online, /src="riskPolicy\.js\?v=/);
  assert.match(online, /href="#main-content"/);
  assert.match(online, /runner-cpu\.github\.io\/QJZH\//);
  assert.match(online, /reportRenderer\.js/);
});
