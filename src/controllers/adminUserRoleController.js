function createAdminUserRoleController({ pool, logAudit, logger = console }) {
  return {
    async update(req, res) {
      try {
        const { id, role } = req.body;
        if (!id || !role) {
          return res.status(400).json({ error: "id va role kerak" });
        }
        const validRoles = ["student", "teacher", "parent", "school_admin"];
        if (validRoles.indexOf(role) === -1) {
          return res.status(400).json({ error: "Noto'g'ri rol" });
        }

        const result = await pool.query(
          "UPDATE users SET role = $1 WHERE id = $2 RETURNING first_name, last_name",
          [role, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        const name = result.rows[0].first_name + " " + result.rows[0].last_name;
        await logAudit(req, "user_role_changed", {
          entityType: "user",
          entityId: id,
          details: name + " → " + role,
        });
        res.json({ message: "Rol o'zgartirildi" });
      } catch (error) {
        logger.error("Rol o'zgartirish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminUserRoleController };
