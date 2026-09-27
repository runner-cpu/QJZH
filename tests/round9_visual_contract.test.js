const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("custom legend is the only legend and exposes dataset toggles", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  assert.match(dashboard, /legend:\s*\{[\s\S]*?display:\s*false/);
  assert.equal((html.match(/class="trend-toggle"/g) || []).length, 5);
  assert.match(html, /aria-describedby="trendA11ySummary dataRecordTable"/);
  assert.match(dashboard, /QJZH\.chartControls\s*=\s*\{\s*toggleDataset:/);
});

test("mobile contracts keep cards and six navigation items in view", () => {
  const html = read("index.html");
  assert.match(html, /@media\s*\(max-width:\s*480px\)[\s\S]*?sensor-grid[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(html, /@media\s*\(max-width:\s*430px\)[\s\S]*?qjzh-main-nav[^{]*\{[^}]*grid-template-columns:\s*repeat\(6/);
});

test("trend toggles expose pressed state and a localized text summary", () => {
  const html = read("index.html");
  const dashboard = read("dashboard.js");
  assert.equal((html.match(/class="trend-toggle"[^>]+aria-pressed="true"/g) || []).length, 5);
  assert.match(html, /id="trendA11ySummary"/);
  assert.match(dashboard, /function updateTrendA11ySummary\(/);
  assert.match(dashboard, /trend\.a11y\./);
});

test("application scripts are external, ordered, and deferred", () => {
  const html = read("index.html");
  assert.match(html, /<script defer src="dashboard\.js\?v=/);
  assert.doesNotMatch(html, /<script>[\s\S]{5000,}<\/script>/);
  const tags = [...html.matchAll(/<script[^>]+src="[^"]+"[^>]*>/g)].map((match) => match[0]);
  assert.equal(tags.every((tag) => /\bdefer\b/.test(tag)), true);
});

test("public discovery metadata and a custom 404 exist", () => {
  const html = read("index.html");
  assert.match(html, /rel="canonical" href="https:\/\/runner-cpu\.github\.io\/QJZH\/"/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  for (const file of ["robots.txt", "sitemap.xml", "404.html"]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + " should exist");
  }
});

test("local build metadata does not claim load time as deployment time", () => {
  const source = read("build_info.js");
  assert.doesNotMatch(source, /new Date\(\)\.toISOString/);
  assert.match(source, /version:\s*"dev"/);
  assert.match(source, /commit:\s*"local"/);
  assert.match(source, /builtAt:\s*null/);
  assert.match(source, /environment:\s*"local"/);
});
