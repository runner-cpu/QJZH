(function (global) {
  "use strict";

  const SPECIES = Object.freeze({
    "犊牦牛": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: -5, comfortableMax: 10 }), // 来源：计划书3.2节
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 }) // 来源：GB/T 17824.3-2022
    }),
    "藏羔羊": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: -3, comfortableMax: 12 }), // 来源：计划书3.2节
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 }) // 来源：GB/T 17824.3-2022
    }),
    "保育仔猪": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: 18, comfortableMax: 28 }), // 来源：GB/T 17824.3-2022
      humidity: Object.freeze({ comfortableMin: 50, comfortableMax: 70 }) // 来源：GB/T 17824.3-2022
    })
  });

  const WINDOW_RULE = Object.freeze({
    startHour: 12, // 来源：计划书3.2节
    endHour: 14, // 来源：计划书3.2节
    maxTemperatureDrop: 3 // 来源：计划书3.2节
  });

  const HYSTERESIS = Object.freeze({
    startNh3: 15.5, // 来源：计划书3.2节
    stopNh3: 9.5 // 来源：计划书3.2节
  });

  global.LocalKnowledgeBase = Object.freeze({ SPECIES, WINDOW_RULE, HYSTERESIS });
})(window);
