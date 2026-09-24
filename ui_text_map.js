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
  var SENTENCE_MAP = [
    [/启动10分钟低速通风/g, "建议10分钟短时通风"],
    [/立即强排通风/g, "建议立即组织通风"],
    [/立即停止通风/g, "建议立即暂缓通风"],
    [/启动保温设备/g, "建议开启保温设备"],
    [/启动保温/g, "建议开启保温"],
    [/停止通风/g, "建议暂缓通风"],
    [/开启10分钟通风/g, "建议10分钟短时通风"],
    [/延长通风至12分钟/g, "建议延长通风至12分钟"],
    [/加强通风/g, "建议加强通风"],
    [/强排/g, "组织通风"]
  ];
  global.QJZH.mapAdvice = function (value) {
    var result = String(value || "");
    result = result.replace(/\[紧急\]|【紧急】/g, "【建议】")
      .replace(/\[待办\]|【待办】/g, "【待办】")
      .replace(/\[关注\]|【关注】/g, "【关注】")
      .replace(/\[常规状态\]|【常规状态】/g, "【常规】");
    SENTENCE_MAP.forEach(function (pair) { result = result.replace(pair[0], pair[1]); });
    return result;
  };
})(window);
