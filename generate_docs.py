#!/usr/bin/env python3
"""Generate synchronized algorithm documentation from the deployed source files.

Run from this repository root with: python generate_docs.py
The script intentionally uses only the Python standard library so it can run in
an offline GitHub Pages maintenance workflow.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
MODEL_FILE = ROOT / "model_weights.js"
ENGINE_FILE = ROOT / "compensator_engine.js"
KNOWLEDGE_FILE = ROOT / "knowledge_engine.js"
KNOWLEDGE_BASE_FILE = ROOT / "knowledgeBase.js"
DECISION_FILE = ROOT / "decisionEngine.js"
OUTPUT_FILE = ROOT / "ALGORITHM_DOCUMENTATION.md"


def read_text(path: Path) -> str:
    """Read a UTF-8 source file and fail with a precise message when absent."""
    if not path.exists():
        raise FileNotFoundError(f"Required source file is missing: {path.name}")
    return path.read_text(encoding="utf-8")


def source_hash(path: Path) -> str:
    """Return the SHA-256 checksum of a source file."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def balanced_array(source: str, field: str) -> list[Any]:
    """Extract a JSON-compatible JS numeric array using bracket balancing."""
    match = re.search(rf"\b{re.escape(field)}\s*:\s*\[", source)
    if not match:
        raise ValueError(f"MODEL_WEIGHTS field {field!r} was not found")
    start = source.find("[", match.start())
    depth = 0
    for index in range(start, len(source)):
        char = source[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return json.loads(source[start:index + 1])
    raise ValueError(f"MODEL_WEIGHTS field {field!r} has an unclosed array")


def scalar(source: str, field: str) -> float:
    """Extract a numeric JavaScript object property."""
    match = re.search(rf"\b{re.escape(field)}\s*:\s*(-?(?:\d+\.?\d*|\.\d+))", source)
    if not match:
        raise ValueError(f"MODEL_WEIGHTS field {field!r} was not found")
    return float(match.group(1))


def string_value(source: str, field: str) -> str:
    """Extract a quoted JavaScript object property."""
    match = re.search(rf"\b{re.escape(field)}\s*:\s*[\"']([^\"']+)[\"']", source)
    if not match:
        raise ValueError(f"MODEL_WEIGHTS field {field!r} was not found")
    return match.group(1)


def q_to_float(value: Any, scale: float) -> Any:
    """Decode a scalar or nested Q16.16 array without rounding model values."""
    if isinstance(value, list):
        return [q_to_float(item, scale) for item in value]
    return value / scale


def format_number(value: float, digits: int = 8) -> str:
    """Format a number precisely enough for readable audit output."""
    return f"{value:.{digits}f}".rstrip("0").rstrip(".") or "0"


def compact_json(value: Any) -> str:
    """Encode arrays as one deterministic UTF-8 JSON line."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ", "))


def parse_model() -> dict[str, Any]:
    """Parse the deployed MODEL_WEIGHTS object and decode its fixed-point data."""
    text = read_text(MODEL_FILE)
    scale = scalar(text, "fixedPointScale")
    fields = {
        "version": string_value(text, "version"),
        "scale": scale,
        "feature_order": balanced_array(text, "featureOrder"),
        "feature_count": int(scalar(text, "featureCount")),
        "hidden_units": int(scalar(text, "hiddenUnitCount")),
        "feature_mean_q": balanced_array(text, "featureMeanQ"),
        "feature_std_q": balanced_array(text, "featureStdQ"),
        "target_mean_q": int(scalar(text, "targetMeanQ")),
        "target_std_q": int(scalar(text, "targetStdQ")),
        "output_min_q": int(scalar(text, "outputMinQ")),
        "output_max_q": int(scalar(text, "outputMaxQ")),
        "relu_floor_q": int(scalar(text, "reluFloorQ")),
        "w1_q": balanced_array(text, "w1Q"),
        "b1_q": balanced_array(text, "b1Q"),
        "w2_q": balanced_array(text, "w2Q"),
        "b2_q": int(scalar(text, "b2Q")),
    }
    fields["feature_mean"] = q_to_float(fields["feature_mean_q"], scale)
    fields["feature_std"] = q_to_float(fields["feature_std_q"], scale)
    fields["target_mean"] = q_to_float(fields["target_mean_q"], scale)
    fields["target_std"] = q_to_float(fields["target_std_q"], scale)
    fields["output_min"] = q_to_float(fields["output_min_q"], scale)
    fields["output_max"] = q_to_float(fields["output_max_q"], scale)
    fields["w1"] = q_to_float(fields["w1_q"], scale)
    fields["b1"] = q_to_float(fields["b1_q"], scale)
    fields["w2"] = q_to_float(fields["w2_q"], scale)
    fields["b2"] = q_to_float(fields["b2_q"], scale)
    if len(fields["w1_q"]) != fields["feature_count"] or any(
        len(row) != fields["hidden_units"] for row in fields["w1_q"]
    ):
        raise ValueError("w1Q shape does not match featureCount x hiddenUnitCount")
    if len(fields["b1_q"]) != fields["hidden_units"] or len(fields["w2_q"]) != fields["hidden_units"]:
        raise ValueError("b1Q or w2Q length does not match hiddenUnitCount")
    return fields


def find_metrics_file() -> Path | None:
    """Locate the latest metrics in the deployment tree or its training sibling."""
    candidates = [
        ROOT / "training_metrics.json",
        ROOT.parent / "qingjing-zhiheng-dashboard" / "training_metrics.json",
    ]
    return next((path for path in candidates if path.exists()), None)


def parse_metrics() -> tuple[dict[str, float], Path | None]:
    """Load recorded training metrics, returning an empty mapping when unavailable."""
    metrics_file = find_metrics_file()
    if not metrics_file:
        return {}, None
    data = json.loads(metrics_file.read_text(encoding="utf-8"))
    result = {
        "mae": float(data["model_b_compensator"]["mae"]),
        "rmse": float(data["model_b_compensator"]["rmse"]),
        "raw": float(data["error_rates_percent"]["raw"]),
        "temp_humidity": float(data["error_rates_percent"]["temp_humidity"]),
        "full": float(data["error_rates_percent"]["full"]),
    }
    return result, metrics_file


def parse_engine() -> dict[str, Any]:
    """Extract the public compensator signature and JSDoc contract."""
    text = read_text(ENGINE_FILE)
    signature_match = re.search(r"(?:root\.)?compensate\s*=\s*function\s+(\w+)\s*\(([^)]*)\)", text)
    if not signature_match:
        signature_match = re.search(r"function\s+(compensate)\s*\(([^)]*)\)", text)
    if not signature_match:
        raise ValueError("Public compensate function signature was not found")
    jsdoc_match = re.search(r"/\*\*(.*?)\*/\s*\(function", text, flags=re.DOTALL)
    jsdoc = jsdoc_match.group(1) if jsdoc_match else ""
    parameters = re.findall(r"@param\s+\{([^}]+)\}\s+(\w+)\s+([^\n*]+)", jsdoc)
    returns_match = re.search(r"@returns\s+\{([^}]+)\}\s+([^\n*]+)", jsdoc)
    return {
        "name": signature_match.group(1),
        "arguments": [item.strip() for item in signature_match.group(2).split(",")],
        "parameters": parameters,
        "returns": returns_match.groups() if returns_match else ("number", "Compensated NH3 concentration in ppm."),
        "throws_weight_error": "权重文件未加载" in text,
    }


def first_number(source: str, name: str, fallback: float) -> float:
    """Read an object-style numeric property, using a documented fallback only if absent."""
    match = re.search(rf"\b{re.escape(name)}\s*:\s*(-?(?:\d+\.?\d*|\.\d+))", source)
    return float(match.group(1)) if match else fallback


def parse_knowledge() -> dict[str, Any]:
    """Read the current split knowledge base, with legacy knowledge_engine fallback."""
    base_path = KNOWLEDGE_BASE_FILE if KNOWLEDGE_BASE_FILE.exists() else KNOWLEDGE_FILE
    base = read_text(base_path)
    decision = read_text(DECISION_FILE) if DECISION_FILE.exists() else ""
    rules = re.findall(
        r'"([^"]+)"\s*:\s*Object\.freeze\(\{\s*title:\s*"([^"]+)",\s*condition:\s*"([^"]+)",\s*source:\s*"([^"]+)"\s*\}\)',
        base,
    )
    species = re.findall(
        r'"([^"]+)"\s*:\s*Object\.freeze\(\{\s*ammonia:\s*Object\.freeze\(\{\s*comfortableMin:\s*([\d.]+),\s*comfortableMax:\s*([\d.]+),\s*levelTwo:\s*([\d.]+),\s*levelOne:\s*([\d.]+)',
        base,
    )
    return {
        "base_file": base_path.name,
        "decision_file": DECISION_FILE.name if DECISION_FILE.exists() else None,
        "start_hour": first_number(base, "startHour", 12),
        "end_hour": first_number(base, "endHour", 14),
        "max_drop": first_number(base, "maxTemperatureDrop", 3),
        "start_nh3": first_number(base, "startNh3", 15.5),
        "stop_nh3": first_number(base, "stopNh3", 9.5),
        "rules": rules,
        "species": species,
        "template_count": len(re.findall(r'^\s{4}[A-Z_]+:\s*"', base, flags=re.MULTILINE)),
        "decision_has_trend": "fast_rising" in decision,
        "decision_has_window_lock": "!inWindow" in decision,
        "decision_has_drop_stop": "maxTemperatureDrop" in decision,
    }


def compensate(model: dict[str, Any], altitude: float, temp: float, rh: float, raw_ppm: float) -> float:
    """Mirror compensator_engine.js exactly for generated numerical test evidence."""
    values = [altitude, temp, rh, raw_ppm]
    normalized = [
        (value - model["feature_mean"][index]) / model["feature_std"][index]
        for index, value in enumerate(values)
    ]
    hidden = []
    for unit in range(model["hidden_units"]):
        total = model["b1"][unit]
        for feature in range(model["feature_count"]):
            total += normalized[feature] * model["w1"][feature][unit]
        hidden.append(max(0.0, total))
    output = model["b2"] + sum(hidden[unit] * model["w2"][unit] for unit in range(model["hidden_units"]))
    result = output * model["target_std"] + model["target_mean"]
    return min(model["output_max"], max(model["output_min"], result))


def edge_tests(model: dict[str, Any]) -> dict[str, Any]:
    """Exercise calibration-domain endpoints and a small local continuity step."""
    values = [
        compensate(model, altitude, temp, rh, raw)
        for altitude in (2200.0, 3500.0)
        for temp in (-15.0, 25.0)
        for rh in (20.0, 85.0)
        for raw in (0.0, 30.0)
    ]
    base = compensate(model, 2800.0, 10.0, 60.0, 20.0)
    next_value = compensate(model, 2800.0, 10.0, 60.0, 20.01)
    return {
        "count": len(values),
        "minimum": min(values),
        "maximum": max(values),
        "zero": compensate(model, 2800.0, 10.0, 60.0, 0.0),
        "sample": compensate(model, 2800.0, 10.0, 60.0, 30.0),
        "delta": next_value - base,
    }


def error_svg(metrics: dict[str, float]) -> str:
    """Build a self-contained SVG error comparison chart from current metric values."""
    if not metrics:
        return "指标文件不可用；重新训练后运行本脚本即可补充误差图。"
    data = [("无补偿", metrics["raw"], "#d94841"), ("仅温湿度", metrics["temp_humidity"], "#e59b2d"), ("气压+温湿度", metrics["full"], "#1d8f6a")]
    maximum = max(45.0, max(value for _, value, _ in data) + 5.0)
    bars = []
    for index, (label, value, color) in enumerate(data):
        x = 85 + index * 170
        height = value / maximum * 220
        y = 260 - height
        bars.append(
            f'<rect x="{x}" y="{y:.2f}" width="92" height="{height:.2f}" fill="{color}"/>'
            f'<text x="{x + 46}" y="{y - 8:.2f}" text-anchor="middle">{value:.4f}%</text>'
            f'<text x="{x + 46}" y="287" text-anchor="middle">{label}</text>'
        )
    target_y = 260 - 10 / maximum * 220
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="620" height="320" viewBox="0 0 620 320" role="img" aria-label="补偿误差对比图">',
        '<style>text{font:14px sans-serif;fill:#24313d}.small{font-size:12px}</style>',
        '<line x1="55" y1="260" x2="585" y2="260" stroke="#5e6d77"/>',
        f'<line x1="55" y1="{target_y:.2f}" x2="585" y2="{target_y:.2f}" stroke="#3978c5" stroke-dasharray="6 4"/>',
        f'<text x="590" y="{target_y + 4:.2f}" class="small">10%目标线</text>',
        *bars,
        '<text x="310" y="24" text-anchor="middle">高原氨气传感器补偿误差对比（合成测试集）</text>',
        '</svg>',
    ])


def table_row(name: str, q_value: Any, value: Any) -> str:
    """Render a parameter row with its Q16.16 and decoded floating values."""
    return f"| `{name}` | `{compact_json(q_value)}` | `{compact_json(value)}` |"


def render(model: dict[str, Any], metrics: dict[str, float], metric_path: Path | None, engine: dict[str, Any], knowledge: dict[str, Any], tests: dict[str, Any]) -> str:
    """Render the complete Chinese Markdown document from parsed source artifacts."""
    today = date.today().isoformat()
    metric_note = metric_path.name if metric_path and metric_path.parent == ROOT else str(metric_path)
    metric_lines = (
        f"- 原始读数平均相对误差：**{metrics['raw']:.4f}%**\n"
        f"- 仅温湿度补偿：**{metrics['temp_humidity']:.4f}%**\n"
        f"- 气压+温湿度完整补偿：**{metrics['full']:.4f}%**\n"
        f"- 完整补偿 MAE：**{metrics['mae']:.7f} ppm**；RMSE：**{metrics['rmse']:.7f} ppm**。"
        if metrics else "训练指标文件未找到；本次不在文档中声明性能数值。"
    )
    rule_rows = "\n".join(f"| `{rule_id}` | {title} | {condition} | {source} |" for rule_id, title, condition, source in knowledge["rules"])
    species_rows = "\n".join(f"| {name} | {lo}-{hi} ppm | {level_two} ppm | {level_one} ppm |" for name, lo, hi, level_two, level_one in knowledge["species"])
    source_rows = "\n".join(
        f"| `{path.name}` | `{source_hash(path)}` |"
        for path in (MODEL_FILE, ENGINE_FILE, KNOWLEDGE_BASE_FILE, DECISION_FILE)
        if path.exists()
    )
    return f"""# 青境智衡：高原氨气补偿与知识库决策算法技术文档

> 本文件由 `generate_docs.py` 自动生成。禁止直接手改动态参数；修改模型或规则后运行 `python generate_docs.py` 重新生成。

## 1. 文档版本与元信息

| 项目 | 当前值 |
| --- | --- |
| 文档版本 | `v{model['version']}-docs` |
| 最后更新日期 | {today} |
| 关联模型版本 | `{model['version']}` |
| Q 定点比例尺 | `{int(model['scale'])}`（Q16.16） |
| 自同步方式 | 修改 `model_weights.js`、`compensator_engine.js`、`knowledgeBase.js`、`decisionEngine.js` 或训练指标后，执行 `python generate_docs.py`。 |

文档版本跟随 `MODEL_WEIGHTS.version`；模型版本变化时，生成器会同步更新本文件标题区、参数区、验证区和源文件校验和。当前文档从已部署权重而非手工记录取值，便于作为计划书附件、答辩材料或技术白皮书的可追溯快照。

## 2. 算法概览

高原圈舍位于约 2200-3500 m 海拔区间，低气压会改变 MQ-137 类氨气传感器的敏感元件响应，形成零点漂移与非线性偏差。模拟器中原始读数的设定误差为 35%-40%，完整合成测试集测得原始平均相对误差为 {format_number(metrics.get('raw', 0), 4)}%。

解决方案为气压-温湿度双维度非线性补偿神经网络：使用海拔作为低压代理变量，同时纳入温度、相对湿度与未经补偿的原始 ppm 读数，输出估计的真实氨气浓度。海拔本身隐含气压变化，标准大气换算采用 `P = 101.325 * (1 - 2.25577e-5 * altitude)^5.25588` kPa。

{metric_lines}

**指标边界：**上述误差来自可重复的合成测试集，而非物理传感器或标气实验的实测精度。其意义是验证数据生成假设下的算法、权重导出和网页端推理链路；高原实际部署仍需标气标定、长期漂移、交叉敏感性和传感器老化验证。

## 3. 数据模拟与预处理

训练侧 `data_simulator.py` 生成 10,000 条可复现的高原环境记录，其中海拔为 2200-3500 m、温度为 -15 至 25 C、相对湿度为 20%-85%、理论真实氨气浓度为 0-30 ppm。数据按 7:3 随机划分为训练集 7,000 条和测试集 3,000 条。

原始读数由理论浓度乘以随低压、温湿度变化的非线性误差项，再叠加低压/低温相关零漂与高斯噪声得到，并限制在 0-45 ppm。这使数据覆盖目标高原环境中 35%-40% 干扰的建模场景。该过程是基于理想气体状态与传感器响应假设的数学模拟，不宣称代替传感器手册的现场标定。

网页模型的输入特征顺序固定为：{', '.join(f'`{item}`' for item in model['feature_order'])}。标准化公式为 `x_norm = (x - mean) / std`，输出反标准化为 `ppm = y_norm * targetStd + targetMean`。

| 特征/目标 | Q16.16 整数 | 部署解码浮点值 |
| --- | --- | --- |
{table_row('featureMeanQ', model['feature_mean_q'], model['feature_mean'])}
{table_row('featureStdQ', model['feature_std_q'], model['feature_std'])}
{table_row('targetMeanQ', model['target_mean_q'], model['target_mean'])}
{table_row('targetStdQ', model['target_std_q'], model['target_std'])}

## 4. 神经网络架构

网络为 **输入层 4 节点 -> 隐藏层 {model['hidden_units']} 节点（ReLU）-> 输出层 1 节点（线性）**。训练脚本使用 `scipy.optimize.minimize` 的 `L-BFGS-B` 实现参数更新，目标函数为均方误差（MSE）。训练集内再按 85:15 划分训练/验证子集；验证损失连续 18 次无改善时通过回调触发 Early Stopping，并恢复最佳参数。

浏览器端公开函数签名为 `{engine['name']}({', '.join(engine['arguments'])})`，执行以下固定计算：

```text
输入数值校验 -> 标准化 -> hidden = ReLU(x_norm * W1 + b1)
-> y_norm = hidden * W2 + b2 -> 反标准化 -> 钳制到 0-30 ppm
```

`compensator_engine.js` 的 JSDoc 返回契约为 `{engine['returns'][0]}` / `{engine['returns'][1]}`。其参数说明规定校准输入范围：海拔 2200-3500 m、温度 -15 至 25 C、相对湿度 20%-85%RH、原始读数 0-30 ppm；超出此范围时引擎仍可计算，但不应将结果解释为经过模型标定的精度承诺。{' 未加载权重时引擎会输出“权重文件未加载”并抛出错误。' if engine['throws_weight_error'] else ''}

## 5. 模型权重与定点数实现

当前部署存储形状为 `w1Q: {len(model['w1_q'])}x{len(model['w1_q'][0])}`（输入特征 x 隐藏单元）、`b1Q: {len(model['b1_q'])}`、`w2Q: {len(model['w2_q'])}`、`b2Q: 1`。按常见数学矩阵记号转置后，`W1` 可表述为 **{model['hidden_units']}x{model['feature_count']}**，`b1` 为 **{model['hidden_units']}**，`W2` 为 **1x{model['hidden_units']}**，`b2` 为 **1**。

Q16.16 转换公式为 `q = round(float * {int(model['scale'])})`，反转换为 `float = q / {int(model['scale'])}`。单一参数的最大量化误差不超过 `0.5 / {int(model['scale'])} = {0.5/model['scale']:.10f}`；累计网络误差还与输入标准化、激活状态和 MAC 累加有关，ESP32-S3 固件应使用 64 位累加器并在每次乘法后按比例尺右移/饱和，以避免 32 位乘积溢出。

### 5.1 全量 Q16.16 参数（部署真值）

```json
{{
  "fixedPointScale": {int(model['scale'])},
  "featureMeanQ": {compact_json(model['feature_mean_q'])},
  "featureStdQ": {compact_json(model['feature_std_q'])},
  "targetMeanQ": {model['target_mean_q']},
  "targetStdQ": {model['target_std_q']},
  "outputMinQ": {model['output_min_q']},
  "outputMaxQ": {model['output_max_q']},
  "w1Q": {compact_json(model['w1_q'])},
  "b1Q": {compact_json(model['b1_q'])},
  "w2Q": {compact_json(model['w2_q'])},
  "b2Q": {model['b2_q']}
}}
```

### 5.2 全量解码浮点参数（审计对照）

以下数值由上节 Q16.16 参数按当前比例尺解码，故与浏览器实际推理一致；它们不是另一套独立权重。

```json
{{
  "featureMean": {compact_json(model['feature_mean'])},
  "featureStd": {compact_json(model['feature_std'])},
  "targetMean": {format_number(model['target_mean'], 12)},
  "targetStd": {format_number(model['target_std'], 12)},
  "w1": {compact_json(model['w1'])},
  "b1": {compact_json(model['b1'])},
  "w2": {compact_json(model['w2'])},
  "b2": {format_number(model['b2'], 12)}
}}
```

## 6. 知识库决策模型（可选扩展）

当前仓库的知识库并非单一 `knowledge_engine.js` 文件，而是 `{knowledge['base_file']}`（规则数据、物种阈值与建议模板）和 `{knowledge['decision_file'] or '无独立决策引擎文件'}`（优先级、趋势和执行决策）的组合。这一映射由生成器自动检测，以兼容未来合并为单一文件的实现。

氨气等级为 LOW：`<10 ppm`，MEDIUM：`10-15 ppm`，HIGH：`>15 ppm`；物种舒适区和等级阈值如下。

| 物种 | 舒适区 | 二级阈值 | 一级阈值 |
| --- | --- | --- | --- |
{species_rows}

午间主动通风窗口为 {int(knowledge['start_hour']):02d}:00-{int(knowledge['end_hour']):02d}:00（含端点），单次温降达到或超过 {format_number(knowledge['max_drop'])} C 时立即停风。滞回控制为：`NH3 >= {format_number(knowledge['start_nh3'])} ppm` 启动通风，通风中 `NH3 <= {format_number(knowledge['stop_nh3'])} ppm` 停止。

决策冲突消解按当前引擎顺序执行：温降超限停风 -> 非窗口期仅告警/现场处置 -> 通风中达到停止阈值停风 -> 达到启动阈值通风 -> 滞回区间保持通风 -> 默认停止或巡检。趋势模块取最近至多 3 个样本：斜率 `>5`，或斜率 `>3` 且最新值 `>12` 时标记为快速恶化。规则目录如下。

| 规则 ID | 名称 | 条件 | 来源 |
| --- | --- | --- | --- |
{rule_rows}

## 7. 性能验证与测试结果

### 7.1 合成测试集误差对比

{error_svg(metrics)}

误差柱状图由本次读取的训练指标生成，虚线为 10% 目标线。完整补偿误差为 {format_number(metrics.get('full', 0), 4)}%，在该模拟测试条件下低于目标线；图中的数值只反映合成测试集。

### 7.2 边界、零漂和连续性单元测试

生成器按 `compensator_engine.js` 相同的 Q16.16 解码、ReLU、线性输出及 0-30 ppm 钳制逻辑，枚举 16 个输入边界组合（海拔 2200/3500 m、温度 -15/25 C、湿度 20/85%RH、原始读数 0/30 ppm）。本次结果范围为 **{tests['minimum']:.6f}-{tests['maximum']:.6f} ppm**，未超出输出钳制范围。

在中间环境点 `(2800 m, 10 C, 60%RH)`，`raw_ppm=0` 的推理输出为 **{tests['zero']:.6f} ppm**，用于检查模型面对零读数时的输出行为；`raw_ppm=30` 输出为 **{tests['sample']:.6f} ppm**。从 `raw_ppm=20.00` 到 `20.01` 的输出变化为 **{tests['delta']:.8f} ppm**。ReLU 网络在激活切换点保持连续、但导数可分段变化；此数值用于回归测试，而非现实中的零点校准结论。

### 7.3 无硬件验证的合理性与边界

无硬件状态下可验证三件事：模拟数据的物理/传感器假设是否可复现，训练权重是否能降低保留测试集误差，以及同一权重在 Python/浏览器定点解码下是否产生一致输出。这足以覆盖算法原型的可重复性、模型导出和网页集成。它不能证明真实 MQ-137 或工业传感器在高海拔、长期使用、交叉气体干扰或标气条件下的准确度，现场验证应独立记录并重训或校准模型。

## 8. 代码架构与文件清单

```text
model_weights.js  ──> compensator_engine.js ──> index.html（传感器补偿展示）
knowledgeBase.js  ──> decisionEngine.js     ──> index.html（预警/建议展示）
         \____________________________________> generate_docs.py -> 本文档
```

| 文件 | 职责 | 维护频率 |
| --- | --- | --- |
| `model_weights.js` | 模型版本、Q16.16 权重、偏置、归一化和输出边界。 | 模型更新时替换。 |
| `compensator_engine.js` | 纯浏览器推理：输入校验、标准化、ReLU、线性输出、反标准化和钳制。 | 稳定引擎，结构变化时才改。 |
| `knowledgeBase.js` | 国标/本地规则、物种阈值、通风窗口、滞回和建议模板。 | 规则更新时改。 |
| `decisionEngine.js` | 按安全优先级执行预警、趋势和通风建议。 | 决策策略更新时改。 |
| `index.html` | 加载顺序与可视化 UI；不保存权重真值。 | 展示层更新时改。 |
| `generate_docs.py` | 从上述源文件和训练指标生成同步文档。 | 解析结构变化时改。 |

## 9. 部署与使用指南

网页中必须先加载 `model_weights.js`，再加载 `compensator_engine.js`，最后加载依赖 `compensate` 的 UI 脚本。当前权重 URL 应带随模型版本递增的缓存参数，例如：

```html
<script src="model_weights.js?v={model['version']}"></script>
<script src="compensator_engine.js"></script>
<script src="app.js"></script>
```

调用示例：`const correctedPpm = compensate(2800, 10, 60, 30);`。输入均应处于模型校准域，前端应向用户展示 ppm 单位和模型版本。

ESP32-S3 移植时，将本文件 5.1 节的整数数组存入只读 Flash；参数、输入和中间量均按 Q16.16 管理。乘法使用 `int64_t product = (int64_t)a * b`，随后执行符号正确的 `>> 16` 缩放；累加以 `int64_t` 保存，ReLU 对负值清零，输出经过反标准化后限幅到 `outputMinQ-outputMaxQ`。建议以这里的边界样例和网页样例建立固件回归测试，并逐项比较误差是否小于量化预算与业务容忍度。

## 10. 版本历史与维护日志

| 日期 | 文档版本 | 模型版本 | 变更与性能 |
| --- | --- | --- | --- |
| {today} | `v{model['version']}-docs` | `{model['version']}` | 初始同步：从部署权重、补偿引擎、知识库和训练指标自动生成。完整补偿 {format_number(metrics.get('full', 0), 4)}%，MAE {format_number(metrics.get('mae', 0), 7)} ppm，RMSE {format_number(metrics.get('rmse', 0), 7)} ppm。 |

### 源文件同步证据

| 文件 | SHA-256 |
| --- | --- |
{source_rows}

训练指标来源：`{metric_note or '未找到'}`。每次运行本生成器时，上表和本文件日期都会重算；将本文件与相关代码一起纳入 Git 版本控制即可获得可审计的历史。
"""


def main() -> None:
    """Generate the document, then print a compact reproducibility summary."""
    model = parse_model()
    metrics, metrics_path = parse_metrics()
    engine = parse_engine()
    knowledge = parse_knowledge()
    tests = edge_tests(model)
    OUTPUT_FILE.write_text(render(model, metrics, metrics_path, engine, knowledge, tests), encoding="utf-8")
    print(f"Generated {OUTPUT_FILE.name}")
    print(f"model_version={model['version']}")
    print(f"sample_compensate_2800_10_60_30={tests['sample']:.12f} ppm")


if __name__ == "__main__":
    main()
