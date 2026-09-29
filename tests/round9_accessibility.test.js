const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const extractElement = (html, id) => (html.match(new RegExp('<[^>]+id="' + id + '"[^>]*>')) || [""])[0];

test("the routed document has one main landmark and a skip link", () => {
  const html = read("index.html");
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /class="skip-link" href="#main-content"/);
});

test("pipeline uses buttons and hidden next stays hidden", () => {
  const html = read("index.html");
  assert.equal((html.match(/<button[^>]+class="pipeline-step"/g) || []).length, 3);
  assert.doesNotMatch(html, /class="pipeline-step"[^>]+role="button"/);
  assert.match(html, /\.pipeline-next\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});

test("all manual fields have visible labels and described help", () => {
  const html = read("index.html");
  for (const name of ["site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model"]) {
    assert.match(html, new RegExp('<label[^>]+for="manual-' + name + '"'));
    assert.match(html, new RegExp('id="manual-' + name + '"[^>]+aria-describedby="manual-' + name + '-help"'));
    assert.match(html, new RegExp('id="manual-' + name + '-help"[^>]+class="field-help"'));
  }
});

test("high-frequency readings are not live regions and snapshots are a list", () => {
  const html = read("index.html");
  assert.doesNotMatch(extractElement(html, "chartPointCount"), /aria-live/);
  assert.doesNotMatch(extractElement(html, "streamStatus"), /aria-live/);
  assert.match(html, /id="snapshotList"[^>]+role="list"/);
  assert.doesNotMatch(html, /id="snapshotList"[^>]+aria-label=/);
});

test("language changes refresh stream and chart count immediately", () => {
  const dashboard = read("dashboard.js");
  assert.match(dashboard, /function refreshDynamicLanguage\(/);
  assert.match(dashboard, /updateChartPointCount\(\)/);
  assert.match(dashboard, /refreshStreamStatus\(\)/);
});

test("Tibetan has a dedicated font stack and readable line height", () => {
  const html = read("index.html");
  assert.match(html, /html\[data-language="bo"\][^{]*\{[^}]*line-height:\s*1\.6/);
  assert.match(html, /Noto Sans Tibetan/);
});

test("async status surfaces expose live atomic focus targets and three-language keys", () => {
  const html = read("index.html");
  for (const id of ["dataImportStatus", "reportStatus"]) {
    const element = extractElement(html, id);
    assert.match(element, /role="status"/);
    assert.match(element, /aria-live="polite"/);
    assert.match(element, /aria-atomic="true"/);
    assert.match(element, /tabindex="-1"/);
  }
  assert.match(html, /id="csvInput"[^>]+aria-describedby="csvInputHelp dataImportStatus"/);
  assert.match(html, /id="downloadLocalData"[^>]+aria-controls="dataRecordRows"/);
  const map = read("ui_text_map.js");
  for (const key of ["qjzh.data.fileTooLarge", "qjzh.data.readError", "qjzh.data.readCancelled", "qjzh.data.exported", "qjzh.data.exportError", "qjzh.storage.rollback", "qjzh.storage.sessionWarning", "qjzh.storage.memoryWarning", "qjzh.report.retry"]) {
    assert.match(map, new RegExp(key.replaceAll(".", "\\.")));
  }
});

test("errorHandler marks loading busy and returns focus to terminal summary", () => {
  const document = {
    querySelector() { return null; },
    createElement(tag) { return { tagName: tag, children: [], setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); }, focus() { this.focused = true; } }; }
  };
  const window = { QJZH: {}, document };
  const vm = require("node:vm");
  vm.runInNewContext(read("errorHandler.js"), { window, document });
  const target = { children: [], className: "", setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); }, textContent: "", focus() { this.focused = true; } };
  const translate = (key, fallback) => key + "::" + fallback;
  window.QJZH.errorHandler.render(target, window.QJZH.errorHandler.loading(), { translate, busy: true });
  assert.equal(target["aria-busy"], "true");
  window.QJZH.errorHandler.render(target, window.QJZH.errorHandler.make("error", "failed"), { translate, focus: true });
  assert.equal(target["aria-busy"], "false");
  assert.equal(target.tabIndex, -1);
  assert.equal(target.focused, true);
});
