const express = require("express");
const { authMiddleware, requireParent } = require("../../auth");
const {
  createParentChildrenListController,
} = require("../controllers/parentChildrenListController");

function parentChildrenListRoutes({ pool, parentLeagueName, activityLabel }) {
  const router = express.Router();
  const controller = createParentChildrenListController({
    pool,
    parentLeagueName,
    activityLabel,
  });

  router.get(
    "/parent/children",
    authMiddleware,
    requireParent,
    controller.listChildren
  );

  return router;
}

module.exports = parentChildrenListRoutes;
