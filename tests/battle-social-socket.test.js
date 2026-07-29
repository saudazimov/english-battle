const test = require("node:test");
const assert = require("node:assert/strict");

const registerBattleSocialSocket = require("../src/sockets/battleSocialSocket");

test("battle social socket preserves registration order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, io: {}, pool: {}, battles: {}, onlineUsers: {},
    stripUnsafe: () => {}, filterProfanity: () => {}, battleLengths: {},
    pendingRematches: new Map(), pendingBattles: {},
    getOpponentCardInfo: () => {}, logger: {},
  };
  const socketRegistrars = {
    chat(value) { calls.push(["chat", value]); },
    rematch(value) { calls.push(["rematch", value]); },
  };

  registerBattleSocialSocket({ ...dependencies, socketRegistrars });

  assert.deepEqual(calls, [
    ["chat", {
      socket: dependencies.socket,
      io: dependencies.io,
      pool: dependencies.pool,
      battles: dependencies.battles,
      stripUnsafe: dependencies.stripUnsafe,
      filterProfanity: dependencies.filterProfanity,
      logger: dependencies.logger,
    }],
    ["rematch", {
      socket: dependencies.socket,
      io: dependencies.io,
      pool: dependencies.pool,
      onlineUsers: dependencies.onlineUsers,
      stripUnsafe: dependencies.stripUnsafe,
      battleLengths: dependencies.battleLengths,
      pendingRematches: dependencies.pendingRematches,
      pendingBattles: dependencies.pendingBattles,
      getOpponentCardInfo: dependencies.getOpponentCardInfo,
      logger: dependencies.logger,
    }],
  ]);
});
