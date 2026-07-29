const test = require("node:test");
const assert = require("node:assert/strict");

const registerModerationFeatureRoutes = require(
  "../src/routes/moderationFeatureRoutes"
);

test("moderation feature preserves flags-before-message-review order", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const logAudit = () => {};
  const routes = {
    registerFlags(dependencies) {
      calls.push(["flags", dependencies]);
    },
    registerMessageReview(dependencies) {
      calls.push(["message-review", dependencies]);
    },
  };

  registerModerationFeatureRoutes({ app, pool, logAudit, routes });

  assert.deepEqual(calls, [
    ["flags", { app, pool, logAudit }],
    ["message-review", { app }],
  ]);
});
