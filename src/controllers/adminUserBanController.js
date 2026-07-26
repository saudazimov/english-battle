function createAdminUserBanController({ pool, logAudit, logger = console }) {
  return {
    async update(req, res) {
      try {
        const { id, banned } = req.body;
        if (!id) return res.status(400).json({ error: "id kerak" });

        const result = await pool.query(
          "UPDATE users SET is_banned = $1, auth_version = auth_version + 1 WHERE id = $2 RETURNING first_name, last_name",
          [banned === true, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        const name = result.rows[0].first_name + " " + result.rows[0].last_name;
        await logAudit(req, banned ? "user_banned" : "user_unbanned", {
          entityType: "user",
          entityId: id,
          details: name,
        });
        res.json({
          message: banned ? "Foydalanuvchi bloklandi" : "Blok olib tashlandi",
        });
      } catch (error) {
        logger.error("Ban xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminUserBanController };
