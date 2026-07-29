const test = require("node:test");
const assert = require("node:assert/strict");
const registerPaymentRoutes = require("../src/routes/paymentRoutes");

test("payment registrar preserves order and factory arguments", () => {
  const calls = [];
  const mounted = [];
  const factory = (name) => (...args) => {
    calls.push([name, args]);
    return `${name}-router`;
  };
  const routeFactories = {
    create: factory("create"),
    status: factory("status"),
    paymeWebhook: factory("payme-webhook"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerPaymentRoutes({ app, routeFactories });

  assert.deepEqual(mounted, [
    "create-router",
    "status-router",
    "payme-webhook-router",
  ]);
  assert.deepEqual(calls, [
    ["create", []],
    ["status", []],
    ["payme-webhook", []],
  ]);
});
