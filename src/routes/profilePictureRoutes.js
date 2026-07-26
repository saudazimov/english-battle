const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../../db");
const { authMiddleware } = require("../../auth");
const { createProfilePictureController } = require("../controllers/profilePictureController");

function createProfilePictureRoutes({
  upload,
  uploadedContentMatches,
  removeUploadedFile,
  uploadsDirectory,
}) {
  const router = express.Router();
  const controller = createProfilePictureController({
    pool,
    uploadedContentMatches,
    removeUploadedFile,
    fileSystem: fs,
    pathModule: path,
    uploadsDirectory,
  });
  router.post(
    "/profile/:userId/picture",
    authMiddleware,
    upload.single("picture"),
    controller.update
  );
  return router;
}

module.exports = createProfilePictureRoutes;
