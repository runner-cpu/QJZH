"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const {
  ARTIFACT_MANIFEST,
  PUBLIC_ARTIFACT_DIRECTORIES,
  PUBLIC_ARTIFACT_FILES,
  PUBLIC_SOURCE_FILES,
  RULES_VERSION,
  comparePaths,
  normalizePublicPath
} = require("./pages-allowlist.js");

const ROOT = path.resolve(__dirname, "..");
const ROOT_DIST = path.resolve(ROOT, "dist");
const MODEL_FILES = new Set(["model_weights.js", "compensator_engine.js"]);
// artifact-manifest.json is generated only after every allowlisted file is copied.

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function comparablePath(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isWithin(parent, child) {
  const relative = path.relative(comparablePath(parent), comparablePath(child));
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function existingPath(value) {
  try {
    return fs.lstatSync(value);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function nearestExistingDirectory(value) {
  let current = path.resolve(value);
  while (true) {
    const stat = existingPath(current);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Output parent must be a real directory: " + current);
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Unable to resolve output parent: " + value);
    current = parent;
  }
}

function assertSafeOutput(output) {
  const resolved = path.resolve(output);
  if (samePath(resolved, ROOT) || samePath(resolved, path.parse(resolved).root)) {
    throw new Error("Refusing to replace unsafe output directory: " + resolved);
  }

  if (samePath(resolved, ROOT_DIST)) {
    const stat = existingPath(resolved);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error("The dist output must be a real directory, not a link or file: " + resolved);
    }
    if (stat) {
      const real = fs.realpathSync.native(resolved);
      if (!samePath(real, resolved)) throw new Error("The dist output resolves outside the project: " + resolved);
    }
    return { replaceExisting: Boolean(stat) };
  }

  const rootReal = fs.realpathSync.native(ROOT);
  if (isWithin(rootReal, resolved)) {
    throw new Error("Only the fixed project dist directory may be replaced: " + resolved);
  }

  const tempRoot = path.resolve(os.tmpdir());
  const tempReal = fs.realpathSync.native(tempRoot);
  if (!isWithin(tempReal, resolved)) {
    throw new Error("Custom output must be a new directory below the OS temporary root: " + resolved);
  }
  const current = existingPath(resolved);
  if (current) throw new Error("Custom output already exists; refusing recursive replacement: " + resolved);
  const parent = nearestExistingDirectory(path.dirname(resolved));
  const parentReal = fs.realpathSync.native(parent);
  if (!isWithin(tempReal, parentReal) && !samePath(parentReal, tempReal)) {
    throw new Error("Custom output parent resolves outside the OS temporary root: " + parent);
  }
  return { replaceExisting: false };
}

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8").replace(/\r\n?/g, "\n");
}

function assertNoSymlinkPath(base, relativePath) {
  const normalized = normalizePublicPath(relativePath);
  const parts = normalized.split("/");
  let current = path.resolve(base);
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("Public artifact entries cannot be symbolic links: " + normalized);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error("Public artifact parent is not a directory: " + normalized);
    }
  }
}

function resolveCommit() {
  const environmentCommit = String(process.env.GITHUB_SHA || "").trim();
  if (/^[0-9a-f]{40}$/i.test(environmentCommit)) return environmentCommit.toLowerCase();
  const repositoryCommit = childProcess.execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(repositoryCommit)) throw new Error("Unable to determine a 40-character Git commit");
  return repositoryCommit.toLowerCase();
}

function resolveBuiltAt() {
  const requested = String(process.env.BUILD_TIMESTAMP || "").trim();
  if (requested) {
    const parsed = new Date(requested);
    if (!Number.isFinite(parsed.getTime())) throw new Error("BUILD_TIMESTAMP must be an ISO-8601 date");
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function metaTagValue(html, name) {
  const match = html.match(new RegExp("<meta\\s+name=[\\\"']" + name + "[\\\"']\\s+content=[\\\"']([^\\\"']+)", "i"));
  return match ? match[1].trim() : "";
}

function resolveModelVersion() {
  const source = readUtf8("model_weights.js");
  const match = source.match(/\bversion\s*:\s*[\"']([^\"']+)[\"']/);
  if (!match || !/^\d+\.\d+\.\d+$/.test(match[1])) throw new Error("model_weights.js has no valid semantic version");
  return match[1];
}

function resolvePageContract(modelVersion) {
  const pages = ["index.html", "online_test.html"].map((file) => ({ file, html: readUtf8(file) }));
  const releaseVersions = pages.map(({ file, html }) => {
    const value = metaTagValue(html, "qjzh-release-version");
    if (!/^\d{8}$/.test(value)) throw new Error(file + " must declare a YYYYMMDD qjzh-release-version");
    return value;
  });
  if (new Set(releaseVersions).size !== 1) throw new Error("index.html and online_test.html must share qjzh-release-version");
  const modelVersions = pages.map(({ file, html }) => {
    const value = metaTagValue(html, "qjzh-model-version");
    if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(file + " must declare a semantic qjzh-model-version");
    if (value !== modelVersion) throw new Error(file + " qjzh-model-version differs from model_weights.js");
    return value;
  });
  if (new Set(modelVersions).size !== 1) throw new Error("application and diagnostics pages must share qjzh-model-version");

  for (const { file, html } of pages) {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>/gi)]
      .map((match) => match[1])
      .filter((src) => !/^https?:\/\//i.test(src));
    for (const source of scripts) {
      const parts = source.split("?", 2);
      const scriptFile = parts[0];
      const query = parts[1] || "";
      const versionMatch = query.match(/(?:^|&)v=([^&#]+)/);
      if (!versionMatch || !versionMatch[1]) throw new Error(file + " local script is missing a cache version: " + source);
      const cleanFile = scriptFile.replace(/^\.\//, "");
      const expected = MODEL_FILES.has(cleanFile) ? modelVersion : releaseVersions[0];
      if (versionMatch[1] !== expected) {
        throw new Error(file + " script version mismatch for " + cleanFile + "; expected " + expected);
      }
    }
  }
  return { releaseVersion: releaseVersions[0], modelVersion };
}

function resolveRulesFingerprint() {
  return crypto.createHash("sha256").update(readUtf8("knowledgeBase.js"), "utf8").digest("hex");
}

function metadataSource(commit, builtAt, metadata) {
  const runNumber = String(process.env.GITHUB_RUN_NUMBER || "").trim();
  const deploymentVersion = /^\d+$/.test(runNumber) ? "build-" + runNumber : "build-" + commit.slice(0, 12);
  return [
    "/* Generated by scripts/build-pages.js. Do not edit the deployed copy. */",
    "(function (root) {",
    "  \"use strict\";",
    "  root.BUILD_INFO = Object.freeze({",
    "    releaseVersion: " + JSON.stringify(metadata.releaseVersion) + ",",
    "    deploymentVersion: " + JSON.stringify(deploymentVersion) + ",",
    "    modelVersion: " + JSON.stringify(metadata.modelVersion) + ",",
    "    rulesVersion: " + JSON.stringify(metadata.rulesVersion) + ",",
    "    rulesFingerprint: " + JSON.stringify("sha256:" + metadata.rulesFingerprint) + ",",
    "    // Backward-compatible alias for integrations that still read version.",
    "    version: " + JSON.stringify(deploymentVersion) + ",",
    "    commit: " + JSON.stringify(commit) + ",",
    "    builtAt: " + JSON.stringify(builtAt) + ",",
    "    environment: \"production\"",
    "  });",
    "})(typeof window !== \"undefined\" ? window : globalThis);",
    ""
  ].join("\n");
}

function assertArtifactEntry(output, relativePath, expectedType) {
  const normalized = normalizePublicPath(relativePath);
  const absolute = path.join(output, ...normalized.split("/"));
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error("Artifact entries cannot be symbolic links: " + normalized);
  const realOutput = fs.realpathSync.native(output);
  const realEntry = fs.realpathSync.native(absolute);
  if (!isWithin(realOutput, realEntry)) throw new Error("Artifact entry resolves outside output: " + normalized);
  if (expectedType === "directory" && !stat.isDirectory()) throw new Error("Artifact entry is not a directory: " + normalized);
  if (expectedType === "file" && !stat.isFile()) throw new Error("Artifact entry is not a regular file: " + normalized);
  return stat;
}

function collectArtifactFiles(output) {
  const files = [];
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      const normalized = normalizePublicPath(relative);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Artifact entries cannot be symbolic links: " + normalized);
      if (entry.isDirectory()) {
        assertArtifactEntry(output, normalized, "directory");
        if (!PUBLIC_ARTIFACT_DIRECTORIES.includes(normalized)) throw new Error("Artifact directory is not allowlisted: " + normalized);
        visit(absolute, normalized);
      } else if (entry.isFile()) {
        assertArtifactEntry(output, normalized, "file");
        if (normalized === ARTIFACT_MANIFEST) continue;
        if (!PUBLIC_ARTIFACT_FILES.includes(normalized)) throw new Error("Artifact file is not allowlisted: " + normalized);
        files.push(normalized);
      } else {
        throw new Error("Artifact contains an unsupported filesystem entry: " + normalized);
      }
    }
  }
  visit(output, "");
  return files.sort(comparePaths);
}

function createArtifactManifest(output, commit, generatedAt) {
  const actualFiles = collectArtifactFiles(output);
  if (JSON.stringify(actualFiles) !== JSON.stringify(PUBLIC_ARTIFACT_FILES)) {
    const actual = new Set(actualFiles);
    const expected = new Set(PUBLIC_ARTIFACT_FILES);
    const extra = actualFiles.filter((file) => !expected.has(file));
    const missing = PUBLIC_ARTIFACT_FILES.filter((file) => !actual.has(file));
    throw new Error("Artifact allowlist mismatch; extra: " + (extra.join(", ") || "none") + "; missing: " + (missing.join(", ") || "none"));
  }
  const files = actualFiles.map((relativePath) => {
    const absolute = path.join(output, ...relativePath.split("/"));
    assertArtifactEntry(output, relativePath, "file");
    const data = fs.readFileSync(absolute);
    const after = fs.lstatSync(absolute);
    if (after.isSymbolicLink() || !after.isFile()) throw new Error("Artifact file changed during hashing: " + relativePath);
    return {
      path: relativePath,
      bytes: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex")
    };
  });
  const manifest = { commit, generatedAt, files };
  fs.writeFileSync(path.join(output, ARTIFACT_MANIFEST), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

function build() {
  const requestedOutput = argumentValue("--out", "dist");
  if (String(requestedOutput).includes("\0")) throw new Error("--out cannot contain a NUL character");
  const output = path.resolve(ROOT, requestedOutput);
  const outputPolicy = assertSafeOutput(output);
  if (!PUBLIC_SOURCE_FILES.includes(".well-known/security.txt")) throw new Error("security.txt must remain in the reviewed Pages allowlist");

  for (const relativePath of PUBLIC_SOURCE_FILES) {
    const source = path.join(ROOT, ...relativePath.split("/"));
    assertNoSymlinkPath(ROOT, relativePath);
    const stat = fs.lstatSync(source);
    if (!stat.isFile()) throw new Error("Public artifact source must be a regular file: " + relativePath);
  }

  const modelVersion = resolveModelVersion();
  const pageContract = resolvePageContract(modelVersion);
  const metadata = {
    releaseVersion: pageContract.releaseVersion,
    modelVersion,
    rulesVersion: RULES_VERSION,
    rulesFingerprint: resolveRulesFingerprint()
  };
  const commit = resolveCommit();
  const builtAt = resolveBuiltAt();

  if (outputPolicy.replaceExisting) fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const relativePath of PUBLIC_SOURCE_FILES) {
    const destination = path.join(output, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...relativePath.split("/")), destination);
  }
  fs.writeFileSync(path.join(output, "build_info.js"), metadataSource(commit, builtAt, metadata), "utf8");
  fs.writeFileSync(path.join(output, ".nojekyll"), "", "utf8");
  const manifest = createArtifactManifest(output, commit, builtAt);
  console.log("[pages-build] Published " + PUBLIC_SOURCE_FILES.length + " reviewed source files to " + output);
  console.log("[pages-build] Manifest covers " + manifest.files.length + " files");
  console.log("[pages-build] Commit " + commit + " at " + builtAt);
}

if (require.main === module) {
  try {
    build();
  } catch (error) {
    console.error("[pages-build] " + error.message);
    process.exit(1);
  }
}

module.exports = Object.freeze({ build, collectArtifactFiles, createArtifactManifest, metadataSource });
