// Rating oynasi kutish vaqtiga qarab kengayadi.
function mmRatingWindow(joinedAt) {
  const waited = Date.now() - joinedAt;
  if (waited >= 45000) return 200;
  if (waited >= 20000) return 150;
  return 100;
}

module.exports = { mmRatingWindow };
