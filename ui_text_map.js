(function (global) {
  "use strict";
  const map = {
    ventilation: { zh: "建议组织通风", en: "Recommend ventilation", bo: "རླུང་འགྲོ་བའི་བསམ་འཆར" },
    suggest_ventilation: { zh: "建议组织通风", en: "Recommend ventilation", bo: "རླུང་འགྲོ་བའི་བསམ་འཆར" },
    fanRun: { zh: "短时通风", en: "Short ventilation", bo: "དུས་ཐུང་རླུང་འགྲོ" },
    heaterOn: { zh: "建议保温", en: "Recommend insulation", bo: "དྲོད་སྲུང་བསམ་འཆར" },
    normal: { zh: "正常", en: "Normal", bo: "རྒྱུན་ལྡན" },
    watch: { zh: "关注", en: "Watch", bo: "དོ་ཁུར" },
    todo: { zh: "待办", en: "To do", bo: "བྱ་དགོས" },
    emergency: { zh: "紧急", en: "Emergency", bo: "ཛ་དྲག" }
  };
  function text(key, language) {
    const item = map[key] || map.normal;
    return item[language || global.QJZH_LANGUAGE || "zh"] || item.zh;
  }
  global.UI_TEXT_MAP = Object.freeze(map);
  global.QJZH = global.QJZH || {};
  global.QJZH.text = text;
  global.QJZH.mapDisplayText = function (value, language) { return text(value, language); };
})(window);
