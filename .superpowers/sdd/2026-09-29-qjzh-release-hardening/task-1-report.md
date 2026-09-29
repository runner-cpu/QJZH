# Task 1 报告：输入预检、批次存储回滚与本地导出

## 改动

- `dataImport.js` 新增 `inspectFile(file)`，在创建 `FileReader` 前检查文件名、空文件、可读性和 1 MiB 大小上限，并返回稳定的 `{ ok, code, message, bytes, name }` 结构。
- `save(records, options)` 改为先构造完整批次，再对存储目标执行写入；任一写入或校验失败时恢复已写入键并返回 `storageQuota`、`rolledBack: true`，成功路径继续保持按站点去重、时间排序、每站点最多 1000 条和 `replaceSites` 语义。
- 新增 `exportCsv(options)`，使用 `ACCEPTED_FIELDS` 顺序和 RFC 4180 风格单元格转义，返回 CSV 文本、文件名、记录数和存储状态；导出异常不清除数据。
- `clearData(options)` 支持显式 `confirm: true`，取消时返回 `{ ok:false, cancelled:true }`，确认后返回删除键数量；无参数调用保留既有内部演示重置兼容性。
- 文件导入 UI 增加预检、`onerror`/`onabort`、空文件提示和 `aria-busy` 状态；`index.html` 增加本地 CSV 导出按钮、帮助关联和 `aria-controls`。
- 更新 `originality-manifest.json` 中 `index.html` 的 SHA-256 证据。

## 先红后绿

新增测试位于 `tests/round9_data_trust.test.js`：

- 红灯：`node --test tests/round9_data_trust.test.js tests/web_features.test.js tests/round10_governance.test.js`，新增 4 项接口测试失败（API 尚不存在/未回滚/未确认）。
- 绿灯：同一命令最终通过 30/30；`node scripts/verify-originality.js --write` 后原创性清单校验通过。

## 提交

本报告生成时尚未提交；由父任务代理在汇总所有阶段改动后统一提交。

## 未解决疑问

- 现有历史 UI 监听器仍保留在 `dataImport.js`，新增监听器与旧监听器可能在真实浏览器中重复处理一次 change 事件；建议父任务在最终 UI 回归阶段合并为单一监听器并补充 DOM 事件测试。
