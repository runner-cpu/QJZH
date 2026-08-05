/**
 * Highland NH3 compensation model parameters.
 * Training date: 2026-08-03
 * Test-set relative error: 0.71%
 * Feature order: altitude_m, temperature_c, relative_humidity_percent, raw_ppm
 * Encoding: learned numeric parameters use signed Q16.16 integers (value * 65536).
 * Floating-point values are retained in this comment for model-audit comparison.
 * featureMean=[2850.1408655131318,5.106669087071429,52.84587947943286,20.622949102582858]
 * featureStd=[377.303652084789,11.613114836060376,18.933382522249538,11.968223481294146]
 * targetMean=14.872830728735714; targetStd=8.681937983590924
 */
var MODEL_WEIGHTS = Object.freeze({
  version: "1.0.0",
  fixedPointScale: 65536,
  featureOrder: ["altitude_m", "temperature_c", "relative_humidity_percent", "raw_ppm"],
  featureCount: 4,
  hiddenUnitCount: 16,
  reluFloorQ: 0,
  outputMinQ: 0,
  outputMaxQ: 1966080,
  featureMeanQ: [186786832, 334671, 3463308, 1351546],
  featureStdQ: [24726972, 761077, 1240818, 784349],
  targetMeanQ: 974706,
  targetStdQ: 568979,
  w1Q: [[1682, -2051, 33733, 20957, 5176, -3840, -45232, 8622, -60489, -47609, 60666, 35810, -40254, 1451, -3209, -22247], [-10690, -25827, 35720, -7404, -67709, 51843, 59913, -7296, -50251, 89074, 37317, 38216, -4232, 17813, 2420, -60809], [67519, -34419, 62047, -37871, 35028, -26904, -53658, 71174, 33896, 31385, -7905, -8524, 39413, 23772, -25178, -20664], [-10499, -87892, 52763, 34669, 93119, -71597, 56418, -141208, -40641, -1484, -39873, 57716, 50773, 60745, 49910, 57693]],
  b1Q: [-172, -1473, -1571, 1160, 1258, -1318, 878, -9726, -582, -3762, 1373, -664, 9289, 1438, 3719, 3220],
  w2Q: [-1355, -19408, -894, -446, 8766, -11316, 412, -12640, -20, -542, 276, -187, 155, 28426, 35874, -409],
  b2Q: -1465
});

globalThis.MODEL_WEIGHTS = MODEL_WEIGHTS;
