const test = require("node:test");
const assert = require("node:assert/strict");

const { createDailyQuestService } = require("../src/services/dailyQuestService");

const DAILY_QUESTS_SQL = `SELECT uq.id, uq.quest_id, uq.progress, uq.is_completed, uq.reward_claimed,
            q.quest_type, q.target, q.xp_reward, q.title, q.description
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.quest_date = CURRENT_DATE`;
const ACTIVE_QUESTS_SQL = "SELECT id FROM quests WHERE is_active = true ORDER BY RANDOM() LIMIT 3";
const INSERT_SQL = `INSERT INTO user_quests (user_id, quest_id, quest_date)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT (user_id, quest_id, quest_date) DO NOTHING`;

test("daily quest service preserves existing-quest early return", async () => {
  const calls = [];
  const existingRows = [{ id: 1, quest_id: 8, progress: 2 }];
  const service = createDailyQuestService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: existingRows };
      },
    },
  });

  const result = await service(44);

  assert.equal(result, existingRows);
  assert.deepEqual(calls, [{ sql: DAILY_QUESTS_SQL, params: [44] }]);
});

test("daily quest service preserves creation SQL order and response", async () => {
  const calls = [];
  const createdRows = [
    { id: 10, quest_id: 2 },
    { id: 11, quest_id: 5 },
    { id: 12, quest_id: 9 },
  ];
  const responses = [
    { rows: [] },
    { rows: [{ id: 2 }, { id: 5 }, { id: 9 }] },
    { rowCount: 1 },
    { rowCount: 1 },
    { rowCount: 1 },
    { rows: createdRows },
  ];
  const service = createDailyQuestService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return responses.shift();
      },
    },
  });

  const result = await service(7);

  assert.equal(result, createdRows);
  assert.deepEqual(calls, [
    { sql: DAILY_QUESTS_SQL, params: [7] },
    { sql: ACTIVE_QUESTS_SQL, params: undefined },
    { sql: INSERT_SQL, params: [7, 2] },
    { sql: INSERT_SQL, params: [7, 5] },
    { sql: INSERT_SQL, params: [7, 9] },
    { sql: DAILY_QUESTS_SQL, params: [7] },
  ]);
});

test("daily quest service preserves empty active-quest behavior", async () => {
  const calls = [];
  const responses = [{ rows: [] }, { rows: [] }, { rows: [] }];
  const service = createDailyQuestService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service(3), []);
  assert.deepEqual(calls, [
    { sql: DAILY_QUESTS_SQL, params: [3] },
    { sql: ACTIVE_QUESTS_SQL, params: undefined },
    { sql: DAILY_QUESTS_SQL, params: [3] },
  ]);
});

test("daily quest service preserves database-error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const service = createDailyQuestService({
    pool: { async query() { throw databaseError; } },
  });

  await assert.rejects(() => service(5), (error) => error === databaseError);
});
