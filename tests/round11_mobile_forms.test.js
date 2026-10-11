const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("narrow mobile form switches to a readable single column", () => {
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*?\.qjzh-manual-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*?\.qjzh-manual-form\s*>\s*button\s*\{[^}]*grid-column:\s*auto/);
});
