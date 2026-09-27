const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("custom legend is the only legend and exposes dataset toggles", () => {
  const html = read("index.html");
  assert.match(html, /legend:\s*\{[\s\S]*?display:\s*false/);
  assert.equal((html.match(/class="trend-toggle"/g) || []).length, 5);
  assert.match(html, /aria-describedby="trendA11ySummary dataRecordTable"/);
  assert.match(html, /QJZH\.chartControls\s*=\s*\{\s*toggleDataset:/);
});

test("mobile contracts keep cards and six navigation items in view", () => {
  const html = read("index.html");
  assert.match(html, /@media\s*\(max-width:\s*480px\)[\s\S]*?sensor-grid[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(html, /@media\s*\(max-width:\s*430px\)[\s\S]*?qjzh-main-nav[^{]*\{[^}]*grid-template-columns:\s*repeat\(6/);
});

test("trend toggles expose pressed state and a localized text summary", () => {
  const html = read("index.html");
  assert.equal((html.match(/class="trend-toggle"[^>]+aria-pressed="true"/g) || []).length, 5);
  assert.match(html, /id="trendA11ySummary"/);
  assert.match(html, /function updateTrendA11ySummary\(/);
  assert.match(html, /trend\.a11y\./);
});
