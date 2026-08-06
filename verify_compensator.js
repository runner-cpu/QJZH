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
const weightsTag = '<script src="model_weights.js?v=1.0.0"></script>';
const engineTag = '<script src="compensator_engine.js?v=1.0.0"></script>';
const uiTag = '<script src="ui_interactions.js?v=1.0.0" defer></script>';
const weightsIndex = index.indexOf(weightsTag);
const engineIndex = index.indexOf(engineTag);
const uiIndex = index.indexOf(uiTag);

assert(index.includes("COMPENSATOR-LOCK"), "Missing COMPENSATOR-LOCK marker in index.html.");
assert(weightsIndex >= 0, "Missing versioned model_weights.js tag.");
assert(engineIndex > weightsIndex, "compensator_engine.js must load after model_weights.js.");
assert(uiIndex > engineIndex, "ui_interactions.js must load after the compensation engine.");
assert(index.includes("compensate(next.altitude"), "Dashboard no longer calls compensate(...).");

const context = { console };
context.globalThis = context;
vm.runInNewContext(read("model_weights.js"), context, { filename: "model_weights.js" });
vm.runInNewContext(read("compensator_engine.js"), context, { filename: "compensator_engine.js" });

assert(context.MODEL_WEIGHTS && context.MODEL_WEIGHTS.version === "1.0.0", "Model weights are missing or have an unexpected version.");
assert(typeof context.compensate === "function", "Global compensate(...) was not exported.");

const result = context.compensate(2800, 10, 60, 30);
assert(Number.isFinite(result) && result >= 15 && result <= 25, "Reference compensation result is outside 15-25 ppm.");

console.log(`Compensator lock passed: v${context.MODEL_WEIGHTS.version}, ${result.toFixed(2)} ppm`);
