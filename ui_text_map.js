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
  Object.assign(map, {
    "qjzh.data.previewTitle": { zh: "导入预览", en: "Import preview", bo: "ནང་འདྲེན་སྔོན་ལྟ།" },
    "qjzh.report.dataChanged": { zh: "数据已更新，请重新生成报告。", en: "Data changed. Generate a new report.", bo: "གཞི་གྲངས་གསར་བསྒྱུར། སྙན་ཞུ་བསྐྱར་བཟོ་བྱོས།" },
    "qjzh.data.previewNote": { zh: "先核对前 20 条有效记录与错误详情；确认后合并有效行，相同站点与时刻以新值替换。", en: "Review the first 20 valid rows and validation details. Confirm to merge valid rows; matching site and time entries are replaced.", bo: "ཐོ་འགོད་20 དང་ནོར་འཁྲུལ་ཞིབ་བཤེར་བྱོས། ངོས་ལེན་རྗེས་གཞི་གྲངས་མཉམ་སྡེབ་བྱེད།" },
    "qjzh.data.confirmImport": { zh: "确认导入有效记录", en: "Import valid records", bo: "གཞི་གྲངས་ནང་འདྲེན་ངོས་ལེན།" },
    "qjzh.data.cancelImport": { zh: "取消导入", en: "Cancel import", bo: "ནང་འདྲེན་མཚམས་འཇོག" },
    "qjzh.data.previewCounts": { zh: "有效 {accepted} · 拒绝 {rejected} · 警告 {warnings}", en: "Valid {accepted} · rejected {rejected} · warnings {warnings}", bo: "ཚད་ལྡན {accepted} · དང་ལེན་མི་བྱེད {rejected} · ཉེན་བརྡ {warnings}" },
    "qjzh.data.previewReady": { zh: "预检完成，确认后导入 {count} 条有效记录；拒绝 {rejected} 条。", en: "Review complete: confirm to import {count} valid records; {rejected} rejected.", bo: "ཞིབ་བཤེར་ཚར། ངོས་ལེན་རྗེས་ཐོ་འགོད {count} ནང་འདྲེན། དང་ལེན་མི་བྱེད {rejected}།" },
    "qjzh.data.rejected": { zh: "没有可导入的有效记录，请查看校验详情。", en: "No valid records to import. Review the validation details.", bo: "ནང་འདྲེན་བྱ་རྒྱུའི་ཚད་ལྡན་གཞི་གྲངས་མེད། ཞིབ་བཤེར་གྱི་ཞིབ་ཆ་ལ་གཟིགས།" },
    "qjzh.data.importSummary": { zh: "已处理 {count} 条有效记录，拒绝 {rejected} 条；当前共 {total} 条。", en: "Processed {count} valid records; {rejected} rejected. {total} records now stored.", bo: "ཚད་ལྡན་ཐོ་འགོད {count} ལས་སྣོན་བྱས། དང་ལེན་མི་བྱེད {rejected}། ད་ལྟ་བསྡོམས {total}།" },
    "qjzh.data.importCancelled": { zh: "已取消导入，原有数据保留。", en: "Import cancelled. Existing records are preserved.", bo: "ནང་འདྲེན་མཚམས་བཞག སྔོན་གྱི་གཞི་གྲངས་ཉར་ཡོད།" },
    "qjzh.data.confirmSample": { zh: "加载示例将替换全部本地记录。请先导出需要保留的数据，确认继续？", en: "Loading the sample replaces all local records. Export anything you need to keep first. Continue?", bo: "དཔེ་སྟོན་གྱིས་ས་གནས་གཞི་གྲངས་ཚང་མ་བརྗེ་བ། ཉར་དགོས་པ་སྔོན་དུ་ཕྱིར་འདྲེན་བྱོས། མུ་མཐུད་དམ།" },
    "qjzh.data.manualRejected": { zh: "未保存：{reason}", en: "Not saved: {reason}", bo: "ཉར་མ་ཐུབ། {reason}" },
    "qjzh.data.detailsTitle": { zh: "校验详情（最多展示 20 条）", en: "Validation details (first 20)", bo: "ཞིབ་བཤེར་ཞིབ་ཆ། (20)" },
    "qjzh.data.rowIssue": { zh: "第 {row} 条：{reason}", en: "Record {row}: {reason}", bo: "ཐོ་འགོད {row}། {reason}" },
    "qjzh.data.ignoredFields": { zh: "以下列不参与保存或计算：{fields}", en: "These columns are excluded from storage and calculations: {fields}", bo: "ཀ་ཐིག་འདི་དག་ཉར་ཚགས་དང་རྩིས་རྒྱག་ནང་མི་འཇུག {fields}" },
    "qjzh.data.fileType": { zh: "请选择 .csv 文件", en: "Select a .csv file", bo: ".csv ཡིག་ཆ་འདེམས།" },
    "qjzh.storage.local": { zh: "保存在当前浏览器，刷新后保留", en: "Saved in this browser; retained after reload", bo: "བལྟ་མཛོད་ནང་ཉར། བསྐྱར་སྣོན་རྗེས་ཉར་ཡོད།" },
    "qjzh.storage.summary": { zh: "{count} / 5000 条本地记录 · {mode} · 不上传", en: "{count} / 5000 local records · {mode} · no upload", bo: "ས་གནས་ཐོ་འགོད {count} / 5000 · {mode} · ཡར་སྤྲོད་མེད།" },
    "qjzh.storage.damaged": { zh: " · {count} 个存储项损坏，已跳过", en: " · {count} damaged storage entries skipped", bo: " · ཉར་ཚགས {count} སྐྱོན་ཅན་བརྒལ་ཟིན།" },
    "qjzh.storage.capacity": { zh: "保存后将超过 5000 条记录限制，请先导出并清理旧数据。", en: "Saving would exceed 5000 records. Export and clear old data first.", bo: "ཉར་ཚགས་ཐོ་འགོད་5000 ལས་བརྒལ། སྔོན་གྱི་གཞི་གྲངས་ཕྱིར་འདྲེན་དང་གཙང་སེལ་བྱོས།" },
    "qjzh.storage.recovery": { zh: "存储失败且恢复未完成，请导出现有记录后检查浏览器存储。", en: "Storage failed and recovery is incomplete. Export available records and check browser storage.", bo: "ཉར་ཚགས་དང་སླར་གསོ་མ་ཐུབ། གཞི་གྲངས་ཕྱིར་འདྲེན་རྗེས་ཉར་ཚགས་ཞིབ་བཤེར་བྱོས།" },
    "qjzh.validation.csvQuotes": { zh: "CSV 引号不完整或位置不合法", en: "CSV quotes are unclosed or misplaced", bo: "CSV འདྲེན་རྟགས་མ་ཚང་བའམ་ས་གནས་ནོར།" },
    "qjzh.validation.csvColumns": { zh: "数据行列数与表头不一致", en: "Row column count does not match the header", bo: "གཞི་གྲངས་ཀྱི་ཀ་ཐིག་གྲངས་དང་མགོ་མི་མཐུན།" },
    "qjzh.validation.csvNoRows": { zh: "CSV 只有表头，没有数据行", en: "CSV contains a header but no records", bo: "CSV ནང་མགོ་ཁོ་ན་ཡོད། གཞི་གྲངས་མེད།" },
    "qjzh.validation.csvReservedHeader": { zh: "CSV 包含保留字段名", en: "CSV contains a reserved column name", bo: "CSV ནང་བཀག་རྒྱ་ཅན་གྱི་ཀ་ཐིག་མིང་ཡོད།" },
    "qjzh.validation.fieldLength": { zh: "{field} 超过 256 字符限制", en: "{field} exceeds 256 characters", bo: "{field} ཡིག་རྟགས་256 ལས་བརྒལ།" },
    "qjzh.validation.metadata": { zh: "{field} 必须为非负数，age_days 必须为整数", en: "{field} must be non-negative; age_days must be an integer", bo: "{field} མོ་གྲངས་མི་རུང་། age_days ཧྲིལ་གྲངས་དགོས།" },
    "qjzh.data.fileTooLarge": { zh: "文件超过大小限制", en: "File exceeds the size limit", bo: "ཡིག་ཆའི་ཆེ་ཆུང་ཚད་ལས་བརྒལ།" },
    "qjzh.data.readError": { zh: "文件读取失败，请重试", en: "File read failed; try again", bo: "ཡིག་ཆ་ཀློག་མ་ཐུབ།" },
    "qjzh.data.readCancelled": { zh: "已取消文件读取", en: "File read cancelled", bo: "ཡིག་ཆ་ཀློག་པ་མཚམས་བཞག" },
    "qjzh.data.exported": { zh: "已导出 {count} 条本地记录", en: "Exported {count} local records", bo: "ས་གནས་ཟིན་ཐོ {count} ཕྱིར་འདྲེན་བྱས།" },
    "qjzh.data.exportError": { zh: "导出失败，请重试", en: "Export failed; try again", bo: "ཕྱིར་འདྲེན་མ་ཐུབ།" },
    "qjzh.storage.rollback": { zh: "存储失败，已恢复原有数据", en: "Storage failed; previous data was restored", bo: "ཉར་ཚགས་ཕམ། སྔོན་གྱི་གཞི་གྲངས་སླར་གསོ་བྱས།" },
    "qjzh.storage.sessionWarning": { zh: "数据仅保留在当前浏览器会话", en: "Data will remain only for this browser session", bo: "གཞི་གྲངས་ད་ལྟའི་བལྟ་མཛོད་ནང་ཁོ་ནར་ཉར།" },
    "qjzh.storage.memoryWarning": { zh: "存储不可用，数据仅保留在当前页面", en: "Storage is unavailable; data remains only in this page", bo: "ཉར་ཚགས་མི་སྤྱོད་པས་ཤོག་ངོས་ཁོ་ནར་ཉར།" },
    "qjzh.report.retry": { zh: "重试", en: "Retry", bo: "ཡང་བསྐྱར་ཚོད་ལྟ།" },
    "qjzh.status.empty": { zh: "尚未接入数据，请上传 CSV 或手动录入", en: "No data connected; upload a CSV or enter data manually", bo: "གཞི་གྲངས་མ་སྦྲེལ། CSV ཡར་སྤྲོད་དམ་ལག་འབྲེལ་ཐོ་འགོད་བྱོས།" },
    "qjzh.status.loading": { zh: "正在加载数据…", en: "Loading data…", bo: "གཞི་གྲངས་འཇུག་བཞིན་པ།" },
    "qjzh.status.error": { zh: "数据加载失败", en: "Data loading failed", bo: "གཞི་གྲངས་འཇུག་མ་ཐུབ།" },
    "qjzh.status.warning": { zh: "数据存在警告", en: "Data needs attention", bo: "གཞི་གྲངས་ལ་ཉེན་བརྡ་ཡོད།" }
  });
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
