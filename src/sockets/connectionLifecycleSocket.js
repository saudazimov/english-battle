const registerUserPresenceSocket = require("./userPresenceSocket");
const registerDisconnectSocket = require("./disconnectSocket");

const defaultSocketRegistrars = {
  presence: registerUserPresenceSocket,
  disconnect: registerDisconnectSocket,
};

function createConnectionLifecycleSocket({
  socket,
  pool,
  battles,
  userToRoom,
  onlineUsers,
  removeFromQueue,
  notifyFriendsStatus,
  removeFromParty,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  logger = console,
  socketRegistrars = defaultSocketRegistrars,
}) {
  function registerPresenceSocket() {
    socketRegistrars.presence({
      socket, pool, onlineUsers, notifyFriendsStatus, logger,
    });
  }

  function registerDisconnectSocketHandler() {
    socketRegistrars.disconnect({
      socket, battles, userToRoom, onlineUsers, removeFromQueue,
      notifyFriendsStatus, removeFromParty, emitTeamProgress,
      checkTeamFinish, finishBattle, logger,
    });
  }

  return { registerPresenceSocket, registerDisconnectSocketHandler };
}

module.exports = { createConnectionLifecycleSocket };
