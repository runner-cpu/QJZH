/* CSV template helper. */
(function (root) {
  "use strict";
  var q = root.QJZH = root.QJZH || {};
  var headers = ["timestamp", "site_id", "altitude_m", "temp_c", "rh_percent", "raw_nh3_ppm", "device_model", "species", "age_days", "stocking_density", "barn_area"];
  function csvEscape(value) { var text = value == null ? "" : String(value); return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
  var api = q.csvTemplate = { headers: headers.slice(), content: function () { return headers.join(",") + "\n"; }, escape: csvEscape };
  api.download = function (filename) {
    var name = filename || "qjzh_sensor_template.csv";
    if (!root.document || !root.URL || !root.Blob) return api.content();
    var link = root.document.createElement("a"); link.href = root.URL.createObjectURL(new root.Blob(["\ufeff" + api.content()], { type: "text/csv;charset=utf-8" })); link.download = name; link.click();
    root.setTimeout(function () { root.URL.revokeObjectURL(link.href); }, 0); return name;
  };
  q.downloadCsvTemplate = api.download;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
