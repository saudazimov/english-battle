const { createOtpSendService } = require("../services/otpSendService");

function createOtpSendController({ pool, bcrypt, generateOtpCode, sendSms }) {
  const service = createOtpSendService({
    pool,
    bcrypt,
    generateOtpCode,
    sendSms,
    logger: console,
  });

  async function sendOtp(req, res) {
    try {
      const { phone } = req.body;
      if (!phone || phone.trim().length < 9) {
        return res.status(400).json({ error: "To'g'ri telefon raqamini kiriting" });
      }

      const outcome = await service.sendOtp(phone);
      if (outcome.status === "already-registered") {
        return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
      }
      if (outcome.status === "sms-failed") {
        return res.status(502).json({ error: "SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring." });
      }
      return res.json({ message: "Tasdiqlash kodi yuborildi" });
    } catch (err) {
      console.error("OTP yuborish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { sendOtp };
}

module.exports = { createOtpSendController };
