const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentParentConnectionController,
} = require("../controllers/studentParentConnectionController");

function createStudentParentConnectionRoutes(dependencies) {
  const router = express.Router();
  const controller = createStudentParentConnectionController(dependencies);

  router.get(
    "/student/parent-code",
    authMiddleware,
    requireStudent,
    controller.getCodeStatus
  );
  router.post(
    "/student/parent-code/regenerate",
    authMiddleware,
    requireStudent,
    controller.regenerateCode
  );
  router.get(
    "/student/parents",
    authMiddleware,
    requireStudent,
    controller.listParents
  );
  router.delete(
    "/student/parents/:parentId",
    authMiddleware,
    requireStudent,
    controller.unlinkParent
  );

  return router;
}

module.exports = createStudentParentConnectionRoutes;
