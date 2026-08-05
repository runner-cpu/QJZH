(function (global) {
  "use strict";

  // 青海冬季24小时剖面：23:00 保持24.9ppm、70%湿度、0.6℃，用于验证夜间多因子建议。
  const WINTER_DAY = Object.freeze([
    [-5.0, 5.0], [-4.8, 5.0], [-4.5, 5.0], [-4.0, 5.0], [-3.5, 5.0], [-2.8, 5.0], [-2.0, 5.0], [-1.0, 8.0],
    [0.0, 15.0], [2.0, 12.0], [4.0, 15.0], [5.5, 16.0], [7.0, 16.2], [8.0, 12.0], [4.0, 10.0], [3.0, 12.0],
    [1.0, 15.0], [-1.0, 17.0], [-2.0, 19.0], [-1.2, 21.0], [0.0, 22.0], [0.3, 23.5], [0.5, 24.4], [0.6, 24.9]
  ]);

  const HUMIDITY_DAY = Object.freeze([
    45, 45, 46, 46, 44, 42, 40, 45, 50, 54, 58, 62,
    65, 68, 66, 61, 58, 56, 54, 58, 62, 66, 69, 70
  ]);

  function createWinterDayData() {
    return WINTER_DAY.map(function (point, hour) {
      const temperature = point[0];
      const targetAmmonia = point[1];
      const humidity = HUMIDITY_DAY[hour];
      const altitude = 2850 + 650 * Math.sin(hour / 24 * Math.PI * 2);
      const pressure = global.HighlandCompensator.estimatePressureKpa(altitude);
      const lowPressure = (101.325 - pressure) / 101.325;
      const nonlinearError = Math.min(.40, Math.max(.35, .29 + .21 * lowPressure + .025 * ((temperature - 5) / 20) ** 2 + .02 * ((humidity - 52.5) / 32.5) ** 2));
      const rawAmmonia = targetAmmonia * (1 + nonlinearError) + .1 + .06 * lowPressure;
      const compensated = global.HighlandCompensator.compensate(altitude, temperature, humidity, rawAmmonia);

      return {
        hour,
        time: String(hour).padStart(2, "0") + ":00",
        temperature,
        ammonia: targetAmmonia,
        referenceAmmonia: targetAmmonia,
        modelAmmonia: Number(compensated.toFixed(1)),
        altitude,
        rawAmmonia: Number(rawAmmonia.toFixed(1)),
        humidity,
        light: hour < 7 || hour > 18 ? 20 : Math.round(Math.max(80, 860 - Math.abs(13 - hour) * 110)),
        pressure: Number(pressure.toFixed(1)),
        tempDropRate: hour === 0 ? 0 : Number((WINTER_DAY[hour - 1][0] - temperature).toFixed(1))
      };
    });
  }

  function evaluateDay(engine, logDecisions) {
    const historyNh3 = [];
    if (typeof engine.reset === "function") engine.reset();
    return createWinterDayData().map(function (sample) {
      const decision = engine.decide(
        sample.hour,
        sample.temperature,
        sample.ammonia,
        sample.humidity,
        sample.tempDropRate,
        historyNh3.slice(-2)
      );
      historyNh3.push(sample.ammonia);
      const record = Object.assign({}, sample, { decision, historyNh3: historyNh3.slice(-2) });
      if (logDecisions) console.log("[本地知识库]", record.time, decision);
      return record;
    });
  }

  function runSimulation(engine, updateUICallback) {
    const records = evaluateDay(engine, false);
    let index = 0;
    let timer = null;
    let stopped = false;
    let resolveDone;
    const done = new Promise(function (resolve) { resolveDone = resolve; });

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
      stop: function () { stopped = true; global.clearTimeout(timer); },
      done
    };
  }

  function runSelfCheck(engine) {
    const records = evaluateDay(engine, true);
    const at23 = records.find((record) => record.hour === 23);
    const at06 = records.find((record) => record.hour === 6);
    const fastTrend = engine.analyzeTrend([10, 16], 16);
    if (typeof engine.reset === "function") engine.reset();
    const priorityCheck = engine.decide(14, 4, 10, 50, 4, [10, 10]);
    const report = {
      samples: records.length,
      hysteresisStable: records.filter((record) => record.decision.ruleId === "NH3_HYSTERESIS_HOLD").length >= 1,
      temperaturePriority: priorityCheck.action === "stop" && priorityCheck.ruleId === "TEMP_DROP_LIMIT",
      expertAdviceAtNight: Boolean(at23 && at23.decision.urgencyLevel === "critical" && at23.decision.humanAdvice.includes("立即清理粪污")),
      morningAdvice: Boolean(at06 && at06.decision.urgencyLevel === "normal" && at06.decision.humanAdvice.includes("注意清晨保温即可")),
      fastTrendWarning: fastTrend.trendWarning === "fast_rising" && fastTrend.trendLabel === "快速恶化",
      priorityCheck,
      at23,
      at06
    };
    console.info("[本地知识库自检]", report);
    return report;
  }

  function CanvasChartFallback(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = config.data;
    this.options = config.options || {};
    this.resize = this.update.bind(this);
    global.addEventListener("resize", this.resize);
    this.update();
  }
  CanvasChartFallback.register = function () {};
  CanvasChartFallback.prototype.update = function () {
    const canvas = this.canvas;
    const host = canvas.parentElement || canvas;
    const rect = host.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 760));
    const height = Math.max(220, Math.round(rect.height || 355));
    const pixelRatio = global.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const ctx = this.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
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
