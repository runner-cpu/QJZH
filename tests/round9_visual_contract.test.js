const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");

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

test("Pages verifies before deploying an allowlisted artifact", () => {
  const workflow = read(".github/workflows/verify-compensator.yml");
  assert.match(workflow, /^permissions:\s*[\s\S]*?contents:\s*read/m);
  assert.match(workflow, /verify:/);
  assert.match(workflow, /deploy:[\s\S]*?needs:\s*verify/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow, /actions\/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa/);
  assert.match(workflow, /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/);
});

test("Pages builder emits only the public runtime allowlist", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qjzh-pages-"));
  const output = path.join(temporaryRoot, "dist");
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  const commit = "0123456789abcdef0123456789abcdef01234567";
  const result = childProcess.spawnSync(process.execPath, ["scripts/build-pages.js", "--out", output], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: commit, GITHUB_RUN_NUMBER: "42" }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const file of ["index.html", "dashboard.js", "build_info.js", "online_test.html", "assets"]) {
    assert.equal(fs.existsSync(path.join(output, file)), true, file + " is included");
  }
  for (const file of ["tests", "execution_log.txt", ".git", "docs/superpowers", "README.md"]) {
    assert.equal(fs.existsSync(path.join(output, file)), false, file + " is excluded");
  }
  for (const file of ["COPYRIGHT.md", "ORIGINALITY.md", "SECURITY.md", "originality-manifest.json", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md", "docs/RELEASE_CHECKLIST.md"]) {
    assert.equal(fs.existsSync(path.join(output, file)), true, file + " is included");
  }
  const metadata = fs.readFileSync(path.join(output, "build_info.js"), "utf8");
  assert.ok(metadata.includes('commit: "' + commit + '"'));
  assert.match(metadata, /version:\s*"build-42"/);
  assert.match(metadata, /builtAt:\s*"\d{4}-\d{2}-\d{2}T/);
  assert.match(metadata, /environment:\s*"production"/);
});
