# 青境智衡

> **高原圈舍环境数据服务系统**
>
> 面向青海 2200–3500 m 高原圈舍的纯软件数据接入、校准分析与决策建议演示。

[在线演示](https://runner-cpu.github.io/QJZH/) · [规则库文档](knowledge-base-rules.md) · [算法说明](ALGORITHM_DOCUMENTATION.md)

## 项目定位

青境智衡把第三方通用传感器数据、人工录入数据或公开数据，转化为适用于高原圈舍场景的环境参考建议。系统只负责网页展示层和本地数据服务，不生产、不销售、不控制任何硬件设备，不涉及风机控制，也不替代动物诊疗。

核心链路：

```text
数据接入 → 高原校准 → 智能决策 → 建议输出 → 环境报告
```

## 当前功能

- **数据接入**：支持 CSV 导入、人工录入、青海冬季示例数据、CSV 模板下载和本地数据清除。
- **高原校准**：沿用锁定的高原氨气校准模型，展示原始值、校准值、误差范围与输入置信度。
- **决策建议**：根据校准氨气、温湿度和本地规则输出“正常 / 关注 / 待办 / 紧急”风险等级、建议窗口、处置建议、规则 ID 与标准出处。
- **数据看板**：保留实时读数、趋势曲线、采样记录、快照和建议历史，用于演示数据回溯。
- **机构版视图**：提供 5 个青海模拟圈舍的汇总、排序、风险分布和本地记录导入。
- **季度报告**：按日期范围聚合本地记录，在新窗口生成可打印或另存为 PDF 的环境报告。
- **答辩场景**：支持散户、机构、断网场景切换，以及一键重置演示数据。

## 数据格式

CSV 至少应包含以下字段：

```text
timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model
```

完整字段可参考 [assets/csv_template.csv](assets/csv_template.csv)，青海示例数据见 [assets/csv_sample_qinghai.csv](assets/csv_sample_qinghai.csv)。当前演示校验范围为：海拔 2200–3500 m、温度 −15–25 ℃、相对湿度 20–85%、原始氨气 0–30 ppm。数据优先保存在浏览器本地存储；不可用时降级为当前会话内存，不上传服务器。

## 运行方式

直接访问在线演示：

<https://runner-cpu.github.io/QJZH/>

本地运行静态页面：

```bash
npx serve .
```

然后打开 http://localhost:3000/。也可以直接打开 index.html，但部分浏览器会限制本地文件读取和 CSV 预览。

## 主要文件

```text
index.html             主页面、看板与信息架构
ui_interactions.js     文案映射、建议展示与页面交互
ui_text_map.js         命令式文案到建议式文案的显示层映射
dataImport.js          CSV/人工数据校验、本地存储与示例导入
csvTemplate.js         CSV 模板下载
institutionView.js     机构版多圈舍视图
reportGenerator.js     报告数据聚合
reportRenderer.js      报告窗口渲染与打印
errorHandler.js        数据面板状态与错误展示
demoReset.js           演示数据重置
model_weights.js       锁定的模型参数
compensator_engine.js  高原校准模型实现
knowledgeBase.js       本地规则知识库
decisionEngine.js      规则推理引擎
simulator.js           演示数据与图表逻辑
online_test.html       浏览器端部署自检页
verify_compensator.js  模型锁校验脚本
verify-deployment.js   知识库部署校验脚本
```

## 模型与发布保护

以下五个源文件属于模型与规则基线，网页改造不应修改：

```text
knowledgeBase.js
decisionEngine.js
compensator_engine.js
model_weights.js
simulator.js
```

发布前运行：

```bash
node verify_compensator.js
node verify-deployment.js .
```

同时应保持 COMPENSATOR-LOCK 标记、模型加载顺序，以及知识库文档中的源文件 SHA256 校验值不变。

## 合规边界

- 本项目是纯软件环境数据服务演示，不生产、不销售、不控制硬件设备。
- 系统只输出环境参考建议，执行由养殖户使用既有设备或人工完成。
- 数据默认保存在本地浏览器，不向外部服务上传。
- 建议不能替代动物疫病诊断、治疗或专业兽医意见。

## 版权与项目说明

本项目为中国国际大学生创新大赛（2026）青海大学选拔赛参赛作品，由青海大学农牧学院团队开发。公开仓库仅包含网页演示、前端模块和必要的校验文档；内部计划、原始调研资料和成员隐私信息不随仓库发布。
