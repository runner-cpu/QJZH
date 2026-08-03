(function (global) {
  "use strict";

  class DecisionEngine {
    constructor(species) {
      const knowledgeBase = global.LocalKnowledgeBase;
      if (!knowledgeBase) throw new Error("知识库未加载：LocalKnowledgeBase 不可用");
      this.species = knowledgeBase.SPECIES[species] ? species : "犊牦牛";
      this.profile = knowledgeBase.SPECIES[this.species];
      this.windowRule = knowledgeBase.WINDOW_RULE;
      this.hysteresis = knowledgeBase.HYSTERESIS;
    }

    decide(currentHour, temp, nh3, tempDropRate, lastState) {
      const hour = Number(currentHour);
      const ammonia = Number(nh3);
      const drop = Number(tempDropRate) || 0;
      const wasVentilating = lastState === "ventilation" || (lastState && lastState.action === "ventilation");
      const inWindow = hour >= this.windowRule.startHour && hour <= this.windowRule.endHour;
      const ammoniaLevel = ammonia >= this.profile.ammonia.levelOne
        ? "一级"
        : ammonia >= this.profile.ammonia.levelTwo
          ? "二级"
          : "正常";

      if (drop >= this.windowRule.maxTemperatureDrop) {
        return {
          action: "stop",
          duration: 0,
          reason: "温度降幅超限",
          citation: "计划书3.2节",
          ruleId: "TEMP_DROP_LIMIT",
          ammoniaLevel,
          inWindow
        };
      }

      if (!inWindow) {
        return {
          action: "alert_only",
          duration: 0,
          reason: "非通风窗口",
          citation: "计划书3.2节",
          ruleId: ammonia >= this.profile.ammonia.levelTwo ? "NH3_WINDOW_LOCK" : "WINDOW_LOCK",
          ammoniaLevel,
          inWindow
        };
      }

      if (wasVentilating && ammonia <= this.hysteresis.stopNh3) {
        return {
          action: "stop",
          duration: 0,
          reason: "氨气已降至停止滞回阈值",
          citation: "计划书3.2节",
          ruleId: "NH3_HYSTERESIS_STOP",
          ammoniaLevel,
          inWindow
        };
      }

      if (ammonia >= this.hysteresis.startNh3) {
        return {
          action: "ventilation",
          duration: ammonia >= this.profile.ammonia.levelOne ? 10 : 5,
          reason: "氨气达到启动滞回阈值",
          citation: "NY/T 388-1999",
          ruleId: "NH3_HIGH",
          ammoniaLevel,
          inWindow
        };
      }

      if (wasVentilating && ammonia > this.hysteresis.stopNh3) {
        return {
          action: "ventilation",
          duration: 5,
          reason: "滞回区间内保持通风",
          citation: "计划书3.2节",
          ruleId: "NH3_HYSTERESIS_HOLD",
          ammoniaLevel,
          inWindow
        };
      }

      return {
        action: "stop",
        duration: 0,
        reason: ammonia >= this.profile.ammonia.levelTwo ? "氨气二级预警，继续观察" : "氨气处于舒适区间",
        citation: ammonia >= this.profile.ammonia.levelTwo ? "NY/T 388-1999" : "GB/T 17824.3-2022",
        ruleId: ammonia >= this.profile.ammonia.levelTwo ? "NH3_LEVEL_TWO" : "NH3_NORMAL",
        ammoniaLevel,
        inWindow
      };
    }
  }

  global.DecisionEngine = DecisionEngine;
})(window);
