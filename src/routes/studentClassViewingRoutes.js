const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentClassViewingController,
} = require("../controllers/studentClassViewingController");

function createStudentClassViewingRoutes({ pool, activeClassMembership }) {
  const controller = createStudentClassViewingController({
    pool,
    activeClassMembership,
  });
  const listRouter = express.Router();
  const rankingRouter = express.Router();

  listRouter.get("/student/classes", authMiddleware, requireStudent, controller.list);
  rankingRouter.get(
    "/student/classes/:classId/ranking",
    authMiddleware,
    requireStudent,
    controller.ranking
  );

  return { listRouter, rankingRouter };
}

module.exports = { createStudentClassViewingRoutes };
