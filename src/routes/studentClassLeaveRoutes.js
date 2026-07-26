const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentClassLeaveController,
} = require("../controllers/studentClassLeaveController");

function createStudentClassLeaveRoutes({ pool, activeClassMembership, io }) {
  const router = express.Router();
  const controller = createStudentClassLeaveController({
    pool,
    activeClassMembership,
    io,
  });
  router.post(
    "/student/classes/:classId/leave",
    authMiddleware,
    requireStudent,
    controller.leave
  );
  return router;
}

module.exports = createStudentClassLeaveRoutes;
