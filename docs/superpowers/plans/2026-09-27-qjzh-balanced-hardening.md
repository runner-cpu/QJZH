# 青境智衡均衡收官实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复数据可信、移动端、可访问性、三语、性能和发布门禁问题，并将验证通过的版本发布到 GitHub Pages。

**Architecture:** 保留静态六视图 SPA 和五个锁定算法文件，在未锁定模块之间增加轻量风险策略接口。导入层只保存规范化原始数据，报告与机构层始终重算派生值；主内联程序提取为 `dashboard.js`，GitHub Actions 先验证再部署 allowlist artifact。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、Chart.js 3.9.1、Node.js `node:test`、GitHub Actions / Pages。

## Global Constraints

- `knowledgeBase.js`、`decisionEngine.js`、`compensator_engine.js`、`model_weights.js`、`simulator.js` 必须保持字节级不变。
- NH₃ 展示风险跟随锁定引擎：`< 10` 正常、`10–15` 关注、`> 15` 紧急。
- `0.71%` 只能称为内部记录的合成测试集平均相对误差，不能称为单点误差范围。
- 保留六视图路由、中英藏三语、深浅主题、打印、Chart.js SRI 与 Canvas 降级。
- 320–2560 px 不出现页面级横向溢出；390 px 底栏六个入口无需横向滚动即可访问。
- 每项行为修改遵循 RED → GREEN → REFACTOR；每个任务提交前运行其定向测试。
- 本轮不加入账号、云同步、多租户、模型重训、自动硬件控制、Service Worker 或前端框架。

---

## Shared Test Harness

Add these helpers at the top of `tests/round9_data_trust.test.js`. The accessibility and visual-contract files reuse `ROOT`, `read()`, and `extractElement()`.

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function throwingStorage() {
  return { get length() { return 0; }, key() { return null; }, getItem() { return null; }, setItem() { throw new Error("quota"); }, removeItem() {} };
}

function loadScript(file, overrides = {}, existingWindow) {
  const listeners = {};
  const window = existingWindow || {
    QJZH: {}, localStorage: createStorage(), sessionStorage: createStorage(),
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
    setTimeout, clearTimeout, console
  };
  Object.assign(window, overrides);
  window.window = window;
  window.globalThis = window;
  const context = vm.createContext({ window, globalThis: window, console, setTimeout, clearTimeout, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(read(file), context, { filename: file });
  return { window, listeners, context };
}

function loadDataImport(overrides = {}) { return loadScript("dataImport.js", overrides); }

function validRecord(overrides = {}) {
  return Object.assign({ timestamp: "2026-09-27T08:00:00+08:00", site_id: "QH-TEST-01", altitude_m: 2620, temp_c: -5, rh_percent: 62, raw_nh3_ppm: 18.6, device_model: "sensor-x" }, overrides);
}

function seed(storage, entries) { for (const [key, value] of Object.entries(entries)) storage.setItem(key, value); }

function loadReportStack({ records = [], compensate = () => 8 } = {}) {
  const base = loadScript("reportGenerator.js", {
    compensate,
    QJZH: { dataImport: { getRecords() { return records; } }, riskPolicy: { classifyNh3(value) { return Number(value) > 15 ? { code: "urgent", label: "紧急" } : Number(value) >= 10 ? { code: "watch", label: "关注" } : { code: "normal", label: "正常" }; } } }
  });
  return base;
}

function sampleRecords() { return [validRecord({ timestamp: "2026-09-15T08:00:00+08:00" })]; }

function minimalReport() {
  return { language: "zh", startDate: "2026-09-01", endDate: "2026-09-30", noRecords: true, riskDistribution: {}, trendSeries: [], generatedAt: "2026-09-27T00:00:00Z", source: "QJZH 本地记录" };
}

function extractElement(html, id) {
  const match = html.match(new RegExp("<[^>]+id=\\\"" + id + "\\\"[^>]*>"));
  assert.ok(match, id + " exists");
  return match[0];
}
```

## 阶段 A：可信数据与报告

### Task 1: 收紧导入边界并保护站点分组

**Files:**
- Create: `tests/round9_data_trust.test.js`
- Modify: `dataImport.js`

**Interfaces:**
- Consumes: `QJZH.translate(key, fallback, values)` 和现有 `QJZH.dataImport` API。
- Produces: `normalizeRecord(record, provenance)`、`validateSiteId(siteId)`；`parseCsv()` 只返回白名单字段。

- [ ] **Step 1: 记录锁定文件 SHA-256 基线**

Run:

```powershell
Get-FileHash knowledgeBase.js,decisionEngine.js,compensator_engine.js,model_weights.js,simulator.js -Algorithm SHA256 | Format-Table Path,Hash
```

Expected: 保存五个哈希，最终发布前逐一核对。

- [ ] **Step 2: 写入导入边界失败测试**

```js
test("CSV drops system-derived fields and stamps provenance", () => {
  const { window } = loadDataImport();
  const csv = [
    "timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model,calibrated_nh3_ppm,risk_level",
    "2026-09-27T08:00:00+08:00,QH-TEST-01,2620,-5,62,30,sensor-x,0,正常"
  ].join("\n");
  const row = window.QJZH.dataImport.parseCsv(csv).records[0];
  assert.equal(row.calibrated_nh3_ppm, undefined);
  assert.equal(row.risk_level, undefined);
  assert.equal(row.provenance, "user-import");
});

test("reserved and malformed site IDs are rejected", () => {
  const { window } = loadDataImport();
  for (const site_id of ["__proto__", "constructor", "bad/id", "X".repeat(65)]) {
    assert.equal(window.QJZH.dataImport.validate(validRecord({ site_id })).valid, false);
  }
  assert.equal({}.polluted, undefined);
});

test("timestamps require ISO 8601 offsets and a reasonable time", () => {
  const { window } = loadDataImport();
  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "not-a-date" })).valid, false);
  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "2026-09-27T08:00:00" })).valid, false);
  assert.equal(window.QJZH.dataImport.validate(validRecord({ timestamp: "2030-01-01T00:00:00Z" })).valid, false);
});
```

- [ ] **Step 3: 运行测试并确认按预期失败**

Run: `node --test tests/round9_data_trust.test.js`

Expected: FAIL，分别显示派生字段仍存在、保留键未拒绝、时间戳未校验。

- [ ] **Step 4: 实现白名单、站点 ID、时间校验和安全分组**

```js
var ACCEPTED_FIELDS = REQUIRED.concat(["species", "age_days", "stocking_density", "barn_area"]);
var SITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
var RESERVED_SITE_IDS = new Set(["__proto__", "prototype", "constructor"]);

function validateSiteId(value) {
  var id = String(value || "").trim();
  return SITE_ID_PATTERN.test(id) && !RESERVED_SITE_IDS.has(id.toLowerCase());
}

function normalizeRecord(record, provenance) {
  var clean = {};
  ACCEPTED_FIELDS.forEach(function (key) { if (record[key] != null) clean[key] = record[key]; });
  clean.provenance = provenance || record.provenance || "manual-entry";
  return clean;
}
```

时间函数要求完整 ISO 8601 时区，且最多允许当前时间后五分钟。`save()` 使用 `Map` 按站点分组，并在校验与持久化前调用 `normalizeRecord()`。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_data_trust.test.js tests/web_features.test.js`

Expected: PASS。

```bash
git add dataImport.js tests/round9_data_trust.test.js
git commit -m "fix: harden imported sensor records"
```

### Task 2: 修复存储降级、清除和示例替换

**Files:**
- Modify: `tests/round9_data_trust.test.js`
- Modify: `dataImport.js`
- Modify: `institutionView.js`

**Interfaces:**
- Consumes: Task 1 的规范化记录与 provenance。
- Produces: `storageStatus()`；`save()` 返回存储状态；`loadDemo()` 真正替换全量业务数据。

- [ ] **Step 1: 写入失败测试**

```js
test("quota failure pins the session to memory and verifies the write", () => {
  const { window } = loadDataImport({ localStorage: throwingStorage(), sessionStorage: throwingStorage() });
  const result = window.QJZH.dataImport.save([validRecord()]);
  assert.equal(result.storage.mode, "memory");
  assert.equal(result.storage.persistent, false);
  assert.equal(window.QJZH.dataImport.getRecords().length, 1);
  assert.equal(window.QJZH.dataImport.storageStatus().mode, "memory");
});

test("clearData removes business keys but preserves preferences", () => {
  const { window } = loadDataImport();
  seed(window.localStorage, { QJZH_SITES: "[]", QJZH_REPORTS: "{}", QJZH_INSTITUTIONS: "[]", "qjzh-theme": "light", "qjzh-language": "bo" });
  window.QJZH.dataImport.clearData();
  assert.equal(window.localStorage.getItem("QJZH_REPORTS"), null);
  assert.equal(window.localStorage.getItem("QJZH_INSTITUTIONS"), null);
  assert.equal(window.localStorage.getItem("qjzh-theme"), "light");
});

test("sample loading removes sites absent from the sample", () => {
  const { window } = loadDataImport();
  window.QJZH.dataImport.save([validRecord({ site_id: "OLD-SITE" })]);
  window.QJZH.dataImport.loadDemo();
  assert.equal(window.QJZH.dataImport.getRecords("OLD-SITE").length, 0);
  assert.equal(window.QJZH.dataImport.getRecords()[0].provenance, "sample");
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_data_trust.test.js`

Expected: FAIL，显示存储后端重新探测、报告/机构键残留、旧站点未清除。

- [ ] **Step 3: 固定存储后端并执行写后读验证**

```js
var activeStore = null;
var storeState = { mode: "uninitialized", persistent: false, warning: "" };

function selectStore() {
  if (activeStore) return activeStore;
  activeStore = probe(root.localStorage, "localStorage") || probe(root.sessionStorage, "sessionStorage") || memoryStore;
  return activeStore;
}

function storageStatus() { return Object.assign({}, storeState); }
```

`write()` 写入后立即读回对比；任何异常都把 `activeStore` 固定为内存存储，并返回三语可显示的临时保存警告。

- [ ] **Step 4: 完整清理和来源分离**

清理 `QJZH_SITES`、所有 `QJZH_RECORDS_`、`QJZH_REPORTS`、`QJZH_INSTITUTIONS` 及演示状态，保留主题和语言。`loadDemo()` 先原子清空业务数据再写入 sample provenance。`institutionView.getRows(mode)` 只返回用户数据或 demo 数据之一，不拼接覆盖。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_data_trust.test.js tests/web_features.test.js tests/round8_quality.test.js`

Expected: PASS。

```bash
git add dataImport.js institutionView.js tests/round9_data_trust.test.js
git commit -m "fix: make local data lifecycle reliable"
```

### Task 3: 统一风险策略并始终重算校准值

**Files:**
- Create: `riskPolicy.js`
- Modify: `tests/round9_data_trust.test.js`
- Modify: `reportGenerator.js`
- Modify: `institutionView.js`
- Modify: `reportRenderer.js`
- Modify: `ui_interactions.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `QJZH.riskPolicy.classifyNh3(value)` → `{ code, label, urgency, color }`。
- Consumes: 锁定的 `window.compensate(altitude, temperature, humidity, rawNh3)`。

- [ ] **Step 1: 写入风险与派生值失败测试**

```js
test("risk policy matches the locked engine boundary", () => {
  const { window } = loadScript("riskPolicy.js");
  assert.equal(window.QJZH.riskPolicy.classifyNh3(15).code, "watch");
  assert.equal(window.QJZH.riskPolicy.classifyNh3(15.01).code, "urgent");
});

test("reports ignore imported calibrated values", () => {
  const records = [validRecord({ raw_nh3_ppm: 30, calibrated_nh3_ppm: 0 })];
  const { window } = loadReportStack({ records, compensate() { return 24; } });
  const report = window.QJZH.reportGenerator.generate({ startDate: "2026-09-27", endDate: "2026-09-27" });
  assert.equal(report.averageNh3, 24);
  assert.equal(report.riskDistribution["紧急"], 1);
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_data_trust.test.js`

Expected: FAIL，因为策略文件不存在且报告仍信任导入派生值。

- [ ] **Step 3: 实现共享策略并替换未锁定模块阈值**

```js
function classifyNh3(value) {
  var nh3 = Number(value);
  if (nh3 > 15) return { code: "urgent", label: "紧急", urgency: "critical", color: "#d94f5c" };
  if (nh3 >= 10) return { code: "watch", label: "关注", urgency: "warning", color: "#d6a93d" };
  return { code: "normal", label: "正常", urgency: "normal", color: "#159b7d" };
}
```

在报告、机构、页面建议和报告图表中调用同一接口。报告与机构版只从原始字段调用 `compensate()`，不读取外部 `calibrated_nh3_ppm`。

- [ ] **Step 4: 移除单点误差承诺**

`QJZH.calibrate()` 改为返回 `evaluation_note`，三语说明“内部记录的合成测试集平均相对误差 0.71%；单点不确定度尚未评估”。A/B/C 只表达输入域状态。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_data_trust.test.js tests/round8_quality.test.js tests/web_features.test.js`

Expected: PASS。

```bash
git add riskPolicy.js reportGenerator.js institutionView.js reportRenderer.js ui_interactions.js index.html tests/round9_data_trust.test.js
git commit -m "fix: align calibrated risk across views"
```

### Task 4: 让报告范围、缓存和弹窗状态真实可追溯

**Files:**
- Modify: `tests/round9_data_trust.test.js`
- Modify: `reportGenerator.js`
- Modify: `reportRenderer.js`
- Modify: `index.html`

**Interfaces:**
- `reportGenerator.generate(options)` 返回有效报告或 `{ valid: false, errorCode, message }`。
- `reportRenderer.render(data)` 返回 `{ opened, html, window }`。

- [ ] **Step 1: 写入日期、缓存和 popup 失败测试**

```js
test("reports reject reversed ranges and never expand an empty range", () => {
  const report = loadReportStack({ records: sampleRecords() }).window.QJZH.reportGenerator;
  assert.equal(report.generate({ startDate: "2026-10-01", endDate: "2026-09-01" }).errorCode, "INVALID_RANGE");
  assert.equal(report.generate({ startDate: "2026-08-01", endDate: "2026-08-31" }).records.length, 0);
});

test("report cache excludes raw records and includes provenance metadata", () => {
  const { window } = loadReportStack({ records: sampleRecords() });
  const result = window.QJZH.reportGenerator.generate({ startDate: "2026-09-01", endDate: "2026-09-30" });
  const cached = JSON.parse(window.localStorage.getItem("QJZH_REPORTS"));
  assert.equal(cached.records, undefined);
  assert.ok(result.modelVersion && result.ruleVersion);
  assert.equal(result.timezone, "Asia/Shanghai");
});

test("blocked print popup returns reusable HTML", () => {
  const { window } = loadScript("reportRenderer.js", { open() { return null; } });
  const result = window.QJZH.reportRenderer.render(minimalReport());
  assert.equal(result.opened, false);
  assert.match(result.html, /<!doctype html>/);
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_data_trust.test.js`

Expected: FAIL，显示日期静默扩展、缓存含 records、popup 返回 null。

- [ ] **Step 3: 实现严格日期与摘要缓存**

删除无数据自动扩展到全部历史的分支。校验 `YYYY-MM-DD` 及顺序。报告增加 `comfortRate`、`siteCount`、`sampleCount`、`rejectedCount`、`provenance`、`modelVersion`、`ruleVersion`、`timezone`、`outOfDomainCount`；缓存排除 `records` 与完整趋势原始数据。

机构报告以所选记录的最早/最晚时间作为区间；仅在演示快照完全没有时间戳时使用生成当天，并明确标记为快照。

- [ ] **Step 4: 更新报告预览与三语文案**

将“氨气达标率”改为“项目舒适区占比”，注明 `<10 ppm` 项目阈值。弹窗被阻止时在报告视图显示可访问预览和再次打印按钮，状态明确说明浏览器阻止了新窗口。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_data_trust.test.js tests/round8_quality.test.js tests/web_features.test.js`

Expected: PASS。

```bash
git add reportGenerator.js reportRenderer.js index.html tests/round9_data_trust.test.js
git commit -m "fix: make report results traceable"
```

---

## 阶段 B：移动端、交互与无障碍

### Task 5: 修复页面语义、流程按钮和人工录入标签

**Files:**
- Create: `tests/round9_accessibility.test.js`
- Modify: `index.html`
- Modify: `viewRouter.js`

**Interfaces:**
- Produces: 唯一 `main#main-content`、`a.skip-link`、原生流程 buttons、带 label/help 的录入字段。
- Preserves: `data-goto` 委托和路由标题聚焦。

- [ ] **Step 1: 写入语义失败测试**

```js
test("the routed document has one main landmark and a skip link", () => {
  const html = read("index.html");
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /class="skip-link" href="#main-content"/);
});

test("pipeline uses buttons and hidden next stays hidden", () => {
  const html = read("index.html");
  assert.equal((html.match(/<button[^>]+class="pipeline-step"/g) || []).length, 3);
  assert.doesNotMatch(html, /class="pipeline-step"[^>]+role="button"/);
  assert.match(html, /\.pipeline-next\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});

test("all manual fields have visible labels", () => {
  const html = read("index.html");
  for (const name of ["site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model"]) {
    assert.match(html, new RegExp('<label[^>]+for="manual-' + name + '"'));
    assert.match(html, new RegExp('id="manual-' + name + '"[^>]+aria-describedby="manual-' + name + '-help"'));
  }
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_accessibility.test.js`

Expected: FAIL，显示 main、skip link、按钮语义和 labels 缺失。

- [ ] **Step 3: 建立稳定主区域与原生流程按钮**

将六视图容器放进 `<main id="main-content" tabindex="-1">`；`mountViews()` 只删除来源 wrapper，不删除 main。三个 `article role="button"` 改为 `button type="button"`，删除 router 的自定义 keydown 模拟。

- [ ] **Step 4: 增加字段标签、帮助文字和焦点样式**

每个输入使用 `.field-group`、`label[for]`、三语 `.field-help` 与 `aria-describedby`。添加可见的 `.view h2:focus-visible` 双层焦点环和 skip-link focus 样式。加 `.pipeline-next[hidden] { display: none !important; }`。

顶栏按钮、关闭按钮、日期框、角色选择器和 range thumb 的触控目标至少为 44×44 px。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_accessibility.test.js tests/spa_experience.test.js tests/web_features.test.js`

Expected: PASS。

```bash
git add index.html viewRouter.js tests/round9_accessibility.test.js
git commit -m "fix: restore semantic navigation and form labels"
```

### Task 6: 减少读屏噪音并补齐动态三语和藏文排版

**Files:**
- Modify: `tests/round9_accessibility.test.js`
- Modify: `index.html`
- Modify: `dataImport.js`
- Modify: `ui_interactions.js`

**Interfaces:**
- Produces: `QJZH.refreshDynamicLanguage()`；只对高层状态使用 polite live region。

- [ ] **Step 1: 写入动态语言与 ARIA 失败测试**

```js
test("high-frequency readings are not live regions and snapshots are a list", () => {
  const html = read("index.html");
  assert.doesNotMatch(extractElement(html, "chartPointCount"), /aria-live/);
  assert.doesNotMatch(extractElement(html, "streamStatus"), /aria-live/);
  assert.match(html, /id="snapshotList"[^>]+role="list"/);
  assert.doesNotMatch(html, /id="snapshotList"[^>]+aria-label=/);
});

test("language changes refresh stream and chart count immediately", () => {
  const html = read("index.html");
  assert.match(html, /function refreshDynamicLanguage\(/);
  assert.match(html, /updateChartPointCount\(\)/);
  assert.match(html, /refreshStreamStatus\(\)/);
});

test("Tibetan has a dedicated font stack and readable line height", () => {
  const html = read("index.html");
  assert.match(html, /html\[data-language="bo"\][^{]*\{[^}]*line-height:\s*1\.6/);
  assert.match(html, /Noto Sans Tibetan/);
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_accessibility.test.js`

Expected: FAIL，显示实时播报、快照语义、即时刷新和藏文样式缺失。

- [ ] **Step 3: 实现低频播报和即时语言刷新**

只保留导入、报告、全局状态的 `aria-live="polite"`。语言切换时调用 `refreshStreamStatus()`、`updateChartPointCount()`、`updateTrendSummary()`、`updateChartInsights()`。快照容器和条目使用 list/listitem 语义。

- [ ] **Step 4: 增加藏文与打印排版**

使用 `"Noto Sans Tibetan", "Microsoft Himalaya", Jomolhari, system-ui, sans-serif`，藏文行高 1.65、字距 0，并提高按钮、表格和打印页最小字号。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_accessibility.test.js tests/round8_quality.test.js`

Expected: PASS。

```bash
git add index.html dataImport.js ui_interactions.js tests/round9_accessibility.test.js
git commit -m "fix: localize dynamic status accessibly"
```

### Task 7: 升级趋势图交互和移动端布局

**Files:**
- Create: `tests/round9_visual_contract.test.js`
- Modify: `index.html`
- Modify: `viewRouter.js`

**Interfaces:**
- Produces: `.trend-toggle[data-dataset]` buttons；`QJZH.chartControls.toggleDataset(id)`。
- Preserves: `trendChart`、Canvas fallback、自定义色彩和现有数据序列。

- [ ] **Step 1: 写入图表与响应式失败测试**

```js
test("custom legend is the only legend and exposes dataset toggles", () => {
  const html = read("index.html");
  assert.match(html, /legend:\s*\{[\s\S]*display:\s*false/);
  assert.equal((html.match(/class="trend-toggle"/g) || []).length, 5);
  assert.match(html, /aria-describedby="trendA11ySummary dataRecordTable"/);
});

test("mobile contracts keep cards and six navigation items in view", () => {
  const html = read("index.html");
  assert.match(html, /@media\s*\(max-width:\s*480px\)[\s\S]*sensor-grid[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(html, /@media\s*\(max-width:\s*430px\)[\s\S]*mobile-nav[^{]*\{[^}]*grid-template-columns:\s*repeat\(6/);
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_visual_contract.test.js`

Expected: FAIL，显示重复图例、非交互色标和移动网格约束缺失。

- [ ] **Step 3: 实现可操作图例与趋势文字摘要**

关闭 Chart.js 内置图例。五个自定义项改为按钮，调用 `setDatasetVisibility` 并同步 `aria-pressed`，且不允许隐藏最后一个数据集。`#trendA11ySummary` 显示时间窗、最新/最高 NH₃、趋势方向和风险；canvas 通过 `aria-describedby` 关联摘要与采样表。

```js
function toggleDataset(id) {
  var index = trendChart.data.datasets.findIndex(function (dataset) { return dataset.id === id; });
  if (index < 0) return false;
  var visibleCount = trendChart.data.datasets.filter(function (_, itemIndex) { return trendChart.isDatasetVisible(itemIndex); }).length;
  var nextVisible = !trendChart.isDatasetVisible(index);
  if (!nextVisible && visibleCount <= 1) return false;
  trendChart.setDatasetVisibility(index, nextVisible);
  trendChart.update(reducedMotion.matches ? "none" : undefined);
  return nextVisible;
}
window.QJZH.chartControls = { toggleDataset: toggleDataset };
```

给 canvas 设置三语 `aria-label`，并在语言切换时同步更新。

- [ ] **Step 4: 修正场景浮层、移动布局和 reduced motion**

演示场景默认折叠。480 px 以下传感器单列、状态 pill 整行、面板标题可换行；430 px 以下底栏为六列固定网格。用定向规则关闭动画，并让 Chart.js 读取 `prefers-reduced-motion`。三语重命名“24 小时冬季基线”和“已加载会话断网演示”。

浅色主题减少灰雾背景、重阴影和暗色发光，保留青绿主色与清晰边框；桌面内容继续使用现有阅读宽度上限。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/round9_visual_contract.test.js tests/round9_accessibility.test.js tests/round8_quality.test.js`

Expected: PASS。

```bash
git add index.html viewRouter.js tests/round9_visual_contract.test.js
git commit -m "feat: refine responsive trend exploration"
```

---

## 阶段 C：性能、发现性与发布门禁

### Task 8: 提取主脚本并补齐站点元数据

**Files:**
- Create: `dashboard.js`
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `404.html`
- Modify: `index.html`
- Modify: `build_info.js`
- Modify: `verify-deployment.js`
- Modify: `tests/round9_visual_contract.test.js`
- Modify: `online_test.html`
- Modify: `README.md`

**Interfaces:**
- `dashboard.js` 接管原 body 主 IIFE，保持全局接口与初始化顺序。
- `BUILD_INFO` 包含 `{ version, commit, builtAt, environment }`。

- [ ] **Step 1: 写入脚本和发现性失败测试**

```js
test("application scripts are external, ordered, and deferred", () => {
  const html = read("index.html");
  assert.match(html, /<script defer src="dashboard\.js\?v=/);
  assert.doesNotMatch(html, /<script>[\s\S]{5000,}<\/script>/);
  const tags = [...html.matchAll(/<script[^>]+src="[^"]+"[^>]*>/g)].map(match => match[0]);
  assert.equal(tags.every(tag => /\bdefer\b/.test(tag)), true);
});

test("public discovery metadata and a custom 404 exist", () => {
  const html = read("index.html");
  assert.match(html, /rel="canonical" href="https:\/\/runner-cpu\.github\.io\/QJZH\/"/);
  assert.match(html, /property="og:type" content="website"/);
  for (const file of ["robots.txt", "sitemap.xml", "404.html"]) assert.equal(fs.existsSync(path.join(ROOT, file)), true);
});

test("local build metadata does not claim load time as deployment time", () => {
  const source = read("build_info.js");
  assert.doesNotMatch(source, /new Date\(\)\.toISOString/);
  assert.match(source, /environment:\s*"local"/);
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_visual_contract.test.js`

Expected: FAIL，因为主程序仍内联、脚本阻塞、canonical 和站点文件缺失、构建时间不准确。

- [ ] **Step 3: 原样提取主程序并按序 defer**

把 body 中主应用块移动到 `dashboard.js`，不改变内部行为。所有本地依赖和 Chart.js 按原顺序加 `defer`，保留 CDN SRI 与 fallback；head 增加 jsDelivr preconnect。`verify-deployment.js` 校验脚本顺序、SRI、唯一 main 和无大型内联脚本。

- [ ] **Step 4: 增加 canonical、站点文件和准确回退信息**

canonical 使用 `https://runner-cpu.github.io/QJZH/`，sitemap 只列主页，robots 允许 `/QJZH/`。OG 增加 website 和 1200×630。开发态 `BUILD_INFO` 为 `{ version: "dev", commit: "local", builtAt: null, environment: "local" }`。README 同步断网边界、provenance、舒适区指标和内部合成基准措辞。

`online_test.html` 增加 main/skip link、原生 pipeline buttons、`dashboard.js`、`riskPolicy.js`、canonical 与六视图入口检查。

- [ ] **Step 5: 验证并提交**

Run: `node --check dashboard.js && node --test tests/*.test.js && node verify-deployment.js .`

Expected: PASS。

```bash
git add dashboard.js robots.txt sitemap.xml 404.html index.html build_info.js verify-deployment.js README.md tests/round9_visual_contract.test.js
git commit -m "perf: publish a deferred discoverable dashboard"
```

### Task 9: 让验证通过后才部署 Pages

**Files:**
- Create: `scripts/build-pages.js`
- Modify: `.github/workflows/verify-compensator.yml`
- Modify: `tests/round9_visual_contract.test.js`
- Modify: `.gitignore`

**Interfaces:**
- `node scripts/build-pages.js --out dist` 从固定 allowlist 构建站点，并用 `GITHUB_SHA` 与 UTC 时间生成 `dist/build_info.js`。
- Actions `deploy` job 使用 `needs: verify`。

- [ ] **Step 1: 写入 artifact 与 workflow 失败测试**

```js
test("Pages verifies before deploying an allowlisted artifact", () => {
  const workflow = read(".github/workflows/verify-compensator.yml");
  assert.match(workflow, /^permissions:\s*[\s\S]*contents:\s*read/m);
  assert.match(workflow, /deploy:[\s\S]*needs:\s*verify/);
  assert.match(workflow, /actions\/upload-pages-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/deploy-pages@[0-9a-f]{40}/);
});
```

另写 child-process 测试生成临时 dist，断言运行文件和 assets 存在，而 `tests`、`execution_log.txt`、`.git`、设计文档不存在。

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/round9_visual_contract.test.js`

Expected: FAIL，因为 deploy job 和 allowlist builder 尚不存在。

- [ ] **Step 3: 实现站点 allowlist builder**

```js
const PUBLIC_FILES = [
  "index.html", "online_test.html", "404.html", "robots.txt", "sitemap.xml",
  "dashboard.js", "riskPolicy.js", "model_weights.js", "compensator_engine.js",
  "knowledgeBase.js", "decisionEngine.js", "simulator.js", "ui_text_map.js",
  "errorHandler.js", "csvTemplate.js", "dataImport.js", "reportGenerator.js",
  "reportRenderer.js", "institutionView.js", "demoReset.js", "ui_interactions.js",
  "viewRouter.js", "knowledge-base-rules.md", "ALGORITHM_DOCUMENTATION.md", "assets"
];
```

只复制 allowlist，缺少任何条目即失败。生成真实构建 metadata，并把 `dist/` 加入 `.gitignore`。

- [ ] **Step 4: 重写验证和部署 workflow**

使用 `verify`、`deploy` 两个 job；全局最小 `contents: read`，deploy 仅增加 Pages 与 id-token 权限。Node 24；actions 固定为以下已通过 GitHub refs API 查询的提交：

- `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b`
- `actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa`
- `actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`

verify 运行全测试、两个 verifier、知识文档 diff、所有 JS `node --check`、dist 构建和 dist 验证，再由 deploy 上传并发布 artifact。

- [ ] **Step 5: 验证并提交**

```powershell
node scripts/build-pages.js --out dist
node verify-deployment.js dist
node --test tests/*.test.js
```

Expected: PASS；dist 不含测试、Git 元数据或执行日志。

```bash
git add scripts/build-pages.js .github/workflows/verify-compensator.yml .gitignore tests/round9_visual_contract.test.js
git commit -m "ci: gate Pages deployment on verification"
```

---

## 阶段 D：整体验证、视觉复查与发布

### Task 10: 完成多角度回归与视觉收口

**Files:**
- Modify when evidence requires: `index.html`、`dashboard.js`、未锁定模块及对应测试
- Modify: `execution_log.txt`
- Modify when refreshed: `assets/screenshots/*.png`、`assets/og_cover.png`、`README.md`

**Interfaces:**
- Produces: 可复现验证记录、前后 Lighthouse 对比、最终截图和发布候选提交。

- [ ] **Step 1: 运行完整自动验证**

```powershell
node --test tests/*.test.js
node verify_compensator.js
node verify-deployment.js .
Get-ChildItem -Filter *.js -Recurse | Where-Object { $_.FullName -notmatch '\.git\\|\\dist\\' } | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
```

Expected: 所有命令 exit 0，测试 0 failure。

- [ ] **Step 2: 对比五个锁定文件哈希**

Run: `Get-FileHash knowledgeBase.js,decisionEngine.js,compensator_engine.js,model_weights.js,simulator.js -Algorithm SHA256`

Expected: 与 Task 1 基线完全一致。

- [ ] **Step 3: 真实浏览器回归**

在 320×568、390×844、768×1024、1440×900、2560×1440 检查六视图、三语、深浅主题、键盘、图例开关、CSV 注入样例、清除、存储降级、日期反转、popup 阻止、打印与 reduced motion。控制台无错误，`scrollWidth <= clientWidth`。

- [ ] **Step 4: Lighthouse 与截图验收**

对本地 production artifact 连续运行三次 Lighthouse，记录中位数并与基线 Performance 80、Accessibility 94、Best Practices 100、SEO 100 对比。目标 Accessibility 100，Best Practices/SEO 保持 100，Performance 不低于 90；若机器波动导致未达标，至少证明 FCP、LCP、TBT 中两个改善且功能无回归。重截稳定数据状态的 overview/data/algorithm/report 和至少一张 390 px 藏文或浅色图，压缩大于 1 MB 的社交封面。

- [ ] **Step 5: 处理验证新发现并重跑**

每个新问题先加入能复现它的失败测试，再修改未锁定代码。定向测试通过后重复 Step 1 全量验证。

- [ ] **Step 6: 更新执行记录并提交发布候选**

`execution_log.txt` 记录绝对日期、测试数量、Lighthouse 中位数、锁定哈希和浏览器矩阵。

```bash
git add -A
git commit -m "chore: finalize balanced quality audit"
```

### Task 11: 推送并确认 GitHub Pages 线上版本

**Files:**
- No source changes unless production verification exposes a reproducible defect.

**Interfaces:**
- Produces: `origin/gh-pages` 最终提交、成功的 verify/deploy jobs、线上与提交一致的 `BUILD_INFO.commit`。

- [ ] **Step 1: 推送 gh-pages**

Run: `git push origin gh-pages`

Expected: 远端接受最终提交。

- [ ] **Step 2: 等待 Actions 与 Pages**

等待 `verify` 和 `deploy` 成功。若失败，读取日志、用失败测试复现、修复、提交、推送并再次等待。

- [ ] **Step 3: 核对线上产物**

检查以下 URL 均为 HTTP 200：

```text
https://runner-cpu.github.io/QJZH/
https://runner-cpu.github.io/QJZH/build_info.js
https://runner-cpu.github.io/QJZH/online_test.html
https://runner-cpu.github.io/QJZH/robots.txt
https://runner-cpu.github.io/QJZH/sitemap.xml
```

`BUILD_INFO.commit` 必须等于最终提交 SHA；online test 全绿；控制台无错误。

- [ ] **Step 4: 线上关键路径复测**

在 390 px 验证六视图、英文/藏文切换、数据集开关、示例替换、报告预览/打印和键盘焦点顺序。

- [ ] **Step 5: 报告最终证据**

报告最终 commit、Actions run、Pages URL、测试数量、Lighthouse 前后、锁定文件哈希结果、主要改动和仍保留的低风险限制。
