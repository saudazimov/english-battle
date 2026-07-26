const { normalizePhone } = require("../utils/phoneNormalization");

function requireNormalizedPhone(req, res, next) {
  const phone = normalizePhone(req.body && req.body.phone);
  if (!phone) {
    return res.status(400).json({ error: "Telefon raqamini xalqaro formatda kiriting" });
  }
  req.body.phone = phone;
  next();
}

module.exports = { requireNormalizedPhone };
