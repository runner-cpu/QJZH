"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  ARTIFACT_MANIFEST,
  FORBIDDEN_ARTIFACT_ROOTS,
  PUBLIC_ARTIFACT_DIRECTORIES,
  PUBLIC_ARTIFACT_FILES,
  RULES_VERSION,
  comparePaths,
  normalizePublicPath
} = require("./scripts/pages-allowlist.js");

const packageDirectory = path.resolve(process.argv[2] || ".");
const failures = [];
const isBuiltArtifact = fs.existsSync(path.join(packageDirectory, ARTIFACT_MANIFEST)) || fs.existsSync(path.join(packageDirectory, ".nojekyll"));

function read(file) {
  const filePath = path.join(packageDirectory, file);
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${file}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function requirePatterns(file, patterns) {
  const content = read(file);
  if (!content) return;
  for (const pattern of patterns) {
    if (!pattern.test(content)) failures.push(`${file} is missing ${pattern}`);
  }
}

function metadataValue(source, key) {
  const match = source.match(new RegExp("\\b" + key + "\\s*:\\s*[\"']([^\"']*)[\"']"));
  return match ? match[1] : "";
}

function metaTagValue(html, name) {
  const match = html.match(new RegExp("<meta\\s+name=[\"']" + name + "[\"']\\s+content=[\"']([^\"']+)", "i"));
  return match ? match[1] : "";
}

function verifyVersionContract() {
  const pages = ["index.html", "online_test.html"].map((file) => ({ file, html: read(file) }));
  const model = read("model_weights.js");
  const rulesSource = read("knowledgeBase.js");
  const build = read("build_info.js");
  if (pages.some((page) => !page.html) || !model || !rulesSource || !build) return;
  const releaseVersions = pages.map(({ file, html }) => {
    const value = metaTagValue(html, "qjzh-release-version");
    if (!/^\d{8}$/.test(value)) failures.push(file + " release version must be YYYYMMDD");
    return value;
  });
  if (new Set(releaseVersions).size !== 1) failures.push("application and diagnostics pages must share qjzh-release-version");
  const pageModelVersions = pages.map(({ file, html }) => {
    const value = metaTagValue(html, "qjzh-model-version");
    if (!/^\d+\.\d+\.\d+$/.test(value)) failures.push(file + " model version must be semantic");
    return value;
  });
  const modelVersion = (model.match(/\bversion\s*:\s*[\"']([^\"']+)[\"']/) || [])[1] || "";
  const buildRelease = metadataValue(build, "releaseVersion");
  const buildModel = metadataValue(build, "modelVersion");
  const deployment = metadataValue(build, "deploymentVersion");
  const alias = metadataValue(build, "version");
  const rules = metadataValue(build, "rulesVersion");
  const fingerprint = metadataValue(build, "rulesFingerprint");
  const commit = metadataValue(build, "commit");
  const environment = metadataValue(build, "environment");
  const builtAt = metadataValue(build, "builtAt");
  const expectedRelease = releaseVersions[0];
  const expectedModel = modelVersion;
  if (!/^\d+\.\d+\.\d+$/.test(modelVersion)) failures.push("model_weights.js version must be semantic");
  if (pageModelVersions.some((value) => value !== expectedModel)) failures.push("page model version differs from model_weights.js");
  if (!buildRelease) failures.push("build_info.releaseVersion is missing");
  else if (buildRelease !== expectedRelease) failures.push("build_info.releaseVersion differs from the page release version");
  if (!buildModel) failures.push("build_info.modelVersion is missing");
  else if (buildModel !== expectedModel) failures.push("build_info.modelVersion differs from model_weights.js");
  if (!deployment) failures.push("build_info.deploymentVersion is missing");
  if (!alias) failures.push("build_info.version is missing");
  else if (deployment && alias !== deployment) failures.push("build_info.version must alias deploymentVersion");
  if (rules !== RULES_VERSION) failures.push("build_info.rulesVersion must equal " + RULES_VERSION);
  if (!/^sha256:[0-9a-f]{64}$/i.test(fingerprint)) failures.push("build_info.rulesFingerprint is missing or malformed");
  const actualRulesFingerprint = crypto.createHash("sha256").update(rulesSource.replace(/\r\n?/g, "\n"), "utf8").digest("hex");
  if (fingerprint.toLowerCase() !== "sha256:" + actualRulesFingerprint) failures.push("build_info.rulesFingerprint does not match knowledgeBase.js");
  if (!commit) failures.push("build_info.commit is missing");
  if (!environment) failures.push("build_info.environment is missing");
  if (isBuiltArtifact) {
    if (!/^build-[A-Za-z0-9._-]+$/.test(deployment)) failures.push("built artifact deploymentVersion is malformed");
    if (!/^[0-9a-f]{40}$/i.test(commit)) failures.push("built artifact commit must be a full SHA");
    if (environment !== "production") failures.push("built artifact environment must be production");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(builtAt) || new Date(builtAt).toISOString() !== builtAt) {
      failures.push("built artifact builtAt must be a canonical UTC ISO timestamp");
    }
  } else if (!/^(?:local|production)$/.test(environment)) {
    failures.push("build_info.environment is malformed");
  }

  for (const { file, html } of pages) {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>/gi)]
      .map((match) => match[1])
      .filter((src) => !/^https?:\/\//i.test(src));
    for (const source of scripts) {
      const parts = source.split("?", 2);
      const scriptFile = parts[0].replace(/^\.\//, "");
      const query = parts[1] || "";
      const versionMatch = query.match(/(?:^|&)v=([^&#]+)/);
      if (!versionMatch) failures.push(file + " local script is missing a cache version: " + source);
      else {
        const expected = ["model_weights.js", "compensator_engine.js"].includes(scriptFile) ? expectedModel : expectedRelease;
        if (versionMatch[1] !== expected) failures.push(file + " script version mismatch for " + scriptFile);
      }
    }
  }
}

function normalizedArtifactPath(relativePath) {
  return normalizePublicPath(relativePath);
}

function collectArtifactFiles(directory, prefix = "") {
  const files = [];
  const realDirectory = fs.realpathSync.native(directory);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    const normalized = normalizedArtifactPath(relative);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("symbolic links are not allowed in an artifact: " + normalized);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error("symbolic links are not allowed in an artifact: " + normalized);
    const realEntry = fs.realpathSync.native(absolute);
    if (!(realEntry === realDirectory || realEntry.startsWith(realDirectory + path.sep))) {
      throw new Error("artifact entry resolves outside package: " + normalized);
    }
    if (entry.isDirectory()) {
      if (!PUBLIC_ARTIFACT_DIRECTORIES.includes(normalized)) failures.push("artifact directory is not allowlisted: " + normalized);
      files.push(...collectArtifactFiles(absolute, normalized));
    } else if (entry.isFile() && normalized !== ARTIFACT_MANIFEST) {
      if (!PUBLIC_ARTIFACT_FILES.includes(normalized)) failures.push("artifact file is not allowlisted: " + normalized);
      files.push(normalized);
    } else if (!entry.isFile() && normalized !== ARTIFACT_MANIFEST) throw new Error("unsupported artifact entry: " + normalized);
  }
  return files.sort(comparePaths);
}

function verifyArtifactManifest() {
  const manifestPath = path.join(packageDirectory, "artifact-manifest.json");
  const noJekyllPath = path.join(packageDirectory, ".nojekyll");
  if (!fs.existsSync(manifestPath)) {
    if (fs.existsSync(noJekyllPath)) failures.push("Built artifact is missing artifact-manifest.json");
    return;
  }
  try {
    const manifestStat = fs.lstatSync(manifestPath);
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
      failures.push("artifact-manifest.json must be a regular file");
      return;
    }
  } catch (error) {
    failures.push("artifact-manifest.json cannot be inspected: " + error.message);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    failures.push("artifact-manifest.json is not valid JSON: " + error.message);
    return;
  }
  if (!manifest || typeof manifest !== "object") {
    failures.push("artifact-manifest.json must contain an object");
    return;
  }
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.commit || ""))) failures.push("artifact manifest commit is not a full SHA");
  const generatedAtValue = String(manifest.generatedAt || "");
  const generatedAt = new Date(generatedAtValue);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAtValue) || !Number.isFinite(generatedAt.getTime()) || generatedAt.toISOString() !== generatedAtValue) {
    failures.push("artifact manifest generatedAt is not a canonical ISO timestamp");
  }
  if (!Array.isArray(manifest.files)) {
    failures.push("artifact-manifest.json files must be an array");
    return;
  }
  const actualFiles = (() => {
    try { return collectArtifactFiles(packageDirectory); }
    catch (error) { failures.push(error.message); return []; }
  })();
  const listedFiles = [];
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== "object") {
      failures.push("artifact manifest contains a non-object file entry");
      continue;
    }
    let relative;
    try { relative = normalizedArtifactPath(String(entry.path || "")); }
    catch (error) { failures.push(error.message); continue; }
    if (relative === ARTIFACT_MANIFEST) failures.push("artifact manifest cannot hash itself");
    if (!PUBLIC_ARTIFACT_FILES.includes(relative)) failures.push(relative + " is not in the reviewed artifact allowlist");
    listedFiles.push(relative);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) failures.push(relative + " has invalid byte count");
    if (!/^[0-9a-f]{64}$/.test(String(entry.sha256 || ""))) failures.push(relative + " has invalid SHA-256");
    const absolute = path.join(packageDirectory, ...relative.split("/"));
    let fileStat;
    try { fileStat = fs.lstatSync(absolute); } catch (_) { fileStat = null; }
    if (!fileStat || fileStat.isSymbolicLink() || !fileStat.isFile()) {
      failures.push(relative + " is listed but missing from the artifact");
      continue;
    }
    const before = { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
    const data = fs.readFileSync(absolute);
    const after = fs.lstatSync(absolute);
    if (after.isSymbolicLink() || !after.isFile() || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      failures.push(relative + " changed or became a link while being hashed");
      continue;
    }
    const bytes = data.length;
    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    if (entry.bytes !== bytes) failures.push(relative + " byte count does not match");
    if (entry.sha256 !== sha256) failures.push(relative + " SHA-256 does not match");
  }
  const sortedListed = [...listedFiles].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (JSON.stringify(listedFiles) !== JSON.stringify(sortedListed)) failures.push("artifact manifest paths must be sorted");
  if (new Set(listedFiles).size !== listedFiles.length) failures.push("artifact manifest contains duplicate paths");
  if (JSON.stringify(listedFiles) !== JSON.stringify(actualFiles)) failures.push("artifact manifest does not cover exactly the reviewed public files");

  const buildInfo = fs.existsSync(path.join(packageDirectory, "build_info.js")) ? fs.readFileSync(path.join(packageDirectory, "build_info.js"), "utf8") : "";
  const buildCommit = buildInfo.match(/\bcommit\s*:\s*["']([0-9a-f]{40})["']/i)?.[1]?.toLowerCase();
  if (!buildCommit) failures.push("build_info.js must contain a full commit for a built artifact");
  else if (buildCommit !== String(manifest.commit).toLowerCase()) failures.push("artifact manifest commit differs from build_info.js");
}

function verifyPublicCopy() {
  const explicitlyReviewed = [
    "README.md", "PROJECT_REPORT.md", "ALGORITHM_DOCUMENTATION.md", "generate_docs.py",
    "index.html", "dashboard.js", "institutionView.js", "reportRenderer.js", "LICENSE",
    "COPYRIGHT.md", "ORIGINALITY.md", "SECURITY.md", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md",
    "docs/RELEASE_CHECKLIST.md", "docs/QUALITY_AUDIT.md"
  ];
  const textExtensions = new Set([".html", ".js", ".md", ".txt", ".xml", ".csv", ".json", ".py"]);
  const files = [...new Set([
    ...explicitlyReviewed,
    ...PUBLIC_ARTIFACT_FILES,
    "build_info.js"
  ])].filter((file) => textExtensions.has(path.extname(file).toLowerCase()));
  const forbidden = ["学校", "大学", "比赛", "竞赛", "参赛", "创新大赛", "答辩", "指导老师", "课程", "学院", "赛事", "competition", "contest", "university", "school", "classroom", "college"];
  for (const file of files) {
    const filePath = path.join(packageDirectory, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8").toLowerCase();
    for (const term of forbidden) if (content.includes(term.toLowerCase())) failures.push(file + " contains restricted public term: " + term);
  }
}

verifyPublicCopy();
verifyArtifactManifest();
verifyVersionContract();

requirePatterns(".well-known/security.txt", [
  /^Contact:\s*\S+/m,
  /^Expires:\s*\S+/m,
  /^Preferred-Languages:\s*\S+/m,
  /^Canonical:\s*https?:\/\/\S+/m
]);

requirePatterns("index.html", [
  /<a[^>]+class="skip-link"[^>]+href="#main-content"/,
  /<main\b[^>]*id="main-content"/,
  /qjzh-boundary-banner/,
  /id="pipelineNext"[^>]+type="button"/,
  /adviceHistoryLog/,
  /knowledgeCatalogTitle/,
  /rel="canonical" href="https:\/\/runner-cpu\.github\.io\/QJZH\/"/,
  /<script defer src="dashboard\.js(?:\?v=[^"]+)?"><\/script>/,
  /<script defer src="riskPolicy\.js(?:\?v=[^"]+)?"><\/script>/
]);

requirePatterns("dashboard.js", [
  /LOCAL EXPERT KB/,
  /adviceForDisplay/,
  /yAmmonia/,
  /yTemperature/,
  /yHumidity/,
  /function getNextSample\(/,
  /function runImportedReplay\(/,
  /function updateTrendA11ySummary\(/,
  /QJZH\.chartControls\s*=\s*\{/
]);

requirePatterns("knowledgeBase.js", [/ADVICE_TEMPLATES/, /RULE_CATALOG/, /HIGH_HIGH_COLD_NIGHT/, /KB-TEMP-DROP-3C/]);
requirePatterns("decisionEngine.js", [/analyzeTrend/, /humanAdvice/, /urgencyLevel/, /trendLabel/, /cite\(ruleId\)/]);
requirePatterns("simulator.js", [/historyNh3\.slice\(-2\)/, /expertAdviceAtNight/, /morningAdvice/]);
requirePatterns("build_info.js", [
  /releaseVersion:/, /deploymentVersion:/, /modelVersion:/, /rulesVersion:/,
  /rulesFingerprint:/, /version:/, /commit:/, /builtAt:/, /environment:/
]);

for (const file of ["online_test.html", "404.html", "robots.txt", "sitemap.xml"]) read(file);
for (const file of ["COPYRIGHT.md", "ORIGINALITY.md", "SECURITY.md", "originality-manifest.json", "docs/USER_GUIDE.md", "docs/DATA_DICTIONARY.md", "docs/RELEASE_CHECKLIST.md", "docs/QUALITY_AUDIT.md"]) read(file);

const html = read("index.html");
if (html) {
  const mainCount = (html.match(/<main\b/g) || []).length;
  if (mainCount !== 1) failures.push(`index.html must contain exactly one <main>; found ${mainCount}`);

  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const externalScripts = scriptTags.filter((match) => /\bsrc=/.test(match[1]));
  for (const match of externalScripts) {
    if (!/\bdefer\b/.test(match[1])) failures.push(`External script must be deferred: <script${match[1]}>`);
  }
  for (const match of scriptTags.filter((entry) => !/\bsrc=/.test(entry[1]))) {
    if (match[2].trim().length > 5000) failures.push("index.html contains an inline script larger than 5 KB");
  }

  const sourceOrder = [
    "model_weights.js", "compensator_engine.js", "knowledgeBase.js", "decisionEngine.js",
    "simulator.js", "build_info.js", "ui_text_map.js", "errorHandler.js", "csvTemplate.js",
    "dataImport.js", "riskPolicy.js", "reportGenerator.js", "reportRenderer.js",
    "institutionView.js", "demoReset.js", "chart.js@3.9.1", "dashboard.js",
    "ui_interactions.js", "viewRouter.js"
  ];
  const scriptSources = externalScripts.map((match) => (match[1].match(/\bsrc="([^"]+)"/) || [])[1] || "");
  let previousIndex = -1;
  for (const source of sourceOrder) {
    const currentIndex = scriptSources.findIndex((scriptSource) => scriptSource.includes(source));
    if (currentIndex < 0) failures.push(`index.html is missing script dependency: ${source}`);
    else if (currentIndex <= previousIndex) failures.push(`index.html script dependency is out of order: ${source}`);
    previousIndex = Math.max(previousIndex, currentIndex);
  }

  const chartTag = externalScripts.map((match) => match[0]).find((tag) => tag.includes("chart.js@3.9.1")) || "";
  const expectedSri = "sha384-9MhbyIRcBVQiiC7FSd7T38oJNj2Zh+EfxS7/vjhBi4OOT78NlHSnzM31EZRWR1LZ";
  if (!chartTag.includes(`integrity="${expectedSri}"`)) failures.push("Chart.js must use the reviewed SHA-384 integrity value");
  if (!/crossorigin="anonymous"/.test(chartTag)) failures.push("Chart.js must set crossorigin=anonymous");

  const viewCount = (html.match(/class="view(?: active)?" data-view=/g) || []).length;
  if (viewCount !== 6) failures.push(`index.html must expose six routed views; found ${viewCount}`);
}

const knowledgeBasePath = path.join(packageDirectory, "knowledgeBase.js");
const knowledgeDocumentPath = path.join(packageDirectory, "knowledge-base-rules.md");
if (!fs.existsSync(knowledgeDocumentPath)) {
  failures.push("Missing required document: knowledge-base-rules.md");
} else if (fs.existsSync(knowledgeBasePath)) {
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(knowledgeBasePath, "utf8")).digest("hex");
  const document = fs.readFileSync(knowledgeDocumentPath, "utf8");
  if (!document.includes("# 青境智衡本地决策知识库规则清单")) {
    failures.push("knowledge-base-rules.md is missing its document title");
  }
  if (!document.includes(`SHA256:${sourceHash}`)) {
    failures.push("knowledge-base-rules.md is stale; regenerate it from knowledgeBase.js");
  }
}

if (failures.length > 0) {
  console.error(`[deployment] Verification failed in ${packageDirectory}:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[deployment] Verified deferred scripts, runtime surfaces and model integration in ${packageDirectory}`);
