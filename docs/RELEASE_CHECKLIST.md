# 发布清单

以下命令在仓库根目录执行。PowerShell 使用分号分隔命令时，请逐条查看退出码，不要忽略失败输出。

## 内容与算法

1. 检查工作树和分支：git status --short --branch。
2. 重新生成规则文档：node generate-knowledge-base-document.js。
3. 校验锁定补偿模型：node verify_compensator.js。
4. 校验原创清单：node scripts/verify-originality.js。
5. 扫描公开禁用背景词：node scripts/verify-originality.js（该脚本同时检查许可条款；部署校验检查公开文本）。

## 测试与语法

1. 设置 UTC 后运行完整 Node 测试：$env:TZ='UTC'; node --test tests/*.test.js。
2. 对受版本控制的 JavaScript 逐个运行 node --check；不要扫描 output 或第三方 node_modules。
3. 检查差异空白：git diff --check。

## 构建与部署校验

1. 构建 Pages 产物：node scripts/build-pages.js --out dist。
2. 校验源码：node verify-deployment.js .。
3. 校验产物：node verify-deployment.js dist。
4. 检查 dist 只包含 allowlist，确认没有 tests、backups、output、内部计划或密钥。
5. 检查 dist/build_info.js 的 commit、builtAt 和 environment 字段。

## GitHub Actions 与线上 smoke test

仓库 Settings → Pages → Build and deployment → Source 必须保持为 **GitHub Actions**。如果通过 API 配置，使用 Pages 更新接口的 `PUT` 方法设置 `build_type=workflow`；不要使用 `PATCH`，也不要恢复为 gh-pages 根目录。推送 gh-pages 后等待 Verify and deploy GitHub Pages workflow，必须确认 verify 和 deploy job 均为 success。线上至少检查：

- / 返回 200，六个 hash 视图可切换；
- /online_test.html 自检全部 PASS；
- /build_info.js 的 commit 等于推送提交；
- /robots.txt、/sitemap.xml、/404.html 返回正确内容；
- /COPYRIGHT.md、/ORIGINALITY.md、/SECURITY.md 和 docs/ 公开文档可访问；
- 页面禁词扫描和许可证链接均无异常。

若线上 `/build_info.js` 仍显示 `commit: "local"` 或 `environment: "local"`，说明 Pages source 被切回 legacy 根目录；先修复 Pages source，再重新运行 workflow，不要手工把生成的 `dist/build_info.js` 复制回源码。

## 回滚

先记录线上 build_info.commit，再在 gh-pages 分支创建反向提交并推送。不要删除远端历史；回滚后重新等待 Actions 和线上 smoke test。
