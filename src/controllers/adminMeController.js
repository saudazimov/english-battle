function me(req, res) {
  return res.json({ admin: req.admin });
}

module.exports = { me };
