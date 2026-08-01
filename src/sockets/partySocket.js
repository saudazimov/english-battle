const MAX_IDENTIFIER_LENGTH = 256;
const unsafeMapKeys = new Set(["__proto__", "prototype", "constructor"]);

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function isPayload(payload) {
  return payload !== null
    && typeof payload === "object"
    && !Array.isArray(payload);
}

function normalizeIdentifier(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const identifier = String(value);
  if (
    !identifier
    || identifier.length > MAX_IDENTIFIER_LENGTH
    || unsafeMapKeys.has(identifier)
  ) return null;
  return identifier;
}

function getOwnParty(parties, partyId) {
  const normalizedPartyId = normalizeIdentifier(partyId);
  if (!normalizedPartyId || !hasOwn(parties, normalizedPartyId)) return null;
  const party = parties[normalizedPartyId];
  return party && typeof party === "object" && !Array.isArray(party)
    ? { party, partyId: normalizedPartyId }
    : null;
}

function createPartyHandler({
  socket,
  parties,
  userParty,
  removeFromParty,
  broadcastParty,
  stripUnsafe,
  makePartyId,
  logger,
}) {
  return function createParty(payload) {
    if (!isPayload(payload)) return;
    const { name, teamMode, profile_picture } = payload;
    const uid = socket.userId;
    if (!uid) return;

    if (hasOwn(userParty, uid) && userParty[uid]) removeFromParty(uid);
    const mode = teamMode === "squad" ? "squad" : "duo";
    const maxSize = mode === "squad" ? 4 : 2;
    const partyId = normalizeIdentifier(makePartyId());
    if (!partyId) {
      socket.emit("partyError", { message: "Party yaratib bo'lmadi" });
      return;
    }
    parties[partyId] = {
      leader: uid,
      teamMode: mode,
      maxSize,
      status: "forming",
      invited: {},
      members: [{
        userId: uid,
        name: stripUnsafe(name, 60) || "O'yinchi",
        socketId: socket.id,
        isLeader: true,
        profile_picture: typeof profile_picture === "string"
          ? profile_picture
          : null,
      }],
    };
    userParty[uid] = partyId;
    socket.emit("partyCreated", { partyId });
    broadcastParty(partyId);
    logger.log("Party yaratildi [" + mode + "]: " + partyId + " lider:" + uid);
  };
}

function createInviteToPartyHandler({
  socket,
  io,
  parties,
  onlineUsers,
  stripUnsafe,
  logger,
}) {
  return function inviteToParty(payload) {
    if (!isPayload(payload)) return;
    const partyEntry = getOwnParty(parties, payload.partyId);
    if (!partyEntry) {
      socket.emit("partyError", { message: "Party topilmadi" });
      return;
    }
    const { party, partyId } = partyEntry;
    const fromName = stripUnsafe(
      typeof payload.fromName === "string" ? payload.fromName : "",
      60
    ) || "O'yinchi";
    if (String(party.leader) !== String(socket.userId)) {
      socket.emit("partyError", { message: "Faqat lider taklif yubora oladi" });
      return;
    }
    if (!Array.isArray(party.members) || party.members.length >= party.maxSize) {
      socket.emit("partyError", { message: "Party to'la" });
      return;
    }

    const targetUserId = normalizeIdentifier(payload.toUserId);
    const targetSocket = targetUserId && hasOwn(onlineUsers, targetUserId)
      ? onlineUsers[targetUserId]
      : null;
    if (typeof targetSocket !== "string" || !targetSocket) {
      socket.emit("partyError", { message: "Do'stingiz hozir onlayn emas" });
      return;
    }
    if (party.members.find(function (member) {
      return member && String(member.userId) === targetUserId;
    })) {
      socket.emit("partyError", {
        message: "Bu o'yinchi allaqachon partyda",
      });
      return;
    }

    if (
      !party.invited
      || typeof party.invited !== "object"
      || Array.isArray(party.invited)
    ) party.invited = {};
    party.invited[targetUserId] = true;
    io.to(targetSocket).emit("partyInviteReceived", {
      partyId,
      fromName: fromName || "O'yinchi",
      teamMode: party.teamMode,
    });
    socket.emit("partyInviteSent", { toUserId: targetUserId });
    logger.log("Party taklif: " + partyId + " -> " + payload.toUserId);
  };
}

function createAcceptPartyInviteHandler({
  socket,
  parties,
  userParty,
  removeFromParty,
  broadcastParty,
  stripUnsafe,
  logger,
}) {
  return function acceptPartyInvite(payload) {
    if (!isPayload(payload)) return;
    const partyEntry = getOwnParty(parties, payload.partyId);
    if (!partyEntry) {
      socket.emit("partyError", { message: "Party endi mavjud emas" });
      return;
    }
    const { party, partyId } = partyEntry;
    const uid = normalizeIdentifier(socket.userId);
    if (!uid || !hasOwn(party.invited, uid) || !party.invited[uid]) {
      socket.emit("partyError", { message: "Party taklifi topilmadi" });
      return;
    }
    if (!Array.isArray(party.members) || party.members.length >= party.maxSize) {
      socket.emit("partyError", { message: "Party to'lib qoldi" });
      return;
    }

    if (
      hasOwn(userParty, uid)
      && userParty[uid]
      && userParty[uid] !== partyId
    ) removeFromParty(uid);
    if (!party.members.find(function (member) {
      return member && String(member.userId) === uid;
    })) {
      party.members.push({
        userId: uid,
        name: stripUnsafe(
          typeof payload.name === "string" ? payload.name : "",
          60
        ) || "O'yinchi",
        socketId: socket.id,
        isLeader: false,
        profile_picture: typeof payload.profile_picture === "string"
          ? payload.profile_picture
          : null,
      });
      userParty[uid] = partyId;
    }
    delete party.invited[uid];
    broadcastParty(partyId);
    logger.log("Party qo'shildi: " + uid + " -> " + partyId);
  };
}

function createDeclinePartyInviteHandler({
  socket,
  io,
  parties,
  onlineUsers,
  stripUnsafe,
}) {
  return function declinePartyInvite(payload) {
    if (!isPayload(payload)) return;
    const partyEntry = getOwnParty(parties, payload.partyId);
    const uid = normalizeIdentifier(socket.userId);
    if (!partyEntry || !uid) return;
    const { party } = partyEntry;
    if (!hasOwn(party.invited, uid) || !party.invited[uid]) return;

    const leaderId = normalizeIdentifier(party.leader);
    const leaderSocket = leaderId && hasOwn(onlineUsers, leaderId)
      ? onlineUsers[leaderId]
      : null;
    delete party.invited[uid];
    if (typeof leaderSocket === "string" && leaderSocket) {
      io.to(leaderSocket).emit("partyInviteDeclined", {
        byName: stripUnsafe(
          typeof payload.name === "string" ? payload.name : "",
          60
        ) || "Do'stingiz",
      });
    }
  };
}

function createLeavePartyHandler({ socket, removeFromParty }) {
  return function leaveParty() {
    const userId = normalizeIdentifier(socket.userId);
    if (!userId) return;
    removeFromParty(userId);
    socket.emit("partyLeft", {});
  };
}

function createStartPartyQueueHandler({
  socket,
  io,
  parties,
  pendingPartyMatches,
  logger,
}) {
  return function startPartyQueue(payload) {
    if (!isPayload(payload)) return;
    const uid = socket.userId;
    const partyEntry = getOwnParty(parties, payload.partyId);
    if (!partyEntry) {
      socket.emit("partyError", { message: "Party topilmadi" });
      return;
    }
    const { party, partyId } = partyEntry;
    if (String(party.leader) !== String(uid)) {
      socket.emit("partyError", { message: "Faqat lider boshlay oladi" });
      return;
    }
    if (!Array.isArray(party.members) || party.members.length < 2) {
      socket.emit("partyError", { message: "Kamida 2 o'yinchi kerak" });
      return;
    }
    const expected = party.members.map(function (member) {
      return member ? normalizeIdentifier(member.userId) : null;
    });
    if (expected.some(function (memberId) { return !memberId; })) {
      socket.emit("partyError", { message: "Kamida 2 o'yinchi kerak" });
      return;
    }

    party.status = "in_battle";
    pendingPartyMatches[partyId] = {
      teamMode: party.teamMode,
      teamSize: party.maxSize,
      expected,
      arrived: {},
      timer: null,
    };
    party.members.forEach(function (member) {
      if (typeof member.socketId === "string" && member.socketId) {
        io.to(member.socketId).emit("partyMatchStarting", {
          teamMode: party.teamMode,
          partyId,
        });
      }
    });
    logger.log(
      "Party queue boshlandi: " + partyId + " ("
      + party.members.length + " a'zo)"
    );
  };
}

function createJoinPartyMatchHandler({
  socket,
  io,
  pendingPartyMatches,
  stripUnsafe,
  startPartyBattle,
  setTimer,
  clearTimer,
  logger,
}) {
  return function joinPartyMatch(payload) {
    if (!isPayload(payload)) return;
    const partyId = normalizeIdentifier(payload.partyId);
    const pending = partyId && hasOwn(pendingPartyMatches, partyId)
      ? pendingPartyMatches[partyId]
      : null;
    if (!pending || typeof pending !== "object" || Array.isArray(pending)) {
      io.to(socket.id).emit("partyMatchExpired", {});
      return;
    }
    const uid = normalizeIdentifier(socket.userId);
    if (!uid || !Array.isArray(pending.expected) || !pending.expected.includes(uid)) {
      socket.emit("partyError", { message: "Siz bu party a'zosi emassiz" });
      return;
    }
    if (
      !pending.arrived
      || typeof pending.arrived !== "object"
      || Array.isArray(pending.arrived)
    ) {
      pending.arrived = {};
    }
    pending.arrived[uid] = {
      socketId: socket.id,
      userId: socket.userId,
      name: stripUnsafe(
        typeof payload.name === "string" ? payload.name : "",
        60
      ) || "O'yinchi",
      level: typeof payload.level === "string" && payload.level
        ? payload.level
        : "A1",
      rating: 1000,
      lengthKey: typeof payload.lengthKey === "string" && payload.lengthKey
        ? payload.lengthKey
        : "standard",
      profile_picture: typeof payload.profile_picture === "string"
        ? payload.profile_picture
        : null,
    };
    logger.log(
      "Party a'zosi yetib keldi: " + uid + " -> " + partyId + " ("
      + Object.keys(pending.arrived).length + "/"
      + pending.expected.length + ")"
    );

    const allArrived = pending.expected.every(function (expectedId) {
      return hasOwn(pending.arrived, expectedId) && pending.arrived[expectedId];
    });
    if (allArrived) {
      if (pending.timer) clearTimer(pending.timer);
      startPartyBattle(partyId);
    } else if (!pending.timer) {
      pending.timer = setTimer(function () {
        startPartyBattle(partyId);
      }, 12000);
    }
  };
}

function registerPartySocket({
  socket,
  io,
  parties,
  userParty,
  onlineUsers,
  pendingPartyMatches,
  removeFromParty,
  broadcastParty,
  startPartyBattle,
  stripUnsafe,
  makePartyId,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  logger = console,
}) {
  socket.on("createParty", createPartyHandler({
    socket, parties, userParty, removeFromParty, broadcastParty,
    stripUnsafe, makePartyId, logger,
  }));
  socket.on("inviteToParty", createInviteToPartyHandler({
    socket, io, parties, onlineUsers, stripUnsafe, logger,
  }));
  socket.on("acceptPartyInvite", createAcceptPartyInviteHandler({
    socket, parties, userParty, removeFromParty, broadcastParty,
    stripUnsafe, logger,
  }));
  socket.on("declinePartyInvite", createDeclinePartyInviteHandler({
    socket, io, parties, onlineUsers, stripUnsafe,
  }));
  socket.on("leaveParty", createLeavePartyHandler({ socket, removeFromParty }));
  socket.on("startPartyQueue", createStartPartyQueueHandler({
    socket, io, parties, pendingPartyMatches, logger,
  }));
  socket.on("joinPartyMatch", createJoinPartyMatchHandler({
    socket, io, pendingPartyMatches, stripUnsafe, startPartyBattle,
    setTimer, clearTimer, logger,
  }));
}

module.exports = registerPartySocket;
