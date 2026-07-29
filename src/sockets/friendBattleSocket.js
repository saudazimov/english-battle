const registerFriendChallengeSocket = require("./friendChallengeSocket");
const registerFriendBattleJoinSocket = require("./friendBattleJoinSocket");

const defaultSocketRegistrars = {
  challenge: registerFriendChallengeSocket,
  join: registerFriendBattleJoinSocket,
};

function createFriendBattleSocket({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  getOpponentCardInfo,
  pendingBattles,
  startBattle,
  logger = console,
  socketRegistrars = defaultSocketRegistrars,
}) {
  function registerChallengeSocket() {
    socketRegistrars.challenge({
      socket,
      io,
      pool,
      onlineUsers,
      stripUnsafe,
      getOpponentCardInfo,
      pendingBattles,
      logger,
    });
  }

  function registerBattleJoinSocket() {
    socketRegistrars.join({ socket, pendingBattles, startBattle });
  }

  return { registerChallengeSocket, registerBattleJoinSocket };
}

module.exports = { createFriendBattleSocket };
