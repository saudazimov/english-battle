"use strict";

const SECRET_ASSIGNMENT = /\b(authorization|cookie|set-cookie|password|passwd|secret|token|jwt|otp|pepper|api[_-]?key|payme[_-]?key|eskiz[_-]?password)\s*[:=]\s*([^\s,;]+)/gi;
const BEARER_TOKEN = /\b(Bearer)\s+[^\s"',;]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?\b/g;
const PHONE_VALUE = /(^|\D)(\+?\d{9,15})(?=\D|$)/g;

function redactString(value) {
  return value
    .replace(BEARER_TOKEN, "$1 [REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(JWT_VALUE, "[REDACTED]")
    .replace(PHONE_VALUE, "$1[REDACTED]");
}

function isSensitiveKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
  return /(authorization|cookie|password|passwd|secret|token|jwt|otp|pepper|apikey|paymekey|phone)/.test(normalized);
}

function sanitizeLogValue(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth >= 8) return "[TRUNCATED]";
  if (Buffer.isBuffer(value)) return `[BUFFER ${value.length} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ""),
      stack: redactString(value.stack || ""),
      code: value.code,
    };
  }

  const result = Array.isArray(value) ? [] : {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? "[REDACTED]"
      : sanitizeLogValue(nestedValue, seen, depth + 1);
  }
  return result;
}

function createStructuredLogger({
  environment = process.env,
  output = console,
  now = () => new Date(),
  service = "ilmliga",
} = {}) {
  const production = environment.NODE_ENV === "production";

  function write(level, method, args) {
    if (!production) return output[method](...args);
    const sanitized = args.map((value) => sanitizeLogValue(value));
    const first = sanitized.shift();
    const entry = {
      timestamp: now().toISOString(),
      level,
      service,
      message: typeof first === "string" ? first : level,
    };
    if (typeof first !== "string") sanitized.unshift(first);
    if (sanitized.length === 1) entry.context = sanitized[0];
    else if (sanitized.length > 1) entry.context = sanitized;
    return output[method](JSON.stringify(entry));
  }

  const logger = {
    log: (...args) => write("info", "log", args),
    info: (...args) => write("info", typeof output.info === "function" ? "info" : "log", args),
    warn: (...args) => write("warn", "warn", args),
    error: (...args) => write("error", "error", args),
  };
  Object.defineProperty(logger, "isStructuredLogger", { value: true });
  return logger;
}

function productionLogger(logger, environment = process.env) {
  const output = logger || console;
  if (environment.NODE_ENV !== "production" || output.isStructuredLogger) return output;
  return createStructuredLogger({ environment, output });
}

module.exports = { createStructuredLogger, productionLogger, redactString, sanitizeLogValue };
