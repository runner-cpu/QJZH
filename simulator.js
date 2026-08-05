(function (global) {
  "use strict";

  // 闈掓捣鍐24灏忔椂鍓栭潰锛?3:00 淇濇寔24.9ppm銆?0%婀垮害銆?.6鈩冿紝鐢ㄤ簬楠岃瘉澶滈棿澶氬洜瀛愬缓璁€?
  /**
   * @param {number} altitude Altitude in metres.
   * @returns {number} Estimated atmospheric pressure in kPa.
   */
  function estimatePressureKpa(altitude) {
    return 101.325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
  }

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
      const pressure = estimatePressureKpa(altitude);
      const lowPressure = (101.325 - pressure) / 101.325;
      const nonlinearError = Math.min(.40, Math.max(.35, .29 + .21 * lowPressure + .025 * ((temperature - 5) / 20) ** 2 + .02 * ((humidity - 52.5) / 32.5) ** 2));
      const rawAmmonia = targetAmmonia * (1 + nonlinearError) + .1 + .06 * lowPressure;
      const compensated = global.compensate(altitude, temperature, humidity, rawAmmonia);

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
      if (logDecisions) console.log("[鏈湴鐭ヨ瘑搴揮", record.time, decision);
      return record;
    });
  }

  function runSimulation(engine, updateUICallback) {
    const records = evaluateDay(engine, false);
    let index = 0;
    let timer = null;
    let stopped = false;
    let paused = false;
    let finished = false;
    let resolveDone;
    const done = new Promise(function (resolve) { resolveDone = resolve; });

    function advance() {
      if (stopped || paused) return;
      if (index >= records.length) {
        finished = true;
        resolveDone(records);
        return;
      }
      updateUICallback(records[index], index, records);
      index += 1;
      timer = global.setTimeout(advance, 1000);
    }

    advance();
    return {
      /** Pause without clearing the rendered samples; resume continues at the next record. */
      pause: function () {
        if (stopped || finished) return;
        paused = true;
        global.clearTimeout(timer);
      },
      /** Resume the current run; returns false after stop or completion. */
      resume: function () {
        if (stopped || finished) return false;
        paused = false;
        advance();
        return true;
      },
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
      expertAdviceAtNight: Boolean(at23 && at23.decision.urgencyLevel === "critical" && at23.decision.humanAdvice.includes("绔嬪嵆娓呯悊绮薄")),
      morningAdvice: Boolean(at06 && at06.decision.urgencyLevel === "normal" && at06.decision.humanAdvice.includes("娉ㄦ剰娓呮櫒淇濇俯鍗冲彲")),
      fastTrendWarning: fastTrend.trendWarning === "fast_rising",
      priorityCheck,
      at23,
      at06
    };
    console.info("[鏈湴鐭ヨ瘑搴撹嚜妫€]", report);
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
    // 浣跨敤鐙珛鐨勪富杞村拰鍏夌収鍙宠酱锛岄伩鍏?Lux 鐨勫ぇ鑼冨洿鎶婃俯婀垮害涓庢皑姘斿帇鎴愮洿绾裤€?    const pad = { left: 52, right: 52, top: 48, bottom: 34 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const datasets = this.data.datasets || [];
    const mainDatasets = datasets.filter(function (dataset) { return dataset.yAxisID !== "yLight"; });
    const lightDatasets = datasets.filter(function (dataset) { return dataset.yAxisID === "yLight"; });
    const valuesOf = function (items) {
      return items.flatMap(function (dataset) { return dataset.data.filter(Number.isFinite); });
    };
    const mainValues = valuesOf(mainDatasets);
    const lightValues = valuesOf(lightDatasets);
    const scaleOptions = this.options.scales || {};
    const mainOptions = scaleOptions.y || {};
    const lightOptions = scaleOptions.yLight || {};
    const min = Number.isFinite(mainOptions.suggestedMin) ? mainOptions.suggestedMin : Math.min(-5, ...mainValues);
    const max = Math.max(
      Number.isFinite(mainOptions.suggestedMax) ? mainOptions.suggestedMax : 30,
      ...mainValues
    );
    const lightMin = Number.isFinite(lightOptions.suggestedMin) ? lightOptions.suggestedMin : 0;
    const lightMax = Math.max(
      Number.isFinite(lightOptions.suggestedMax) ? lightOptions.suggestedMax : 1000,
      ...lightValues
    );
    const yFor = function (value, axis) {
      const axisMin = axis === "light" ? lightMin : min;
      const axisMax = axis === "light" ? lightMax : max;
      return pad.top + (axisMax - value) / Math.max(1, axisMax - axisMin) * plotH;
    };
    const xFor = function (index, length) {
      return pad.left + (length < 2 ? 0 : index / (length - 1) * plotW);
    };

    // 缁樺埗鍥句緥锛岃鏃?Chart.js 鏃剁殑鏈湴闄嶇骇妯″紡浠嶇劧鍏峰鍙鐨勫浘渚嬨€?    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    let legendX = pad.left;
    let legendY = 15;
    datasets.filter(function (dataset) { return dataset.id !== "ventilationMarkers"; }).forEach(function (dataset) {
      const label = String(dataset.label || "");
      const itemWidth = ctx.measureText(label).width + 34;
      if (legendX > pad.left && legendX + itemWidth > width - pad.right) {
        legendX = pad.left;
        legendY += 18;
      }
      ctx.save();
      ctx.strokeStyle = dataset.borderColor || "#00d4aa";
      ctx.lineWidth = dataset.borderWidth || 2;
      ctx.setLineDash(dataset.borderDash || []);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 16, legendY);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#b9cbd8";
      ctx.fillText(label, legendX + 22, legendY);
      legendX += itemWidth;
    });

    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = pad.top + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    }
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "#7a9bb5";
    for (let i = 0; i < 5; i += 1) {
      const value = min + (max - min) * (4 - i) / 4;
      ctx.fillText(value.toFixed(value % 1 ? 1 : 0), pad.left - 8, pad.top + plotH * i / 4);
    }
    ctx.textAlign = "left";
    for (let i = 0; i < 5; i += 1) {
      const value = lightMin + (lightMax - lightMin) * (4 - i) / 4;
      ctx.fillText(`${Math.round(value)} Lux`, width - pad.right + 8, pad.top + plotH * i / 4);
    }

    // 姘ㄦ皵 15ppm 闃堝€间娇鐢ㄤ富杞寸粯鍒讹紝鍜岀湡瀹?Chart.js 鎻掍欢淇濇寔涓€鑷淬€?    const thresholdY = yFor(15, "main");
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(255, 77, 94, 0.9)";
    ctx.beginPath();
    ctx.moveTo(pad.left, thresholdY);
    ctx.lineTo(width - pad.right, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff6b6b";
    ctx.textAlign = "left";
    ctx.fillText("NH3 15ppm threshold", pad.left + 8, thresholdY - 8);
    ctx.restore();

    datasets.forEach(function (dataset) {
      const values = dataset.data;
      const axis = dataset.yAxisID === "yLight" ? "light" : "main";
      ctx.strokeStyle = dataset.borderColor || "#00d4aa";
      ctx.fillStyle = dataset.pointBackgroundColor || dataset.borderColor || "#00d4aa";
      ctx.lineWidth = dataset.borderWidth || 2;
      ctx.setLineDash(dataset.borderDash || []);
      let lastPoint = null;
      values.forEach(function (value, index) {
        if (!Number.isFinite(value)) {
          if (lastPoint) ctx.stroke();
          lastPoint = null;
          return;
        }
        const point = { x: xFor(index, values.length), y: yFor(value, axis) };
        if (!lastPoint) {
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
        } else {
          const middleX = (lastPoint.x + point.x) / 2;
          const middleY = (lastPoint.y + point.y) / 2;
          ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, middleX, middleY);
          ctx.quadraticCurveTo(point.x, point.y, point.x, point.y);
        }
        lastPoint = point;
      });
      if (lastPoint) ctx.stroke();
      ctx.setLineDash([]);
      if (dataset.pointRadius) values.forEach(function (value, index) {
        if (!Number.isFinite(value)) return;
        const x = xFor(index, values.length);
        ctx.beginPath(); ctx.arc(x, yFor(value, axis), typeof dataset.pointRadius === "number" ? dataset.pointRadius : 4, 0, Math.PI * 2); ctx.fill();
      });
    });

    // 缁樺埗灏戦噺鏃堕棿鍒诲害锛屼繚璇侀暱鏍囩涓嶄細鎸ゅ湪涓€璧枫€?    ctx.fillStyle = "#7a9bb5";
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    const labels = this.data.labels || [];
    const tickStep = Math.max(1, Math.ceil(Math.max(0, labels.length - 1) / 6));
    labels.forEach(function (label, index) {
      if (index !== 0 && index !== labels.length - 1 && index % tickStep !== 0) return;
      ctx.fillText(String(label), xFor(index, labels.length), height - 12);
    });
    ctx.textAlign = "left";
    ctx.fillText("鏈湴澶氳酱鍥捐〃妯″紡", pad.left, height - 2);
  };

  if (!global.Chart) global.Chart = CanvasChartFallback;
  global.LocalSimulator = Object.freeze({ createWinterDayData, runSimulation, runSelfCheck, estimatePressureKpa });
})(window);
