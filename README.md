# GitHub Pages 独立部署包

本目录由 `gh-pages` 分支直接发布。高原氨气模型采用热插拔结构：日常更新只替换 `model_weights.js`，而不修改 `compensator_engine.js` 或页面逻辑。

加载顺序为 `model_weights.js?v=版本号`、`compensator_engine.js`、`ui_interactions.js`。部署后访问 `online_test.html` 可验证权重、补偿输出与模型版本。
