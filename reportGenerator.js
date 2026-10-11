/* Pure report aggregation for the browser dashboard. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var TIMEZONE = "Asia/Shanghai";

  function numeric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string" || value.trim() === "" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return NaN;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function calibrated(record) {
    record = record || {};
    var inputs = [record.altitude_m, record.temp_c, record.rh_percent, record.raw_nh3_ppm].map(numeric);
    if (!inputs.every(Number.isFinite)) return NaN;
    if (typeof root.compensate === "function") {
      try {
        var corrected = Number(root.compensate(inputs[0], inputs[1], inputs[2], inputs[3]));
        return Number.isFinite(corrected) ? corrected : NaN;
      } catch (_) {
        // A broken/missing model must make the point unassessed, not crash report generation.
        return NaN;
      }
    }
    return inputs[3];
  }

  function riskFor(value) {
    if (q.riskPolicy && typeof q.riskPolicy.classifyNh3 === "function") {
      try {
        var policy = q.riskPolicy.classifyNh3(value);
        if (policy && policy.label) return policy.label;
      } catch (_) {}
    }
    return Number(value) > 15 ? "紧急" : Number(value) >= 10 ? "关注" : "正常";
  }

  function shanghaiDate(date) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).reduce(function (result, part) { result[part.type] = part.value; return result; }, {});
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function validDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    var date = new Date(value + "T00:00:00.000+08:00");
    return Number.isFinite(date.getTime()) && shanghaiDate(date) === value;
  }

  function invalidRange(language) {
    var messages = {
      zh: "日期范围无效：请使用有效日期，且结束日期不得早于起始日期。",
      en: "Invalid date range: use valid dates and keep the end date on or after the start date.",
      bo: "དུས་ཚོད་ཁྱབ་ཁོངས་ནོར་འདུག མཇུག་གི་ཚེས་གྲངས་འགོ་ཚུགས་ལས་སྔ་མི་རུང་།"
    };
    return { valid: false, errorCode: "INVALID_RANGE", message: messages[language] || messages.zh, records: [], trendSeries: [] };
  }

  function cacheSummary(result) {
    var summary = Object.assign({}, result, { trendPointCount: result.trendSeries.length });
    delete summary.records;
    delete summary.trendSeries;
    if (q.storage && typeof q.storage.set === "function") q.storage.set("QJZH_REPORTS", summary);
    else try { root.localStorage.setItem("QJZH_REPORTS", JSON.stringify(summary)); } catch (_) {}
  }

  function report(options) {
    options = options || {};
    var language = ["zh", "en", "bo"].indexOf(options.language) >= 0
      ? options.language
      : root.document && root.document.documentElement && root.document.documentElement.dataset.language || "zh";
    var now = new Date();
    var endDate = options.endDate || shanghaiDate(now);
    if (!validDateInput(endDate)) return invalidRange(language);
    var end = new Date(endDate + "T23:59:59.999+08:00");
    var startDate = options.startDate || shanghaiDate(new Date(end.getTime() - 90 * 86400000));
    if (!validDateInput(startDate)) return invalidRange(language);
    var start = new Date(startDate + "T00:00:00.000+08:00");
    if (start.getTime() > end.getTime()) return invalidRange(language);

    var allRecords = [];
    try {
      var candidateRecords = q.dataImport && q.dataImport.getRecords ? q.dataImport.getRecords() : [];
      allRecords = Array.isArray(candidateRecords) ? candidateRecords : [];
    } catch (_) {
      // Reporting should remain available when a legacy storage adapter is broken.
      allRecords = [];
    }
    var siteIds = Array.isArray(options.siteIds) ? options.siteIds : null;
    var records = allRecords.filter(function (record) {
      if (!record || typeof record !== "object") return false;
      var time = new Date(record.timestamp || 0).getTime();
      return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime() && (!siteIds || siteIds.indexOf(record.site_id) >= 0);
    });
    var calibratedValues = records.map(calibrated);
    var calibrationByRecord = new Map();
    records.forEach(function (record, index) { calibrationByRecord.set(record, calibratedValues[index]); });
    var values = calibratedValues.filter(Number.isFinite);
    var calibrationErrorCount = calibratedValues.length - values.length;
    var sum = values.reduce(function (total, value) { return total + value; }, 0);
    var distribution = { 正常: 0, 关注: 0, 待办: 0, 紧急: 0 };
    var unclassifiedCount = 0;
    values.forEach(function (value) {
      var label = riskFor(value);
      if (Object.prototype.hasOwnProperty.call(distribution, label)) distribution[label] += 1;
      else unclassifiedCount += 1;
    });
    var temperatures = records.map(function (record) { return numeric(record.temp_c); }).filter(Number.isFinite);
    var trendSeries = records.slice().sort(function (a, b) {
      return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
    }).slice(-12).map(function (record) {
      return { timestamp: record.timestamp || "", value: calibrationByRecord.get(record) };
    }).filter(function (point) { return Number.isFinite(point.value); });
    var provenance = records.reduce(function (counts, record) {
      var source = String(record.provenance || "legacy-local");
      counts[source] = (counts[source] || 0) + 1;
      return counts;
    }, {});
    var comfortCount = values.filter(function (value) { return value < 10; }).length;
    var outOfDomainCount = q.dataImport && q.dataImport.validate
      ? records.filter(function (record) {
        try { return q.dataImport.validate(record).quality !== "A"; } catch (_) { return true; }
      }).length
      : 0;
    var buildInfo = root.BUILD_INFO || {};
    var loadedModelVersion = root.MODEL_WEIGHTS && root.MODEL_WEIGHTS.version;
    var modelVersion = loadedModelVersion || buildInfo.modelVersion || "model-not-loaded";
    var rulesVersion = buildInfo.rulesVersion || "knowledgeBase.js@1.0.0";
    var result = {
      valid: true,
      language: language,
      startDate: startDate,
      endDate: endDate,
      records: records,
      noRecords: !records.length,
      comfortRate: values.length ? comfortCount / values.length : 0,
      complianceRate: values.length ? comfortCount / values.length : 0,
      averageNh3: values.length ? sum / values.length : 0,
      maxNh3: values.length ? Math.max.apply(Math, values) : 0,
      temperatureRange: temperatures.length ? { min: Math.min.apply(Math, temperatures), max: Math.max.apply(Math, temperatures) } : { min: null, max: null },
      adviceCount: values.filter(function (value) { return value >= 10; }).length,
      riskDistribution: distribution,
      unclassifiedCount: unclassifiedCount,
      trendSeries: trendSeries,
      siteCount: new Set(records.map(function (record) { return record.site_id; }).filter(Boolean)).size,
      sampleCount: records.length,
      rejectedCount: Number(options.rejectedCount || 0),
      outOfDomainCount: outOfDomainCount,
      calibrationErrorCount: calibrationErrorCount,
      provenance: provenance,
      releaseVersion: buildInfo.releaseVersion || "release-unknown",
      deploymentVersion: buildInfo.deploymentVersion || buildInfo.version || "deployment-unknown",
      modelVersion: modelVersion,
      ruleVersion: rulesVersion,
      rulesFingerprint: buildInfo.rulesFingerprint || "",
      buildCommit: buildInfo.commit || "local",
      timezone: TIMEZONE,
      generatedAt: now.toISOString(),
      source: "QJZH 本地记录"
    };
    cacheSummary(result);
    return result;
  }

  q.reportGenerator = { report: report, generate: report, validDateInput: validDateInput };
  q.report = report;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
