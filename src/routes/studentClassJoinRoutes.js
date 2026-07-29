const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentClassJoinController,
} = require("../controllers/studentClassJoinController");

function studentClassJoinRoutes({ pool, premium, logAudit, io }) {
  const router = express.Router();
  const controller = createStudentClassJoinController({ pool, premium, logAudit, io });

  router.post("/student/join-class", authMiddleware, requireStudent, controller.joinClass);

  return router;
}

module.exports = studentClassJoinRoutes;
