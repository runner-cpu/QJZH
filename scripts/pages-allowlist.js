"use strict";

// This file is the single source of truth for the Pages publication surface.
// Keep the list explicit: adding a new public file is an auditable change, not
// an accidental consequence of copying a directory.
const path = require("node:path");

const PUBLIC_SOURCE_FILES = Object.freeze([
  "index.html",
  "online_test.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "COPYRIGHT.md",
  "ORIGINALITY.md",
  "SECURITY.md",
  ".well-known/security.txt",
  "originality-manifest.json",
  "docs/USER_GUIDE.md",
  "docs/DATA_DICTIONARY.md",
  "docs/QUALITY_AUDIT.md",
  "docs/RELEASE_CHECKLIST.md",
  "dashboard.js",
  "riskPolicy.js",
  "model_weights.js",
  "compensator_engine.js",
  "knowledgeBase.js",
  "decisionEngine.js",
  "simulator.js",
  "ui_text_map.js",
  "errorHandler.js",
  "csvTemplate.js",
  "dataImport.js",
  "reportGenerator.js",
  "reportRenderer.js",
  "institutionView.js",
  "demoReset.js",
  "ui_interactions.js",
  "viewRouter.js",
  "knowledge-base-rules.md",
  "ALGORITHM_DOCUMENTATION.md",
  "assets/csv_sample_qinghai.csv",
  "assets/csv_template.csv",
  "assets/og_cover.png",
  "assets/screenshots/algorithm.png",
  "assets/screenshots/data-intake.png",
  "assets/screenshots/overview.png",
  "assets/screenshots/report.png"
]);

const GENERATED_ARTIFACT_FILES = Object.freeze([".nojekyll", "build_info.js"]);
const ARTIFACT_MANIFEST = "artifact-manifest.json";
const RULES_VERSION = "knowledgeBase.js@1.0.0";
const FORBIDDEN_ARTIFACT_ROOTS = Object.freeze([
  ".git", ".superpowers", "backups", "dist", "output", "tests", "tmp", "__pycache__"
]);

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePublicPath(relativePath) {
  const original = String(relativePath);
  if (!original || original.includes("\0") || original.includes("\\") || /[\u0000-\u001f\u007f]/.test(original)) {
    throw new Error("Artifact path contains an unsafe character: " + original);
  }
  const normalized = original.split(path.sep).join("/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Artifact path must be relative and normalized: " + original);
  }
  if (FORBIDDEN_ARTIFACT_ROOTS.includes(segments[0])) {
    throw new Error("Internal path cannot be published: " + normalized);
  }
  return normalized;
}

const PUBLIC_ARTIFACT_FILES = Object.freeze(
  [...PUBLIC_SOURCE_FILES, ...GENERATED_ARTIFACT_FILES].sort(comparePaths)
);
const PUBLIC_ARTIFACT_DIRECTORIES = Object.freeze(
  Array.from(
    new Set(
      PUBLIC_ARTIFACT_FILES.flatMap((file) => {
        const parts = file.split("/");
        const directories = [];
        for (let index = 1; index < parts.length; index += 1) directories.push(parts.slice(0, index).join("/"));
        return directories;
      })
    )
  ).sort(comparePaths)
);

module.exports = Object.freeze({
  ARTIFACT_MANIFEST,
  FORBIDDEN_ARTIFACT_ROOTS,
  GENERATED_ARTIFACT_FILES,
  PUBLIC_ARTIFACT_DIRECTORIES,
  PUBLIC_ARTIFACT_FILES,
  PUBLIC_SOURCE_FILES,
  RULES_VERSION,
  comparePaths,
  normalizePublicPath
});
