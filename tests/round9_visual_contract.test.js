const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");
const vm = require("node:vm");

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

test("Chart.js stays pinned with an integrity and cross-origin contract", () => {
  const html = read("index.html");
  const chartTag = html.match(/<script\s+defer\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^"]+"[^>]*><\/script>/i)?.[0] || "";
  assert.match(chartTag, /chart\.js@3\.9\.1/);
  assert.match(chartTag, /integrity="sha384-[A-Za-z0-9+/=]+"/);
  assert.match(chartTag, /crossorigin="anonymous"/);
  assert.match(chartTag, /\bdefer\b/);
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

  for (const file of ["index.html", "dashboard.js", "build_info.js", "online_test.html", "assets", ".well-known/security.txt", "artifact-manifest.json"]) {
    assert.equal(fs.existsSync(path.join(output, file)), true, file + " is included");
  }
  for (const file of ["tests", "execution_log.txt", ".git", "docs/superpowers", "README.md"]) {
    assert.equal(fs.existsSync(path.join(output, file)), false, file + " is excluded");
  }
  for (const file of ["COPYRIGHT.md", "ORIGINALITY.md", "SECURITY.md", "originality-manifest.json", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md", "docs/RELEASE_CHECKLIST.md", "docs/QUALITY_AUDIT.md"]) {
    assert.equal(fs.existsSync(path.join(output, file)), true, file + " is included");
  }
  const metadata = fs.readFileSync(path.join(output, "build_info.js"), "utf8");
  assert.ok(metadata.includes('commit: "' + commit + '"'));
  assert.match(metadata, /version:\s*"build-42"/);
  assert.match(metadata, /builtAt:\s*"\d{4}-\d{2}-\d{2}T/);
  assert.match(metadata, /environment:\s*"production"/);
  const security = fs.readFileSync(path.join(output, ".well-known/security.txt"), "utf8");
  assert.match(security, /^Contact:/m);
  assert.match(security, /^Expires:/m);
  assert.match(security, /^Preferred-Languages:/m);
  assert.match(security, /^Canonical:/m);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "artifact-manifest.json"), "utf8"));
  assert.equal(manifest.commit, commit);
  assert.ok(manifest.files.some((entry) => entry.path === ".well-known/security.txt"));
  assert.equal(manifest.files.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)), true);
});

test("security.txt is a minimal public disclosure channel", () => {
  const file = path.join(ROOT, ".well-known", "security.txt");
  assert.equal(fs.existsSync(file), true);
  const content = fs.readFileSync(file, "utf8");
  assert.deepEqual(content.split(/\r?\n/).filter(Boolean).map((line) => line.split(":", 1)[0]), ["Contact", "Expires", "Preferred-Languages", "Canonical"]);
  assert.doesNotMatch(content, /school|contest|competition|@/i);
});

test("presentation seed is stable, bounded, and independent of global randomness", () => {
  const source = read("ui_interactions.js");
  const dashboard = read("dashboard.js");
  const document = { title: "", documentElement: { dataset: { language: "zh" } }, addEventListener() {} };
  const window = { QJZH: {}, addEventListener() {} };
  vm.runInNewContext(source, { window, document }, { filename: "ui_interactions.js" });
  assert.equal(typeof window.QJZH.presentationSeed, "function");
  const first = window.QJZH.presentationSeed("algorithm-demo", "2600|5|60");
  assert.equal(first, window.QJZH.presentationSeed("algorithm-demo", "2600|5|60"));
  assert.ok(first >= 0 && first < 1);
  assert.notEqual(first, window.QJZH.presentationSeed("algorithm-demo", "2600|5|61"));
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(dashboard, /Math\.random\s*\(/);
  assert.match(dashboard, /state\.sampleIndex[\s\S]*?channel/);
});

test("algorithm demo repeats the same presentation values for unchanged controls", () => {
  const source = read("ui_interactions.js");
  const values = {
    demoAltitude: { value: "2600" },
    demoTemp: { value: "5" },
    demoRh: { value: "60" },
    demoRaw: { textContent: "" },
    demoCorrected: { textContent: "" },
    demoSimulate: { addEventListener() {} }
  };
  const document = {
    title: "",
    documentElement: { dataset: { language: "zh" } },
    addEventListener() {},
    getElementById(id) { return values[id] || null; }
  };
  const window = {
    QJZH: {},
    addEventListener() {},
    simulateHighlandRaw(truePpm) { return truePpm * 1.4; },
    compensate(_altitude, _temperature, _humidity, raw) { return raw / 1.4; }
  };
  vm.runInNewContext(source, { window, document }, { filename: "ui_interactions.js" });
  assert.equal(typeof window.QJZH.runAlgorithmDemo, "function");
  window.QJZH.runAlgorithmDemo();
  const first = [values.demoRaw.textContent, values.demoCorrected.textContent];
  window.QJZH.runAlgorithmDemo();
  assert.deepEqual([values.demoRaw.textContent, values.demoCorrected.textContent], first);
});
