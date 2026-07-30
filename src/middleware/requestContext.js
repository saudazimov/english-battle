"use strict";

const crypto = require("crypto");

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function incomingRequestId(req) {
  const value = typeof req.get === "function"
    ? req.get("x-request-id")
    : req.headers && req.headers["x-request-id"];
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : null;
}

function createRequestContextMiddleware({
  environment = process.env,
  logger = console,
  randomUUID = () => crypto.randomUUID(),
  now = () => Date.now(),
} = {}) {
  return function requestContext(req, res, next) {
    const requestId = incomingRequestId(req) || randomUUID();
    const startedAt = now();
    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);

    if (environment.NODE_ENV === "production" && typeof res.once === "function") {
      let logged = false;
      const complete = (event) => {
        if (logged) return;
        logged = true;
        const write = typeof logger.info === "function" ? logger.info : logger.log;
        write.call(logger, "HTTP request completed", {
          requestId,
          method: req.method,
          path: String(req.originalUrl || req.url || "").split("?")[0],
          statusCode: res.statusCode,
          durationMs: Math.max(0, now() - startedAt),
          aborted: event === "close" && !res.writableEnded,
        });
      };
      res.once("finish", () => complete("finish"));
      res.once("close", () => complete("close"));
    }

    next();
  };
}

module.exports = { createRequestContextMiddleware, incomingRequestId, REQUEST_ID_PATTERN };
