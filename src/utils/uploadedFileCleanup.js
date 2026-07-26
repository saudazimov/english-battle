const fs = require("fs");

function createUploadedFileCleanup({ fileSystem = fs } = {}) {
  return function removeUploadedFile(file) {
    if (!file || !file.path) return;
    try {
      if (fileSystem.existsSync(file.path)) fileSystem.unlinkSync(file.path);
    } catch (_) {}
  };
}

const removeUploadedFile = createUploadedFileCleanup();

module.exports = { createUploadedFileCleanup, removeUploadedFile };
