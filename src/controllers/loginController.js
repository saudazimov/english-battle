const { createLoginService } = require("../services/loginService");

function createLoginController({ pool, bcrypt, noteFail, noteOk, phoneIpKey, signToken }) {
  const service = createLoginService({
    pool,
    bcrypt,
    noteFail,
    noteOk,
    phoneIpKey,
    signToken,
  });

  async function login(req, res) {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ error: "Telefon va parolni kiriting" });
      }

      const outcome = await service.login({ req, phone, password });
      if (outcome.status === "invalid-credentials") {
        return res.status(400).json({ error: "Telefon yoki parol noto'g'ri" });
      }
      if (outcome.status === "banned") {
        return res.status(403).json({ error: "Hisobingiz bloklangan. Administrator bilan bog'laning." });
      }

      const user = outcome.user;
      return res.json({
        message: "Tizimga muvaffaqiyatli kirdingiz!",
        token: outcome.token,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          phone: user.phone,
          cefr_level: user.cefr_level,
          xp: user.xp,
          rating: user.rating,
          coins: user.coins,
          profile_picture: user.profile_picture,
          role: user.role,
        },
      });
    } catch (err) {
      console.error("Login xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { login };
}

module.exports = { createLoginController };
