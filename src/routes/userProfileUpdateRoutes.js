const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createUserProfileUpdateController,
} = require("../controllers/userProfileUpdateController");

function createUserProfileUpdateRoutes({ pool }) {
  const router = express.Router();
  const controller = createUserProfileUpdateController({ pool });

  router.put("/profile", authMiddleware, controller.updateProfile);

  return router;
}

module.exports = createUserProfileUpdateRoutes;
