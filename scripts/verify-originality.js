"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "originality-manifest.json");
const PROTECTED_FILES = [
  ["LICENSE", "custom usage terms"],
  ["COPYRIGHT.md", "rights and third-party notices"],
  ["ORIGINALITY.md", "provenance statement"],
  ["SECURITY.md", "security boundary"],
  ["README.md", "public product documentation"],
  ["index.html", "application shell and visual system"],
  ["dashboard.js", "dashboard behavior and localized copy"],
  ["dataImport.js", "local data ingestion and validation"],
  ["institutionView.js", "multi-site analysis view"],
  ["reportGenerator.js", "report aggregation"],
  ["reportRenderer.js", "printable report renderer"],
  ["ui_interactions.js", "interaction and display behavior"],
  ["viewRouter.js", "six-view navigation"],
  ["knowledgeBase.js", "locked rule knowledge base"],
  ["decisionEngine.js", "locked decision engine"],
  ["compensator_engine.js", "locked compensation implementation"],
  ["model_weights.js", "locked model weights"],
  ["simulator.js", "locked demonstration simulator"],
  ["scripts/build-pages.js", "Pages artifact builder"],
  ["verify-deployment.js", "deployment verification surface"],
  ["scripts/verify-originality.js", "originality verification"],
  ["assets/og_cover.png", "social preview artwork"]
];

function hashFile(relative) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relative))).digest("hex");
}

function safeRelative(relative) {
  const normalized = String(relative || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return false;
  const resolved = path.resolve(ROOT, normalized);
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep);
}

function verifyTerms() {
  const license = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
  const copyright = fs.readFileSync(path.join(ROOT, "COPYRIGHT.md"), "utf8");
  const originality = fs.readFileSync(path.join(ROOT, "ORIGINALITY.md"), "utf8");
  const required = [
    [license, "保留所有权利", "LICENSE must reserve all rights"],
    [license, "禁止复制", "LICENSE must prohibit copying"],
    [license, "再发布", "LICENSE must address redistribution"],
    [copyright, "书面许可", "COPYRIGHT must require written permission"],
    [originality, "SHA-256", "ORIGINALITY must document hash evidence"]
  ];
  for (const [content, term, message] of required) if (!content.includes(term)) throw new Error(message);
}

function createManifest() {
  return {
    version: 1,
    algorithm: "SHA-256",
    generatedBy: "scripts/verify-originality.js",
    files: PROTECTED_FILES.map(([file, purpose]) => ({ path: file, purpose, sha256: hashFile(file) }))
  };
}

function writeManifest() {
  for (const [file] of PROTECTED_FILES) if (!safeRelative(file) || !fs.existsSync(path.join(ROOT, file))) throw new Error("Missing protected file: " + file);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(createManifest(), null, 2) + "\n", "utf8");
}

function verifyManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error("Missing originality-manifest.json; run with --write");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.version !== 1 || manifest.algorithm !== "SHA-256" || !Array.isArray(manifest.files)) throw new Error("Invalid originality manifest header");
  const expected = new Map(PROTECTED_FILES.map(([file]) => [file, true]));
  const actual = new Map();
  for (const entry of manifest.files) {
    if (!entry || !safeRelative(entry.path) || actual.has(entry.path)) throw new Error("Invalid or duplicate manifest path: " + (entry && entry.path));
    if (!expected.has(entry.path)) throw new Error("Unexpected protected path: " + entry.path);
    if (!fs.existsSync(path.join(ROOT, entry.path))) throw new Error("Missing protected file: " + entry.path);
    const actualHash = hashFile(entry.path);
    if (actualHash !== entry.sha256) throw new Error("Hash mismatch: " + entry.path);
    actual.set(entry.path, true);
  }
  for (const [file] of PROTECTED_FILES) if (!actual.has(file)) throw new Error("Manifest is missing: " + file);
  verifyTerms();
  return manifest.files.length;
}

try {
  if (process.argv.includes("--write")) {
    writeManifest();
    console.log("[originality] wrote " + PROTECTED_FILES.length + " protected file hashes");
  }
  const count = verifyManifest();
  console.log("[originality] verified " + count + " protected file hashes and license terms");
} catch (error) {
  console.error("[originality] " + error.message);
  process.exit(1);
}
