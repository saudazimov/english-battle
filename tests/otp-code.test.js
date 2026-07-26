const test = require("node:test");
const assert = require("node:assert/strict");
const { createOtpCodeGenerator } = require("../src/utils/otpCode");

test("OTP code generator preserves random range and string result", () => {
  const calls = [];
  const generateOtpCode = createOtpCodeGenerator({
    randomInt(min, max) {
      calls.push([min, max]);
      return 654321;
    },
  });

  assert.equal(generateOtpCode(), "654321");
  assert.deepEqual(calls, [[100000, 1000000]]);
});

test("OTP code generator preserves six-digit boundary results", () => {
  const minimumGenerator = createOtpCodeGenerator({ randomInt: () => 100000 });
  const maximumGenerator = createOtpCodeGenerator({ randomInt: () => 999999 });

  assert.equal(minimumGenerator(), "100000");
  assert.equal(maximumGenerator(), "999999");
});

test("OTP code generator preserves random source error propagation", () => {
  const generateOtpCode = createOtpCodeGenerator({
    randomInt() {
      throw new Error("random source unavailable");
    },
  });

  assert.throws(generateOtpCode, /random source unavailable/);
});
