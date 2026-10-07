/**
 * Verify that the highland NH3 model assets remain available to the dashboard.
 * @returns {void} Throws when model inference or the required script order changes.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;

/** @param {boolean} condition @param {string} message @returns {void} */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string} fileName @returns {string} */
function read(fileName) {
  return fs.readFileSync(path.join(root, fileName), "utf8");
}

const index = read("index.html");
const dashboard = read("dashboard.js");
const releaseVersion = index.match(/<meta\s+name="qjzh-release-version"\s+content="([^"]+)"/i)?.[1] || "";
const modelVersion = read("model_weights.js").match(/\bversion\s*:\s*["']([^"']+)["']/)?.[1] || "";
assert(/^\d{8}$/.test(releaseVersion), "index.html must declare a YYYYMMDD release version.");
assert(/^\d+\.\d+\.\d+$/.test(modelVersion), "model_weights.js must declare a semantic version.");
const scriptTag = (fileName, version) => {
  const match = [...index.matchAll(/<script defer src="([^"]+)"><\/script>/g)].find((entry) => {
    const [file, query] = entry[1].replaceAll("&amp;", "&").split("?", 2);
    return file === fileName && new URLSearchParams(query).get("v") === version;
  });
  return match ? match[0] : "";
};
const weightsTag = scriptTag("model_weights.js", modelVersion);
const engineTag = scriptTag("compensator_engine.js", modelVersion);
const simulatorTag = scriptTag("simulator.js", releaseVersion);
const weightsIndex = weightsTag ? index.indexOf(weightsTag) : -1;
const engineIndex = engineTag ? index.indexOf(engineTag) : -1;
const simulatorIndex = simulatorTag ? index.indexOf(simulatorTag) : -1;

assert(index.includes("COMPENSATOR-LOCK"), "Missing COMPENSATOR-LOCK marker in index.html.");
assert(weightsIndex >= 0, "Missing versioned model_weights.js tag.");
assert(engineIndex > weightsIndex, "compensator_engine.js must load after model_weights.js.");
assert(simulatorIndex > engineIndex, "simulator.js must load after the compensation engine.");
assert(dashboard.includes("compensate(next.altitude"), "Dashboard no longer calls compensate(...).");
assert(!index.includes("highland_compensator.js") && !dashboard.includes("highland_compensator.js"), "Legacy embedded-weight runtime must not be loaded.");
assert(!dashboard.includes("HighlandCompensator"), "Dashboard must use global compensate(...), not the legacy runtime.");

const context = { console };
context.globalThis = context;
vm.runInNewContext(read("model_weights.js"), context, { filename: "model_weights.js" });
vm.runInNewContext(read("compensator_engine.js"), context, { filename: "compensator_engine.js" });

assert(context.MODEL_WEIGHTS && context.MODEL_WEIGHTS.version === "1.0.0", "Model weights are missing or have an unexpected version.");
assert(typeof context.compensate === "function", "Global compensate(...) was not exported.");

const result = context.compensate(2800, 10, 60, 30);
assert(Number.isFinite(result) && result >= 15 && result <= 25, "Reference compensation result is outside 15-25 ppm.");

console.log(`Compensator lock passed: v${context.MODEL_WEIGHTS.version}, ${result.toFixed(2)} ppm`);
