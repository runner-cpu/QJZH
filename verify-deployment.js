"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const packageDirectory = path.resolve(process.argv[2] || "deploy-gh-pages");
const requirements = [
  {
    file: "index.html",
    checks: [
      /<script\s+src="knowledgeBase\.js(?:\?v=[^"]+)?"><\/script>/,
      /<script\s+src="decisionEngine\.js(?:\?v=[^"]+)?"><\/script>/,
      /<script\s+src="simulator\.js(?:\?v=[^"]+)?"><\/script>/,
      /LOCAL EXPERT KB/,
      /adviceHistoryLog/,
      /adviceForDisplay/,
      /knowledgeCatalogTitle/,
      /yAmmonia/,
      /yTemperature/,
      /yHumidity/
    ]
  },
  {
    file: "knowledgeBase.js",
    checks: [/ADVICE_TEMPLATES/, /RULE_CATALOG/, /HIGH_HIGH_COLD_NIGHT/, /KB-TEMP-DROP-3C/]
  },
  {
    file: "decisionEngine.js",
    checks: [/analyzeTrend/, /humanAdvice/, /urgencyLevel/, /trendLabel/, /cite\(ruleId\)/]
  },
  {
    file: "simulator.js",
    checks: [/historyNh3\.slice\(-2\)/, /expertAdviceAtNight/, /morningAdvice/]
  }
];

const failures = [];
for (const requirement of requirements) {
  const filePath = path.join(packageDirectory, requirement.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${requirement.file}`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  requirement.checks.forEach((check) => {
    if (!check.test(content)) failures.push(`${requirement.file} is missing ${check}`);
  });
}

const knowledgeBasePath = path.join(packageDirectory, "knowledgeBase.js");
const knowledgeDocumentPath = path.join(packageDirectory, "knowledge-base-rules.md");
if (!fs.existsSync(knowledgeDocumentPath)) {
  failures.push("Missing required document: knowledge-base-rules.md");
} else if (fs.existsSync(knowledgeBasePath)) {
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(knowledgeBasePath, "utf8")).digest("hex");
  const document = fs.readFileSync(knowledgeDocumentPath, "utf8");
  if (!document.includes(`# 青境智衡本地决策知识库规则清单`)) {
    failures.push("knowledge-base-rules.md is missing its document title");
  }
  if (!document.includes(`SHA256:${sourceHash}`)) {
    failures.push("knowledge-base-rules.md is stale; regenerate it from knowledgeBase.js");
  }
}

if (failures.length > 0) {
  console.error("[model-lock] Deployment blocked. The expert knowledge-base integration is incomplete:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[model-lock] Verified expert knowledge-base integration in ${packageDirectory}`);
