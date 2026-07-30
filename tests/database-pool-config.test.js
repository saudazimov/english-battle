"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectDatabaseConfigurationErrors,
  createDatabasePoolConfig,
  databaseStartupTimeout,
} = require("../src/config/databasePoolConfig");
const { collectProductionEnvironmentErrors } = require("../src/config/productionEnvironment");

test("database pool config applies bounded defaults without changing connection fields", () => {
  const config = createDatabasePoolConfig({
    DB_USER: "user",
    DB_PASSWORD: "password",
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_NAME: "database",
    DB_SSL: "false",
  });

  assert.deepEqual(config, {
    user: "user",
    password: "password",
    host: "localhost",
    port: "5432",
    database: "database",
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
  assert.equal(databaseStartupTimeout({}), 5000);
});

test("database pool config accepts valid overrides and preserves SSL behavior", () => {
  const environment = {
    DB_SSL: "true",
    DB_POOL_MAX: "20",
    DB_IDLE_TIMEOUT_MS: "45000",
    DB_CONNECTION_TIMEOUT_MS: "7000",
    DB_STARTUP_TIMEOUT_MS: "8000",
  };
  const config = createDatabasePoolConfig(environment);

  assert.equal(config.max, 20);
  assert.equal(config.idleTimeoutMillis, 45000);
  assert.equal(config.connectionTimeoutMillis, 7000);
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(databaseStartupTimeout(environment), 8000);
});

test("invalid database limits are rejected and included in production validation", () => {
  const environment = {
    DB_POOL_MAX: "0",
    DB_IDLE_TIMEOUT_MS: "999",
    DB_CONNECTION_TIMEOUT_MS: "not-a-number",
    DB_STARTUP_TIMEOUT_MS: "60001",
  };
  const errors = collectDatabaseConfigurationErrors(environment);

  assert.equal(errors.length, 4);
  assert.throws(
    () => createDatabasePoolConfig(environment),
    (error) => error.code === "INVALID_DATABASE_CONFIGURATION"
  );
  const productionErrors = collectProductionEnvironmentErrors({
    NODE_ENV: "production",
    ...environment,
  });
  for (const key of Object.keys(environment)) {
    assert.equal(productionErrors.some((error) => error.startsWith(key)), true);
  }
});
