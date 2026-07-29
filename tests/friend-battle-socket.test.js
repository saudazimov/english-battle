const test = require("node:test");
const assert = require("node:assert/strict");

const { createFriendBattleSocket } = require("../src/sockets/friendBattleSocket");

test("friend battle socket preserves phased order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, io: {}, pool: {}, onlineUsers: {}, stripUnsafe: () => {},
    getOpponentCardInfo: () => {}, pendingBattles: {}, startBattle: () => {},
    logger: {},
  };
  const socketRegistrars = {
    challenge(value) { calls.push(["challenge", value]); },
    join(value) { calls.push(["join", value]); },
  };
  const friendBattleSocket = createFriendBattleSocket({
    ...dependencies,
    socketRegistrars,
  });

  friendBattleSocket.registerChallengeSocket();
  calls.push(["connectionLog"]);
  friendBattleSocket.registerBattleJoinSocket();

  assert.deepEqual(calls, [
    ["challenge", {
      socket: dependencies.socket,
      io: dependencies.io,
      pool: dependencies.pool,
      onlineUsers: dependencies.onlineUsers,
      stripUnsafe: dependencies.stripUnsafe,
      getOpponentCardInfo: dependencies.getOpponentCardInfo,
      pendingBattles: dependencies.pendingBattles,
      logger: dependencies.logger,
    }],
    ["connectionLog"],
    ["join", {
      socket: dependencies.socket,
      pendingBattles: dependencies.pendingBattles,
      startBattle: dependencies.startBattle,
    }],
  ]);
});
