function createFindMatchHandler({
  socket,
  waitingQueue,
  removeFromQueue,
  tryQueueMatch,
  stripUnsafe,
  getRandomBotName,
  startBotBattle,
  setTimer,
  now,
  logger,
}) {
  return async function findMatch(playerData) {
    logger.log("Jang qidirilyapti:", socket.id);
    removeFromQueue(socket.id);
    playerData = playerData || {};

    const player = {
      socketId: socket.id,
      userId: socket.userId,
      name: stripUnsafe(playerData.name, 60) || "O'yinchi",
      level: playerData.level || "A1",
      rating: playerData.rating || 1000,
      mode: playerData.mode || "ranked",
      lengthKey: playerData.lengthKey || "standard",
      joinedAt: now(),
      botName: getRandomBotName(),
    };

    waitingQueue.push(player);
    if (tryQueueMatch(player.socketId)) return;

    socket.emit("waiting", { message: "Raqib qidirilmoqda..." });
    socket.emit("matchmaking:searching", {
      message: "Raqib qidirilmoqda...",
    });

    player.expandTimers = [
      setTimer(() => {
        if (waitingQueue.find((entry) => entry.socketId === player.socketId)) {
          socket.emit("matchmaking:expanded", { window: 150 });
          tryQueueMatch(player.socketId);
        }
      }, 20000),
      setTimer(() => {
        if (waitingQueue.find((entry) => entry.socketId === player.socketId)) {
          socket.emit("matchmaking:expanded", { window: 200 });
          tryQueueMatch(player.socketId);
        }
      }, 45000),
    ];

    player.botTimer = setTimer(() => {
      const stillWaiting = removeFromQueue(player.socketId);
      if (!stillWaiting) return;
      const roomId = "battle_bot_" + player.socketId;
      socket.join(roomId);
      const botFound = {
        roomId,
        opponent: {
          name: player.botName,
          isBot: true,
          rating: null,
          win_rate: null,
          level: player.level,
        },
        message: "Mashqlovchi raqib topildi",
      };
      socket.emit("matchFound", botFound);
      socket.emit("matchmaking:found", botFound);
      setTimer(() => startBotBattle(roomId, player), 6000);
    }, 20000);
  };
}

function createCancelMatchHandler({ socket, removeFromQueue }) {
  return function cancelMatch() {
    removeFromQueue(socket.id);
    socket.emit("matchmaking:cancelled", {});
  };
}

function registerSoloMatchmakingSocket({
  socket,
  waitingQueue,
  removeFromQueue,
  tryQueueMatch,
  stripUnsafe,
  getRandomBotName,
  startBotBattle,
  setTimer = setTimeout,
  now = Date.now,
  logger = console,
}) {
  socket.on("findMatch", createFindMatchHandler({
    socket,
    waitingQueue,
    removeFromQueue,
    tryQueueMatch,
    stripUnsafe,
    getRandomBotName,
    startBotBattle,
    setTimer,
    now,
    logger,
  }));
  socket.on("cancelMatch", createCancelMatchHandler({
    socket,
    removeFromQueue,
  }));
}

module.exports = registerSoloMatchmakingSocket;
