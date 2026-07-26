function createPartyMemberRemovalService({ parties, userParty, broadcastParty }) {
  return function removeFromParty(userId) {
    const partyId = userParty[userId];
    if (!partyId) return;

    const party = parties[partyId];
    if (!party) {
      delete userParty[userId];
      return;
    }

    party.members = party.members.filter((member) => member.userId !== userId);
    delete userParty[userId];

    if (party.members.length === 0) {
      delete parties[partyId];
      return;
    }

    if (party.leader === userId) {
      party.leader = party.members[0].userId;
    }
    broadcastParty(partyId);
  };
}

module.exports = { createPartyMemberRemovalService };
