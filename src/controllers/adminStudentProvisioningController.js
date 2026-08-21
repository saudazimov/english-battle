const {
  createAdminStudentProvisioningService,
} = require("../services/adminStudentProvisioningService");

function createAdminStudentProvisioningController({ pool, logAudit, logger = console }) {
  const service = createAdminStudentProvisioningService({ pool });

  async function provision(req, res) {
    try {
      const outcome = await service.provision(req.body && req.body.rows);
      if (outcome.status === "empty") return res.status(400).json({ error: "O'quvchilar ro'yxati bo'sh" });
      if (outcome.status === "too-many") return res.status(400).json({ error: "Bir martada maksimal 1000 o'quvchi" });
      if (outcome.status === "invalid") return res.status(400).json({ error: "Ma'lumotlar noto'g'ri", errors: outcome.errors });
      await logAudit(req, "student_accounts_created", {
        entityType: "user",
        details: `${outcome.credentials.length} ta o'quvchi akkaunti yaratildi`,
      });
      return res.status(201).json({ created: outcome.credentials.length, credentials: outcome.credentials });
    } catch (error) {
      logger.error("O'quvchi akkauntlarini yaratish xatosi:", error.message);
      return res.status(500).json({ error: "O'quvchi akkauntlarini yaratib bo'lmadi" });
    }
  }

  async function resetPassword(req, res) {
    try {
      const studentId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ error: "O'quvchi ID noto'g'ri" });
      const outcome = await service.resetPassword(studentId);
      if (outcome.status === "not-found") return res.status(404).json({ error: "O'quvchi topilmadi" });
      await logAudit(req, "student_password_regenerated", {
        entityType: "user",
        entityId: studentId,
        details: "O'quvchi paroli qayta generatsiya qilindi",
      });
      return res.json({ student: outcome.student, password: outcome.password });
    } catch (error) {
      logger.error("O'quvchi parolini yangilash xatosi:", error.message);
      return res.status(500).json({ error: "Parolni yangilab bo'lmadi" });
    }
  }

  return { provision, resetPassword };
}

module.exports = { createAdminStudentProvisioningController };
