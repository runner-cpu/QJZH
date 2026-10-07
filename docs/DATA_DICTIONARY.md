# CSV 数据字典

## 必需字段

| 字段 | 类型 | 单位/格式 | 允许范围 | 说明 |
| --- | --- | --- | --- | --- |
| timestamp | string | ISO 8601，必须带 Z 或 ±HH:MM | 不晚于当前时间 5 分钟以上 | 记录时间；报告按 Asia/Shanghai 归档 |
| site_id | string | 2–64 位字母、数字、下划线或连字符 | 不得使用特殊原型名称 | 站点标识；与时间戳共同构成去重键 |
| altitude_m | number | m | 2200–3500 | 模型输入；接近边界时显示警告 |
| temp_c | number | ℃ | -15–25 | 模型输入；接近边界时显示警告 |
| rh_percent | number | %RH | 20–85 | 模型输入；接近边界时显示警告 |
| raw_nh3_ppm | number | ppm | 0–30 | 未校准氨气输入 |
| device_model | string | 自定义文本 | 单字段不超过 256 字符 | 设备或数据来源名称 |

## 可选字段

| 字段 | 类型 | 单位 | 用途 |
| --- | --- | --- | --- |
| species | string | - | 畜种标签，用于筛选和机构摘要 |
| age_days | number | 天 | 记录元数据，不参与当前补偿推理 |
| stocking_density | number | 头/m² 或用户自定义 | 记录元数据，不参与当前补偿推理 |
| barn_area | number | m² | 圈舍面积元数据 |

可选数值必须为非负有限数；age_days 必须为整数。核心数值采用十进制或科学计数法，空白、十六进制、NaN 和 Infinity 不作为有效数字。核心输入超过模型范围宽度 10% 以内会以 B 级警告接收；超过这一余量时拒绝。B 级记录不代表模型已验证该范围。

未列出的列会被忽略。不要在 CSV 中提交 calibrated_nh3_ppm、risk_level、rule_id 等系统派生字段；即使提交，系统也会丢弃并重新计算。

## 限制

- 单个 CSV 最大 1 MiB。
- 最多 5000 条数据行，表头行不计入。
- 最多 11 个允许字段，字段不能为空且不能重复。
- 单字段最多 256 个字符。
- 空文件、只有表头、空表头、重复表头、保留表头名称和超限文件会拒绝。
- 引号必须成对，双引号通过双写转义；引用字段允许包含换行。每行列数必须与表头一致。
- 行级错误会被列出；合法行进入预览，只有点击确认后才保存。
- 浏览器累计记录上限为 5000；按同一站点和同一真实时刻去重后若仍超限，整批保存失败，原记录保留。
- 日期必须在真实日历中存在；时间不得使用 24:00 或自动归一化的 2 月 30 日等值。

## 来源标记

系统为每条记录写入 provenance：user-import（用户 CSV）、manual-entry（人工录入）、sample（内置示例）、legacy-local（旧记录）。机构视图还会区分 institution-records 和 institution-snapshot。来源信息用于报告溯源，不代表数据质量自动合格。

## 最小示例

    timestamp,site_id,altitude_m,temp_c,rh_percent,raw_nh3_ppm,device_model
    2026-01-15T08:00:00+08:00,DEMO-001,2620,-5,62,18.6,generic_sensor
