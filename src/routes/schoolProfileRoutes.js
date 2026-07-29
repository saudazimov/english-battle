const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createSchoolProfileController,
} = require("../controllers/schoolProfileController");

function schoolProfileRoutes({ pool, getSchoolAdmin }) {
  const router = express.Router();
  const controller = createSchoolProfileController({ pool, getSchoolAdmin });

  router.get("/school/profile", authMiddleware, controller.profile);

  return router;
}

module.exports = schoolProfileRoutes;
