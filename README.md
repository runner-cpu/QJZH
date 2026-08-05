# 青境智衡 GitHub Pages 部署

页面采用可热插拔的模型结构：`model_weights.js` 只保存 Q16.16 权重，`compensator_engine.js` 负责稳定的前向传播，`index.html` 与 `ui_interactions.js` 只负责展示和交互。

更新模型时替换 `model_weights.js` 并递增脚本查询参数版本号即可，无需改动页面核心逻辑。可访问 `online_test.html` 检查线上资源和典型推理结果。
