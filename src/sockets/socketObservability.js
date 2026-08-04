"use strict";

const { productionLogger } = require("../utils/structuredLogger");

const observers = new WeakMap();
const DISCONNECT_REASONS = new Set([
  "client namespace disconnect",
  "forced close",
  "forced server close",
  "parse error",
  "ping timeout",
  "server namespace disconnect",
  "server shutting down",
  "transport close",
  "transport error",
]);

const noopObservability = Object.freeze({
  authenticationAccepted() {},
  authenticationRejected() {},
  connectionOpened() {},
  observeServer() {},
  snapshot: () => ({ activeConnections: 0, counters: {} }),
});

function safeCode(value) {
  const code = String(value || "unknown");
  return /^[a-z0-9_-]{1,40}$/i.test(code) ? code : "other";
}

function safeDisconnectReason(value) {
  return DISCONNECT_REASONS.has(value) ? value : "other";
}

function createSocketObservability({
  logger = console,
  environment = process.env,
} = {}) {
  const output = productionLogger(logger, environment);
  const writeMetric = typeof output.info === "function"
    ? output.info.bind(output)
    : typeof output.log === "function"
      ? output.log.bind(output)
      : () => {};
  const observedSockets = new WeakSet();
  const counters = Object.create(null);
  let activeConnections = 0;

  function emit(metric, type, value, details = {}) {
    writeMetric("socket_metric", {
      component: "socket.io",
      metric,
      type,
      value,
      ...details,
    });
  }

  function increment(metric, details) {
    counters[metric] = (counters[metric] || 0) + 1;
    emit(metric, "counter", counters[metric], details);
  }

  function authenticationAccepted() {
    increment("socket_auth_accepted_total");
  }

  function authenticationRejected(reason) {
    increment("socket_auth_rejected_total", { reason: safeCode(reason) });
  }

  function observeServer(io) {
    if (!io || !io.engine || typeof io.engine.on !== "function") return;
    io.engine.on("connection_error", (error) => {
      increment("socket_handshake_errors_total", { errorCode: safeCode(error && error.code) });
    });
  }

  function connectionOpened(socket) {
    if (!socket || typeof socket !== "object" || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    activeConnections += 1;
    increment("socket_connections_total");
    emit("socket_connections_active", "gauge", activeConnections);
    if (typeof socket.on !== "function") return;

    let disconnected = false;
    socket.on("disconnect", (reason) => {
      if (disconnected) return;
      disconnected = true;
      activeConnections = Math.max(0, activeConnections - 1);
      increment("socket_disconnects_total", { reason: safeDisconnectReason(reason) });
      emit("socket_connections_active", "gauge", activeConnections);
    });
    socket.on("error", (error) => {
      increment("socket_errors_total", { errorCode: safeCode(error && error.code) });
    });
  }

  function snapshot() {
    return { activeConnections, counters: { ...counters } };
  }

  return {
    authenticationAccepted,
    authenticationRejected,
    connectionOpened,
    observeServer,
    snapshot,
  };
}

function bindSocketObservability(io, observability) {
  if (io && typeof io === "object") observers.set(io, observability);
}

function getSocketObservability(io) {
  return (io && typeof io === "object" && observers.get(io)) || noopObservability;
}

module.exports = {
  bindSocketObservability,
  createSocketObservability,
  getSocketObservability,
};
