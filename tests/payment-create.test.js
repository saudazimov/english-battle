const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentCreateController } = require("../src/controllers/paymentCreateController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("payment creation preserves the SQL, amount and checkout response", async () => {
  const queries = [];
  const controller = createPaymentCreateController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: [{ id: 9 }] };
      },
    },
    env: { PAYME_MERCHANT_ID: "merchant-1" },
  });
  const response = createResponse();

  await controller.create({
    body: { plan: "student_premium", months: "2" },
    user: { id: 42 },
  }, response);

  assert.deepEqual(queries, [[
    `INSERT INTO payments (user_id, plan, months, amount, provider, status)
       VALUES ($1,$2,$3,$4,'payme','pending') RETURNING id`,
    [42, "student_premium", 2, 10000000],
  ]]);
  const encoded = Buffer.from("m=merchant-1;ac.payment_id=9;a=10000000").toString("base64");
  assert.deepEqual(response.body, {
    payment_id: 9,
    amount: 10000000,
    checkout_url: "https://checkout.paycom.uz/" + encoded,
  });
});

test("payment creation preserves validation responses", async () => {
  const controller = createPaymentCreateController({
    pool: { query: async () => { throw new Error("query must not run"); } },
  });
  const invalidPlan = createResponse();
  const invalidMonths = createResponse();

  await controller.create({ body: { plan: "unknown", months: 1 }, user: { id: 42 } }, invalidPlan);
  await controller.create({ body: { plan: "student_premium", months: 13 }, user: { id: 42 } }, invalidMonths);

  assert.equal(invalidPlan.statusCode, 400);
  assert.deepEqual(invalidPlan.body, { error: "Noto'g'ri plan" });
  assert.equal(invalidMonths.statusCode, 400);
  assert.deepEqual(invalidMonths.body, { error: "1-12 oy oralig'ida" });
});

test("payment creation still inserts before reporting missing merchant config", async () => {
  let queryCount = 0;
  const controller = createPaymentCreateController({
    pool: { query: async () => { queryCount += 1; return { rows: [{ id: 9 }] }; } },
    env: {},
  });
  const response = createResponse();

  await controller.create({ body: { plan: "parent_premium" }, user: { id: 42 } }, response);

  assert.equal(queryCount, 1);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: "To'lov tizimi hozircha sozlanmagan" });
});

test("payment creation preserves the existing database error response", async () => {
  const logs = [];
  const controller = createPaymentCreateController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    env: { PAYME_MERCHANT_ID: "merchant-1" },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.create({ body: { plan: "teacher_pro", months: 1 }, user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Payment create xatosi:", "database unavailable"]]);
});
