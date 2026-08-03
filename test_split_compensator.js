const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const messages = [];
const context = { console: { error: (message) => messages.push(message) } };
vm.runInNewContext(fs.readFileSync("model_weights.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("compensator_engine.js", "utf8"), context);

assert.equal(typeof context.MODEL_WEIGHTS, "object");
assert.equal(context.MODEL_WEIGHTS.version, "1.0.0");
assert.equal(typeof context.compensate, "function");
const value = context.compensate(2800, 10, 60, 30);
assert.ok(Number.isFinite(value));
assert.ok(value >= 15 && value <= 25, `unexpected compensation value: ${value}`);

const missingWeights = { console: { error: (message) => messages.push(message) } };
vm.runInNewContext(fs.readFileSync("compensator_engine.js", "utf8"), missingWeights);
assert.throws(() => missingWeights.compensate(2800, 10, 60, 30), /权重文件未加载/);

const page = fs.readFileSync("index.html", "utf8");
const weightsPosition = page.indexOf('model_weights.js?v=1.0.0');
const enginePosition = page.indexOf('compensator_engine.js');
const uiPosition = page.indexOf('ui_interactions.js');
assert.ok(weightsPosition >= 0 && weightsPosition < enginePosition && enginePosition < uiPosition);
assert.equal(page.includes("highland_compensator.js"), false);
console.log("split compensator contract: PASS");
