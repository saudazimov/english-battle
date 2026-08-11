"use strict";

let sharedObservability;

function createApplicationObservability() {
  const counters = Object.create(null);
  const gauges = Object.create(null);

  function safeMetricValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new TypeError("Metric value must be a finite non-negative number");
    }
    return numeric;
  }

  return {
    increment(metric, amount = 1) {
      counters[metric] = (counters[metric] || 0) + safeMetricValue(amount);
      return counters[metric];
    },

    setGauge(metric, value) {
      gauges[metric] = safeMetricValue(value);
      return gauges[metric];
    },

    snapshot() {
      return { counters: { ...counters },gauges: { ...gauges } };
    },
  };
}

function getApplicationObservability() {
  if (!sharedObservability) sharedObservability = createApplicationObservability();
  return sharedObservability;
}

module.exports = {
  createApplicationObservability,
  getApplicationObservability,
};
