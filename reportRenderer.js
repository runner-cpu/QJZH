/* Localized, accessible report renderer with print-stable HTML/CSS charts. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var COPY = {
    zh: {
      title: "青境智衡环境报告", heading: "季度环境报告", eyebrow: "PLATEAU BARN ENVIRONMENT BRIEF",
      watermark: "演示数据 · 不作为法定检测或动物诊疗依据", range: "统计范围", to: "至", empty: "所选范围内无记录",
      metric: "指标", result: "结果", compliance: "项目舒适区占比（NH₃ < 10 ppm）", ammonia: "平均 / 最高氨气",
      temperature: "温度范围", advice: "建议次数", risk: "风险分布", source: "数据来源",
      generated: "生成时间", opened: "报告已生成，正在打开打印窗口。", print: "打印 / 另存 PDF",
      samples: "样本 / 站点", provenance: "来源构成", versions: "发布 / 部署 / 模型 / 规则版本", timezone: "统计时区", quality: "范围外 / 拒绝记录",
      popupBlocked: "浏览器阻止了打印窗口，已在当前页面显示完整预览。", retry: "再次打开打印窗口", previewTitle: "环境报告预览", snapshot: "机构演示快照（记录无时间戳）",
      normal: "正常", watch: "关注", todo: "待办", urgent: "紧急", local: "QJZH 本地记录",
      institution: "机构模拟圈舍", trend: "氨气趋势", trendAria: "最近十二个采样点的校准氨气趋势图",
      institutionTrend: "圈舍 NH₃ 对比", institutionTrendAria: "机构视图各圈舍校准氨气横向对比图", institutionSeries: "共 {count} 个圈舍",
      riskChart: "风险分布", riskAria: "按正常、关注、待办和紧急分类的风险分布图",
      threshold: "15 ppm 关注区上界", latest: "最近 12 个校准点", records: "条记录", noTrend: "暂无可绘制的趋势数据"
    },
    en: {
      title: "Qingjing Zhiheng Environment Report", heading: "Quarterly Environment Report", eyebrow: "PLATEAU BARN ENVIRONMENT BRIEF",
      watermark: "DEMO DATA · NOT A STATUTORY MEASUREMENT OR ANIMAL DIAGNOSIS", range: "Date range", to: "to", empty: "No records in the selected range",
      metric: "Metric", result: "Result", compliance: "Project comfort-zone share (NH₃ < 10 ppm)", ammonia: "Average / peak ammonia",
      temperature: "Temperature range", advice: "Recommendations", risk: "Risk distribution", source: "Data source",
      generated: "Generated", opened: "Report generated. Opening the print window.", print: "Print / Save as PDF",
      samples: "Samples / sites", provenance: "Source mix", versions: "Release / deployment / model / rule versions", timezone: "Reporting timezone", quality: "Out-of-domain / rejected",
      popupBlocked: "The browser blocked the print window. A complete preview is shown on this page.", retry: "Open print window again", previewTitle: "Environment report preview", snapshot: "Institution demo snapshot (records have no timestamps)",
      normal: "Normal", watch: "Watch", todo: "To-do", urgent: "Urgent", local: "QJZH local records",
      institution: "Institution demo barns", trend: "NH₃ trend", trendAria: "Calibrated ammonia trend for the latest twelve samples",
      institutionTrend: "Barn NH₃ comparison", institutionTrendAria: "Calibrated ammonia comparison across institution barns", institutionSeries: "{count} barns",
      riskChart: "Risk distribution", riskAria: "Risk distribution across normal, watch, to-do and urgent levels",
      threshold: "15 ppm watch-zone upper bound", latest: "Latest 12 calibrated points", records: "records", noTrend: "No trend data available"
    },
    bo: {
      title: "མཐོ་སྒང་ཁོར་ཡུག་སྙན་ཞུ", heading: "དུས་ཚིགས་ཁོར་ཡུག་སྙན་ཞུ", eyebrow: "མཐོ་སྒང་ཕྱུགས་ཁང་ཁོར་ཡུག་སྙན་ཞུ",
      watermark: "དཔེ་སྟོན་གཞི་གྲངས · ཁྲིམས་མཐུན་ཚད་འཇལ་དང་སྨན་བཅོས་གཞི་འཛིན་མིན", range: "བསྡོམས་རྩིས་དུས་ཡུན", to: "ནས", empty: "བདམས་པའི་ཁྱབ་ཁོངས་སུ་ཟིན་ཐོ་མེད",
      metric: "ཚད་གཞི", result: "འབྲས་བུ", compliance: "ལས་གཞིའི་བདེ་འཇགས་ཁུལ་གྱི་བསྡུར་ཚད (NH₃ < 10 ppm)", ammonia: "ཆ་སྙོམས / མཐོ་ཤོས་ཨམ་མོ་ནི་ཡ",
      temperature: "དྲོད་ཚད་ཁྱབ་ཁོངས", advice: "བསམ་འཆར་གྲངས", risk: "ཉེན་ཁའི་ཁྱབ་ཚུལ", source: "གཞི་གྲངས་ཁུངས",
      generated: "བཟོས་པའི་དུས་ཚོད", opened: "སྙན་ཞུ་བཟོས་ཟིན། པར་འདེབས་སྒེའུ་ཁུང་ཁ་ཕྱེ་བཞིན།", print: "པར་འདེབས / PDF ཉར",
      samples: "དཔེ་ཚད / ས་ཚིགས", provenance: "ཁུངས་ཀྱི་བསྡུས་ཚད", versions: "གསར་སྤེལ / བཀོད་འཇོག / མ་དཔེ / སྒྲིག་གཞིའི་པར་གཞི", timezone: "བསྡོམས་རྩིས་དུས་ཁུལ", quality: "སྤྱོད་ཁོངས་ཕྱི / དང་ལེན་མ་བྱས",
      popupBlocked: "བཤར་ཆས་ཀྱིས་པར་འདེབས་སྒེའུ་ཁུང་བཀག ཤོག་ངོས་འདིར་སྙན་ཞུ་ཆ་ཚང་སྟོན།", retry: "པར་འདེབས་སྒེའུ་ཁུང་ཡང་བསྐྱར་ཁ་ཕྱེ", previewTitle: "ཁོར་ཡུག་སྙན་ཞུའི་སྔོན་ལྟ", snapshot: "སྒྲིག་འཛུགས་དཔེ་སྟོན་མྱུར་བཀོད (དུས་ཚོད་མེད)",
      normal: "རྒྱུན་ལྡན", watch: "དོ་སྣང", todo: "བྱ་དགོས", urgent: "ཛ་དྲག", local: "QJZH ས་གནས་ཟིན་ཐོ",
      institution: "སྒྲིག་འཛུགས་དཔེ་སྟོན་ཕྱུགས་ཁང", trend: "NH₃ འཕེལ་ཕྱོགས", trendAria: "ཉེ་བའི་དཔེ་ཚད་ 12 ཀྱི་ཁ་གསབ་ཨམ་མོ་ནི་ཡ་འཕེལ་ཕྱོགས",
      institutionTrend: "ཕྱུགས་ཁང་གི NH₃ བསྡུར་བ", institutionTrendAria: "སྒྲིག་འཛུགས་ཀྱི་ཕྱུགས་ཁང་ཁག་གི་ཁ་གསབ་ཨམ་མོ་ནི་ཡ་བསྡུར་བའི་རི་མོ", institutionSeries: "ཕྱུགས་ཁང་ {count}",
      riskChart: "ཉེན་ཁའི་ཁྱབ་ཚུལ", riskAria: "ཉེན་ཁའི་རིམ་པ་བཞིའི་ཁྱབ་ཚུལ",
      threshold: "15 ppm ཉེན་ཁའི་ཚད", latest: "ཉེ་བའི་ཁ་གསབ་གནས་ཚད་ 12", records: "ཟིན་ཐོ", noTrend: "འཕེལ་ཕྱོགས་གཞི་གྲངས་མེད"
    }
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"'=]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "=": "&#61;" }[character];
    });
  }

  function language(data) {
    var value = data && data.language || root.document && root.document.documentElement && root.document.documentElement.dataset.language || "zh";
    return COPY[value] ? value : "zh";
  }

  function sourceLabel(source, copy) {
    if (source === "QJZH 本地记录") return copy.local;
    if (source === "机构模拟圈舍") return copy.institution;
    if (source === "机构演示快照") return copy.snapshot;
    return source;
  }

  function provenanceLabel(provenance) {
    if (!provenance || typeof provenance !== "object") return "-";
    var labels = { "user-import": "user import", "manual-entry": "manual entry", sample: "sample", "legacy-local": "legacy local", "institution-records": "institution records", "institution-snapshot": "institution snapshot" };
    var parts = Object.keys(provenance).map(function (key) { return (labels[key] || key) + " " + Number(provenance[key] || 0); });
    return parts.length ? parts.join(" · ") : "-";
  }

  function riskLabel(key, copy) {
    return { "正常": copy.normal, "关注": copy.watch, "待办": copy.todo, "紧急": copy.urgent }[key] || key;
  }

  function riskFor(value) {
    var fallback = Number(value) > 15 ? "紧急" : Number(value) >= 10 ? "关注" : "正常";
    if (q.riskPolicy && q.riskPolicy.classifyNh3) {
      var policy = q.riskPolicy.classifyNh3(value) || {};
      var label = String(policy.label || "");
      if (["正常", "关注", "待办", "紧急"].indexOf(label) >= 0) return label;
    }
    return fallback;
  }

  function toneFor(value) {
    // Keep CSS values closed over a reviewed palette. Policy labels/colors are
    // descriptive data and must never become a style string in report HTML.
    return Number(value) > 15 ? "#d94f5c" : Number(value) >= 10 ? "#d6a93d" : "#159b7d";
  }

  function pointLabel(point, index, showDate) {
    if (point.label) return String(point.label);
    var date = new Date(point.timestamp || "");
    if (!isFinite(date.getTime())) return String(index + 1);
    var stamp = String(point.timestamp || "");
    return showDate || !/T/.test(stamp) ? stamp.slice(5, 10) : stamp.slice(11, 16);
  }

  function localDate(date) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).reduce(function (result, part) { result[part.type] = part.value; return result; }, {});
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function buildTrendChart(data, copy) {
    var institutionMode = data.seriesMode === "institution";
    var chartName = institutionMode ? "nh3-comparison" : "nh3-trend";
    var chartTitle = institutionMode ? copy.institutionTrend : copy.trend;
    var chartAria = institutionMode ? copy.institutionTrendAria : copy.trendAria;
    var points = Array.isArray(data.trendSeries) ? data.trendSeries.filter(function (point) {
      return point && isFinite(Number(point.value));
    }).slice(-12) : [];
    if (!points.length) {
      return "<section class='chart-card report-section' data-chart='" + chartName + "' aria-label='" + esc(chartAria) + "'><div class='section-heading'><div><span class='section-index'>02</span><h2>" + esc(chartTitle) + "</h2></div></div><p class='empty compact'>" + esc(copy.noTrend) + "</p></section>";
    }
    var peak = points.reduce(function (max, point) { return Math.max(max, Number(point.value)); }, 0);
    var maxScale = Math.max(30, Math.ceil(peak / 5) * 5);
    var thresholdPosition = Math.min(100, 15 / maxScale * 100);
    var pointTimes = points.map(function (point) { return new Date(point.timestamp || "").getTime(); }).filter(isFinite);
    var showDate = pointTimes.length > 1 && Math.max.apply(Math, pointTimes) - Math.min.apply(Math, pointTimes) >= 86400000;
    var bars = points.map(function (point, index) {
      var value = Number(point.value);
      var height = Math.max(3, Math.min(100, value / maxScale * 100));
      var label = pointLabel(point, index, showDate);
      return "<div class='trend-column' title='" + esc(label + " · " + value.toFixed(1) + " ppm") + "'><span class='bar-value'>" + esc(value.toFixed(1)) + "</span><div class='bar-slot'><i class='bar' style='height:" + height.toFixed(2) + "%;background:" + toneFor(value) + "'></i></div><span class='bar-label'>" + esc(label) + "</span></div>";
    }).join("");
    var chartNote = institutionMode ? copy.institutionSeries.replace("{count}", points.length) : copy.latest;
    return "<section class='chart-card report-section' data-chart='" + chartName + "' aria-label='" + esc(chartAria) + "'><div class='section-heading'><div><span class='section-index'>02</span><h2>" + esc(chartTitle) + "</h2></div><span class='section-note'>" + esc(chartNote) + "</span></div><div class='trend-plot'><div class='threshold-line' style='bottom:" + thresholdPosition.toFixed(2) + "%'><span>" + esc(copy.threshold) + "</span></div><div class='trend-bars' style='--points:" + points.length + "'>" + bars + "</div></div><div class='axis-note'><span>0 ppm</span><span>" + esc(maxScale) + " ppm</span></div></section>";
  }

  function buildRiskChart(data, copy) {
    var distribution = data.riskDistribution || {};
    var keys = ["正常", "关注", "待办", "紧急"];
    var total = keys.reduce(function (sum, key) { return sum + Number(distribution[key] || 0); }, 0);
    var palette = { "正常": "#159b7d", "关注": "#d6a93d", "待办": "#f08c46", "紧急": "#d94f5c" };
    var rows = keys.map(function (key) {
      var count = Number(distribution[key] || 0);
      var percent = total ? count / total * 100 : 0;
      return "<div class='risk-row'><span class='risk-name'><i style='background:" + palette[key] + "'></i>" + esc(riskLabel(key, copy)) + "</span><div class='risk-track'><i style='width:" + percent.toFixed(2) + "%;background:" + palette[key] + "'></i></div><strong>" + esc(count) + "</strong><small>" + percent.toFixed(0) + "%</small></div>";
    }).join("");
    return "<section class='chart-card report-section' data-chart='risk-distribution' aria-label='" + esc(copy.riskAria) + "'><div class='section-heading'><div><span class='section-index'>01</span><h2>" + esc(copy.riskChart) + "</h2></div><span class='section-note'>" + esc(total + " " + copy.records) + "</span></div><div class='risk-chart'>" + rows + "</div></section>";
  }

  function buildMetricTable(data, copy) {
    var distribution = data.riskDistribution || {};
    if (data.noRecords) return "<p class='empty'>" + esc(copy.empty) + "</p>";
    var versionSummary = [
      data.releaseVersion,
      data.deploymentVersion,
      data.modelVersion,
      data.ruleVersion
    ].filter(function (value) { return value != null && String(value).trim() !== ""; }).join(" · ");
    return "<table><thead><tr><th>" + esc(copy.metric) + "</th><th>" + esc(copy.result) + "</th></tr></thead><tbody>" +
      "<tr><td>" + esc(copy.compliance) + "</td><td><strong>" + (Number(data.comfortRate != null ? data.comfortRate : data.complianceRate || 0) * 100).toFixed(1) + "%</strong></td></tr>" +
      "<tr><td>" + esc(copy.ammonia) + "</td><td><strong>" + Number(data.averageNh3 || 0).toFixed(1) + " / " + Number(data.maxNh3 || 0).toFixed(1) + " ppm</strong></td></tr>" +
      "<tr><td>" + esc(copy.temperature) + "</td><td>" + (data.temperatureRange && data.temperatureRange.min != null ? esc(data.temperatureRange.min) + "–" + esc(data.temperatureRange.max) + " ℃" : "-") + "</td></tr>" +
      "<tr><td>" + esc(copy.advice) + "</td><td>" + esc(data.adviceCount || 0) + "</td></tr>" +
      "<tr><td>" + esc(copy.samples) + "</td><td>" + esc(data.sampleCount == null ? "-" : data.sampleCount) + " / " + esc(data.siteCount == null ? "-" : data.siteCount) + "</td></tr>" +
      "<tr><td>" + esc(copy.provenance) + "</td><td>" + esc(provenanceLabel(data.provenance)) + "</td></tr>" +
      "<tr><td>" + esc(copy.versions) + "</td><td>" + esc(versionSummary || "-") + "</td></tr>" +
      "<tr><td>" + esc(copy.timezone) + "</td><td>" + esc(data.timezone || "-") + "</td></tr>" +
      "<tr><td>" + esc(copy.quality) + "</td><td>" + esc(data.outOfDomainCount || 0) + " / " + esc(data.rejectedCount || 0) + "</td></tr>" +
      "<tr><td>" + esc(copy.risk) + "</td><td>" + Object.keys(distribution).map(function (key) { return esc(riskLabel(key, copy)) + ": " + esc(distribution[key]); }).join(" · ") + "</td></tr>" +
      "</tbody></table>";
  }

  function buildHtml(data) {
    data = data || {};
    var lang = language(data), copy = COPY[lang];
    var styles = "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{max-width:900px;margin:0 auto;padding:42px 48px 52px;background:#f3f7f7;color:#17232d;font:14px/1.55 Inter,system-ui,-apple-system,'Noto Sans Tibetan',sans-serif}.report{overflow:hidden;border:1px solid #cfdddc;border-radius:18px;background:#fff;box-shadow:0 18px 54px rgba(20,54,61,.12)}.report-header{position:relative;padding:30px 34px 26px;background:linear-gradient(135deg,#083b38 0%,#0d6055 70%,#12866e 100%);color:#fff}.report-header:after{position:absolute;right:-36px;bottom:-64px;width:190px;height:190px;border:28px solid rgba(255,255,255,.065);border-radius:50%;content:''}.eyebrow{display:block;margin-bottom:8px;color:#8ff1dd;font:700 10px/1.3 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em}.report-header h1{position:relative;z-index:1;margin:0;font-size:29px;line-height:1.25;letter-spacing:-.02em}.report-meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-top:17px}.meta-chip{padding:6px 9px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.09);font-size:11px}.watermark{padding:8px 14px;border-bottom:1px solid #ead79b;background:#fff7db;color:#7b5000;text-align:center;font-size:11px;font-weight:800;letter-spacing:.08em}.report-body{padding:28px 34px 32px}.metrics{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:18px;align-items:start}.report-section,.chart-card,table{break-inside:avoid;page-break-inside:avoid}.metric-card,.chart-card{border:1px solid #d9e4e3;border-radius:12px;background:#fff}.metric-card{overflow:hidden}.metric-card table{font-size:13px}.metric-card td:first-child{width:46%;white-space:nowrap}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid #e3e9e9;text-align:left;vertical-align:top}th{background:#edf7f4;color:#38605a;font-size:11px;letter-spacing:.07em;text-transform:uppercase}tr:last-child td{border-bottom:0}td:last-child{font-variant-numeric:tabular-nums}.chart-card{margin-top:18px;padding:18px 20px}.metrics .chart-card{margin-top:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:15px}.section-heading>div{display:flex;align-items:center;gap:9px}.section-heading h2{margin:0;color:#153b37;font-size:16px}.section-index{display:inline-grid;width:25px;height:25px;place-items:center;border-radius:7px;background:#e3f5ef;color:#08735f;font:800 10px/1 ui-monospace,SFMono-Regular,monospace}.section-note{color:#718380;font-size:10px}.trend-plot{position:relative;height:184px;padding-top:20px;border-bottom:1px solid #bed0ce;background-image:linear-gradient(to top,#edf1f1 1px,transparent 1px);background-size:100% 40px}.trend-bars{position:absolute;inset:20px 7px 0;display:grid;grid-template-columns:repeat(var(--points),minmax(0,1fr));gap:5px;align-items:end}.trend-column{display:grid;height:100%;grid-template-rows:18px minmax(0,1fr) 22px;gap:3px;align-items:end;min-width:0}.bar-slot{display:flex;height:100%;align-items:flex-end;justify-content:center}.bar{display:block;width:min(72%,28px);min-height:3px;border-radius:5px 5px 2px 2px;box-shadow:0 4px 12px rgba(22,91,79,.16)}.bar-value{overflow:hidden;color:#47615d;font:700 9px/1 ui-monospace,SFMono-Regular,monospace;text-align:center;text-overflow:ellipsis}.bar-label{overflow:hidden;color:#738581;font:9px/1.2 ui-monospace,SFMono-Regular,monospace;text-align:center;text-overflow:ellipsis;white-space:nowrap}.threshold-line{position:absolute;z-index:2;right:0;left:0;border-top:1px dashed #cf4050;pointer-events:none}.threshold-line span{position:absolute;right:0;bottom:3px;padding:2px 5px;border-radius:3px;background:#fff;color:#b52d3d;font-size:9px;font-weight:700}.axis-note{display:flex;justify-content:space-between;margin-top:5px;color:#879693;font:9px/1 ui-monospace,SFMono-Regular,monospace}.risk-chart{display:grid;gap:12px}.risk-row{display:grid;grid-template-columns:96px minmax(100px,1fr) 24px 34px;gap:9px;align-items:center}.risk-name{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:650}.risk-name i{width:8px;height:8px;border-radius:50%}.risk-track{height:9px;overflow:hidden;border-radius:999px;background:#edf1f1}.risk-track i{display:block;height:100%;border-radius:inherit}.risk-row strong,.risk-row small{font-variant-numeric:tabular-nums;text-align:right}.risk-row small{color:#7a8b88}.empty{margin:0;padding:24px;border:1px dashed #cbd8d6;border-radius:10px;background:#f5f8f8;color:#667876}.empty.compact{padding:18px}.report-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:22px;padding-top:16px;border-top:1px solid #dfe7e6}.source{margin:0;color:#627571;font-size:10px}.print-button{padding:10px 16px;border:0;border-radius:8px;background:#0d705e;color:#fff;font-weight:750;cursor:pointer}@media(max-width:700px){body{padding:16px}.report-header,.report-body{padding:23px 20px}.metrics{grid-template-columns:1fr}.risk-row{grid-template-columns:84px minmax(70px,1fr) 22px 32px}.trend-bars{gap:2px}.bar-value{font-size:8px}}@media print{body{max-width:none;padding:0;background:#fff}.report{border:0;border-radius:0;box-shadow:none}.report-header{padding:22px 26px 18px}.report-body{padding:20px 26px 0}.print-button{display:none}.chart-card{margin-top:12px;padding:14px 16px}.trend-plot{height:156px}.report-footer{margin-top:14px}@page{size:A4;margin:12mm}}";
    var metrics = "<div class='metrics'><section class='metric-card report-section'>" + buildMetricTable(data, copy) + "</section>" + buildRiskChart(data, copy) + "</div>";
    var body = metrics + buildTrendChart(data, copy);
    var snapshotChip = data.snapshot ? "<span class='meta-chip'>" + esc(copy.snapshot) + "</span>" : "";
    return "<!doctype html><html lang='" + esc(lang === "zh" ? "zh-CN" : lang) + "'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + esc(copy.title) + "</title><style>" + styles + "</style></head><body><main class='report'><header class='report-header'><span class='eyebrow'>" + esc(copy.eyebrow) + "</span><h1>" + esc(copy.heading) + "</h1><div class='report-meta'><span class='meta-chip'>" + esc(copy.range) + " · " + esc(data.startDate || "-") + " " + esc(copy.to) + " " + esc(data.endDate || "-") + "</span><span class='meta-chip'>" + esc(copy.source) + " · " + esc(sourceLabel(data.source, copy)) + "</span>" + snapshotChip + "</div></header><div class='watermark'>" + esc(copy.watermark) + "</div><div class='report-body'>" + body + "<footer class='report-footer'><p class='source'>" + esc(copy.generated) + " · " + esc(data.generatedAt || "-") + "</p><button type='button' class='print-button' data-action='print'>" + esc(copy.print) + "</button></footer></div></main></body></html>";
  }

  function render(data) {
    var html = buildHtml(data);
    var reportWindow = root.open ? root.open("", "qjzh-report", "width=900,height=700") : null;
    if (reportWindow) {
      reportWindow.document.write(html);
      reportWindow.document.close();
      reportWindow.focus();
      var printButton = reportWindow.document.querySelector && reportWindow.document.querySelector("[data-action='print']");
      if (printButton && printButton.addEventListener) printButton.addEventListener("click", function () { try { reportWindow.print(); } catch (_) {} });
      root.setTimeout(function () { try { reportWindow.print(); } catch (_) {} }, 120);
      return { opened: true, html: html, window: reportWindow };
    }
    return { opened: false, html: html, window: null };
  }

  function renderInstitution(rows, selectedLanguage) {
    rows = Array.isArray(rows) ? rows : [];
    var values = rows.map(function (row) { return Number(row.calibrated_nh3_ppm || 0); });
    var distribution = { 正常: 0, 关注: 0, 待办: 0, 紧急: 0 };
    values.forEach(function (value) { distribution[riskFor(value)] += 1; });
    var temperatures = rows.map(function (row) { return Number(row.temp_c); }).filter(function (value) { return isFinite(value); });
    var now = new Date();
    var timestamps = rows.map(function (row) { return new Date(row.timestamp || "").getTime(); }).filter(Number.isFinite);
    var snapshot = timestamps.length === 0;
    var startDate = snapshot ? localDate(now) : localDate(new Date(Math.min.apply(Math, timestamps)));
    var endDate = snapshot ? localDate(now) : localDate(new Date(Math.max.apply(Math, timestamps)));
    var comfortRate = values.filter(function (value) { return value < 10; }).length / (rows.length || 1);
    return render({
      language: selectedLanguage || language(),
      startDate: startDate,
      endDate: endDate,
      snapshot: snapshot,
      noRecords: !rows.length,
      comfortRate: comfortRate,
      complianceRate: comfortRate,
      averageNh3: values.reduce(function (sum, value) { return sum + value; }, 0) / (rows.length || 1),
      maxNh3: values.reduce(function (max, value) { return Math.max(max, value); }, 0),
      temperatureRange: temperatures.length ? { min: Math.min.apply(Math, temperatures), max: Math.max.apply(Math, temperatures) } : { min: null, max: null },
      adviceCount: values.filter(function (value) { return value >= 10; }).length,
      riskDistribution: distribution,
      sampleCount: rows.reduce(function (sum, row) { return sum + Number(row.sample_count || 1); }, 0),
      siteCount: rows.length,
      rejectedCount: 0,
      outOfDomainCount: 0,
      provenance: snapshot ? { "institution-snapshot": rows.length } : { "institution-records": rows.length },
      releaseVersion: root.BUILD_INFO && root.BUILD_INFO.releaseVersion || "release-unknown",
      deploymentVersion: root.BUILD_INFO && (root.BUILD_INFO.deploymentVersion || root.BUILD_INFO.version) || "deployment-unknown",
      modelVersion: root.MODEL_WEIGHTS && root.MODEL_WEIGHTS.version || root.BUILD_INFO && root.BUILD_INFO.modelVersion || "model-not-loaded",
      ruleVersion: root.BUILD_INFO && root.BUILD_INFO.rulesVersion || "knowledgeBase.js@1.0.0",
      rulesFingerprint: root.BUILD_INFO && root.BUILD_INFO.rulesFingerprint || "",
      buildCommit: root.BUILD_INFO && root.BUILD_INFO.commit || "local",
      timezone: "Asia/Shanghai",
      seriesMode: "institution",
      trendSeries: rows.slice(-12).map(function (row) { return { timestamp: row.timestamp || "", label: row.name || row.site_id || "-", value: Number(row.calibrated_nh3_ppm || 0) }; }),
      generatedAt: now.toISOString(),
      source: snapshot ? "机构演示快照" : "QJZH 本地记录"
    });
  }

  q.reportRenderer = { COPY: COPY, buildHtml: buildHtml, render: render, renderInstitution: renderInstitution };
  root.addEventListener("DOMContentLoaded", function () {
    var button = root.document.getElementById("generateReport");
    if (!button) return;
    var lastReportData = null;
    var preview = root.document.getElementById("reportPreview");
    var frame = root.document.getElementById("reportPreviewFrame");
    var retry = root.document.getElementById("retryReportPrint");
    var startInput = root.document.getElementById("reportStartDate");
    var endInput = root.document.getElementById("reportEndDate");
    var datesEdited = false;
    var reportState = "initial";
    [startInput, endInput].forEach(function (input) { if (input) input.addEventListener("input", function () { datesEdited = true; }); });
    function suggestDates() {
      if (datesEdited || !startInput || !endInput) return;
      var records = q.dataImport && q.dataImport.getRecords ? q.dataImport.getRecords() : [];
      var times = records.map(function (record) { return new Date(record.timestamp).getTime(); }).filter(Number.isFinite);
      var end = times.length ? Math.max.apply(Math, times) : Date.now();
      startInput.value = localDate(new Date(times.length ? Math.min.apply(Math, times) : end - 89 * 86400000));
      endInput.value = localDate(new Date(end));
    }
    function hidePreview() {
      lastReportData = null;
      if (preview) preview.hidden = true;
      if (retry) retry.hidden = true;
      if (frame) frame.srcdoc = "";
    }
    function setReportStatus(message, state, focus) {
      var status = root.document.getElementById("reportStatus");
      if (!status) return;
      status.removeAttribute("data-i18n");
      status.className = "qjzh-data-state qjzh-state-" + state;
      status.textContent = message;
      status.setAttribute("aria-busy", "false");
      if (focus && status.focus) status.focus({ preventScroll: true });
    }
    suggestDates();
    ["qjzh:data-imported", "qjzh:data-synced"].forEach(function (event) { root.addEventListener(event, function () {
      hidePreview(); suggestDates();
      reportState = "changed";
      setReportStatus(q.translate ? q.translate("qjzh.report.dataChanged", "数据已更新，请重新生成报告。") : "数据已更新，请重新生成报告。", "empty", false);
    }); });
    function showPreview(result, lang) {
      var copy = COPY[lang] || COPY.zh;
      if (frame) { frame.title = copy.previewTitle; frame.srcdoc = result.html; }
      if (retry) { retry.hidden = false; retry.textContent = copy.retry; }
      if (preview) preview.hidden = false;
    }
    if (retry) retry.addEventListener("click", function () {
      if (!lastReportData) return;
      var lang = language(lastReportData);
      var result = render(lastReportData);
      showPreview(result, lang);
      setReportStatus(result.opened ? COPY[lang].opened : COPY[lang].popupBlocked, result.opened ? "empty" : "warning", true);
    });
    button.addEventListener("click", function () {
      var lang = root.document.documentElement.dataset.language || "zh";
      var data = q.reportGenerator.generate({
        startDate: root.document.getElementById("reportStartDate") && root.document.getElementById("reportStartDate").value,
        endDate: root.document.getElementById("reportEndDate") && root.document.getElementById("reportEndDate").value,
        language: lang
      });
      var status = root.document.getElementById("reportStatus");
      if (!data.valid) {
        reportState = "invalid";
        hidePreview(); setReportStatus(data.message || COPY[lang].empty, "error", true);
        return;
      }
      lastReportData = data;
      reportState = "generated";
      var result = render(data);
      showPreview(result, lang);
      setReportStatus(data.noRecords ? COPY[lang].empty : result.opened ? COPY[lang].opened : COPY[lang].popupBlocked, data.noRecords || !result.opened ? "warning" : "empty", true);
    });
    root.addEventListener("dashboard:language-change", function () {
      var lang = language();
      if (!lastReportData) {
        if (reportState === "changed") setReportStatus(q.translate("qjzh.report.dataChanged", "数据已更新，请重新生成报告。"), "empty", false);
        if (reportState === "invalid") {
          var invalid = q.reportGenerator.generate({ startDate: startInput.value, endDate: endInput.value, language: lang });
          if (!invalid.valid) setReportStatus(invalid.message, "error", false);
        }
        return;
      }
      lastReportData.language = lang;
      showPreview({ html: buildHtml(lastReportData) }, lang);
      setReportStatus(lastReportData.noRecords ? COPY[lang].empty : COPY[lang].previewTitle, lastReportData.noRecords ? "warning" : "empty", false);
    });
  });
})(window);
