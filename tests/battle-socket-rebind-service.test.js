const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleSocketRebindService } = require("../src/services/battleSocketRebindService");

test("battle socket rebind preserves missing-room early return", () => {
  let lookupCalls = 0;
  const rebindPlayerSocket = createBattleSocketRebindService({
    battles: {},
    findPlayerKeyByUser() { lookupCalls += 1; },
  });

  assert.equal(rebindPlayerSocket("missing", 7, "new-socket"), false);
  assert.equal(lookupCalls, 0);
});

test("battle socket rebind preserves missing-player early return", () => {
  const battle = { players: {} };
  const rebindPlayerSocket = createBattleSocketRebindService({
    battles: { room1: battle },
    findPlayerKeyByUser(receivedBattle, userId) {
      assert.equal(receivedBattle, battle);
      assert.equal(userId, 7);
      return null;
    },
  });

  assert.equal(rebindPlayerSocket("room1", 7, "new-socket"), false);
  assert.deepEqual(battle.players, {});
});

test("battle socket rebind preserves non-team player move and identity", () => {
  const player = { userId: 7, socketId: "old-socket", score: 3 };
  const battle = { players: { "old-socket": player }, isTeam: false };
  const rebindPlayerSocket = createBattleSocketRebindService({
    battles: { room1: battle },
    findPlayerKeyByUser() { return "old-socket"; },
  });

  assert.equal(rebindPlayerSocket("room1", 7, "new-socket"), true);
  assert.equal(battle.players["new-socket"], player);
  assert.equal(battle.players["old-socket"], undefined);
  assert.equal(player.socketId, "new-socket");
});

test("battle socket rebind preserves team-array updates", () => {
  const player = { userId: "7", socketId: "old-socket" };
  const battle = {
    players: { "old-socket": player },
    isTeam: true,
    teams: {
      A: ["other-a", "old-socket"],
      B: ["old-socket", "other-b"],
    },
  };
  const rebindPlayerSocket = createBattleSocketRebindService({
    battles: { room1: battle },
    findPlayerKeyByUser() { return "old-socket"; },
  });

  assert.equal(rebindPlayerSocket("room1", "7", "new-socket"), true);
  assert.deepEqual(battle.teams.A, ["other-a", "new-socket"]);
  assert.deepEqual(battle.teams.B, ["new-socket", "other-b"]);
  assert.equal(battle.players["new-socket"], player);
  assert.equal(player.socketId, "new-socket");
});

test("battle socket rebind preserves same-key socketId refresh", () => {
  const player = { userId: 7, socketId: "stale-value" };
  const battle = { players: { "same-socket": player } };
  const rebindPlayerSocket = createBattleSocketRebindService({
    battles: { room1: battle },
    findPlayerKeyByUser() { return "same-socket"; },
  });

  assert.equal(rebindPlayerSocket("room1", 7, "same-socket"), true);
  assert.deepEqual(Object.keys(battle.players), ["same-socket"]);
  assert.equal(player.socketId, "same-socket");
});
