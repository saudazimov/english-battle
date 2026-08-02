function boundedString(value, maxLength, fallback) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    ? value
    : fallback;
}

function createMatchmakingPlayerProfileService({ pool, stripUnsafe }) {
  async function loadPlayerProfile(userId) {
    const result = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, profile_picture
       FROM users
       WHERE id = $1 AND is_banned = false`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) throw new Error("Matchmaking user not found");

    const fullName = [user.first_name, user.last_name]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join(" ");
    const rating = Number(user.rating);

    return {
      userId: user.id,
      name: stripUnsafe(fullName, 60) || "O'yinchi",
      level: boundedString(user.cefr_level, 16, "A1"),
      rating: Number.isFinite(rating) && rating > 0 ? rating : 1000,
      profile_picture: boundedString(user.profile_picture, 2048, null),
    };
  }

  return { loadPlayerProfile };
}

module.exports = createMatchmakingPlayerProfileService;
