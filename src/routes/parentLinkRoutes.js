const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const { createParentLinkController } = require("../controllers/parentLinkController");

function parentLinkRoutes(dependencies) {
  const router = express.Router();
  const controller = createParentLinkController(dependencies);

  router.post("/parent/link", authMiddleware, requireParent, controller.link);

  return router;
}

module.exports = parentLinkRoutes;
