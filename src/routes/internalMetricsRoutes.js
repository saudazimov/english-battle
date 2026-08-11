"use strict";

const crypto = require("node:crypto");
const express = require("express");

const { getSocketObservability } = require("../sockets/socketObservability");
const { getApplicationObservability } = require("../utils/applicationObservability");

const METRICS = [
  ["socket_auth_accepted_total", "counter", "Authenticated Socket.IO connections."],
  ["socket_auth_rejected_total", "counter", "Rejected Socket.IO authentication attempts."],
  ["socket_handshake_errors_total", "counter", "Engine.IO handshake errors."],
  ["socket_connections_total", "counter", "Accepted Socket.IO connections."],
  ["socket_disconnects_total", "counter", "Closed Socket.IO connections."],
  ["socket_connections_active", "gauge", "Currently active Socket.IO connections."],
  ["socket_errors_total", "counter", "Authenticated Socket.IO errors."],
  ["learning_retest_schedule_failures_total", "counter", "Failed initial learning retest scheduling attempts."],
  ["learning_retest_recoveries_total", "counter", "Successfully recovered missing learning retests."],
  ["learning_retest_recovery_backlog", "gauge", "Learning plans still waiting for a missing retest recovery."],
  ["learning_retest_recovery_batch_duration_seconds", "gauge", "Duration of the latest retest recovery batch."],
];

function secureTokenMatches(candidate, expected, cryptoModule = crypto) {
  if (!candidate || !expected) return false;
  const candidateDigest = cryptoModule.createHash("sha256").update(candidate).digest();
  const expectedDigest = cryptoModule.createHash("sha256").update(expected).digest();
  return cryptoModule.timingSafeEqual(candidateDigest, expectedDigest);
}

function metricValue(snapshot, metric) {
  const raw = metric === "socket_connections_active"
    ? snapshot.activeConnections
    : (snapshot.counters && snapshot.counters[metric])
      ?? (snapshot.gauges && snapshot.gauges[metric]);
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function formatPrometheusMetrics(snapshot = {}, applicationSnapshot = {}) {
  const combinedSnapshot = {
    activeConnections: snapshot.activeConnections,
    counters: {
      ...(snapshot.counters || {}),
      ...(applicationSnapshot.counters || {}),
    },
    gauges: {
      ...(snapshot.gauges || {}),
      ...(applicationSnapshot.gauges || {}),
    },
  };
  const lines = [];
  for (const [name, type, help] of METRICS) {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name} ${metricValue(combinedSnapshot, name)}`);
  }
  return `${lines.join("\n")}\n`;
}

function createInternalMetricsRoutes({
  io,
  environment = process.env,
  expressModule = express,
  cryptoModule = crypto,
  observability = getSocketObservability(io),
  applicationObservability = getApplicationObservability(),
} = {}) {
  const router = expressModule.Router();
  const expectedToken = String(environment.METRICS_TOKEN || "").trim();

  router.get("/internal/metrics", (req, res) => {
    const authorization = String(req.headers.authorization || "");
    const candidate = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!secureTokenMatches(candidate, expectedToken, cryptoModule)) {
      return res.status(404).json({ error: "Topilmadi" });
    }

    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return res.send(formatPrometheusMetrics(
      observability.snapshot(),
      applicationObservability.snapshot()
    ));
  });

  return router;
}

module.exports = {
  createInternalMetricsRoutes,
  formatPrometheusMetrics,
  secureTokenMatches,
};
