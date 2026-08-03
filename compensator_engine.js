/**
 * Compensate a highland NH3 sensor reading with the externally loaded model.
 * @param {number} altitude Altitude in metres, calibrated for 2200-3500 m.
 * @param {number} temp Ambient temperature in degrees Celsius, calibrated for -15 to 25 C.
 * @param {number} rh Relative humidity in percent RH, calibrated for 20-85 %RH.
 * @param {number} raw_ppm Uncompensated NH3 sensor reading in ppm.
 * @returns {number} Compensated NH3 concentration in ppm, constrained by MODEL_WEIGHTS.
 * @throws {Error} When the model weight file has not been loaded.
 */
(function (root) {
  "use strict";

  function getWeights() {
    if (!root.MODEL_WEIGHTS) {
      console.error("权重文件未加载");
      throw new Error("权重文件未加载");
    }
    return root.MODEL_WEIGHTS;
  }

  function decode(value, weights) {
    return value / weights.fixedPointScale;
  }

  function clamp(value, lower, upper) {
    return Math.min(upper, Math.max(lower, value));
  }

  root.compensate = function compensate(altitude, temp, rh, raw_ppm) {
    var weights = getWeights();
    var inputs = [Number(altitude), Number(temp), Number(rh), Number(raw_ppm)];
    if (!inputs.every(Number.isFinite)) {
      throw new TypeError("altitude、temp、rh 和 raw_ppm 必须是有限数值");
    }

    var normalized = inputs.map(function (value, featureIndex) {
      return (value - decode(weights.featureMeanQ[featureIndex], weights)) /
        decode(weights.featureStdQ[featureIndex], weights);
    });
    var hidden = Array.from({ length: weights.hiddenUnitCount }, function (_, unitIndex) {
      var sum = decode(weights.b1Q[unitIndex], weights);
      for (var featureIndex = weights.reluFloorQ; featureIndex < weights.featureCount; featureIndex += 1) {
        sum += normalized[featureIndex] * decode(weights.w1Q[featureIndex][unitIndex], weights);
      }
      return Math.max(decode(weights.reluFloorQ, weights), sum);
    });
    var output = decode(weights.b2Q, weights);
    for (var unitIndex = weights.reluFloorQ; unitIndex < weights.hiddenUnitCount; unitIndex += 1) {
      output += hidden[unitIndex] * decode(weights.w2Q[unitIndex], weights);
    }
    var compensated = output * decode(weights.targetStdQ, weights) + decode(weights.targetMeanQ, weights);
    return clamp(compensated, decode(weights.outputMinQ, weights), decode(weights.outputMaxQ, weights));
  };
})(globalThis);
