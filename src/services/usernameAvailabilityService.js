function createUsernameAvailabilityService({ pool }) {
  return {
    async isAvailable(username) {
      const taken = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username]
      );
      return taken.rows.length === 0;
    },
  };
}

module.exports = { createUsernameAvailabilityService };
