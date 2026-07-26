const SERVER_LEAGUES = [
  { name: "Bronze", min: 0, max: 999 },
  { name: "Silver", min: 1000, max: 1199 },
  { name: "Gold", min: 1200, max: 1399 },
  { name: "Platinum", min: 1400, max: 1599 },
  { name: "Diamond", min: 1600, max: 1799 },
  { name: "Master", min: 1800, max: 1999 },
  { name: "Grandmaster", min: 2000, max: Infinity },
];

function getLeagueName(rating) {
  for (const league of SERVER_LEAGUES) {
    if (rating >= league.min && rating <= league.max) return league.name;
  }
  return "Bronze";
}

module.exports = { getLeagueName };
