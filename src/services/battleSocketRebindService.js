// ============ RECONNECT YORDAMCHILARI (Option B) ============
// Reconnect: eski socket.id yozuvini yangi socket.id'ga ko'chirish
// (battle.players strukturasi o'zgarmaydi — faqat bitta yozuv yangi kalitga o'tadi)
function createBattleSocketRebindService({ battles, findPlayerKeyByUser }) {
  return function rebindPlayerSocket(roomId, userId, newSocketId) {
    const battle = battles[roomId];
    if (!battle) return false;
    const oldKey = findPlayerKeyByUser(battle, userId);
    if (!oldKey) return false;
    if (oldKey !== newSocketId) {
      battle.players[newSocketId] = battle.players[oldKey];
      delete battle.players[oldKey];
      // JAMOA JANG: teams arraylaridagi eski socket ID'ni yangisiga almashtiramiz
      if (battle.isTeam && battle.teams) {
        ["A", "B"].forEach(function (team) {
          if (!battle.teams[team]) return;
          var index = battle.teams[team].indexOf(oldKey);
          if (index !== -1) battle.teams[team][index] = newSocketId;
        });
      }
    }
    // socketId maydonini ham yangilaymiz (agar ishlatilsa)
    battle.players[newSocketId].socketId = newSocketId;
    return true;
  };
}

module.exports = { createBattleSocketRebindService };
