# 版权与使用说明

## 权利范围

青境智衡项目的代码、模型参数、规则数据、界面布局、中文/英文/藏文文案、图表样式、报告模板、示例数据和视觉资源共同构成受保护作品。除非文件明确标注了其他许可，均适用仓库根目录的定制许可：保留所有权利。

允许的默认行为只有：

- 在线查看页面并进行正常交互；
- 下载并在个人设备上运行未修改副本，用于内部评估；
- 在不公开传播的前提下，对本地副本做兼容性检查和安全审计。

以下行为需要事先取得书面许可：复制或改编核心代码、公开镜像、再发布压缩包、商用部署、集成到其他产品、提取模型参数或规则建立衍生服务、移除署名、批量抓取后重新包装。

## 受保护组成

| 组成 | 典型路径 | 说明 |
| --- | --- | --- |
| 锁定算法 | knowledgeBase.js、decisionEngine.js、compensator_engine.js、model_weights.js、simulator.js | 规则、模型推理和演示数据链路 |
| 应用界面 | index.html、dashboard.js、ui_interactions.js、viewRouter.js | 信息架构、交互和可访问性实现 |
| 数据服务 | dataImport.js、institutionView.js、reportGenerator.js、reportRenderer.js | 输入校验、本地存储和报告输出 |
| 工程资产 | scripts/、tests/、assets/、docs/ | 构建、验证、测试、示例和公开文档 |

## 第三方依赖

页面按固定 SHA-384 完整性值加载 Chart.js 3.9.1。Chart.js 的权利和义务以其上游许可为准；本项目的定制许可不改变第三方依赖的原有许可。

## 版权证据

originality-manifest.json 记录受保护文件的 SHA-256。运行 node scripts/verify-originality.js 可以复核当前工作树是否与清单一致。哈希用于版本溯源和争议举证，不是不可破解的防复制技术。

## 许可申请与侵权报告

请在仓库 Issue 或权利人维护的项目联系渠道中说明：使用场景、涉及文件、预计用户范围、是否收费、期望许可期限以及可验证的来源链接。不要在公开 Issue 中提交个人隐私、访问令牌或未公开业务数据。
