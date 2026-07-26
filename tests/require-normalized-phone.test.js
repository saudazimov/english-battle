const test = require("node:test");
const assert = require("node:assert/strict");

const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("normalized-phone middleware preserves invalid response", () => {
  const response = createResponse();
  let nextCalls = 0;

  requireNormalizedPhone({ body: {} }, response, () => { nextCalls += 1; });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    error: "Telefon raqamini xalqaro formatda kiriting",
  });
  assert.equal(nextCalls, 0);
});

test("normalized-phone middleware preserves missing-body response", () => {
  const response = createResponse();
  let nextCalls = 0;

  requireNormalizedPhone({}, response, () => { nextCalls += 1; });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    error: "Telefon raqamini xalqaro formatda kiriting",
  });
  assert.equal(nextCalls, 0);
});

test("normalized-phone middleware mutates the body before next", () => {
  const request = { body: { phone: " +998 (90) 123-45.67 ", keep: true } };
  const response = createResponse();
  let phoneSeenByNext;

  requireNormalizedPhone(request, response, () => {
    phoneSeenByNext = request.body.phone;
  });

  assert.equal(phoneSeenByNext, "+998901234567");
  assert.deepEqual(request.body, { phone: "+998901234567", keep: true });
  assert.equal(response.statusCode, null);
  assert.equal(response.payload, null);
});
