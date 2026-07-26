const { mmRatingWindow } = require("./matchmakingRatingWindow");

function mmCompatible(a, b) {
  if (a.mode !== b.mode) return false;
  if (a.level !== b.level) return false;
  const window = Math.max(mmRatingWindow(a.joinedAt), mmRatingWindow(b.joinedAt));
  return Math.abs((a.rating || 1000) - (b.rating || 1000)) <= window;
}

module.exports = { mmCompatible };
