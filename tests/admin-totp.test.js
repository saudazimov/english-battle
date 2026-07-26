const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { decodeBase32 } = require("../src/utils/base32");
const { createAdminTotpValidator } = require("../src/utils/adminTotp");

const SECRET = "JBSWY3DPEHPK3PXP";
const NOW = 1720000000000;

function codeForStep(step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", decodeBase32(SECRET)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, "0");
}

test("admin TOTP preserves missing-secret environment behavior", () => {
  const productionValidator = createAdminTotpValidator({ environment: { NODE_ENV: "production" } });
  const developmentValidator = createAdminTotpValidator({ environment: { NODE_ENV: "development" } });

  assert.equal(productionValidator("123456"), false);
  assert.equal(developmentValidator("invalid"), true);
});

test("admin TOTP preserves current and adjacent step acceptance", () => {
  const currentStep = Math.floor(NOW / 30000);
  const validator = createAdminTotpValidator({
    environment: { NODE_ENV: "production", ADMIN_TOTP_SECRET: SECRET },
    now: () => NOW,
  });

  assert.equal(validator(codeForStep(currentStep - 1)), true);
  assert.equal(validator(codeForStep(currentStep)), true);
  assert.equal(validator(codeForStep(currentStep + 1)), true);
  assert.equal(validator(codeForStep(currentStep + 2)), false);
});

test("admin TOTP preserves code format and invalid-secret rejection", () => {
  let decodeCalls = 0;
  const formatValidator = createAdminTotpValidator({
    environment: { NODE_ENV: "production", ADMIN_TOTP_SECRET: SECRET },
    decodeSecret() { decodeCalls += 1; return decodeBase32(SECRET); },
    now: () => NOW,
  });
  const invalidSecretValidator = createAdminTotpValidator({
    environment: { NODE_ENV: "production", ADMIN_TOTP_SECRET: "***" },
    now: () => NOW,
  });

  assert.equal(formatValidator("12345"), false);
  assert.equal(formatValidator("1234567"), false);
  assert.equal(formatValidator("abcdef"), false);
  assert.equal(decodeCalls, 0);
  assert.equal(invalidSecretValidator("123456"), false);
});
