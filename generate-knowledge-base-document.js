"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const sourcePath = path.join(root, "knowledgeBase.js");
const outputPath = path.join(root, "knowledge-base-rules.md");
const source = fs.readFileSync(sourcePath, "utf8");
const sourceHash = crypto.createHash("sha256").update(source).digest("hex");
const context = { window: {} };
context.window = context;
vm.runInNewContext(source, context, { filename: sourcePath });

const knowledgeBase = context.LocalKnowledgeBase;
if (!knowledgeBase) throw new Error("Unable to load LocalKnowledgeBase from knowledgeBase.js.");

function cell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function labelFor(level, labels) {
  return labels[level] || level;
}

const nh3Labels = { LOW: "低氨（< 10 ppm）", MEDIUM: "中氨（10-15 ppm）", HIGH: "高氨（> 15 ppm）" };
const humidityLabels = { LOW: "低湿（< 50%）", NORMAL: "适宜湿度（50-70%）", HIGH: "高湿（> 70%）" };
const temperatureLabels = { COLD: "低温（< 5℃）", NORMAL: "适宜温度（5-20℃）", HOT: "偏高温度（> 20℃）" };
const periodLabels = { NIGHT: "夜间", DAY: "白天", WINDOW: "通风窗口（12:00-14:00）" };

const lines = [];
lines.push("# 青境智衡本地决策知识库规则清单");
lines.push("");
lines.push("本文件由 `knowledgeBase.js` 自动生成，用于直观查看当前在网页中运行的本地专家规则。请勿直接编辑；更新规则后运行 `node generate-knowledge-base-document.js` 重新生成。");
lines.push("");
lines.push(`- 规则源文件：\`knowledgeBase.js\``);
lines.push(`- 源文件校验值：\`SHA256:${sourceHash}\``);
lines.push(`- 建议场景数：${Object.keys(knowledgeBase.ADVICE_TEMPLATES).length}`);
lines.push(`- 规则目录数：${Object.keys(knowledgeBase.RULE_CATALOG).length}`);
lines.push("");
lines.push("## 使用边界与优先级");
lines.push("");
lines.push("1. 温度单次降幅达到 3℃ 时，立即停止通风，优先于任何氨气处置规则。");
lines.push("2. 主动通风仅允许在 12:00-14:00 冬季窗口内执行；窗口外输出现场处置与报警建议。");
lines.push("3. 氨气采用 15.5 ppm 启动、9.5 ppm 停止的滞回区间，减少风机频繁启停。");
lines.push("4. 建议由氨气、湿度、温度和时段组合匹配；未精确命中时由决策引擎按同氨气等级优先降级匹配。");
lines.push("");
lines.push("## 物种舒适范围");
lines.push("");
lines.push("| 物种 | 氨气舒适区 | 温度舒适区 | 湿度舒适区 |");
lines.push("| --- | --- | --- | --- |");
for (const [species, profile] of Object.entries(knowledgeBase.SPECIES)) {
  lines.push(`| ${cell(species)} | ${profile.ammonia.comfortableMin}-${profile.ammonia.comfortableMax} ppm | ${profile.temperature.comfortableMin}-${profile.temperature.comfortableMax}℃ | ${profile.humidity.comfortableMin}-${profile.humidity.comfortableMax}% |`);
}
lines.push("");
lines.push("## 强制运行参数");
lines.push("");
lines.push("| 参数 | 当前值 | 关联规则 |");
lines.push("| --- | --- | --- |");
lines.push(`| 冬季通风窗口 | ${knowledgeBase.WINDOW_RULE.startHour}:00-${knowledgeBase.WINDOW_RULE.endHour}:00 | KB-WINTER-VENT-WINDOW |`);
lines.push(`| 最大允许温降 | ${knowledgeBase.WINDOW_RULE.maxTemperatureDrop}℃ | KB-TEMP-DROP-3C |`);
lines.push(`| 通风启动氨气 | ${knowledgeBase.HYSTERESIS.startNh3} ppm | KB-NH3-START、KB-NH3-HYSTERESIS |`);
lines.push(`| 通风停止氨气 | ${knowledgeBase.HYSTERESIS.stopNh3} ppm | KB-NH3-HYSTERESIS |`);
lines.push("");
lines.push("## 规则目录与依据");
lines.push("");
lines.push("| 规则 ID | 规则名称 | 触发条件 | 依据 |");
lines.push("| --- | --- | --- | --- |");
for (const [ruleId, rule] of Object.entries(knowledgeBase.RULE_CATALOG)) {
  lines.push(`| ${cell(ruleId)} | ${cell(rule.title)} | ${cell(rule.condition)} | ${cell(rule.source)} |`);
}
lines.push("");
lines.push("## 场景组合建议");
lines.push("");
lines.push("组合键格式：`氨气等级_湿度等级_温度等级_时段类型`。其中建议正文会原样显示在网页的“专家建议”区域。");
lines.push("");
lines.push("| 场景键 | 氨气 | 湿度 | 温度 | 时段 | 建议正文 |");
lines.push("| --- | --- | --- | --- | --- | --- |");
for (const [key, advice] of Object.entries(knowledgeBase.ADVICE_TEMPLATES)) {
  const [nh3, humidity, temperature, period] = key.split("_");
  lines.push(`| ${cell(key)} | ${cell(labelFor(nh3, nh3Labels))} | ${cell(labelFor(humidity, humidityLabels))} | ${cell(labelFor(temperature, temperatureLabels))} | ${cell(labelFor(period, periodLabels))} | ${cell(advice)} |`);
}
lines.push("");
lines.push("## 同步维护说明");
lines.push("");
lines.push("- 更新 `knowledgeBase.js` 后，运行 `node generate-knowledge-base-document.js`。");
lines.push("- 运行 `node verify-deployment.js .` 确认规则文档与知识库源文件校验值一致。");
lines.push("- GitHub Actions 会执行同一校验；规则已变而文档未更新时，推送校验会失败。");
lines.push("");

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`[knowledge-doc] Generated ${path.basename(outputPath)} from knowledgeBase.js (${Object.keys(knowledgeBase.ADVICE_TEMPLATES).length} advice templates).`);
