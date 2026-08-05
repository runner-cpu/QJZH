/**
 * Highland NH3 compensation model runtime.
 * @param {number} altitude Altitude in metres, calibrated for 2200-3500 m.
 * @param {number} temp Ambient temperature in degrees Celsius, calibrated for -15 to 25 C.
 * @param {number} rh Relative humidity in percent RH, calibrated for 20-85 %RH.
 * @param {number} raw_ppm Uncompensated NH3 sensor reading in ppm.
 * @returns {number} Compensated NH3 concentration in ppm.
 * @throws {Error} When model weights are unavailable or an input is not finite.
 */
(function (root) {
  "use strict";

  /** Return the loaded model weights or throw a diagnosable error. @returns {object} Model weight object. */
  function getWeights() {
    if (!root.MODEL_WEIGHTS) {
      throw new Error("模型权重文件未加载");
    }
    return root.MODEL_WEIGHTS;
  }

  /** Decode a signed Q16.16 integer. @param {number} value Encoded value. @param {object} weights Model metadata. @returns {number} Decoded number. */
  function decode(value, weights) {
    return value / weights.fixedPointScale;
  }

  /** Constrain a numeric value to an inclusive interval. @param {number} value Value to clamp. @param {number} lower Minimum. @param {number} upper Maximum. @returns {number} Clamped value. */
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
      for (var featureIndex = 0; featureIndex < weights.featureCount; featureIndex += 1) {
        sum += normalized[featureIndex] * decode(weights.w1Q[featureIndex][unitIndex], weights);
      }
      return Math.max(0, sum);
    });
    var output = decode(weights.b2Q, weights);
    for (var unitIndex = 0; unitIndex < weights.hiddenUnitCount; unitIndex += 1) {
      output += hidden[unitIndex] * decode(weights.w2Q[unitIndex], weights);
    }
    var compensated = output * decode(weights.targetStdQ, weights) + decode(weights.targetMeanQ, weights);
    return clamp(compensated, decode(weights.outputMinQ, weights), decode(weights.outputMaxQ, weights));
  };
})(globalThis);
