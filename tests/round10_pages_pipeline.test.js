"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "scripts", "build-pages.js");
const SMOKE = path.join(ROOT, "scripts", "smoke-pages.js");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "verify-compensator.yml");
const smoke = require(SMOKE);

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function buildTo(output, env = {}) {
  return childProcess.spawnSync(process.execPath, [BUILD, "--out", output], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567", BUILD_TIMESTAMP: "2026-10-02T00:00:00.000Z", ...env }
  });
}

function runNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(process.execPath, args, { cwd: ROOT, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

test("Pages manifest records sorted byte-accurate SHA-256 entries and excludes internal paths", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qjzh-pages-manifest-"));
  const output = path.join(temporaryRoot, "dist");
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  const result = buildTo(output);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const manifestPath = path.join(output, "artifact-manifest.json");
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.commit, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(manifest.generatedAt, "2026-10-02T00:00:00.000Z");
  assert.ok(Array.isArray(manifest.files));
  const paths = manifest.files.map((entry) => entry.path);
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes(".well-known/security.txt"));
  assert.ok(paths.includes("docs/QUALITY_AUDIT.md"));
  assert.ok(paths.includes(".nojekyll"));
  assert.equal(paths.includes("artifact-manifest.json"), false, "self-hash would be circular");
  for (const entry of manifest.files) {
    assert.match(entry.path, /^(?![A-Za-z]:)[^\0]+$/);
    assert.doesNotMatch(entry.path, /(^|\/)\.\.?($|\/)/);
    assert.doesNotMatch(entry.path, /^(?:tests|backups|output|dist|\.git|\.superpowers)(?:\/|$)/);
    const file = path.join(output, ...entry.path.split("/"));
    assert.equal(fs.statSync(file).isFile(), true, entry.path);
    assert.equal(entry.bytes, fs.statSync(file).size, entry.path);
    assert.equal(entry.sha256, sha256(file), entry.path);
  }
});

test("Pages smoke script retries transient failures and validates fixed public markers", async (t) => {
  assert.deepEqual(smoke.PUBLIC_CHECKS.map((check) => check.path), [
    "/", "/online_test.html", "/COPYRIGHT.md", "/ORIGINALITY.md", "/SECURITY.md",
    "/docs/DATA_DICTIONARY.md", "/docs/QUALITY_AUDIT.md", "/build_info.js", "/robots.txt", "/sitemap.xml",
    "/.well-known/security.txt", "/artifact-manifest.json"
  ]);
  const attempts = new Map();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://stub").pathname;
    const count = (attempts.get(pathname) || 0) + 1;
    attempts.set(pathname, count);
    if (pathname.endsWith("/") && count < 3) {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("warming");
      return;
    }
    const bodies = {
      "/": "<title>QJZH</title>",
      "/online_test.html": "id=\"version\" id=\"modelVersion\"",
      "/COPYRIGHT.md": "# Copyright and rights SHA-256",
      "/ORIGINALITY.md": "# Originality SHA-256 build_info.js",
      "/SECURITY.md": "# Security policy CSV QJZH_",
      "/docs/DATA_DICTIONARY.md": "# CSV data dictionary timestamp site_id",
      "/docs/QUALITY_AUDIT.md": "# Quality audit version accessibility security",
      "/build_info.js": "BUILD_INFO commit: \"0123456789abcdef0123456789abcdef01234567\"",
      "/robots.txt": "User-agent: *",
      "/sitemap.xml": "<urlset></urlset>",
      "/.well-known/security.txt": "Contact: /.well-known/security.txt\nExpires: 2027-01-01T00:00:00Z\nPreferred-Languages: zh-CN, en\nCanonical: https://example.invalid/",
      "/artifact-manifest.json": "{\"commit\":\"0123456789abcdef0123456789abcdef01234567\",\"files\":[]}"
    };
    if (!(pathname in bodies)) {
      response.writeHead(404);
      response.end("missing");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(bodies[pathname]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/`;
  const result = await runNode([SMOKE, "--base", base, "--retries", "3", "--delay-ms", "0", "--expected-commit", "0123456789abcdef0123456789abcdef01234567"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(attempts.get("/"), 3);
});

test("Pages smoke script exits nonzero when a fixed marker never matches", async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("deliberately incomplete");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  const base = "http://127.0.0.1:" + address.port + "/";
  const result = await runNode([SMOKE, "--base", base, "--retries", "1", "--delay-ms", "0"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /failed|marker|mismatch/i);
});

test("Pages workflow declares UTC, verifies before upload/deploy, and checks the deployed SHA", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");
  assert.match(workflow, /TZ:\s*UTC/);
  assert.match(workflow, /artifact-manifest/);
  assert.match(workflow, /smoke-pages.js[\s\S]*github.sha/);
  assert.match(workflow, /upload-pages-artifact[\s\S]*deploy:/);
  assert.match(workflow, /deploy:[\s\S]*needs:\s*verify/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
});
