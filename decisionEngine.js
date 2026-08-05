(function (global) {
  "use strict";

  const URGENCY = Object.freeze({
    critical: Object.freeze({ label: "紧急行动", color: "#D32F2F" }),
    warning: Object.freeze({ label: "待办提醒", color: "#F57C00" }),
    alert: Object.freeze({ label: "预警", color: "#FF9F43" }),
    info: Object.freeze({ label: "关注提示", color: "#1976D2" }),
    normal: Object.freeze({ label: "常规状态", color: "#388E3C" })
  });

  class DecisionEngine {
    constructor(species) {
      const knowledgeBase = global.LocalKnowledgeBase;
      if (!knowledgeBase) throw new Error("知识库未加载：LocalKnowledgeBase 不可用");
      this.species = knowledgeBase.SPECIES[species] ? species : "犊牦牛";
      this.profile = knowledgeBase.SPECIES[this.species];
      this.windowRule = knowledgeBase.WINDOW_RULE;
      this.hysteresis = knowledgeBase.HYSTERESIS;
      this.adviceTemplates = knowledgeBase.ADVICE_TEMPLATES;
      this.lastState = { action: "stop" };
    }

    reset() {
      this.lastState = { action: "stop" };
    }

    analyzeTrend(historyNh3Array, currentNh3) {
      const samples = (Array.isArray(historyNh3Array) ? historyNh3Array : [])
        .map((item) => Number(typeof item === "object" && item !== null ? item.ammonia : item))
        .filter(Number.isFinite)
        .slice(-3);
      const current = Number(currentNh3);
      if (Number.isFinite(current) && (samples.length === 0 || samples[samples.length - 1] !== current)) samples.push(current);
      if (samples.length < 2) return { slope: 0, trendWarning: null, trendLabel: "平稳" };

      const slope = (samples[samples.length - 1] - samples[0]) / Math.max(1, samples.length - 1);
      const latest = samples[samples.length - 1];
      const trendWarning = slope > 5 || (slope > 3 && latest > 12) ? "fast_rising" : null;
      const trendLabel = trendWarning ? "快速恶化" : slope > 0.5 ? "缓慢上升" : slope < -0.5 ? "下降" : "平稳";
      return { slope: Number(slope.toFixed(1)), trendWarning, trendLabel };
    }

    classifyNh3(value) {
      return value < 10 ? "LOW" : value <= 15 ? "MEDIUM" : "HIGH";
    }

    classifyHumidity(value) {
      // 与专家规则保持一致：湿度超过80%才触发高湿复合预警。
      return value < 50 ? "LOW" : value <= 80 ? "NORMAL" : "HIGH";
    }

    classifyTemperature(value) {
      return value < 5 ? "COLD" : value <= 20 ? "NORMAL" : "HOT";
    }

    getTimeType(hour) {
      if (hour >= this.windowRule.startHour && hour <= this.windowRule.endHour) return "WINDOW";
      return hour >= 6 && hour < 18 ? "DAY" : "NIGHT";
    }

    getAdviceTemplate(nh3Level, humidityLevel, temperatureLevel, timeType) {
      const keys = [
        `${nh3Level}_${humidityLevel}_${temperatureLevel}_${timeType}`,
        `${nh3Level}_NORMAL_${temperatureLevel}_${timeType}`,
        `${nh3Level}_${humidityLevel}_NORMAL_${timeType}`,
        `${nh3Level}_NORMAL_NORMAL_${timeType}`,
        `${nh3Level}_NORMAL_NORMAL_DAY`,
        "LOW_NORMAL_NORMAL_DAY"
      ];
      const key = keys.find((candidate) => this.adviceTemplates[candidate]);
      return { key, text: this.adviceTemplates[key] };
    }

    resolveUrgency(nh3Level, humidityLevel, trend, tempDropRate, ammonia) {
      if (tempDropRate >= this.windowRule.maxTemperatureDrop || ammonia > 20) return "critical";
      if (ammonia > 15) return "warning";
      if (humidityLevel === "HIGH" && ammonia > 10) return "alert";
      if (nh3Level === "MEDIUM" || trend.trendWarning) return "warning";
      if (humidityLevel === "HIGH" || trend.trendLabel === "缓慢上升") return "info";
      return "normal";
    }

    decide(currentHour, temp, nh3, humidity, tempDropRate, historyNh3Array) {
      let currentHumidity = Number(humidity);
      let drop = Number(tempDropRate);
      let history = historyNh3Array;
      let previousState = this.lastState;

      // 兼容旧版 decide(hour, temp, nh3, tempDropRate, lastState) 调用。
      if (typeof tempDropRate === "object" && tempDropRate !== null && !Array.isArray(tempDropRate)) {
        previousState = tempDropRate;
        drop = Number(humidity);
        currentHumidity = 50;
        history = [];
      }

      const hour = Number(currentHour);
      const temperature = Number(temp);
      const ammonia = Number(nh3);
      if (!Number.isFinite(currentHumidity)) currentHumidity = 50;
      if (!Number.isFinite(drop)) drop = 0;

      const trend = this.analyzeTrend(history, ammonia);
      const nh3Level = this.classifyNh3(ammonia);
      const humidityLevel = this.classifyHumidity(currentHumidity);
      const temperatureLevel = this.classifyTemperature(temperature);
      const timeType = this.getTimeType(hour);
      const inWindow = timeType === "WINDOW";
      const wasVentilating = previousState && previousState.action === "ventilation";
      const advice = this.getAdviceTemplate(nh3Level, humidityLevel, temperatureLevel, timeType);
      const urgencyLevel = this.resolveUrgency(nh3Level, humidityLevel, trend, drop, ammonia);
      const urgency = URGENCY[urgencyLevel];
      const alertLevel = nh3Level === "HIGH" ? "high" : nh3Level === "MEDIUM" ? "medium" : "low";
      const trendPrefix = trend.trendWarning
        ? "预警：氨气正快速上升，建议提前清理粪污。"
        : trend.trendLabel === "缓慢上升"
          ? "提示：氨气正在缓慢上升，请提前安排清粪。"
          : "";

      const finish = (result) => {
        const enriched = Object.assign(result, {
          alertLevel,
          humanAdvice: result.humanAdvice || (trendPrefix ? `${trendPrefix}${advice.text}` : advice.text),
          urgencyLevel,
          urgencyLabel: urgency.label,
          urgencyColor: urgency.color,
          trendLabel: trend.trendLabel,
          trendWarning: trend.trendWarning,
          trendSlope: trend.slope,
          adviceKey: advice.key,
          nh3Level,
          humidityLevel,
          temperatureLevel,
          timeType,
          inWindow
        });
        this.lastState = enriched;
        return enriched;
      };

      if (drop >= this.windowRule.maxTemperatureDrop) {
        return finish({
          action: "stop",
          duration: 0,
          reason: "温度降幅超限，停止通风",
          citation: "计划书3.2节",
          ruleId: "TEMP_DROP_LIMIT",
          humanAdvice: "【紧急】温度在短时间内下降超过3℃。建议：立即停止通风，启动保温设备并观察幼畜状态。依据：计划书3.2节"
        });
      }

      // 一级警报必须优先保留，即使当前不在午间通风窗口，也要输出明确的紧急处置规则。
      if (ammonia > 20) {
        return finish({
          action: "ventilation",
          duration: 10,
          reason: "氨气浓度严重超标，立即启动最大通风并疏散幼畜。",
          citation: "NY/T 388-1999",
          ruleId: "NH3_OVER_20",
          humanAdvice: "【紧急】氨气浓度严重超标。建议：立即启动最大通风，疏散幼畜至安全区域，并立即清理粪污。依据：NY/T 388-1999"
        });
      }

      if (!inWindow) {
        return finish({
          action: "alert_only",
          duration: 0,
          reason: "非通风窗口，执行现场处置建议",
          citation: ammonia > 15 ? "NY/T 388-1999" : "计划书3.2节",
          ruleId: ammonia > 15 ? "NH3_OVER_15" : "WINDOW_LOCK"
        });
      }

      // 高湿高氨是独立的复合规则，窗口内应直接下发15分钟排湿通风指令。
      if (humidityLevel === "HIGH" && ammonia > 10) {
        return finish({
          action: "ventilation",
          duration: 15,
          reason: "高湿高氨环境，清理粪污并延长午间通风至15分钟。",
          citation: "环境监测项目基础.docx",
          ruleId: "HUMIDITY_AND_NH3"
        });
      }

      if (wasVentilating && ammonia <= this.hysteresis.stopNh3) {
        return finish({
          action: "stop",
          duration: 0,
          reason: "氨气已降至停止滞回阈值",
          citation: "计划书3.2节",
          ruleId: "NH3_HYSTERESIS_STOP"
        });
      }

      if (ammonia >= this.hysteresis.startNh3) {
        return finish({
          action: "ventilation",
          duration: ammonia >= this.profile.ammonia.levelOne ? 10 : 5,
          reason: "氨气达到启动滞回阈值",
          citation: "NY/T 388-1999",
          ruleId: "NH3_HIGH"
        });
      }

      if (wasVentilating && ammonia > this.hysteresis.stopNh3) {
        return finish({
          action: "ventilation",
          duration: 5,
          reason: "滞回区间内保持通风",
          citation: "计划书3.2节",
          ruleId: "NH3_HYSTERESIS_HOLD"
        });
      }

      return finish({
        action: "stop",
        duration: 0,
        reason: nh3Level === "MEDIUM" ? "氨气中等，执行清粪与巡检建议" : "环境处于可控区间",
        citation: nh3Level === "LOW" ? "GB/T 17824.3-2022" : "NY/T 388-1999",
        ruleId: nh3Level === "LOW" ? "NH3_NORMAL" : "NH3_LEVEL_TWO"
      });
    }
  }

  /**
   * Evaluate the five ordered expert rules for a sandbox input.
   * @param {object} input Sensor values: hour 0-24, temperature C, humidity %, ammonia ppm.
   * @returns {object} Deterministic alert level, title, rule ID and execution action.
   */
  global.decide = function decide(input) {
    const data = input || {};
    const hour = Number(data.hour ?? data.currentHour ?? 0);
    const temperature = Number(data.temperature ?? data.temp ?? 0);
    const humidity = Number(data.humidity ?? 0);
    const ammonia = Number(data.ammonia ?? data.nh3 ?? 0);
    const inWindow = hour >= 12 && hour <= 14;
    const base = { hour, temperature, humidity, ammonia, inWindow };
    if (ammonia > 20) return Object.assign(base, { level: "critical", title: "一级警报", icon: "🔴", ruleId: "NH3_OVER_20", action: "ventilation", duration: 10, reason: "氨气浓度严重超标，立即启动最大通风并疏散幼畜。" });
    if (ammonia > 15) return Object.assign(base, { level: "warning", title: "警告", icon: "🟡", ruleId: "NH3_OVER_15", action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 8 : 0, reason: "氨气浓度超标，建议在 12:00-14:00 窗口进行 5-10 分钟短时通风。" });
    if (humidity > 80 && ammonia > 10) return Object.assign(base, { level: "alert", title: "预警", icon: "🟠", ruleId: "HUMIDITY_AND_NH3", action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 15 : 0, reason: "高湿高氨环境，立即清理粪污并增加垫料更换频率。" });
    if (temperature < 0) return Object.assign(base, { level: "caution", title: "注意", icon: "🔵", ruleId: "LOW_TEMPERATURE", action: "heating", duration: 0, reason: "低温环境，增加保温灯或加厚垫料，避免冷应激。" });
    return Object.assign(base, { level: "normal", title: "正常", icon: "🟢", ruleId: "NORMAL", action: "none", duration: 0, reason: "当前圈舍环境适宜，继续保持当前管理措施。" });
  };

  global.DecisionEngine = DecisionEngine;
})(window);
