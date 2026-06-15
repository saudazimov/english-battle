// Liga tizimi - reytingga qarab liga hisoblash

const LEAGUES = [
  { name: "Bronze", min: 0,    max: 999,  emoji: "🥉", color: "#cd7f32", gradient: "linear-gradient(135deg, #cd7f32, #8b5a2b)" },
  { name: "Silver", min: 1000, max: 1199, emoji: "🥈", color: "#c0c0c0", gradient: "linear-gradient(135deg, #e2e8f0, #94a3b8)" },
  { name: "Gold",   min: 1200, max: 1399, emoji: "🥇", color: "#fbbf24", gradient: "linear-gradient(135deg, #fbbf24, #d97706)" },
  { name: "Platinum", min: 1400, max: 1599, emoji: "💎", color: "#67e8f9", gradient: "linear-gradient(135deg, #a5f3fc, #06b6d4)" },
  { name: "Diamond", min: 1600, max: 1799, emoji: "💠", color: "#60a5fa", gradient: "linear-gradient(135deg, #93c5fd, #2563eb)" },
  { name: "Master", min: 1800, max: 1999, emoji: "🔱", color: "#c084fc", gradient: "linear-gradient(135deg, #d8b4fe, #9333ea)" },
  { name: "Grandmaster", min: 2000, max: Infinity, emoji: "👑", color: "#f87171", gradient: "linear-gradient(135deg, #fbbf24, #ef4444)" },
];

// Reytingdan liga topish
function getLeague(rating) {
  for (const league of LEAGUES) {
    if (rating >= league.min && rating <= league.max) {
      return league;
    }
  }
  return LEAGUES[0]; // standart Bronze
}

// Keyingi ligaga qancha qolganini hisoblash
function getLeagueProgress(rating) {
  const current = getLeague(rating);
  const currentIndex = LEAGUES.indexOf(current);

  // Grandmaster - eng yuqori, progress yo'q
  if (currentIndex === LEAGUES.length - 1) {
    return { current: current, next: null, percent: 100, pointsToNext: 0 };
  }

  const next = LEAGUES[currentIndex + 1];
  const range = current.max - current.min + 1;
  const progress = rating - current.min;
  const percent = Math.round((progress / range) * 100);
  const pointsToNext = next.min - rating;

  return { current: current, next: next, percent: percent, pointsToNext: pointsToNext };
}
// Liga nomidan liga obyektini topish
function getLeagueByName(name) {
  return LEAGUES.find(l => l.name === name) || LEAGUES[0];
}