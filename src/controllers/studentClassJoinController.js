const {
  createStudentClassJoinService,
} = require("../services/studentClassJoinService");

function createStudentClassJoinController({ pool, premium, logAudit, io }) {
  const service = createStudentClassJoinService({ pool, premium, logAudit, io });

  async function joinClass(req, res) {
    try {
      const studentId = req.user.id;
      let { join_code } = req.body;
      if (!join_code || typeof join_code !== "string") {
        return res.status(400).json({ error: "Qo'shilish kodini kiriting" });
      }
      join_code = join_code.trim().toUpperCase();
      if (join_code.length !== 6) {
        return res.status(400).json({ error: "Kod 6 belgidan iborat bo'lishi kerak" });
      }

      const outcome = await service.joinClass({ req, studentId, joinCode: join_code });
      if (outcome.status === "class-not-found") {
        return res.status(404).json({ error: "Bunday kodli sinf topilmadi" });
      }
      if (outcome.status === "class-inactive") {
        return res.status(400).json({ error: "Bu sinf endi faol emas" });
      }
      if (outcome.status === "already-member") {
        return res.status(409).json({ error: "Siz allaqachon bu sinf a'zosisiz" });
      }
      if (outcome.status === "teacher-limit") {
        return res.status(402).json({
          error: "teacher_pro_required",
          feature: "more_students",
          message: "Bu sinfga qo'shilib bo'lmaydi — o'qituvchining bepul limiti to'lgan (15 o'quvchi).",
          upgrade_url: "/pricing.html?plan=teacher_pro",
        });
      }
      if (outcome.status === "rejoined") {
        return res.json({
          message: "Sinfga qayta qo'shildingiz",
          class: { id: outcome.class.id, name: outcome.class.name },
        });
      }
      return res.status(201).json({
        message: "Sinfga muvaffaqiyatli qo'shildingiz",
        class: { id: outcome.class.id, name: outcome.class.name },
      });
    } catch (err) {
      console.error("Sinfga qo'shilish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { joinClass };
}

module.exports = { createStudentClassJoinController };
