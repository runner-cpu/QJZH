# 青境智衡质量加固与原创保护实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 清理公开背景信息，补强输入与发布安全，建立强保护版权和原创溯源链，并将详细使用说明发布到 GitHub Pages。

**Architecture:** 保持当前静态 SPA 与五个锁定算法文件不变；通过独立的治理脚本、公开文档和最小化输入校验补丁增强外围能力。构建脚本继续使用 allowlist，把可公开文档和运行时文件与内部测试、计划和备份隔离。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js 内置 test/fs/crypto、GitHub Actions、GitHub Pages。

## Global Constraints

- 不修改 knowledgeBase.js、decisionEngine.js、compensator_engine.js、model_weights.js、simulator.js 的算法内容。
- 公开文件不得出现任何来源单位、活动、评审、课堂或类似背景信息。
- 使用“保留所有权利”的定制许可，不加入阻断键盘、屏幕阅读器、右键或恶意反爬代码。
- 保留中文、英文、藏文、六路由、CSV/人工录入、本地存储降级、报告和移动端能力。
- 每个任务完成后运行该任务列出的最小测试；最终发布前运行完整验证清单。

---

### Task 1: 增加治理与原创清单的失败测试

**Files:**
- Create: tests/round10_governance.test.js
- Modify: tests/round9_visual_contract.test.js

**Interfaces:**
- Consumes: verify-deployment.js、scripts/verify-originality.js 的命令行行为与仓库公开文件。
- Produces: 治理测试，覆盖公开词汇扫描、定制许可标题、清单哈希、公开文档存在性和 CSV 限制契约。

- [ ] Step 1: 编写测试，读取公开源码、文档和历史设计资料，断言不包含禁止公开的背景词。
- [ ] Step 2: 编写测试，断言 COPYRIGHT.md、ORIGINALITY.md、originality-manifest.json、SECURITY.md、docs/USER_GUIDE.md、docs/DATA_DICTIONARY.md、docs/RELEASE_CHECKLIST.md 存在。
- [ ] Step 3: 编写测试，执行 node scripts/verify-originality.js，断言退出码为 0，并断言许可证包含“保留所有权利”与禁止未授权复制/再发布的条款。
- [ ] Step 4: 编写测试，断言 dataImport.js 的导入限制拒绝超大文本、超多行、重复必需表头和超长字段，同时不影响合法示例数据。
- [ ] Step 5: 运行 node --test tests/round10_governance.test.js，确认新增断言在实现前按预期失败。

### Task 2: 实现公开内容清理与通用角色文案

**Files:**
- Modify: README.md
- Modify: PROJECT_REPORT.md
- Modify: ALGORITHM_DOCUMENTATION.md
- Modify: generate_docs.py
- Modify: index.html
- Modify: dashboard.js
- Modify: institutionView.js
- Modify: reportRenderer.js
- Modify: docs/superpowers/specs/2026-09-27-qjzh-balanced-hardening-design.md
- Modify: docs/superpowers/plans/2026-09-27-qjzh-balanced-hardening.md

**Interfaces:**
- Consumes: 现有三语翻译键、机构角色选择器、报告 COPY、算法文档生成器。
- Produces: 不含背景泄露的中性界面、报告和文档；保留可运行的多语言和角色切换。

- [ ] Step 1: 将 README 改写为公开产品文档，增加快速开始、浏览器要求、六视图、数据生命周期、隐私、边界、故障排查、发布与授权章节。
- [ ] Step 2: 将报告水印替换为通用演示数据和安全边界文案，同步中文、英文、藏文和生成器源文本。
- [ ] Step 3: 将机构角色 college 替换为 analyst（区域分析），同步 option、标签、角色摘要和三语文案；保留 station/cooperative 的业务含义。
- [ ] Step 4: 清理旧设计与计划文档中的背景词，使仓库内文档符合公开规则。
- [ ] Step 5: 运行 python generate_docs.py；运行 node --test tests/round8_quality.test.js tests/round9_accessibility.test.js tests/round9_visual_contract.test.js。

### Task 3: 实现强保护许可、原创声明与 SHA-256 校验

**Files:**
- Modify: LICENSE
- Create: COPYRIGHT.md
- Create: ORIGINALITY.md
- Create: originality-manifest.json
- Create: scripts/verify-originality.js

**Interfaces:**
- Consumes: Node 内置 crypto、受版本控制的文件和当前构建提交哈希。
- Produces: node scripts/verify-originality.js；成功时输出清单文件数和校验结果，失败时返回非零退出码并列出文件名。

- [ ] Step 1: 将 LICENSE 改为定制“保留所有权利”条款，明确允许本地查看/运行/内部评估，禁止未授权复制、改编、再发布、商用、移除署名和提取模型参数服务化。
- [ ] Step 2: 编写 COPYRIGHT.md，列出代码、模型、规则、文案、视觉资产、构建标识和第三方 Chart.js 的权利边界与联系流程。
- [ ] Step 3: 编写 ORIGINALITY.md，说明原创组成、受保护路径、SHA-256 证据用途、版本标识和合法使用限制，不声称可以技术上阻止网页查看。
- [ ] Step 4: 让 scripts/verify-originality.js 读取 originality-manifest.json，逐项计算 SHA-256，检查路径存在且未越界，并检查 LICENSE/COPYRIGHT/ORIGINALITY 的关键条款。
- [ ] Step 5: 生成 manifest，覆盖锁定算法、核心 UI、数据导入、报告、构建脚本与关键资产；运行 node scripts/verify-originality.js。

### Task 4: 加固 CSV 导入边界并补充回归测试

**Files:**
- Modify: dataImport.js
- Modify: tests/round9_data_trust.test.js
- Modify: tests/round10_governance.test.js

**Interfaces:**
- Consumes: parseCsv(csvText, options)、现有 REQUIRED/ACCEPTED_FIELDS 与 q.dataImport API。
- Produces: 继续返回 records/errors/warnings 的 parseCsv；新增稳定的 limits 信息或导出常量，供测试与 UI 使用。

- [ ] Step 1: 在测试中加入合法 16 行样例、重复必需表头、超限行数、超长字段和超过总字节数的输入，分别断言合法导入或明确错误码。
- [ ] Step 2: 在 dataImport.js 定义不可变限制：最大文本字节数、最大数据行数、最大字段数、最大字段长度；在 splitRows/parseCsv 入口先拒绝超限输入。
- [ ] Step 3: 检查表头非空、必需字段只出现一次、字段总数不超过限制；错误信息继续经过三语 text() 映射或提供稳定 code。
- [ ] Step 4: 保持现有站点 ID、时间戳、数值范围、原型污染和派生字段重算逻辑，确保超限拒绝不会写入浏览器存储。
- [ ] Step 5: 运行 node --test tests/round9_data_trust.test.js tests/round10_governance.test.js。

### Task 5: 接入发布校验和 Pages allowlist

**Files:**
- Modify: verify-deployment.js
- Modify: scripts/build-pages.js
- Modify: .github/workflows/verify-compensator.yml
- Modify: README.md
- Modify: tests/round9_visual_contract.test.js

**Interfaces:**
- Consumes: scripts/verify-originality.js、公开内容禁词列表、PUBLIC_FILES allowlist。
- Produces: 源码目录与 dist 目录均执行治理、原创和部署检查；Pages 只发布明确允许的文档和运行时文件。

- [ ] Step 1: 在 verify-deployment.js 增加原创清单校验与公开文本扫描；内部 docs/superpowers 可被扫描但不进入 Pages。
- [ ] Step 2: 在 scripts/build-pages.js allowlist 加入 COPYRIGHT.md、ORIGINALITY.md、SECURITY.md、docs/USER_GUIDE.md、docs/DATA_DICTIONARY.md、docs/RELEASE_CHECKLIST.md、originality-manifest.json。
- [ ] Step 3: 在 GitHub Actions verify job 增加原创校验、公开内容扫描和构建后重复验证步骤，保持固定 action SHA 与最小权限。
- [ ] Step 4: 扩充发布契约测试，断言新文档被发布且 tests、docs/superpowers、备份和 output 不会进入 dist。
- [ ] Step 5: 运行 node scripts/build-pages.js --out dist；运行 node verify-deployment.js . 与 node verify-deployment.js dist。

### Task 6: 完善公开文档、安全说明与发布清单

**Files:**
- Create: SECURITY.md
- Create: docs/USER_GUIDE.md
- Create: docs/DATA_DICTIONARY.md
- Create: docs/RELEASE_CHECKLIST.md
- Modify: README.md
- Modify: COPYRIGHT.md

**Interfaces:**
- Consumes: dataImport.js、reportGenerator.js、reportRenderer.js、verify-deployment.js、GitHub Actions 当前行为。
- Produces: 面向用户、维护者和发布者的详细中文文档，所有表述与实际代码一致。

- [ ] Step 1: USER_GUIDE.md 描述启动、语言/主题、六路由、示例数据、CSV 导入、人工录入、筛选、报告、打印、清除数据与存储降级。
- [ ] Step 2: DATA_DICTIONARY.md 列出每个 CSV 字段类型、单位、允许范围、时间格式、来源标记、派生字段信任边界和示例。
- [ ] Step 3: SECURITY.md 说明本地处理、XSS/CSV 防护、第三方 CDN SRI、模型边界、漏洞报告、隐私限制和不保证事项。
- [ ] Step 4: RELEASE_CHECKLIST.md 给出生成文档、锁定模型校验、语法检查、Node 测试、构建、dist 校验、git diff --check、Actions 和线上 smoke test 的逐项命令。
- [ ] Step 5: 运行公开词汇扫描，确认新文档没有背景泄露，且链接、文件名和命令均有效。

### Task 7: 全量验证、提交、推送和线上复核

**Files:**
- Modify: execution_log.txt

**Interfaces:**
- Consumes: 前六个任务的代码、文档、测试和 dist。
- Produces: gh-pages 分支提交、GitHub Actions 成功、线上构建信息与自检页通过。

- [ ] Step 1: 在 UTC 时区运行 node --test tests/*.test.js，确认所有测试通过。
- [ ] Step 2: 运行 node verify_compensator.js、node generate-knowledge-base-document.js、node verify-deployment.js .、受版本控制 JavaScript 的 node --check。
- [ ] Step 3: 运行 node scripts/build-pages.js --out dist、node verify-deployment.js dist、git diff --check，并确认 dist 只含 allowlist。
- [ ] Step 4: 检查 git status、git diff --stat、公开词汇扫描和 manifest 校验；确认没有密钥、内部路径或不应公开的背景信息。
- [ ] Step 5: 提交并推送 origin gh-pages。
- [ ] Step 6: 查询 GitHub Actions verify/deploy 状态；检查首页、build_info.js、online_test.html、robots.txt、sitemap.xml 与 Pages 上的新文档。
- [ ] Step 7: 将 commit、Actions run、线上 build_info、测试计数和 smoke test 结果追加到 execution_log.txt。

## 完成判定

- Node 完整测试无失败。
- 模型锁校验、生成文档校验、源码与 dist 部署校验、原创清单校验全部返回 0。
- 公开文件词汇扫描无命中；强保护条款和清单哈希可复核。
- GitHub Actions verify 与 deploy 成功，线上 build_info.commit 等于最终提交。
- 线上文档可访问且没有引入来源组织、活动背景或个人隐私信息。
