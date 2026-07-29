const { createOtpVerifyService } = require("../services/otpVerifyService");

function createOtpVerifyController({ pool, bcrypt, noteFail, noteOk, phoneIpKey }) {
  const service = createOtpVerifyService({ pool, bcrypt, noteFail, noteOk, phoneIpKey });

  async function verifyOtp(req, res) {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ error: "Telefon va kod kiritilishi shart" });
      }

      const outcome = await service.verifyOtp({ req, phone, code });
      if (outcome.status === "not-requested") {
        return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
      }
      if (outcome.status === "expired") {
        return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
      }
      if (outcome.status === "invalid") {
        return res.status(400).json({ error: "Kod noto'g'ri" });
      }
      return res.json({ verified: true, message: "Telefon tasdiqlandi" });
    } catch (err) {
      console.error("OTP tekshirish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { verifyOtp };
}

module.exports = { createOtpVerifyController };
