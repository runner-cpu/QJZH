# QJZH 发布质量与本地数据保护加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变五个锁定算法文件内容的前提下，加固本地数据导入、存储回滚、动态内容安全、三语状态反馈、可重复演示和 verified Pages 发布链路，并完善公开说明文档。

**Architecture:** 保持现有无构建依赖的浏览器脚本架构。把输入预检、批次快照、导出和清除确认收敛到 `dataImport.js`，把状态文案与辅助技术契约接入现有 `dashboard.js` 翻译入口；构建器继续以 allowlist 复制公开文件，并额外生成清单摘要。所有改动通过 Node 原生测试、源/产物部署校验和 GitHub Actions 验证。

**Tech Stack:** 原生 JavaScript、静态 HTML/CSS、Node.js 24 `node:test`、GitHub Actions Pages artifact、SHA-256 清单。

## Global Constraints

- 不修改 `knowledgeBase.js`、`decisionEngine.js`、`compensator_engine.js`、`model_weights.js`、`simulator.js` 的任何内容；提交前逐文件核对 SHA-1 与基线一致。
- 不新增上传服务、账号系统、远程数据库、硬件控制、禁用右键、阻断键盘、破坏屏幕阅读器或恶意反爬脚本。
- 公开文案只描述中性产品与工程边界，不写入任何学校、比赛、参赛、答辩或其他未授权背景信息。
- 动态外部值只能进入文本节点或经过 `escapeHtml` 的字符串；不新增未经审计的 HTML 拼接点。
- Pages 只能由 `.github/workflows/verify-compensator.yml` 上传 verified allowlist artifact，不能恢复 legacy 根目录发布。
- 每项行为先写一个会失败的回归测试，确认失败原因后再写最小实现；每项任务完成前运行其覆盖测试。

---

### Task 1: 输入预检、批次存储回滚与本地导出

**Files:**
- Modify: `dataImport.js`（文件预检、批次写入、导出/清除 API 与 UI 绑定）
- Modify: `index.html`（导出按钮、输入说明、状态关联属性）
- Modify: `tests/web_features.test.js`（文件读取和导出行为）
- Modify: `tests/round9_data_trust.test.js`（回滚和存储模式）
- Modify: `tests/round10_governance.test.js`（硬限制契约）

**Interfaces:**
- 新增纯函数 `dataImport.inspectFile(file)`，返回 `{ ok, code, message, bytes, name }`；文件为空、不可读、超过 `MAX_CSV.bytes` 时返回 `ok:false`。
- 新增 `dataImport.exportCsv(options)`，只读取当前业务记录并返回 `{ ok, csv, filename, records, storage }`；序列化字段使用固定 `ACCEPTED_FIELDS` 顺序并转义逗号、换行和双引号。
- `dataImport.save(records, options)` 在任一写入失败时恢复本批次涉及的 `QJZH_RECORDS_*` 与 `QJZH_SITES` 快照，并返回 `{ ok:false, code:"storageQuota", rolledBack:true, storage }`，不吞掉原有记录。
- `dataImport.clearData({ confirm })` 在未确认时不删除数据；确认后返回删除数量与当前存储模式。

- [ ] **Step 1: 写失败测试**：在测试 harness 中构造带 `size`、`name`、`type` 的文件对象，断言空文件和超过 1 MiB 的文件被 `inspectFile` 拒绝；构造第二站点写入抛错的 storage，断言 `save` 返回回滚标记且第一站点旧记录仍在。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/web_features.test.js tests/round9_data_trust.test.js`，确认失败原因是接口不存在或回滚未发生。
- [ ] **Step 3: 写最小实现**：在 `dataImport.js` 增加文件字节数读取、快照/恢复辅助函数、CSV 单元格转义和导出下载触发器；FileReader 绑定增加 `onerror`、`onabort`、空文件和取消分支，并只在预检通过后读取。
- [ ] **Step 4: 运行绿灯测试**：重复上述命令，并额外运行 `node --test tests/round10_governance.test.js`；确认回滚不会改变现有清除偏好保留行为。
- [ ] **Step 5: 提交**：`git add dataImport.js index.html tests && git commit -m "feat: harden local data intake and export"`。

### Task 2: 三语状态、焦点回收与异步可访问性

**Files:**
- Modify: `errorHandler.js`（翻译键、`aria-busy`、焦点目标和重试按钮）
- Modify: `dashboard.js`（中英藏状态键和状态刷新入口）
- Modify: `ui_text_map.js`（共享状态键）
- Modify: `dataImport.js`、`ui_interactions.js`（导入/导出/报告状态调用）
- Modify: `index.html`（`aria-describedby`、`aria-controls`、按钮标签）
- Modify: `tests/round8_quality.test.js`、`tests/round9_accessibility.test.js`、`tests/spa_experience.test.js`

**Interfaces:**
- `errorHandler.render(target, status, options)` 支持 `options.translate(key, fallback, values)`、`options.busy`、`options.focus`，完成后将焦点移到状态元素或显式 `focusTarget`。
- 新增共享键：`qjzh.data.fileTooLarge`、`qjzh.data.readError`、`qjzh.data.readCancelled`、`qjzh.data.exported`、`qjzh.data.exportError`、`qjzh.storage.rollback`、`qjzh.storage.sessionWarning`、`qjzh.storage.memoryWarning`、`qjzh.report.retry`；zh/en/bo 三种语言都必须有值。

- [ ] **Step 1: 写失败测试**：为 `errorHandler.render` 增加 DOM stub，断言 loading 时设置 `aria-busy=true`，完成时清除并调用焦点；扫描三语 map 断言上述键均存在；断言导入状态与清除按钮具备关联标签。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/round8_quality.test.js tests/round9_accessibility.test.js tests/spa_experience.test.js`，确认缺键或属性导致失败。
- [ ] **Step 3: 写最小实现**：将固定中文 labels 改为通过 `q.translate`/共享键解析，给异步按钮和状态元素设置 `aria-busy`、`aria-live=polite`、`aria-atomic=true`，完成/失败后只把焦点移到可聚焦状态摘要；不拦截键盘和屏幕阅读器路径。
- [ ] **Step 4: 运行绿灯测试**：重复红灯命令，确认三语切换后状态文本、页面 `lang` 和标题仍同步。
- [ ] **Step 5: 提交**：`git add errorHandler.js dashboard.js ui_text_map.js dataImport.js ui_interactions.js index.html tests && git commit -m "feat: unify localized async status feedback"`。

### Task 3: 动态内容安全、security.txt 与回归约束

**Files:**
- Create: `.well-known/security.txt`
- Modify: `SECURITY.md`、`scripts/build-pages.js`、`verify-deployment.js`
- Modify: `dashboard.js`、`ui_interactions.js`、`reportRenderer.js`（仅补齐转义边界，不改算法）
- Modify: `tests/round9_data_trust.test.js`、`tests/round10_governance.test.js`、`tests/round9_visual_contract.test.js`

**Interfaces:**
- 构建器 allowlist 增加 `.well-known/security.txt`，并拒绝 artifact 中出现未允许的 HTML/脚本路径。
- security.txt 使用静态字段 `Contact`、`Expires`、`Preferred-Languages`、`Canonical`，不包含个人或组织隐私信息。

- [ ] **Step 1: 写失败测试**：用 `<img src=x onerror=...>`、引号和换行分别注入 CSV、localStorage、URL hash、报告 source，断言生成的 HTML 不含可执行标签/属性；断言 security.txt 和构建 allowlist 存在。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/round9_data_trust.test.js tests/round9_visual_contract.test.js tests/round10_governance.test.js`，确认新增文件/边界断言失败。
- [ ] **Step 3: 写最小实现**：复用现有 `escapeHtml` 或 DOM `textContent`，将报警、报告来源、筛选值和 hash 路由中的外部字符串限制为文本；新增 security.txt 并让构建器复制它；更新安全文档的本地数据边界和报告渠道。
- [ ] **Step 4: 运行绿灯测试**：重复测试并运行 `node scripts/verify-originality.js`，确认新增受保护文件进入清单且公开文本不含受限背景词。
- [ ] **Step 5: 提交**：`git add .well-known SECURITY.md scripts verify-deployment.js dashboard.js ui_interactions.js reportRenderer.js tests && git commit -m "fix: close dynamic content security boundaries"`。

### Task 4: 确定性演示值、资源预算与小幅体验优化

**Files:**
- Modify: `ui_interactions.js`、`dashboard.js`（仅展示层种子与状态，不触碰锁定算法）
- Modify: `index.html`（安全元数据、状态关联和资源契约）
- Modify: `tests/round9_visual_contract.test.js`、`tests/spa_experience.test.js`

**Interfaces:**
- 新增展示层函数 `QJZH.presentationSeed(key, salt)`，由稳定字符串 hash 生成 `[0,1)` 数值；算法 demo 使用当前控件值与固定场景键生成示例输入，重复点击得到相同展示值。
- 不改变 `window.simulateHighlandRaw`、`window.compensate`、`DecisionEngine` 或 `LocalSimulator` 的参数和结果。

- [ ] **Step 1: 写失败测试**：加载 `ui_interactions.js` 的最小 DOM，连续调用展示种子/演示动作，断言 raw/corrected 文本相同；扫描 HTML 断言 Chart.js 外链仍带固定版本、`integrity`、`crossorigin` 和 `defer`，关键脚本总大小不超过既定预算。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/round9_visual_contract.test.js tests/spa_experience.test.js`，确认随机值或缺少契约导致失败。
- [ ] **Step 3: 写最小实现**：以无副作用的字符串 hash 替换展示层 `Math.random()`；补充安全元数据和 CDN 失败状态提示，保留 Chart.js 当前固定版本与现有 Canvas 回退。
- [ ] **Step 4: 运行绿灯测试**：重复测试并用 `node --check ui_interactions.js dashboard.js` 检查语法。
- [ ] **Step 5: 提交**：`git add ui_interactions.js dashboard.js index.html tests && git commit -m "feat: make demo presentation reproducible"`。

### Task 5: allowlist artifact、UTC CI 与部署后 smoke test

**Files:**
- Modify: `scripts/build-pages.js`（清单、SHA-256、路径拒绝和 build_info）
- Modify: `.github/workflows/verify-compensator.yml`（UTC、摘要上传、重试 smoke test、线上 SHA 校验）
- Create: `scripts/smoke-pages.js`
- Modify: `tests/round10_governance.test.js`、`tests/round9_visual_contract.test.js`

**Interfaces:**
- 构建输出新增 `artifact-manifest.json`，结构为 `{ commit, generatedAt, files: [{ path, bytes, sha256 }] }`；文件列表按路径排序，摘要覆盖每个公开文件（含 `.well-known/security.txt`）。
- `scripts/smoke-pages.js --base <url> --retries 4` 对固定公开路径执行 200/内容标记检查，指数退避并在失败时退出非零；不访问内部测试路径。

- [ ] **Step 1: 写失败测试**：构建到临时目录后断言 manifest 的 SHA-256 与磁盘文件匹配、内部目录不在清单；对本地 HTTP stub 断言 smoke 脚本重试并在内容不匹配时失败；断言 workflow 含 `TZ=UTC`、artifact 摘要和 smoke 步骤。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/round10_governance.test.js tests/round9_visual_contract.test.js`，确认 manifest/smoke 契约尚不存在。
- [ ] **Step 3: 写最小实现**：在构建器中递归收集 allowlist 输出、计算 Node `crypto.createHash("sha256")` 摘要并写入排序 manifest；实现无依赖 HTTPS fetch smoke；workflow 在构建前设置 `TZ=UTC`，部署后以 Pages URL 和 `github.sha` 校验 `build_info.commit`。
- [ ] **Step 4: 运行绿灯测试**：运行新增测试、`node scripts/build-pages.js --out dist`、`node verify-deployment.js dist`，并检查 `dist/artifact-manifest.json`。
- [ ] **Step 5: 提交**：`git add scripts .github tests && git commit -m "ci: attest and smoke test Pages artifacts"`。

### Task 6: 文档、仓库治理与原创保护收尾

**Files:**
- Modify: `README.md`、`docs/USER_GUIDE.md`、`docs/DATA_DICTIONARY.md`、`docs/RELEASE_CHECKLIST.md`
- Modify: `COPYRIGHT.md`、`ORIGINALITY.md`、`originality-manifest.json`（通过现有生成/校验脚本更新）
- Delete: `execution_log.txt`、`plan-qjzh-final.md`、`task-2-report.md`、`task-3-brief.md`、`task-3-report.md`（仅删除未被运行时和构建引用的历史草稿）
- Modify: `tests/round10_governance.test.js`

- [ ] **Step 1: 写失败测试**：断言用户指南明确说明 localStorage、sessionStorage、内存模式在刷新/关闭/主动清除时的差异；断言 README 记载 CSV 导出、清除确认、故障恢复和原创保护；断言历史草稿不再被 Git 跟踪。
- [ ] **Step 2: 运行红灯测试**：运行 `node --test tests/round10_governance.test.js`，确认缺少新说明或文件仍存在时失败。
- [ ] **Step 3: 写最小实现**：补充可复核的操作步骤、数据字段、发布门禁和安全报告说明；清理历史草稿；运行 `node scripts/verify-originality.js` 生成并校验最新 SHA-256 清单。
- [ ] **Step 4: 运行绿灯测试**：重复测试并运行 `git diff --check`；全文扫描公开文件确保没有受限背景词。
- [ ] **Step 5: 提交**：`git add -A && git commit -m "docs: document storage recovery and release governance"`。

### Task 7: 全量验收、推送与 Pages 核对

**Files:** 仅验证，不再新增功能代码。

- [ ] **Step 1: 锁定文件门禁**：将基线 SHA-1 与当前五个文件逐一比较，任一不一致即停止发布。
- [ ] **Step 2: 全量测试**：运行 `$env:TZ="UTC"; node --test tests/*.test.js`、`node verify_compensator.js`、`node scripts/verify-originality.js`、`node verify-deployment.js .`、`node scripts/build-pages.js --out dist`、`node verify-deployment.js dist`、受版本控制 JavaScript 的 `node --check` 和 `git diff --check`。
- [ ] **Step 3: 远端同步后推送**：确认 `git status --short --branch` 干净，执行 `git push origin gh-pages`；不强推、不覆盖远端提交。
- [ ] **Step 4: Actions/Pages 证据**：使用 GitHub 插件或已配置 Git credential 查询最新 workflow run，等待 verify/deploy 成功；确认 Pages source 仍为 `workflow`。
- [ ] **Step 5: 线上 smoke 与 SHA**：访问 `https://runner-cpu.github.io/QJZH/` 及固定公开路径，读取线上 `build_info.commit`，必须等于最终远端 HEAD 的完整 SHA；记录 artifact manifest 摘要与公开路径结果。

---

## 完成判据

- 五个锁定算法文件 SHA-1 与基线完全一致。
- 所有 Node 测试、锁定模型校验、原创清单校验、源/产物部署校验、语法检查和差异空白检查均以退出码 0 完成。
- Pages workflow 使用 UTC 与 verified allowlist artifact，部署后 smoke 和线上 SHA 校验通过。
- README、用户指南、数据字典、发布清单、安全文档与实际行为一致，公开内容不泄露受限背景信息。
