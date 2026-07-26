function currentSeason() {
  const date = new Date();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return date.getFullYear() + "-S" + quarter;
}

module.exports = { currentSeason };
