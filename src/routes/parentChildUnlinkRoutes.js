const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const {
  createParentChildUnlinkController,
} = require("../controllers/parentChildUnlinkController");

function parentChildUnlinkRoutes({ pool }) {
  const router = express.Router();
  const controller = createParentChildUnlinkController({ pool });

  router.delete(
    "/parent/children/:studentId",
    authMiddleware,
    requireParent,
    controller.unlinkChild
  );

  return router;
}

module.exports = parentChildUnlinkRoutes;
