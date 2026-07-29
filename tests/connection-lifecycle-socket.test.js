const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createConnectionLifecycleSocket,
} = require("../src/sockets/connectionLifecycleSocket");

test("connection lifecycle preserves phased order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, pool: {}, battles: {}, userToRoom: {}, onlineUsers: {},
    removeFromQueue: () => {}, notifyFriendsStatus: () => {},
    removeFromParty: () => {}, emitTeamProgress: () => {},
    checkTeamFinish: () => {}, finishBattle: () => {}, logger: {},
  };
  const socketRegistrars = {
    presence(value) { calls.push(["presence", value]); },
    disconnect(value) { calls.push(["disconnect", value]); },
  };
  const lifecycle = createConnectionLifecycleSocket({
    ...dependencies,
    socketRegistrars,
  });

  lifecycle.registerPresenceSocket();
  calls.push(["battleRegistrars"]);
  lifecycle.registerDisconnectSocketHandler();

  assert.deepEqual(calls, [
    ["presence", {
      socket: dependencies.socket,
      pool: dependencies.pool,
      onlineUsers: dependencies.onlineUsers,
      notifyFriendsStatus: dependencies.notifyFriendsStatus,
      logger: dependencies.logger,
    }],
    ["battleRegistrars"],
    ["disconnect", {
      socket: dependencies.socket,
      battles: dependencies.battles,
      userToRoom: dependencies.userToRoom,
      onlineUsers: dependencies.onlineUsers,
      removeFromQueue: dependencies.removeFromQueue,
      notifyFriendsStatus: dependencies.notifyFriendsStatus,
      removeFromParty: dependencies.removeFromParty,
      emitTeamProgress: dependencies.emitTeamProgress,
      checkTeamFinish: dependencies.checkTeamFinish,
      finishBattle: dependencies.finishBattle,
      logger: dependencies.logger,
    }],
  ]);
});
