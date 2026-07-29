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
  return function createParty({ userId, name, teamMode, profile_picture }) {
    const uid = socket.userId;
    if (!uid) return;

    if (userParty[uid]) removeFromParty(uid);
    const mode = teamMode === "squad" ? "squad" : "duo";
    const maxSize = mode === "squad" ? 4 : 2;
    const partyId = makePartyId();
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
        profile_picture: profile_picture || null,
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
  return function inviteToParty({ partyId, fromName, toUserId }) {
    fromName = stripUnsafe(fromName, 60) || "O'yinchi";
    const party = parties[partyId];
    if (!party) {
      socket.emit("partyError", { message: "Party topilmadi" });
      return;
    }
    if (String(party.leader) !== String(socket.userId)) {
      socket.emit("partyError", { message: "Faqat lider taklif yubora oladi" });
      return;
    }
    if (party.members.length >= party.maxSize) {
      socket.emit("partyError", { message: "Party to'la" });
      return;
    }

    const targetSocket = onlineUsers[String(toUserId)];
    if (!targetSocket) {
      socket.emit("partyError", { message: "Do'stingiz hozir onlayn emas" });
      return;
    }
    if (party.members.find(function (member) {
      return member.userId === String(toUserId);
    })) {
      socket.emit("partyError", {
        message: "Bu o'yinchi allaqachon partyda",
      });
      return;
    }

    party.invited[String(toUserId)] = true;
    io.to(targetSocket).emit("partyInviteReceived", {
      partyId,
      fromName: fromName || "O'yinchi",
      teamMode: party.teamMode,
    });
    socket.emit("partyInviteSent", { toUserId: String(toUserId) });
    logger.log("Party taklif: " + partyId + " -> " + toUserId);
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
  return function acceptPartyInvite({ partyId, userId, name, profile_picture }) {
    userId = socket.userId;
    const party = parties[partyId];
    if (!party) {
      socket.emit("partyError", { message: "Party endi mavjud emas" });
      return;
    }
    if (!party.invited || !party.invited[String(userId)]) {
      socket.emit("partyError", { message: "Party taklifi topilmadi" });
      return;
    }
    if (party.members.length >= party.maxSize) {
      socket.emit("partyError", { message: "Party to'lib qoldi" });
      return;
    }

    const uid = String(userId);
    if (userParty[uid] && userParty[uid] !== partyId) removeFromParty(uid);
    if (!party.members.find(function (member) { return member.userId === uid; })) {
      party.members.push({
        userId: uid,
        name: stripUnsafe(name, 60) || "O'yinchi",
        socketId: socket.id,
        isLeader: false,
        profile_picture: profile_picture || null,
      });
      userParty[uid] = partyId;
    }
    delete party.invited[uid];
    broadcastParty(partyId);
    logger.log("Party qo'shildi: " + uid + " -> " + partyId);
  };
}

function createDeclinePartyInviteHandler({ socket, io, parties, onlineUsers }) {
  return function declinePartyInvite({ partyId, name }) {
    const party = parties[partyId];
    if (!party) return;
    const leaderSocket = onlineUsers[party.leader];
    if (leaderSocket) {
      io.to(leaderSocket).emit("partyInviteDeclined", {
        byName: name || "Do'stingiz",
      });
    }
  };
}

function createLeavePartyHandler({ socket, removeFromParty }) {
  return function leaveParty({ userId }) {
    userId = socket.userId;
    removeFromParty(String(userId));
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
  return function startPartyQueue({ partyId, userId }) {
    const uid = socket.userId;
    const party = parties[partyId];
    if (!party) {
      socket.emit("partyError", { message: "Party topilmadi" });
      return;
    }
    if (String(party.leader) !== String(uid)) {
      socket.emit("partyError", { message: "Faqat lider boshlay oladi" });
      return;
    }
    if (party.members.length < 2) {
      socket.emit("partyError", { message: "Kamida 2 o'yinchi kerak" });
      return;
    }

    party.status = "in_battle";
    pendingPartyMatches[partyId] = {
      teamMode: party.teamMode,
      teamSize: party.maxSize,
      expected: party.members.map(function (member) {
        return String(member.userId);
      }),
      arrived: {},
      timer: null,
    };
    party.members.forEach(function (member) {
      if (member.socketId) {
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
  return function joinPartyMatch({
    partyId,
    userId,
    name,
    level,
    lengthKey,
    profile_picture,
  }) {
    const pending = pendingPartyMatches[partyId];
    if (!pending) {
      io.to(socket.id).emit("partyMatchExpired", {});
      return;
    }
    const uid = socket.userId;
    if (pending.expected.indexOf(String(uid)) === -1) {
      socket.emit("partyError", { message: "Siz bu party a'zosi emassiz" });
      return;
    }
    pending.arrived[uid] = {
      socketId: socket.id,
      userId: uid,
      name: stripUnsafe(name, 60) || "O'yinchi",
      level: level || "A1",
      rating: 1000,
      lengthKey: lengthKey || "standard",
      profile_picture: profile_picture || null,
    };
    logger.log(
      "Party a'zosi yetib keldi: " + uid + " -> " + partyId + " ("
      + Object.keys(pending.arrived).length + "/"
      + pending.expected.length + ")"
    );

    const allArrived = pending.expected.every(function (expectedId) {
      return pending.arrived[expectedId];
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
    socket, io, parties, onlineUsers,
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
