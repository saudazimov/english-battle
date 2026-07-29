const test = require("node:test");
const assert = require("node:assert/strict");
const registerQuestRoutes = require("../src/routes/questRoutes");

test("quest route registrar preserves list-before-claim middleware order", () => {
  const mounted = [];
  const getOrCreateDailyQuests = async () => [];
  const pool = { query: async () => ({ rows: [] }) };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerQuestRoutes({ app, getOrCreateDailyQuests, pool });

  assert.equal(mounted.length, 2);
  assert.equal(mounted[0].stack[0].route.path, "/quests");
  assert.equal(mounted[0].stack[0].route.methods.post, true);
  assert.equal(mounted[1].stack[0].route.path, "/quests/claim");
  assert.equal(mounted[1].stack[0].route.methods.post, true);
  assert.equal(mounted[0].stack[0].route.stack.length, 2);
  assert.equal(mounted[1].stack[0].route.stack.length, 2);
});
