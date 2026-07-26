const express = require("express");
const { requireAdmin } = require("../../auth");
const { me } = require("../controllers/adminMeController");

const router = express.Router();
router.get("/admin/me", requireAdmin, me);

module.exports = router;
