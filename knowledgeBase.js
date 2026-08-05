/**
 * Local livestock knowledge base.
 * Rules are deterministic, auditable and independent of external AI services.
 */
(function (global) {
  "use strict";

  const SPECIES = Object.freeze({
    "犊牦牛": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }),
      temperature: Object.freeze({ comfortableMin: -5, comfortableMax: 10 }),
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 })
    }),
    "藏绵羊": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }),
      temperature: Object.freeze({ comfortableMin: -3, comfortableMax: 12 }),
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 })
    }),
    "保育仔猪": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }),
      temperature: Object.freeze({ comfortableMin: 18, comfortableMax: 28 }),
      humidity: Object.freeze({ comfortableMin: 50, comfortableMax: 70 })
    })
  });

  const WINDOW_RULE = Object.freeze({ startHour: 12, endHour: 14, maxTemperatureDrop: 3 });
  const HYSTERESIS = Object.freeze({ startNh3: 15.5, stopNh3: 9.5 });

  global.LocalKnowledgeBase = Object.freeze({ SPECIES, WINDOW_RULE, HYSTERESIS });
})(window);
