(function (global) {
  "use strict";

  const WINTER_DAY = Object.freeze([
    [-5, 5], [-5, 5.8], [-4.5, 6.5], [-4, 7.2], [-3.5, 8.2], [-2.5, 9.5], [-1.5, 11], [-0.8, 13],
    [0, 15], [2, 15.4], [4, 15.7], [5.5, 16], [7, 16.2], [8, 12], [4, 10], [3, 12],
    [1, 15], [-1, 17], [-2.5, 19], [-3.5, 21], [-4.2, 23], [-5, 25], [-5, 25], [-5, 25]
  ]);

  /** Estimate standard atmospheric pressure in kPa from altitude in metres. @param {number} altitude Altitude in metres. @returns {number} Pressure in kPa. */
  function estimatePressureKpa(altitude) {
    return 101.325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
  }

  /** Create 24 hourly highland samples with pressure bias and model compensation. @returns {Array<object>} Simulated sensor records. */
  function createWinterDayData() {
    return WINTER_DAY.map(function (point, hour) {
      const temperature = point[0];
      const trueAmmonia = point[1];
      const altitude = 2850 + 650 * Math.sin(hour / 24 * Math.PI * 2);
      const pressure = estimatePressureKpa(altitude);
      const lowPressure = (101.325 - pressure) / 101.325;
      const humidity = Math.max(52, Math.min(82, Math.round(70 - temperature * 1.8)));
      const nonlinearError = Math.min(.40, Math.max(.35, .29 + .21 * lowPressure + .025 * ((temperature - 5) / 20) ** 2 + .02 * ((humidity - 52.5) / 32.5) ** 2));
      const rawAmmonia = trueAmmonia * (1 + nonlinearError) + .1 + .06 * lowPressure;
      const ammonia = global.compensate(altitude, temperature, humidity, rawAmmonia);
      return {
        hour,
        time: String(hour).padStart(2, "0") + ":00",
        temperature,
        ammonia,
        referenceAmmonia: trueAmmonia,
        altitude,
        rawAmmonia: Number(rawAmmonia.toFixed(1)),
        humidity,
        light: hour < 7 || hour > 18 ? 20 : Math.round(Math.max(80, 860 - Math.abs(13 - hour) * 110)),
        pressure: Number(pressure.toFixed(1)),
        tempDropRate: hour === 0 ? 0 : Number((WINTER_DAY[hour - 1][0] - temperature).toFixed(1))
      };
    });
  }

  /** Evaluate all samples through the local decision engine. @param {object} engine DecisionEngine instance. @param {boolean} logDecisions Whether to log records. @returns {Array<object>} Records with decisions. */
  function evaluateDay(engine, logDecisions) {
    let lastState = { action: "stop" };
    return createWinterDayData().map(function (sample) {
      const decision = engine.decide(sample.hour, sample.temperature, sample.ammonia, sample.tempDropRate, lastState);
      lastState = decision;
      const record = Object.assign({}, sample, { decision });
      if (logDecisions) console.log("[本地知识库]", record.time, record, decision);
      return record;
    });
  }

  /** Stream one sample per second to the dashboard. @param {object} engine DecisionEngine instance. @param {Function} updateUICallback UI update callback. @returns {{stop: Function, done: Promise<Array<object>>}} Simulation controller. */
  function runSimulation(engine, updateUICallback) {
    const records = evaluateDay(engine, false);
    let index = 0;
    let timer = null;
    let stopped = false;
    let resolveDone;
    const done = new Promise(function (resolve) { resolveDone = resolve; });

    /** Advance the stream by one record and schedule the next sample. @returns {void} */
    function advance() {
      if (stopped) return;
      if (index >= records.length) {
        resolveDone(records);
        return;
      }
      updateUICallback(records[index], index, records);
      index += 1;
      timer = global.setTimeout(advance, 1000);
    }

    advance();
    return {
      /** Stop the active timer without altering accumulated records. @returns {void} */
      stop: function () { stopped = true; global.clearTimeout(timer); },
      done
    };
  }

  /** Run deterministic priority and hysteresis assertions. @param {object} engine DecisionEngine instance. @returns {object} Self-check report. */
  function runSelfCheck(engine) {
    const records = evaluateDay(engine, true);
    const switchingNearThreshold = records.filter(function (record, index) {
      const prior = records[index - 1];
      return prior && record.ammonia >= 14.8 && record.ammonia <= 16.2 && record.decision.action !== prior.decision.action;
    }).length;
    const priorityCheck = engine.decide(14, 4, 10, 4, { action: "ventilation" });
    const report = {
      samples: records.length,
      switchingNearThreshold,
      hysteresisStable: switchingNearThreshold <= 1,
      temperaturePriority: priorityCheck.action === "stop" && priorityCheck.ruleId === "TEMP_DROP_LIMIT",
      priorityCheck
    };
    console.info("[本地知识库自检]", report);
    return report;
  }

  /** Provide a dependency-free chart fallback when Chart.js CDN is unavailable. @param {HTMLCanvasElement} canvas Chart canvas. @param {object} config Chart data/options. */
  function CanvasChartFallback(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = config.data;
    this.options = config.options || {};
    this.update();
  }
  CanvasChartFallback.register = function () {};
  /** Render the current datasets with a lightweight canvas implementation. @returns {void} */
  CanvasChartFallback.prototype.update = function () {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 760));
    const height = Math.max(220, Math.round(rect.height || 355));
    canvas.width = width * (global.devicePixelRatio || 1);
    canvas.height = height * (global.devicePixelRatio || 1);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = this.ctx;
    ctx.setTransform(global.devicePixelRatio || 1, 0, 0, global.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const pad = { left: 42, right: 20, top: 24, bottom: 32 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const allValues = this.data.datasets.flatMap(function (dataset) { return dataset.data.filter(Number.isFinite); });
    const min = Math.min(-5, ...allValues);
    const max = Math.max(30, ...allValues);
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = pad.top + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    }
    const yFor = function (value) { return pad.top + (max - value) / (max - min) * plotH; };
    ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = "#ff4d5e"; ctx.beginPath(); ctx.moveTo(pad.left, yFor(15)); ctx.lineTo(width - pad.right, yFor(15)); ctx.stroke(); ctx.restore();
    this.data.datasets.forEach(function (dataset) {
      const values = dataset.data;
      ctx.strokeStyle = dataset.borderColor || "#00d4aa";
      ctx.fillStyle = dataset.pointBackgroundColor || dataset.borderColor || "#00d4aa";
      ctx.lineWidth = dataset.borderWidth || 2;
      let active = false;
      values.forEach(function (value, index) {
        if (!Number.isFinite(value)) { active = false; return; }
        const x = pad.left + (values.length < 2 ? 0 : index / (values.length - 1) * plotW);
        const y = yFor(value);
        if (!active) { ctx.beginPath(); ctx.moveTo(x, y); active = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
      if (dataset.pointRadius) values.forEach(function (value, index) {
        if (!Number.isFinite(value)) return;
        const x = pad.left + (values.length < 2 ? 0 : index / (values.length - 1) * plotW);
        ctx.beginPath(); ctx.arc(x, yFor(value), typeof dataset.pointRadius === "number" ? dataset.pointRadius : 4, 0, Math.PI * 2); ctx.fill();
      });
    });
    ctx.fillStyle = "#7a9bb5"; ctx.font = "12px system-ui";
    ctx.fillText("Canvas 图表降级模式", pad.left, 15);
  };

  if (!global.Chart) global.Chart = CanvasChartFallback;
  global.LocalSimulator = Object.freeze({ createWinterDayData, runSimulation, runSelfCheck });
})(window);
