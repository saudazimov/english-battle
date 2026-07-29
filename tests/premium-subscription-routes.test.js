const test = require("node:test");
const assert = require("node:assert/strict");
const registerPremiumSubscriptionRoutes = require(
  "../src/routes/premiumSubscriptionRoutes"
);

test("premium subscription registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const premium = {};
  const logAudit = () => {};
  const current = (...args) => {
    calls.push(["current", args]);
    return "current-router";
  };
  const devActivate = (dependencies) => {
    calls.push(["dev-activate", dependencies]);
    return "dev-activate-router";
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerPremiumSubscriptionRoutes({
    app,
    premium,
    logAudit,
    routeFactories: { current, devActivate },
  });

  assert.deepEqual(mounted, ["current-router", "dev-activate-router"]);
  assert.deepEqual(calls, [
    ["current", []],
    ["dev-activate", { premium, logAudit }],
  ]);
});
