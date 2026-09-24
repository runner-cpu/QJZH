# 青境智衡部署报告

## 部署范围

- 目标仓库：`runner-cpu/QJZH`
- 发布分支：`gh-pages`
- 发布方式：GitHub Pages 根目录静态部署
- 训练模型版本：`1.0.0`
- 训练日期：`2026-08-03`
- 测试集相对误差：`0.71%`

## 文件架构

- `model_weights.js`：只保存 `MODEL_WEIGHTS` Q16.16 定点权重、归一化参数和版本元数据。
- `compensator_engine.js`：只实现归一化、16 单元 ReLU 前向传播和反归一化；通过全局 `compensate(...)` 导出。
- `ui_interactions.js`：演示面板交互逻辑，通过 `window.MODEL_WEIGHTS.version` 展示版本。
- `index.html`：先加载权重，再加载引擎，随后加载页面依赖和 UI 脚本。
- `online_test.html`：验证权重定义、典型输入输出范围、部署时间戳和模型版本。

## 2026-09 展示层模块

- `dataImport.js`：CSV/人工数据校验、本地存储、按时间排序与主看板回放游标。
- `institutionView.js`：机构版多圈舍视图、角色差异化展示与输出转义。
- `reportGenerator.js`：最近 90 天环境指标聚合。
- `reportRenderer.js`：A4 报告、赛事演示水印、打印与复制降级。
- `ui_text_map.js`：建议语义映射与中英藏显示文案。
- `errorHandler.js`：纯前端异常提示与离线降级。
- `demoReset.js`：演示数据恢复与本地缓存清理。
- `build_info.js`：页面与自检页共用的运行时版本和部署日期。
- `assets/`：CSV 模板与青海示例数据。

新增 `qjzh-*` 面板覆盖数据接入、散户/机构视图、置信度、季度报告、答辩场景预设与边界声明；导入记录将直接驱动主看板校准、趋势、告警和建议输出。

## 自动校验与发布

- 当前采用 GitHub Pages 的 `gh-pages` 分支根目录发布；仓库未引入构建型 CI，静态文件推送后由 Pages 服务自动发布。
- `node verify_compensator.js` 验证受保护补偿模型文件与典型推理。
- `node verify-deployment.js .` 验证知识库、决策引擎与生成文档同步状态。
- `online_test.html` 在浏览器中验证回放接口、三语标记、移动端场景开关与页面关键模块。
- 最新部署批次：`v2026.09`，发布目标为 `gh-pages` 根目录。

## 验证记录

1. JavaScript 语法检查：`model_weights.js`、`compensator_engine.js`、`simulator.js`、`ui_interactions.js`、`knowledgeBase.js`、`decisionEngine.js` 均通过 `node --check`。
2. 典型推理：`compensate(2800, 10, 60, 30) = 21.787617 ppm`，处于 `15-25 ppm` 预期区间。
3. 线上自检页执行三项 PASS 后，视为部署成功。

## 回滚

```powershell
git fetch origin
git checkout gh-pages
git revert <本次部署提交SHA>
git push origin gh-pages
```

