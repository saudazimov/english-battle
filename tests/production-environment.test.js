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
    METRICS_TOKEN: "metrics-token-unique-0123456789-abcdef",
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
    METRICS_TOKEN: "short",
  });

  assert.throws(
    () => validateProductionEnvironment(environment),
    (error) => {
      assert.equal(error.code, "INVALID_PRODUCTION_ENVIRONMENT");
      assert.ok(error.issues.some((issue) => issue.startsWith("CLIENT_ORIGIN")));
      assert.ok(error.issues.some((issue) => issue.includes("alohida qiymat")));
      assert.ok(error.issues.some((issue) => issue.startsWith("ADMIN_TOTP_SECRET")));
      assert.ok(error.issues.some((issue) => issue.startsWith("METRICS_TOKEN")));
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
  assert.ok(errors.some((issue) => issue.startsWith("AI_MONTHLY_HARD_LIMIT_USD")));
});

test("Payme is optional but partial configuration is rejected", () => {
  assert.deepEqual(collectProductionEnvironmentErrors(validProductionEnvironment()), []);
  const errors = collectProductionEnvironmentErrors(validProductionEnvironment({
    PAYMENTS_ENABLED: "true",
    PAYME_MERCHANT_ID: "merchant-id",
    PAYME_KEY: "",
  }));
  assert.ok(errors.includes("PAYME_KEY Payme sozlanganda majburiy"));
});

test("enabled production AI requires explicit pricing and a persistent hard limit", () => {
  const validAi = validProductionEnvironment({
    AI_REPORTS_ENABLED: "true", AI_PROVIDER: "openai",
    OPENAI_API_KEY: "project-secret", OPENAI_MODEL: "gpt-4o-mini",
    AI_INPUT_COST_PER_MILLION: "0.15", AI_OUTPUT_COST_PER_MILLION: "0.60",
    AI_MONTHLY_HARD_LIMIT_USD: "25", AI_BUDGET_RESERVATION_TTL_MINUTES: "15",
  });
  assert.deepEqual(collectProductionEnvironmentErrors(validAi), []);

  const errors = collectProductionEnvironmentErrors({
    ...validAi,
    AI_INPUT_COST_PER_MILLION: "0",
    AI_MONTHLY_HARD_LIMIT_USD: "invalid",
    AI_BUDGET_RESERVATION_TTL_MINUTES: "0",
  });
  assert.ok(errors.some((issue) => issue.startsWith("AI_INPUT_COST_PER_MILLION")));
  assert.ok(errors.some((issue) => issue.startsWith("AI_MONTHLY_HARD_LIMIT_USD")));
  assert.ok(errors.some((issue) => issue.startsWith("AI_BUDGET_RESERVATION_TTL_MINUTES")));
});
