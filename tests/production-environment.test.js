"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectProductionEnvironmentErrors,
  validateProductionEnvironment,
} = require("../src/config/productionEnvironment");

function validProductionEnvironment(overrides = {}) {
  return {
    NODE_ENV: "production",
    CLIENT_ORIGIN: "https://app.ilmliga.uz,https://admin.ilmliga.uz",
    DB_USER: "ilmliga_app",
    DB_PASSWORD: "db-password-unique-2026",
    DB_HOST: "127.0.0.1",
    DB_PORT: "5432",
    DB_NAME: "ilmliga",
    DB_SSL: "false",
    TRUST_PROXY_HOPS: "1",
    JWT_SECRET: "jwt-secret-unique-0123456789-abcdef",
    PARENT_CODE_PEPPER: "parent-pepper-unique-0123456789-ab",
    SCHOOL_INVITE_PEPPER: "school-pepper-unique-0123456789-ab",
    ADMIN_PASSWORD: "admin-password-unique-2026",
    ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
    ESKIZ_EMAIL: "sms@ilmliga.uz",
    ESKIZ_PASSWORD: "eskiz-provider-password",
    PAYME_MERCHANT_ID: "merchant-id",
    PAYME_KEY: "payme-provider-key",
    AI_REPORTS_ENABLED: "false",
    ...overrides,
  };
}

test("development configuration remains unrestricted", () => {
  assert.deepEqual(collectProductionEnvironmentErrors({ NODE_ENV: "development" }), []);
  assert.doesNotThrow(() => validateProductionEnvironment({ NODE_ENV: "test" }));
});

test("complete production configuration passes", () => {
  const environment = validProductionEnvironment();
  assert.deepEqual(collectProductionEnvironmentErrors(environment), []);
  assert.doesNotThrow(() => validateProductionEnvironment(environment));
});

test("missing and unsafe production values stop startup without exposing values", () => {
  const environment = validProductionEnvironment({
    CLIENT_ORIGIN: "https://staging.example.com",
    DB_PASSWORD: "change_me",
    DB_PORT: "70000",
    JWT_SECRET: "secret",
    PARENT_CODE_PEPPER: "same-secret-value-that-is-long-enough-123",
    SCHOOL_INVITE_PEPPER: "same-secret-value-that-is-long-enough-123",
    ADMIN_TOTP_SECRET: "not-base32-secret!",
    ESKIZ_EMAIL: "invalid-email",
    PAYME_KEY: "",
  });

  assert.throws(
    () => validateProductionEnvironment(environment),
    (error) => {
      assert.equal(error.code, "INVALID_PRODUCTION_ENVIRONMENT");
      assert.ok(error.issues.some((issue) => issue.startsWith("PAYME_KEY")));
      assert.ok(error.issues.some((issue) => issue.startsWith("CLIENT_ORIGIN")));
      assert.ok(error.issues.some((issue) => issue.includes("alohida qiymat")));
      assert.ok(error.issues.some((issue) => issue.startsWith("ADMIN_TOTP_SECRET")));
      assert.doesNotMatch(error.message, /same-secret-value/);
      return true;
    }
  );
});

test("enabled AI provider requires its key and model", () => {
  const errors = collectProductionEnvironmentErrors(validProductionEnvironment({
    AI_REPORTS_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "",
  }));

  assert.ok(errors.includes("OPENAI_API_KEY AI hisobotlari yoqilganda majburiy"));
  assert.ok(errors.includes("OPENAI_MODEL AI hisobotlari yoqilganda majburiy"));
});
