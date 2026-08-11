"use strict";

const { collectDatabaseConfigurationErrors } = require("./databasePoolConfig");

const REQUIRED_FIELDS = [
  "CLIENT_ORIGIN", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME", "DB_SSL",
  "JWT_SECRET", "PARENT_CODE_PEPPER", "SCHOOL_INVITE_PEPPER",
  "ADMIN_PASSWORD", "ADMIN_TOTP_SECRET",
  "ESKIZ_EMAIL", "ESKIZ_PASSWORD", "PAYME_MERCHANT_ID", "PAYME_KEY",
  "METRICS_TOKEN",
];

const SECRET_MIN_LENGTHS = {
  DB_PASSWORD: 12,
  JWT_SECRET: 32,
  PARENT_CODE_PEPPER: 32,
  SCHOOL_INVITE_PEPPER: 32,
  ADMIN_PASSWORD: 12,
  ADMIN_TOTP_SECRET: 16,
  METRICS_TOKEN: 32,
};

const PLACEHOLDER_PATTERN = /^(change[_-]?me|replace[_-]?me|your[_-].+|password|secret|example|test|todo)$/i;

function valueOf(environment, key) {
  return String(environment[key] || "").trim();
}

function validateOrigins(rawOrigins, errors) {
  const origins = rawOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      const exactOrigin = url.origin === origin && !url.username && !url.password;
      const exampleHost = url.hostname === "example.com" || url.hostname.endsWith(".example.com");
      if (url.protocol !== "https:" || !exactOrigin || exampleHost) throw new Error();
    } catch {
      errors.push("CLIENT_ORIGIN faqat haqiqiy HTTPS originlardan iborat bo'lishi kerak");
      return;
    }
  }
}

function validateAiConfiguration(environment, errors) {
  if (valueOf(environment, "AI_REPORTS_ENABLED").toLowerCase() !== "true") return;
  const provider = valueOf(environment, "AI_PROVIDER").toLowerCase();
  if (!["anthropic", "openai"].includes(provider)) {
    errors.push("AI_PROVIDER anthropic yoki openai bo'lishi kerak");
    return;
  }
  const prefix = provider === "anthropic" ? "ANTHROPIC" : "OPENAI";
  for (const suffix of ["API_KEY", "MODEL"]) {
    if (!valueOf(environment, `${prefix}_${suffix}`)) {
      errors.push(`${prefix}_${suffix} AI hisobotlari yoqilganda majburiy`);
    }
  }
  for (const key of ["AI_INPUT_COST_PER_MILLION", "AI_OUTPUT_COST_PER_MILLION", "AI_MONTHLY_HARD_LIMIT_USD"]) {
    const value = Number(valueOf(environment, key));
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${key} AI hisobotlari yoqilgan productionda musbat son bo'lishi kerak`);
    }
  }
  const reservationTtl = Number(valueOf(environment, "AI_BUDGET_RESERVATION_TTL_MINUTES"));
  if (!Number.isInteger(reservationTtl) || reservationTtl < 1 || reservationTtl > 1440) {
    errors.push("AI_BUDGET_RESERVATION_TTL_MINUTES 1-1440 oralig'idagi butun son bo'lishi kerak");
  }
}

function collectProductionEnvironmentErrors(environment = process.env) {
  if (valueOf(environment, "NODE_ENV") !== "production") return [];
  const errors = [];

  for (const key of REQUIRED_FIELDS) {
    const value = valueOf(environment, key);
    if (!value) errors.push(`${key} majburiy`);
    else if (PLACEHOLDER_PATTERN.test(value)) errors.push(`${key} placeholder qiymat bo'lmasligi kerak`);
  }
  for (const [key, minLength] of Object.entries(SECRET_MIN_LENGTHS)) {
    const value = valueOf(environment, key);
    if (value && value.length < minLength) {
      errors.push(`${key} kamida ${minLength} belgidan iborat bo'lishi kerak`);
    }
  }

  const secrets = Object.keys(SECRET_MIN_LENGTHS)
    .map((key) => [key, valueOf(environment, key)])
    .filter(([, value]) => value);
  for (let index = 0; index < secrets.length; index += 1) {
    const duplicate = secrets.slice(index + 1).find(([, value]) => value === secrets[index][1]);
    if (duplicate) errors.push(`${secrets[index][0]} va ${duplicate[0]} alohida qiymatga ega bo'lishi kerak`);
  }

  const dbPort = Number(valueOf(environment, "DB_PORT"));
  if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
    errors.push("DB_PORT 1-65535 oralig'idagi port bo'lishi kerak");
  }
  if (!/^(true|false)$/i.test(valueOf(environment, "DB_SSL"))) {
    errors.push("DB_SSL true yoki false bo'lishi kerak");
  }
  const trustProxy = valueOf(environment, "TRUST_PROXY_HOPS");
  if (trustProxy && (!/^\d+$/.test(trustProxy) || Number(trustProxy) > 10)) {
    errors.push("TRUST_PROXY_HOPS 0-10 oralig'idagi butun son bo'lishi kerak");
  }
  const origins = valueOf(environment, "CLIENT_ORIGIN");
  if (origins) validateOrigins(origins, errors);
  const eskizEmail = valueOf(environment, "ESKIZ_EMAIL");
  if (eskizEmail && !/^\S+@\S+\.\S+$/.test(eskizEmail)) errors.push("ESKIZ_EMAIL haqiqiy email bo'lishi kerak");
  const totpSecret = valueOf(environment, "ADMIN_TOTP_SECRET");
  if (totpSecret && !/^[A-Z2-7]+=*$/i.test(totpSecret)) errors.push("ADMIN_TOTP_SECRET Base32 formatida bo'lishi kerak");
  errors.push(...collectDatabaseConfigurationErrors(environment));
  validateAiConfiguration(environment, errors);
  return [...new Set(errors)];
}

function validateProductionEnvironment(environment = process.env) {
  const errors = collectProductionEnvironmentErrors(environment);
  if (!errors.length) return;
  const error = new Error(`Production konfiguratsiyasi xavfsiz emas:\n- ${errors.join("\n- ")}`);
  error.code = "INVALID_PRODUCTION_ENVIRONMENT";
  error.issues = errors;
  throw error;
}

module.exports = { collectProductionEnvironmentErrors, validateProductionEnvironment };
