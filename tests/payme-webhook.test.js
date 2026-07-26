const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymeWebhookController } = require("../src/controllers/paymeWebhookController");

function createResponse() {
  return {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("Payme webhook delegates the unchanged body and authorization header", async () => {
  const calls = [];
  const result = { jsonrpc: "2.0", id: 77, result: { allow: true } };
  const controller = createPaymeWebhookController({
    payme: {
      handlePaymeRequest: async (body, authorization) => {
        calls.push([body, authorization]);
        return result;
      },
    },
  });
  const request = {
    body: { jsonrpc: "2.0", id: 77, method: "CheckPerformTransaction" },
    headers: { authorization: "Basic test" },
  };
  const response = createResponse();

  await controller.handle(request, response);

  assert.deepEqual(calls, [[request.body, "Basic test"]]);
  assert.deepEqual(response.body, result);
});

test("Payme webhook preserves the existing JSON-RPC server error", async () => {
  const logs = [];
  const controller = createPaymeWebhookController({
    payme: { handlePaymeRequest: async () => { throw new Error("service unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.handle({ body: { id: 77 }, headers: {} }, response);

  assert.deepEqual(response.body, {
    jsonrpc: "2.0",
    id: 77,
    error: { code: -32300, message: "Server xatosi" },
  });
  assert.deepEqual(logs, [["Payme webhook xatosi:", "service unavailable"]]);
});
