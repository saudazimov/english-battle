const test = require("node:test");
const assert = require("node:assert/strict");

const { validatePassword } = require("../src/utils/passwordValidator");

test("password validator preserves missing and minimum-length errors", () => {
  assert.deepEqual(validatePassword(), {
    valid: false,
    error: "Parol kamida 8 belgi bo'lishi kerak",
  });
  assert.deepEqual(validatePassword("Abc1234"), {
    valid: false,
    error: "Parol kamida 8 belgi bo'lishi kerak",
  });
});

test("password validator preserves letter and number requirements", () => {
  assert.deepEqual(validatePassword("12345678"), {
    valid: false,
    error: "Parolda kamida bitta harf bo'lishi kerak",
  });
  assert.deepEqual(validatePassword("abcdefgh"), {
    valid: false,
    error: "Parolda kamida bitta raqam bo'lishi kerak",
  });
});

test("password validator preserves maximum length and validation order", () => {
  assert.deepEqual(validatePassword("a1" + "x".repeat(127)), {
    valid: false,
    error: "Parol juda uzun (maksimal 128 belgi)",
  });
  assert.deepEqual(validatePassword("x".repeat(129)), {
    valid: false,
    error: "Parolda kamida bitta raqam bo'lishi kerak",
  });
});

test("password validator preserves valid password response", () => {
  assert.deepEqual(validatePassword("Password1"), { valid: true });
  assert.deepEqual(validatePassword("a1" + "x".repeat(126)), { valid: true });
});
