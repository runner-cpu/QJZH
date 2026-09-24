/* Reset all QJZH demo state and reload the page. */
(function (root) {
  "use strict";
  function clear(store) { if (!store) return; for (var i = store.length - 1; i >= 0; i--) { var k = store.key(i); if (k && k.indexOf("QJZH_") === 0) store.removeItem(k); } }
  function reset() { clear(root.localStorage); clear(root.sessionStorage); root.__QJZH_MEM__ = {}; if (root.location && root.location.reload) root.location.reload(); }
  root.QJZH = root.QJZH || {}; root.QJZH.demoReset = { reset: reset, clear: function () { clear(root.localStorage); clear(root.sessionStorage); root.__QJZH_MEM__ = {}; } };
})(window);
