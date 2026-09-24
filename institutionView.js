/* Institution dashboard: five deterministic Qinghai demo barns plus local imports. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var demo = [
    { site_id: "QH-HD-001", name: "海东示范圈舍", altitude_m: 2620, species: "犊牦牛", calibrated_nh3_ppm: 8.4, risk_level: "正常", sample_count: 36 },
    { site_id: "QH-XN-002", name: "西宁城郊圈舍", altitude_m: 2260, species: "奶牛", calibrated_nh3_ppm: 11.8, risk_level: "关注", sample_count: 36 },
    { site_id: "QH-HZ-003", name: "海北牧场圈舍", altitude_m: 3150, species: "牦牛", calibrated_nh3_ppm: 15.6, risk_level: "待办", sample_count: 36 },
    { site_id: "QH-HN-004", name: "海南合作社圈舍", altitude_m: 2900, species: "肉牛", calibrated_nh3_ppm: 6.2, risk_level: "正常", sample_count: 36 },
    { site_id: "QH-GL-005", name: "果洛高原圈舍", altitude_m: 3500, species: "犊牦牛", calibrated_nh3_ppm: 21.3, risk_level: "紧急", sample_count: 36 }
  ];
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) { return null; } }
  function language() { return root.document?.documentElement?.dataset?.language || "zh"; }
  function roleLabels() {
    if (language() === "en") return { station: "Livestock station", college: "Agricultural college", cooperative: "Cooperative" };
    if (language() === "bo") return { station: "ཕྱུགས་ལས་ས་ཚིགས", college: "ཞིང་ཕྱུགས་སློབ་གྲྭ", cooperative: "མཉམ་ལས་ཁང" };
    return { station: "畜牧站", college: "农牧院校", cooperative: "合作社" };
  }
  function riskLabel(value) {
    var labels = language() === "en"
      ? { "正常": "Normal", "关注": "Watch", "待办": "To-do", "紧急": "Urgent" }
      : language() === "bo"
        ? { "正常": "རྒྱུན་ལྡན", "关注": "དོ་སྣང", "待办": "བྱ་དགོས", "紧急": "ཛ་དྲག" }
        : {};
    return labels[value] || value;
  }
  function getRows() {
    var imported = read("QJZH_INSTITUTIONS");
    var demoCopy = demo.map(function (row) { return Object.assign({}, row); });
    if (!Array.isArray(imported) || !imported.length) return demoCopy;
    var byId = {};
    imported.concat(demoCopy).forEach(function (row) { byId[row.site_id || row.name] = Object.assign({}, row); });
    return Object.keys(byId).map(function (key) { return byId[key]; });
  }
  function risk(nh3) { return nh3 >= 20 ? "紧急" : nh3 >= 15 ? "待办" : nh3 >= 10 ? "关注" : "正常"; }
  function filterRows(rows, query) {
    var term = String(query || "").trim().toLocaleLowerCase();
    if (!term) return rows.slice();
    return rows.filter(function (row) {
      return [row.site_id, row.name, row.species].some(function (value) { return String(value || "").toLocaleLowerCase().indexOf(term) >= 0; });
    });
  }
  function render() {
    var rows = getRows();
    var body = root.document && root.document.getElementById("institutionRows");
    var summary = root.document && root.document.getElementById("institutionSummary");
    var detail = root.document && root.document.getElementById("institutionRoleDetail");
    var filter = root.document && root.document.getElementById("institutionFilter");
    var roleNode = root.document && root.document.getElementById("institutionRole");
    var role = roleNode ? roleNode.value : "station";
    if (roleNode) Array.from(roleNode.options).forEach(function (option) { option.textContent = roleLabels()[option.value] || option.textContent; });
    rows.forEach(function (r) {
      if (r.calibrated_nh3_ppm == null && root.compensate) r.calibrated_nh3_ppm = root.compensate(Number(r.altitude_m), Number(r.temp_c || 0), Number(r.rh_percent || 50), Number(r.raw_nh3_ppm || 0));
      r.risk_level = r.risk_level || risk(Number(r.calibrated_nh3_ppm || 0));
    });
    rows = filterRows(rows, filter && filter.value);
    rows.sort(function (a, b) { return Number(b.calibrated_nh3_ppm || 0) - Number(a.calibrated_nh3_ppm || 0); });
    if (body) body.innerHTML = rows.map(function (r) {
      var snapshot = language() === "en" ? "Demo snapshot" : language() === "bo" ? "དཔེ་སྟོན་མྱུར་བཀོད" : "演示快照";
      return "<tr><td>" + esc(r.name || r.site_id) + "</td><td>" + esc(Number(r.altitude_m || 0)) + " m</td><td>" + esc(r.species || "-") + "</td><td>" + esc(Number(r.calibrated_nh3_ppm || 0).toFixed(1)) + " ppm</td><td>" + esc(riskLabel(r.risk_level || risk(r.calibrated_nh3_ppm))) + "</td><td>" + esc(r.timestamp || snapshot) + "</td></tr>";
    }).join("");
    var compliant = rows.filter(function (r) { return Number(r.calibrated_nh3_ppm) < 10; }).length;
    var warnings = rows.filter(function (r) { return Number(r.calibrated_nh3_ppm) >= 10; }).length;
    var average = rows.length ? (rows.reduce(function (s, r) { return s + Number(r.calibrated_nh3_ppm || 0); }, 0) / rows.length).toFixed(1) : "0.0";
    var species = Array.from(new Set(rows.map(function (r) { return r.species || "未标注"; }))).join("、");
    var sampleCount = rows.reduce(function (sum, r) { return sum + Number(r.sample_count || 1); }, 0);
    if (summary) {
      summary.className = "qjzh-data-state qjzh-state";
      if (language() === "en") summary.textContent = role === "college"
        ? "Teaching labels: species " + species + " · " + sampleCount + " samples · ready for classroom rule demonstrations"
        : role === "cooperative"
          ? "Cooperative barns: " + rows.length + " sites · " + warnings + " need attention · export a cooperative report"
          : "Regional summary: compliance " + (rows.length ? Math.round(compliant / rows.length * 100) : 0) + "% · alerts " + warnings + " · average NH3 " + average + " ppm";
      else if (language() === "bo") summary.textContent = role === "college"
        ? "སློབ་ཁྲིད་མཆན་འགྲེལ། ཕྱུགས་རིགས " + species + " · དཔེ་ཚད " + sampleCount
        : role === "cooperative"
          ? "མཉམ་ལས་ཁང་ཕྱུགས་ཁང " + rows.length + " · དོ་སྣང " + warnings
          : "ས་ཁུལ་སྙིང་བསྡུས། ཚད་ལོངས " + (rows.length ? Math.round(compliant / rows.length * 100) : 0) + "% · NH3 " + average + " ppm";
      else summary.textContent = role === "college"
        ? "教学标注：畜种 " + species + " · 样本 " + sampleCount + " 条 · 可用于课堂规则演示"
        : role === "cooperative"
          ? "合作社多圈舍：共 " + rows.length + " 个站点 · " + warnings + " 个需关注 · 建议导出合作社环境报告"
          : "区域汇总：达标率 " + (rows.length ? Math.round(compliant / rows.length * 100) : 0) + "% · 预警 " + warnings + " 次 · 平均氨气 " + average + " ppm";
    }
    if (detail) {
      if (language() === "en") detail.textContent = role === "college" ? "College role: species distribution and sample counts are prioritized for teaching." : role === "cooperative" ? "Cooperative role: multi-barn list first, with cooperative report export." : "Livestock-station role: regional summary first, sorted by ammonia risk.";
      else if (language() === "bo") detail.textContent = role === "college"
        ? "སློབ་གྲྭའི་ལས་འགན། ཕྱུགས་རིགས་དང་དཔེ་ཚད་སྔོན་དུ་སྟོན།"
        : role === "cooperative"
          ? "མཉམ་ལས་ཁང་ལས་འགན། ཕྱུགས་ཁང་རེའུ་མིག་དང་སྙན་ཞུ་ཕྱིར་འདྲེན།"
          : "ཕྱུགས་ལས་ས་ཚིགས། ས་ཁུལ་སྙིང་བསྡུས་དང་ཉེན་ཁ་རིམ་སྒྲིག";
      else detail.textContent = role === "college"
        ? "农牧院校角色：优先呈现畜种分布和样本量，便于教学标注。"
        : role === "cooperative"
          ? "合作社角色：优先查看多圈舍列表，导出按钮将生成合作社环境报告。"
          : "畜牧站角色：区域汇总优先，列表按氨气风险从高到低排列。";
    }
    return rows;
  }
  function importLocal() {
    var records = q.dataImport && q.dataImport.getRecords ? q.dataImport.getRecords() : [];
    if (!records.length) return render();
    var rows = records.reduce(function (all, r) {
      var found = all.find(function (x) { return x.site_id === r.site_id; });
      if (!found) { found = Object.assign({}, r, { name: r.site_id, sample_count: 0 }); all.push(found); }
      found.timestamp = r.timestamp;
      found.raw_nh3_ppm = r.raw_nh3_ppm;
      found.sample_count = Number(found.sample_count || 0) + 1;
      found.calibrated_nh3_ppm = root.compensate ? root.compensate(Number(r.altitude_m), Number(r.temp_c), Number(r.rh_percent), Number(r.raw_nh3_ppm)) : Number(r.raw_nh3_ppm);
      found.risk_level = risk(found.calibrated_nh3_ppm);
      return all;
    }, getRows());
    try { root.localStorage.setItem("QJZH_INSTITUTIONS", JSON.stringify(rows)); } catch (_) {}
    return render();
  }
  function exportReport() {
    var rows = render();
    if (q.reportRenderer && q.reportRenderer.renderInstitution) return q.reportRenderer.renderInstitution(rows);
    return rows;
  }
  q.institutionView = { demo: demo, getRows: getRows, filterRows: filterRows, render: render, importLocal: importLocal, exportReport: exportReport, esc: esc };
  root.addEventListener("DOMContentLoaded", function () {
    render();
    root.document.getElementById("institutionImport")?.addEventListener("click", importLocal);
    root.document.getElementById("institutionExport")?.addEventListener("click", exportReport);
    root.document.getElementById("institutionRole")?.addEventListener("change", render);
    root.document.getElementById("institutionFilter")?.addEventListener("input", render);
    root.addEventListener("dashboard:language-change", render);
  });
})(window);
