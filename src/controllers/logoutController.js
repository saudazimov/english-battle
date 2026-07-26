function createLogoutController({ pool, logger = console }) {
  async function logout(req, res) {
    try {
      await pool.query(
        "UPDATE users SET auth_version = auth_version + 1 WHERE id = $1",
        [req.user.id]
      );
      return res.json({ message: "Hisobdan chiqildi" });
    } catch (error) {
      logger.error("Logout xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { logout };
}

module.exports = { createLogoutController };
