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
