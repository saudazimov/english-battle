const express = require("express");
const { authMiddleware } = require("../../auth");
const {
  createUserPublicProfileController,
} = require("../controllers/userPublicProfileController");

function userPublicProfileRoutes({ pool }) {
  const router = express.Router();
  const controller = createUserPublicProfileController({ pool });

  router.get("/profile/:userId", authMiddleware, controller.getProfile);

  return router;
}

module.exports = userPublicProfileRoutes;
