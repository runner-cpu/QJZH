const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

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
