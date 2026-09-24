/* Institution dashboard: five deterministic Qinghai demo barns plus local imports. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var demo = [
    { site_id: "QH-HD-001", name: "海东示范圈舍", altitude_m: 2620, species: "犊牦牛", calibrated_nh3_ppm: 8.4, risk_level: "正常" },
    { site_id: "QH-XN-002", name: "西宁城郊圈舍", altitude_m: 2260, species: "奶牛", calibrated_nh3_ppm: 11.8, risk_level: "关注" },
    { site_id: "QH-HZ-003", name: "海北牧场圈舍", altitude_m: 3150, species: "牦牛", calibrated_nh3_ppm: 15.6, risk_level: "待办" },
    { site_id: "QH-HN-004", name: "海南合作社圈舍", altitude_m: 2900, species: "肉牛", calibrated_nh3_ppm: 6.2, risk_level: "正常" },
    { site_id: "QH-GL-005", name: "果洛高原圈舍", altitude_m: 3500, species: "犊牦牛", calibrated_nh3_ppm: 21.3, risk_level: "紧急" }
  ];
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) { return null; } }
  function getRows() {
    var imported = read("QJZH_INSTITUTIONS");
    return (Array.isArray(imported) && imported.length ? imported : demo).map(function (row) { return Object.assign({}, row); });
  }
  function risk(nh3) { return nh3 >= 20 ? "紧急" : nh3 >= 15 ? "待办" : nh3 >= 10 ? "关注" : "正常"; }
  function render() {
    var rows = getRows(), body = root.document && root.document.getElementById("institutionRows"), summary = root.document && root.document.getElementById("institutionSummary");
    rows.forEach(function (r) { if (r.calibrated_nh3_ppm == null && root.compensate) r.calibrated_nh3_ppm = root.compensate(Number(r.altitude_m), Number(r.temp_c || 0), Number(r.rh_percent || 50), Number(r.raw_nh3_ppm || 0)); r.risk_level = r.risk_level || risk(Number(r.calibrated_nh3_ppm || 0)); });
    rows.sort(function (a, b) { return Number(b.calibrated_nh3_ppm || 0) - Number(a.calibrated_nh3_ppm || 0); });
    if (body) body.innerHTML = rows.map(function (r) { return "<tr><td>" + String(r.name || r.site_id) + "</td><td>" + Number(r.altitude_m || 0) + " m</td><td>" + String(r.species || "-") + "</td><td>" + Number(r.calibrated_nh3_ppm || 0).toFixed(1) + " ppm</td><td>" + String(r.risk_level || risk(r.calibrated_nh3_ppm)) + "</td><td>" + String(r.timestamp || new Date().toLocaleString()) + "</td></tr>"; }).join("");
    var compliant = rows.filter(function (r) { return Number(r.calibrated_nh3_ppm) < 10; }).length;
    if (summary) summary.className = "qjzh-data-state qjzh-state"; if (summary) summary.textContent = "区域汇总：" + rows.length + " 个圈舍 · 氨气达标率 " + (rows.length ? Math.round(compliant / rows.length * 100) : 0) + "% · 平均氨气 " + (rows.length ? (rows.reduce(function (s, r) { return s + Number(r.calibrated_nh3_ppm || 0); }, 0) / rows.length).toFixed(1) : "0.0") + " ppm";
    return rows;
  }
  function importLocal() {
    var records = q.dataImport && q.dataImport.getRecords ? q.dataImport.getRecords() : [];
    if (!records.length) return render();
    var rows = records.reduce(function (all, r) { var found = all.find(function (x) { return x.site_id === r.site_id; }); if (!found) { found = Object.assign({}, r, { name: r.site_id }); all.push(found); } found.timestamp = r.timestamp; found.raw_nh3_ppm = r.raw_nh3_ppm; found.calibrated_nh3_ppm = root.compensate ? root.compensate(Number(r.altitude_m), Number(r.temp_c), Number(r.rh_percent), Number(r.raw_nh3_ppm)) : Number(r.raw_nh3_ppm); found.risk_level = risk(found.calibrated_nh3_ppm); return all; }, getRows());
    try { root.localStorage.setItem("QJZH_INSTITUTIONS", JSON.stringify(rows)); } catch (_) {} render();
  }
  function exportReport() { var rows = render(); if (q.reportRenderer && q.reportRenderer.renderInstitution) return q.reportRenderer.renderInstitution(rows); return rows; }
  q.institutionView = { demo: demo, getRows: getRows, render: render, importLocal: importLocal, exportReport: exportReport };
  root.addEventListener("DOMContentLoaded", function () { render(); root.document.getElementById("institutionImport")?.addEventListener("click", importLocal); root.document.getElementById("institutionExport")?.addEventListener("click", exportReport); root.document.getElementById("institutionRole")?.addEventListener("change", render); });
})(window);
