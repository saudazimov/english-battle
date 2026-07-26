function createAdminQuestionDeleteController({ pool, logAudit, logger = console }) {
  return {
    async remove(req, res) {
      try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: "Savol ID kerak" });

        await pool.query("DELETE FROM questions WHERE id = $1", [id]);
        await logAudit(req, "question_deleted", {
          entityType: "question",
          entityId: id,
        });
        res.json({ message: "Savol o'chirildi!" });
      } catch (error) {
        logger.error("Savol o'chirish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminQuestionDeleteController };
