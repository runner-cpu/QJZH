/* Reset all QJZH demo state and reload the page. */
(function (root) {
  "use strict";
  function clear() { return root.QJZH.dataImport.clearData({ confirm: true }); }
  function reset() { var result = clear(); if (result.ok && root.location && root.location.reload) root.location.reload(); return result; }
  root.QJZH = root.QJZH || {}; root.QJZH.demoReset = { reset: reset, clear: clear };
})(window);
