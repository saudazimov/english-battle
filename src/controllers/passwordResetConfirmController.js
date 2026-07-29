const {
  createPasswordResetConfirmService,
} = require("../services/passwordResetConfirmService");

function createPasswordResetConfirmController({ pool, bcrypt, noteFail, noteOk, phoneIpKey }) {
  const service = createPasswordResetConfirmService({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
  });

  async function confirmReset(req, res) {
    try {
      const { phone, code, new_password } = req.body;
      if (!phone || !code || !new_password) {
        return res.status(400).json({ error: "Telefon, kod va yangi parol kiritilishi shart" });
      }
      if (new_password.length < 8 || new_password.length > 128) {
        return res.status(400).json({ error: "Parol 8-128 belgi bo'lishi kerak" });
      }
      if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
        return res.status(400).json({ error: "Parolda kamida 1 harf va 1 raqam bo'lishi kerak" });
      }

      const outcome = await service.confirmReset({ req, phone, code, newPassword: new_password });
      if (outcome.status === "not-requested") {
        return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
      }
      if (outcome.status === "expired") {
        return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
      }
      if (outcome.status === "invalid") {
        return res.status(400).json({ error: "Kod noto'g'ri" });
      }
      if (outcome.status === "user-not-found") {
        return res.status(404).json({ error: "Hisob topilmadi" });
      }
      return res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
    } catch (err) {
      console.error("Parol tiklash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { confirmReset };
}

module.exports = { createPasswordResetConfirmController };
