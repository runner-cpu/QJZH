"use strict";

// A dependency-free post-deploy probe. Keep this list intentionally small and
// fixed: it must never turn into a crawler for internal or unreviewed paths.
const PUBLIC_CHECKS = Object.freeze([
  Object.freeze({ path: "/", label: "home page", marker: /<title\b/i }),
  Object.freeze({ path: "/online_test.html", label: "diagnostics page", marker: /id=["']version["']/i }),
  Object.freeze({ path: "/COPYRIGHT.md", label: "copyright notice", marker: /SHA-256|copyright|rights/i }),
  Object.freeze({ path: "/ORIGINALITY.md", label: "originality notice", marker: /SHA-256|originality|build_info/i }),
  Object.freeze({ path: "/SECURITY.md", label: "security policy", marker: /QJZH_|CSV|security/i }),
  Object.freeze({ path: "/docs/DATA_DICTIONARY.md", label: "data dictionary", marker: /CSV|timestamp|site_id/i }),
  Object.freeze({ path: "/docs/QUALITY_AUDIT.md", label: "quality audit", marker: /quality|accessibility|security/i }),
  Object.freeze({ path: "/build_info.js", label: "build metadata", marker: /BUILD_INFO/ }),
  Object.freeze({ path: "/robots.txt", label: "robots policy", marker: /^User-agent:/m }),
  Object.freeze({ path: "/sitemap.xml", label: "sitemap", marker: /<urlset\b/i }),
  Object.freeze({ path: "/.well-known/security.txt", label: "security disclosure", marker: /^Contact:\s*\S+/m }),
  Object.freeze({ path: "/artifact-manifest.json", label: "artifact manifest", marker: /["']files["']\s*:/i })
]);

function parseArgs(argv) {
  const options = { base: "", retries: 4, delayMs: 250, expectedCommit: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.base = argv[++index] || "";
    else if (argument === "--retries") options.retries = Number(argv[++index]);
    else if (argument === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (argument === "--expected-commit") options.expectedCommit = String(argv[++index] || "").trim().toLowerCase();
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error("Unknown argument: " + argument);
  }
  if (options.help) return options;
  if (!options.base) throw new Error("--base is required");
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 12) {
    throw new Error("--retries must be an integer between 0 and 12");
  }
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0 || options.delayMs > 10000) {
    throw new Error("--delay-ms must be an integer between 0 and 10000");
  }
  if (options.expectedCommit && !/^[0-9a-f]{40}$/.test(options.expectedCommit)) {
    throw new Error("--expected-commit must be a 40-character hexadecimal SHA");
  }
  const parsedBase = new URL(options.base);
  if (!/^https?:$/.test(parsedBase.protocol)) throw new Error("--base must use http or https");
  if (parsedBase.search || parsedBase.hash) throw new Error("--base must not include a query or fragment");
  options.base = parsedBase.href.endsWith("/") ? parsedBase.href : parsedBase.href + "/";
  return options;
}

function resourceUrl(base, resourcePath) {
  // Resolve without a leading slash so a project Pages base such as /QJZH/
  // remains part of the URL.
  return new URL(resourcePath.replace(/^\/+/, ""), base).href;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function checkResource(base, check, expectedCommit) {
  const url = resourceUrl(base, check.path);
  const result = await fetchText(url);
  if (result.status !== 200) throw new Error(check.label + " returned HTTP " + result.status);
  if (!check.marker.test(result.body)) throw new Error(check.label + " content marker mismatch");
  if (check.path === "/build_info.js" && expectedCommit) {
    const match = result.body.match(/\bcommit\s*:\s*["']([0-9a-f]{40})["']/i);
    if (!match || match[1].toLowerCase() !== expectedCommit) {
      throw new Error("build metadata commit does not match expected GitHub SHA");
    }
  }
  if (check.path === "/artifact-manifest.json" && expectedCommit) {
    let manifest;
    try {
      manifest = JSON.parse(result.body);
    } catch (error) {
      throw new Error("artifact manifest is not valid JSON: " + error.message);
    }
    const manifestCommit = manifest && typeof manifest.commit === "string" ? manifest.commit.trim().toLowerCase() : "";
    if (!manifest || typeof manifest !== "object" || !/^[0-9a-f]{40}$/.test(manifestCommit) || manifestCommit !== expectedCommit) {
      throw new Error("artifact manifest commit does not match expected GitHub SHA");
    }
  }
}

async function checkWithRetries(base, check, retries, delayMs, expectedCommit) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await checkResource(base, check, expectedCommit);
      console.log("[pages-smoke] OK " + check.path + " (attempt " + (attempt + 1) + ")");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(delayMs * Math.pow(2, attempt));
    }
  }
  throw new Error(check.path + " failed after " + (retries + 1) + " attempts: " + (lastError?.message || "unknown error"));
}

async function runSmoke(options) {
  for (const check of PUBLIC_CHECKS) {
    await checkWithRetries(options.base, check, options.retries, options.delayMs, options.expectedCommit);
  }
  console.log("[pages-smoke] Fixed public URL checks passed");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("Usage: node scripts/smoke-pages.js --base <url> [--retries 4] [--expected-commit <sha>]");
    return;
  }
  await runSmoke(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[pages-smoke] " + error.message);
    process.exitCode = 1;
  });
}

module.exports = { PUBLIC_CHECKS, parseArgs, resourceUrl, runSmoke };
