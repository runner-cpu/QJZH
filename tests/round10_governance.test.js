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
  "docs/RELEASE_CHECKLIST.md"
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
  for (const file of ["COPYRIGHT.md", "ORIGINALITY.md", "originality-manifest.json", "SECURITY.md", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md", "docs/RELEASE_CHECKLIST.md"]) {
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

test("CSV import exposes hard limits and rejects oversized input", () => {
  const harness = "global.window = global; global.document = undefined; global.addEventListener = function() {}; require(" + JSON.stringify(path.join(ROOT, "dataImport.js")) + "); const api = global.QJZH.dataImport; const header = api.REQUIRED.join(','); const tooMany = header + '\\n' + Array(5001).fill('2026-01-15T08:00:00+08:00,DEMO-001,2620,-5,62,18.6,sensor').join('\\n'); const result = api.parseCsv(tooMany); if (!result.errors.some(function(error) { return error.code === 'csvTooManyRows'; })) process.exit(2);";
  const result = childProcess.spawnSync(process.execPath, ["-e", harness], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
