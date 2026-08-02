const createMatchmakingPlayerProfileService = require(
  "../services/matchmakingPlayerProfileService"
);

function createFindMatchHandler({
  socket,
  waitingQueue,
  removeFromQueue,
  tryQueueMatch,
  loadPlayerProfile,
  getRandomBotName,
  startBotBattle,
  setTimer,
  now,
  logger,
}) {
  return async function findMatch(playerData) {
    logger.log("Jang qidirilyapti:", socket.id);
    const existingSearch = waitingQueue.find(
      (entry) => String(entry.userId) === String(socket.userId)
    );
    const isResuming = Boolean(existingSearch && existingSearch.disconnected);
    let playerProfile = existingSearch;
    if (!isResuming) {
      try {
        playerProfile = await loadPlayerProfile(socket.userId);
      } catch (error) {
        logger.error("Solo matchmaking profil xatosi:", error.message);
        socket.emit("battleError", { message: "Raqib qidirishda xato" });
        return;
      }
    }
    if (existingSearch) removeFromQueue(existingSearch.socketId);
    else removeFromQueue(socket.id);
    playerData = playerData || {};
    const currentTime = now();
    const joinedAt = isResuming && Number.isFinite(existingSearch.joinedAt)
      ? existingSearch.joinedAt
      : currentTime;
    const elapsedMs = Math.max(0, currentTime - joinedAt);

    const player = {
      socketId: socket.id,
      userId: playerProfile.userId,
      name: playerProfile.name,
      level: playerProfile.level,
      rating: playerProfile.rating,
      mode: isResuming ? existingSearch.mode : (playerData.mode || "ranked"),
      lengthKey: isResuming ? existingSearch.lengthKey : (playerData.lengthKey || "standard"),
      joinedAt,
      botName: isResuming ? existingSearch.botName : getRandomBotName(),
    };

    waitingQueue.push(player);
    if (tryQueueMatch(player.socketId)) return;

    socket.emit("waiting", { message: "Raqib qidirilmoqda...", elapsedMs });
    socket.emit("matchmaking:searching", {
      message: "Raqib qidirilmoqda...",
      elapsedMs,
    });

    player.expandTimers = [
      setTimer(() => {
        if (waitingQueue.find((entry) => entry.socketId === player.socketId)) {
          socket.emit("matchmaking:expanded", { window: 150 });
          tryQueueMatch(player.socketId);
        }
      }, Math.max(0, 20000 - elapsedMs)),
      setTimer(() => {
        if (waitingQueue.find((entry) => entry.socketId === player.socketId)) {
          socket.emit("matchmaking:expanded", { window: 200 });
          tryQueueMatch(player.socketId);
        }
      }, Math.max(0, 45000 - elapsedMs)),
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
    }, Math.max(0, 20000 - elapsedMs));
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
  pool,
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
  const { loadPlayerProfile } = createMatchmakingPlayerProfileService({
    pool,
    stripUnsafe,
  });
  socket.on("findMatch", createFindMatchHandler({
    socket,
    waitingQueue,
    removeFromQueue,
    tryQueueMatch,
    loadPlayerProfile,
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
