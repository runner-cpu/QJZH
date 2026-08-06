# GitHub Pages 独立部署包

本目录为独立部署包，三个模型文件（knowledgeBase/decisionEngine/simulator）保持分离，可直接修改单个文件而不影响整体结构。

`model_weights.js` 与 `compensator_engine.js` 是独立高原补偿模型文件；知识库、推理引擎与模拟器同样保持分离，不能合并进页面。

发布前运行 `node verify_compensator.js` 和 `node verify-deployment.js .`。两项校验会保护补偿模型、专家建议卡、规则目录及三条独立图表坐标轴，避免后续界面更新覆盖知识库能力。
