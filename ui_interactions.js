/**
 * Bind the independently loaded highland compensation model to the demo panel.
 * @returns {void}
 */
(function () {
  "use strict";

  /** Update displayed values for the altitude, temperature, and humidity sliders. @returns {void} */
  function updateDemoLabels() {
    document.getElementById("demoAltitudeOut").value = `${document.getElementById("demoAltitude").value} m`;
    document.getElementById("demoTempOut").value = `${document.getElementById("demoTemp").value} C`;
    document.getElementById("demoRhOut").value = `${document.getElementById("demoRh").value} %RH`;
  }

  /** Generate an in-range simulated raw reading and display its compensated ppm value. @returns {void} */
  function runAlgorithmDemo() {
    const altitude = Number(document.getElementById("demoAltitude").value);
    const temperature = Number(document.getElementById("demoTemp").value);
    const humidity = Number(document.getElementById("demoRh").value);
    const simulatedTruePpm = 3 + Math.random() * 24;
    const rawPpm = window.simulateHighlandRaw(simulatedTruePpm, altitude, temperature, humidity);
    const correctedPpm = window.compensate(altitude, temperature, humidity, rawPpm);
    document.getElementById("demoRaw").textContent = `${rawPpm.toFixed(2)} ppm`;
    document.getElementById("demoCorrected").textContent = `${correctedPpm.toFixed(2)} ppm`;
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("modelVersion").textContent = window.MODEL_WEIGHTS.version;
    ["demoAltitude", "demoTemp", "demoRh"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateDemoLabels);
    });
    document.getElementById("demoSimulate").addEventListener("click", runAlgorithmDemo);
    updateDemoLabels();
  });
})();
