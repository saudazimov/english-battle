const test = require("node:test");
const assert = require("node:assert/strict");

const { createMatchPlayerNotificationService } = require("../src/services/matchPlayerNotificationService");

const PLAYERS_SQL = "SELECT user_id FROM tournament_match_players WHERE match_id = $1 AND user_id IS NOT NULL";

test("match-player notification preserves query and online socket events", async () => {
  const queryCalls = [];
  const socketCalls = [];
  const payload = { matchId: 17, score_a: 3, score_b: 2 };
  const onlineUsers = { "44": "socket-44" };
  const service = createMatchPlayerNotificationService({
    pool: {
      async query(sql, params) {
        queryCalls.push({ sql, params });
        return { rows: [{ user_id: 44 }, { user_id: "55" }] };
      },
    },
    io: {
      to(socketId) {
        return {
          emit(event, emittedPayload) {
            socketCalls.push({ socketId, event, payload: emittedPayload });
          },
        };
      },
    },
    onlineUsers,
    logger: { error() { throw new Error("must not log"); } },
  });

  const result = await service(17, "scoreUpdate", payload);

  assert.equal(result, undefined);
  assert.deepEqual(queryCalls, [{ sql: PLAYERS_SQL, params: [17] }]);
  assert.deepEqual(socketCalls, [{
    socketId: "socket-44",
    event: "scoreUpdate",
    payload,
  }]);
  assert.equal(socketCalls[0].payload, payload);
});

test("match-player notification observes later online-user mutations", async () => {
  const socketCalls = [];
  const onlineUsers = {};
  const service = createMatchPlayerNotificationService({
    pool: { async query() { return { rows: [{ user_id: 7 }] }; } },
    io: {
      to(socketId) {
        return {
          emit(event, payload) { socketCalls.push({ socketId, event, payload }); },
        };
      },
    },
    onlineUsers,
    logger: { error() { throw new Error("must not log"); } },
  });
  onlineUsers["7"] = "socket-7";

  await service("match-1", "matchLiveStart", { matchId: "match-1" });

  assert.deepEqual(socketCalls, [{
    socketId: "socket-7",
    event: "matchLiveStart",
    payload: { matchId: "match-1" },
  }]);
});

test("match-player notification preserves safe database-error logging", async () => {
  const logs = [];
  const service = createMatchPlayerNotificationService({
    pool: { async query() { throw new Error("database unavailable"); } },
    io: { to() { throw new Error("must not emit"); } },
    onlineUsers: {},
    logger: { error(...args) { logs.push(args); } },
  });

  const result = await service(3, "matchFinished", {});

  assert.equal(result, undefined);
  assert.deepEqual(logs, [["notifyMatchPlayers xatosi:", "database unavailable"]]);
});
