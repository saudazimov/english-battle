const test = require("node:test");
const assert = require("node:assert/strict");

const { createDailyQuestProgressService } = require("../src/services/dailyQuestProgressService");

const UPDATE_SQL = `UPDATE user_quests
           SET progress = $1, is_completed = $2
           WHERE id = $3`;

test("daily quest progress preserves quest-type increments and caps", async () => {
  const queryCalls = [];
  const lookupCalls = [];
  const quests = [
    { id: 1, quest_type: "play_battles", progress: 0, target: 3, is_completed: false },
    { id: 2, quest_type: "win_battles", progress: 1, target: 2, is_completed: false },
    { id: 3, quest_type: "correct_answers", progress: 4, target: 5, is_completed: false },
    { id: 4, quest_type: "earn_xp", progress: 1, target: 10, is_completed: false },
    { id: 5, quest_type: "play_battles", progress: 3, target: 3, is_completed: true },
    { id: 6, quest_type: "unknown", progress: 0, target: 1, is_completed: false },
  ];
  const service = createDailyQuestProgressService({
    pool: {
      async query(sql, params) {
        queryCalls.push({ sql, params });
      },
    },
    async getOrCreateDailyQuests(userId) {
      lookupCalls.push(userId);
      return quests;
    },
    logger: { error() { throw new Error("must not log"); } },
  });

  const result = await service(44, { won: true, correctAnswers: 3, xpEarned: 2 });

  assert.equal(result, undefined);
  assert.deepEqual(lookupCalls, [44]);
  assert.deepEqual(queryCalls, [
    { sql: UPDATE_SQL, params: [1, false, 1] },
    { sql: UPDATE_SQL, params: [2, true, 2] },
    { sql: UPDATE_SQL, params: [5, true, 3] },
    { sql: UPDATE_SQL, params: [3, false, 4] },
  ]);
});

test("daily quest progress preserves zero-increment skipping", async () => {
  let queryCalls = 0;
  const service = createDailyQuestProgressService({
    pool: { async query() { queryCalls += 1; } },
    async getOrCreateDailyQuests() {
      return [
        { id: 1, quest_type: "win_battles", progress: 0, target: 2 },
        { id: 2, quest_type: "correct_answers", progress: 0, target: 2 },
        { id: 3, quest_type: "earn_xp", progress: 0, target: 2 },
      ];
    },
    logger: { error() { throw new Error("must not log"); } },
  });

  await service(7, { won: false, correctAnswers: 0, xpEarned: -1 });

  assert.equal(queryCalls, 0);
});

test("daily quest progress preserves safe lookup-error logging", async () => {
  const logs = [];
  const service = createDailyQuestProgressService({
    pool: { async query() { throw new Error("must not update"); } },
    async getOrCreateDailyQuests() { throw new Error("database unavailable"); },
    logger: { error(...args) { logs.push(args); } },
  });

  const result = await service(5, { won: true, correctAnswers: 1, xpEarned: 10 });

  assert.equal(result, undefined);
  assert.deepEqual(logs, [["Quest progress xatosi:", "database unavailable"]]);
});

test("daily quest progress preserves missing-result argument rejection", async () => {
  const service = createDailyQuestProgressService({
    pool: {},
    async getOrCreateDailyQuests() { return []; },
    logger: { error() { throw new Error("must not log"); } },
  });

  await assert.rejects(() => service(5), TypeError);
});
