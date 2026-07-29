const { createRegisterService } = require("../services/registerService");

function createRegisterController(dependencies) {
  const { signToken } = dependencies;
  const service = createRegisterService(dependencies);

  async function register(req, res) {
    try {
      const result = await service.register({ req, body: req.body });
      if (result.statusCode !== 201) {
        return res.status(result.statusCode).json(result.body);
      }

      const token = signToken(result.user);
      return res.status(201).json({
        message: "Ro'yxatdan o'tish muvaffaqiyatli!",
        token,
        user: result.user,
      });
    } catch (err) {
      console.error("Register xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { register };
}

module.exports = { createRegisterController };
