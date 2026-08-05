/**
 * Deterministic local decision engine for livestock-house ventilation.
 * @returns {object} Auditable execution decision with rule ID and citation.
 */
(function (global) {
  "use strict";

  class DecisionEngine {
    /** @param {string} species Livestock profile name. */
    constructor(species) {
      const knowledgeBase = global.LocalKnowledgeBase;
      if (!knowledgeBase) throw new Error("LocalKnowledgeBase is unavailable");
      this.species = knowledgeBase.SPECIES[species] ? species : "犊牦牛";
      this.profile = knowledgeBase.SPECIES[this.species];
      this.windowRule = knowledgeBase.WINDOW_RULE;
      this.hysteresis = knowledgeBase.HYSTERESIS;
    }

    /**
     * Apply emergency, warning, compound, low-temperature and safety rules.
     * @param {number} currentHour Hour 0-24.
     * @param {number} temp Temperature in C.
     * @param {number} nh3 NH3 in ppm.
     * @param {number} tempDropRate Temperature drop in C.
     * @param {object|string} lastState Prior action for hysteresis.
     * @param {number} humidity Relative humidity in percent.
     * @returns {object} Deterministic execution decision.
     */
    decide(currentHour, temp, nh3, tempDropRate, lastState, humidity) {
      const hour = Number(currentHour);
      const temperature = Number(temp);
      const ammonia = Number(nh3);
      const drop = Number(tempDropRate) || 0;
      const relativeHumidity = Number(humidity) || 0;
      const wasVentilating = lastState === "ventilation" || (lastState && lastState.action === "ventilation");
      const inWindow = hour >= this.windowRule.startHour && hour <= this.windowRule.endHour;
      const ammoniaLevel = ammonia >= 15 ? "一级" : ammonia >= 10 ? "二级" : "正常";

      if (ammonia > 20) {
        return { action: "ventilation", duration: 10, reason: "氨气浓度严重超标，立即启动最大通风并疏散幼畜。", citation: "NY/T 388-1999", ruleId: "NH3_OVER_20", ammoniaLevel: "一级", inWindow };
      }
      if (ammonia > 15) {
        return { action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 8 : 0, reason: "氨气浓度超标，建议在 12:00-14:00 窗口进行 5-10 分钟短时通风。", citation: "NY/T 388-1999", ruleId: "NH3_OVER_15", ammoniaLevel: "二级", inWindow };
      }
      if (relativeHumidity > 80 && ammonia > 10) {
        return { action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 15 : 0, reason: "高湿高氨环境，立即清理粪污并增加垫料更换频率。", citation: "环境监测项目基础 L102", ruleId: "HUMIDITY_AND_NH3", ammoniaLevel: "复合预警", inWindow };
      }
      if (temperature < 0) {
        return { action: "stop", duration: 0, reason: "低温环境，增加保温灯或加厚垫料，避免冷应激。", citation: "项目计划书 L110", ruleId: "LOW_TEMPERATURE", ammoniaLevel, inWindow };
      }
      if (drop >= this.windowRule.maxTemperatureDrop) {
        return { action: "stop", duration: 0, reason: "温度降幅超限", citation: "计划书3.2节", ruleId: "TEMP_DROP_LIMIT", ammoniaLevel, inWindow };
      }
      if (!inWindow) {
        return { action: "alert_only", duration: 0, reason: "非通风窗口", citation: "计划书3.2节", ruleId: ammonia >= 10 ? "NH3_WINDOW_LOCK" : "WINDOW_LOCK", ammoniaLevel, inWindow };
      }
      if (wasVentilating && ammonia <= this.hysteresis.stopNh3) {
        return { action: "stop", duration: 0, reason: "氨气已降至停止滞回阈值", citation: "计划书3.2节", ruleId: "NH3_HYSTERESIS_STOP", ammoniaLevel, inWindow };
      }
      if (ammonia >= this.hysteresis.startNh3) {
        return { action: "ventilation", duration: ammonia >= 15 ? 10 : 5, reason: "氨气达到启动滞回阈值", citation: "NY/T 388-1999", ruleId: "NH3_HIGH", ammoniaLevel, inWindow };
      }
      if (wasVentilating && ammonia > this.hysteresis.stopNh3) {
        return { action: "ventilation", duration: 5, reason: "滞回区间内保持通风", citation: "计划书3.2节", ruleId: "NH3_HYSTERESIS_HOLD", ammoniaLevel, inWindow };
      }
      return { action: "stop", duration: 0, reason: ammonia >= 10 ? "氨气二级预警，继续观察" : "氨气处于舒适区间", citation: ammonia >= 10 ? "NY/T 388-1999" : "GB/T 17824.3-2022", ruleId: ammonia >= 10 ? "NH3_LEVEL_TWO" : "NH3_NORMAL", ammoniaLevel, inWindow };
    }
  }

  global.DecisionEngine = DecisionEngine;

  /** Evaluate the five ordered expert rules for a sandbox input. @param {object} input Sensor values. @returns {object} Alert level and execution decision. */
  global.decide = function decide(input) {
    const data = input || {};
    const hour = Number(data.hour ?? data.currentHour ?? 0);
    const temperature = Number(data.temperature ?? data.temp ?? 0);
    const humidity = Number(data.humidity ?? 0);
    const ammonia = Number(data.ammonia ?? data.nh3 ?? 0);
    const tempDropRate = Number(data.tempDropRate ?? data.tempDrop ?? 0);
    const inWindow = hour >= 12 && hour <= 14;
    const base = { hour, temperature, humidity, ammonia, tempDropRate, inWindow };
    if (ammonia > 20) return Object.assign(base, { level: "critical", title: "一级警报", icon: "🔴", ruleId: "NH3_OVER_20", action: "ventilation", duration: 10, reason: "氨气浓度严重超标，立即启动最大通风并疏散幼畜。" });
    if (ammonia > 15) return Object.assign(base, { level: "warning", title: "警告", icon: "🟡", ruleId: "NH3_OVER_15", action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 8 : 0, reason: "氨气浓度超标，建议在 12:00-14:00 窗口进行 5-10 分钟短时通风。" });
    if (humidity > 80 && ammonia > 10) return Object.assign(base, { level: "alert", title: "预警", icon: "🟠", ruleId: "HUMIDITY_AND_NH3", action: inWindow ? "ventilation" : "alert_only", duration: inWindow ? 15 : 0, reason: "高湿高氨环境，立即清理粪污并增加垫料更换频率。" });
    if (temperature < 0) return Object.assign(base, { level: "caution", title: "注意", icon: "🔵", ruleId: "LOW_TEMPERATURE", action: "heating", duration: 0, reason: "低温环境，增加保温灯或加厚垫料，避免冷应激。" });
    return Object.assign(base, { level: "normal", title: "正常", icon: "🟢", ruleId: "NORMAL", action: "none", duration: 0, reason: "当前圈舍环境适宜，继续保持当前管理措施。" });
  };
})(window);
