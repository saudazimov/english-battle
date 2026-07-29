const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const {
  createParentChildDetailController,
} = require("../controllers/parentChildDetailController");

function parentChildDetailRoutes({ pool, parentLeagueName, activityLabel }) {
  const router = express.Router();
  const controller = createParentChildDetailController({
    pool,
    parentLeagueName,
    activityLabel,
  });

  router.get(
    "/parent/children/:studentId",
    authMiddleware,
    requireParent,
    controller.getChildDetail
  );

  return router;
}

module.exports = parentChildDetailRoutes;
