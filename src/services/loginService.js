function createLoginService({ pool, bcrypt, noteFail, noteOk, phoneIpKey, signToken }) {
  function recordFailure(req) {
    noteFail("login", phoneIpKey(req), 8, 15 * 60 * 1000);
  }

  async function login({ req, phone, password }) {
    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );
    if (result.rows.length === 0) {
      recordFailure(req);
      return { status: "invalid-credentials" };
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      recordFailure(req);
      return { status: "invalid-credentials" };
    }
    if (user.is_banned) return { status: "banned" };

    noteOk("login", phoneIpKey(req));
    const token = signToken(user);
    return { status: "authenticated", token, user };
  }

  return { login };
}

module.exports = { createLoginService };
