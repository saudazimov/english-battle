"use strict";

const INTEGER_SETTINGS = {
  DB_POOL_MAX: { property: "max", defaultValue: 10, min: 1, max: 50 },
  DB_IDLE_TIMEOUT_MS: { property: "idleTimeoutMillis", defaultValue: 10000, min: 1000, max: 300000 },
  DB_CONNECTION_TIMEOUT_MS: { property: "connectionTimeoutMillis", defaultValue: 5000, min: 1000, max: 60000 },
  DB_STARTUP_TIMEOUT_MS: { defaultValue: 5000, min: 1000, max: 60000 },
};

function configuredInteger(environment, key) {
  const setting = INTEGER_SETTINGS[key];
  const rawValue = String(environment[key] || "").trim();
  if (!rawValue) return setting.defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < setting.min || value > setting.max) {
    const error = new Error(`${key} ${setting.min}-${setting.max} oralig'idagi butun son bo'lishi kerak`);
    error.code = "INVALID_DATABASE_CONFIGURATION";
    throw error;
  }
  return value;
}

function collectDatabaseConfigurationErrors(environment = process.env) {
  const errors = [];
  for (const key of Object.keys(INTEGER_SETTINGS)) {
    try {
      configuredInteger(environment, key);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

function createDatabasePoolConfig(environment = process.env) {
  const config = {
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    database: environment.DB_NAME,
  };
  for (const [key, setting] of Object.entries(INTEGER_SETTINGS)) {
    if (setting.property) config[setting.property] = configuredInteger(environment, key);
  }
  if (String(environment.DB_SSL || "").toLowerCase() === "true") {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

function databaseStartupTimeout(environment = process.env) {
  return configuredInteger(environment, "DB_STARTUP_TIMEOUT_MS");
}

module.exports = {
  collectDatabaseConfigurationErrors,
  createDatabasePoolConfig,
  databaseStartupTimeout,
};
