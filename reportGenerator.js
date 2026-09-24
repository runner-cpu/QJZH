/* Pure report aggregation for the browser dashboard. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  function calibrated(r) { if (r.calibrated_nh3_ppm != null) return Number(r.calibrated_nh3_ppm); if (root.compensate) return Number(root.compensate(Number(r.altitude_m), Number(r.temp_c), Number(r.rh_percent), Number(r.raw_nh3_ppm))); return Number(r.raw_nh3_ppm || 0); }
  function report(options) {
    options = options || {}; var end = options.endDate ? new Date(options.endDate + "T23:59:59") : new Date(); var start = options.startDate ? new Date(options.startDate) : new Date(end.getTime() - 90 * 86400000);
    var allRecords = q.dataImport && q.dataImport.getRecords ? q.dataImport.getRecords() : []; var siteIds = Array.isArray(options.siteIds) ? options.siteIds : null; var records = allRecords.filter(function (r) { var t = new Date(r.timestamp || 0); return t >= start && t <= end && (!siteIds || siteIds.indexOf(r.site_id) >= 0); });
    // A fresh demo may contain a historical sample outside the current 90-day window.
    // When the user left both dates blank, make the report useful by covering that sample.
    if (!records.length && allRecords.length && !options.startDate && !options.endDate) {
      var timestamps = allRecords.map(function (r) { return new Date(r.timestamp || 0).getTime(); }).filter(function (t) { return isFinite(t); });
      if (timestamps.length) { start = new Date(Math.min.apply(Math, timestamps)); end = new Date(Math.max.apply(Math, timestamps)); records = allRecords.filter(function (r) { return !siteIds || siteIds.indexOf(r.site_id) >= 0; }); }
    }
    var values = records.map(calibrated), sum = values.reduce(function (a, b) { return a + b; }, 0), dist = { 正常: 0, 关注: 0, 待办: 0, 紧急: 0 };
    values.forEach(function (n) { dist[n >= 20 ? "紧急" : n >= 15 ? "待办" : n >= 10 ? "关注" : "正常"]++; });
    var temps = records.map(function (r) { return Number(r.temp_c); }).filter(function (n) { return isFinite(n); });
    var result = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), records: records, noRecords: !records.length, complianceRate: records.length ? values.filter(function (n) { return n < 10; }).length / records.length : 0, averageNh3: records.length ? sum / records.length : 0, maxNh3: values.length ? Math.max.apply(Math, values) : 0, temperatureRange: temps.length ? { min: Math.min.apply(Math, temps), max: Math.max.apply(Math, temps) } : { min: null, max: null }, adviceCount: records.filter(function (r) { return r.advice || r.rule_id || calibrated(r) >= 10; }).length, riskDistribution: dist, generatedAt: new Date().toISOString(), source: "QJZH 本地记录" };
    try { root.localStorage.setItem("QJZH_REPORTS", JSON.stringify(result)); } catch (_) {} return result;
  }
  q.reportGenerator = { report: report, generate: report }; q.report = report;
})(window);
