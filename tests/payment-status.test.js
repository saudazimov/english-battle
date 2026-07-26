const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentStatusController } = require("../src/controllers/paymentStatusController");

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

test("payment status preserves the query and response", async () => {
  const payment = { id: 17, status: "pending", plan: "student_premium", amount: 5000000 };
  const queries = [];
  const controller = createPaymentStatusController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: [payment] };
      },
    },
  });
  const response = createResponse();

  await controller.status({ params: { id: "17" }, user: { id: 42 } }, response);

  assert.deepEqual(queries, [[
    "SELECT id, status, plan, amount FROM payments WHERE id=$1 AND user_id=$2",
    [17, 42],
  ]]);
  assert.deepEqual(response.body, payment);
});

test("payment status preserves the not-found response", async () => {
  const controller = createPaymentStatusController({
    pool: { query: async () => ({ rows: [] }) },
  });
  const response = createResponse();

  await controller.status({ params: { id: "17" }, user: { id: 42 } }, response);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Topilmadi" });
});

test("payment status preserves the existing database error response", async () => {
  const controller = createPaymentStatusController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
  });
  const response = createResponse();

  await controller.status({ params: { id: "17" }, user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});
