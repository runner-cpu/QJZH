(function (global) {
  "use strict";

  const URGENCY = Object.freeze({
    critical: Object.freeze({ label: "紧急行动", color: "#D32F2F" }),
    warning: Object.freeze({ label: "待办提醒", color: "#F57C00" }),
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
      // 面板湿度取整显示；69.5%及以上显示为70%，按高湿场景提前提醒。
      return value < 50 ? "LOW" : value < 69.5 ? "NORMAL" : "HIGH";
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

    resolveUrgency(nh3Level, humidityLevel, trend, tempDropRate) {
      if (tempDropRate >= this.windowRule.maxTemperatureDrop || nh3Level === "HIGH") return "critical";
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
      const urgencyLevel = this.resolveUrgency(nh3Level, humidityLevel, trend, drop);
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

      if (!inWindow) {
        return finish({
          action: "alert_only",
          duration: 0,
          reason: "非通风窗口，执行现场处置建议",
          citation: nh3Level === "HIGH" ? "NY/T 388-1999" : "计划书3.2节",
          ruleId: nh3Level === "HIGH" ? "NH3_WINDOW_LOCK" : "WINDOW_LOCK"
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

  global.DecisionEngine = DecisionEngine;
})(window);
