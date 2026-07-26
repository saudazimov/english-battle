function createPartyBattleStartService({
  pendingPartyMatches,
  parties,
  userParty,
  addTeamEntry,
  logger = console,
}) {
  return function startPartyBattle(partyId) {
    const pending = pendingPartyMatches[partyId];
    if (!pending) return;
    delete pendingPartyMatches[partyId];

    const teamMode = pending.teamMode;
    const teamSize = pending.teamSize;
    let arrivedPlayers = Object.keys(pending.arrived).map(
      (userId) => pending.arrived[userId]
    );
    if (arrivedPlayers.length === 0) return;

    if (arrivedPlayers.length > teamSize) {
      arrivedPlayers = arrivedPlayers.slice(0, teamSize);
    }

    if (parties[partyId]) {
      parties[partyId].members.forEach((member) => {
        delete userParty[member.userId];
      });
      delete parties[partyId];
    }

    const entry = {
      id: `party_${partyId}`,
      type: "party",
      size: arrivedPlayers.length,
      players: arrivedPlayers,
      partyId,
    };
    logger.log(`Party poolga qo'shildi [${teamMode}]: party=${partyId} (${arrivedPlayers.length} a'zo)`);
    addTeamEntry(teamMode, entry);
  };
}

module.exports = { createPartyBattleStartService };
