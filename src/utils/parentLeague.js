function parentLeagueName(rating) {
  const value = rating || 0;
  if (value >= 2000) return "Grandmaster";
  if (value >= 1800) return "Master";
  if (value >= 1600) return "Diamond";
  if (value >= 1400) return "Platinum";
  if (value >= 1200) return "Gold";
  if (value >= 1000) return "Silver";
  return "Bronze";
}

module.exports = { parentLeagueName };
