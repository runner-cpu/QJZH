"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const packageDirectory = path.resolve(process.argv[2] || ".");
const failures = [];

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
requirePatterns("build_info.js", [/version:/, /commit:/, /builtAt:/, /environment:/]);

for (const file of ["online_test.html", "404.html", "robots.txt", "sitemap.xml"]) read(file);

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
