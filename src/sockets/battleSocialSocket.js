const registerBattleChatSocket = require("./battleChatSocket");
const registerRematchSocket = require("./rematchSocket");

const defaultSocketRegistrars = {
  chat: registerBattleChatSocket,
  rematch: registerRematchSocket,
};

function registerBattleSocialSocket({
  socket,
  io,
  pool,
  battles,
  onlineUsers,
  stripUnsafe,
  filterProfanity,
  battleLengths,
  pendingRematches,
  pendingBattles,
  getOpponentCardInfo,
  logger = console,
  socketRegistrars = defaultSocketRegistrars,
}) {
  socketRegistrars.chat({
    socket, io, pool, battles, stripUnsafe, filterProfanity, logger,
  });
  socketRegistrars.rematch({
    socket, io, pool, onlineUsers, stripUnsafe, battleLengths,
    pendingRematches, pendingBattles, getOpponentCardInfo, logger,
  });
}

module.exports = registerBattleSocialSocket;
