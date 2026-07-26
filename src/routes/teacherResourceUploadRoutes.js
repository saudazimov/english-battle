const express = require("express");
const path = require("path");
const pool = require("../../db");
const { authMiddleware, requireTeacher } = require("../../auth");
const {
  createTeacherResourceUploadController,
} = require("../controllers/teacherResourceUploadController");

function createTeacherResourceUploadRoutes({
  uploadResource,
  uploadedContentMatches,
  removeUploadedFile,
  sanitizeText,
  detectFileType,
  logAudit,
}) {
  const router = express.Router();
  const controller = createTeacherResourceUploadController({
    pool,
    uploadedContentMatches,
    removeUploadedFile,
    sanitizeText,
    detectFileType,
    pathModule: path,
    logAudit,
  });
  router.post(
    "/teacher/resources",
    authMiddleware,
    requireTeacher,
    uploadResource.single("file"),
    controller.upload
  );
  return router;
}

module.exports = createTeacherResourceUploadRoutes;
