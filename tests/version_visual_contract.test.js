"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function localScripts(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
    .map((match) => match[1])
    .filter((src) => !/^https?:\/\//i.test(src));
}

function queryVersion(src) {
  const match = src.match(/[?&]v=([^&#]+)/);
  return match ? match[1] : null;
}

test("application and diagnostics pages use one explicit release query plus the pinned model query", () => {
  const pages = [read("index.html"), read("online_test.html")];
  const releaseVersions = pages.map((html) => html.match(/<meta\s+name="qjzh-release-version"\s+content="([^"]+)"/i)?.[1]);
  assert.ok(releaseVersions.every(Boolean), "both pages declare qjzh-release-version");
  assert.equal(new Set(releaseVersions).size, 1, "release query version is shared by both pages");
  assert.match(releaseVersions[0], /^\d{8}$/);

  const modelFiles = new Set(["model_weights.js", "compensator_engine.js"]);
  const modelVersion = pages[0].match(/<meta\s+name="qjzh-model-version"\s+content="([^"]+)"/i)?.[1];
  assert.equal(modelVersion, pages[1].match(/<meta\s+name="qjzh-model-version"\s+content="([^"]+)"/i)?.[1]);
  assert.match(modelVersion || "", /^\d+\.\d+\.\d+$/);
  assert.match(read("model_weights.js"), new RegExp("version:\\s*\\\"" + modelVersion.replaceAll(".", "\\.") + "\\\""));
  const modelVersions = [];
  for (const html of pages) {
    const scripts = localScripts(html);
    assert.ok(scripts.length > 0);
    for (const src of scripts) {
      const file = src.split("?", 1)[0];
      assert.ok(queryVersion(src), `${file} must have a cache version`);
      if (modelFiles.has(file)) modelVersions.push(queryVersion(src));
      else assert.equal(queryVersion(src), releaseVersions[0], `${file} uses release version`);
    }
  }
  assert.deepEqual(new Set(modelVersions), new Set([modelVersion]));
});

test("diagnostics distinguishes deployment and model versions", () => {
  const html = read("online_test.html");
  assert.match(html, /id="releaseVersion"/);
  assert.match(html, /id="version"/);
  assert.match(html, /id="modelVersion"/);
  assert.match(html, /id="rulesVersion"/);
  assert.match(html, /id="rulesFingerprint"/);
  assert.match(html, /getElementById\("releaseVersion"\)[\s\S]*?build.releaseVersion/);
  assert.match(html, /getElementById\("version"\)[\s\S]*?build.deploymentVersion[\s\S]*?build.version/);
  assert.match(html, /getElementById\("modelVersion"\)[\s\S]*?MODEL_WEIGHTS/);
  assert.match(html, /getElementById\("rulesVersion"\)[\s\S]*?build.rulesVersion/);
  assert.match(html, /getElementById\("rulesFingerprint"\)[\s\S]*?build.rulesFingerprint/);
  assert.match(html, /sha256:[0-9a-f]{64}/i);
  assert.match(html, /metadata-group\.runtime[^{}]*\{[\s\S]*?repeat\(3/);
  assert.match(html, /metadata-group\.identity[^{}]*\{[\s\S]*?repeat\(4/);
  assert.match(html, /metadata \.release[\s\S]*?metadata \.deployment[\s\S]*?metadata \.model[\s\S]*?metadata \.rules/);
  assert.match(html, /metadata-group[^>]*role="group"/);
  assert.doesNotMatch(html, /metadata[^{}]*\{[\s\S]*?repeat\(5/);
});

test("diagnostics presents version identity as readable semantic groups", () => {
  const html = read("online_test.html");
  assert.match(html, /class="metadata-heading"[^>]*id="metadata-runtime-title"/);
  assert.match(html, /class="metadata-heading"[^>]*id="metadata-identity-title"/);
  assert.match(html, /class="metadata-band release-band"/);
  assert.match(html, /class="metadata-band contract-band"/);
  assert.match(html, /发布与部署/);
  assert.match(html, /执行契约/);
  assert.match(html, /data-version-role="release"/);
  assert.match(html, /data-version-role="deployment"/);
  assert.match(html, /data-version-role="model"/);
  assert.match(html, /data-version-role="rules"/);
  assert.match(html, /class="metadata-fingerprint-heading"/);
  assert.match(html, /内容证据，不是另一种版本号/);
  assert.match(html, /静态资源缓存键/);
  assert.match(html, /一次 CI 构建实例/);
  assert.match(html, /锁定权重接口/);
  assert.match(html, /知识库规则集/);
  assert.doesNotMatch(html, /border-top:\s*2px\s+solid\s+#(?:4a9eff|ffd93d|b690ff)/i);
});

test("overview quick links keep equal-width rhythm and touch-safe reduced-motion rules", () => {
  const html = read("index.html");
  const releaseStyles = html.match(/<style id="qjzh-release-layout">([\s\S]*?)<\/style>/)?.[1] || "";
  assert.match(releaseStyles, /overview-quick-grid\s*\{[^}]*repeat\(6/);
  assert.match(releaseStyles, /overview-quick-grid \.overview-quick:nth-child\(4\)[\s\S]*?grid-column:\s*2\s*\/\s*span\s*2/);
  assert.match(releaseStyles, /overview-quick-grid \.overview-quick:nth-child\(5\)[\s\S]*?grid-column:\s*4\s*\/\s*span\s*2/);
  assert.match(releaseStyles, /@media\s*\(max-width:\s*900px\)[\s\S]*?overview-quick-grid\s*\{[^}]*1fr/);
  assert.match(releaseStyles, /min-height:\s*44px/);
  assert.match(releaseStyles, /prefers-reduced-motion:\s*reduce[\s\S]*?animation-duration/);
});
