const MAX_ROOM_ID_LENGTH = 256;
const unsafeMapKeys = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeUserId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const candidate = String(value);
  if (!/^[1-9]\d*$/.test(candidate)) return null;

  const userId = Number(candidate);
  return Number.isSafeInteger(userId) ? String(userId) : null;
}

function validPlayer(player) {
  return isRecord(player)
    && normalizeUserId(player.userId)
    && typeof player.name === "string"
    && typeof player.level === "string";
}

function playerReady(player) {
  return hasOwn(player, "ready")
    && player.ready === true
    && typeof player.socketId === "string"
    && player.socketId.length > 0
    && player.socketId.length <= MAX_ROOM_ID_LENGTH;
}

function createJoinFriendBattleHandler({ socket, pendingBattles, startBattle }) {
  return function joinFriendBattle(payload) {
    const roomId = payload && typeof payload === "object"
      ? payload.roomId
      : null;
    if (
      typeof roomId !== "string"
      || roomId.length === 0
      || roomId.length > MAX_ROOM_ID_LENGTH
      || unsafeMapKeys.has(roomId)
      || !hasOwn(pendingBattles, roomId)
    ) return;
    const pending = pendingBattles[roomId];
    const userId = normalizeUserId(socket.userId);
    if (
      !isRecord(pending)
      || !validPlayer(pending.player1)
      || !validPlayer(pending.player2)
      || !userId
    ) return;

    const player1UserId = normalizeUserId(pending.player1.userId);
    const player2UserId = normalizeUserId(pending.player2.userId);
    const isExpectedPlayer = player1UserId === userId
      || player2UserId === userId;
    if (!isExpectedPlayer) {
      socket.emit("battleError", { message: "Bu jangga kirishga ruxsat yo'q" });
      return;
    }
    socket.join(roomId);

    if (player1UserId === userId) {
      pending.player1.ready = true;
      pending.player1.socketId = socket.id;
    } else if (player2UserId === userId) {
      pending.player2.ready = true;
      pending.player2.socketId = socket.id;
    }

    if (playerReady(pending.player1) && playerReady(pending.player2)) {
      const lengthKey = (typeof pending.lengthKey === "string"
        && pending.lengthKey)
        || (typeof pending.player1.lengthKey === "string"
          && pending.player1.lengthKey)
        || "standard";
      const player1 = {
        socketId: pending.player1.socketId,
        userId: pending.player1.userId,
        name: pending.player1.name,
        level: pending.player1.level,
        lengthKey,
      };
      const player2 = {
        socketId: pending.player2.socketId,
        userId: pending.player2.userId,
        name: pending.player2.name,
        level: pending.player2.level,
        lengthKey,
      };
      delete pendingBattles[roomId];
      startBattle(roomId, player1, player2);
    }
  };
}

function registerFriendBattleJoinSocket({ socket, pendingBattles, startBattle }) {
  socket.on("joinFriendBattle", createJoinFriendBattleHandler({
    socket,
    pendingBattles,
    startBattle,
  }));
}

module.exports = registerFriendBattleJoinSocket;
