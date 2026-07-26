// Jangdagi o'yinchini userId bo'yicha topadi; socket.id kalit bo'lib qoladi.
function findPlayerKeyByUser(battle, userId) {
  return Object.keys(battle.players).find(
    (key) => String(battle.players[key].userId) === String(userId)
  ) || null;
}

module.exports = { findPlayerKeyByUser };
