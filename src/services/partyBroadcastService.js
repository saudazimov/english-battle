function createPartyBroadcastService({ parties, io }) {
  return function broadcastParty(partyId) {
    const party = parties[partyId];
    if (!party) return;

    const payload = {
      partyId,
      teamMode: party.teamMode,
      maxSize: party.maxSize,
      status: party.status,
      leaderId: party.leader,
      members: party.members.map((member) => ({
        userId: member.userId,
        name: member.name,
        isLeader: member.userId === party.leader,
        profile_picture: member.profile_picture || null,
      })),
    };

    party.members.forEach((member) => {
      if (member.socketId) {
        io.to(member.socketId).emit("partyUpdated", payload);
      }
    });
  };
}

module.exports = { createPartyBroadcastService };
