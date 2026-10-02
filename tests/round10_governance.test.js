"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_TEXT_FILES = [
  "README.md", "PROJECT_REPORT.md", "ALGORITHM_DOCUMENTATION.md", "generate_docs.py",
  "index.html", "dashboard.js", "institutionView.js", "reportRenderer.js", "LICENSE",
  "COPYRIGHT.md", "ORIGINALITY.md", "SECURITY.md", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md",
  "docs/RELEASE_CHECKLIST.md", "docs/QUALITY_AUDIT.md"
];
const FORBIDDEN = ["学校", "大学", "比赛", "竞赛", "参赛", "创新大赛", "答辩", "指导老师", "课程", "学院", "赛事", "competition", "contest", "university", "school", "classroom", "college"];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

test("public copy contains no restricted background terms", () => {
  const hits = [];
  for (const file of PUBLIC_TEXT_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    const content = read(file).toLowerCase();
    for (const term of FORBIDDEN) if (content.includes(term.toLowerCase())) hits.push(file + ": " + term);
  }
  assert.deepEqual(hits, []);
});

test("copyright and public governance documents exist", () => {
  for (const file of ["COPYRIGHT.md", "ORIGINALITY.md", "originality-manifest.json", "SECURITY.md", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md", "docs/RELEASE_CHECKLIST.md", "docs/QUALITY_AUDIT.md", ".well-known/security.txt"]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
  }
});

test("originality verifier and license contract pass", () => {
  const result = childProcess.spawnSync(process.execPath, ["scripts/verify-originality.js"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const license = read("LICENSE");
  assert.match(license, /保留所有权利/);
  assert.match(license, /禁止[^\n]*(复制|再发布)/);
});

test("originality manifest covers the public deployment boundary", () => {
  const manifest = JSON.parse(read("originality-manifest.json"));
  const paths = new Set(manifest.files.map((entry) => entry.path));
  for (const file of ["ALGORITHM_DOCUMENTATION.md", "docs/QUALITY_AUDIT.md", "scripts/pages-allowlist.js", "scripts/smoke-pages.js", ".well-known/security.txt"]) {
    assert.equal(paths.has(file), true, file);
  }
});

test("CSV import exposes hard limits and rejects oversized input", () => {
  const harness = "global.window = global; global.document = undefined; global.addEventListener = function() {}; require(" + JSON.stringify(path.join(ROOT, "dataImport.js")) + "); const api = global.QJZH.dataImport; const header = api.REQUIRED.join(','); const tooMany = header + '\\n' + Array(5001).fill('2026-01-15T08:00:00+08:00,DEMO-001,2620,-5,62,18.6,sensor').join('\\n'); const result = api.parseCsv(tooMany); if (!result.errors.some(function(error) { return error.code === 'csvTooManyRows'; })) process.exit(2);";
  const result = childProcess.spawnSync(process.execPath, ["-e", harness], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("deployment verification requires security.txt and rejects executable artifact paths", () => {
  const verifier = read("verify-deployment.js");
  const builder = read("scripts/build-pages.js");
  assert.match(verifier, /security\.txt/);
  assert.match(verifier, /artifact-manifest\.json/);
  assert.match(verifier, /forbidden|allowlist/i);
  assert.match(builder, /security\.txt/);
  assert.match(builder, /artifact-manifest\.json/);
  assert.match(builder, /sha256|createHash/);
});

test("compensator lock verifier follows the page version contract", () => {
  const verifier = read("verify_compensator.js");
  assert.match(verifier, /qjzh-release-version/);
  assert.match(verifier, /model_weights\.js[\s\S]*semantic version/);
  assert.match(verifier, /scriptTag\("simulator\.js", releaseVersion\)/);
  assert.doesNotMatch(verifier, /simulator\.js\?v=1\.0\.0/);
});

test("dynamic rendering keeps executable attributes out of public source", () => {
  for (const file of ["dashboard.js", "ui_interactions.js", "reportRenderer.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /on(?:error|load|click|mouseover)\s*=/i, file);
  }
});
