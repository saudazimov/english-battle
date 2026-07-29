const {
  createPasswordResetSendService,
} = require("../services/passwordResetSendService");

function createPasswordResetSendController({ pool, bcrypt, generateOtpCode, sendSms }) {
  const service = createPasswordResetSendService({
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
    logger: console,
  });

  async function sendResetOtp(req, res) {
    try {
      const { phone } = req.body;
      if (!phone || phone.trim().length < 9) {
        return res.status(400).json({ error: "To'g'ri telefon raqamini kiriting" });
      }

      const outcome = await service.sendResetOtp(phone);
      if (outcome.status === "user-not-found") {
        return res.json({ message: "Agar hisob mavjud bo'lsa, tasdiqlash kodi yuborildi" });
      }
      if (outcome.status === "sms-failed") {
        return res.status(502).json({
          error: "SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.",
        });
      }

      return res.json({ message: "Tasdiqlash kodi yuborildi" });
    } catch (err) {
      console.error("Parol tiklash OTP xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { sendResetOtp };
}

module.exports = { createPasswordResetSendController };
