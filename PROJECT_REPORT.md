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

